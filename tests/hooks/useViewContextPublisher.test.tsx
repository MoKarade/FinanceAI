// tests/hooks/useViewContextPublisher.test.tsx
//
// [CHAT-PAGE-CONTEXT] Le gate MODE DISCRET vit À LA SOURCE (dans le hook, pas à l'affichage) :
// activer le mode discret PENDANT que la page est montée efface le détail (montants) du registre
// IMMÉDIATEMENT — le prochain envoi ne peut pas faire sortir vers l'API un montant que l'écran
// masque (Loi 25, classe AITOOLS-D). Discriminant : un gate posé seulement à l'affichage
// laisserait getViewContext() non-null → tests rouges.

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useViewContextPublisher } from '../../hooks/useViewContextPublisher';
import {
    getViewContext, publishViewContext, _resetViewContextForTests, type BudgetViewDetail,
} from '../../services/aiChat/viewContext';
import { useFinanceStore } from '../../store/useFinanceStore';

const detail: BudgetViewDetail = {
    kind: 'budget', timeViewLabel: 'mois', periodLabel: 'juillet 2026',
    totalSpent: 1000, totalBudgetTarget: 1200, totalRealIncome: 3000, topCategories: [],
};

beforeEach(() => {
    _resetViewContextForTests();
    useFinanceStore.setState({ isPrivacyMode: false } as never);
});

describe('useViewContextPublisher', () => {
    it('publie le détail au montage, l\'efface au démontage', () => {
        const { unmount } = renderHook(() => useViewContextPublisher('budget', detail));
        expect(getViewContext()?.detail).toEqual(detail);
        unmount();
        expect(getViewContext()).toBeNull();
    });

    it('MODE DISCRET activé EN COURS de session → le registre est vidé À LA SOURCE, immédiatement', () => {
        renderHook(() => useViewContextPublisher('budget', detail));
        expect(getViewContext()).not.toBeNull();
        act(() => { useFinanceStore.setState({ isPrivacyMode: true } as never); });
        expect(getViewContext()).toBeNull(); // pas juste masqué à l'affichage — ABSENT du registre
        act(() => { useFinanceStore.setState({ isPrivacyMode: false } as never); });
        expect(getViewContext()?.detail).toEqual(detail); // republication automatique
    });

    it('detail null → rien publié (page sans données prêtes)', () => {
        renderHook(() => useViewContextPublisher('budget', null));
        expect(getViewContext()).toBeNull();
    });

    it('le démontage n\'efface PAS un contexte publié par une AUTRE page entre-temps (scope-guard)', () => {
        const { unmount } = renderHook(() => useViewContextPublisher('budget', detail));
        publishViewContext('autre-page', { ...detail, periodLabel: 'ailleurs' });
        unmount(); // cleanup du scope 'budget' → no-op sur 'autre-page'
        expect(getViewContext()?.scope).toBe('autre-page');
    });
});
