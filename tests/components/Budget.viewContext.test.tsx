// tests/components/Budget.viewContext.test.tsx
//
// [CHAT-PAGE-CONTEXT] « Jamais un 3e chiffre » : le détail publié par Budget pour le chat doit être
// EXACTEMENT ce que les helpers CANONIQUES calculent pour l'écran (computeBudgetParity pour les
// dépenses, computeIncomeBreakdown pour les revenus) — pas une reconstruction voisine (classes
// PH4D-BUDGET-RATIOS / BUDGET-INCOME-REAL). Et la NAVIGATION de période met à jour le contexte
// publié (classe BUDGET-MONTH-NAV : un memo à deps incomplètes le figerait).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { Budget } from '../../components/Budget';
import { getViewContext, _resetViewContextForTests } from '../../services/aiChat/viewContext';
import { computeBudgetParity } from '../../utils/budget';
import { computeIncomeBreakdown } from '../../utils/budgetSync';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { BudgetConfig, BudgetCategory, User, Transaction } from '../../types';

vi.mock('recharts', async () => {
    const React = await import('react');
    const Passthrough = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: Passthrough, PieChart: Passthrough, Pie: () => null, Cell: () => null,
        Tooltip: () => null, Legend: () => null, BarChart: Passthrough, Bar: () => null,
        XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, ReferenceLine: () => null,
        LineChart: Passthrough, Line: () => null,
    };
});

const config: BudgetConfig = {
    users: [
        { name: 'Marc', grossSalary: 7000, netSalary: 5000, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
        { name: '', grossSalary: 0, netSalary: 0, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
    ],
    splitMode: '50/50',
};

const budgetItems: BudgetCategory[] = [
    { id: 'cat1', name: 'Épicerie', target: 600, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
    { id: 'cat2', name: 'Restaurants', target: 200, frequency: 'Monthly', type: 'Commun', nature: 'Envie' },
];

const iso = (d: Date): string => d.toISOString().split('T')[0];
const now = new Date();
const inCurrentMonth = iso(new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate(), 15)));
const inPreviousMonth = iso(new Date(now.getFullYear(), now.getMonth() - 1, 10));

const tx = (id: string, date: string, amount: number, category: string): Transaction =>
    ({ id, date, amount, category, payee: `p-${id}`, account: 'chq' } as unknown as Transaction);

const transactions: Transaction[] = [
    tx('t1', inCurrentMonth, -120.5, 'Épicerie'),
    tx('t2', inCurrentMonth, -60, 'Restaurants'),
    tx('t3', inCurrentMonth, 2500, 'Salaire'),
    tx('t4', inPreviousMonth, -250, 'Épicerie'),
    tx('t5', inPreviousMonth, 1800, 'Salaire'),
];

const props = { transactions, config, budgetItems, setBudgetItems: () => {}, apiKey: '' };

beforeEach(() => {
    _resetViewContextForTests();
    useFinanceStore.setState({ isPrivacyMode: false } as never);
});

describe('Budget — publication du contexte d\'écran', () => {
    it('PARITÉ CANONIQUE : totalSpent/totalRealIncome publiés == helpers de l\'écran (jamais un 3e chiffre)', () => {
        render(<Budget {...props} />);
        const detail = getViewContext()?.detail;
        expect(detail?.kind).toBe('budget');

        // Valeurs attendues calculées DIRECTEMENT par les helpers canoniques sur le mois courant
        // (même filtre que le memo de l'écran : dépenses négatives, ni transfert ni doublon).
        const monthTx = transactions.filter((t) => t.date >= iso(new Date(now.getFullYear(), now.getMonth(), 1)));
        const spendTx = monthTx.filter((t) => t.amount < 0);
        const allSpend = transactions.filter((t) => t.amount < 0);
        const expectedParity = computeBudgetParity(spendTx, budgetItems, allSpend);
        const expectedIncome = computeIncomeBreakdown(monthTx);

        expect(detail?.totalSpent).toBe(expectedParity.totalSpent);
        expect(detail?.totalRealIncome).toBe(expectedIncome.total);
        expect(detail?.topCategories[0]).toEqual({ name: 'Épicerie', spent: 120.5 });
    });

    it('NAVIGATION : « Période précédente » republie le contexte du mois navigué (pas figé)', () => {
        render(<Budget {...props} />);
        const before = getViewContext()?.detail;
        fireEvent.click(screen.getByLabelText('Période précédente'));
        const after = getViewContext()?.detail;
        expect(after?.periodLabel).not.toBe(before?.periodLabel);
        // Le mois précédent n'a qu'une dépense de 250 $ (Épicerie) — le contexte suit l'écran.
        expect(after?.totalSpent).toBe(250);
        expect(after?.totalRealIncome).toBe(1800);
    });

    it('la cible publiée == somme des cibles affichées (600 + 200 en vue mois)', () => {
        render(<Budget {...props} />);
        expect(getViewContext()?.detail.totalBudgetTarget).toBe(800);
    });

    it('[Vague 1.5] les CARTES de la page sont publiées avec leur provenance (ventilation revenus, statut)', () => {
        render(<Budget {...props} />);
        const cards = getViewContext()?.detail.cards ?? [];
        const labels = cards.map((c) => c.label);
        expect(labels).toContain('Revenus (ventilation)');
        expect(labels).toContain('Statut du budget');
        expect(labels).toContain('Fin de mois (projection)'); // mois courant (periodOffset 0)
        // Sans lastProjection dans le store : PAS de carte Impact à long terme fabriquée (no-fake-data).
        expect(labels).not.toContain('Impact à long terme');
        const ventilation = cards.find((c) => c.label === 'Revenus (ventilation)')!;
        expect(ventilation.value).toContain('Salaire'); // valeur telle qu'affichée (formatCAD de la page)
        expect(ventilation.note).toContain('pas le salaire déclaré'); // provenance explicite
    });
});
