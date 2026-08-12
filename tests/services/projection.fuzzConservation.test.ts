// tests/services/projection.fuzzConservation.test.ts
//
// [HARDEN-FUZZING] — property-based testing (fast-check) des invariants de conservation du moteur.
//
// Complète les ~25 scénarios FIXES (projection.moneyConservation) par des MILLIERS de combinaisons
// aléatoires BORNÉES (salaires, cash, rendements −40..+60 %, inflation, âges, dettes, années). Sur
// CHAQUE mois de CHAQUE scénario généré, on vérifie l'invariant RIGOUREUX (forme-BILAN) :
//
//     NetWorth == Σ(actifs affichés) − DettesNonImmo            (à EPS près)
//
// C'est la reconstructabilité (INV-9) : le patrimoine net affiché DOIT toujours s'expliquer par les
// actifs et dettes affichés — c'est exactement la classe MONEY-PHANTOM (un chemin qui bouge le NW
// sans bouger un actif/dette affiché, ou l'inverse). On utilise la forme-BILAN, PAS la forme de
// dépistage `épargne+croissance−impôt` (qui FAUX-POSITIVE sur les flux one-time — cf CLAUDE.md).
// En plus par point : NetWorth FINI (lecture stricte, pas de NaN silencé en 0) + aucun actif (hors
// immobilier) négatif (INV-6 : un découvert va en LiquidDebt) + hypothèque non double-comptée
// (`DetteTotale ≥ DettesNonImmo`). FUZZ-ONETIME-FLOWS : le générateur inclut désormais l'ACHAT IMMOBILIER
// (→ hypothèque : exerce la reconstructabilité SOUS prêt, la raison d'être de la forme-bilan ; mesuré
// 257/500 runs sous hypothèque) et la RÉNOVATION majeure (dépense one-time).
// [FUZZ-ONETIME-FLOWS, lot final 2026-08-12] Le générateur couvre désormais AUSSI : la VENTE
// immobilière (lifeEvent `eventKind: 'VENTE_IMMO'` daté APRÈS l'achat — dont la vente d'un bien
// LOCATIF, gain en capital imposable), le REVENU LOCATIF (`rentalIncomeMonthly` sur bien non-RP),
// l'ÉQUITÉ NÉGATIVE (propertyGrowthRate généré jusqu'à −10 %/an + mise faible → immeuble sous
// l'eau), le VÉHICULE cyclique (`vehicleReplacements`, W5), l'HÉRITAGE (lifeEvent HERITAGE) et le
// REEE (childGoal + solde de départ). La couverture est MESURÉE par un test dédié (échantillon
// seedé, planchers assertés) — pas supposée : un flux dont le compte tombe sous le plancher fait
// ÉCHOUER la suite au lieu de disparaître du fuzz en silence.
//
// Seed FIXE → CI DÉTERMINISTE (zéro flake) ; fast-check explore quand même NUM_RUNS scénarios variés
// depuis cette seed et, à l'échec, AFFICHE le contre-exemple minimal + la seed (reproductible).

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionChartPoint } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, Debt, RealEstateGoal, MajorRenovation, LifeEvent, ChildGoal } from '../../types';

// Tolérance : chartData est arrondi au cent (`toFixed(2)`) sur ~9 champs → résiduel d'arrondi cumulé
// ~0,05 $. EPS=1 $ reste BIEN sous une vraie fuite (qui casse de centaines/milliers de $) tout en
// étant insensible à l'arrondi. Aligné sur l'esprit d'INV-1/INV-9 (< 2 $).
const EPS = 1;
// Borné CI (le backlog avertit : 480 mois × N stratégies = coûteux). ~15 s localement à 500 runs
// (~29 ms/run mesuré). Fourchette backlog 300-1000 ; 500 = breadth solide sans alourdir la CI.
const NUM_RUNS = 500;
const SEED = 0x0f1ce; // seed fixe → CI déterministe
// Le timeout vitest par défaut (5 s) est trop court : 500 runs × ~29 ms ≈ 15 s. On le dimensionne
// SUR `NUM_RUNS` (≈ 150 ms/run de marge, plancher 60 s) pour qu'il scale si on monte à 1000 (fourchette
// backlog 300-1000) et absorbe une CI lente — sans brider NUM_RUNS. ⚠️ Un échec « Test timed out »
// n'est PAS une violation de conservation : lire le message. fast-check rend l'échec réel immédiatement
// (pas besoin d'attendre le timeout), donc un timeout généreux ne ralentit pas le diagnostic d'un vrai bug.
const FUZZ_TIMEOUT_MS = Math.max(60_000, NUM_RUNS * 150);

