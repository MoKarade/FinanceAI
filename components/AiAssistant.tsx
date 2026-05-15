
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Transaction, BudgetCategory, Asset, ProjectionConfig, RealEstateGoal, BudgetConfig, AiMessage } from '../types';
import { useFinanceStore } from '../store/useFinanceStore';

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

// Greeting affiché quand la conversation est vide (non-stocké, vit dans le rendu seul)
const GREETING: AiMessage = {
  role: 'model',
  text: "👋 Bonjour ! Je suis ton conseiller financier personnel. Je connais ton budget, tes actions et tes projets. Pose-moi une question sur tes finances !",
  timestamp: '',
};

export const AiAssistant: React.FC<AiAssistantProps> = ({ apiKey, transactions, budgetItems, assets, projection, realEstateGoal, config, initialBalances }) => {
  const aiConversation = useFinanceStore(s => s.aiConversation);
  const setAppState = useFinanceStore(s => s.setAppState);

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Quand la conversation est vide, on affiche un greeting virtuel; sinon on affiche les messages stockés
  const messagesToRender: AiMessage[] = aiConversation.length === 0 ? [GREETING] : aiConversation;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiConversation, isOpen, isLoading]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  const sanitizePayee = (raw: string): string => {
    if (!raw) return '';
    return raw
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      .replace(/["\\]/g, ' ')
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

    const annualContrib = projection.manualContribution * 12;
    const rate = projection.returnRate / 100;
    let futureValue = netWorth;
    for (let i = 0; i < projection.years; i++) {
      futureValue = (futureValue + annualContrib) * (1 + rate);
    }

    const realEstateContext = realEstateGoal
      ? `Projet immo : ${realEstateGoal.name || 'principal'} a ${roundToHundred(realEstateGoal.price || 0).toLocaleString()}$ (mise de fonds ${roundToHundred(realEstateGoal.downPayment || 0).toLocaleString()}$, taux ${realEstateGoal.mortgageRate || 0}%).`
      : 'Aucun projet immobilier actif.';

    const last20Txs = transactions.slice(0, 20)
      .map(t => `${t.date}: ${sanitizePayee(t.payee)} (${roundToHundred(t.amount)}$)`)
      .join('\n');

    return `
      You are an elite, friendly financial advisor. Speak French naturally. Use emojis.

      === USER SNAPSHOT ===
      - Net Worth: ${roundToHundred(netWorth).toLocaleString()} CAD (Cash: ${roundToHundred(totalCash).toLocaleString()}, Stocks: ${roundToHundred(totalAssets).toLocaleString()})
      - Monthly Burn: ~${roundToHundred(monthlyBurn).toLocaleString()}$
      - Runway: ${runway} months
      - Top Stocks: ${topAssets}
      - 10y Projection: ~${roundToHundred(futureValue).toLocaleString()} CAD
      - ${realEstateContext}

      === RECENT TRANSACTIONS ===
      ${last20Txs}

      === RULES ===
      - Be concise (max 3-4 sentences unless asked for detail).
      - Analyze spending patterns if asked.
      - Give investment mindset advice (long term).
    `;
  };

  const appendMessage = (msg: AiMessage) => {
    setAppState({ aiConversation: [...useFinanceStore.getState().aiConversation, msg] });
  };

  const clearConversation = () => {
    setAppState({ aiConversation: [] });
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userText = input;
    setInput('');
    appendMessage({ role: 'user', text: userText, timestamp: new Date().toISOString() });
    setIsLoading(true);

    try {
      if (!apiKey) throw new Error("Cle API manquante.");

      const ai = new GoogleGenAI({ apiKey });
      const model = 'gemini-2.0-flash';

      const response = await ai.models.generateContent({
        model: model,
        contents: [
          { role: 'user', parts: [{ text: generateContext() }] },
          { role: 'user', parts: [{ text: userText }] }
        ]
      });

      const text = response.text;
      if (text) {
        appendMessage({ role: 'model', text, timestamp: new Date().toISOString() });
      }
    } catch (e: any) {
      console.error('[Assistant] Gemini error:', e);
      appendMessage({
        role: 'model',
        text: "⚠️ Oups, je n'arrive pas a reflechir. Verifie ta cle API.",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (iso: string): string => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Fermer le conseiller IA' : 'Ouvrir le conseiller IA'}
        className={`fixed bottom-24 right-4 md:bottom-8 md:right-8 z-50 w-14 h-14 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all duration-300 active:scale-95 flex items-center justify-center ${isOpen ? 'bg-red-500 rotate-90' : 'bg-primary hover:bg-emerald-400 hover:-translate-y-1'}`}
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
                <span className="text-tiny text-green-300 font-medium">En ligne</span>
              </div>
            </div>
            <div className="ml-auto">
              <button onClick={clearConversation} aria-label="Effacer la conversation" className="text-gray-400 hover:text-white p-2 text-xs bg-white/5 rounded-lg">Effacer</button>
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
                  {m.text.split('\n').map((line, idx) => <p key={idx} className={idx > 0 ? "mt-2" : ""}>{line}</p>)}
                  {m.timestamp && (
                    <div className={`text-tiny mt-1 text-right ${m.role === 'user' ? 'text-green-200' : 'text-gray-500'}`}>
                      {formatTime(m.timestamp)}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center mr-2 text-sm flex-shrink-0 border border-white/10" aria-hidden="true">🤖</div>
                <div className="bg-[#2a2a2a] rounded-2xl rounded-tl-none px-4 py-4 flex gap-1.5 items-center border border-white/5" aria-label="Chargement de la reponse">
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
                placeholder="Analyser mon budget..."
                aria-label="Question au conseiller IA"
                className="flex-1 bg-transparent px-4 text-sm text-white outline-none disabled:opacity-50 placeholder-gray-500 font-medium"
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                aria-label="Envoyer le message"
                className="bg-primary hover:bg-green-500 disabled:opacity-50 text-white w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg shadow-primary/20"
              >
                ➚
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
