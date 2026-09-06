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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWriteConfirmation } from './useWriteConfirmation';
import type Anthropic from '@anthropic-ai/sdk';
import { useFinanceStore } from '../store/useFinanceStore';
import type { WritePreview, WriteDecision } from '../services/aiTools/writeExecutor';
import { neutralizeFrameTags } from '../utils/promptSafety';
import { importWithRetry, isChunkLoadError } from '../utils/lazyWithRetry';
import { logError } from '../services/errorLogger';
import type { AiMessage } from '../types';
// [AITOOLS-B1] Pièces jointes : module LÉGER (aucun import lourd — types SDK effacés) → statique OK.
import {
    readAttachment, buildUserContent, cacheAttachments, getCachedAttachments,
    pruneAttachmentCache, unavailableAttachmentsNote,
    totalAttachmentBytes, MAX_ATTACHMENTS_PER_MESSAGE, MAX_TOTAL_ATTACHMENT_BYTES,
    type AiAttachmentPayload,
} from '../services/aiChat/attachments';
import { aliveAttachmentMessageIds } from '../services/aiChat/conversations';
// [B3+B4] Modèle par conversation + coût réel — modules purs/légers (boot-safe en import statique).
import { MODEL_IDS, resolveChatModelKey } from '../services/aiChat/models';
import { chatCostUsd } from '../services/aiChat/pricing';
import { flushPush } from '../services/sync/syncOrchestrator';
// [CHAT-PAGE-CONTEXT] Contexte d'écran (module pur, boot-safe) — lu en IMPÉRATIF à l'envoi.
import { describeViewContextForPrompt } from '../services/aiChat/viewContext';
// [B2] Octets des pièces jointes en fichiers Drive appdata SÉPARÉS (cross-device) — best-effort,
// jamais bloquant, module léger (fetch nu, aucun SDK).
import { pushAttachmentsToDrive, fetchAttachmentsFromDrive, deleteAttachmentsFromDrive } from '../services/aiChat/attachmentDriveStore';

// [AITOOLS-E] Imports DYNAMIQUES du lourd (agentLoop tire le SDK Anthropic, writeExecutor tire
// applyDocument + le moteur de backup) : ce hook est désormais monté au niveau App via AiChatProvider
// (une seule instance partagée entre le panneau global et l'onglet). Un import STATIQUE de ces modules
// tirerait le SDK dans le bundle de BOOT (règle CLAUDE.md) → on ne les charge qu'au 1er envoi.