// Lecture STRICTE : un champ non-fini (NaN/undefined) LÈVE au lieu d'être silencé en 0. Volontaire :
// ici toute valeur non-finie EST une violation. Un `num()` permissif masquerait une corruption d'actif
// (`recon` deviendrait NaN, et `NaN > EPS === false` → faux-vert silencieux — finding panel).
const strictNum = (p: ProjectionChartPoint, key: keyof ProjectionChartPoint): number => {
    const raw = p[key];
    // Champ ABSENT (`undefined`) ⇒ 0 : convention du moteur pour un poste non applicable (les champs de
    // ProjectionChartPoint sont optionnels) — PAS une corruption. Seul un NaN/Infinity EXPLICITE lève
    // (sinon un actif corrompu serait silencé en 0 → faux-vert `NaN > EPS === false`).
    if (raw === undefined) return 0;
    const v = Number(raw);
    if (!Number.isFinite(v)) throw new Error(`Champ « ${String(key)} » non-fini (${String(raw)})`);
    return v;
};

// Actifs affichés (Immobilier = équité DÉJÀ nette d'hypothèque). NetWorth = Σ − DettesNonImmo.
const ASSET_KEYS = ['Liquidites', 'CELI', 'CELIAPP', 'REER', 'REEE', 'NonReg', 'Crypto', 'Immobilier'] as const;
// Actifs qui ne peuvent JAMAIS être négatifs (un découvert va en LiquidDebt, pas en actif négatif).
// Immobilier EXCLU : l'équité peut être légitimement négative (immeuble sous l'eau).
const NON_NEGATIVE_ASSETS = ['Liquidites', 'CELI', 'CELIAPP', 'REER', 'REEE', 'NonReg', 'Crypto'] as const;
const strictAssets = (p: ProjectionChartPoint): number =>
    ASSET_KEYS.reduce((s, k) => s + strictNum(p, k), 0);

const makeProjection = (o: Partial<ProjectionConfig> = {}): ProjectionConfig => ({
    years: 12, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3, ...o,
});

