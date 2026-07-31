/**
 * [DASH-IMMO-EQUITY-WRITERS / ENG-PAST-PURCHASE] (V2', décision Marc 2026-07-31 : « brancher »)
 * Un bien à `purchaseDate` PASSÉE démarre DÉTENU : équité au mois 0, hypothèque restante amortie,
 * AUCUN re-débit de la mise de fonds. Avant : re-achat au m0 (cash dépensé 2×) ou « Achat
 * reporté » à l'infini (Immobilier = 0 sur tout l'horizon — le Futur perdait la maison, mesuré).
 */
import { describe, it, expect } from 'vitest';
import { initPastPurchase, presentEquityOfGoal, monthsSince } from '../../services/projection/pastPurchaseInit';
import { calculateSchlPremium } from '../../services/realEstate';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { RealEstateGoal, ProjectionConfig, BudgetConfig } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const goal = (o: Partial<RealEstateGoal> = {}): RealEstateGoal => ({
    id: 're1', isActive: true, purchaseDate: '2021-07', price: 400_000, downPayment: 60_000,
    mortgageRate: 4.5, amortization: 25, totalClosingCosts: 8_000, monthlyPayment: 0,
    unrecoverableMonthly: 0, isPrimaryResidence: true, ...o,
} as RealEstateGoal);

describe('initPastPurchase — conventions du moteur', () => {
    it('0 mois écoulé : valeur = price, solde = principal (avec prime SCHL si LTV > 80 %)', () => {
        const s = initPastPurchase(goal(), 0);
        const schl = calculateSchlPremium({ price: 400_000, downPayment: 60_000 });
        expect(s.currentValue).toBeCloseTo(400_000, 2);
        expect(s.mortgage).toBeCloseTo(340_000 + (schl.required ? schl.premium : 0), 2);
        expect(s.calculatedPmt).toBeGreaterThan(0);
        expect(s.isPaidOff).toBe(false);
    });

    it('après l\'amortissement complet : solde 0, pmt 0, isPaidOff', () => {
        const s = initPastPurchase(goal(), 25 * 12 + 1);
        expect(s.mortgage).toBe(0);
        expect(s.calculatedPmt).toBe(0);
        expect(s.isPaidOff).toBe(true);
    });

    it('le solde DÉCROÎT avec le temps et la valeur APPRÉCIE (growth 3 % défaut)', () => {
        const a = initPastPurchase(goal(), 12);
        const b = initPastPurchase(goal(), 60);
        expect(b.mortgage).toBeLessThan(a.mortgage);
        expect(b.currentValue).toBeGreaterThan(a.currentValue);
        expect(b.currentValue).toBeCloseTo(400_000 * Math.pow(1.03, 5), 0);
    });

    it('champs NON FINIS neutralisés (jamais NaN en sortie)', () => {
        const s = initPastPurchase(goal({ price: NaN as never, downPayment: undefined as never }), 24);
        expect(Number.isFinite(s.currentValue)).toBe(true);
        expect(Number.isFinite(s.mortgage)).toBe(true);
        expect(Number.isFinite(s.calculatedPmt)).toBe(true);
    });
});

describe('presentEquityOfGoal — surface KPI', () => {
    it('les champs EXPLICITES currentValue/mortgageBalance priment', () => {
        expect(presentEquityOfGoal(goal({ currentValue: 500_000, mortgageBalance: 200_000 }), 60)).toBe(300_000);
    });
    it('sans champs explicites : reconstruction moteur (équité > 0 pour un achat passé)', () => {
        const eq = presentEquityOfGoal(goal(), 60);
        expect(eq).toBeGreaterThan(100_000);
        expect(eq).toBeLessThan(250_000);
    });
    it('achat FUTUR ou bien inactif → 0', () => {
        expect(presentEquityOfGoal(goal(), 0)).toBe(0);
        expect(presentEquityOfGoal(goal({ isActive: false }), 60)).toBe(0);
    });
});

describe('monthsSince', () => {
    it('date passée → positif ; future → négatif ; invalide → 0', () => {
        const now = new Date(2026, 6, 15); // juillet 2026
        expect(monthsSince('2021-07', now)).toBe(60);
        expect(monthsSince('2027-01', now)).toBeLessThan(0);
        expect(monthsSince('n/a', now)).toBe(0);
        expect(monthsSince(undefined, now)).toBe(0);
    });
});

