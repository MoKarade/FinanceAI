// tests/hooks/useAiChat.viewContext.test.tsx
//
// [CHAT-PAGE-CONTEXT] Le contexte d'écran est capturé AU MOMENT DE L'ENVOI (synchrone, avant tout
// await) et FIGÉ pour la boucle : naviguer pendant l'envoi ne change pas la page sur laquelle le
// chat répond (critère produit #8 « pas de contexte croisé »). Et il n'est JAMAIS persisté dans le
// transcript (ADR-4).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAiChat } from '../../hooks/useAiChat';
import { useFinanceStore } from '../../store/useFinanceStore';
import {
    publishViewContext, _resetViewContextForTests, type BudgetViewDetail,
} from '../../services/aiChat/viewContext';
import { Tab } from '../../types';

const captured: { lines: Array<string | undefined> } = { lines: [] };

vi.mock('../../services/aiTools/agentLoop', () => ({
    runAgentLoop: vi.fn(async (_h: unknown, opts: { viewContextLine?: string }) => {
        captured.lines.push(opts.viewContextLine);
        return { text: 'Réponse.', toolsUsed: [], turns: 1, stopReason: 'end', messages: [] };
    }),
}));
vi.mock('../../services/aiTools/appStateProvider', () => ({ appStateProvider: vi.fn(async () => ({})) }));
vi.mock('../../services/aiTools/writeExecutor', () => ({ executeWriteTool: vi.fn() }));

const budgetDetail = (periodLabel: string): BudgetViewDetail => ({
    kind: 'budget', timeViewLabel: 'mois', periodLabel,
    totalSpent: 1000, totalBudgetTarget: 1200, totalRealIncome: 3000, topCategories: [],
});

beforeEach(() => {
    captured.lines = [];
    _resetViewContextForTests();
    useFinanceStore.getState().resetState();
    useFinanceStore.setState({ aiConversation: [], activeTab: Tab.BUDGET } as never);
});

describe('useAiChat — contexte d\'écran (CHAT-PAGE-CONTEXT)', () => {
    it('la ligne CONTEXTE ÉCRAN part avec l\'envoi (onglet + période publiée)', async () => {
        publishViewContext('budget', budgetDetail('juillet 2026'));
        const { result } = renderHook(() => useAiChat('sk-test'));
        await act(async () => { await result.current.sendMessage('Explique ce chiffre'); });
        expect(captured.lines[0]).toContain('« Budget »');
        expect(captured.lines[0]).toContain('juillet 2026');
    });

    it('CAPTURE À L\'ENVOI : une navigation PENDANT l\'envoi ne change pas le contexte transmis', async () => {
        publishViewContext('budget', budgetDetail('juillet 2026'));
        const { result } = renderHook(() => useAiChat('sk-test'));
        await act(async () => {
            const p = result.current.sendMessage('Explique'); // capture synchrone au démarrage
            publishViewContext('budget', budgetDetail('août 2026')); // navigation mid-envoi
            await p;
        });
        expect(captured.lines[0]).toContain('juillet 2026'); // le contexte du MOMENT de la question
        expect(captured.lines[0]).not.toContain('août 2026');
    });

    it('page NON instrumentée → aveu honnête transmis (jamais prétendre voir)', async () => {
        useFinanceStore.setState({ activeTab: Tab.DEBT } as never);
        const { result } = renderHook(() => useAiChat('sk-test'));
        await act(async () => { await result.current.sendMessage('Explique ce que je vois'); });
        expect(captured.lines[0]).toContain('« Dettes »');
        expect(captured.lines[0]).toContain('Tu ne vois PAS le détail');
    });

    it('[Finding sécurité #490] MODE DISCRET → AUCUNE ligne de contexte au chokepoint d\'envoi (ceinture)', async () => {
        // Les protections périphériques (publisher purgé + chat masqué) couvrent l'UI ; ce test
        // verrouille le point d'égress LUI-MÊME contre un appel programmatique/masquage partiel futur.
        publishViewContext('budget', budgetDetail('juillet 2026'));
        useFinanceStore.setState({ isPrivacyMode: true } as never);
        const { result } = renderHook(() => useAiChat('sk-test'));
        await act(async () => { await result.current.sendMessage('Question'); });
        expect(captured.lines[0]).toBeUndefined(); // ni Tier 2 (montants) ni Tier 1 (onglet)
    });

    it('le contexte n\'est JAMAIS persisté dans le transcript (ADR-4)', async () => {
        publishViewContext('budget', budgetDetail('juillet 2026'));
        const { result } = renderHook(() => useAiChat('sk-test'));
        await act(async () => { await result.current.sendMessage('Question'); });
        expect(JSON.stringify(useFinanceStore.getState().aiConversation)).not.toContain('CONTEXTE ÉCRAN');
    });
});
