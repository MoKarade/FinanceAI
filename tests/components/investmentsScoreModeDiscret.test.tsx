// tests/components/investmentsScoreModeDiscret.test.tsx
//
// [PRIVACY-GARDE-DUREES-SCORES-BARRES] La garde de source (`amountPrivacyScan`) a relevé que le badge
// « Diversification NN/100 » d'Investissements sortait en clair en mode discret : un score dérivé du
// portefeuille, que la décision du 2026-09-29 range avec les montants. Ce test pose le TÉMOIN hors mode
// discret (sans lui, « le score est absent » ne distinguerait pas « masqué » de « jamais rendu »).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { Investments } from '../../components/Investments';
import { useFinanceStore } from '../../store/useFinanceStore';
import { MASKED_AMOUNT_LABEL } from '../../utils/privacyAria';
import type { ProjectionConfig, BudgetConfig, User } from '../../types';

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

const actifs = [
    { id: 'a1', symbol: 'XEQT', name: 'XEQT', sector: 'Index', region: 'world', accountType: 'CELI', currency: 'CAD', quantity: 10, currentPrice: 100, buyPrice: 90, dateBought: '2025-01-01', priceHistory: [] },
] as never;

const rendre = () => render(
    <Investments
        assets={actifs} setAssets={vi.fn()}
        investmentAccounts={[]} setInvestmentAccounts={vi.fn()}
        investmentTransactions={[]} setInvestmentTransactions={vi.fn()}
        apiKey="" transactions={[]} budgetItems={[]}
        config={config} projection={proj} setProjection={vi.fn()}
    />,
);

afterEach(() => {
    act(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
});

describe('Investments — le badge « Diversification NN/100 » suit le mode discret', () => {
    it('hors mode discret : le score est lu (témoin)', () => {
        const { container } = rendre();
        expect(container.textContent ?? '').toMatch(/Diversification\s*\d+\/100/);
    });

    it('mode discret : le badge garde son libellé, le score devient « Montant masqué »', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        const { container } = rendre();
        const texte = container.textContent ?? '';
        expect(texte).not.toMatch(/Diversification\s*\d+\/100/);
        expect(texte).toContain(`Diversification •••${MASKED_AMOUNT_LABEL}/100`);
    });
});
