// services/aiChat/conversations.ts
//
// [B2-CHAT-HISTORY] Logique PURE du multi-conversations du chat Assistant (demande Marc :
// « un onglet dédié avec historique »). Contrats :
//  - `aiConversation` (store) reste la conversation ACTIVE — source unique, tous les consommateurs
//    existants (useAiChat, AiChatView, SystemView…) inchangés ;
//  - `aiConversations` = conversations ARCHIVÉES (l'active n'y figure PAS — jamais deux copies
//    des mêmes messages qui divergent) ; `activeAiConversationId` identifie l'active ;
//  - champs ADDITIFS optionnels (zéro migration) ; synchronisés Drive via l'état persisté (texte +
//    métadonnées de pièces jointes SEULEMENT — les octets restent hors du store, ADR-4) ;
//  - ⚠️ AUCUNE bascule pendant un envoi EN VOL : la boucle agentique met à jour la bulle par id
//    dans `aiConversation` — permuter les messages sous elle perdrait la réponse payée. Les
//    surfaces UI désactivent les actions quand isLoading ; les helpers restent purs (l'appelant
//    applique le patch via setAppState).

import type { AiConversation, AiMessage, AppState } from '../../types';

/** Patch d'état à appliquer via setAppState (les 3 tranches concernées, toujours ensemble). */
export interface ConversationsPatch {
    aiConversation: AiMessage[];
    aiConversations: AiConversation[];
    activeAiConversationId: string | null;
}

type ConversationsState = Pick<AppState, 'aiConversation' | 'aiConversations' | 'activeAiConversationId'>;

let _convSeq = 0;
export const nextConversationId = (): string => `aiconv_${Date.now()}_${++_convSeq}`;

/** Titre auto : première question de l'utilisateur, tronquée — sinon la date du premier message. */
export function conversationTitle(messages: AiMessage[]): string {
    const firstUser = messages.find((m) => m.role === 'user' && m.text.trim() !== '');
    if (firstUser) {
        const t = firstUser.text.trim().replace(/\s+/g, ' ');
        return t.length > 60 ? `${t.slice(0, 57)}…` : t;
    }
    const first = messages[0];
    const d = first?.timestamp ? new Date(first.timestamp) : new Date();
    return `Conversation du ${Number.isNaN(d.getTime()) ? '?' : d.toISOString().slice(0, 10)}`;
}

/** Archive la conversation ACTIVE (si non vide) dans la liste. Interne aux transitions ci-dessous. */
function archiveActive(state: ConversationsState): { list: AiConversation[]; } {
    const list = [...(state.aiConversations ?? [])];
    const messages = state.aiConversation ?? [];
    if (messages.length === 0) return { list };
    const id = state.activeAiConversationId ?? nextConversationId();
    const createdAt = messages[0]?.timestamp || new Date().toISOString();
    const updatedAt = messages[messages.length - 1]?.timestamp || createdAt;
    // Remplace une éventuelle entrée du même id (ré-archivage après bascule aller-retour).
    const without = list.filter((c) => c.id !== id);
    without.unshift({ id, title: conversationTitle(messages), createdAt, updatedAt, messages });
    return { list: without };
}

/** Nouvelle conversation : archive l'active (si non vide) et repart à vide. */
export function startNewConversation(state: ConversationsState): ConversationsPatch {
    if ((state.aiConversation ?? []).length === 0) {
        // Déjà vide : no-op logique (on renouvelle juste l'id actif pour une identité fraîche).
        return {
            aiConversation: [],
            aiConversations: state.aiConversations ?? [],
            activeAiConversationId: nextConversationId(),
        };
    }
    const { list } = archiveActive(state);
    return { aiConversation: [], aiConversations: list, activeAiConversationId: nextConversationId() };
}

/** Bascule vers une conversation archivée (l'active est archivée à sa place). Null si id inconnu. */
export function switchConversation(state: ConversationsState, id: string): ConversationsPatch | null {
    const target = (state.aiConversations ?? []).find((c) => c.id === id);
    if (!target) return null;
    const { list } = archiveActive(state);
    return {
        aiConversation: target.messages,
        aiConversations: list.filter((c) => c.id !== id),
        activeAiConversationId: target.id,
    };
}

/**
 * Supprime une conversation ARCHIVÉE (par id) — ou l'ACTIVE si l'id correspond (elle est alors
 * vidée, comme « Effacer »). Retourne aussi les ids de MESSAGES supprimés (pour libérer le cache
 * de pièces jointes et, plus tard, les fichiers Drive associés).
 */
export function deleteConversation(
    state: ConversationsState,
    id: string,
): { patch: ConversationsPatch; removedMessageIds: string[] } | null {
    if (id === state.activeAiConversationId) {
        const removed = (state.aiConversation ?? []).map((m) => m.id).filter((x): x is string => Boolean(x));
        return {
            patch: {
                aiConversation: [],
                aiConversations: state.aiConversations ?? [],
                activeAiConversationId: nextConversationId(),
            },
            removedMessageIds: removed,
        };
    }
    const target = (state.aiConversations ?? []).find((c) => c.id === id);
    if (!target) return null;
    return {
        patch: {
            aiConversation: state.aiConversation ?? [],
            aiConversations: (state.aiConversations ?? []).filter((c) => c.id !== id),
            activeAiConversationId: state.activeAiConversationId ?? null,
        },
        removedMessageIds: target.messages.map((m) => m.id).filter((x): x is string => Boolean(x)),
    };
}

/**
 * Ids de messages « vivants » pour l'éviction du cache de pièces jointes : la fenêtre d'historique
 * de l'ACTIVE + la même fenêtre de CHAQUE archivée (borné : une bascule de conversation doit
 * retrouver ses pièces jointes en session — sans garder à vie les payloads hors fenêtre).
 */
export function aliveAttachmentMessageIds(state: ConversationsState, historyWindow: number): string[] {
    const ids: string[] = [];
    const take = (msgs: AiMessage[]) => {
        for (const m of msgs.slice(-historyWindow)) if (m.id) ids.push(m.id);
    };
    take(state.aiConversation ?? []);
    for (const c of state.aiConversations ?? []) take(c.messages);
    return ids;
}