// ── Intégration moteur ─────────────────────────────────────────────────────
const projection: ProjectionConfig = {
    years: 3, returnRate: 5, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 6, cash: 1 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
};
const config: BudgetConfig = {
    users: [
        { name: 'M', grossSalary: 8000, netSalary: 5600, color: '#fff', age: 40, birthYear: 1986, canadaArrivalYear: 1986, hasOwnedPropertyLast4Years: true, celiContributed: 0, rrspContributed: 0 },
        { name: 'A', grossSalary: 0, netSalary: 0, color: '#fff', age: 40, birthYear: 1986, canadaArrivalYear: 1986, hasOwnedPropertyLast4Years: true, celiContributed: 0, rrspContributed: 0 },
    ],
    splitMode: '50/50',
};
const engineParams = (goals: RealEstateGoal[], cash = 20_000): SimulationParams => ({
    projection, calculatedStartingCash: cash,
    liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: goals, debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 5000, governmentPension: 1500, lifeExpectancy: 92 },
    config, baseGrossAnnual: 96_000, baseNetAnnual: 67_200, currentRentExpense: 0,
    baseMonthlyExpenses: 3_500, startYear: 2026, startMonth: 6,
} as SimulationParams);

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

describe('Moteur — bien acheté dans le PASSÉ', () => {
    it('détenu dès le mois 0 : équité > 0, hypothèque dans DetteTotale, PAS d\'« Achat reporté » (discriminant)', () => {
        // Cash 20 k$ < mise de fonds 60 k$ : l'ANCIEN code reportait l'achat à l'infini →
        // Immobilier = 0 sur tout l'horizon (le test ÉCHOUE sur l'ancien code).
        const r = __runScenarioForTests(engineParams([goal()]), 'AUTO_MARGINAL' as AllocationStrategy, false, false);
        const p0 = r.chartData[0] as Record<string, unknown>;
        expect(num(p0.Immobilier)).toBeGreaterThan(100_000);
        expect(num(p0.DetteTotale)).toBeGreaterThan(250_000); // hypothèque restante visible
        expect(num(p0.DettesNonImmo)).toBe(0); // et PAS comptée hors-immo (INV-9)
        const logs = r.chartData.flatMap((d) => ((d as { flowEvents?: Array<{ label?: string }> }).flowEvents || []).map(e => e.label || ''));
        expect(logs.join(' ')).not.toContain('Achat reporté');
    });

    it('reconstructibilité (INV-9) au mois 0 ET au mois 12 : NetWorth = Σactifs − DettesNonImmo', () => {
        const r = __runScenarioForTests(engineParams([goal()]), 'AUTO_MARGINAL' as AllocationStrategy, false, false);
        for (const mi of [0, 12]) {
            const p = r.chartData[mi] as Record<string, unknown>;
            const sumAssets = num(p.Liquidites) + num(p.CELI) + num(p.CELIAPP) + num(p.REER)
                + num(p.NonReg) + num(p.Crypto) + num(p.REEE) + num(p.Immobilier);
            expect(Math.abs(num(p.NetWorth) - (sumAssets - num(p.DettesNonImmo)))).toBeLessThan(2);
        }
    });

    it('achat FUTUR : comportement STRICTEMENT inchangé (le bien n\'existe pas au m0)', () => {
        // NB : le report d'un achat futur quand la cascade a investi l'excédent de cash est un
        // comportement PRÉ-EXISTANT (mesuré identique sur le code d'avant — 0 aux m11/m14/m20) :
        // ce test vérifie seulement que le chemin « achat futur » n'est PAS touché par l'init
        // « déjà détenu » (aucune équité fantôme au m0 pour une date future).
        const r = __runScenarioForTests(engineParams([goal({ purchaseDate: '2027-06' })], 100_000), 'AUTO_MARGINAL' as AllocationStrategy, false, false);
        const p0 = r.chartData[0] as Record<string, unknown>;
        expect(num(p0.Immobilier)).toBe(0);
        expect(num(p0.DetteTotale)).toBe(0);
    });
});

