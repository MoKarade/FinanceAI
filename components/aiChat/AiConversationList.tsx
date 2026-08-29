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
    startNewConversation, switchConversation, deleteConversation, aliveAttachmentMessageIds,
} from '../../services/aiChat/conversations';
import { deleteAttachmentsFromDrive } from '../../services/aiChat/attachmentDriveStore';
import { pruneAttachmentCache } from '../../services/aiChat/attachments';
import { logError } from '../../services/errorLogger';
// [B4-CHAT-COST] Coût par conversation archivée (Σ des réponses) — affiché en CAD via fxRates.USD.
import { sumMessagesCostUsd } from '../../services/aiChat/pricing';
import { resolveChatModelKey } from '../../services/aiChat/models';
import { formatCostCad } from '../../utils/format';

interface AiConversationListProps {
    isLoading: boolean;
    /** Rendu compact (sélecteur mobile) ou sidebar (md+). */
    compact?: boolean;
}

const HISTORY_WINDOW = 10; // même fenêtre que useAiChat (éviction du cache de pièces jointes)

/** Nettoyage commun post-transition : cache mémoire + fichiers Drive des messages sortis. */
function cleanupRemoved(removedMessageIds: string[]): void {
    const s = useFinanceStore.getState();
    pruneAttachmentCache(aliveAttachmentMessageIds(s, HISTORY_WINDOW));
    if (!s.isTestMode && removedMessageIds.length > 0) {
        void deleteAttachmentsFromDrive(removedMessageIds);
    }
}

function useConversationActions(isLoading: boolean, announce: (msg: string) => void) {
    const doNew = () => {
        if (isLoading) return;
        const s = useFinanceStore.getState();
        const { patch, droppedMessageIds } = startNewConversation(s);
        s.setAppState(patch);
        cleanupRemoved(droppedMessageIds);
        announce('Nouvelle conversation démarrée.');
    };
    const doSwitch = (id: string) => {
        if (isLoading) return;
        const s = useFinanceStore.getState();
        const res = switchConversation(s, id);
        if (!res) {
            // [Finding panel] Id devenu invalide (liste périmée par une sync concurrente) : tracé,
            // jamais un no-op muet qui laisserait le sélecteur mobile inerte sans explication.
            logError({ source: 'ui', severity: 'warning', message: 'Chat : bascule vers une conversation introuvable (liste probablement périmée par la sync).' });
            announce('Conversation introuvable — la liste vient peut-être d\'être mise à jour.');
            return;
        }
        const title = s.aiConversations?.find((c) => c.id === id)?.title ?? '';
        s.setAppState(res.patch);
        cleanupRemoved(res.droppedMessageIds);
        announce(`Conversation chargée : ${title}`);
    };
    const doDelete = (id: string) => {
        if (isLoading) return;
        const s = useFinanceStore.getState();
        const res = deleteConversation(s, id);
        if (!res) {
            logError({ source: 'ui', severity: 'warning', message: 'Chat : suppression d\'une conversation introuvable (liste probablement périmée par la sync).' });
            return;
        }
        s.setAppState(res.patch);
        // [B2] Nettoyage des fichiers Drive + du cache mémoire des pièces jointes supprimées
        // (finding panel : le cache n'était purgé qu'au prochain envoi). Jamais en mode test.
        cleanupRemoved(res.removedMessageIds);
        announce('Conversation supprimée.');
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
    const fxUsd = useFinanceStore((s) => s.fxRates.USD);
    // Sélecteur ATOMIQUE (finding panel perf) : retourner le tableau re-rendait la sidebar à
    // CHAQUE delta streamé (updateModelMessage recrée le tableau) pour un .length inchangé.
    const activeCount = useFinanceStore((s) => s.aiConversation.length);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    // [Finding panel a11y] Annonce SR des transitions (bascule/suppression/confirmation) + point de
    // chute du FOCUS : les boutons cliqués disparaissent du DOM (le focus retombait sur <body> à
    // CHAQUE bascule — WCAG 2.4.3) → re-focus explicite sur le conteneur de liste.
    const [srMessage, setSrMessage] = useState('');
    const listRef = React.useRef<HTMLDivElement>(null);
    const announce = (msg: string) => {
        setSrMessage(msg);
        listRef.current?.focus();
    };
    const { doNew, doSwitch, doDelete } = useConversationActions(isLoading, announce);
    const armDelete = (id: string, title: string) => {
        setConfirmDeleteId(id);
        setSrMessage(`Confirmation requise : clique à nouveau pour supprimer « ${title} ».`);
    };

    if (compact) {
        // Mobile : sélecteur natif (accessible clavier/SR sans travail custom) + bouton nouvelle.
        return (
            <div className="flex gap-2 items-center">
                <span className="sr-only" role="status" aria-live="polite">{srMessage}</span>
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
            {/* Annonce SR des transitions (bascule/suppression/confirmation — WCAG 4.1.3). */}
            <span className="sr-only" role="status" aria-live="polite">{srMessage}</span>
            {/* État vide HORS du role=list (un enfant non-listitem y est invalide, finding a11y). */}
            {aiConversations.length === 0 && (
                <p className="text-tiny text-ink-400 px-4 py-3">
                    Tes conversations archivées apparaîtront ici (synchronisées via Drive).
                </p>
            )}
            <div
                ref={listRef}
                tabIndex={-1}
                className="flex-1 overflow-y-auto p-2 space-y-1 outline-none"
                role="list"
                aria-label="Conversations précédentes"
            >
                {aiConversations.map((c) => {
                    // [Findings panel #489] resolveChatModelKey en ceinture (une valeur corrompue par
                    // la sync affichait un texte arbitraire — seul point de lecture sans la ceinture) ;
                    // coût calculé UNE fois par item (était appelé deux fois). Archive pré-B3 sans
                    // model : rien d'affiché plutôt qu'un « Sonnet » supposé.
                    const modelKey = c.model !== undefined ? resolveChatModelKey(c.model) : null;
                    const costUsd = sumMessagesCostUsd(c.messages);
                    return (
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
                                {modelKey ? ` · ${modelKey.charAt(0).toUpperCase()}${modelKey.slice(1)}` : ''}
                                {costUsd > 0 ? ` · ${formatCostCad(costUsd, fxUsd)}` : ''}
                            </span>
                        </button>
                        {confirmDeleteId === c.id ? (
                            <button
                                type="button"
                                onClick={() => { doDelete(c.id); setConfirmDeleteId(null); }}
                                disabled={isLoading}
                                aria-label={`Confirmer la suppression de la conversation ${c.title}`}
                                className="min-w-[28px] min-h-[28px] inline-flex items-center justify-center rounded-lg bg-danger-500/20 text-danger-400 hover:bg-danger-500/30 border border-danger-400 focus-ring text-tiny font-bold"
                            >
                                Oui
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => armDelete(c.id, c.title)}
                                disabled={isLoading}
                                aria-label={`Supprimer la conversation ${c.title}`}
                                className="min-w-[28px] min-h-[28px] inline-flex items-center justify-center rounded-lg text-ink-400 hover:text-danger-400 hover:bg-white/5 focus-ring md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                            >
                                <Icon name="trash" size={13} />
                            </button>
                        )}
                    </div>
                    );
                })}
            </div>
            {activeId && activeCount > 0 && (
                <p className="p-3 text-tiny text-ink-400 border-t border-white/5">
                    Conversation en cours : elle s'archive quand tu en ouvres une autre.
                </p>
            )}
        </div>
    );
};
