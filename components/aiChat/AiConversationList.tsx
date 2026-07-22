// components/aiChat/AiConversationList.tsx
//
// [B2-CHAT-HISTORY] Liste des conversations du chat (onglet Assistant) : nouvelle conversation,
// bascule, suppression (2 clics — pattern confirmDeleteId existant). Rendue UNIQUEMENT dans la
// zone !isPrivacyMode d'AiChatView (les titres = premières questions → peuvent porter des montants).
//
// ⚠️ Toutes les actions sont DÉSACTIVÉES pendant un envoi en vol (isLoading) : la boucle agentique
// met à jour la bulle par id dans `aiConversation` — permuter les messages sous elle perdrait la
// réponse payée (même classe que le garde « Effacer » du header).

import React, { useState } from 'react';
import { Icon } from '../ui/Icon';
import { useFinanceStore } from '../../store/useFinanceStore';
import {
    startNewConversation, switchConversation, deleteConversation,
} from '../../services/aiChat/conversations';
import { deleteAttachmentsFromDrive } from '../../services/aiChat/attachmentDriveStore';

interface AiConversationListProps {
    isLoading: boolean;
    /** Rendu compact (sélecteur mobile) ou sidebar (md+). */
    compact?: boolean;
}

function useConversationActions(isLoading: boolean) {
    const doNew = () => {
        if (isLoading) return;
        const s = useFinanceStore.getState();
        s.setAppState(startNewConversation(s));
    };
    const doSwitch = (id: string) => {
        if (isLoading) return;
        const s = useFinanceStore.getState();
        const patch = switchConversation(s, id);
        if (patch) s.setAppState(patch);
    };
    const doDelete = (id: string) => {
        if (isLoading) return;
        const s = useFinanceStore.getState();
        const res = deleteConversation(s, id);
        if (res) {
            s.setAppState(res.patch);
            // [B2] Nettoyage des fichiers Drive des pièces jointes de la conversation supprimée
            // (best-effort — pas d'orphelins accumulés). Jamais en mode test.
            if (!s.isTestMode && res.removedMessageIds.length > 0) {
                void deleteAttachmentsFromDrive(res.removedMessageIds);
            }
        }
    };
    return { doNew, doSwitch, doDelete };
}

const fmtDate = (iso: string): string => {
    try {
        return new Date(iso).toLocaleDateString('fr-CA', { month: 'short', day: 'numeric' });
    } catch { return ''; }
};

export const AiConversationList: React.FC<AiConversationListProps> = ({ isLoading, compact = false }) => {
    const aiConversations = useFinanceStore((s) => s.aiConversations) ?? [];
    const activeId = useFinanceStore((s) => s.activeAiConversationId);
    const activeCount = useFinanceStore((s) => s.aiConversation).length;
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const { doNew, doSwitch, doDelete } = useConversationActions(isLoading);

    if (compact) {
        // Mobile : sélecteur natif (accessible clavier/SR sans travail custom) + bouton nouvelle.
        return (
            <div className="flex gap-2 items-center">
                <label htmlFor="ai-conv-select" className="sr-only">Conversations précédentes</label>
                <select
                    id="ai-conv-select"
                    value=""
                    disabled={isLoading || aiConversations.length === 0}
                    onChange={(e) => { if (e.target.value) doSwitch(e.target.value); }}
                    className="flex-1 bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-2 text-meta text-ink-200 focus-ring disabled:opacity-40"
                >
                    <option value="" disabled>
                        {aiConversations.length === 0 ? 'Aucune conversation archivée' : `Historique (${aiConversations.length})…`}
                    </option>
                    {aiConversations.map((c) => (
                        <option key={c.id} value={c.id}>{c.title} — {fmtDate(c.updatedAt)}</option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={doNew}
                    disabled={isLoading || activeCount === 0}
                    aria-label="Nouvelle conversation"
                    title="Nouvelle conversation"
                    className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 text-ink-200 inline-flex items-center justify-center focus-ring disabled:opacity-40"
                >
                    <Icon name="plus" size={16} />
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full min-h-0 w-64 border-r border-white/5 bg-white/[0.02]">
            <div className="p-3 border-b border-white/5">
                <button
                    type="button"
                    onClick={doNew}
                    disabled={isLoading || activeCount === 0}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/15 rounded-card text-meta text-ink-100 font-medium focus-ring disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <Icon name="plus" size={14} aria-hidden="true" />Nouvelle conversation
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1" role="list" aria-label="Conversations précédentes">
                {aiConversations.length === 0 && (
                    <p className="text-tiny text-ink-400 px-2 py-3">
                        Tes conversations archivées apparaîtront ici (synchronisées via Drive).
                    </p>
                )}
                {aiConversations.map((c) => (
                    <div key={c.id} role="listitem" className="group flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => doSwitch(c.id)}
                            disabled={isLoading}
                            className="flex-1 text-left px-2.5 py-2 rounded-lg hover:bg-white/5 focus-ring disabled:opacity-40 min-w-0"
                            title={c.title}
                        >
                            <span className="block text-meta text-ink-100 truncate">{c.title}</span>
                            <span className="block text-tiny text-ink-400">
                                {fmtDate(c.updatedAt)} · {c.messages.length} message{c.messages.length > 1 ? 's' : ''}
                            </span>
                        </button>
                        {confirmDeleteId === c.id ? (
                            <button
                                type="button"
                                onClick={() => { doDelete(c.id); setConfirmDeleteId(null); }}
                                disabled={isLoading}
                                aria-label={`Confirmer la suppression de la conversation ${c.title}`}
                                className="min-w-[28px] min-h-[28px] inline-flex items-center justify-center rounded-lg bg-danger-500/20 text-danger-400 hover:bg-danger-500/30 focus-ring text-tiny font-bold"
                            >
                                Oui
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setConfirmDeleteId(c.id)}
                                disabled={isLoading}
                                aria-label={`Supprimer la conversation ${c.title}`}
                                className="min-w-[28px] min-h-[28px] inline-flex items-center justify-center rounded-lg text-ink-400 hover:text-danger-400 hover:bg-white/5 focus-ring opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                            >
                                <Icon name="trash" size={13} />
                            </button>
                        )}
                    </div>
                ))}
            </div>
            {activeId && activeCount > 0 && (
                <p className="p-3 text-tiny text-ink-400 border-t border-white/5">
                    Conversation en cours : elle s'archive quand tu en ouvres une autre.
                </p>
            )}
        </div>
    );
};
