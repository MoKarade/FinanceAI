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

import type { AiChatModelKey, AiConversation, AiMessage, AppState } from '../../types';
import { DEFAULT_AI_CHAT_MODEL, resolveChatModelKey } from './models';

/** Patch d'état à appliquer via setAppState (les 3 tranches concernées, toujours ensemble). */
interface ConversationsPatch {
    aiConversation: AiMessage[];
    aiConversations: AiConversation[];
    activeAiConversationId: string | null;
    /** [B3-CHAT-MODEL] Modèle de la conversation ACTIVE après la transition (porté par archive/bascule). */
    aiChatModel: AiChatModelKey;
}

/**
 * Plafond d'archives (finding panel sécurité — minimisation Loi 25 + taille du payload sync : les
 * conversations voyagent EN ENTIER dans chaque push Drive). Au-delà, les plus ANCIENNES tombent ;
 * leurs ids de messages sont rendus à l'appelant (nettoyage cache + fichiers Drive de pièces jointes).
 */
export const MAX_ARCHIVED_CONVERSATIONS = 30;

type ConversationsState = Pick<AppState, 'aiConversation' | 'aiConversations' | 'activeAiConversationId' | 'aiChatModel'>;

let _convSeq = 0;
const nextConversationId = (): string => `aiconv_${Date.now()}_${++_convSeq}`;

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

/** Résultat d'une transition : patch + ids de messages DÉFINITIVEMENT sortis (cap d'archives). */
interface ConversationsTransition {
    patch: ConversationsPatch;
    /** Messages des conversations évincées par le plafond (nettoyage cache + fichiers Drive). */
    droppedMessageIds: string[];
}

/** Archive la conversation ACTIVE (si non vide) dans la liste, PLAFONNÉE. Interne aux transitions. */
function archiveActive(state: ConversationsState): { list: AiConversation[]; droppedMessageIds: string[] } {
    const list = [...(state.aiConversations ?? [])];
    const messages = state.aiConversation ?? [];
    const cap = (arr: AiConversation[]): { kept: AiConversation[]; droppedMessageIds: string[] } => {
        if (arr.length <= MAX_ARCHIVED_CONVERSATIONS) return { kept: arr, droppedMessageIds: [] };
        const kept = arr.slice(0, MAX_ARCHIVED_CONVERSATIONS);
        const dropped = arr.slice(MAX_ARCHIVED_CONVERSATIONS);
        return {
            kept,
            droppedMessageIds: dropped.flatMap((c) => c.messages.map((m) => m.id).filter((x): x is string => Boolean(x))),
        };
    };
    if (messages.length === 0) {
        const { kept, droppedMessageIds } = cap(list);
        return { list: kept, droppedMessageIds };
    }
    const id = state.activeAiConversationId ?? nextConversationId();
    const createdAt = messages[0]?.timestamp || new Date().toISOString();
    const updatedAt = messages[messages.length - 1]?.timestamp || createdAt;
    // Remplace une éventuelle entrée du même id (ré-archivage après bascule aller-retour).
    const without = list.filter((c) => c.id !== id);
    // [B3-CHAT-MODEL] Le modèle de l'active part avec elle dans l'archive (choix PAR conversation).
    without.unshift({
        id, title: conversationTitle(messages), createdAt, updatedAt, messages,
        model: resolveChatModelKey(state.aiChatModel),
    });
    const { kept, droppedMessageIds } = cap(without);
    return { list: kept, droppedMessageIds };
}

/** Nouvelle conversation : archive l'active (si non vide) et repart à vide. */
export function startNewConversation(state: ConversationsState): ConversationsTransition {
    // [B3-CHAT-MODEL] Une NOUVELLE conversation garde le dernier modèle choisi (préférence collante).
    const keepModel = resolveChatModelKey(state.aiChatModel);
    if ((state.aiConversation ?? []).length === 0) {
        // Déjà vide : no-op logique (on renouvelle juste l'id actif pour une identité fraîche).
        return {
            patch: {
                aiConversation: [],
                aiConversations: state.aiConversations ?? [],
                activeAiConversationId: nextConversationId(),
                aiChatModel: keepModel,
            },
            droppedMessageIds: [],
        };
    }
    const { list, droppedMessageIds } = archiveActive(state);
    return {
        patch: { aiConversation: [], aiConversations: list, activeAiConversationId: nextConversationId(), aiChatModel: keepModel },
        droppedMessageIds,
    };
}

/** Bascule vers une conversation archivée (l'active est archivée à sa place). Null si id inconnu. */
export function switchConversation(state: ConversationsState, id: string): ConversationsTransition | null {
    const target = (state.aiConversations ?? []).find((c) => c.id === id);
    if (!target) return null;
    const { list, droppedMessageIds } = archiveActive(state);
    return {
        patch: {
            aiConversation: target.messages,
            aiConversations: list.filter((c) => c.id !== id),
            activeAiConversationId: target.id,
            // [B3-CHAT-MODEL] Restaure le modèle DE la conversation chargée. Une archive pré-B3
            // n'en a pas → défaut historique ('sonnet' — le seul modèle qui existait alors).
            aiChatModel: target.model !== undefined ? resolveChatModelKey(target.model) : DEFAULT_AI_CHAT_MODEL,
        },
        droppedMessageIds,
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
                aiChatModel: resolveChatModelKey(state.aiChatModel),
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
            aiChatModel: resolveChatModelKey(state.aiChatModel),
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