/** Libellés FR lisibles des tools pour les chips « a consulté : X ». */
const TOOL_LABELS: Record<string, string> = {
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
    /** [AITOOLS-B1] `files` : pièces jointes DÉJÀ validées par l'UI (classifyAttachment à la sélection). */
    sendMessage: (text: string, files?: File[]) => Promise<void>;
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
    // [AI-TAXCENTER-APPLY-NOGATE] Plomberie PARTAGÉE — voir `hooks/useWriteConfirmation.ts`.
    const { pendingWrite, requestConfirmation, resolvePendingWrite, hasPendingWrite, refuserAuDemontage } = useWriteConfirmation();

    // [Finding panel sécurité 2026-07-21 — CRITIQUE, mesuré] Le modal de confirmation affiche des
    // MONTANTS. Si le mode discret s'active PENDANT qu'une confirmation est en attente (ex. quelqu'un
    // entre dans la pièce), il faut que la valeur SORTE de l'écran (Loi 25, ADR-5 « masquer = ne pas
    // rendre »). On REFUSE l'écriture en attente (cohérent avec « fermer = refus » : Échap/backdrop/✕)
    // → pendingWrite repasse à null → le modal disparaît. L'utilisateur redemande hors mode discret.

    const appendMessage = useCallback((msg: AiMessage) => {
        const { aiConversation, setAppState } = useFinanceStore.getState();
        setAppState({ aiConversation: [...aiConversation, msg] });
    }, []);

    // Mise à jour PAR IDENTITÉ (finding panel : « le dernier message » se trompait de cible après
    // un Effacer mi-stream ou un chevauchement — la réponse payée atterrissait dans la mauvaise
    // bulle ou disparaissait). No-op si le message n'existe plus (conversation effacée) : assumé
    // côté UI (Effacer désactivé pendant un envoi), mais un PULL Drive concurrent (polling 60 s,
    // remplacement intégral de l'état) peut aussi faire disparaître l'id mi-vol → TRACÉ (finding
    // panel #489 : la réponse payée + son costUsd se perdaient sans aucun signal). Dédup par id —
    // jamais un logError par delta de stream (règle throttle HARDEN-NETWORTH-NAN).
    const missingMsgWarnedRef = useRef<Set<string>>(new Set());
    const updateModelMessage = useCallback((id: string, patch: Partial<AiMessage>) => {
        const { aiConversation, setAppState } = useFinanceStore.getState();
        const idx = aiConversation.findIndex((m) => m.id === id);
        if (idx === -1) {
            if (!missingMsgWarnedRef.current.has(id)) {
                missingMsgWarnedRef.current.add(id);
                logError({
                    source: 'ai', severity: 'warning',
                    message: 'Chat in-app : message cible introuvable pendant la mise à jour (conversation remplacée mi-vol — pull Drive/effacement) : la réponse en cours ne sera pas affichée.',
                });
            }
            return;
        }
        const updated = [...aiConversation];
        updated[idx] = { ...updated[idx], ...patch };
        setAppState({ aiConversation: updated });
    }, []);

    const sendMessage = useCallback(async (rawText: string, files?: File[]) => {
        const userText = rawText.trim();
        const hasFiles = (files?.length ?? 0) > 0;
        if ((!userText && !hasFiles) || inFlightRef.current) return;
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

        // [Finding panel B2 ÉLEVÉ — course PROUVÉE par sonde] Les flags d'envoi montent AVANT le
        // premier `await` (la lecture des fichiers cède la main à l'event loop) : sinon, pendant la
        // lecture d'une pièce jointe, `isLoading` restait false → la sidebar des conversations
        // permettait une bascule/nouvelle conversation et le message atterrissait dans la MAUVAISE
        // conversation. Tout chemin de sortie repasse par le `finally` global ci-dessous.
        inFlightRef.current = true;
        setIsLoading(true);
        // [CHAT-PAGE-CONTEXT] Contexte d'écran capturé en SYNCHRONE, AVANT le premier await (comme
        // les flags ci-dessus — même leçon B2) : une navigation pendant la lecture des pièces
        // jointes ne peut pas faire répondre le chat sur une AUTRE page que celle qui a motivé la
        // question. Figé pour toute la boucle via le `system` (jamais relu mi-envoi).
        // [Finding sécurité #490 — ÉLEVÉ] Gate mode discret AU CHOKEPOINT D'ENVOI lui-même
        // (ceinture) : le publisher purge déjà le détail à la source et le chat entier est masqué
        // en mode discret (ADR-5), mais le point d'égress réseau doit être gardé EN PROPRE — une
        // future évolution (masquage partiel, appel programmatique) ne doit pas pouvoir faire
        // fuiter la ligne de contexte en silence.
        const sendState = useFinanceStore.getState();
        const viewContextLine = sendState.isPrivacyMode
            ? undefined
            : describeViewContextForPrompt(sendState.activeTab);
        try {

        // [AITOOLS-B1] Lecture des pièces jointes AVANT tout append : un fichier illisible refuse
        // l'envoi ENTIER honnêtement (jamais d'envoi partiel silencieux — le message resterait dans
        // le transcript en laissant croire que le document a été analysé).
        let payloads: AiAttachmentPayload[] = [];
        if (hasFiles) {
            // Ceinture (finding panel FAIBLE) : la troncature à 5 ne doit jamais être silencieuse —
            // l'UI plafonne déjà avec un toast, mais un futur appelant programmatique (drag-drop, B2)
            // pourrait bypasser addFiles.
            if (files!.length > MAX_ATTACHMENTS_PER_MESSAGE) {
                logError({
                    source: 'ui', severity: 'warning',
                    message: `Chat in-app : ${files!.length - MAX_ATTACHMENTS_PER_MESSAGE} pièce(s) jointe(s) au-delà du maximum de ${MAX_ATTACHMENTS_PER_MESSAGE} ignorée(s).`,
                });
            }
            const capped = files!.slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
            // Budget AGRÉGÉ (finding panel ÉLEVÉ) : chaque fichier peut être valide seul mais la
            // SOMME dépasser la limite API par requête (~32 Mo, base64 ×4/3) — refus honnête AVANT
            // d'envoyer une requête qui échouerait en générique après coup.
            if (totalAttachmentBytes(capped) > MAX_TOTAL_ATTACHMENT_BYTES) {
                appendMessage({
                    id: nextMessageId(), role: 'model', timestamp: new Date().toISOString(),
                    text: `Les pièces jointes totalisent ${(totalAttachmentBytes(capped) / (1024 * 1024)).toFixed(1)} Mo — le maximum par message est ${(MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(0)} Mo. Retire un fichier et renvoie.`,
                });
                return;
            }
            try {
                payloads = await Promise.all(capped.map(readAttachment));
            } catch (e) {
                // ⚠️ Le nom de fichier peut porter un MONTANT (« releve_230000.pdf ») et le scrub
                // du journal ne masque que les montants FORMATÉS → JAMAIS l'Error brute (message +
                // stack) dans logError (finding panel sécurité). Le détail reste visible dans le
                // chat (gaté mode discret), le journal ne garde qu'un motif générique.
                logError({
                    source: 'ui', severity: 'warning',
                    message: 'Chat in-app : lecture d\'une pièce jointe échouée (type/taille invalide ou fichier illisible) — envoi refusé.',
                });
                appendMessage({
                    id: nextMessageId(), role: 'model', timestamp: new Date().toISOString(),
                    text: `Je n'ai pas pu lire une des pièces jointes${e instanceof Error && e.message ? ` (${e.message})` : ''} — le message n'a pas été envoyé. Retape ton message et rejoins tes fichiers.`,
                });
                return;
            }
        }

        const userMsgId = nextMessageId();
        appendMessage({
            id: userMsgId, role: 'user', text: userText, timestamp: new Date().toISOString(),
            // Transcript LÉGER (ADR-4) : métadonnées seulement — les octets vont au cache de session.
            ...(payloads.length > 0
                ? { attachments: payloads.map(({ name, kind, mimeType, size }) => ({ name, kind, mimeType, size })) }
                : {}),
        });
        if (payloads.length > 0) {
            cacheAttachments(userMsgId, payloads);
            // [B2] Cross-device : octets poussés en fichier Drive appdata SÉPARÉ (fire-and-forget —
            // un échec = comportement B1, note honnête sur l'autre appareil). JAMAIS en mode test
            // (une pièce jointe de démo ne doit pas atterrir dans le vrai Drive).
            if (!useFinanceStore.getState().isTestMode) pushAttachmentsToDrive(userMsgId, payloads);
        }
        setActiveTools([]);
        // Éviction : les payloads des messages sortis de la fenêtre d'historique ne seront plus
        // jamais relus (finding panel — croissance mémoire non bornée sur longue session).
        // [B2] La fenêtre de CHAQUE conversation (active + archivées) reste vivante : une bascule
        // de conversation retrouve ses pièces jointes en session.
        pruneAttachmentCache(aliveAttachmentMessageIds(useFinanceStore.getState(), HISTORY_WINDOW));

        // H3 (sécurité, hérité de l'ancien assistant) : neutraliser les fausses balises de cadre
        // dans l'HISTORIQUE (un libellé importé peut y ressortir) et le tour utilisateur.
        // NB : slice APRÈS l'append du message utilisateur → le tour courant EST dans l'historique.
        // [AITOOLS-B1] Un tour utilisateur à pièces jointes redevient MULTIMODAL tant que le contenu
        // est dans le cache de session (questions de suivi sur le même document) ; après un reload,
        // le contenu n'existe plus → note honnête (le modèle ne reçoit jamais un contenu fabriqué).
        const recent = useFinanceStore.getState().aiConversation.slice(-HISTORY_WINDOW);
        // [B2] Cache-miss local (autre appareil / reload) : tentative de récupération des octets
        // depuis Drive AVANT de construire l'historique — une seule fois par id et par session
        // (les ratés sont mémorisés), jamais de popup, skip en mode test. Échec → note honnête (B1).
        if (!useFinanceStore.getState().isTestMode) {
            for (const m of recent) {
                if (m.role === 'user' && m.id && (m.attachments?.length ?? 0) > 0 && !getCachedAttachments(m.id)) {
                    const fetched = await fetchAttachmentsFromDrive(m.id);
                    if (fetched) cacheAttachments(m.id, fetched);
                }
            }
        }
        const history: Anthropic.MessageParam[] = recent
            .map((m): Anthropic.MessageParam => {
                const role = (m.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant';
                const neutralized = neutralizeFrameTags(m.text);
                if (role === 'user' && m.attachments && m.attachments.length > 0) {
                    const cached = getCachedAttachments(m.id);
                    const note = unavailableAttachmentsNote(m.attachments);
                    if (cached && cached.length > 0) {
                        const blocks = buildUserContent(neutralized, cached);
                        // Ceinture (finding panel CRITIQUE) : si TOUS les blocs ont été omis
                        // (payloads incohérents), le tour ne doit JAMAIS s'évaporer de l'historique
                        // — retomber sur la note honnête, comme post-reload.
                        if (blocks.length > 0) return { role, content: blocks };
                    }
                    return { role, content: neutralized.trim() !== '' ? `${neutralized}\n\n${note}` : note };
                }
                return { role, content: neutralized };
            })
            .filter((m) => (typeof m.content === 'string' ? m.content.trim() !== '' : m.content.length > 0)); // l'API rejette un content vide

        // [Finding panel ÉLEVÉ — coût BYOK] Point de cache Anthropic (`cache_control` ephemeral) sur
        // le DERNIER bloc de pièce jointe de l'historique : le préfixe (system + tools + tours
        // précédents + les octets du document) est alors re-servi depuis le cache aux tours 2-6 de
        // la même boucle ET aux messages suivants (TTL ~5 min) au lieu d'être re-facturé plein tarif
        // (un PDF de 10 Mo était re-transmis jusqu'à ~30×). UN seul point de cache (limite API : 4).
        for (let i = history.length - 1; i >= 0; i--) {
            const content = history[i].content;
            if (typeof content === 'string') continue;
            const attachmentBlocks = content.filter((b) => b.type === 'image' || b.type === 'document');
            if (attachmentBlocks.length > 0) {
                (attachmentBlocks[attachmentBlocks.length - 1] as { cache_control?: { type: 'ephemeral' } }).cache_control = { type: 'ephemeral' };
                break;
            }
        }

        // Message modèle « vide » (ID capturé — toutes les mises à jour de CET envoi le ciblent).
        const modelMsgId = nextMessageId();
        appendMessage({ id: modelMsgId, role: 'model', text: '', timestamp: new Date().toISOString(), toolsUsed: [] });
        abortRef.current = new AbortController();
        let accumulated = '';
        const usedLabels: string[] = [];

        try {
            // [AITOOLS-E] Chargement à la demande (boot-safe) — le SDK Anthropic n'entre dans aucun
            // chunk avant le 1er message. vi.mock intercepte aussi les imports dynamiques (tests OK).
            // [Finding panel ai-reviewer] Enveloppé dans importWithRetry (même protection anti-chunk-
            // périmé que le reste de l'app) : un déploiement Vercel entre l'ouverture de l'onglet et le
            // 1er message ferait sinon boucler le 404 sans réparation possible.
            const [{ runAgentLoop }, { appStateProvider }, { executeWriteTool }] = await importWithRetry(
                () => Promise.all([
                    import('../services/aiTools/agentLoop'),
                    import('../services/aiTools/appStateProvider'),
                    import('../services/aiTools/writeExecutor'),
                ]),
                'aiChat',
            );
            // [B3-CHAT-MODEL] Modèle DE la conversation active, capturé à l'envoi (un changement de
            // sélecteur pendant le stream ne s'applique qu'au message suivant — cohérence coût/réponse).
            const modelId = MODEL_IDS[resolveChatModelKey(useFinanceStore.getState().aiChatModel)];
            const result = await runAgentLoop(history, {
                apiKey,
                model: modelId,
                viewContextLine,
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
            // [B4-CHAT-COST] Coût RÉEL de l'envoi (tokens facturés × tarif du modèle), crédité sur
            // TOUS les stopReasons — une annulation/un échec au tour N a payé les tours aboutis.
            // Ceinture : un résultat SANS usage (mock/version décalée) = coût non mesuré, silencieux ;
            // un usage AVEC modèle sans tarif (dérive de table) = trace, jamais un costUsd fabriqué.
            let cost: number | null = null;
            if (result.usage) {
                cost = chatCostUsd(result.usage, modelId);
                if (cost === null) {
                    logError({
                        source: 'ai', severity: 'warning',
                        message: `Chat in-app : aucun tarif connu pour le modèle ${modelId} — coût non comptabilisé (table pricing à mettre à jour).`,
                    });
                }
            }
            if (cost !== null && cost > 0) {
                const s = useFinanceStore.getState();
                s.setAppState({ aiChatCostUsdTotal: (s.aiChatCostUsdTotal ?? 0) + cost });
            }
            // Le texte FINAL fait foi (marqueurs honnêtes [Réponse coupée]/[Erreur]/[Annulé]/
            // [Limite atteinte] inclus — les deltas streamés ne portent pas ces marqueurs).
            updateModelMessage(modelMsgId, {
                text: result.text.trim() !== '' ? result.text : 'Oups — aucune réponse reçue. Réessaie dans un instant.',
                toolsUsed: [...usedLabels],
                ...(cost !== null && cost > 0 ? { costUsd: cost } : {}),
            });
        } catch (e) {
            // runAgentLoop rend les échecs (API, abort, état corrompu) en RÉSULTAT — un throw ici
            // = bug inattendu OU chunk périmé dont le reload a été refusé (garde anti-boucle).
            logError({ source: 'ai', severity: 'error', message: 'Chat in-app : échec inattendu de la boucle', error: e });
            // Message HONNÊTE et actionnable : distinguer « nouvelle version » (recharger) d'un vrai bug.
            const chunkStale = isChunkLoadError(e);
            updateModelMessage(modelMsgId, {
                text: accumulated || (chunkStale
                    ? 'Une nouvelle version de l\'app est disponible — recharge la page (Ctrl/Cmd+R), puis repose ta question.'
                    : 'Oups — la conversation a échoué. Réessaie dans un instant.'),
            });
        } finally {
            setActiveTools([]);
            abortRef.current = null;
        }

        // Fin du bloc ouvert AVANT le premier await (fix course B2) : tout chemin — succès, refus
        // de budget/lecture, throw — rend la main proprement (les actions de conversation dégèlent).
        } finally {
            inFlightRef.current = false;
            setIsLoading(false);
            // Pousse le coût du chat (et le message final) au serveur TOUT DE SUITE, sans
            // attendre le debounce de 8 s : le hub perso voit le coût à jour au prochain
            // refresh. flushPush est gardé (no-op si non connecté / conflit / rien de neuf).
            flushPush();
        }
    }, [apiKey, appendMessage, updateModelMessage, requestConfirmation]);

    const cancel = useCallback(() => {
        // Une écriture en attente de confirmation est REFUSÉE par l'annulation (le modal se ferme,
        // writeExecutor rend « refusé ») — puis le tour API en vol est interrompu.
        if (hasPendingWrite()) resolvePendingWrite('cancel');
        abortRef.current?.abort(new DOMException('User cancelled', 'AbortError'));
    }, [resolvePendingWrite, hasPendingWrite]);

    // [Findings panel — ceinture de démontage] CEINTURE au démontage du PROVIDER (`AiChatProvider`,
    // seul appelant de ce hook depuis AITOOLS-E). ⚠️ Depuis le Lot E, le provider vit au niveau App et
    // n'est PLUS démonté par un changement d'onglet (c'était le scénario CRITIQUE du Lot D, désormais
    // résolu à la racine — cf `components/aiChat/AiChatContext.tsx`). Ce cleanup reste néanmoins requis
    // pour tout démontage RÉEL du provider (fin de vie de l'app, route conditionnelle, harnais de test) :
    // une confirmation en attente est refusée + le tour API en vol aborté, pour ne jamais laisser une
    // promesse `requestConfirmation` orpheline. On NE passe PAS par `resolvePendingWrite` (son
    // `setPendingWrite` ferait un setState sur composant démonté) ; les refs sont stables → deps [].
    useEffect(() => {
        return () => {
            if (refuserAuDemontage()) {
                logError({
                    source: 'ai', severity: 'warning',
                    message: 'Chat in-app : écriture en attente de confirmation abandonnée au démontage du provider — refusée automatiquement.',
                });
            }
            abortRef.current?.abort(new DOMException('Unmounted', 'AbortError'));
        };
    }, [refuserAuDemontage]);

    const clearConversation = useCallback(() => {
        // Ceinture : ne JAMAIS vider pendant un envoi (la réponse en cours — déjà payée — serait
        // perdue sans trace). L'UI désactive le bouton, ce garde couvre les appels programmatiques.
        if (inFlightRef.current) return;
        const s = useFinanceStore.getState();
        const clearedIds = s.aiConversation.map((m) => m.id).filter((x): x is string => Boolean(x));
        s.setAppState({ aiConversation: [] });
        // [B2] Effacer = suppression DÉFINITIVE de la conversation ACTIVE seulement : on ne vide
        // plus TOUT le cache (les payloads des conversations ARCHIVÉES doivent survivre à un
        // Effacer de l'active) — éviction par liste vivante + nettoyage des fichiers Drive associés.
        pruneAttachmentCache(aliveAttachmentMessageIds(useFinanceStore.getState(), HISTORY_WINDOW));
        if (!s.isTestMode && clearedIds.length > 0) void deleteAttachmentsFromDrive(clearedIds);
    }, []);

    return { isLoading, activeTools, pendingWrite, resolvePendingWrite, sendMessage, cancel, clearConversation };
}
