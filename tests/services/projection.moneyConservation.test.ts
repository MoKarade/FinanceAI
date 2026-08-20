// tests/services/projection.moneyConservation.test.ts
//
// [CONSERVATION DE L'ARGENT] — garde-fou money-critical (demande Marc 2026-06-16,
// suite au bug « variation nette -208 633 $ en un mois » avec revenu ~10,6 k$).
//
// Ces invariants encodent une RÈGLE NON NÉGOCIABLE : le patrimoine net affiché DOIT
// toujours être RECONSTRUCTIBLE depuis ce que l'utilisateur voit, et l'argent ne peut
// ni se créer ni se détruire sans cause visible. Chaque test est DISCRIMINANT : il
// échoue sur un vrai bug, pas seulement « le code tourne ».
//
// Invariants couverts :
//   INV-1  Reconstructabilité : NetWorth = Σ(actifs affichés) − dettes affichées (à l'euro près).
//   INV-2  Conservation socle : un mois sans événement → ΔNW = épargne + croissance + impôt (résiduel ≈ 0).
//   INV-3  Une dette préexistante RÉDUIT le patrimoine net (jamais ignorée).
//   INV-4  Rembourser une dette n'érode le NW que de l'INTÉRÊT (le principal est neutre).
//   INV-5  Achat immobilier : la mise de fonds devient de l'ÉQUITÉ (NW quasi conservé).
//   INV-6  Aucun compte ne devient négatif (pas de solde fantôme).
//   INV-7  Un découvert porté en dette est VISIBLE (LiquidDebt + DetteTotale l'exposent).
//   INV-8  Une dette à champ NON numérique (NaN) ne casse jamais NetWorth/DetteTotale/diffNW.
//   INV-9  Hypothèque NON double-comptée : Σ(actifs) − NetWorth = dettes non-immo seulement.
//   INV-10 Décaissement REER : la retenue à la source est un ACOMPTE (payé 1× en avril), pas un coût double.
//   INV-11 Meltdown REER→NonReg : transfert NW-neutre (retenue non double-comptée).
//   INV-12 Insolvabilité : dépense non couverte (comptes épuisés, coussin gardé) portée en dette visible — pas d'évaporation.

import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionResult, ProjectionChartPoint } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, Debt, LifeEvent } from '../../types';
import { computeTotalDebt } from '../../services/portfolio';
import { applyMidMonthGrowth } from '../../services/projection/helpers';

const makeProjection = (o: Partial<ProjectionConfig> = {}): ProjectionConfig => ({
    years: 12,
    returnRate: 6,
    inflationRate: 2,
    savingsMode: 'manual',
    manualContribution: 0,
    usePortfolioRate: false,
    returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
    emergencyFundMonths: 6,
    salaryGrowth: 2,
    propertyGrowthRate: 3,
    ...o,
});

