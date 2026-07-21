// hooks/useAiChat.ts
//
// [AITOOLS-C] Logique PARTAGÉE du chat Claude in-app (tool-use) — consommée par l'onglet Assistant
// (AiAssistant) aujourd'hui, par le panneau latéral global au Lot E (UNE logique, deux surfaces).
//
// Contrats :
//  - transcript = `aiConversation` du store (persisté/synchronisé LÉGER : rôle + texte + libellés
//    d'outils). ⚠️ Les blocs tool_use/tool_result de runAgentLoop sont JETÉS à chaque tour (les
//    tours suivants repartent du transcript texte ; les tools de lecture sont idempotents sur le
//    même état → re-consultation sans divergence). Jamais persistés (ADR-4).
//  - état = snapshot appStateProvider (validé + cloné + sans apiKeys) via runAgentLoop ;
//  - fins dégradées (error/truncated/refused/aborted) : le texte porte le marqueur honnête ;
//  - [Findings panel 2026-07-21] chaque tour modèle a un ID : les mises à jour ciblent CE message
//    (jamais « le dernier ») — un Effacer/chevauchement ne peut plus corrompre une autre bulle ;
//    garde de réentrance par REF (l'état React `isLoading` est une closure périmable).

import { useCallback, useRef, useState } from 'react';
import type Anthropic from '@anthropic-ai/sdk';
import { useFinanceStore } from '../store/useFinanceStore';
import { runAgentLoop } from '../services/aiTools/agentLoop';
import { appStateProvider } from '../services/aiTools/appStateProvider';
import { executeWriteTool, type WritePreview, type WriteDecision } from '../services/aiTools/writeExecutor';
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
    // [AITOOLS-D] Tools d'écriture — le suffixe distingue une PROPOSITION (gated par le modal de
    // confirmation) d'une simple consultation dans les chips de transparence.
    apply_debt: 'Dette (proposition d\'écriture)',
    apply_payslip: 'Fiche de paie (proposition d\'écriture)',
    apply_bank_statement: 'Relevé bancaire (proposition d\'écriture)',
    apply_broker_statement: 'Relevé de courtage (proposition d\'écriture)',
    apply_tax_slip: 'Feuillet fiscal (proposition d\'écriture)',
};

export interface UseAiChat {
    isLoading: boolean;
    /** Libellés des tools en cours de consultation pour l'envoi actif (chips live). */
    activeTools: string[];
    /** [AITOOLS-D] Écriture EN ATTENTE de confirmation (diff à afficher dans le modal) — null sinon. */
    pendingWrite: WritePreview | null;
    /** Tranche l'écriture en attente (bouton Appliquer → 'apply', Annuler → 'cancel'). */
    resolvePendingWrite: (decision: WriteDecision) => void;
    sendMessage: (text: string) => Promise<void>;
    cancel: () => void;
    clearConversation: () => void;
}

const HISTORY_WINDOW = 10;

let _msgSeq = 0;
const nextMessageId = (): string => `aimsg_${Date.now()}_${++_msgSeq}`;

