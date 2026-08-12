// components/aiChat/AiChatView.tsx
//
// [AITOOLS-E] Rendu PARTAGÉ de la conversation (messages, chips de transparence, suggestions, état de
// chargement nommé, champ de saisie, bannière mode test, écran mode discret). Consommé par DEUX
// surfaces via `variant` : le panneau latéral global (`panel`, compact) et l'onglet Assistant (`tab`,
// pleine page). L'état vient du context (une seule instance useAiChat) → même conversation partout.
//
// Le modal de confirmation d'écriture n'est PAS rendu ici : le provider le rend une seule fois
// (évite le double-modal si le panneau et l'onglet sont montés en même temps).

import React, { useState, useRef, useEffect } from 'react';
import { Icon, type IconName } from '../ui/Icon';
import { AiMessage, Tab } from '../../types';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useAiChatContext } from './AiChatContext';
// [AITOOLS-B1] Pièces jointes : validation à la SÉLECTION (un fichier refusé n'entre jamais dans
// les puces — message honnête immédiat), envoi multimodal via useAiChat.sendMessage(text, files).
import {
    classifyAttachment, totalAttachmentBytes, ATTACHMENT_ACCEPT,
    MAX_ATTACHMENTS_PER_MESSAGE, MAX_TOTAL_ATTACHMENT_BYTES,
} from '../../services/aiChat/attachments';
import { showToast } from '../ui/Toast';
import { AiConversationList } from './AiConversationList';
// [B3+B4] Sélecteur de modèle par conversation + coût réel (modules purs, boot-safe).
import { AI_CHAT_MODELS, resolveChatModelKey } from '../../services/aiChat/models';
import { sumMessagesCostUsd } from '../../services/aiChat/pricing';
import { formatCostCad } from '../../utils/format';
// [CHAT-PAGE-CONTEXT] Badge du contexte d'écran perçu (contestable par l'utilisateur — confiance).
import { useViewContextSnapshot } from '../../hooks/useViewContextSnapshot';
import { viewContextMatchesTab } from '../../services/aiChat/viewContext';
// [REFONTE-NAV-L6a] Chips « ancrées sur la courbe » : bâties sur le contexte Futur publié (panneau
// ouvert sur Futur) ou, sur la page Assistant, directement sur la source unique lastProjection.
import { buildFutureViewDetail, buildFutureChips } from '../../services/aiChat/futureViewContext';
import { TAB_LABELS } from '../../constants';

export type AiChatVariant = 'panel' | 'tab';

const SUGGESTED_PROMPTS: Array<{ icon: IconName; label: string; prompt: string }> = [
    { icon: 'retirement', label: 'Quand retraite ?', prompt: "À quel âge puis-je raisonnablement prendre ma retraite selon mes finances actuelles ?" },
    { icon: 'budget', label: 'Budget sain ?', prompt: "Analyse mes dépenses des 3 derniers mois et dis-moi si mon budget est équilibré. Identifie les 2 catégories où je dépense le plus." },
    { icon: 'investments', label: 'Investir mieux', prompt: "Quelle stratégie d'investissement me recommandes-tu compte tenu de mon âge et de mes objectifs ? CELI ou REER en priorité ?" },
    { icon: 'real-estate', label: 'Acheter maison', prompt: "Suis-je prêt à acheter une propriété ? Quels sont les 3 critères les plus importants à considérer ?" },
];

const GREETING: AiMessage = {
    role: 'model',
    text: "Bonjour ! Je suis ton conseiller financier personnel. Je consulte tes VRAIES données (patrimoine, impôts, projection, transactions) à la demande — les mêmes que le connecteur claude.ai.\n\nPose-moi une question ou clique sur une suggestion ci-dessous.",
    timestamp: '',
};

function renderMarkdownLine(line: string, lineKey: number) {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
        <p key={lineKey} className={lineKey > 0 ? "mt-2" : ""}>
            {parts.map((part, i) =>
                part.startsWith('**') && part.endsWith('**')
                    ? <strong key={i} className="font-bold text-white">{part.slice(2, -2)}</strong>
                    : <React.Fragment key={i}>{part}</React.Fragment>
            )}
        </p>
    );
}

