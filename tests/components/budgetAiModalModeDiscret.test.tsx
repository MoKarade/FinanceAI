// tests/components/budgetAiModalModeDiscret.test.tsx
//
// [PRIVACY-CONTEXTE-IA] Décision Marc 2026-09-05 : MASQUER — en mode discret, les montants ne partent
// pas non plus vers l'assistant. Le chat l'avait déjà (publisher purgé + chokepoint d'envoi, finding
// #490) ; le diagnostic Budget, lui, construisait un prompt aux montants en clair (`MONTANT-HORS-ECRAN`)
// et l'envoyait, mode discret ou pas. Deux gardes, deux étages, prouvées SÉPARÉMENT :
//   · l'égress (le modal n'appelle pas `chatStream`) — la garde qui vit au SERVICE ;
//   · l'ouvreur (le bouton refuse avec un toast) — l'UX, qui dit pourquoi.
// Chacune a son contrôle (mode normal → le diagnostic part), sans quoi « pas appelé » serait aussi
// vrai d'un espion jamais câblé.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { BudgetAiModal, MESSAGE_DIAGNOSTIC_MODE_DISCRET, type BudgetAiPayload } from '../../components/budget/BudgetAiModal';
import { Budget } from '../../components/Budget';
import { useFinanceStore } from '../../store/useFinanceStore';
import { showToast } from '../../components/ui/Toast';
import type { BudgetConfig, BudgetCategory, User } from '../../types';

const chatStream = vi.fn((..._args: unknown[]) => (async function* () { yield JSON.stringify(['Réduis l’épicerie.', 'Bloque 200 $.', 'Revois les abonnements.']); })());
vi.mock('../../services/claude', async () => {
    const reel = await vi.importActual<typeof import('../../services/claude')>('../../services/claude');
    return { ...reel, MODEL_HAIKU: 'claude-haiku-test', chatStream: (...args: unknown[]) => chatStream(...args) };
});
vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));
vi.mock('recharts', async () => {
    const R = await import('react');
    const Passthrough = ({ children }: { children?: React.ReactNode }) => R.createElement('div', null, children);
    return { ResponsiveContainer: Passthrough, PieChart: Passthrough, Pie: () => null, Cell: () => null, Tooltip: () => null, Legend: () => null, BarChart: Passthrough, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, ReferenceLine: () => null, LineChart: Passthrough, Line: () => null };
});

const payload: BudgetAiPayload = {
    totalNetIncome: 5000, totalBudget: 4000, totalSpent: 3800, alerts: [],
    categories: [{ name: 'Épicerie', nature: 'Besoin', target: 800, spent: 910 }],
};
const config: BudgetConfig = {
    users: [
        { name: 'Marc', grossSalary: 7000, netSalary: 5000, color: '#10b981', age: 35, birthYear: 1991 } as unknown as User,
        { name: 'Anna', grossSalary: 5500, netSalary: 4000, color: '#3b82f6', age: 33, birthYear: 1993 } as unknown as User,
    ],
    splitMode: '50/50',
};
const budgetItems: BudgetCategory[] = [
    { id: 'cat1', name: 'Loyer', target: 1500, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
];
const setDiscret = (v: boolean) => act(() => { useFinanceStore.setState({ isPrivacyMode: v } as never); });

afterEach(() => {
    cleanup();
    chatStream.mockClear();
    vi.mocked(showToast).mockClear();
    // `isPrivacyMode` est un état de MODULE : sans remise à zéro, un cas contamine le suivant.
    setDiscret(false);
});

describe('[PRIVACY-CONTEXTE-IA] le diagnostic Budget ne part pas en mode discret — garde à l’ÉGRESS', () => {
    it('mode discret : le modal n’appelle JAMAIS le modèle et dit pourquoi', async () => {
        setDiscret(true);
        render(<BudgetAiModal apiKey="sk-test" payload={payload} onClose={() => {}} />);
        await waitFor(() => expect(screen.getByText(MESSAGE_DIAGNOSTIC_MODE_DISCRET)).toBeTruthy());
        expect(chatStream).not.toHaveBeenCalled();
    });

    it('contrôle — mode normal : le modèle est appelé une fois (l’espion est câblé)', async () => {
        render(<BudgetAiModal apiKey="sk-test" payload={payload} onClose={() => {}} />);
        await waitFor(() => expect(chatStream).toHaveBeenCalledTimes(1));
        expect(screen.queryByText(MESSAGE_DIAGNOSTIC_MODE_DISCRET)).toBeNull();
    });
});

describe('[PRIVACY-CONTEXTE-IA] le bouton « Diagnostic » de l’onglet Budget — garde à l’OUVREUR', () => {
    const props = { transactions: [], config, budgetItems, setBudgetItems: () => {}, apiKey: 'sk-test' };

    it('mode discret : un toast explique, le modal ne s’ouvre pas', () => {
        setDiscret(true);
        render(<Budget {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'Diagnostic' }));
        expect(showToast).toHaveBeenCalledWith(MESSAGE_DIAGNOSTIC_MODE_DISCRET, 'info');
        expect(screen.queryByText('Diagnostic IA du Budget')).toBeNull();
        expect(chatStream).not.toHaveBeenCalled();
    });

    it('contrôle — mode normal : le modal s’ouvre', async () => {
        render(<Budget {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'Diagnostic' }));
        await waitFor(() => expect(screen.getByText('Diagnostic IA du Budget')).toBeTruthy());
        expect(showToast).not.toHaveBeenCalledWith(MESSAGE_DIAGNOSTIC_MODE_DISCRET, 'info');
    });
});