// Générateur BORNÉ d'un scénario money-critical. Bornes choisies pour rester dans des états VALIDES
// atteignables en prod (non-immigrants → `canadaArrivalYear = birthYear`, retraite après l'âge courant).
interface Scenario {
    grossMarc: number; grossAnna: number; startCash: number;
    rateCeli: number; rateReer: number; rateNonReg: number; rateCrypto: number; rateCash: number;
    inflation: number; age: number; years: number; efMonths: number; monthlyExpenses: number;
    celiStart: number; reerStart: number; nonRegStart: number; cryptoStart: number;
    debts: Array<{ balance: number; rate: number; minPay: number; category: Debt['category'] }>;
    retireOffset: number;
    // Flux ONE-TIME (FUZZ-ONETIME-FLOWS) — optionnels (null ≈ moitié des runs) :
    //  • achat immobilier → HYPOTHÈQUE (la mise < prix garantit un prêt) : exerce la reconstructabilité
    //    SOUS hypothèque (raison d'être de la forme-bilan ; `Immobilier` = équité nette, jamais re-soustraite).
    //    `rentalIncome` (bien non-RP seulement) et `saleYearOffset` (vente APRÈS l'achat) s'y greffent.
    //  • rénovation majeure → dépense one-time (sortie de liquidités/dette, hors Income/Expenses).
    realEstate: {
        price: number; downPct: number; rate: number; amortYears: number; buyYearOffset: number;
        isPrimary: boolean; rentalIncome: number | null; saleYearOffset: number | null;
    } | null;
    renovation: { cost: number; yearOffset: number } | null;
    /** Croissance immobilière ANNUELLE (%) — NÉGATIVE dans une partie des runs : c'est elle qui rend
     *  l'équité négative ATTEIGNABLE (immeuble sous l'eau : valeur qui fond sous le solde du prêt). */
    propertyGrowth: number;
    vehicle: { cyclYears: number; cost: number } | null;
    heritage: { amount: number; yearOffset: number } | null;
    child: { birthYearOffset: number; reeeStart: number } | null;
}

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
    grossMarc: fc.integer({ min: 0, max: 15000 }),       // salaire MENSUEL (convention canonique)
    grossAnna: fc.integer({ min: 0, max: 15000 }),
    startCash: fc.integer({ min: 0, max: 300000 }),
    rateCeli: fc.integer({ min: -40, max: 40 }),
    rateReer: fc.integer({ min: -40, max: 40 }),
    rateNonReg: fc.integer({ min: -40, max: 40 }),
    rateCrypto: fc.integer({ min: -40, max: 60 }),
    rateCash: fc.integer({ min: -5, max: 10 }),
    inflation: fc.integer({ min: 0, max: 12 }),
    age: fc.integer({ min: 25, max: 68 }),
    years: fc.integer({ min: 5, max: 30 }),
    efMonths: fc.integer({ min: 0, max: 12 }),
    monthlyExpenses: fc.integer({ min: 1000, max: 12000 }),
    celiStart: fc.integer({ min: 0, max: 150000 }),
    reerStart: fc.integer({ min: 0, max: 200000 }),
    nonRegStart: fc.integer({ min: 0, max: 150000 }),
    cryptoStart: fc.integer({ min: 0, max: 80000 }),
    debts: fc.array(fc.record({
        balance: fc.integer({ min: 1000, max: 80000 }),
        rate: fc.integer({ min: 0, max: 25 }),
        minPay: fc.integer({ min: 50, max: 2000 }),
        category: fc.constantFrom<Debt['category']>('CreditCard', 'Car', 'Student', 'Personal', 'Other'),
    }), { maxLength: 2 }),
    retireOffset: fc.integer({ min: 1, max: 35 }),
    // null par défaut (`fc.option`) → ~moitié des runs SANS, ~moitié AVEC le flux one-time.
    realEstate: fc.option(fc.record({
        price: fc.integer({ min: 150000, max: 900000 }),
        downPct: fc.integer({ min: 5, max: 50 }),     // % du prix → mise < prix ⇒ hypothèque garantie
        rate: fc.integer({ min: 2, max: 8 }),         // taux hypothécaire (≥2 → mensualité bien définie)
        amortYears: fc.integer({ min: 15, max: 30 }),
        buyYearOffset: fc.integer({ min: 1, max: 29 }), // clampé à l'horizon dans buildRealEstate
        isPrimary: fc.boolean(),
        // Revenu locatif : n'a de sens que sur un bien NON-RP — appliqué conditionnellement dans
        // buildRealEstate (le générer ici sans condition garde l'arbitrary plat et shrinkable).
        rentalIncome: fc.option(fc.integer({ min: 300, max: 2800 }), { nil: null }),
        // Vente N années APRÈS l'achat (clampée sous l'horizon dans buildLifeEvents).
        saleYearOffset: fc.option(fc.integer({ min: 1, max: 12 }), { nil: null }),
    }), { nil: null }),
    renovation: fc.option(fc.record({
        cost: fc.integer({ min: 5000, max: 150000 }),
        yearOffset: fc.integer({ min: 1, max: 29 }),
    }), { nil: null }),
    // −10..+8 %/an : la moitié basse fait FONDRE la valeur du bien sous le solde du prêt (mise 5-50 %)
    // → équité NÉGATIVE légitime, le cas que le checker EXEMPTE de l'invariant non-négatif.
    propertyGrowth: fc.integer({ min: -10, max: 8 }),
    vehicle: fc.option(fc.record({
        cyclYears: fc.integer({ min: 3, max: 12 }),
        cost: fc.integer({ min: 8000, max: 90000 }),
    }), { nil: null }),
    heritage: fc.option(fc.record({
        amount: fc.integer({ min: 5000, max: 500000 }),
        yearOffset: fc.integer({ min: 1, max: 25 }),
    }), { nil: null }),
    child: fc.option(fc.record({
        birthYearOffset: fc.integer({ min: 0, max: 8 }),
        reeeStart: fc.integer({ min: 0, max: 40000 }),
    }), { nil: null }),
});

