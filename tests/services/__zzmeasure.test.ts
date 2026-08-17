import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';
(globalThis as never as Record<string, unknown>).__out = [];
afterAll(() => writeFileSync('/tmp/claude-0/-home-user/f5da6341-023a-54e5-b9d9-cede963d32fd/scratchpad/out.txt', ((globalThis as never as Record<string, unknown[]>).__out).map(a => JSON.stringify(a)).join('\n')));
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionChartPoint } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User, ChildGoal } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const users = (age: number): User[] => ([
    { name: 'Marc', grossSalary: 8_200, netSalary: 5_620, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 7_100, netSalary: 4_995, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const enfant = (benefits: number): ChildGoal => ({
    id: 'e1', name: 'Enfant', isActive: true, birthDate: '2020-01-01',
    initialCost: 0, monthlyDiapers: 0, monthlyFood: 300, monthlyClothing: 100,
    daycareType: 'cpe', activitiesLevel: 'legeres', universityType: 'aucune', carGift: 'non',
    reeeMonthly: 0, governmentBenefits: benefits,
} as unknown as ChildGoal);

const params = (proj: Partial<ProjectionConfig>, children: ChildGoal[]): SimulationParams => ({
    projection: {
        years: 6, returnRate: 6, inflationRate: 0, savingsMode: 'manual', manualContribution: 0,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 3, ...proj,
    } as ProjectionConfig,
    calculatedStartingCash: 70_000,
    liveCSVBalances: { CELI: 50_000, CELIAPP: 0, REER: 90_000, NON_ENREG: 40_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: children, travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 1_500, lifeExpectancy: 92, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: { users: users(40), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 1_800,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

const run = (proj: Partial<ProjectionConfig>, children: ChildGoal[]): ProjectionChartPoint[] => {
    const r = __runScenarioForTests(
        params(proj, children), 'AUTO_MARGINAL' as AllocationStrategy, true, false, 0, 'BASE', {},
        { verboseMonthlyPoints: true },
    ) as unknown as { chartData: ProjectionChartPoint[] };
    return r.chartData;
};

const DIV = { divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 };

describe('MESURE garde 50/50', () => {
    it('allocations : registre affiché vs flux Income', () => {
        const B = 500;
        const withB = run(DIV, [enfant(B)]);
        const noB = run(DIV, [enfant(0)]);
        const m = 24; // bien après le divorce (m=1)
        const p1 = withB[m] as never as Record<string, number>;
        const p0 = noB[m] as never as Record<string, number>;
        globalThis.__out.push('mois', m, 'monthIndex', p1.monthIndex);
        globalThis.__out.push('childBenefits withB', p1.childBenefits, 'noB', p0.childBenefits);
        globalThis.__out.push('DELTA childBenefits (registre affiche)', p1.childBenefits - p0.childBenefits);
        globalThis.__out.push('DELTA Income (flux caisse)          ', p1.Income - p0.Income);
        globalThis.__out.push('DELTA Expenses', p1.Expenses - p0.Expenses);
        globalThis.__out.push('DELTA NetWorth m=24', p1.NetWorth - p0.NetWorth);
        globalThis.__out.push('DELTA childCost', p1.childCost - p0.childCost, 'childGross', p1.childGross - p0.childGross);
        expect(true).toBe(true);
    });

    it('couts : childCost vs childGross vs Expenses sous divorce', () => {
        const div = run(DIV, [enfant(0)]);
        const nodiv = run({}, [enfant(0)]);
        const m = 24;
        const d = div[m] as never as Record<string, number>;
        const n = nodiv[m] as never as Record<string, number>;
        globalThis.__out.push('DIVORCE  childCost', d.childCost, 'childGross', d.childGross, 'Expenses', d.Expenses);
        globalThis.__out.push('SANS DIV childCost', n.childCost, 'childGross', n.childGross, 'Expenses', n.Expenses);
        expect(true).toBe(true);
    });

    it('etudes: payout REEE vs cout etudes sous divorce', () => {
        const uniChild = { ...enfant(0), birthDate: '2008-06-01', universityType: 'uni_local', reeeMonthly: 200 } as unknown as ChildGoal;
        const div = run(DIV, [uniChild]);
        const nodiv = run({}, [uniChild]);
        for (const m of [0, 12, 24, 30]) {
            const d = div[m] as never as Record<string, number>;
            const n = nodiv[m] as never as Record<string, number>;
            globalThis.__out.push(`m=${m} DIV  cost=${d.childCost} gross=${d.childGross} payout=${d.ReeePayout} contrib=${d.ReeeContrib} Income=${d.Income} Exp=${d.Expenses}`);
            globalThis.__out.push(`m=${m} NODIV cost=${n.childCost} gross=${n.childGross} payout=${n.ReeePayout} contrib=${n.ReeeContrib} Income=${n.Income} Exp=${n.Expenses}`);
        }
        expect(true).toBe(true);
    });
});
