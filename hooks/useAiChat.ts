// hooks/useAiChat.ts
//
// [AITOOLS-C] Logique PARTAGÉE du chat Claude in-app (tool-use) — consommée par l'onglet Assistant
// (AiAssistant) aujourd'hui, par le panneau latéral global au Lot E (UNE logique, deux surfaces).
//
// Contrats :
//  - transcript = `aiConversation` du store (persisté/synchronisé LÉGER : rôle + texte + libellés
//    d'outils — les payloads tool_use/tool_result restent en mémoire de session, ADR-4) ;
//  - état = snapshot appStateProvider (validé + cloné + sans apiKeys) via runAgentLoop ;
//  - fins dégradées (error/truncated/refused) : le texte porte déjà le marqueur honnête ;
//  - annulation par AbortController (le tour API en vol est interrompu).

import { useCallback, useRef, useState } from 'react';
import type Anthropic from '@anthropic-ai/sdk';
import { useFinanceStore } from '../store/useFinanceStore';
import { runAgentLoop } from '../services/aiTools/agentLoop';
import { appStateProvider } from '../services/aiTools/appStateProvider';
import { neutralizeFrameTags } from '../utils/promptSafety';
import { logError } from '../services/errorLogger';
import type { AiMessage } from '../types';

/** Libellés FR lisibles des tools pour les chips « a consulté : X ». */
export const TOOL_LABELS: Record<string, string> = {
    get_financial_overview: 'Vue d\'ensemble',
    get_holdings: 'Placements',
    get_projection: 'Projection',
    get_tax_situation: 'Situation fiscale',
    get_retirement_outlook: 'Retraite',
    get_next_best_actions: 'Signaux financiers',
    search_transactions: 'Transactions',
    simulate_what_if: 'Simulation what-if',
    get_tax_room: 'Espace CELI',
    calculate_real_estate: 'Calcul immobilier',
    run_projection: 'Calculateur de projection',
};

export interface UseAiChat {
    isLoading: boolean;
    /** Libellés des tools en cours de consultation pour l'envoi actif (chips live). */
    activeTools: string[];
    sendMessage: (text: string) => Promise<void>;
    cancel: () => void;
    clearConversation: () => void;
}

const HISTORY_WINDOW = 10;

export function useAiChat(apiKey: string): UseAiChat {
    const [isLoading, setIsLoading] = useState(false);
    const [activeTools, setActiveTools] = useState<string[]>([]);
    const abortRef = useRef<AbortController | null>(null);

    const appendMessage = useCallback((msg: AiMessage) => {
        const { aiConversation, setAppState } = useFinanceStore.getState();
        setAppState({ aiConversation: [...aiConversation, msg] });
    }, []);

    const updateLastModelMessage = useCallback((patch: Partial<AiMessage>) => {
        const { aiConversation, setAppState } = useFinanceStore.getState();
        if (aiConversation.length === 0 || aiConversation[aiConversation.length - 1].role !== 'model') return;
        const updated = [...aiConversation];
        updated[updated.length - 1] = { ...updated[updated.length - 1], ...patch };
        setAppState({ aiConversation: updated });
    }, []);

    const sendMessage = useCallback(async (rawText: string) => {
        const userText = rawText.trim();
        if (!userText || isLoading) return;
        if (!apiKey) {
            appendMessage({ role: 'user', text: userText, timestamp: new Date().toISOString() });
            appendMessage({
                role: 'model',
                text: 'Clé API Anthropic manquante — configure-la dans Réglages → Clés API pour discuter avec moi.',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        appendMessage({ role: 'user', text: userText, timestamp: new Date().toISOString() });
        setIsLoading(true);
        setActiveTools([]);

        // H3 (sécurité, hérité de l'ancien assistant) : neutraliser les fausses balises de cadre
        // dans l'HISTORIQUE (un libellé importé peut y ressortir) et le tour utilisateur.
        // NB : slice APRÈS l'append du message utilisateur → le tour courant EST dans l'historique.
        const recent = useFinanceStore.getState().aiConversation.slice(-HISTORY_WINDOW);
        const history: Anthropic.MessageParam[] = recent
            .map((m) => ({
                role: (m.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant',
                content: neutralizeFrameTags(m.text),
            }))
            .filter((m) => m.content.trim() !== ''); // l'API rejette un content vide

        // Message modèle « vide » rempli au fil du stream.
        appendMessage({ role: 'model', text: '', timestamp: new Date().toISOString(), toolsUsed: [] });
        abortRef.current = new AbortController();
        let accumulated = '';
        const usedLabels: string[] = [];

        try {
            const result = await runAgentLoop(history, {
                apiKey,
                getState: appStateProvider,
                signal: abortRef.current.signal,
                onTextDelta: (delta) => {
                    accumulated += delta;
                    updateLastModelMessage({ text: accumulated });
                },
                onToolUse: (toolName) => {
                    const label = TOOL_LABELS[toolName] ?? toolName;
                    usedLabels.push(label);
                    setActiveTools([...usedLabels]);
                    updateLastModelMessage({ toolsUsed: [...usedLabels] });
                },
            });
            // Le texte FINAL fait foi (marqueurs honnêtes [Réponse coupée]/[Erreur]/[Limite atteinte]
            // inclus — les deltas streamés ne portent pas ces marqueurs ajoutés en fin de boucle).
            updateLastModelMessage({
                text: result.text.trim() !== '' ? result.text : 'Oups — aucune réponse reçue. Réessaie dans un instant.',
                toolsUsed: [...usedLabels],
            });
        } catch (e) {
            // runAgentLoop rend les échecs API en RÉSULTAT — un throw ici = abort utilisateur ou bug
            // inattendu. Message honnête, jamais un texte vide qui ressemble à une réponse.
            const aborted = e instanceof DOMException || (e instanceof Error && e.name === 'AbortError');
            if (!aborted) {
                logError({ source: 'ai', severity: 'error', message: 'Chat in-app : échec inattendu de la boucle', error: e });
            }
            updateLastModelMessage({
                text: accumulated || (aborted ? '[Annulé]' : 'Oups — la conversation a échoué. Réessaie dans un instant.'),
            });
        } finally {
            setIsLoading(false);
            setActiveTools([]);
            abortRef.current = null;
        }
    }, [apiKey, isLoading, appendMessage, updateLastModelMessage]);

    const cancel = useCallback(() => {
        abortRef.current?.abort(new DOMException('User cancelled', 'AbortError'));
    }, []);

    const clearConversation = useCallback(() => {
        useFinanceStore.getState().setAppState({ aiConversation: [] });
    }, []);

    return { isLoading, activeTools, sendMessage, cancel, clearConversation };
}