export function useAiChat(apiKey: string): UseAiChat {
    const [isLoading, setIsLoading] = useState(false);
    const [activeTools, setActiveTools] = useState<string[]>([]);
    const abortRef = useRef<AbortController | null>(null);
    // Garde de réentrance SYNCHRONE (finding panel : deux sendMessage dans le même tick lisent la
    // même closure isLoading=false → deux boucles concurrentes qui se corrompent mutuellement).
    const inFlightRef = useRef(false);
    // [AITOOLS-D] Écriture en attente de confirmation : le diff pour le modal + le resolver de la
    // promesse sur laquelle writeExecutor attend le clic.
    const [pendingWrite, setPendingWrite] = useState<WritePreview | null>(null);
    const writeResolverRef = useRef<((d: WriteDecision) => void) | null>(null);

    const resolvePendingWrite = useCallback((decision: WriteDecision) => {
        const resolve = writeResolverRef.current;
        writeResolverRef.current = null;
        setPendingWrite(null);
        resolve?.(decision);
    }, []);

    const requestConfirmation = useCallback((preview: WritePreview): Promise<WriteDecision> => {
        return new Promise((resolve) => {
            writeResolverRef.current = resolve;
            setPendingWrite(preview);
        });
    }, []);

    const appendMessage = useCallback((msg: AiMessage) => {
        const { aiConversation, setAppState } = useFinanceStore.getState();
        setAppState({ aiConversation: [...aiConversation, msg] });
    }, []);

    // Mise à jour PAR IDENTITÉ (finding panel : « le dernier message » se trompait de cible après
    // un Effacer mi-stream ou un chevauchement — la réponse payée atterrissait dans la mauvaise
    // bulle ou disparaissait). No-op si le message n'existe plus (conversation effacée) : assumé,
    // le bouton Effacer est désactivé pendant un envoi (ceinture UI).
    const updateModelMessage = useCallback((id: string, patch: Partial<AiMessage>) => {
        const { aiConversation, setAppState } = useFinanceStore.getState();
        const idx = aiConversation.findIndex((m) => m.id === id);
        if (idx === -1) return;
        const updated = [...aiConversation];
        updated[idx] = { ...updated[idx], ...patch };
        setAppState({ aiConversation: updated });
    }, []);

    const sendMessage = useCallback(async (rawText: string) => {
        const userText = rawText.trim();
        if (!userText || inFlightRef.current) return;
        if (!apiKey) {
            appendMessage({ id: nextMessageId(), role: 'user', text: userText, timestamp: new Date().toISOString() });
            appendMessage({
                id: nextMessageId(),
                role: 'model',
                text: 'Clé API Anthropic manquante — configure-la dans Réglages → Clés API pour discuter avec moi.',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        inFlightRef.current = true;
        appendMessage({ id: nextMessageId(), role: 'user', text: userText, timestamp: new Date().toISOString() });
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

        // Message modèle « vide » (ID capturé — toutes les mises à jour de CET envoi le ciblent).
        const modelMsgId = nextMessageId();
        appendMessage({ id: modelMsgId, role: 'model', text: '', timestamp: new Date().toISOString(), toolsUsed: [] });
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
                    updateModelMessage(modelMsgId, { text: accumulated });
                },
                onToolUse: (toolName) => {
                    const label = TOOL_LABELS[toolName] ?? toolName;
                    usedLabels.push(label);
                    setActiveTools([...usedLabels]);
                    updateModelMessage(modelMsgId, { toolsUsed: [...usedLabels] });
                },
                // [AITOOLS-D] Écritures : diff pur → modal (requestConfirmation attend le clic) →
                // apply/refus. Sans ce callback, les tools apply_* ne seraient même pas déclarés.
                onWriteToolUse: (spec, args) => executeWriteTool(spec, args, requestConfirmation),
            });
            // Le texte FINAL fait foi (marqueurs honnêtes [Réponse coupée]/[Erreur]/[Annulé]/
            // [Limite atteinte] inclus — les deltas streamés ne portent pas ces marqueurs).
            updateModelMessage(modelMsgId, {
                text: result.text.trim() !== '' ? result.text : 'Oups — aucune réponse reçue. Réessaie dans un instant.',
                toolsUsed: [...usedLabels],
            });
        } catch (e) {
            // runAgentLoop rend les échecs (API, abort, état corrompu) en RÉSULTAT — un throw ici
            // = bug inattendu. Message honnête, jamais un texte vide qui ressemble à une réponse.
            logError({ source: 'ai', severity: 'error', message: 'Chat in-app : échec inattendu de la boucle', error: e });
            updateModelMessage(modelMsgId, {
                text: accumulated || 'Oups — la conversation a échoué. Réessaie dans un instant.',
            });
        } finally {
            inFlightRef.current = false;
            setIsLoading(false);
            setActiveTools([]);
            abortRef.current = null;
        }
    }, [apiKey, appendMessage, updateModelMessage, requestConfirmation]);

    const cancel = useCallback(() => {
        // Une écriture en attente de confirmation est REFUSÉE par l'annulation (le modal se ferme,
        // writeExecutor rend « refusé ») — puis le tour API en vol est interrompu.
        if (writeResolverRef.current) resolvePendingWrite('cancel');
        abortRef.current?.abort(new DOMException('User cancelled', 'AbortError'));
    }, [resolvePendingWrite]);

    const clearConversation = useCallback(() => {
        // Ceinture : ne JAMAIS vider pendant un envoi (la réponse en cours — déjà payée — serait
        // perdue sans trace). L'UI désactive le bouton, ce garde couvre les appels programmatiques.
        if (inFlightRef.current) return;
        useFinanceStore.getState().setAppState({ aiConversation: [] });
    }, []);

    return { isLoading, activeTools, pendingWrite, resolvePendingWrite, sendMessage, cancel, clearConversation };
}