function formatTime(iso: string): string {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
}

interface AiChatViewProps {
    variant: AiChatVariant;
    /** Le panneau fournit un bouton de fermeture dans son header ; l'onglet n'en a pas. */
    onClose?: () => void;
}

export const AiChatView: React.FC<AiChatViewProps> = ({ variant, onClose }) => {
    const aiConversation = useFinanceStore(s => s.aiConversation);
    const isTestMode = useFinanceStore(s => s.isTestMode);
    const isPrivacyMode = useFinanceStore(s => s.isPrivacyMode);
    // [B3-CHAT-MODEL] Modèle DE la conversation active (résolu : une valeur inconnue → défaut).
    const chatModel = resolveChatModelKey(useFinanceStore(s => s.aiChatModel));
    const setAppState = useFinanceStore(s => s.setAppState);
    // [B4-CHAT-COST] Coûts : conversation = Σ des réponses de l'active ; total = cumul à vie.
    // Affichés en CAD via fxRates.USD (source unique FX — jamais de taux en dur).
    const fxUsd = useFinanceStore(s => s.fxRates.USD);
    const totalCostUsd = useFinanceStore(s => s.aiChatCostUsdTotal) ?? 0;
    const { isLoading, activeTools, sendMessage, cancel, clearConversation } = useAiChatContext();
    // useMemo (finding panel #489, perf) : recalculé sinon à CHAQUE delta streamé (chaque
    // updateModelMessage recrée le tableau → re-render → re-scan de tout l'historique).
    const convCostUsd = React.useMemo(() => sumMessagesCostUsd(aiConversation), [aiConversation]);
    // [CHAT-PAGE-CONTEXT] Contexte d'écran perçu — badge affiché pour que l'utilisateur puisse le
    // CONTESTER (critère produit #5). Détail présent → « Budget — juillet 2026 » ; sinon, le nom
    // d'onglet n'a de sens que dans le PANNEAU (sur l'onglet Assistant, « Contexte : Assistant IA »
    // serait du bruit).
    const activeTab = useFinanceStore(s => s.activeTab);
    const viewCtxRaw = useViewContextSnapshot();
    // [Finding panel #490 — ÉLEVÉ] Même corrélation scope↔onglet que le prompt : le cleanup du
    // publisher est différé après paint → sans ce filtre, le badge afficherait « Accueil —
    // juillet 2026 » (période de Budget) pendant la fenêtre de transition d'onglet.
    const viewCtx = viewContextMatchesTab(viewCtxRaw, activeTab) ? viewCtxRaw : null;
    // [REFONTE-NAV-L6a] Le badge se décline par `kind` : Budget garde sa période ; Futur dit ce que
    // le chat voit (courbe affichée ou aveu « aucune projection » — jamais un badge qui prétend).
    const contextDetailLabel = viewCtx
        ? (viewCtx.detail.kind === 'budget'
            ? viewCtx.detail.periodLabel
            : (viewCtx.detail.hasProjection ? 'courbe de projection' : 'aucune projection calculée'))
        : null;
    const contextBadge = viewCtx
        ? `${TAB_LABELS[activeTab] ?? ''} — ${contextDetailLabel}`
        : (variant === 'panel' && activeTab !== Tab.ASSISTANT ? (TAB_LABELS[activeTab] ?? null) : null);
    // [REFONTE-NAV-L6a] Chips ancrées sur la courbe : panneau → seulement quand le contexte publié
    // est « future » (ouvert par-dessus Futur) ; page Assistant (variant tab) → bâties directement
    // sur store.lastProjection (source unique — l'assistant est ANCRÉ sur la courbe, c'est sa page).
    // Aucune projection → buildFutureChips rend [] (pas de fausse affordance). Libellés sans montant.
    const lastProjection = useFinanceStore(s => s.lastProjection);
    const futureChips = React.useMemo(() => {
        if (viewCtx?.detail.kind === 'future') return buildFutureChips(viewCtx.detail);
        if (variant === 'tab') return buildFutureChips(buildFutureViewDetail(lastProjection));
        return [];
    }, [viewCtx, variant, lastProjection]);

    const [input, setInput] = useState('');
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const modelSelectId = React.useId();
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // [AITOOLS-B1] Sélection de fichiers : chaque fichier passe classifyAttachment (allowlist +
    // bornes de taille) — refus IMMÉDIAT et nommé, jamais un envoi qui échoue plus tard en silence.
    const addFiles = (list: FileList | null) => {
        if (!list || list.length === 0) return;
        const next = [...pendingFiles];
        for (const f of Array.from(list)) {
            if (next.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
                showToast(`Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} pièces jointes par message.`, 'info');
                break;
            }
            const cls = classifyAttachment(f);
            if (!cls.ok) { showToast(cls.reason, 'error'); continue; }
            if (next.some((p) => p.name === f.name && p.size === f.size)) {
                showToast(`${f.name} est déjà joint.`, 'info'); // jamais un skip muet (cohérence des refus)
                continue;
            }
            // Budget AGRÉGÉ (finding panel ÉLEVÉ) : 3 PDF de 10 Mo passent un à un mais dépassent
            // la limite API par requête — refuser à la SÉLECTION, pas après un envoi payant raté.
            if (totalAttachmentBytes([...next, f]) > MAX_TOTAL_ATTACHMENT_BYTES) {
                showToast(`${f.name} refusé : le total des pièces jointes dépasserait ${(MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(0)} Mo par message.`, 'error');
                continue;
            }
            next.push(f);
        }
        setPendingFiles(next);
        // Permet de re-sélectionner le MÊME fichier après un retrait (l'input garde sinon sa value).
        if (fileInputRef.current) fileInputRef.current.value = '';
    };
    const removeFile = (idx: number) => setPendingFiles((fs) => fs.filter((_, i) => i !== idx));

    const messagesToRender: AiMessage[] = aiConversation.length === 0 ? [GREETING] : aiConversation;

    // [Fix bug Marc 2026-07-22 — « le petit chat de côté bug parfois et je vois pas le chat »]
    // Auto-scroll par scrollTop DIRECT sur le conteneur de messages, plus JAMAIS
    // scrollIntoView sur une sentinelle : scrollIntoView fait défiler TOUS les ancêtres
    // scrollables — y compris le drawer overflow-hidden du panneau (scrollable par script) →
    // le header et le fil sortaient par le haut (saisie affichée en HAUT, conversation
    // invisible — captures Marc). scrollTop sur le conteneur ne peut pas toucher les ancêtres.
    // [Finding code-reviewer #491 — MOYEN] Pin-to-bottom CONDITIONNEL : on ne colle au bas que si
    // l'utilisateur y était déjà (suivait la conversation). Sinon, chaque delta de stream le
    // ramenait de force en bas — impossible de remonter relire pendant une réponse longue.
    const stickToBottomRef = useRef(true);
    const onMessagesScroll = () => {
        const el = messagesContainerRef.current;
        if (el) stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    useEffect(() => {
        const el = messagesContainerRef.current;
        if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
    }, [aiConversation, isLoading]);

    // [Findings panel a11y/code-reviewer — HIGH] Autofocus du champ à l'OUVERTURE du panneau (le
    // variant panel est monté/démonté à chaque ouverture → cet effet ne se déclenche qu'au montage,
    // jamais à chaque render : conforme à la leçon PROJECTION-PERSIST « ne pas voler le focus »).
    // Le variant tab (page) ne vole PAS le focus à l'arrivée sur l'onglet. Skippé en mode discret
    // (l'input n'est pas rendu).
    useEffect(() => {
        if (variant !== 'panel' || isPrivacyMode) return;
        const t = setTimeout(() => inputRef.current?.focus(), 80);
        return () => clearTimeout(t);
    }, [variant, isPrivacyMode]);

    const handleSend = (overrideText?: string) => {
        const userText = (overrideText ?? input).trim();
        // [AITOOLS-B1] Un envoi peut être « pièces jointes seules » (ex. déposer un relevé sans question).
        // ⚠️ TOUJOURS transmettre pendingFiles, même pour un clic de SUGGESTION (finding panel ÉLEVÉ,
        // prouvé par sonde) : les suggestions ne s'affichent qu'à conversation vide — précisément la
        // fenêtre où on peut avoir joint un fichier avant le 1er message ; l'ancien `overrideText ?
        // [] : pendingFiles` jetait alors le fichier EN SILENCE (puce disparue comme si envoyée).
        const files = pendingFiles;
        if ((!userText && files.length === 0) || isLoading) return;
        setInput('');
        setPendingFiles([]);
        stickToBottomRef.current = true; // son propre envoi ramène toujours au bas (convention chat)
        void sendMessage(userText, files.length > 0 ? files : undefined);
    };

    // Deux gabarits : le panneau est compact (drawer), l'onglet occupe la page.
    const isPanel = variant === 'panel';
    const suggestionCols = isPanel ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4';

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Header commun (titre + statut + Effacer ; le panneau ajoute Fermer). */}
            <div className="bg-white/[0.03] p-4 border-b border-white/5 flex items-center gap-3 flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-white/10 p-0.5">
                    <div className="w-full h-full bg-black rounded-full flex items-center justify-center">
                        <Icon name="bot" size={18} className="text-primary" />
                    </div>
                </div>
                <div className="min-w-0">
                    <h3 className="font-bold text-white text-base">Assistant</h3>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        <span className="text-tiny text-green-300 font-medium">{isLoading ? 'Réflexion…' : 'En ligne'}</span>
                        {/* [B4-CHAT-COST] Coût API réel (CAD via fxRates.USD) — conversation + cumul à
                            vie. Rien d'affiché tant que rien n'a été dépensé.
                            [Finding panel #489] GATÉ mode discret comme tout montant : la règle
                            « masquer = ne pas rendre » est non négociable — un coût d'infra reste un
                            montant $ à l'écran, pas d'exception décidée en commentaire. */}
                        {!isPrivacyMode && (convCostUsd > 0 || totalCostUsd > 0) && (
                            <span className="text-tiny text-ink-400" title="Coût API réel (tokens facturés × tarif Anthropic), converti en CAD">
                                · conv. {formatCostCad(convCostUsd, fxUsd)} · total {formatCostCad(totalCostUsd, fxUsd)}
                            </span>
                        )}
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {/* [B3-CHAT-MODEL] Modèle PAR conversation (porté dans l'archive à la bascule).
                        Gelé pendant un envoi : le modèle d'un message est capturé à l'envoi — changer
                        mi-stream sèmerait la confusion sur « quel modèle a répondu/coûté ».
                        [Finding a11y #489] id via useId : panneau + onglet peuvent être montés EN MÊME
                        TEMPS (FAB sans garde d'onglet) — un id littéral serait dupliqué dans le DOM et
                        le label résoudrait vers le MAUVAIS select (WCAG 4.1.1/1.3.1). */}
                    <label htmlFor={modelSelectId} className="sr-only">Modèle IA de cette conversation</label>
                    <select
                        id={modelSelectId}
                        value={chatModel}
                        disabled={isLoading}
                        onChange={(e) => setAppState({ aiChatModel: resolveChatModelKey(e.target.value) })}
                        title={AI_CHAT_MODELS.find((m) => m.key === chatModel)?.description}
                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-meta text-ink-200 focus-ring disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {AI_CHAT_MODELS.map((m) => (
                            <option key={m.key} value={m.key}>{m.label}</option>
                        ))}
                    </select>
                    {/* [Finding panel] Effacer DÉSACTIVÉ pendant un envoi : vider mi-stream perdait la
                        réponse en cours (déjà payée) sans trace — Annuler d'abord, effacer ensuite. */}
                    <button onClick={clearConversation} disabled={isLoading} aria-label="Effacer la conversation" className="text-ink-300 hover:text-white p-2 text-meta bg-white/5 rounded-lg focus-ring disabled:opacity-40 disabled:cursor-not-allowed">Effacer</button>
                    {onClose && (
                        <button onClick={onClose} aria-label="Réduire le conseiller IA" className="text-ink-300 hover:text-white w-9 h-9 inline-flex items-center justify-center bg-white/5 rounded-lg focus-ring">
                            <Icon name="close" size={18} />
                        </button>
                    )}
                </div>
            </div>

            {/* [AITOOLS-C] Bannière mode test : les réponses portent sur le PERSONA, pas les vraies données. */}
            {isTestMode && (
                <div className="bg-warning-500/15 border-b border-warning-500/30 px-4 py-2 text-meta text-warning-400 flex-shrink-0" role="status">
                    Mode démo actif — je réponds sur les données du persona de test, pas sur tes vraies finances.
                </div>
            )}

            {/* [ADR-5] Mode discret : le chat ENTIER est masqué (la prose porte des montants qu'on ne
                peut pas masquer valeur par valeur de façon fiable — masquer = ne pas rendre). */}
            {isPrivacyMode ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <Icon name="bot" size={28} className="text-ink-400" aria-hidden="true" />
                    <p className="text-body text-ink-200 font-medium">Mode discret actif</p>
                    <p className="text-meta text-ink-400">La conversation (montants inclus) est masquée. Désactive le mode discret pour discuter avec l'assistant.</p>
                    <span className="sr-only">Conversation masquée en mode discret</span>
                </div>
            ) : (
                <div className="flex flex-1 min-h-0">
                    {/* [B2-CHAT-HISTORY] Historique multi-conversations — ONGLET seulement (le panneau
                        reste compact), sidebar md+ / sélecteur mobile, DANS la zone masquée du mode
                        discret (les titres = premières questions → montants potentiels). */}
                    {!isPanel && (
                        <div className="hidden md:flex flex-shrink-0 min-h-0">
                            <AiConversationList isLoading={isLoading} />
                        </div>
                    )}
                    <div className="flex flex-col flex-1 min-h-0">
                    {!isPanel && (
                        <div className="md:hidden p-2 border-b border-white/5 flex-shrink-0">
                            <AiConversationList isLoading={isLoading} compact />
                        </div>
                    )}
                    <div ref={messagesContainerRef} onScroll={onMessagesScroll} className={`flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide ${isPanel ? '' : 'max-w-3xl mx-auto w-full'}`}>
                        {messagesToRender.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {m.role === 'model' && (
                                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center mr-2 flex-shrink-0 border border-white/10 text-ink-200" aria-hidden="true"><Icon name="bot" size={16} /></div>
                                )}
                                <div
                                    className={`max-w-[85%] rounded-2xl px-5 py-3 text-body leading-relaxed shadow-md ${m.role === 'user'
                                        ? 'bg-primary text-dark rounded-tr-none'
                                        : 'bg-[#2a2a2a] text-ink-100 rounded-tl-none border border-white/5'
                                        }`}
                                >
                                    {/* [AITOOLS-C] Chips de transparence : quels tools ont nourri CETTE réponse. */}
                                    {m.role === 'model' && m.toolsUsed && m.toolsUsed.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mb-2">
                                            {/* [panel a11y B1] ink-300 sur ce fond composé = 4,09:1 (< AA) —
                                                défaut LATENT pré-existant, mesuré et corrigé au passage. */}
                                            {[...new Set(m.toolsUsed)].map((label) => (
                                                <span key={label} className="text-tiny px-2 py-0.5 rounded-full bg-white/10 text-ink-200 border border-white/10">
                                                    a consulté : {label}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {/* [AITOOLS-B1] Puces des pièces jointes du message (métadonnées du
                                        transcript — le contenu n'est jamais persisté, ADR-4). */}
                                    {/* [Finding panel a11y — contraste MESURÉ] côté modèle : ink-300 sur
                                        white/10∘#2a2a2a = 4,09:1 (< AA 4,5) → ink-200 (7,09:1). */}
                                    {m.attachments && m.attachments.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mb-2">
                                            {m.attachments.map((a, ai) => (
                                                <span key={`${a.name}-${ai}`} className={`inline-flex items-center gap-1 text-tiny px-2 py-0.5 rounded-full border ${m.role === 'user' ? 'bg-black/10 text-dark/80 border-black/10' : 'bg-white/10 text-ink-200 border-white/10'}`}>
                                                    <Icon name={a.kind === 'image' ? 'image' : 'document'} size={11} aria-hidden="true" />
                                                    {a.name}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {m.text.split('\n').map((line, idx) => renderMarkdownLine(line, idx))}
                                    {/* [Finding panel a11y — contraste mesuré] user : green-200 sur
                                        bg-primary clair ≈ 1:1 (invisible) → text-dark/60 ; model :
                                        ink-500 sur #2a2a2a ≈ 3,1:1 (< AA) → ink-400 (≥ 4,5:1). */}
                                    {m.timestamp && (
                                        <div className={`text-tiny mt-1 text-right ${m.role === 'user' ? 'text-dark/60' : 'text-ink-400'}`}>
                                            {/* [B4-CHAT-COST] Coût réel de CETTE réponse (détail demandé).
                                                [Finding a11y #489] étiquette sr-only : sans elle un lecteur
                                                d'écran entend deux nombres accolés (« 0,03 $ 14 h 32 ») —
                                                title n'est pas annoncé de façon fiable (WCAG 1.3.1). */}
                                            {m.role === 'model' && typeof m.costUsd === 'number' && m.costUsd > 0 && (
                                                <span title="Coût API réel de cette réponse (CAD)"><span className="sr-only">Coût : </span>{formatCostCad(m.costUsd, fxUsd)} · </span>
                                            )}
                                            {formatTime(m.timestamp)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {aiConversation.length === 0 && !isLoading && (
                            <div className={`grid ${suggestionCols} gap-2 pt-2`}>
                                {SUGGESTED_PROMPTS.map(({ icon, label, prompt }) => (
                                    <button
                                        key={label}
                                        type="button"
                                        onClick={() => handleSend(prompt)}
                                        className="flex items-center gap-2 p-2.5 bg-white/5 hover:bg-white/10 border border-white/40 rounded-card text-left transition-colors focus-ring"
                                    >
                                        <Icon name={icon} size={16} className="text-ink-300 flex-shrink-0" />
                                        <span className="text-meta text-ink-200 leading-tight">{label}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center mr-2 flex-shrink-0 border border-white/10"><Icon name="bot" size={16} className="text-ink-300" /></div>
                                {/* [Finding panel a11y #5] role="status"+aria-live sur le conteneur
                                    EXTERNE → l'insertion du bloc de chargement est annoncée AUSSI pendant
                                    la phase « points animés » (avant qu'un tool démarre), pas seulement
                                    quand un nom de tool est disponible. */}
                                <div className="bg-[#2a2a2a] rounded-2xl rounded-tl-none px-4 py-3 border border-white/5" role="status" aria-live="polite" aria-label="Chargement de la réponse">
                                    {/* [AITOOLS-C] État de chargement NOMMÉ (« Consulte : Situation fiscale… »). */}
                                    {activeTools.length > 0 ? (
                                        <span className="text-meta text-ink-300">Consulte : {activeTools[activeTools.length - 1]}…</span>
                                    ) : (
                                        <div className="flex gap-1.5 items-center py-1">
                                            <div className="w-2 h-2 bg-ink-300 rounded-full animate-[bounce_1.4s_infinite_0ms]"></div>
                                            <div className="w-2 h-2 bg-ink-300 rounded-full animate-[bounce_1.4s_infinite_200ms]"></div>
                                            <div className="w-2 h-2 bg-ink-300 rounded-full animate-[bounce_1.4s_infinite_400ms]"></div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-4 bg-black/40 backdrop-blur-md border-t border-white/5 flex-shrink-0">
                        {/* [CHAT-PAGE-CONTEXT] Contexte d'écran perçu, contestable d'un coup d'œil.
                            Texte visible (pas title seul — leçon a11y #489). Mode discret : AUCUNE
                            garde locale ici — le DÉTAIL (montants/période) est déjà purgé à la
                            SOURCE par useViewContextPublisher, et toute cette branche du ternaire
                            isPrivacyMode n'est pas rendue (double couverture — ne pas « ajouter »
                            une garde ici, ni en chercher une manquante). */}
                        {contextBadge && (
                            <p className={`text-tiny text-ink-400 mb-1.5 ${isPanel ? '' : 'max-w-3xl mx-auto'}`}>
                                Contexte : {contextBadge}
                            </p>
                        )}
                        {/* [REFONTE-NAV-L6a] Chips ancrées sur la courbe : PRÉ-REMPLISSENT la saisie
                            (l'envoi reste un geste explicite — contrairement aux suggestions d'amorçage
                            qui envoient direct, une question sur la courbe se relit/ajuste avant envoi).
                            Libellés sans montant $ (seulement des années) — même sobriété que le badge. */}
                        {futureChips.length > 0 && (
                            <div className={`flex flex-wrap gap-1.5 mb-2 ${isPanel ? '' : 'max-w-3xl mx-auto'}`}>
                                {futureChips.map(({ label, prompt }) => (
                                    <button
                                        key={label}
                                        type="button"
                                        disabled={isLoading}
                                        onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                                        className="text-tiny px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-ink-200 border border-white/15 transition-colors focus-ring disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        )}
                        {/* [AITOOLS-B1] Puces des fichiers EN ATTENTE d'envoi (retirables).
                            role=status + aria-live (finding panel a11y) : l'AJOUT d'une puce est
                            annoncé au lecteur d'écran (le REFUS l'était déjà via le toast alert) ;
                            bouton retirer : cible ≥ 24 px (WCAG 2.5.8, leçon SEC-PRIVACY-BLUR-INPUTS). */}
                        {pendingFiles.length > 0 && (
                            <div role="status" aria-live="polite" className={`flex flex-wrap gap-1.5 mb-2 ${isPanel ? '' : 'max-w-3xl mx-auto'}`}>
                                {pendingFiles.map((f, i) => (
                                    <span key={`${f.name}-${f.size}`} className="inline-flex items-center gap-1 text-tiny px-2.5 py-1 rounded-full bg-white/10 text-ink-200 border border-white/15">
                                        <Icon name={f.type.startsWith('image/') ? 'image' : 'document'} size={12} aria-hidden="true" />
                                        <span className="max-w-[160px] truncate">{f.name}</span>
                                        <button
                                            type="button"
                                            onClick={() => removeFile(i)}
                                            aria-label={`Retirer la pièce jointe ${f.name}`}
                                            className="text-ink-400 hover:text-white focus-ring rounded-full min-w-[24px] min-h-[24px] inline-flex items-center justify-center"
                                        >
                                            <Icon name="close" size={12} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className={`flex gap-2 bg-[#2a2a2a] rounded-full border border-white/10 px-2 py-2 focus-within:border-primary/50 transition-colors shadow-inner ${isPanel ? '' : 'max-w-3xl mx-auto'}`}>
                            {/* [AITOOLS-B1] Joindre images/PDF/CSV — validation à la sélection. */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={ATTACHMENT_ACCEPT}
                                multiple
                                className="hidden"
                                onChange={(e) => addFiles(e.target.files)}
                                aria-hidden="true"
                                tabIndex={-1}
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isLoading}
                                aria-label="Joindre un fichier (image, PDF, CSV ou texte)"
                                title="Joindre un fichier"
                                className="text-ink-300 hover:text-white w-9 h-9 rounded-full flex items-center justify-center transition-colors focus-ring disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                            >
                                <Icon name="paperclip" size={16} />
                            </button>
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Analyser mon budget…"
                                aria-label="Question au conseiller IA"
                                className="flex-1 bg-transparent px-4 text-body text-white outline-none disabled:opacity-50 placeholder-ink-400 font-medium"
                                disabled={isLoading}
                            />
                            {isLoading ? (
                                <button
                                    onClick={cancel}
                                    aria-label="Annuler la génération"
                                    title="Annuler"
                                    className="bg-danger-500 hover:bg-danger-400 text-white w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg shadow-danger-500/20 focus-ring"
                                >
                                    <Icon name="close" size={16} />
                                </button>
                            ) : (
                                <button
                                    onClick={() => handleSend()}
                                    disabled={isLoading || (!input.trim() && pendingFiles.length === 0)}
                                    aria-label="Envoyer le message"
                                    className="bg-primary hover:bg-white disabled:opacity-50 text-dark w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg shadow-black/30 focus-ring"
                                >
                                    <Icon name="send" size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                    </div>
                </div>
            )}
        </div>
    );
};