// Proxy net/brut UNIQUE (≈ source de vérité du générateur) — évite la divergence buildConfig↔buildParams.
// 0,68 est un ratio grossier ; l'exactitude fiscale n'est pas l'objectif (le moteur recalcule l'impôt
// depuis `baseGrossAnnual`, pas depuis `netSalary`).
const netOf = (gross: number): number => Math.round(gross * 0.68);

const buildConfig = (s: Scenario): BudgetConfig => {
    const birthYear = 2026 - s.age;
    const user = (name: string, gross: number, color: string) => ({
        name, grossSalary: gross, netSalary: netOf(gross), color,
        age: s.age, birthYear, canadaArrivalYear: birthYear,
        hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0,
    });
    return { users: [user('Marc', s.grossMarc, '#10b981'), user('Anna', s.grossAnna, '#3b82f6')], splitMode: '50/50' };
};

const buildRetirement = (s: Scenario): RetirementGoal => ({
    targetAge: Math.min(75, s.age + s.retireOffset), // toujours ≥ âge courant
    targetMonthlyIncome: 4000, governmentPension: 1500, lifeExpectancy: 90,
});

const buildDebts = (s: Scenario): Debt[] => s.debts.map((d, i) => ({
    id: `fd${i}`, name: `Dette ${i}`, balance: d.balance, interestRate: d.rate,
    minimumPayment: d.minPay, category: d.category,
}));

// Mensualité hypothécaire (formule d'amortissement standard) — cohérente avec price/rate/amort,
// pour ne pas injecter un paiement incohérent qui fausserait le moteur.
const mortgagePayment = (principal: number, annualRatePct: number, amortYears: number): number => {
    const r = annualRatePct / 100 / 12;
    const n = amortYears * 12;
    // `rate ≥ 2 %` dans le générateur → r > 0 toujours ; la branche r=0 (M = capital/n) est défensive.
    const m = r === 0 ? principal / n : principal * r / (1 - Math.pow(1 + r, -n));
    return Math.round(m);
};

// Construit 0 ou 1 objectif immobilier valide. La mise (5-50 % du prix) < prix ⇒ hypothèque garantie.
// Date d'achat clampée dans l'horizon (`min(buyYearOffset, years-1)`, ≥1) pour que l'achat ait lieu.
/** Année d'achat effective (partagée entre le bien et le lifeEvent de VENTE — deux copies du clamp
 *  divergeraient en silence et dateraient la vente AVANT l'achat, un no-op invisible). */
const effectiveBuyYear = (s: Scenario): number | null => {
    const re = s.realEstate;
    if (re === null) return null;
    return 2026 + Math.min(re.buyYearOffset, Math.max(1, s.years - 2));
};

