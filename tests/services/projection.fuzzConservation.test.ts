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
// immobilier) négatif (INV-6 : un découvert va en LiquidDebt). Limite assumée : le générateur n'inclut
// PAS encore les flux one-time (achat immo/hypothèque, réno, véhicule, héritage) NI les soldes REEE
// initiaux / childGoals (REEE reste 0) → suivi BACKLOG FUZZ-ONETIME-FLOWS (la reconstructabilité SOUS
// hypothèque reste couverte par les tests INV-9 fixes).
//
// Seed FIXE → CI DÉTERMINISTE (zéro flake) ; fast-check explore quand même NUM_RUNS scénarios variés
// depuis cette seed et, à l'échec, AFFICHE le contre-exemple minimal + la seed (reproductible).

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionChartPoint } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, Debt } from '../../types';

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

const buildParams = (s: Scenario): SimulationParams => {
    const netMarc = netOf(s.grossMarc);
    const netAnna = netOf(s.grossAnna);
    return {
        projection: makeProjection({
            years: s.years, inflationRate: s.inflation, emergencyFundMonths: s.efMonths,
            returnRates: { celi: s.rateCeli, reer: s.rateReer, nonReg: s.rateNonReg, crypto: s.rateCrypto, cash: s.rateCash },
        }),
        calculatedStartingCash: s.startCash,
        liveCSVBalances: { CELI: s.celiStart, CELIAPP: 0, REER: s.reerStart, NON_ENREG: s.nonRegStart, CRYPTO: s.cryptoStart, REEE: 0 },
        realEstateGoals: [], debts: buildDebts(s), childGoals: [], travelGoals: [], lifeEvents: [],
        retirementGoal: buildRetirement(s), config: buildConfig(s),
        baseGrossAnnual: (s.grossMarc + s.grossAnna) * 12,
        baseNetAnnual: (netMarc + netAnna) * 12,
        currentRentExpense: 1500, baseMonthlyExpenses: s.monthlyExpenses,
        startYear: 2026, startMonth: 0,
    };
};

// Vérifie les invariants de conservation sur UN point (throw au 1er manquement) :
//   • NetWorth fini · reconstructabilité `NW == Σactifs − DettesNonImmo` (INV-9) · aucun actif (hors
//     immobilier) négatif (INV-6). Lecture STRICTE → une valeur non-finie LÈVE (pas de silence).
// NB : pas de vérif ΔNW inter-mois — elle est ALGÉBRIQUEMENT impliquée par la reconstructabilité tenue
// sur chaque mois (différence de deux mois) → redondante.
function checkPointConserves(p: ProjectionChartPoint, i: number): void {
    const nw = strictNum(p, 'NetWorth');
    const recon = strictAssets(p) - strictNum(p, 'DettesNonImmo');
    const resid = Math.abs(nw - recon);
    if (resid > EPS) {
        throw new Error(
            `Reconstructabilité BRISÉE au mois ${i} : |NW(${nw.toFixed(2)}) − (Σactifs−DettesNonImmo)(${recon.toFixed(2)})| ` +
            `= ${resid.toFixed(4)} > ${EPS} $`,
        );
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
    });
});
