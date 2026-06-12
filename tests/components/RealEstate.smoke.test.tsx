// CA-04 — smoke test : RealEstate (money-critical, aucun test direct jusqu'ici).
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { RealEstate } from '../../components/RealEstate';

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

describe('RealEstate — smoke (CA-04)', () => {
    it('rend sans crash sans objectif immobilier', () => {
        const { container } = render(<RealEstate availableCash={50000} goals={[]} setGoals={vi.fn()} />);
        expect(container).toBeTruthy();
    });
});
