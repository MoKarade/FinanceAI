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
import type { ProjectionConfig, BudgetConfig, RetirementGoal, Debt } from '../../types';

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
                expect(Number.isNaN(num(p.NetWorth)), `NetWorth NaN au mois ${p.monthIndex}`).toBe(false);
                expect(Number.isNaN(num(p.DetteTotale))).toBe(false);
                expect(Number.isNaN(num(p.diffNW))).toBe(false);
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
