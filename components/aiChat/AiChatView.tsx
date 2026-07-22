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
import { AiMessage } from '../../types';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useAiChatContext } from './AiChatContext';

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
    const { isLoading, activeTools, sendMessage, cancel, clearConversation } = useAiChatContext();

    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const messagesToRender: AiMessage[] = aiConversation.length === 0 ? [GREETING] : aiConversation;

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [aiConversation, isLoading]);

    const handleSend = (overrideText?: string) => {
        const userText = (overrideText ?? input).trim();
        if (!userText || isLoading) return;
        setInput('');
        void sendMessage(userText);
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
                <div>
                    <h3 className="font-bold text-white text-base">Assistant</h3>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        <span className="text-tiny text-green-300 font-medium">{isLoading ? 'Réflexion…' : 'En ligne'}</span>
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
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
                <>
                    <div className={`flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide ${isPanel ? '' : 'max-w-3xl mx-auto w-full'}`}>
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
                                            {[...new Set(m.toolsUsed)].map((label) => (
                                                <span key={label} className="text-tiny px-2 py-0.5 rounded-full bg-white/10 text-ink-300 border border-white/10">
                                                    a consulté : {label}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {m.text.split('\n').map((line, idx) => renderMarkdownLine(line, idx))}
                                    {m.timestamp && (
                                        <div className={`text-tiny mt-1 text-right ${m.role === 'user' ? 'text-green-200' : 'text-ink-500'}`}>
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
                                <div className="bg-[#2a2a2a] rounded-2xl rounded-tl-none px-4 py-3 border border-white/5" aria-label="Chargement de la réponse">
                                    {/* [AITOOLS-C] État de chargement NOMMÉ (« Consulte : Situation fiscale… »). */}
                                    {activeTools.length > 0 ? (
                                        <span className="text-meta text-ink-300" role="status">Consulte : {activeTools[activeTools.length - 1]}…</span>
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
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="p-4 bg-black/40 backdrop-blur-md border-t border-white/5 flex-shrink-0">
                        <div className={`flex gap-2 bg-[#2a2a2a] rounded-full border border-white/10 px-2 py-2 focus-within:border-primary/50 transition-colors shadow-inner ${isPanel ? '' : 'max-w-3xl mx-auto'}`}>
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Analyser mon budget…"
                                aria-label="Question au conseiller IA"
                                className="flex-1 bg-transparent px-4 text-body text-white outline-none disabled:opacity-50 placeholder-ink-500 font-medium"
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
                                    disabled={isLoading || !input.trim()}
                                    aria-label="Envoyer le message"
                                    className="bg-primary hover:bg-white disabled:opacity-50 text-dark w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg shadow-black/30 focus-ring"
                                >
                                    <Icon name="send" size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
