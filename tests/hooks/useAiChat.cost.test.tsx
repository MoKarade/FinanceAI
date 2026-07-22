// tests/hooks/useAiChat.cost.test.tsx
//
// [B3+B4] Le hook passe le MODÈLE de la conversation active à la boucle agentique, crédite le coût
// RÉEL (usage × tarif) sur la réponse ET sur le cumul à vie — et reste honnête quand l'usage
// manque (aucun coût fabriqué).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAiChat } from '../../hooks/useAiChat';
import { useFinanceStore } from '../../store/useFinanceStore';
import { MODEL_IDS } from '../../services/aiChat/models';
import { EMPTY_USAGE, type AiTokenUsage } from '../../services/aiChat/pricing';

const captured: { model: string | null; calls: number } = { model: null, calls: 0 };
let nextUsage: AiTokenUsage | undefined;

vi.mock('../../services/aiTools/agentLoop', () => ({
    runAgentLoop: vi.fn(async (_history: unknown, opts: { model?: string }) => {
        captured.model = opts.model ?? null;
        captured.calls += 1;
        return {
            text: 'Réponse.', toolsUsed: [], turns: 1, stopReason: 'end', messages: [],
            ...(nextUsage ? { usage: nextUsage } : {}),
        };
    }),
}));
vi.mock('../../services/aiTools/appStateProvider', () => ({ appStateProvider: vi.fn(async () => ({})) }));
vi.mock('../../services/aiTools/writeExecutor', () => ({ executeWriteTool: vi.fn() }));

beforeEach(() => {
    captured.model = null;
    captured.calls = 0;
    nextUsage = undefined;
    useFinanceStore.getState().resetState();
    useFinanceStore.setState({ aiConversation: [], aiChatCostUsdTotal: 0 } as never);
});

describe('useAiChat — modèle par conversation (B3)', () => {
    it('défaut : Sonnet est passé à la boucle', async () => {
        const { result } = renderHook(() => useAiChat('sk-test'));
        await act(async () => { await result.current.sendMessage('Salut'); });
        expect(captured.model).toBe(MODEL_IDS.sonnet);
    });

    it('aiChatModel = opus → l\'id API Opus part vers la boucle ; valeur corrompue → défaut', async () => {
        useFinanceStore.setState({ aiChatModel: 'opus' } as never);
        const { result } = renderHook(() => useAiChat('sk-test'));
        await act(async () => { await result.current.sendMessage('Question difficile'); });
        expect(captured.model).toBe(MODEL_IDS.opus);

        useFinanceStore.setState({ aiChatModel: 'gpt-5' } as never);
        await act(async () => { await result.current.sendMessage('Autre'); });
        expect(captured.model).toBe(MODEL_IDS.sonnet);
    });
});

describe('useAiChat — coût réel (B4)', () => {
    it('crédite costUsd sur la réponse ET incrémente le cumul à vie (1M input Sonnet = 3 $ US)', async () => {
        nextUsage = { ...EMPTY_USAGE, inputTokens: 1_000_000 };
        const { result } = renderHook(() => useAiChat('sk-test'));
        await act(async () => { await result.current.sendMessage('Q1'); });

        const conv = useFinanceStore.getState().aiConversation;
        const model = conv.find((m) => m.role === 'model')!;
        expect(model.costUsd).toBeCloseTo(3, 10);
        expect(useFinanceStore.getState().aiChatCostUsdTotal).toBeCloseTo(3, 10);

        // 2e envoi : le cumul ADDITIONNE (jamais écrasé).
        await act(async () => { await result.current.sendMessage('Q2'); });
        await waitFor(() => expect(captured.calls).toBe(2));
        expect(useFinanceStore.getState().aiChatCostUsdTotal).toBeCloseTo(6, 10);
    });

    it('résultat SANS usage (mock/version décalée) → AUCUN costUsd fabriqué, cumul intact', async () => {
        nextUsage = undefined;
        const { result } = renderHook(() => useAiChat('sk-test'));
        await act(async () => { await result.current.sendMessage('Q'); });
        const model = useFinanceStore.getState().aiConversation.find((m) => m.role === 'model')!;
        expect(model.costUsd).toBeUndefined();
        expect(useFinanceStore.getState().aiChatCostUsdTotal).toBe(0);
    });

    it('usage à zéro tokens (rien facturé) → pas de costUsd 0 parasite', async () => {
        nextUsage = { ...EMPTY_USAGE };
        const { result } = renderHook(() => useAiChat('sk-test'));
        await act(async () => { await result.current.sendMessage('Q'); });
        const model = useFinanceStore.getState().aiConversation.find((m) => m.role === 'model')!;
        expect(model.costUsd).toBeUndefined();
        expect(useFinanceStore.getState().aiChatCostUsdTotal).toBe(0);
    });
});
