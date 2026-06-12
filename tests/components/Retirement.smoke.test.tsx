// CA-04 — smoke test : Retirement (money-critical, aucun test direct jusqu'ici).
// Sans projection calculée → <ProjectionRequired> (pas de crash).
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Retirement } from '../../components/Retirement';
import type { RetirementGoal, ProjectionConfig, BudgetConfig, User } from '../../types';

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, BarChart: P, ComposedChart: P, PieChart: P, LineChart: P, AreaChart: P,
        Bar: () => null, Area: () => null, Line: () => null, Pie: () => null, Cell: () => null,
        Legend: () => null, ReferenceLine: () => null,
        XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
    };
});

const goal = { targetAge: 65, targetMonthlyIncome: 5000, governmentPension: 1500 } as unknown as RetirementGoal;
const proj = {
    years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
} as unknown as ProjectionConfig;
const config: BudgetConfig = {
    users: [
        { name: 'Marc', grossSalary: 7000, netSalary: 5000, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
        { name: 'Anna', grossSalary: 5500, netSalary: 4000, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
    ],
    splitMode: '50/50',
};

describe('Retirement — smoke (CA-04)', () => {
    it('rend sans crash', () => {
        const { container } = render(
            <Retirement goal={goal} currentREER={100000} currentCELI={50000} currentNonReg={20000}
                calculatedMonthlySavings={1000} projection={proj} config={config} />,
        );
        expect(container).toBeTruthy();
    });
});