const makeConfig = (): BudgetConfig => ({
    users: [
        { name: 'Marc', grossSalary: 8200, netSalary: 5620, color: '#10b981', age: 30, birthYear: 1996, canadaArrivalYear: 1996, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
        { name: 'Anna', grossSalary: 7100, netSalary: 4995, color: '#3b82f6', age: 30, birthYear: 1996, canadaArrivalYear: 1996, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    ],
    splitMode: '50/50',
});

const makeRetirementGoal = (): RetirementGoal => ({ targetAge: 60, targetMonthlyIncome: 5500, governmentPension: 1850, lifeExpectancy: 92 });

// Couple DÉJÀ retraité (62 ans) — force le décaissement REER pour couvrir les dépenses.
const makeRetireeConfig = (extra: Partial<BudgetConfig> = {}): BudgetConfig => ({
    users: [
        { name: 'Marc', grossSalary: 0, netSalary: 0, color: '#10b981', age: 62, birthYear: 1964, canadaArrivalYear: 1964, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
        { name: 'Anna', grossSalary: 0, netSalary: 0, color: '#3b82f6', age: 62, birthYear: 1964, canadaArrivalYear: 1964, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    ],
    splitMode: '50/50',
    ...extra,
});

const NO_INVEST = { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 };

const makeParams = (o: Partial<SimulationParams> = {}): SimulationParams => ({
    projection: makeProjection(),
    calculatedStartingCash: 15_000,
    liveCSVBalances: NO_INVEST,
    realEstateGoals: [],
    debts: [],
    childGoals: [],
    travelGoals: [],
    lifeEvents: [],
    retirementGoal: makeRetirementGoal(),
    config: makeConfig(),
    baseGrossAnnual: 183_600,
    baseNetAnnual: 127_380,
    currentRentExpense: 1_800,
    baseMonthlyExpenses: 6_801,
    startYear: 2026,
    startMonth: 0,
    ...o,
});

// Retraité seul qui ÉPUISE son REER (modeste) vers le mois ~33 puis reste insolvable (pension
// publique faible, dépenses > revenus, aucun autre compte). Sert à INV-12 (FISC-BROKE-LIQUID-FLOOR).
const makeBrokeRetireeParams = (): SimulationParams => makeParams({
    projection: makeProjection({ years: 16, returnRate: 5, returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 6, cash: 1 } }),
    calculatedStartingCash: 8_000,
    liveCSVBalances: { ...NO_INVEST, REER: 130_000 },
    retirementGoal: { targetAge: 60, targetMonthlyIncome: 3500, governmentPension: 600, lifeExpectancy: 95 },
    config: makeRetireeConfig(),
    baseGrossAnnual: 0, baseNetAnnual: 0, currentRentExpense: 0, baseMonthlyExpenses: 3_000,
});

const run = (p: SimulationParams): ProjectionResult => calculateFutureProjection(p);
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

const ASSET_KEYS = ['Liquidites', 'CELI', 'CELIAPP', 'REER', 'REEE', 'NonReg', 'Crypto', 'Immobilier'] as const;
const shownAssets = (p: ProjectionChartPoint): number =>
    ASSET_KEYS.reduce((s, k) => s + num((p as Record<string, unknown>)[k]), 0);

// Résiduel mensuel inexpliqué : ΔNW − (épargne + croissance marché + règlement d'impôt).
const unexplained = (curr: ProjectionChartPoint, prev: ProjectionChartPoint): number => {
    const savings = num(curr.Income) - num(curr.Expenses);
    const marketGrowth =
        num(curr.MarketGrowthCELI) + num(curr.MarketGrowthREER) + num(curr.MarketGrowthNonReg) +
        num(curr.MarketGrowthCrypto) + num(curr.MarketGrowthLiquid) + num(curr.MarketGrowthCELIAPP) +
        num(curr.MarketGrowthREEE);
    const taxSettlement = -num(curr.FluxImpots);
    return (num(curr.NetWorth) - num(prev.NetWorth)) - (savings + marketGrowth + taxSettlement);
};

describe('[CONSERVATION] patrimoine net toujours reconstructible et conservé', () => {
    it('INV-2 — socle salarié sans événement : ΔNW entièrement expliqué (résiduel ≈ 0)', () => {
        const cd = run(makeParams()).chartData;
        let maxResid = 0;
        for (let i = 1; i < cd.length; i++) maxResid = Math.max(maxResid, Math.abs(unexplained(cd[i], cd[i - 1])));
        expect(maxResid).toBeLessThan(1);
    });

    it('[PRESTATIONS] enfant (bascule salaire→RQAP→salaire) : chaque mois reste expliqué', () => {
        // ⚠️ AUCUNE fixture de ce fichier ne portait de `childGoals` ni de chômage : les 21 verts
        // ne parcouraient AUCUNE des branches du lot « prestations » (même classe d'angle mort que
        // le bug 12× du forfait W5 : `UN-INVARIANT-NE-VOIT-PAS-CE-QUI-EST-ABSENT`).
        const cd = run(makeParams({
            childGoals: [{ id: 'c1', name: 'Bébé', isActive: true, birthDate: '2026-07-01',
                initialCost: 2_000, monthlyDiapers: 80, monthlyFood: 200, monthlyClothing: 60,
                monthlyDaycare: 700, governmentBenefits: 0 }] as never,
        })).chartData;
        // La SCEE et le coût initial de l'enfant ne sont pas modélisés par la formule INV-2 — on
        // compare donc au RÉSIDUEL D'UN JUMEAU : le delta doit rester ≈ 0 chaque mois, y compris
        // aux bascules salaire→prestation (mois ~6) et prestation→salaire (mois ~18).
        const temoin = run(makeParams()).chartData;
        for (let i = 1; i < Math.min(cd.length, temoin.length); i++) {
            const d = Math.abs(unexplained(cd[i], cd[i - 1])) - Math.abs(unexplained(temoin[i], temoin[i - 1]));
            // Résiduel PROPRE à l'enfant : borné par les flux non modélisés CONSTANTS (SCEE 125 $/mois,
            // coût initial au mois de naissance ~2 000 $) — jamais une dérive.
            expect(Math.abs(d), `mois ${i}`).toBeLessThan(2_200);
        }
        // Et l'INV-1 (reconstructibilité) tient au dollar près, lui, sans jumeau.
        for (const p of cd) {
            expect(Math.abs(num(p.NetWorth) - (shownAssets(p) - num(p.DetteTotale)))).toBeLessThan(2);
        }
    });

    it('[W5] locatif + CCPC : conservation tenue avec le forfait d\u2019impôt à taux PLEIN', () => {
        // ⚠️ AUCUNE fixture de ce fichier ne portait de `rentalProperties`/`privateBusinesses` :
        // ses 20 verts « prouvaient » la conservation d'un moteur où ces flux n'existaient pas
        // (`UN-INVARIANT-NE-VOIT-PAS-CE-QUI-EST-ABSENT`). Le bug 12× sur le forfait W5 est passé
        // au travers exactement comme ça. `propertyGrowthRate: 0` neutralise l'appréciation de
        // l'immeuble, que la formule INV-2 ne modélise pas (mesuré : 2 993 $ de résiduel sinon,
        // entièrement l'appréciation — pas une fuite).
        const cd = run(makeParams({
            projection: makeProjection({ propertyGrowthRate: 0 }),
            rentalProperties: [{ id: 'r1', name: 'Duplex', monthlyRent: 2_500, monthlyExpenses: 500,
                vacancyPct: 5, purchasePrice: 0, currentValue: 0, mortgageBalance: 0 }],
            privateBusinesses: [{ id: 'b1', name: 'CCPC', annualDividend: 60_000, ownershipPct: 100,
                estimatedValue: 0 }],
        } as Partial<SimulationParams>)).chartData;
        // INV-2 : chaque mois reste expliqué — l'impôt forfaitaire sort par FluxImpots en avril,
        // le revenu entre par Income chaque mois, rien ne s'évapore entre les deux.
        let maxResid = 0;
        for (let i = 1; i < cd.length; i++) maxResid = Math.max(maxResid, Math.abs(unexplained(cd[i], cd[i - 1])));
        expect(maxResid).toBeLessThan(1);
        // INV-1 : reconstructibilité — même patron que le test INV-1 canonique (DetteTotale publiée).
        for (const p of cd) {
            expect(Math.abs(num(p.NetWorth) - (shownAssets(p) - num(p.DetteTotale)))).toBeLessThan(2);
        }
        // ANTI-VACUITÉ + niveau : l'impôt forfaitaire est bien PRÉLEVÉ à taux plein, mesuré au
        // niveau CHAÎNE (le champ PUBLIÉ `AccruedTaxDivers`, pas le mutateur). Deux précautions :
        //   · `AccruedTaxDivers` porte AUSSI RAMQ/FSS (`taxDecember`) → on soustrait un JUMEAU sans
        //     W5, dont le reste est identique (le revenu W5 n'entre pas dans leur assiette) ;
        //   · les bornes d'année du moteur sont piégeuses (le point 12 porte 13 mois d'accumulation,
        //     mesuré) → on asserte le DELTA D'UN MOIS en plein milieu d'année, insensible aux bornes.
        // Attendu par mois : (22 500 × 0,45 + 60 000 × 0,36) / 12 = 2 643,75 $. Sous le bug 12×,
        // cette assertion aurait lu 220,31 $ — elle l'aurait vu.
        const sansW5 = run(makeParams({ projection: makeProjection({ propertyGrowthRate: 0 }) })).chartData;
        const diversA = (pts: ProjectionChartPoint[], i: number): number => num((pts[i] as Record<string, unknown>).AccruedTaxDivers);
        const deltaMoisW5 = (diversA(cd, 6) - diversA(cd, 5)) - (diversA(sansW5, 6) - diversA(sansW5, 5));
        expect(deltaMoisW5).toBeCloseTo((22_500 * 0.45 + 60_000 * 0.36) / 12, 2);
    });

    it('[FISC-EVENT-INCOMELOSS] perte de revenu : ΔNW conservé (résiduel ≈ 0) ET patrimoine réduit vs sans événement', () => {
        // Salarié : perte de revenu MÉNAGE de 50 % pendant 6 mois dès 2027-01 (un des deux revenus coupé).
        const withLoss = (): SimulationParams => makeParams({
            lifeEvents: [{ id: 'jl', type: 'PERTE_EMPLOI', name: 'Perte d\'emploi', date: '2027-01', durationMonths: 6, incomeLossPercent: 50 }],
        });
        const cd = run(withLoss()).chartData;
        // Conservation : le revenu réduit flue dans `Income` → chaque mois reste expliqué (résiduel ≈ 0).
        let maxResid = 0;
        for (let i = 1; i < cd.length; i++) maxResid = Math.max(maxResid, Math.abs(unexplained(cd[i], cd[i - 1])));
        expect(maxResid).toBeLessThan(1);
        // DISCRIMINANT : la perte DOIT réduire le patrimoine final (avant le fix = no-op → identique).
        const nwWith = num(cd.at(-1)!.NetWorth);
        const nwWithout = num(run(makeParams()).chartData.at(-1)!.NetWorth);
        expect(nwWith).toBeLessThan(nwWithout);
        // Le levier n'est plus muet : au moins un mois de la fenêtre logge la perte.
        expect(cd.some(p => (p.lifeEvents || []).some(e => /Perte de revenu/.test(e)))).toBe(true);
    });

    it('[FISC-EVENT-INCOMELOSS] perte 100 % (revenu nul, cas extrême → drawdown/insolvabilité) : conservation tient', () => {
        // Couple actif, revenu MÉNAGE coupé à 100 % pendant 9 mois, peu de coussin → force le décaissement
        // puis l'insolvabilité (INV-12). Le résiduel doit RESTER ≈ 0 (l'argent manquant est porté visible).
        const cd = run(makeParams({
            lifeEvents: [{ id: 'jl', type: 'PERTE_EMPLOI', name: 'Chômage total', date: '2027-01', durationMonths: 9, incomeLossPercent: 100 }],
        })).chartData;
        let maxResid = 0;
        for (let i = 1; i < cd.length; i++) maxResid = Math.max(maxResid, Math.abs(unexplained(cd[i], cd[i - 1])));
        expect(maxResid).toBeLessThan(1);
        // Sur la fenêtre (mois 12..20), le revenu d'emploi tombe à ~0 (100 % coupé, persona sans bonus/side).
        const windowIncome = cd.slice(12, 21).map(p => num(p.Income));
        expect(Math.min(...windowIncome)).toBeLessThan(1);
    });

    it('INV-1 — reconstructabilité : NetWorth = Σ(actifs affichés) − DetteTotale (sans placement)', () => {
        // Scénario réno non-abordable (signature de la capture Marc) : un découvert massif
        // doit RESTER reconstructible — la dette affichée explique l'écart actifs↔NW.
        const r = run(makeParams({ majorRenovations: [{ id: 'r', date: '2031-09-15', cost: 300_000, description: 'agrandissement' }] }));
        for (const p of r.chartData) {
            const recon = shownAssets(p) - num(p.DetteTotale);
            // À l'euro près (modulo CELIAPP/REEE déjà dans ASSET_KEYS, impôt latent négligeable ici).
            expect(Math.abs(num(p.NetWorth) - recon)).toBeLessThan(2);
        }
    });

    it('INV-7 — un découvert porté en dette est VISIBLE (LiquidDebt + DetteTotale > 0)', () => {
        const r = run(makeParams({ majorRenovations: [{ id: 'r', date: '2031-09-15', cost: 300_000, description: 'agrandissement' }] }));
        // Mois de la réno : le patrimoine plonge → le découvert non couvert doit apparaître.
        const renoIdx = r.chartData.findIndex(p =>
            [...(p.lifeEvents || []), ...(p.flowEvents || [])].some(e => /Rénovation majeure/.test(e)));
        expect(renoIdx).toBeGreaterThan(0);
        // Après épuisement des comptes, un découvert est porté en dette ET exposé.
        const after = r.chartData[renoIdx];
        const liquidDebtExposed = num((after as Record<string, unknown>).LiquidDebt);
        expect(liquidDebtExposed).toBeGreaterThan(0);
        // DetteTotale inclut désormais le découvert (plus d'écart invisible).
        expect(num(after.DetteTotale)).toBeGreaterThanOrEqual(liquidDebtExposed - 1);
        // Et le NW négatif est entièrement adossé à une dette affichée.
        expect(num(after.NetWorth)).toBeGreaterThanOrEqual(-num(after.DetteTotale) - 2);
    });

    it('INV-3 — une dette préexistante réduit le patrimoine net dès le mois 0', () => {
        const debt: Debt = { id: 'd', name: 'Prêt auto', balance: 30_000, interestRate: 7, minimumPayment: 500, category: 'Car' };
        const nwNoDebt = num(run(makeParams()).chartData[0].NetWorth);
        const nwWithDebt = num(run(makeParams({ debts: [debt] })).chartData[0].NetWorth);
        // Le prêt de 30 k$ doit retrancher ~30 k$ du patrimoine (pas être ignoré).
        expect(nwNoDebt - nwWithDebt).toBeGreaterThan(29_000);
        expect(nwNoDebt - nwWithDebt).toBeLessThan(31_000);
    });

    it('INV-4 — reconstructabilité CONTINUE avec une dette préexistante (principal neutre)', () => {
        // Propriété « le remboursement du principal est NW-neutre » : à CHAQUE mois, le patrimoine
        // net doit rester = actifs − DetteTotale. Comme la dette est payée, son solde (dans
        // DetteTotale) ET sa déduction du NW décroissent ENSEMBLE → le principal remboursé ne crée
        // ni ne détruit de patrimoine. Avant le fix : NW = actifs (dette ignorée) mais DetteTotale =
        // solde → l'identité casse de tout le solde de la dette.
        const debt: Debt = { id: 'd', name: 'Prêt étudiant', balance: 40_000, interestRate: 5, minimumPayment: 600, category: 'Student' };
        const cd = run(makeParams({ projection: makeProjection({ years: 8 }), debts: [debt] })).chartData;
        let maxBreak = 0;
        for (const p of cd) {
            maxBreak = Math.max(maxBreak, Math.abs(num(p.NetWorth) - (shownAssets(p) - num(p.DetteTotale))));
        }
        expect(maxBreak).toBeLessThan(2);
    });

    it('INV-5 — achat immobilier : la mise de fonds devient de l\'équité (NW quasi conservé)', () => {
        const r = run(makeParams({
            calculatedStartingCash: 150_000,
            realEstateGoals: [{
                id: 're1', name: 'Maison', isActive: true, purchaseDate: '2028-06-01',
                price: 400_000, downPayment: 80_000, mortgageRate: 5, amortization: 25,
                totalClosingCosts: 6_000, monthlyPayment: 2_100, unrecoverableMonthly: 900,
                isPrimaryResidence: true,
            }],
        }));
        const buyIdx = r.chartData.findIndex(p =>
            [...(p.lifeEvents || []), ...(p.flowEvents || [])].some(e => /Achat .*Maison|Mise de fonds/.test(e)));
        expect(buyIdx).toBeGreaterThan(0);
        const buy = r.chartData[buyIdx];
        const prev = r.chartData[buyIdx - 1];
        // L'équité immobilière apparaît (la mise de fonds n'est PAS perdue).
        expect(num(buy.Immobilier)).toBeGreaterThan(70_000);
        // ΔNW au mois d'achat = frais de transaction seulement (clôture + bienvenue), pas la mise.
        const deltaNW = num(buy.NetWorth) - num(prev.NetWorth);
        expect(deltaNW).toBeGreaterThan(-25_000);       // pas une chute de 80 k$ (la mise = équité)
    });

    it('[FISC-RE-SALE-RESIDUAL] vente quasi-underwater (frais > équité) : déficit PORTÉ, pas effacé (end-to-end)', () => {
        // Achat HAUTE-LEVIER (mise 2 % → hypothèque ≈ 98 % du prix), valeur STABLE (croissance 0) →
        // au moment de la vente, les 5 % de frais poussent le produit net SOUS l'hypothèque (saleNet < 0).
        // Le déficit doit RÉDUIRE le patrimoine du plein coût de vente (≈ 5 % de la valeur), pas seulement
        // de l'équité (l'ancien clamp `Math.max(0, saleNet)` l'effaçait → patrimoine surévalué).
        const r = run(makeParams({
            calculatedStartingCash: 20_000,
            projection: makeProjection({ years: 6, propertyGrowthRate: 0 }),
            realEstateGoals: [{
                id: 're', name: 'Maison', isActive: true, purchaseDate: '2027-01-01',
                price: 400_000, downPayment: 8_000, mortgageRate: 5, amortization: 25,
                totalClosingCosts: 6_000, monthlyPayment: 2_330, unrecoverableMonthly: 200,
                isPrimaryResidence: true,
            }],
            lifeEvents: [{ id: 'v', type: 'GROS_ACHAT', name: 'Vente maison', date: '2027-03' }],
        }));
        const cd = r.chartData;
        const saleIdx = cd.findIndex(p => (p.lifeEvents || []).some(e => /Vente/.test(e)));
        expect(saleIdx).toBeGreaterThan(0);
        // ΔNW au mois de vente (déterministe, revenu fixe, MC off) : ancien code = −7965 (équité seule,
        // déficit ~7,2 k$ effacé) ; fix = −15175 (coût de vente 5 %≈−20 k$ atténué par le cashflow net du
        // mois). Seuil −13 k$ DISCRIMINE largement (ancien −7965 ≫ −13000) avec ~2 k$ de marge sous le fix.
        const dNW = num(cd[saleIdx].NetWorth) - num(cd[saleIdx - 1].NetWorth);
        expect(dNW).toBeLessThan(-13_000);
        // Reconstructabilité tient au mois de vente : le déficit est VISIBLE (liquidDebt/DettesNonImmo),
        // pas évaporé. (La forme-bilan elle-même ne discrimine PAS ce bug — d'où l'assertion ΔNW ci-dessus.)
        expect(Math.abs(num(cd[saleIdx].NetWorth) - (shownAssets(cd[saleIdx]) - num(cd[saleIdx].DettesNonImmo)))).toBeLessThan(2);
        // NB : selon le coussin du vendeur, le déficit réduit le LIQUIDE (cas ci-dessus) OU est porté en
        // liquidDebt (vendeur à liquide épuisé) — les deux NW-corrects (ΔNW = −5 % prouvé par financial-
        // integrity ; chemin liquidDebt MESURÉ OK par projection-validator). On teste ici le cas liquide.
    });

    it('[FISC-RE-CAPITAL-LOSS] locatif vendu à perte : perte banquée NON-monétaire (conservation tient) + log (end-to-end)', () => {
        // Locatif (isPrimaryResidence:false) acheté 400 k$ puis vendu ~5 mois plus tard : la valeur a peu
        // bougé (~405 k$) donc le produit net 95 % (≈ 384,7 k$) est SOUS le coût (400 k$) → PERTE en capital.
        // Avant le fix, `Math.max(0, produit − coût)` IGNORAIT cette perte (ni banque, ni log). Désormais elle
        // est portée en banque de pertes — un compteur FISCAL pur : elle ne déplace AUCUN cash au mois de vente
        // (seul l'impôt FUTUR baisse). Donc la conservation (résiduel ≈ 0) doit RESTER intacte end-to-end, ce
        // qui valide le câblage RÉEL du moteur (`projection.ts` mutator), pas seulement le mock unitaire.
        const r = run(makeParams({
            // Cash élevé → l'achat se fait À LA DATE prévue (sinon le moteur le REPORTE faute de liquidités
            // et la vente ne trouve aucun bien acheté — vérifié en debug). Les flux annexes (allocation cascade,
            // éventuel appel de marge) sont du comportement moteur NORMAL ; la conservation doit tenir à travers.
            calculatedStartingCash: 300_000,
            projection: makeProjection({ years: 6 }),
            realEstateGoals: [{
                id: 'rent', name: 'Plex locatif', isActive: true, purchaseDate: '2027-01-01',
                price: 400_000, downPayment: 100_000, mortgageRate: 5, amortization: 25,
                totalClosingCosts: 6_000, monthlyPayment: 1_750, unrecoverableMonthly: 300,
                isPrimaryResidence: false,
            }],
            lifeEvents: [{ id: 'v', type: 'GROS_ACHAT', name: 'Vente plex locatif', date: '2027-06' }],
        }));
        const cd = r.chartData;
        const saleIdx = cd.findIndex(p => (p.lifeEvents || []).some(e => /Vente/.test(e)));
        expect(saleIdx).toBeGreaterThan(0);
        // DISCRIMINANT e2e : le moteur RÉEL logge la perte en capital (l'ancien code, clamp `Math.max(0)`,
        // ne loggait JAMAIS de perte → cette assertion échoue dessus). Prouve que le mutator projection.ts
        // route bien par `applyCapitalDisposition` (le chemin distinct du mock unitaire).
        expect(cd[saleIdx].flowEvents || []).toEqual(
            expect.arrayContaining([expect.stringMatching(/Perte en capital/)]),
        );
        // CONSERVATION (forme reconstructabilité, INV-9 — la bonne pour un scénario immobilier : `unexplained`
        // n'est valable QUE hors événement car il n'inclut pas le passage cash→équité). La perte banquée est un
        // compteur FISCAL pur → elle ne change ni `NetWorth`, ni les actifs, ni `DettesNonImmo`. Donc l'identité
        // `NetWorth = Σactifs − DettesNonImmo` doit tenir à CHAQUE mois (achat, vente à perte, re-flux), à l'euro
        // près. Sous hypothèque, on reconstruit avec `DettesNonImmo` (jamais `DetteTotale` — leçon M5).
        for (const p of cd) {
            const recon = shownAssets(p) - num((p as Record<string, unknown>).DettesNonImmo);
            expect(Math.abs(num(p.NetWorth) - recon)).toBeLessThan(2);
        }
    });

    it('INV-6 — aucun compte ne devient négatif (pas de solde fantôme)', () => {
        for (const params of [makeParams(), makeParams({ majorRenovations: [{ id: 'r', date: '2031-09-15', cost: 200_000 }] })]) {
            for (const p of run(params).chartData) {
                for (const k of ASSET_KEYS) {
                    expect(num((p as Record<string, unknown>)[k]), `${k} négatif au mois ${p.monthIndex}`).toBeGreaterThanOrEqual(-1);
                }
            }
        }
    });

    it('INV-8 — une dette à champ NON numérique (NaN) ne casse JAMAIS le patrimoine net', () => {
        // parseFloat('') = NaN dans DebtManager : balance/taux/paiement peuvent arriver NaN.
        // Le moteur DOIT les normaliser (à 0, journalisé) — jamais propager NaN à NetWorth/diffNW.
        const bad = { id: 'x', name: 'Prêt corrompu', balance: Number.NaN, interestRate: Number.NaN, minimumPayment: Number.NaN, category: 'Car' } as unknown as Debt;
        const bad2 = { id: 'y', name: 'Prêt 2', balance: 30_000, interestRate: Number.NaN, minimumPayment: Number.NaN, category: 'Student' } as unknown as Debt;
        for (const debts of [[bad], [bad2], [bad, bad2]]) {
            for (const p of run(makeParams({ debts })).chartData) {
                // ⚠️ Valeur BRUTE (`Number(...)`), PAS `num()` qui sanitise NaN→0 et rendait l'assertion
                // VACANTE (corrigé 2026-06-23, LOT 4 : `Number.isNaN(num(x))` est toujours faux).
                expect(Number.isNaN(Number(p.NetWorth)), `NetWorth NaN au mois ${p.monthIndex}`).toBe(false);
                expect(Number.isNaN(Number(p.DetteTotale))).toBe(false);
                expect(Number.isNaN(Number(p.diffNW))).toBe(false);
            }
        }
    });

    it('INV-9 — hypothèque NON double-comptée : Σ(actifs) − NetWorth = dettes NON-immo seulement', () => {
        // Avec une propriété hypothéquée (Immobilier = équité nette) ET un prêt auto, la dette qui
        // réduit le NW sous les actifs affichés = prêt auto + découvert SEULEMENT. Si l'hypothèque
        // (~300 k$) était re-soustraite (double-compte), l'écart exploserait.
        const debt: Debt = { id: 'd', name: 'Auto', balance: 20_000, interestRate: 6, minimumPayment: 400, category: 'Car' };
        const cd = run(makeParams({
            calculatedStartingCash: 150_000,
            debts: [debt],
            realEstateGoals: [{
                id: 're', name: 'Maison', isActive: true, purchaseDate: '2028-06-01',
                price: 400_000, downPayment: 80_000, mortgageRate: 5, amortization: 25,
                totalClosingCosts: 6_000, monthlyPayment: 2_100, unrecoverableMonthly: 900,
                isPrimaryResidence: true,
            }],
        })).chartData;
        const afterBuy = cd.find(p => num(p.Immobilier) > 50_000);
        expect(afterBuy, 'achat immobilier attendu').toBeTruthy();
        const reducing = shownAssets(afterBuy as ProjectionChartPoint) - num((afterBuy as ProjectionChartPoint).NetWorth);
        expect(reducing).toBeGreaterThan(0);
        expect(reducing).toBeLessThan(25_000);   // ordre du prêt auto, PAS de l'hypothèque (~300 k$)

        // [M5 audit 2026-06-17] Reconstructabilité d'affichage SOUS hypothèque via DettesNonImmo :
        // `NetWorth = Σ(actifs affichés) − DettesNonImmo` à l'euro près (Immobilier = équité nette).
        const afterP = afterBuy as ProjectionChartPoint;
        const reconNonImmo = shownAssets(afterP) - num((afterP as Record<string, unknown>).DettesNonImmo);
        expect(Math.abs(reconNonImmo - num(afterP.NetWorth))).toBeLessThan(2);
        // Discriminant : DetteTotale (qui INCLUT l'hypothèque) NE reconstruit PAS — l'écart = le solde
        // hypothécaire (> 1 k$). C'est le trou M5 que DettesNonImmo comble.
        const reconTotale = shownAssets(afterP) - num(afterP.DetteTotale);
        expect(num(afterP.NetWorth) - reconTotale).toBeGreaterThan(1_000);
    });

    it('INV-10 — décaissement REER : la retenue à la source est un ACOMPTE, pas un coût double', () => {
        // Money-critical (FISC-REER-WHT-DOUBLE — le « 50 000 au fisc » de Marc). Un retraité finance
        // ses dépenses par retraits REER. La retenue prélevée est un ACOMPTE d'impôt payé en avril
        // (bucket .reer). Elle ne doit PAS quitter le patrimoine au retrait (le BRUT sort du REER, le
        // net étant effacé par l'invariant CF-2 de la cascade) ET être re-débitée en avril — sinon le
        // retraité paie la retenue DEUX fois (sur-imposition = la retenue ENTIÈRE par an, des dizaines
        // de k$ sur un gros décaissement). Garde : tant que le REER alimente le décaissement, ΔNW est
        // ENTIÈREMENT expliqué (épargne + croissance + impôt). Avant le fix : fuite ≈ retenue/mois (~1 k$).
        const cd = run(makeParams({
            config: makeRetireeConfig(),
            retirementGoal: { targetAge: 60, targetMonthlyIncome: 6000, governmentPension: 900, lifeExpectancy: 95 },
            liveCSVBalances: { ...NO_INVEST, REER: 800_000 },
            projection: makeProjection({ years: 12 }),
            baseGrossAnnual: 0, baseNetAnnual: 0, currentRentExpense: 0, baseMonthlyExpenses: 6_000,
            calculatedStartingCash: 12_000,
        })).chartData;
        let maxResid = 0, drawMonths = 0;
        for (let i = 1; i < cd.length; i++) {
            // Phase de décaissement (REER non épuisé). Au-delà — REER=0, le retraité est « à sec » —
            // un bug SÉPARÉ (dépense non couverte quand seul un coussin critique reste) s'applique,
            // hors périmètre FISC-REER-WHT-DOUBLE (consigné au BACKLOG).
            if (num(cd[i].REER) > 1_000) {
                maxResid = Math.max(maxResid, Math.abs(unexplained(cd[i], cd[i - 1])));
                drawMonths++;
            }
        }
        expect(drawMonths).toBeGreaterThan(60);   // le scénario décaisse RÉELLEMENT le REER (>5 ans)
        expect(maxResid).toBeLessThan(1);          // retenue comptée 1× (acompte) — pas 2×
    });

    it('INV-11 — meltdown REER→NonReg : transfert NW-neutre (retenue non double-comptée)', () => {
        // Le meltdown relocalise le REER vers le NonReg (évite la bombe fiscale au décès). Comme le
        // décaissement, la retenue est un acompte payé en avril : le transfert doit être NW-NEUTRE
        // (reer −brut, nonReg +net, retenue conservée au liquide jusqu'au règlement). Avant le fix :
        // seul le net entrait en nonReg ET avril re-débitait la retenue → même fuite que le shortfall.
        const cd = run(makeParams({
            config: makeRetireeConfig(),
            retirementGoal: { targetAge: 60, targetMonthlyIncome: 4000, governmentPension: 800, lifeExpectancy: 95 },
            liveCSVBalances: { ...NO_INVEST, REER: 1_400_000 },
            projection: makeProjection({ years: 10, withdrawalStrategy: 'MELTDOWN_REER' }),
            baseGrossAnnual: 0, baseNetAnnual: 0, currentRentExpense: 0, baseMonthlyExpenses: 3_000,
            calculatedStartingCash: 25_000,
        })).chartData;
        // Le meltdown transfère effectivement du REER vers le NonReg.
        expect(cd.some(p => num(p.NonReg) > 100_000)).toBe(true);
        let maxResid = 0;
        for (let i = 1; i < cd.length; i++) {
            if (num(cd[i].REER) > 1_000) maxResid = Math.max(maxResid, Math.abs(unexplained(cd[i], cd[i - 1])));
        }
        expect(maxResid).toBeLessThan(1);
    });

    // INV-12 — FISC-BROKE-LIQUID-FLOOR : un retraité qui ÉPUISE tous ses comptes de décaissement
    // (REER/CELI/nonReg/crypto) puis continue à dépenser ne doit PAS voir ses dépenses « s'évaporer ».
    // Avant le fix : le déficit non couvert (coussin critique gardé) n'était NI puisé NI porté en dette
    // → ΔNW restait ~stable (création d'argent fantôme, résiduel +shortfall/mois ~3,7 k$). Après : porté
    // en `liquidDebt` VISIBLE → conservation rétablie, patrimoine net reconstructible même insolvable.
    it('INV-12 — retraité insolvable : dépense non couverte portée en dette (conservation, pas d\'évaporation)', () => {
        const cd = run(makeBrokeRetireeParams()).chartData;
        // (a) Conservation : aucun mois ne crée d'argent fantôme, même comptes épuisés (résiduel ≈ 0).
        let maxResid = 0, maxM = -1;
        for (let i = 1; i < cd.length; i++) {
            const u = Math.abs(unexplained(cd[i], cd[i - 1]));
            if (u > maxResid) { maxResid = u; maxM = i; }
        }
        expect(maxResid, `résiduel inexpliqué ${maxResid.toFixed(0)} $ au mois ${maxM}`).toBeLessThan(2);
        // (b) Le régime insolvable est bien atteint (REER épuisé, dépenses > revenus) — test non vacant.
        const broke = cd.find(p => num(p.REER) < 1 && num(p.Expenses) - num(p.Income) > 1_000);
        expect(broke, 'régime insolvable attendu (REER épuisé)').toBeTruthy();
        // (c) La dette d'insolvabilité est VISIBLE (LiquidDebt + DetteTotale l'exposent).
        const last = cd[cd.length - 1];
        const liqDebt = num((last as Record<string, unknown>).LiquidDebt);
        expect(liqDebt, 'dette d\'insolvabilité visible').toBeGreaterThan(1_000);
        expect(num(last.DetteTotale)).toBeGreaterThanOrEqual(liqDebt - 1);
        // (d) Reconstructabilité maintenue même profondément négatif : NW = Σ(actifs) − DetteTotale.
        for (const p of cd) {
            expect(Math.abs(num(p.NetWorth) - (shownAssets(p) - num(p.DetteTotale)))).toBeLessThan(2);
        }
        // (e) Le patrimoine net PLONGE (le retraité s'endette) au lieu de rester positif par magie.
        expect(num(last.NetWorth)).toBeLessThan(-10_000);
    });
});

describe('[NAN-INPUT-HARDENING] un input non fini (NaN/Infinity) ne se propage jamais en silence', () => {
    // Garde-fou défense-en-profondeur (audit 2026-06-23). Les inputs sont sanitisés aux boundaries, mais
    // `?? 0` ne rattrape PAS NaN et l'arithmétique nue propage NaN sans déclencher les 12 invariants
    // (`NaN > EPS` = false). Chaque garde rabat sur 0/neutre. Tests DISCRIMINANTS (échouent sans la garde).
    const debt = (balance: number): Debt =>
        ({ id: 'x', name: 'd', balance, interestRate: 0, minimumPayment: 0, category: 'Car' } as unknown as Debt);

    it('computeTotalDebt : un solde Infinity → 0 (`|| 0` ne le rattrapait pas) ; NaN aussi ; le fini est sommé', () => {
        expect(computeTotalDebt([debt(Number.POSITIVE_INFINITY)])).toBe(0); // discriminant : `Infinity||0`=Infinity
        expect(computeTotalDebt([debt(Number.NaN)])).toBe(0);
        expect(computeTotalDebt([debt(1000), debt(Number.NaN)])).toBe(1000); // seul le fini compte
    });

    it('applyMidMonthGrowth : un solde de départ/fin non fini → résultat neutre fini (jamais croissance NaN)', () => {
        // discriminant : sans la garde, `NaN<=0`=false saute l'early-return → newVal NaN.
        expect(applyMidMonthGrowth(Number.NaN, 1000, 6)).toEqual({ newVal: 0, growth: 0, pct: 0 });
        expect(applyMidMonthGrowth(1000, Number.NaN, 6)).toEqual({ newVal: 0, growth: 0, pct: 0 });
        expect(applyMidMonthGrowth(Number.POSITIVE_INFINITY, 0, 6)).toEqual({ newVal: 0, growth: 0, pct: 0 });
        // [panel LOT 4] un TAUX non fini propageait aussi NaN (`Math.pow(1+NaN/100)`) → garde dédiée :
        // pas de croissance MAIS le solde de fin est PRÉSERVÉ (pas rabattu à 0).
        expect(applyMidMonthGrowth(1000, 1100, Number.NaN)).toEqual({ newVal: 1100, growth: 0, pct: 0 });
    });

    it('e2e — un lifeEvent à impactAmount NaN ne corrompt JAMAIS NetWorth/Expenses (monthlyEvents)', () => {
        // GROS_ACHAT (non KRACH, non perte-de-revenu, nom sans « vente ») → branche impactAmount.
        // ⚠️ On asserte la valeur BRUTE (`Number(...)`), PAS via `num()` qui sanitise NaN→0 et rendrait
        // l'assertion vacante (`Number.isNaN(num(x))` est toujours faux). C'est ce qui discrimine la garde.
        const raw = (v: unknown): number => Number(v);
        const bad = { id: 'e', type: 'GROS_ACHAT', name: 'Achat majeur', date: '2027-03-15', impactAmount: Number.NaN } as unknown as LifeEvent;
        const cd = run(makeParams({ lifeEvents: [bad] })).chartData;
        for (const p of cd) {
            expect(Number.isNaN(raw(p.NetWorth)), `NetWorth NaN au mois ${p.monthIndex}`).toBe(false);
            expect(Number.isNaN(raw(p.Expenses)), `Expenses NaN au mois ${p.monthIndex}`).toBe(false);
        }
    });
});

describe('[FISC-WHT-HARDCODE] retenue REER affichée = tiered (19/24/29 %), pas le 0,15 figé', () => {
    // Le compteur `totalTaxesPaid` (→ taxLeakage + ranking de stratégies) ajoutait la retenue REER au taux
    // FIGÉ 0,15, qui sous-évalue dès la 2ᵉ tranche (réelle = 19/24/29 % combiné QC). On utilise désormais la
    // retenue TIERED EXACTE → totalTaxesPaid plus haut (et = totalAnnualTax, plus de biais). Discriminant
    // prouvé par git-stash : le seuil ci-dessous est INATTEIGNABLE avec l'ancien 0,15.
    const bigReerRetiree = () => makeParams({
        projection: makeProjection({ years: 10, returnRate: 4, returnRates: { celi: 4, reer: 4, nonReg: 4, crypto: 5, cash: 1 } }),
        calculatedStartingCash: 10_000,
        liveCSVBalances: { ...NO_INVEST, REER: 600_000 },
        retirementGoal: { targetAge: 60, targetMonthlyIncome: 9000, governmentPension: 800, lifeExpectancy: 95 },
        config: makeRetireeConfig(),
        baseGrossAnnual: 0, baseNetAnnual: 0, currentRentExpense: 0, baseMonthlyExpenses: 8000,
    });

    it('un gros décaissement REER mensuel (> bracket 1) → le FLUX affiché reflète la retenue tiered', () => {
        const r = run(bigReerRetiree());
        // [PROJ-TTP-DOUBLECOUNT 2026-08-01] `totalTaxesPaid` ne porte PLUS la retenue en direct
        // (compteur = Σ FluxImpots ; décembre réconcilie au vrai impôt, donc le TAUX de retenue
        // n'influence plus sa valeur — l'ancien seuil 250 000 sur le compteur est mort par design).
        // Le discriminant tiered-vs-0,15 vit désormais sur le FLUX affiché `ImpotRetraitREER`.
        // ⚠️ Sémantique exacte (panel #554, mesurée au dollar) : cette série = Σ TaxPaidREER
        // (règlement d'avril du bucket, qui PORTE la retenue tiered provisionnée) + Σ
        // WithheldTaxRrif (FERR — 0 ici, pas de 71+) : c'est via le bucket d'avril que le barème
        // tiered reste discriminant. Mesuré 155 114 $ tiered ; un 0,15 plat donnerait ~98 k$
        // (Σbrut ≈ 655 k × 0,15) → le seuil 130 000 reste inatteignable en flat.
        const sumWht = r.chartData.reduce((s, d) => s + (Number.isFinite(Number(d.ImpotRetraitREER)) ? Number(d.ImpotRetraitREER) : 0), 0);
        expect(sumWht).toBeGreaterThan(130_000);
        // Et le compteur suit la nouvelle identité : Σ FluxImpots exactement (± 1 $).
        const sumFlux = r.chartData.reduce((s, d) => s + (Number.isFinite(Number(d.FluxImpots)) ? Number(d.FluxImpots) : 0), 0);
        const ttp = r.totalTaxesPaid ?? Number.NaN; // absent = échec franc, pas un 0 crédible
        expect(ttp).toBeGreaterThan(50_000); // non-vacuité : de l'impôt coule vraiment
        expect(Math.abs(ttp - sumFlux)).toBeLessThan(1);
    });
});
