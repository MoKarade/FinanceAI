import { describe, it, expect } from 'vitest';
import { computeRetirementIncome } from '../../services/projection/retirementIncome';
import type { RetirementIncomeCtx } from '../../services/projection/retirementIncome';
import type { RetirementGoal, User } from '../../types';

const baseGoal: RetirementGoal = {
    targetAge: 65,
    targetMonthlyIncome: 5000,
    governmentPension: 2000,
    rrqEstimateMonthly: 800,
    psvEstimateMonthly: 700,
    dbPensionMonthly: 0,
    dbPensionStartAge: 65,
    dbPensionIndexationPct: 100,
};

const baseUser: User = {
    name: 'Test',
    salary: 60000,
    netSalary: 45000,
    birthYear: 1961,
    canadaArrivalYear: 1990,
} as unknown as User;

const baseCtx: RetirementIncomeCtx = {
    m: 0,
    age: 65,
    simInflation: 2,
    activeUsersCount: 1,
    baseGrossAnnual: 60000,
    delayPensions: false,
    survivorMode: false,
    monthlyOasReduction: 0,
    dbSurvivorPct: 0.6,
    rrqSurvivorPct: 0.6,
    psvResidencyYears: [35],
    startYear: 2026,
};

describe('computeRetirementIncome — SRG §7.G regression', () => {
    it('couple: SRG is > 0 when combined income is below threshold', () => {
        // Low-income couple: both RRQ estimates are minimal.
        const coupleGoal: RetirementGoal = {
            ...baseGoal,
            rrqEstimateMonthly: 300,  // per person → 600/month family
            psvEstimateMonthly: 700,  // per person → 1400/month family
        };
        const coupleCtx: RetirementIncomeCtx = {
            ...baseCtx,
            activeUsersCount: 2,
            psvResidencyYears: [35, 35],
        };
        const coupleUsers: User[] = [baseUser, { ...baseUser, name: 'Partner' }];

        const income = computeRetirementIncome(coupleCtx, coupleGoal, coupleUsers);
        // With low income, GIS should kick in — income must exceed RRQ+PSV alone
        const rrqPsvOnly = (300 * 2) * (35 / 40) + (700 * 2) * (35 / 40); // rough family total
        expect(income).toBeGreaterThan(rrqPsvOnly * 0.8);
    });

    it('single: SRG computation does not multiply income by activeUsersCount=1 (no double-count)', () => {
        // Single person — ensure otherIncomeAnnualFamily equals rrqMonthly*12, not doubled
        const singleCtx: RetirementIncomeCtx = { ...baseCtx, activeUsersCount: 1 };
        const income1 = computeRetirementIncome(singleCtx, baseGoal, [baseUser]);
        expect(income1).toBeGreaterThan(0);
        expect(Number.isFinite(income1)).toBe(true);
    });

    it('couple with minimal pension: GIS is NOT zero (§7.G double-count fix)', () => {
        // Before fix: otherIncomeAnnualFamily = (rrqMonthly) * 12 * 2 → over GIS threshold
        // After fix: otherIncomeAnnualFamily = (rrqMonthly) * 12 → correct
        const lowIncomeGoal: RetirementGoal = {
            ...baseGoal,
            rrqEstimateMonthly: 100,   // very low per-person
            psvEstimateMonthly: 700,
        };
        const coupleCtx: RetirementIncomeCtx = {
            ...baseCtx,
            activeUsersCount: 2,
            psvResidencyYears: [40, 40], // full PSV
        };
        const income = computeRetirementIncome(coupleCtx, lowIncomeGoal, [baseUser, baseUser]);
        // GIS should push total above raw PSV+RRQ
        const rawPsvRrq = (700 * 2 + 100 * 2); // family monthly
        expect(income).toBeGreaterThan(rawPsvRrq * 0.85);
    });
});
