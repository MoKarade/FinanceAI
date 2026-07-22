// tests/hooks/useAiChat.attachments.test.tsx
//
// [AITOOLS-B1] Envoi multimodal : l'historique passé à runAgentLoop porte les blocs image/document,
// le transcript PERSISTÉ ne porte QUE les métadonnées (jamais les octets — ADR-4, sync Drive),
// et un message à pièces jointes d'une session PRÉCÉDENTE (cache vide) produit une note honnête.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type Anthropic from '@anthropic-ai/sdk';
import { useAiChat } from '../../hooks/useAiChat';
import { useFinanceStore } from '../../store/useFinanceStore';
import { clearAttachmentCache } from '../../services/aiChat/attachments';

// Capture l'historique reçu par la boucle agentique (le SDK n'est jamais appelé).
const captured: { history: Anthropic.MessageParam[] | null } = { history: null };
vi.mock('../../services/aiTools/agentLoop', () => ({
    runAgentLoop: vi.fn(async (history: Anthropic.MessageParam[]) => {
        captured.history = history;
        return { text: 'Réponse.', toolsUsed: [], turns: 1, stopReason: 'end', messages: [] };
    }),
}));
vi.mock('../../services/aiTools/appStateProvider', () => ({ appStateProvider: vi.fn(async () => ({})) }));
vi.mock('../../services/aiTools/writeExecutor', () => ({ executeWriteTool: vi.fn() }));

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

beforeEach(() => {
    captured.history = null;
    clearAttachmentCache();
    useFinanceStore.getState().resetState();
    useFinanceStore.setState({ aiConversation: [] } as never);
});

describe('useAiChat — pièces jointes (B1)', () => {
    it('envoi avec image : blocs multimodaux vers la boucle, MÉTADONNÉES seules dans le transcript', async () => {
        const { result } = renderHook(() => useAiChat('sk-test'));
        const file = new File([PNG_BYTES], 'capture.png', { type: 'image/png' });

        await act(async () => {
            await result.current.sendMessage('Analyse cette capture', [file]);
        });
        await waitFor(() => expect(captured.history).not.toBeNull());

        // 1) L'historique envoyé au modèle porte le bloc image + le texte.
        const lastUser = captured.history!.find((m) => m.role === 'user')!;
        const blocks = lastUser.content as unknown as Array<Record<string, unknown>>;
        expect(Array.isArray(blocks)).toBe(true);
        expect(blocks.map((b) => b.type)).toEqual(['image', 'text']);

        // 2) Le transcript persisté : métadonnées OUI, octets NON (ADR-4 — il part dans le push Drive).
        const conv = useFinanceStore.getState().aiConversation;
        const userMsg = conv.find((m) => m.role === 'user')!;
        expect(userMsg.attachments).toEqual([
            { name: 'capture.png', kind: 'image', mimeType: 'image/png', size: PNG_BYTES.length },
        ]);
        const base64 = (blocks[0].source as Record<string, string>).data;
        expect(base64.length).toBeGreaterThan(0);
        expect(JSON.stringify(conv)).not.toContain(base64); // les octets ne touchent JAMAIS le store
    });

    it('pièces jointes SEULES (sans texte) : l\'envoi part quand même', async () => {
        const { result } = renderHook(() => useAiChat('sk-test'));
        const file = new File(['a,b\n1,2'], 'tx.csv', { type: 'text/csv' });

        await act(async () => {
            await result.current.sendMessage('', [file]);
        });
        await waitFor(() => expect(captured.history).not.toBeNull());
        const lastUser = captured.history!.find((m) => m.role === 'user')!;
        const blocks = lastUser.content as unknown as Array<Record<string, unknown>>;
        expect(blocks.map((b) => b.type)).toEqual(['document']);
    });

    it('message à pièces jointes d\'une SESSION PRÉCÉDENTE (cache vide) → note honnête, pas de contenu fabriqué', async () => {
        // Simule un transcript rechargé : méta présente, cache mémoire vide.
        useFinanceStore.setState({
            aiConversation: [{
                id: 'aimsg_old', role: 'user', text: 'Regarde ce relevé', timestamp: '2026-07-21T10:00:00Z',
                attachments: [{ name: 'releve.pdf', kind: 'pdf', mimeType: 'application/pdf', size: 999 }],
            }],
        } as never);
        const { result } = renderHook(() => useAiChat('sk-test'));

        await act(async () => {
            await result.current.sendMessage('Et ma question de suivi ?');
        });
        await waitFor(() => expect(captured.history).not.toBeNull());

        const oldTurn = captured.history![0];
        expect(typeof oldTurn.content).toBe('string');
        expect(oldTurn.content as string).toContain('Regarde ce relevé');
        expect(oldTurn.content as string).toContain('releve.pdf');
        expect(oldTurn.content as string).toContain('non disponible');
    });

    it('fichier illisible → envoi REFUSÉ avec message honnête (jamais d\'envoi partiel)', async () => {
        const { result } = renderHook(() => useAiChat('sk-test'));
        const bad = new File(['x'], 'virus.exe', { type: 'application/octet-stream' });

        await act(async () => {
            await result.current.sendMessage('Analyse', [bad]);
        });

        expect(captured.history).toBeNull(); // la boucle n'a JAMAIS été appelée
        const conv = useFinanceStore.getState().aiConversation;
        expect(conv.some((m) => m.role === 'model' && m.text.includes('pas été envoyé'))).toBe(true);
    });
});
