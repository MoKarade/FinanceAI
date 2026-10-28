// CA-04 — smoke test : FutureProjection (money-critical, ~1000 l, aucun test direct jusqu'ici).
// Sans projection révélée → écran d'amorçage « Calculer » (pas de crash).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { FutureProjection } from '../../components/FutureProjection';
// [REFONTE-NAV-L6a] La page Futur PUBLIE son contexte d'écran pour l'assistant.
import { getViewContext, _resetViewContextForTests } from '../../services/aiChat/viewContext';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, PieChart: P, BarChart: P, LineChart: P, AreaChart: P, ComposedChart: P,
        Pie: () => null, Bar: () => null, Area: () => null, Line: () => null, Cell: () => null,
        Legend: () => null, ReferenceLine: () => null, ReferenceArea: () => null, ReferenceDot: () => null,
        XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
    };
});

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
const retirementGoal = { targetAge: 65, targetMonthlyIncome: 5000, governmentPension: 1500 } as unknown as RetirementGoal;

describe('FutureProjection — smoke (CA-04)', () => {
    beforeEach(() => _resetViewContextForTests());

    it('rend l\'écran d\'amorçage sans crash', () => {
        const { container } = render(
            <FutureProjection
                initialBalances={{}} transactions={[]} budgetItems={[]} config={config}
                realEstateGoals={[]} retirementGoal={retirementGoal} calculatedMonthlySavings={1000}
                projection={proj} setProjection={vi.fn()}
            />,
        );
        expect(container).toBeTruthy();
    });

    it('[REFONTE-NAV-L6a] sans courbe visible → publie le contexte « future » SANS projection (aveu honnête)', () => {
        const { unmount } = render(
            <FutureProjection
                initialBalances={{}} transactions={[]} budgetItems={[]} config={config}
                realEstateGoals={[]} retirementGoal={retirementGoal} calculatedMonthlySavings={1000}
                projection={proj} setProjection={vi.fn()}
            />,
        );
        expect(getViewContext()?.scope).toBe('future');
        expect(getViewContext()?.detail).toEqual({ kind: 'future', hasProjection: false });
        unmount(); // cleanup scope-guardé : la page démontée n'abandonne pas un contexte périmé
        expect(getViewContext()).toBeNull();
    });
});