const buildRealEstate = (s: Scenario): RealEstateGoal[] => {
    const re = s.realEstate;
    const buyYear = effectiveBuyYear(s);
    if (re === null || buyYear === null) return [];
    const downPayment = Math.round(re.price * (re.downPct / 100));
    const principal = re.price - downPayment;
    // Achat ≥ 2 ans avant la fin de l'horizon (clamp `years-2`) → garantit plusieurs mois SOUS hypothèque
    // dans le chartData, même pour un horizon court (sinon un achat en dernière année n'exerce ~rien).
    return [{
        id: 're0', name: 'Propriété', isActive: true, purchaseDate: `${buyYear}-06-01`,
        price: re.price, downPayment, mortgageRate: re.rate, amortization: re.amortYears,
        totalClosingCosts: Math.round(re.price * 0.015),
        monthlyPayment: mortgagePayment(principal, re.rate, re.amortYears),
        unrecoverableMonthly: Math.round(re.price * 0.005 / 12) + 200, // ~0,5 %/an taxes+assurance + forfait (fuzz, pas fiscal)
        isPrimaryResidence: re.isPrimary,
        // ⚠️ Le taux de croissance se porte sur le BIEN, pas sur la config projection :
        // `ProjectionConfig.propertyGrowthRate` n'est lu NULLE PART par le moteur mensuel — c'est
        // `goal.propertyGrowthRate || 3` (realEstateMonth.ts) qui décide. Le câbler côté config était
        // un no-op silencieux (mesuré : équité négative 0/120) — attrapé par le test de COUVERTURE.
        // NB : `|| 3` → un 0 généré redevient 3 %/an (convention moteur, ticket
        // ENG-PROPGROWTH-ZERO-INEXPRIMABLE) ; les taux NÉGATIFS, eux, passent tels quels.
        propertyGrowthRate: s.propertyGrowth,
        // Revenu LOCATIF : bien non-RP seulement (un loyer sur sa propre résidence n'existe pas).
        ...(re.isPrimary || re.rentalIncome === null ? {} : { rentalIncomeMonthly: re.rentalIncome }),
    }];
};

/** Événements de vie générés : VENTE immobilière (APRÈS l'achat, `eventKind` explicite — jamais la
 *  détection par sous-chaîne) + HÉRITAGE (rentrée non imposable, chemin ENG-HERITAGE-INFLOW). */
const buildLifeEvents = (s: Scenario): LifeEvent[] => {
    const out: LifeEvent[] = [];
    const buyYear = effectiveBuyYear(s);
    if (s.realEstate?.saleYearOffset != null && buyYear !== null) {
        // Vente entre 1 an après l'achat et la DERNIÈRE année de l'horizon (une vente hors horizon
        // serait un no-op silencieux — le compteur de couverture l'attraperait, autant la caler juste).
        const saleYear = Math.min(buyYear + s.realEstate.saleYearOffset, 2026 + s.years - 1);
        if (saleYear > buyYear) {
            out.push({
                id: 'sale0', type: 'GROS_ACHAT', name: 'Cession propriété (fuzz)',
                date: `${saleYear}-09-01`, eventKind: 'VENTE_IMMO', propertyId: 're0',
            });
        }
    }
    if (s.heritage !== null) {
        const year = 2026 + Math.min(s.heritage.yearOffset, Math.max(1, s.years - 1));
        out.push({
            id: 'her0', type: 'HERITAGE', name: 'Héritage (fuzz)',
            date: `${year}-04-15`, impactAmount: s.heritage.amount, eventKind: 'NONE',
        });
    }
    return out;
};

const buildChildren = (s: Scenario): ChildGoal[] => {
    if (s.child === null) return [];
    return [{
        id: 'c0', name: 'Enfant (fuzz)', isActive: true,
        birthDate: `${2026 + s.child.birthYearOffset}-03-01`,
        initialCost: 3000, monthlyDiapers: 80, monthlyFood: 150, monthlyClothing: 60,
        monthlyDaycare: 300, governmentBenefits: 400, parentalLeaveIncomeDrop: 20,
    }];
};

const buildRenovations = (s: Scenario): MajorRenovation[] => {
    const rn = s.renovation;
    if (rn === null) return [];
    const year = 2026 + Math.min(rn.yearOffset, Math.max(1, s.years - 1));
    return [{ id: 'rn0', date: `${year}-09-15`, cost: rn.cost, description: 'Rénovation' }];
};

