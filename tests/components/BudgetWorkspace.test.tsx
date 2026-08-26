/**
 * [REFONTE-NAV-L5] — BudgetWorkspace, la page de la destination Transactions > Budget.
 *
 * Verrouille :
 *   - l'en-tête de PAGE : h1 = TAB_LABELS[Tab.BUDGET] (cohérence des destinations — le seul
 *     h1 de la page, quel que soit le sous-onglet actif ; Budget n'en rend plus),
 *   - les quatre sous-onglets (Budget / Charges fixes & Abos / Objectifs / Santé),
 *   - la consommation du deep-link `pendingFocus` (« Voir les transactions » inverse :
 *     Transactions → `poste:<nom>` atterrit sur le sous-onglet Budget ; une section
 *     `objectifs` ouvre Objectifs — DISCRIMINANT car le défaut est Budget).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BudgetWorkspace } from '../../components/budget/BudgetWorkspace';
import { useFinanceStore } from '../../store/useFinanceStore';
import { TAB_LABELS } from '../../constants';
import { formatCAD } from '../../utils/format';
import { Tab, type BudgetConfig, type User, type BudgetCategory, type SavingsGoal, type Transaction } from '../../types';

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
    savingsGoals: [],
    setSavingsGoals: vi.fn(),
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

    it('rend les quatre sous-onglets, Budget sélectionné par défaut', () => {
        render(<BudgetWorkspace {...baseProps} />);
        const tabs = screen.getAllByRole('tab');
        expect(tabs.map(t => t.textContent)).toEqual(['Budget', 'Charges fixes & Abos', 'Objectifs', 'Santé']);
        expect(screen.getByRole('tab', { name: 'Budget' }).getAttribute('aria-selected')).toBe('true');
    });
});

describe('[REFONTE-NAV-L5] BudgetWorkspace — deep-link pendingFocus', () => {
    it('section `objectifs` → atterrit sur le sous-onglet Objectifs (discriminant : défaut = Budget)', () => {
        useFinanceStore.setState({
            pendingFocus: { tab: Tab.BUDGET, section: 'objectifs', expiresAt: Date.now() + 5000 },
        });
        render(<BudgetWorkspace {...baseProps} />);
        expect(screen.getByRole('tab', { name: 'Objectifs' }).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByRole('tab', { name: 'Budget' }).getAttribute('aria-selected')).toBe('false');
        // one-shot : le focus est consommé
        expect(useFinanceStore.getState().pendingFocus).toBeNull();
    });

    it('section `poste:<nom>` → sous-onglet Budget (les postes vivent là) + focus consommé', () => {
        useFinanceStore.setState({
            pendingFocus: { tab: Tab.BUDGET, section: 'poste:Loyer', expiresAt: Date.now() + 5000 },
        });
        render(<BudgetWorkspace {...baseProps} />);
        expect(screen.getByRole('tab', { name: 'Budget' }).getAttribute('aria-selected')).toBe('true');
        expect(useFinanceStore.getState().pendingFocus).toBeNull();
    });

    it('un focus EXPIRÉ est ignoré (défaut Budget) et nettoyé', () => {
        useFinanceStore.setState({
            pendingFocus: { tab: Tab.BUDGET, section: 'objectifs', expiresAt: Date.now() - 1 },
        });
        render(<BudgetWorkspace {...baseProps} />);
        expect(screen.getByRole('tab', { name: 'Budget' }).getAttribute('aria-selected')).toBe('true');
        expect(useFinanceStore.getState().pendingFocus).toBeNull();
    });
});

// [BUDGET-TRANSACTIONS-SYNC-AUDIT] `monthStr` utilisait `.toISOString().substring(0, 7)` (ancrage
// UTC) : sous un fuseau NÉGATIF, les dernières heures locales de chaque mois basculaient déjà sur
// le mois suivant en UTC, donc `monthlyActualsMap` filtrait sur un mois SANS transaction → « versé
// ce mois » d'un objectif lié affichait 0 $ pendant ~4 h/mois. Seul site encore sur `.toISOString()`
// pour cette classe de bug (Budget.tsx et HealthIndicator.tsx sont déjà passés aux composantes
// locales). Discriminant : revenir à `.toISOString().substring(0, 7)` fait échouer ce test (0 $
// affiché au lieu de 100 $) — vérifié par perturbation ciblée sur cette seule ligne.
describe('[BUDGET-TRANSACTIONS-SYNC-AUDIT] "versé ce mois" vs fuseau horaire NÉGATIF', () => {
    const originalTz = process.env.TZ;
    afterEach(() => {
        vi.useRealTimers();
        if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz;
    });

    it('le dernier jour du mois en soirée (heure locale) compte encore les dépenses DE CE MOIS, pas du mois suivant', () => {
        process.env.TZ = 'America/Toronto'; // UTC-4 en août (heure d'été)
        vi.useFakeTimers();
        // 31 août 2026, 21 h locale → 01 h UTC le 1er septembre : `.toISOString()` bascule déjà
        // sur septembre alors qu'on est encore le 31 août à Toronto.
        vi.setSystemTime(new Date(2026, 7, 31, 21, 0));

        const budgetItems: BudgetCategory[] = [
            { id: 'b1', name: 'Épicerie', target: 400, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
        ];
        const transactions: Transaction[] = [
            { id: 1, date: '2026-08-15', payee: 'IGA', amount: -100, category: 'Épicerie', status: 'processed' } as unknown as Transaction,
        ];
        const savingsGoals: SavingsGoal[] = [
            { id: 'g1', name: 'Coussin épicerie', targetAmount: 1000, currentAmount: 200, deadline: '2027-01-01', icon: 'goal', linkedBudgetCategoryName: 'Épicerie' },
        ];

        useFinanceStore.setState({
            pendingFocus: { tab: Tab.BUDGET, section: 'objectifs', expiresAt: Date.now() + 5000 },
        });
        render(
            <BudgetWorkspace
                {...baseProps}
                budgetItems={budgetItems}
                transactions={transactions}
                savingsGoals={savingsGoals}
            />
        );
        expect(screen.getByText(/Versé ce mois/)).toBeInTheDocument();
        // 100 $, pas 0 $ : la dépense du 15 août doit compter pour le mois d'AOÛT, encore en cours
        // à 21 h locale le 31, même si l'horloge UTC a déjà basculé sur septembre. Espace insécable
        // de `formatCAD` normalisé en espace simple (texte DOM normalisé par le navigateur).
        expect(screen.getByText(formatCAD(100).replace(/[  ]/g, ' '))).toBeInTheDocument();
    });
});
