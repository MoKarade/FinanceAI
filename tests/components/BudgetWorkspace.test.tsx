/**
 * [REFONTE-NAV-L5] — BudgetWorkspace, la page de la destination Transactions > Budget.
 *
 * Verrouille :
 *   - l'en-tête de PAGE : h1 = TAB_LABELS[Tab.BUDGET] (cohérence des destinations — le seul
 *     h1 de la page, quel que soit le sous-onglet actif ; Budget n'en rend plus),
 *   - les trois sous-onglets (Budget / Charges fixes & Abos / Santé — [NAV-REMOVE-OBJECTIFS-TAB]
 *     a retiré « Objectifs » du produit, décision Marc 2026-08-27),
 *   - la consommation du deep-link `pendingFocus` (« Voir les transactions » inverse :
 *     Transactions → `poste:<nom>` atterrit sur le sous-onglet Budget).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BudgetWorkspace } from '../../components/budget/BudgetWorkspace';
import { useFinanceStore } from '../../store/useFinanceStore';
import { TAB_LABELS } from '../../constants';
import { Tab, type BudgetConfig, type User } from '../../types';

// Mock recharts (jsdom n'a pas de dimensions SVG) — même patron que Budget.test.tsx.
vi.mock('recharts', async () => {
    const React = await import('react');
    const Passthrough = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: Passthrough,
        PieChart: Passthrough,
        Pie: () => null,
        Cell: () => null,
        Tooltip: () => null,
        Legend: () => null,
        BarChart: Passthrough,
        Bar: () => null,
        XAxis: () => null,
        YAxis: () => null,
        CartesianGrid: () => null,
        ReferenceLine: () => null,
        LineChart: Passthrough,
        Line: () => null,
    };
});
// services/claude importe le SDK Anthropic — jamais appelé ici, mais mocké au montage.
vi.mock('../../services/claude', () => ({
    categorizeBatch: vi.fn(),
    detectSubscriptionsAI: vi.fn(),
}));
vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

const config: BudgetConfig = {
    users: [
        { name: 'Marc', grossSalary: 7000, netSalary: 5000, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false } as unknown as User,
        { name: '', grossSalary: 0, netSalary: 0, color: '#3b82f6', age: 0, birthYear: 0, canadaArrivalYear: 0, hasOwnedPropertyLast4Years: false } as unknown as User,
    ],
    splitMode: '50/50',
};

const baseProps = {
    transactions: [],
    config,
    budgetItems: [],
    setBudgetItems: vi.fn(),
    apiKey: '',
};

beforeEach(() => {
    // jsdom n'implémente pas scrollIntoView (usePendingFocus scrolle vers l'ancre).
    Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
    useFinanceStore.setState({ pendingFocus: null });
});

describe('[REFONTE-NAV-L5] BudgetWorkspace — en-tête de page et sous-onglets', () => {
    it('rend UN h1 dont le titre = TAB_LABELS[Tab.BUDGET]', () => {
        const { container } = render(<BudgetWorkspace {...baseProps} />);
        const h1s = container.querySelectorAll('h1');
        expect(h1s.length).toBe(1);
        expect(h1s[0].textContent).toBe(TAB_LABELS[Tab.BUDGET]);
    });

    it('rend les trois sous-onglets, Budget sélectionné par défaut', () => {
        render(<BudgetWorkspace {...baseProps} />);
        const tabs = screen.getAllByRole('tab');
        expect(tabs.map(t => t.textContent)).toEqual(['Budget', 'Charges fixes & Abos', 'Santé']);
        expect(screen.getByRole('tab', { name: 'Budget' }).getAttribute('aria-selected')).toBe('true');
    });
});

describe('[REFONTE-NAV-L5] BudgetWorkspace — deep-link pendingFocus', () => {
    it('section `poste:<nom>` → sous-onglet Budget (les postes vivent là) + focus consommé', () => {
        useFinanceStore.setState({
            pendingFocus: { tab: Tab.BUDGET, section: 'poste:Loyer', expiresAt: Date.now() + 5000 },
        });
        render(<BudgetWorkspace {...baseProps} />);
        expect(screen.getByRole('tab', { name: 'Budget' }).getAttribute('aria-selected')).toBe('true');
        expect(useFinanceStore.getState().pendingFocus).toBeNull();
    });

    it('section `sante` → atterrit sur le sous-onglet Santé (discriminant : défaut = Budget)', () => {
        useFinanceStore.setState({
            pendingFocus: { tab: Tab.BUDGET, section: 'sante', expiresAt: Date.now() + 5000 },
        });
        render(<BudgetWorkspace {...baseProps} />);
        expect(screen.getByRole('tab', { name: 'Santé' }).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByRole('tab', { name: 'Budget' }).getAttribute('aria-selected')).toBe('false');
        // one-shot : le focus est consommé
        expect(useFinanceStore.getState().pendingFocus).toBeNull();
    });

    it('un focus EXPIRÉ est ignoré (défaut Budget) et nettoyé', () => {
        useFinanceStore.setState({
            pendingFocus: { tab: Tab.BUDGET, section: 'sante', expiresAt: Date.now() - 1 },
        });
        render(<BudgetWorkspace {...baseProps} />);
        expect(screen.getByRole('tab', { name: 'Budget' }).getAttribute('aria-selected')).toBe('true');
        expect(useFinanceStore.getState().pendingFocus).toBeNull();
    });
});
