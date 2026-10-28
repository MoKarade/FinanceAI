// [COURS-AU-TROMPEUR] Le vrai écran Placements : un titre dont le dernier close date de plusieurs
// jours affiche sa DATE et aucune variation 24 h ; un titre au close du jour n'est pas signalé.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Investments } from '../../components/Investments';
import { CoursPerimesNotice } from '../../components/investments/CoursPerimesNotice';
import type { Asset, ProjectionConfig, BudgetConfig, User } from '../../types';

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, PieChart: P, BarChart: P, LineChart: P, AreaChart: P, ComposedChart: P,
        Pie: () => null, Bar: () => null, Area: () => null, Line: () => null, Cell: () => null,
        Legend: () => null, ReferenceLine: () => null,
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

const titre = (symbol: string, priceHistory: Asset['priceHistory']): Asset => ({
    symbol, name: symbol, quantity: 10, currentPrice: 100, currency: 'CAD', performance: 0,
    dateBought: '2025-01-01', accountType: 'CELI', priceHistory,
} as Asset);

const monter = (assets: Asset[]) => render(
    <Investments
        assets={assets} setAssets={vi.fn()}
        investmentAccounts={[]} setInvestmentAccounts={vi.fn()}
        investmentTransactions={[]} setInvestmentTransactions={vi.fn()}
        apiKey="" transactions={[]} budgetItems={[]}
        config={config} projection={proj} setProjection={vi.fn()}
    />,
);

describe('Investments — âge réel des cours', () => {
    beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 16, 12, 0, 0)); });
    afterEach(() => { vi.useRealTimers(); });

    it('un titre au cours vieux de plusieurs jours est signalé avec sa date', () => {
        monter([titre('VIEUX', [{ date: '2026-10-01', price: 98 }, { date: '2026-10-02', price: 100 }])]);
        const note = screen.getByText(/Cours périmé/);
        expect(note.getAttribute('role')).toBe('status');
        expect(note.textContent).toContain('VIEUX');
        expect(note.textContent).toContain('2 octobre 2026');
        expect(note.textContent).toContain('24 h');
    });

    it('un titre au close du jour n’est pas signalé', () => {
        monter([titre('FRAIS', [{ date: '2026-10-15', price: 98 }, { date: '2026-10-16', price: 100 }])]);
        expect(screen.queryByText(/Cours périmé/)).toBeNull();
    });
});

describe('CoursPerimesNotice', () => {
    it('ne rend rien sans titre périmé', () => {
        const { container } = render(<CoursPerimesNotice titres={[]} />);
        expect(container.innerHTML).toBe('');
    });

    it('accorde le libellé et liste chaque titre avec sa date', () => {
        render(<CoursPerimesNotice titres={[{ symbol: 'A', date: '2026-10-01' }, { symbol: 'B', date: '2026-10-02' }]} />);
        const note = screen.getByRole('status');
        expect(note.textContent).toContain('Cours périmés');
        expect(note.textContent).toContain('A (cours du 1 octobre 2026)');
        expect(note.textContent).toContain('B (cours du 2 octobre 2026)');
    });
});
