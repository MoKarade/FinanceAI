import { describe, it, expect } from 'vitest';
import { findRequiredMonthlySavings, findEarliestRetirementAge } from '../../services/projection/goalSeek';
import type { SimulationParams } from '../../services/projection';
import type { BudgetConfig } from '../../types';

const baseConfig = (): BudgetConfig => ({
    users: [
        { name: 'A', grossSalary: 5000, netSalary: 3500, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991 },
        { name: 'B', grossSalary: 4000, netSalary: 2800, color: '#3b82f6', age: 35, birthYear: 1991, canadaArrivalYear: 1991 },
    ],
    splitMode: '50/50',
});

const baseParams = (): SimulationParams => ({
    projection: {
        years: 20,
        returnRate: 6,
        inflationRate: 2,
        savingsMode: 'manual',
        manualContribution: 1000,
        usePortfolioRate: false,
        returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6,
        salaryGrowth: 2,
        propertyGrowthRate: 3,
    },
    calculatedStartingCash: 25000,
    liveCSVBalances: { CELI: 30000, CELIAPP: 0, REER: 50000, NON_ENREG: 10000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [],
    debts: [],
    childGoals: [],
    travelGoals: [],
    lifeEvents: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 4500, governmentPension: 1500 },
    config: baseConfig(),
    baseGrossAnnual: 108000,
    baseNetAnnual: 75600,
    currentRentExpense: 1500,
    baseMonthlyExpenses: 5000,
    startYear: 2026,
    startMonth: 0,
});

describe('findRequiredMonthlySavings', () => {
    it('trouve une épargne mensuelle qui amène à un patrimoine cible raisonnable', () => {
        const target = 500_000;
        const result = findRequiredMonthlySavings(baseParams(), target, undefined, 0, 10000, 50000, 20);
        expect(result.found).toBe(true);
        expect(result.value).toBeGreaterThanOrEqual(0);
        expect(result.value).toBeLessThanOrEqual(10000);
    });

    it('signale une cible inatteignable si elle est gigantesque', () => {
        const target = 999_999_999_999;
        const result = findRequiredMonthlySavings(baseParams(), target, undefined, 0, 5000, 100000, 15);
        expect(result.found).toBe(false);
    });
});

describe('findEarliestRetirementAge', () => {
    it('retourne un âge plausible', () => {
        const result = findEarliestRetirementAge(baseParams());
        expect(result.value).toBeGreaterThanOrEqual(45);
        expect(result.value).toBeLessThanOrEqual(75);
    });
});
