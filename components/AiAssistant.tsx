import React, { useState, useRef, useEffect } from 'react';
import { Transaction, BudgetCategory, Asset, ProjectionConfig, RealEstateGoal, BudgetConfig, AiMessage } from '../types';
import { useFinanceStore } from '../store/useFinanceStore';
import { chatStream } from '../services/claude';

interface AiAssistantProps {
  apiKey: string;
  transactions: Transaction[];
  budgetItems: BudgetCategory[];
  assets: Asset[];
  projection: ProjectionConfig;
  realEstateGoal?: RealEstateGoal;
  config: BudgetConfig;
  initialBalances: Record<string, number>;
}

// Phase 4 — Prompts pré-écrits pour démarrer une conversation rapidement.
const SUGGESTED_PROMPTS: Array<{ icon: string; label: string; prompt: string }> = [
  { icon: '🎯', label: 'Quand retraite ?', prompt: "À quel âge puis-je raisonnablement prendre ma retraite selon mes finances actuelles ?" },
  { icon: '💸', label: 'Budget sain ?', prompt: "Analyse mes dépenses des 3 derniers mois et dis-moi si mon budget est équilibré. Identifie les 2 catégories où je dépense le plus." },
  { icon: '📈', label: 'Investir mieux', prompt: "Quelle stratégie d'investissement me recommandes-tu compte tenu de mon âge et de mes objectifs ? CELI ou REER en priorité ?" },
  { icon: '🏡', label: 'Acheter maison', prompt: "Suis-je prêt à acheter une propriété ? Quels sont les 3 critères les plus importants à considérer ?" },
];

const GREETING: AiMessage = {
  role: 'model',
  text: "👋 Bonjour ! Je suis ton conseiller financier personnel. Je connais ton budget, tes actions et tes projets.\n\nPose-moi une question ou clique sur une suggestion ci-dessous.",
  timestamp: '',
};

/**
 * Phase 4 — AiAssistant enrichi.
 *
 * Améliorations vs version précédente:
 *  - Streaming des réponses (generateContentStream) → UX progressive
 *  - 4 prompts suggérés cliquables en début de conversation
 *  - Contexte enrichi avec lastProjection du store (FIRE, success rate,
 *    estate net worth réels — au lieu de la formule simplifiée 5%)
 *  - Markdown bold (`**texte**`) rendu en <strong>
 */