// ── Findings panel #552 (commit de suivi) ──────────────────────────────────
describe('Moteur — findings panel #552', () => {
    it('[PV ÉLEVÉ-1] la graine prevNW/minNetWorth INCLUT l\'équité du bien passé (pas de flux fantôme)', () => {
        // Ancien code mesuré : diffNW[0] = +158 732 $ (toute l'équité comptée comme « variation du
        // mois ») et minNetWorth = 20 000 $ (sous le vrai plancher de 158 731 $) → biais pessimiste
        // dans safetyScore/goalSeek/strategyRanking. Les DEUX assertions échouent sur l'ancien code.
        const r = __runScenarioForTests(engineParams([goal()]), 'AUTO_MARGINAL' as AllocationStrategy, false, false);
        const d0 = num((r.chartData[0] as Record<string, unknown>).diffNW);
        const d1 = num((r.chartData[1] as Record<string, unknown>).diffNW);
        expect(Math.abs(d0 - d1)).toBeLessThan(500);
        expect(r.minNetWorth).toBeGreaterThan(100_000);
    });

    it('[FI ÉLEVÉ-1] RP passée : le proxy loyer n\'entre plus dans la substitution (offset = PMT reconstruit)', () => {
        // Ancien code : monthlyExpenses -= currentRentExpense (défaut 1 600 $) + PMT ajouté →
        // deux runs identiques sauf currentRentExpense divergeaient de (Δloyer)×36 mois ≈ 60 k$.
        // Nouveau : l'offset est le PMT+charges reconstruits, currentRentExpense est IGNORÉ pour
        // une RP déjà détenue au boot → les deux runs sont IDENTIQUES.
        const a = __runScenarioForTests({ ...engineParams([goal()]), currentRentExpense: 0 } as SimulationParams, 'AUTO_MARGINAL' as AllocationStrategy, false, false);
        const b = __runScenarioForTests({ ...engineParams([goal()]), currentRentExpense: 1_600 } as SimulationParams, 'AUTO_MARGINAL' as AllocationStrategy, false, false);
        expect(Math.abs(a.finalNetWorth - b.finalNetWorth)).toBeLessThan(1);
    });

    it('[PV MOYEN-2] les champs EXPLICITES currentValue/mortgageBalance sont honorés par le MOTEUR', () => {
        // Ancien code : le moteur reconstruisait toujours (chartData[0].Immobilier = 158 324 $) et
        // le KPI lisait l'explicite (450 000 $) → écart 291 676 $ entre l'Accueil et le Futur.
        const g = goal({ currentValue: 600_000, mortgageBalance: 150_000 });
        const r = __runScenarioForTests(engineParams([g]), 'AUTO_MARGINAL' as AllocationStrategy, false, false);
        const immo0 = num((r.chartData[0] as Record<string, unknown>).Immobilier);
        // m0 est émis APRÈS un mois de traitement (croissance + capital) — tolérance 5 k$.
        expect(Math.abs(immo0 - 450_000)).toBeLessThan(5_000);
        // Et le KPI (presentEquityOfGoal) dit LA MÊME CHOSE (même helper, même convention).
        expect(Math.abs(presentEquityOfGoal(g, 60) - 450_000)).toBeLessThan(1);
    });

    it('[PV MOYEN-5] mortgageRate NaN assaini à la frontière : AUCUN non-fini dans chartData', () => {
        // Ancien code mesuré : 968 valeurs non finies (NaN propagé par goal.mortgageRate / 100),
        // rabattues en « 0 $ crédible » par la garde de computeRawNetWorth.
        const r = __runScenarioForTests(engineParams([goal({ mortgageRate: NaN as never })]), 'AUTO_MARGINAL' as AllocationStrategy, false, false);
        let nonFinite = 0;
        for (const row of r.chartData) {
            for (const [, v] of Object.entries(row as Record<string, unknown>)) {
                if (typeof v === 'number' && !Number.isFinite(v)) nonFinite++;
            }
        }
        expect(nonFinite).toBe(0);
        expect(num((r.chartData[0] as Record<string, unknown>).Immobilier)).toBeGreaterThan(100_000);
    });

    it('[SF MOYEN] mortgageBalance explicite à 0 (maison PAYÉE) honoré même sans currentValue', () => {
        const s = initPastPurchase(goal({ mortgageBalance: 0 }), 60);
        expect(s.mortgage).toBe(0);
        expect(s.isPaidOff).toBe(true);
        expect(s.currentValue).toBeGreaterThan(400_000); // valeur reconstruite, pas 0
    });

    it('[SF CRITIQUE] donnée corrompue (mortgageBalance NaN) → bien EXCLU (0) et jamais l\'hypothèque avalée', () => {
        // Ancien code mesuré : currentValue 500 000 + mortgageBalance NaN → équité 500 000 (la
        // dette disparaissait en silence). La garde vit dans le helper → couvre les 3 consommateurs.
        expect(presentEquityOfGoal(goal({ currentValue: 500_000, mortgageBalance: NaN as never }), 60)).toBe(0);
    });
});
