// PH4-FUT-B-3 — levier « taux d'épargne » BOUT-EN-BOUT dans le moteur déterministe.
// Propriétés money-critical de runScenario (calculateFutureProjection, runMC=false → déterministe) :
//   1. NON-RÉGRESSION : multiplicateur absent OU 1 == run historique (au bit près).
//   2. MONOTONIE : 0.9 < 1 < 1.2 (épargner plus ⇒ moins de dépenses ⇒ plus investi ⇒ plus de patrimoine).
//   3. DÉFICIT : épargne ≤ 0 (dépenses ≥ revenu net) → le levier n'a AUCUN effet (épargner « plus »
//      est mal défini en déficit — garde explicite dans le moteur).
import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal } from '../../types';

const makeProjection = (overrides: Partial<ProjectionConfig> = {}): ProjectionConfig => ({
    years: 30,
    returnRate: 6,
    inflationRate: 2,
    savingsMode: 'manual',
    manualContribution: 1500,
    usePortfolioRate: false,
    returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
    emergencyFundMonths: 6,
    salaryGrowth: 2,
    propertyGrowthRate: 3,
    ...overrides,
});

const makeConfig = (): BudgetConfig => ({
    users: [
        { name: 'Test1', grossSalary: 5000, netSalary: 3500, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
        { name: 'Test2', grossSalary: 4500, netSalary: 3200, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    ],
    splitMode: '50/50',
});

const makeRetirementGoal = (overrides: Partial<RetirementGoal> = {}): RetirementGoal => ({
    targetAge: 65,
    targetMonthlyIncome: 4500,
    governmentPension: 1500,
    ...overrides,
});

const makeParams = (overrides: Partial<SimulationParams> = {}): SimulationParams => ({
    projection: makeProjection(),
    calculatedStartingCash: 25000,
    liveCSVBalances: { CELI: 30000, CELIAPP: 0, REER: 50000, NON_ENREG: 10000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [],
    debts: [],
    childGoals: [],
    travelGoals: [],
    lifeEvents: [],
    retirementGoal: makeRetirementGoal(),
    config: makeConfig(),
    baseGrossAnnual: 114000,
    baseNetAnnual: 80400,        // net 6 700 $/mois ; dépenses 5 000 → épargne RÉELLE +1 700 $/mois.
    currentRentExpense: 1500,
    baseMonthlyExpenses: 5000,
    startYear: 2026,
    startMonth: 0,
    ...overrides,
});

// finalNetWorth déterministe pour un multiplicateur d'épargne (undefined = champ absent = historique).
const finalNetWorth = (mult: number | undefined, paramOverrides: Partial<SimulationParams> = {}): number => {
    const projection = makeProjection();
    if (mult !== undefined) projection.appliedSavingsMultiplier = mult;
    const res = calculateFutureProjection(makeParams({ projection, ...paramOverrides }), false, 0);
    expect(res.finalNetWorth).toBeDefined();
    return res.finalNetWorth!;
};

describe('PH4-FUT-B-3 — taux d\'épargne dans le moteur (déterministe, 30 ans)', () => {
    it('NON-RÉGRESSION : multiplicateur absent == 1 (au bit près)', () => {
        const historical = finalNetWorth(undefined);
        const base = finalNetWorth(1);
        expect(base).toBe(historical);
        expect(base).toBeGreaterThan(0);
    });

    it('MONOTONIE : −10 % < base < +20 % (épargner plus ⇒ plus de patrimoine)', () => {
        const less = finalNetWorth(0.9);
        const base = finalNetWorth(1);
        const more = finalNetWorth(1.2);
        expect(less).toBeLessThan(base);
        expect(base).toBeLessThan(more);
        // Effet matériel sur 30 ans (pas un bruit d'arrondi) : +20 % d'épargne de 1 700 $/mois = +340 $/mois investis.
        expect(more - base).toBeGreaterThan(50_000);
    });

    it('DÉFICIT : épargne ≤ 0 → le levier n\'a AUCUN effet (dépenses inchangées)', () => {
        // Dépenses 7 000 > net 6 700 → épargne réelle négative. Le multiplicateur doit être inerte.
        const deficit = { baseMonthlyExpenses: 7000 };
        const base = finalNetWorth(1, deficit);
        const more = finalNetWorth(1.2, deficit);
        const less = finalNetWorth(0.9, deficit);
        expect(more).toBe(base);
        expect(less).toBe(base);
    });
});
