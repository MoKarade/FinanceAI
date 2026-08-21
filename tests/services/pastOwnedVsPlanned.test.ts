// tests/services/pastOwnedVsPlanned.test.ts
//
// [ENG-PAST-OWNED-VS-PLANNED] (décision Marc A6, ADR 0014) — une date d'achat PASSÉE n'implique
// plus la détention : `isOwned === false` (objectif planifié non réalisé) n'injecte RIEN au m0.
// Le panel #552 mesurait +156 628 $ d'équité et +307 081 $ de dette FANTÔMES sur un objectif 2024
// jamais mis à jour. `undefined` = legacy (comportement historique conservé, l'UI questionne).
import { describe, it, expect } from 'vitest';
import { presentEquityOfGoal } from '../../services/projection/pastPurchaseInit';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { RealEstateGoal, ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const goal = (o: Partial<RealEstateGoal>): RealEstateGoal => ({
    id: 'g1', name: 'Condo', isActive: true, purchaseDate: '2024-06-01', price: 450_000,
    downPayment: 45_000, mortgageRate: 4.5, amortization: 25, totalClosingCosts: 8_000,
    monthlyPayment: 2_250, unrecoverableMonthly: 600, isPrimaryResidence: true,
    ...o,
} as RealEstateGoal);

const runParams = (g: RealEstateGoal): SimulationParams => ({
    projection: {
        years: 2, returnRate: 4, inflationRate: 2, savingsMode: 'manual', manualContribution: 500,
        usePortfolioRate: false, returnRates: { celi: 4, reer: 4, nonReg: 4, crypto: 4, cash: 1 },
        emergencyFundMonths: 3, salaryGrowth: 0, propertyGrowthRate: 0,
    } as unknown as ProjectionConfig,
    calculatedStartingCash: 50_000,
    liveCSVBalances: { CELI: 20_000, CELIAPP: 0, REER: 50_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [g], debts: [], travelGoals: [], lifeEvents: [], childGoals: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 5_000, governmentPension: 1_500, lifeExpectancy: 92 } as unknown as RetirementGoal,
    config: {
        users: [{ name: 'Marc', grossSalary: 8_000, netSalary: 5_400, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: true, celiContributed: 0, rrspContributed: 0 }] as unknown as User[],
        splitMode: '50/50',
    } as unknown as BudgetConfig,
    baseGrossAnnual: 96_000, baseNetAnnual: 64_800, currentRentExpense: 1_500,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

describe('[ENG-PAST-OWNED-VS-PLANNED] la détention se déclare, elle ne se déduit plus de la date', () => {
    it('MOTEUR bout-en-bout : isOwned false vs true — le bien passé disparaît du m0 (les DEUX registres)', () => {
        // Même leçon que le proxy DB : la garde au producteur ne prouve pas la chaîne — on run.
        const owned = __runScenarioForTests(runParams(goal({ isOwned: true })), 'AUTO_MARGINAL' as AllocationStrategy);
        const planned = __runScenarioForTests(runParams(goal({ isOwned: false })), 'AUTO_MARGINAL' as AllocationStrategy);
        const m0owned = owned.chartData[0] as Record<string, number>;
        const m0planned = planned.chartData[0] as Record<string, number>;
        // Le bien détenu injecte équité (Immobilier > 0) ET dette ; le planifié non réalisé : rien.
        expect(m0owned.Immobilier).toBeGreaterThan(0);
        expect(m0planned.Immobilier ?? 0).toBe(0);
        expect(m0planned.DetteTotale ?? 0).toBeLessThan(m0owned.DetteTotale ?? 0);
    });

    it('isOwned: false → AUCUNE équité reconstruite (le fantôme du panel #552 meurt)', () => {
        expect(presentEquityOfGoal(goal({ isOwned: false }), 26)).toBe(0);
    });

    it('isOwned: false + currentValue SAISI → le fait utilisateur explicite prime', () => {
        expect(presentEquityOfGoal(goal({ isOwned: false, currentValue: 500_000, mortgageBalance: 300_000 }), 26))
            .toBe(200_000);
    });

    it('isOwned: true → équité passée reconstruite, STRICTEMENT identique au legacy (undefined)', () => {
        const owned = presentEquityOfGoal(goal({ isOwned: true }), 26);
        const legacy = presentEquityOfGoal(goal({}), 26);
        expect(owned).toBeGreaterThan(0);
        expect(owned).toBe(legacy); // rétro-compat : undefined == true (comportement historique)
    });
});
