import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Dashboard } from '../../components/Dashboard';
import type { Transaction, RetirementGoal, BudgetConfig } from '../../types';

vi.mock('../../services/finance', () => ({
    fetchPortfolioHistory: vi.fn().mockResolvedValue([]),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'fr' } }),
}));
vi.mock('recharts', async () => {
    const React = await import('react');
    return {
        AreaChart: ({ children }: { children: React.ReactNode }) => React.createElement('div', { 'data-testid': 'chart' }, children),
        Area: () => null,
        XAxis: () => null,
        YAxis: () => null,
        CartesianGrid: () => null,
        Tooltip: () => null,
        ResponsiveContainer: ({ children }: { children: React.ReactNode }) => React.createElement('div', { 'data-testid': 'responsive-container' }, children),
        Legend: () => null,
        Brush: () => null,
    };
});

const defaultGoal: RetirementGoal = {
    targetAge: 60,
    targetMonthlyIncome: 5000,
    governmentPension: 1200,
};

const defaultConfig: BudgetConfig = {
    users: [
        { name: 'Marc', monthlyGross: 7000, rrspContribution: 0, fhsaContribution: 0, birthYear: 1990, canadaArrivalYear: 2009 } as any,
        { name: 'Anna', monthlyGross: 5000, rrspContribution: 0, fhsaContribution: 0, birthYear: 1992, canadaArrivalYear: 2009 } as any,
    ],
    splitMode: '50/50',
};

const baseProps = {
    transactions: [],
    assets: [],
    initialBalances: {},
    budgetItems: [],
    realEstateGoals: [],
    travelGoals: [],
    lifeEvents: [],
    retirementGoal: defaultGoal,
    config: defaultConfig,
};

describe('Dashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('se rend sans erreur avec des props vides', () => {
        const { container } = render(<Dashboard {...baseProps} />);
        expect(container.firstChild).toBeTruthy();
    });

    it('Phase C2: affiche le PageHeader + les 4 KPI du hero', () => {
        const { container } = render(<Dashboard {...baseProps} />);
        // useTranslation est mocké → on vérifie les clés i18n présentes.
        const text = container.textContent || '';
        expect(text).toContain('dashboard.title');
        expect(text).toContain('dashboard.global_net_worth');
        expect(text).toContain('dashboard.global_variation');
        expect(text).toContain('dashboard.passive_income_month');
        expect(text).toContain('dashboard.future_predictor');
    });

    it('Phase B2: l\'Indicateur Futur expose un bouton clickable vers FutureProjection', () => {
        const { container } = render(<Dashboard {...baseProps} />);
        // Le bouton "🎯 →" est dans le KPI custom
        const buttons = container.querySelectorAll('button');
        const focusBtn = Array.from(buttons).find(b => b.getAttribute('aria-label')?.includes('FutureProjection'));
        expect(focusBtn).toBeTruthy();
    });

    it('en mode privacyMode=true, se rend sans crash', () => {
        const { container } = render(<Dashboard {...baseProps} isPrivacyMode={true} />);
        expect(container.firstChild).toBeTruthy();
    });

    it('se rend sans crash avec des transactions fournies', () => {
        const txs: Transaction[] = [
            {
                id: -1,
                date: '2026-01-15',
                payee: 'Epicerie Métro',
                amount: -45.99,
                category: 'Alimentation',
                accountName: 'Desjardins',
                status: 'processed',
                isTransfer: false,
                isDuplicate: false,
            },
            {
                id: -2,
                date: '2026-01-20',
                payee: 'Hydro Québec',
                amount: -120.00,
                category: 'Services',
                accountName: 'Desjardins',
                status: 'processed',
                isTransfer: false,
                isDuplicate: false,
            },
        ];
        const { container } = render(<Dashboard {...baseProps} transactions={txs} />);
        expect(container.firstChild).toBeTruthy();
        expect(document.body.textContent).toContain('$');
    });

    it('se rend sans crash quand onNavigate est fourni', () => {
        const onNavigate = vi.fn();
        const { container } = render(<Dashboard {...baseProps} onNavigate={onNavigate} />);
        expect(container.firstChild).toBeTruthy();
    });

    it('ignore les transactions dupliquées sans crash (isDuplicate=true)', () => {
        const txsWithDuplicate: Transaction[] = [
            { id: -1, date: '2026-01-15', payee: 'Metro', amount: -50, category: 'Alimentation', accountName: 'Desjardins', status: 'processed', isTransfer: false, isDuplicate: false },
            { id: -2, date: '2026-01-15', payee: 'Metro', amount: -50, category: 'Alimentation', accountName: 'Desjardins', status: 'processed', isTransfer: false, isDuplicate: true },
        ];
        const { container } = render(<Dashboard {...baseProps} transactions={txsWithDuplicate} />);
        expect(container.firstChild).toBeTruthy();
    });
});