const buildParams = (s: Scenario): SimulationParams => {
    const netMarc = netOf(s.grossMarc);
    const netAnna = netOf(s.grossAnna);
    return {
        projection: makeProjection({
            years: s.years, inflationRate: s.inflation, emergencyFundMonths: s.efMonths,
            returnRates: { celi: s.rateCeli, reer: s.rateReer, nonReg: s.rateNonReg, crypto: s.rateCrypto, cash: s.rateCash },
        }),
        calculatedStartingCash: s.startCash,
        liveCSVBalances: { CELI: s.celiStart, CELIAPP: 0, REER: s.reerStart, NON_ENREG: s.nonRegStart, CRYPTO: s.cryptoStart, REEE: s.child?.reeeStart ?? 0 },
        realEstateGoals: buildRealEstate(s), debts: buildDebts(s), childGoals: buildChildren(s), travelGoals: [],
        lifeEvents: buildLifeEvents(s),
        vehicleReplacements: s.vehicle === null ? [] : [{ id: 'v0', cyclYears: s.vehicle.cyclYears, costEstimate: s.vehicle.cost }],
        majorRenovations: buildRenovations(s),
        retirementGoal: buildRetirement(s), config: buildConfig(s),
        baseGrossAnnual: (s.grossMarc + s.grossAnna) * 12,
        baseNetAnnual: (netMarc + netAnna) * 12,
        currentRentExpense: 1500, baseMonthlyExpenses: s.monthlyExpenses,
        startYear: 2026, startMonth: 0,
    };
};

// Vérifie les invariants de conservation sur UN point (throw au 1er manquement) :
//   • NetWorth fini · reconstructabilité `NW == Σactifs − DettesNonImmo` (INV-9) · aucun actif (hors
//     immobilier) négatif (INV-6) · hypothèque JAMAIS double-comptée (`DetteTotale ≥ DettesNonImmo`,
//     l'écart = l'hypothèque ≥ 0 — FUZZ-ONETIME-FLOWS). Lecture STRICTE → une valeur non-finie LÈVE.
// NB : pas de vérif ΔNW inter-mois — elle est ALGÉBRIQUEMENT impliquée par la reconstructabilité tenue
// sur chaque mois (différence de deux mois) → redondante.
function checkPointConserves(p: ProjectionChartPoint, i: number): void {
    const nw = strictNum(p, 'NetWorth');
    const dettesNonImmo = strictNum(p, 'DettesNonImmo');
    const recon = strictAssets(p) - dettesNonImmo;
    const resid = Math.abs(nw - recon);
    if (resid > EPS) {
        throw new Error(
            `Reconstructabilité BRISÉE au mois ${i} : |NW(${nw.toFixed(2)}) − (Σactifs−DettesNonImmo)(${recon.toFixed(2)})| ` +
            `= ${resid.toFixed(4)} > ${EPS} $`,
        );
    }
    // Hypothèque non double-comptée : DetteTotale (AVEC hypo) ≥ DettesNonImmo (SANS) → l'écart est
    // l'hypothèque, par définition ≥ 0. Une inversion signalerait une hypothèque mal comptabilisée.
    const detteTotale = strictNum(p, 'DetteTotale');
    if (detteTotale < dettesNonImmo - EPS) {
        throw new Error(`DetteTotale(${detteTotale.toFixed(2)}) < DettesNonImmo(${dettesNonImmo.toFixed(2)}) au mois ${i} — hypothèque mal comptée`);
    }
    for (const k of NON_NEGATIVE_ASSETS) {
        const v = strictNum(p, k);
        if (v < -EPS) throw new Error(`Actif « ${k} » négatif au mois ${i} (${v.toFixed(2)}) — un découvert doit aller en LiquidDebt`);
    }
}

// Vérifie un scénario entier ; throw au premier manquement → fast-check shrink au contre-exemple + seed.
function assertScenarioConserves(s: Scenario): void {
    const cd = calculateFutureProjection(buildParams(s)).chartData;
    if (cd.length === 0) throw new Error('chartData vide pour un scénario valide');
    for (let i = 0; i < cd.length; i++) checkPointConserves(cd[i], i);
}

