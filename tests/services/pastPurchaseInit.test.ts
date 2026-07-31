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
