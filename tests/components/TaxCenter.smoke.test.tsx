// CA-04 — smoke test : TaxCenter (money-critical fiscal, aucun test direct jusqu'ici).
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TaxCenter } from '../../components/TaxCenter';
import type { BudgetConfig, User } from '../../types';

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, BarChart: P, ComposedChart: P, PieChart: P, LineChart: P,
        Bar: () => null, Area: () => null, Line: () => null, Pie: () => null, Cell: () => null,
        Legend: () => null, ReferenceLine: () => null,
        XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
    };
});

const config: BudgetConfig = {
    users: [
        { name: 'Marc', grossSalary: 7000, netSalary: 5000, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
        { name: 'Anna', grossSalary: 5500, netSalary: 4000, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
    ],
    splitMode: '50/50',
};

describe('TaxCenter — smoke (CA-04)', () => {
    it('rend sans crash avec un utilisateur', () => {
        const { container } = render(<TaxCenter config={config} assets={[]} />);
        expect(container).toBeTruthy();
    });
});
