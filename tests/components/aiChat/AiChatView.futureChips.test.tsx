// tests/components/aiChat/AiChatView.futureChips.test.tsx
//
// [REFONTE-NAV-L6a] Chips « ancrées sur la courbe » du chat : rendues quand le contexte est Futur
// (panneau ouvert par-dessus l'onglet Futur, ou page Assistant avec une projection RÉVÉLÉE dans le
// store), PRÉ-REMPLISSENT la saisie (jamais d'envoi automatique), et ABSENTES sans projection (pas
// de fausse affordance), sans révélation explicite (gate PH4) ou quand le contexte publié est un
// autre onglet (Budget).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiChatView } from '../../../components/aiChat/AiChatView';
import { useFinanceStore } from '../../../store/useFinanceStore';
import {
    publishViewContext, _resetViewContextForTests, type BudgetViewDetail,
} from '../../../services/aiChat/viewContext';
import { buildFutureViewDetail } from '../../../services/aiChat/futureViewContext';
import type { ProjectionChartPoint, ProjectionResult } from '../../../services/projection/types';
import { Tab } from '../../../types';

const sendMessage = vi.fn();
vi.mock('../../../components/aiChat/AiChatContext', () => ({
    useAiChatContext: () => ({
        isLoading: false, activeTools: [], pendingWrite: null,
        resolvePendingWrite: vi.fn(), sendMessage: (...a: unknown[]) => sendMessage(...a), cancel: vi.fn(), clearConversation: vi.fn(),
    }),
}));

const pt = (monthIndex: number, NetWorth: number, year: number, over: Partial<ProjectionChartPoint> = {}): ProjectionChartPoint =>
    ({ monthIndex, NetWorth, year, ...over } as ProjectionChartPoint);

const projection = {
    strategyName: 'Équilibrée',
    fireNumber: 480_000,
    chartData: [
        pt(0, 100_000, 2026, { age: 35 }),
        pt(168, 500_000, 2040, { age: 49 }),
        pt(204, 420_000, 2043, { age: 52, isRetired: true }),
        pt(468, 450_000, 2065, { age: 74, isRetired: true }),
    ],
} as unknown as ProjectionResult;

beforeEach(() => {
    sendMessage.mockClear();
    _resetViewContextForTests();
    Element.prototype.scrollIntoView = vi.fn();
    useFinanceStore.getState().resetState();
    useFinanceStore.setState({ aiConversation: [], isTestMode: false, isPrivacyMode: false } as never);
});

describe('AiChatView — chips ancrées sur la courbe (contexte Futur)', () => {
    it('PANNEAU sur l\'onglet Futur (contexte future publié) → chips visibles, dont le creux à [année]', () => {
        useFinanceStore.setState({ activeTab: Tab.FUTURE } as never);
        publishViewContext('future', buildFutureViewDetail(projection));
        render(<AiChatView variant="panel" />);
        expect(screen.getByRole('button', { name: 'Explique ma courbe' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Pourquoi ça baisse en 2040 ?' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Ma retraite (2043)' })).toBeInTheDocument();
    });

    it('clic sur une chip → PRÉ-REMPLIT la saisie (aucun envoi automatique)', () => {
        useFinanceStore.setState({ activeTab: Tab.FUTURE } as never);
        publishViewContext('future', buildFutureViewDetail(projection));
        render(<AiChatView variant="panel" />);
        fireEvent.click(screen.getByRole('button', { name: 'Pourquoi ça baisse en 2040 ?' }));
        const input = screen.getByLabelText('Question au conseiller IA') as HTMLInputElement;
        expect(input.value).toContain('Pourquoi ma courbe baisse à partir de 2040');
        expect(sendMessage).not.toHaveBeenCalled(); // l'envoi reste un geste de l'utilisateur
    });

    // Gate PH4 : sur Futur, les chiffres projetés n'apparaissent qu'après un geste EXPLICITE de
    // révélation (`revealedProjectionSig`). Le moteur publiant `lastProjection` en continu, la page
    // Assistant doit appliquer le MÊME gate — sinon une année de retraite projetée entrait par la
    // porte des chips chez un utilisateur qui n'a jamais révélé sa courbe.
    it('page ASSISTANT, courbe RÉVÉLÉE → chips bâties sur store.lastProjection (source unique)', () => {
        useFinanceStore.setState({ activeTab: Tab.ASSISTANT, lastProjection: projection, revealedProjectionSig: 'v1:sig' } as never);
        render(<AiChatView variant="tab" />);
        expect(screen.getByRole('button', { name: 'Explique ma courbe' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Ma retraite (2043)' })).toBeInTheDocument();
    });

    it('page ASSISTANT, projection calculée mais JAMAIS révélée → AUCUNE chip (même gate que Futur)', () => {
        useFinanceStore.setState({ activeTab: Tab.ASSISTANT, lastProjection: projection, revealedProjectionSig: null } as never);
        render(<AiChatView variant="tab" />);
        expect(screen.queryByRole('button', { name: 'Explique ma courbe' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Ma retraite (2043)' })).toBeNull();
    });

    it('page ASSISTANT sans projection → AUCUNE chip (empty state honnête, pas de fausse affordance)', () => {
        useFinanceStore.setState({ activeTab: Tab.ASSISTANT, lastProjection: null, revealedProjectionSig: 'v1:sig' } as never);
        render(<AiChatView variant="tab" />);
        expect(screen.queryByRole('button', { name: 'Explique ma courbe' })).toBeNull();
        expect(screen.queryByText(/Pourquoi ça baisse/)).toBeNull();
    });

    it('PANNEAU sur Budget (contexte budget publié) → pas de chips courbe (contexte ≠ Futur)', () => {
        useFinanceStore.setState({ activeTab: Tab.BUDGET } as never);
        const budget: BudgetViewDetail = {
            kind: 'budget', timeViewLabel: 'mois', periodLabel: 'juillet 2026',
            totalSpent: 1000, totalBudgetTarget: 1200, totalRealIncome: 3000, topCategories: [],
        };
        publishViewContext('budget', budget);
        render(<AiChatView variant="panel" />);
        expect(screen.queryByRole('button', { name: 'Explique ma courbe' })).toBeNull();
    });

    it('contexte future SANS projection (gate d\'amorçage) → badge honnête, pas de chips', () => {
        useFinanceStore.setState({ activeTab: Tab.FUTURE } as never);
        publishViewContext('future', buildFutureViewDetail(null));
        render(<AiChatView variant="panel" />);
        expect(screen.getByText(/Contexte :/)).toHaveTextContent('Futur — aucune projection calculée');
        expect(screen.queryByRole('button', { name: 'Explique ma courbe' })).toBeNull();
    });
});
