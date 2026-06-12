// CA-04 — smoke test : ChildPlanning (money-critical, aucun test direct jusqu'ici).
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ChildPlanning } from '../../components/ChildPlanning';
import type { ProjectionConfig } from '../../types';

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, BarChart: P, ComposedChart: P,
        Bar: () => null, Area: () => null, Legend: () => null, ReferenceLine: () => null,
        XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
    };
});

const proj = {
    years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
} as unknown as ProjectionConfig;

describe('ChildPlanning — smoke (CA-04)', () => {
    it('rend sans crash avec aucun objectif', () => {
        const { container } = render(<ChildPlanning goals={[]} setGoals={vi.fn()} projection={proj} currentRESP={0} />);
        expect(container).toBeTruthy();
    });
});
