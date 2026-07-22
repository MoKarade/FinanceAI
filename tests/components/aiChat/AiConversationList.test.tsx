// tests/components/aiChat/AiConversationList.test.tsx
//
// [B2-CHAT-HISTORY] Liste des conversations : nouvelle (archive l'active), bascule, suppression
// 2 clics, actions gelées pendant un envoi en vol (une bascule mi-stream corromprait la bulle
// mise à jour par id).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiConversationList } from '../../../components/aiChat/AiConversationList';
import { useFinanceStore } from '../../../store/useFinanceStore';
import type { AiMessage } from '../../../types';

vi.mock('../../../services/aiChat/attachmentDriveStore', () => ({
    deleteAttachmentsFromDrive: vi.fn(async () => undefined),
}));

const msg = (id: string, text: string): AiMessage => ({ id, role: 'user', text, timestamp: '2026-07-22T10:00:00Z' });

beforeEach(() => {
    useFinanceStore.getState().resetState();
    useFinanceStore.setState({
        aiConversation: [msg('a1', 'Question active')],
        aiConversations: [
            { id: 'conv_B', title: 'Ma question sur le CELI', createdAt: '2026-07-20T10:00:00Z', updatedAt: '2026-07-20T10:05:00Z', messages: [msg('b1', 'Ma question sur le CELI')] },
        ],
        activeAiConversationId: 'conv_A',
        isTestMode: false,
    } as never);
});

describe('AiConversationList', () => {
    it('« Nouvelle conversation » archive l\'active et vide le fil', () => {
        render(<AiConversationList isLoading={false} />);
        fireEvent.click(screen.getByText('Nouvelle conversation'));
        const s = useFinanceStore.getState();
        expect(s.aiConversation).toEqual([]);
        expect(s.aiConversations!.map((c) => c.title)).toContain('Question active');
    });

    it('cliquer une conversation archivée la charge dans le fil actif', () => {
        render(<AiConversationList isLoading={false} />);
        fireEvent.click(screen.getByText('Ma question sur le CELI'));
        const s = useFinanceStore.getState();
        expect(s.activeAiConversationId).toBe('conv_B');
        expect(s.aiConversation[0].text).toBe('Ma question sur le CELI');
        expect(s.aiConversations!.map((c) => c.title)).toEqual(['Question active']); // l'ancienne active archivée
    });

    it('suppression en 2 CLICS (jamais au premier clic)', () => {
        render(<AiConversationList isLoading={false} />);
        fireEvent.click(screen.getByLabelText('Supprimer la conversation Ma question sur le CELI'));
        expect(useFinanceStore.getState().aiConversations).toHaveLength(1); // 1er clic : rien supprimé
        fireEvent.click(screen.getByLabelText('Confirmer la suppression de la conversation Ma question sur le CELI'));
        expect(useFinanceStore.getState().aiConversations).toHaveLength(0);
    });

    it('pendant un envoi en vol (isLoading), toutes les actions sont gelées', () => {
        render(<AiConversationList isLoading />);
        fireEvent.click(screen.getByText('Ma question sur le CELI'));
        const s = useFinanceStore.getState();
        expect(s.activeAiConversationId).toBe('conv_A'); // pas de bascule mi-stream
        expect(s.aiConversation[0].text).toBe('Question active');
    });
});
