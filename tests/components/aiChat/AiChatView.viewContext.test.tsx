// tests/components/aiChat/AiChatView.viewContext.test.tsx
//
// [CHAT-PAGE-CONTEXT] Rendu du badge « Contexte : … » : visible avec le détail de la page ACTIVE,
// ABSENT sur mismatch scope↔onglet (la classe de bug corrigée par le panel #490 — le badge ne doit
// jamais afficher la période de Budget sur un autre onglet), et dédup PAR VALEUR du publisher (un
// detail reconstruit au contenu identique ne re-notifie pas — boucle infinie prouvée par sonde).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, renderHook } from '@testing-library/react';
import { AiChatView } from '../../../components/aiChat/AiChatView';
import { useFinanceStore } from '../../../store/useFinanceStore';
import {
    publishViewContext, subscribeViewContext, _resetViewContextForTests, type BudgetViewDetail,
} from '../../../services/aiChat/viewContext';
import { useViewContextPublisher } from '../../../hooks/useViewContextPublisher';
import { Tab } from '../../../types';

vi.mock('../../../components/aiChat/AiChatContext', () => ({
    useAiChatContext: () => ({
        isLoading: false, activeTools: [], pendingWrite: null,
        resolvePendingWrite: vi.fn(), sendMessage: vi.fn(), cancel: vi.fn(), clearConversation: vi.fn(),
    }),
}));

const detail: BudgetViewDetail = {
    kind: 'budget', timeViewLabel: 'mois', periodLabel: 'juillet 2026',
    totalSpent: 1000, totalBudgetTarget: 1200, totalRealIncome: 3000, topCategories: [],
};

beforeEach(() => {
    _resetViewContextForTests();
    Element.prototype.scrollIntoView = vi.fn();
    useFinanceStore.getState().resetState();
    useFinanceStore.setState({ aiConversation: [], isTestMode: false, isPrivacyMode: false } as never);
});

describe('AiChatView — badge de contexte d\'écran', () => {
    it('détail publié + onglet correspondant → badge visible « Contexte : Budget — juillet 2026 »', () => {
        useFinanceStore.setState({ activeTab: Tab.BUDGET } as never);
        publishViewContext('budget', detail);
        render(<AiChatView variant="tab" />);
        expect(screen.getByText(/Contexte :/)).toHaveTextContent('Budget — juillet 2026');
    });

    it('MISMATCH scope↔onglet (fenêtre de transition) → la période de Budget N\'apparaît PAS', () => {
        useFinanceStore.setState({ activeTab: Tab.DASHBOARD } as never);
        publishViewContext('budget', detail); // cleanup du publisher pas encore passé
        render(<AiChatView variant="panel" />);
        expect(screen.queryByText(/juillet 2026/)).toBeNull(); // jamais un contexte croisé visible
        expect(screen.getByText(/Contexte :/)).toHaveTextContent('Accueil'); // repli : onglet seul (panneau)
    });

    it('onglet Assistant sans détail (variant tab) → aucun badge (bruit inutile)', () => {
        useFinanceStore.setState({ activeTab: Tab.ASSISTANT } as never);
        render(<AiChatView variant="tab" />);
        expect(screen.queryByText(/Contexte :/)).toBeNull();
    });
});

describe('useViewContextPublisher — dédup par VALEUR (finding code-reviewer #490)', () => {
    it('un detail RECONSTRUIT au contenu identique ne re-notifie pas (anti boucle infinie)', () => {
        let notifications = 0;
        subscribeViewContext(() => { notifications += 1; });
        const { rerender } = renderHook(
            // Objet inline VOLONTAIREMENT non mémoïsé : nouvelle référence à chaque render.
            ({ n }: { n: number }) => useViewContextPublisher('budget', { ...detail, totalSpent: n }),
            { initialProps: { n: 1000 } },
        );
        rerender({ n: 1000 }); // même contenu, nouvelle référence → AUCUNE nouvelle publication
        rerender({ n: 1000 });
        expect(notifications).toBe(1);
        rerender({ n: 2000 }); // contenu réellement différent → republication
        expect(notifications).toBeGreaterThanOrEqual(2);
    });
});