export const AiAssistant: React.FC<AiAssistantProps> = ({ apiKey, transactions, budgetItems: _budgetItems, assets, projection, realEstateGoal, config, initialBalances }) => {
  const aiConversation = useFinanceStore(s => s.aiConversation);
  const setAppState = useFinanceStore(s => s.setAppState);
  const lastProjection = useFinanceStore(s => s.lastProjection);

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // §7.C.2 — AbortController pour permettre à l'utilisateur d'annuler un stream.
  const abortRef = useRef<AbortController | null>(null);

  const messagesToRender: AiMessage[] = aiConversation.length === 0 ? [GREETING] : aiConversation;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiConversation, isOpen, isLoading, streamingText]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  const sanitizePayee = (raw: string): string => {
    if (!raw) return '';
    return raw
      .replace(/[\x00-\x1F\x7F]/g, ' ')        // caractères de contrôle
      .replace(/["\\<>#\[\]{}|`^]/g, ' ')       // H2 : markup / template / injection
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
  };
  const roundToHundred = (amount: number): number => Math.round(amount / 100) * 100;

  const generateContext = () => {
    const totalAssets = assets.reduce((sum, a) => sum + (a.quantity * a.currentPrice * (a.currency === 'USD' ? 1.38 : a.currency === 'EUR' ? 1.50 : 1)), 0);
    const totalCash = (Object.values(initialBalances) as number[]).reduce((a, b) => a + b, 0) + transactions.reduce((sum, t) => !t.isDuplicate && !t.isTransfer ? sum + t.amount : sum, 0);
    const netWorth = totalAssets + totalCash;

    const topAssets = [...assets].sort((a, b) => b.performance - a.performance).slice(0, 3).map(a => `${a.symbol}: +${a.performance}%`).join(', ');

    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(now.getMonth() - 3);
    const recentExpenses = transactions
      .filter(t => new Date(t.date) >= threeMonthsAgo && t.amount < 0 && !t.isTransfer && !t.isDuplicate)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const monthlyBurn = recentExpenses / 3;
    const runway = monthlyBurn > 0 ? (totalCash / monthlyBurn).toFixed(1) : "Infini";

    // Phase 4 — utilise la projection réelle du store si dispo (sinon fallback formule simple)
    let projectionLine: string;
    if (lastProjection?.chartData?.length) {
      const last = lastProjection.chartData[lastProjection.chartData.length - 1];
      const estateNw = lastProjection.estateNetWorth ?? last?.NetWorth ?? 0;
      const fire = lastProjection.fireNumber ?? 0;
      const success = lastProjection.successRate;
      const fvi = lastProjection.fvi;
      projectionLine = `Patrimoine successoral projeté (FutureProjection): ~${roundToHundred(estateNw).toLocaleString()} CAD. Objectif FIRE: ${roundToHundred(fire).toLocaleString()}$. ${success != null ? `Taux de succès MC: ${success}%.` : ''} ${fvi != null ? `FVI: ${fvi}/100.` : ''}`;
    } else {
      const annualContrib = projection.manualContribution * 12;
      const rate = projection.returnRate / 100;
      let futureValue = netWorth;
      for (let i = 0; i < projection.years; i++) {
        futureValue = (futureValue + annualContrib) * (1 + rate);
      }
      projectionLine = `Projection simplifiée (formule 5%): ~${roundToHundred(futureValue).toLocaleString()} CAD à ${projection.years} ans. ⚠️ L'utilisateur n'a pas encore ouvert l'onglet Future — pas de simulation détaillée disponible.`;
    }

    const realEstateContext = realEstateGoal
      ? `Projet immo : ${realEstateGoal.name || 'principal'} à ${roundToHundred(realEstateGoal.price || 0).toLocaleString()}$ (mise de fonds ${roundToHundred(realEstateGoal.downPayment || 0).toLocaleString()}$, taux ${realEstateGoal.mortgageRate || 0}%).`
      : 'Aucun projet immobilier actif.';

    const last20Txs = transactions.slice(0, 20)
      .map(t => `${t.date}: ${sanitizePayee(t.payee)} (${roundToHundred(t.amount)}$)`)
      .join('\n');

    const userAge = config.users[0]?.age || 35;
    const _retirementAge = projection.years ? userAge + projection.years : 65;

    return `
      You are an elite, friendly financial advisor for Quebec residents. Speak French naturally. Use emojis sparingly.
      Use **bold** in your responses to highlight key numbers and recommendations.

      === USER SNAPSHOT ===
      - Age principal: ${userAge} ans
      - Net Worth: ${roundToHundred(netWorth).toLocaleString()} CAD (Cash: ${roundToHundred(totalCash).toLocaleString()}, Stocks: ${roundToHundred(totalAssets).toLocaleString()})
      - Burn mensuel: ~${roundToHundred(monthlyBurn).toLocaleString()}$
      - Runway: ${runway} mois
      - Top placements: ${topAssets || 'aucun'}
      - ${projectionLine}
      - ${realEstateContext}

      === RECENT TRANSACTIONS ===
      ${last20Txs}

      === RULES ===
      - Sois concis (max 4-5 phrases sauf demande de détail).
      - Utilise **bold** sur les chiffres clés et conclusions.
      - Pour les questions de stratégie, donne 2-3 options structurées avec listes à puces.
      - Réfère-toi à la simulation FutureProjection si disponible pour les questions d'horizon long.
    `;
  };

  const appendMessage = (msg: AiMessage) => {
    setAppState({ aiConversation: [...useFinanceStore.getState().aiConversation, msg] });
  };

  const updateLastModelMessage = (text: string) => {
    const current = useFinanceStore.getState().aiConversation;
    if (current.length === 0 || current[current.length - 1].role !== 'model') return;
    const updated = [...current];
    updated[updated.length - 1] = { ...updated[updated.length - 1], text };
    setAppState({ aiConversation: updated });
  };

  const clearConversation = () => {
    setAppState({ aiConversation: [] });
  };

  const handleSend = async (overrideText?: string) => {
    const userText = (overrideText ?? input).trim();
    if (!userText) return;

    setInput('');
    appendMessage({ role: 'user', text: userText, timestamp: new Date().toISOString() });
    setIsLoading(true);
    setStreamingText('');

    try {
      if (!apiKey) throw new Error("Clé API Anthropic manquante.");

      const systemPrompt = generateContext();

      // Phase 4 A2: streaming via services/claude.ts (Sonnet 4.6)
      const recent = useFinanceStore.getState().aiConversation.slice(-10);
      const messages = [
        ...recent.map(m => ({
          role: (m.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant',
          content: m.text,
        })),
        { role: 'user' as const, content: userText },
      ];

      // On crée un message "vide" qu'on va remplir progressivement
      appendMessage({ role: 'model', text: '', timestamp: new Date().toISOString() });

      // §7.C.2 — Crée un AbortController par requête, accessible via bouton "Annuler"
      abortRef.current = new AbortController();
      let accumulated = '';
      for await (const chunk of chatStream(messages, apiKey, { system: systemPrompt, signal: abortRef.current.signal })) {
        accumulated += chunk;
        setStreamingText(accumulated);
        updateLastModelMessage(accumulated);
      }
    } catch (e: unknown) {
      // TH4 fix : unknown au lieu de any (useUnknownInCatchVariables tsconfig)
      console.error('[Assistant] Claude error:', e);
      appendMessage({
        role: 'model',
        text: "⚠️ Oups, je n'arrive pas à réfléchir. Vérifie ta clé API Anthropic.",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsLoading(false);
      setStreamingText('');
    }
  };

  const formatTime = (iso: string): string => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  // Phase 4 — rendu markdown bold (**x**) en <strong>
  const renderMarkdownLine = (line: string, lineKey: number) => {
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
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Fermer le conseiller IA' : 'Ouvrir le conseiller IA'}
        className={`fixed bottom-24 right-4 md:bottom-8 md:right-8 z-50 w-14 h-14 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all duration-300 active:scale-95 flex items-center justify-center focus-ring ${isOpen ? 'bg-red-500 rotate-90' : 'bg-primary hover:bg-emerald-400 hover:-translate-y-1'}`}
      >
        <span className="text-2xl text-white drop-shadow-md" aria-hidden="true">
          {isOpen ? '✕' : '✨'}
        </span>
      </button>

      {isOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="ai-assistant-title" className="fixed bottom-40 right-2 left-2 md:left-auto md:bottom-24 md:right-8 z-50 w-auto md:w-[420px] h-[550px] max-h-[60vh] md:max-h-[550px] bg-[#1a1a1a]/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-up origin-bottom-right">

          <div className="bg-gradient-to-r from-emerald-900/50 to-purple-900/50 p-4 border-b border-white/5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-emerald-300 p-0.5">
              <div className="w-full h-full bg-black rounded-full flex items-center justify-center">
                <span className="text-lg" aria-hidden="true">🤖</span>
              </div>
            </div>
            <div>
              <h3 id="ai-assistant-title" className="font-bold text-white text-base">Conseiller IA</h3>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-tiny text-green-300 font-medium">{isLoading ? 'Réflexion…' : 'En ligne'}</span>
              </div>
            </div>
            <div className="ml-auto">
              <button onClick={clearConversation} aria-label="Effacer la conversation" className="text-gray-400 hover:text-white p-2 text-xs bg-white/5 rounded-lg focus-ring">Effacer</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
            {messagesToRender.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'model' && (
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center mr-2 text-sm flex-shrink-0 border border-white/10" aria-hidden="true">🤖</div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-relaxed shadow-md ${m.role === 'user'
                    ? 'bg-primary text-white rounded-tr-none'
                    : 'bg-[#2a2a2a] text-gray-200 rounded-tl-none border border-white/5'
                    }`}
                >
                  {m.text.split('\n').map((line, idx) => renderMarkdownLine(line, idx))}
                  {m.timestamp && (
                    <div className={`text-tiny mt-1 text-right ${m.role === 'user' ? 'text-green-200' : 'text-gray-500'}`}>
                      {formatTime(m.timestamp)}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Phase 4 — Prompts suggérés en début de conversation */}
            {aiConversation.length === 0 && !isLoading && (
              <div className="grid grid-cols-2 gap-2 pt-2">
                {SUGGESTED_PROMPTS.map(({ icon, label, prompt }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    className="flex items-center gap-2 p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-card text-left transition-colors focus-ring"
                  >
                    <span className="text-base flex-shrink-0" aria-hidden="true">{icon}</span>
                    <span className="text-meta text-ink-200 leading-tight">{label}</span>
                  </button>
                ))}
              </div>
            )}

            {isLoading && !streamingText && (
              <div className="flex justify-start">
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center mr-2 text-sm flex-shrink-0 border border-white/10" aria-hidden="true">🤖</div>
                <div className="bg-[#2a2a2a] rounded-2xl rounded-tl-none px-4 py-4 flex gap-1.5 items-center border border-white/5" aria-label="Chargement de la réponse">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-[bounce_1.4s_infinite_0ms]"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-[bounce_1.4s_infinite_200ms]"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-[bounce_1.4s_infinite_400ms]"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-black/40 backdrop-blur-md border-t border-white/5">
            <div className="flex gap-2 bg-[#2a2a2a] rounded-full border border-white/10 px-2 py-2 focus-within:border-primary/50 transition-colors shadow-inner">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Analyser mon budget…"
                aria-label="Question au conseiller IA"
                className="flex-1 bg-transparent px-4 text-sm text-white outline-none disabled:opacity-50 placeholder-gray-500 font-medium"
                disabled={isLoading}
              />
              {isLoading ? (
                <button
                  onClick={() => abortRef.current?.abort(new DOMException('User cancelled', 'AbortError'))}
                  aria-label="Annuler la génération"
                  title="Annuler"
                  className="bg-danger-500 hover:bg-danger-400 text-white w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg shadow-danger-500/20 focus-ring"
                >
                  ⏹
                </button>
              ) : (
              <button
                onClick={() => handleSend()}
                disabled={isLoading || !input.trim()}
                aria-label="Envoyer le message"
                className="bg-primary hover:bg-green-500 disabled:opacity-50 text-white w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg shadow-primary/20 focus-ring"
              >
                ➚
              </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
