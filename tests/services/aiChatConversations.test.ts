// tests/services/aiChatConversations.test.ts
//
// [B2-CHAT-HISTORY] Logique pure du multi-conversations : archivage à la bascule/nouvelle,
// suppression (active vs archivée), titres auto, ids vivants pour l'éviction du cache de
// pièces jointes. Invariant clé : l'ACTIVE ne figure JAMAIS dans `aiConversations` (pas de
// double copie qui diverge).

import { describe, it, expect } from 'vitest';
import {
    startNewConversation, switchConversation, deleteConversation,
    conversationTitle, aliveAttachmentMessageIds, MAX_ARCHIVED_CONVERSATIONS,
} from '../../services/aiChat/conversations';
import type { AiMessage } from '../../types';

const msg = (id: string, role: 'user' | 'model', text: string): AiMessage =>
    ({ id, role, text, timestamp: '2026-07-22T10:00:00Z' });

describe('conversationTitle', () => {
    it('= première QUESTION utilisateur, tronquée à 60', () => {
        expect(conversationTitle([msg('a', 'model', 'Bonjour'), msg('b', 'user', 'Quand ma retraite ?')]))
            .toBe('Quand ma retraite ?');
        const long = 'x'.repeat(80);
        const title = conversationTitle([msg('a', 'user', long)]);
        expect(title.length).toBeLessThanOrEqual(60);
        expect(title.endsWith('…')).toBe(true);
    });
    it('sans message utilisateur → date du premier message', () => {
        expect(conversationTitle([msg('a', 'model', 'Salut')])).toContain('2026-07-22');
    });
});

describe('startNewConversation', () => {
    it('archive l\'active NON VIDE en tête de liste et repart à vide avec un id frais', () => {
        const state = {
            aiConversation: [msg('m1', 'user', 'Q1'), msg('m2', 'model', 'R1')],
            aiConversations: [],
            activeAiConversationId: 'conv_A',
        };
        const { patch } = startNewConversation(state);
        expect(patch.aiConversation).toEqual([]);
        expect(patch.aiConversations).toHaveLength(1);
        expect(patch.aiConversations[0].id).toBe('conv_A');
        expect(patch.aiConversations[0].title).toBe('Q1');
        expect(patch.aiConversations[0].messages).toHaveLength(2);
        expect(patch.activeAiConversationId).not.toBe('conv_A');
    });

    it('active VIDE → rien archivé (pas de conversation fantôme dans la liste)', () => {
        const { patch } = startNewConversation({ aiConversation: [], aiConversations: [], activeAiConversationId: null });
        expect(patch.aiConversations).toEqual([]);
    });

    it('PLAFOND d\'archives : au-delà, les plus ANCIENNES tombent et leurs ids de messages sont rendus (nettoyage Drive/cache)', () => {
        const full = Array.from({ length: MAX_ARCHIVED_CONVERSATIONS }, (_, i) => ({
            id: `conv_${i}`, title: `C${i}`, createdAt: '', updatedAt: '',
            messages: [msg(`old_${i}`, 'user', `Q${i}`)],
        }));
        const { patch, droppedMessageIds } = startNewConversation({
            aiConversation: [msg('m1', 'user', 'Récente')],
            aiConversations: full, // déjà au plafond → archiver l'active en évince une
            activeAiConversationId: 'conv_new',
        });
        expect(patch.aiConversations).toHaveLength(MAX_ARCHIVED_CONVERSATIONS);
        expect(patch.aiConversations[0].id).toBe('conv_new'); // la plus récente en tête
        expect(droppedMessageIds).toEqual([`old_${MAX_ARCHIVED_CONVERSATIONS - 1}`]); // la plus vieille évincée
    });
});

describe('switchConversation', () => {
    const archived = { id: 'conv_B', title: 'B', createdAt: '', updatedAt: '', messages: [msg('b1', 'user', 'QB')] };

    it('charge la cible dans l\'active, archive l\'ancienne active, retire la cible de la liste', () => {
        const { patch } = switchConversation({
            aiConversation: [msg('m1', 'user', 'QA')],
            aiConversations: [archived],
            activeAiConversationId: 'conv_A',
        }, 'conv_B')!;
        expect(patch.aiConversation).toEqual(archived.messages);
        expect(patch.activeAiConversationId).toBe('conv_B');
        expect(patch.aiConversations.map((c) => c.id)).toEqual(['conv_A']); // l'active JAMAIS en double
    });

    it('id inconnu → null (aucun état modifié)', () => {
        expect(switchConversation({ aiConversation: [], aiConversations: [], activeAiConversationId: null }, 'nexiste')).toBeNull();
    });

    it('aller-retour : re-basculer ne DUPLIQUE pas (ré-archivage remplace par id)', () => {
        const s1 = { aiConversation: [msg('a1', 'user', 'QA')], aiConversations: [archived], activeAiConversationId: 'conv_A' };
        const p1 = switchConversation(s1, 'conv_B')!.patch;
        const p2 = switchConversation({ ...p1 }, 'conv_A')!.patch;
        expect(p2.activeAiConversationId).toBe('conv_A');
        expect(p2.aiConversations.map((c) => c.id)).toEqual(['conv_B']);
        expect(p2.aiConversation).toEqual(s1.aiConversation);
    });
});

describe('deleteConversation', () => {
    const archived = { id: 'conv_B', title: 'B', createdAt: '', updatedAt: '', messages: [msg('b1', 'user', 'QB')] };

    it('archivée : retirée de la liste + ids de messages rendus (nettoyage cache/Drive)', () => {
        const res = deleteConversation({
            aiConversation: [msg('a1', 'user', 'QA')],
            aiConversations: [archived],
            activeAiConversationId: 'conv_A',
        }, 'conv_B')!;
        expect(res.patch.aiConversations).toEqual([]);
        expect(res.patch.aiConversation).toHaveLength(1); // l'active intacte
        expect(res.removedMessageIds).toEqual(['b1']);
    });

    it('ACTIVE : vidée (équivalent Effacer), archivées intactes', () => {
        const res = deleteConversation({
            aiConversation: [msg('a1', 'user', 'QA')],
            aiConversations: [archived],
            activeAiConversationId: 'conv_A',
        }, 'conv_A')!;
        expect(res.patch.aiConversation).toEqual([]);
        expect(res.patch.aiConversations).toEqual([archived]);
        expect(res.removedMessageIds).toEqual(['a1']);
    });

    it('id inconnu → null', () => {
        expect(deleteConversation({ aiConversation: [], aiConversations: [], activeAiConversationId: null }, 'x')).toBeNull();
    });
});

describe('aliveAttachmentMessageIds', () => {
    it('fenêtre de l\'active + fenêtre de CHAQUE archivée (une bascule retrouve ses pièces jointes)', () => {
        const ids = aliveAttachmentMessageIds({
            aiConversation: [msg('a1', 'user', 'x'), msg('a2', 'user', 'y'), msg('a3', 'user', 'z')],
            aiConversations: [
                { id: 'c', title: '', createdAt: '', updatedAt: '', messages: [msg('b1', 'user', 'q'), msg('b2', 'user', 'r')] },
            ],
            activeAiConversationId: 'conv_A',
        }, 2);
        expect(ids).toEqual(['a2', 'a3', 'b1', 'b2']); // fenêtre 2 par conversation
    });
});