describe('[HARDEN-FUZZING] conservation du patrimoine sur scénarios aléatoires bornés', () => {
    it(`reconstructabilité (NW = Σactifs − DettesNonImmo) tient sur ${NUM_RUNS} scénarios aléatoires`, () => {
        // fast-check affiche le contre-exemple MINIMAL + la seed à l'échec (reproductible).
        fc.assert(fc.property(scenarioArb, assertScenarioConserves), { numRuns: NUM_RUNS, seed: SEED });
    }, FUZZ_TIMEOUT_MS);

    it('le checker DISCRIMINE : NW fantôme, actif corrompu (NaN) et actif négatif LÈVENT', () => {
        // Passe par le VRAI `checkPointConserves` (pas seulement la formule) → prouve que la fonction
        // utilisée par le fuzz lève bien. Couvre les 3 modes : reconstructabilité, NaN strict, INV-6.
        const good = { Liquidites: 1000, CELI: 0, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0, Immobilier: 0, DettesNonImmo: 0, NetWorth: 1000 } as unknown as ProjectionChartPoint;
        expect(() => checkPointConserves(good, 0)).not.toThrow();
        // +500 fantôme au NW (non adossé à un actif/dette) → reconstructabilité brisée.
        expect(() => checkPointConserves({ ...good, NetWorth: 1500 } as ProjectionChartPoint, 0)).toThrow(/Reconstructabilité BRISÉE/);
        // Actif corrompu NaN → DOIT lever (pas silencé en 0, sinon faux-vert NaN>EPS===false).
        expect(() => checkPointConserves({ ...good, CELI: Number.NaN } as ProjectionChartPoint, 0)).toThrow(/non-fini/);
        // Actif négatif alors que le NW reste reconstructible (CELI −50 compensé par Liquidites +50) :
        // reconstructabilité OK, mais INV-6 l'attrape (un découvert doit aller en LiquidDebt).
        expect(() => checkPointConserves({ ...good, CELI: -50, Liquidites: 1050 } as ProjectionChartPoint, 0)).toThrow(/négatif/);
        // Hypothèque mal comptée (DetteTotale < DettesNonImmo) alors que le NW reste reconstructible :
        // NW=900 = Σactifs(1000) − DettesNonImmo(100) ✓, mais DetteTotale(50) < DettesNonImmo(100) → LÈVE.
        expect(() => checkPointConserves({ ...good, NetWorth: 900, DettesNonImmo: 100, DetteTotale: 50 } as ProjectionChartPoint, 0)).toThrow(/hypothèque mal comptée/);
    });

    it('[FUZZ-ONETIME-FLOWS] COUVERTURE MESURÉE : chaque flux est réellement exercé par le générateur', () => {
        // « Mesurer la couverture, pas la supposer » (ticket). Échantillon SEEDÉ (déterministe en CI)
        // du MÊME arbitrary que le fuzz principal ; pour chaque scénario on lance le moteur et on
        // sonde le chartData — la sonde vérifie l'EFFET (le flux s'est produit), jamais le paramètre
        // (un paramètre généré mais avalé par un clamp compterait pour rien).
        // ⚠️ Un plancher raté = le générateur a dérivé (clamp trop agressif, date hors horizon,
        // champ renommé) : le flux disparaîtrait du fuzz EN SILENCE — c'est exactement la classe
        // que ce test ferme. Planchers = ~50 % des comptes MESURÉS à l'écriture (marge de seed).
        const SAMPLE = 120;
        const samples = fc.sample(scenarioArb, { numRuns: SAMPLE, seed: SEED });
        const counts = { mortgage: 0, sale: 0, rental: 0, negEquity: 0, vehicle: 0, heritage: 0, reee: 0 };
        for (const s of samples) {
            const cd = calculateFutureProjection(buildParams(s)).chartData;
            const events = (p: ProjectionChartPoint): string =>
                [...(p.lifeEvents ?? []), ...(p.flowEvents ?? [])].join(' | ');
            if (cd.some(p => strictNum(p, 'DetteTotale') > strictNum(p, 'DettesNonImmo') + 1000)) counts.mortgage++;
            if (cd.some(p => events(p).includes('🏠 Vente'))) counts.sale++;
            if (cd.some(p => strictNum(p, 'RentalIncome') > 0)) counts.rental++;
            if (cd.some(p => strictNum(p, 'Immobilier') < -EPS)) counts.negEquity++;
            if (cd.some(p => events(p).includes('🚗'))) counts.vehicle++;
            if (cd.some(p => events(p).includes('Héritage (fuzz)'))) counts.heritage++;
            if (cd.some(p => strictNum(p, 'REEE') > 0 || strictNum(p, 'ReeeContrib') > 0)) counts.reee++;
        }
        // Mesuré à l'écriture (seed 0x0f1ce, 120 samples) — voir le commit pour les valeurs exactes.
        expect(counts.mortgage, `hypothèque: ${counts.mortgage}/${SAMPLE}`).toBeGreaterThanOrEqual(25);
        expect(counts.sale, `vente immo: ${counts.sale}/${SAMPLE}`).toBeGreaterThanOrEqual(8);
        expect(counts.rental, `revenu locatif: ${counts.rental}/${SAMPLE}`).toBeGreaterThanOrEqual(5);
        // Équité négative : événement RARE par nature (il faut l'intersection achat réussi × croissance
        // bien négative × mise faible × assez d'années sous l'eau) — mesuré 4/120. Le plancher 2 suit
        // la règle ~50 % ; sur les 500 runs du fuzz principal ça extrapole à ~15 scénarios sous l'eau.
        expect(counts.negEquity, `équité négative: ${counts.negEquity}/${SAMPLE}`).toBeGreaterThanOrEqual(2);
        expect(counts.vehicle, `véhicule: ${counts.vehicle}/${SAMPLE}`).toBeGreaterThanOrEqual(15);
        expect(counts.heritage, `héritage: ${counts.heritage}/${SAMPLE}`).toBeGreaterThanOrEqual(15);
        expect(counts.reee, `REEE: ${counts.reee}/${SAMPLE}`).toBeGreaterThanOrEqual(15);
    }, FUZZ_TIMEOUT_MS);

    it('[FUZZ-ONETIME-FLOWS] un achat immo SOUS hypothèque est exercé ET reste reconstructible', () => {
        // Scénario déterministe FORÇANT l'achat (cash suffisant) → garantit qu'au moins un run exerce
        // l'hypothèque (le fuzz aléatoire, lui, en couvre ~la moitié). Prouve que : (1) la reconstructabilité
        // tient SOUS hypothèque sur tous les mois — raison d'être de la forme-bilan ; (2) le discriminant
        // `DetteTotale > DettesNonImmo` est réellement déclenché (sinon le nouvel invariant serait vert à vide).
        const s: Scenario = {
            grossMarc: 9000, grossAnna: 7000, startCash: 200000,
            rateCeli: 6, rateReer: 6, rateNonReg: 6, rateCrypto: 8, rateCash: 2,
            inflation: 2, age: 32, years: 20, efMonths: 3, monthlyExpenses: 5000,
            celiStart: 0, reerStart: 0, nonRegStart: 0, cryptoStart: 0, debts: [], retireOffset: 30,
            realEstate: { price: 500000, downPct: 20, rate: 5, amortYears: 25, buyYearOffset: 3, isPrimary: true, rentalIncome: null, saleYearOffset: null },
            renovation: { cost: 40000, yearOffset: 8 },
            propertyGrowth: 3, vehicle: null, heritage: null, child: null,
        };
        const cd = calculateFutureProjection(buildParams(s)).chartData;
        for (let i = 0; i < cd.length; i++) checkPointConserves(cd[i], i); // reconstructible sur TOUS les mois, sous hypo
        // DetteTotale n'est JAMAIS `undefined` (sinon `strictNum`→0 le silenceraient et rendrait
        // l'invariant `DetteTotale ≥ DettesNonImmo` vide quand DettesNonImmo=0 — finding panel F1).
        // NB : un éventuel NaN est déjà attrapé par `strictNum` dans la boucle ci-dessus ; ici on ne
        // ferme que le trou de l'ABSENCE de champ.
        expect(cd.every(p => (p as Record<string, unknown>).DetteTotale !== undefined)).toBe(true);
        const underMortgage = cd.some(p => strictNum(p, 'DetteTotale') > strictNum(p, 'DettesNonImmo') + 1000);
        expect(underMortgage, "aucun mois sous hypothèque — le flux immobilier ne s'est pas exercé").toBe(true);
    });
});
