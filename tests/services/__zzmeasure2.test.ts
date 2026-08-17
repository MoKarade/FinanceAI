import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';
const OUT: unknown[] = [];
const log = (...a: unknown[]) => OUT.push(a.join(' '));
afterAll(() => writeFileSync('/tmp/claude-0/-home-user/f5da6341-023a-54e5-b9d9-cede963d32fd/scratchpad/out2.txt', OUT.join('\n')));
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionChartPoint } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User, ChildGoal } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const users = (age: number): User[] => ([
    { name: 'Marc', grossSalary: 8_200, netSalary: 5_620, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 7_100, netSalary: 4_995, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const params = (proj: Partial<ProjectionConfig>, children: ChildGoal[], reee = 0): SimulationParams => ({
    projection: {
        years: 8, returnRate: 0, inflationRate: 0, savingsMode: 'manual', manualContribution: 0,
        usePortfolioRate: false, returnRates: { celi: 0, reer: 0, nonReg: 0, crypto: 0, cash: 0 },
        emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 0, ...proj,
    } as ProjectionConfig,
    calculatedStartingCash: 200_000,
    liveCSVBalances: { CELI: 50_000, CELIAPP: 0, REER: 90_000, NON_ENREG: 40_000, CRYPTO: 0, REEE: reee },
    realEstateGoals: [], debts: [], childGoals: children, travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 1_500, lifeExpectancy: 92, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: { users: users(40), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 1_800,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

const run = (proj: Partial<ProjectionConfig>, children: ChildGoal[], reee = 0): ProjectionChartPoint[] => {
    const r = __runScenarioForTests(
        params(proj, children, reee), 'AUTO_MARGINAL' as AllocationStrategy, true, false, 0, 'BASE', {},
        { verboseMonthlyPoints: true },
    ) as unknown as { chartData: ProjectionChartPoint[] };
    return r.chartData;
};
const DIV = { divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 };

describe('MESURE 2', () => {
    it('RQAP fantome apres divorce (enfant ne APRES le divorce)', () => {
        const bebe = { id: 'b', name: 'Bebe', isActive: true, birthDate: '2026-07-01',
            initialCost: 0, monthlyDiapers: 0, monthlyFood: 0, monthlyClothing: 0, daycareType: 'cpe',
            activitiesLevel: 'aucune', universityType: 'aucune', carGift: 'non', reeeMonthly: 0,
            governmentBenefits: 0 } as unknown as ChildGoal;
        const div = run(DIV, [bebe]);
        const nodiv = run({}, [bebe]);
        for (const m of [3, 6, 7, 12, 18]) {
            const d = div[m] as never as Record<string, number>;
            const n = nodiv[m] as never as Record<string, number>;
            log(`m=${m} DIV   IncomeAnna=${d.IncomeAnna} IncomeMarc=${d.IncomeMarc} Income=${d.Income}`);
            log(`m=${m} NODIV IncomeAnna=${n.IncomeAnna} IncomeMarc=${n.IncomeMarc} Income=${n.Income}`);
        }
    });

    it('etudes : cout partage 50/50 mais decaissement REEE entier', () => {
        const ado = { id: 'u', name: 'Ado', isActive: true, birthDate: '2008-02-01',
            initialCost: 0, monthlyDiapers: 0, monthlyFood: 0, monthlyClothing: 0, daycareType: 'cpe',
            activitiesLevel: 'aucune', universityType: 'uni_etranger', carGift: 'non', reeeMonthly: 0,
            governmentBenefits: 0 } as unknown as ChildGoal;
        const div = run(DIV, [ado], 120_000);
        const nodiv = run({}, [ado], 120_000);
        for (const m of [0, 6, 12, 24, 36]) {
            const d = div[m] as never as Record<string, number>;
            const n = nodiv[m] as never as Record<string, number>;
            log(`m=${m} DIV   gross=${d.childGross} cost=${d.childCost} payout=${d.ReeePayout} Income=${d.Income} Exp=${d.Expenses} REEE=${d.REEE}`);
            log(`m=${m} NODIV gross=${n.childGross} cost=${n.childCost} payout=${n.ReeePayout} Income=${n.Income} Exp=${n.Expenses} REEE=${n.REEE}`);
        }
        expect(true).toBe(true);
    });
});
