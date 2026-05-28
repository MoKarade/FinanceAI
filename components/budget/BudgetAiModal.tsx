import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { chatStream } from '../../services/claude';
import { z } from 'zod';
import { sanitizePromptText, wrapUserData, PROMPT_DATA_ISOLATION_NOTE } from '../../utils/promptSafety';

export interface BudgetAiPayload {
    totalNetIncome: number;
    totalBudget: number;
    totalSpent: number;
    alerts: string[];
    categories: Array<{ name: string; nature: string; target: number; spent: number }>;
}

interface BudgetAiModalProps {
    apiKey: string;
    payload: BudgetAiPayload;
    onClose: () => void;
}

const RecosSchema = z.array(z.string()).min(1).max(5);

const QUEBEC_SYSTEM = `Tu es un conseiller financier québécois expert, strict et bienveillant. Tes recommandations doivent être concrètes (montants, dates) et pertinentes pour le contexte fiscal QC (REER, CELI, RAMQ, etc.).

${PROMPT_DATA_ISOLATION_NOTE}`;

// S-D (étendu) — les libellés utilisateur (noms/natures de catégories, alertes)
// sont neutralisés via sanitizePromptText et le bloc de données isolé en <DONNEES>.
const buildPrompt = (p: BudgetAiPayload): string => {
    const dataBlock = wrapUserData(`DONNÉES DU MOIS (montants arrondis à 100$):
- Revenu net mensuel: ${Math.round(p.totalNetIncome / 100) * 100}$
- Budget prévu: ${Math.round(p.totalBudget / 100) * 100}$
- Dépenses réelles: ${Math.round(p.totalSpent / 100) * 100}$
- Alertes de dépassement: ${p.alerts.length > 0 ? p.alerts.map(a => sanitizePromptText(a, 80)).join(', ') : 'Aucune'}

DÉTAIL DES CATÉGORIES (Prévu vs Réel):
${p.categories.map(c => `- ${sanitizePromptText(c.name, 40)} (${sanitizePromptText(c.nature, 20)}): ${Math.round(c.target)}$ prévu, ${Math.round(c.spent)}$ dépensé`).join('\n')}`);

    return `Analyse ce budget mensuel et fournis EXACTEMENT 3 recommandations courtes (1-2 phrases max) très concrètes et orientées action.

${dataBlock}

RÉPONDS UNIQUEMENT avec un JSON Array strict de 3 strings (pas de markdown):
["recommandation 1", "recommandation 2", "recommandation 3"]`;
};

export const BudgetAiModal: React.FC<BudgetAiModalProps> = ({ apiKey, payload, onClose }) => {
    const [isStreaming, setIsStreaming] = useState(true);
    const [streamingText, setStreamingText] = useState('');
    const [recommendations, setRecommendations] = useState<string[]>([]);
    const [hasError, setHasError] = useState(false);

    // Phase D'.7 — diagnostic IA fluide (streaming) au lieu d'un one-shot 30s.
    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();

        const run = async () => {
            if (!apiKey) {
                setHasError(true);
                setIsStreaming(false);
                return;
            }
            let accumulator = '';
            try {
                for await (const chunk of chatStream(
                    [{ role: 'user', content: buildPrompt(payload) }],
                    apiKey,
                    { system: QUEBEC_SYSTEM, maxTokens: 1024, temperature: 0.7, signal: controller.signal },
                )) {
                    if (cancelled) return;
                    accumulator += chunk;
                    setStreamingText(accumulator);
                }
                // Stream complet : parse le JSON final
                const jsonMatch = accumulator.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    const validated = RecosSchema.parse(parsed);
                    if (!cancelled) setRecommendations(validated);
                } else {
                    // Pas de JSON détecté : fallback affichage brut
                    if (!cancelled) setRecommendations([accumulator]);
                }
            } catch (err) {
                console.error('[BudgetAiModal] streaming failed:', err);
                if (!cancelled) setHasError(true);
            } finally {
                if (!cancelled) setIsStreaming(false);
            }
        };
        run();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [apiKey, payload]);

    return (
        <Modal
            isOpen
            onClose={onClose}
            title="Diagnostic IA du Budget"
            icon="✨"
            size="lg"
        >
            {isStreaming && recommendations.length === 0 ? (
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                        <p className="text-sm text-gray-400 animate-pulse">L'IA analyse vos lignes de budget…</p>
                    </div>
                    {streamingText && (
                        <div className="bg-white/5 border border-white/10 rounded-lg p-3 max-h-48 overflow-y-auto">
                            <p className="text-tiny text-gray-500 font-mono whitespace-pre-wrap leading-relaxed">
                                {streamingText}
                                <span className="inline-block w-1 h-3 bg-indigo-400 ml-1 animate-pulse" aria-hidden="true" />
                            </p>
                        </div>
                    )}
                </div>
            ) : hasError ? (
                <div className="space-y-3">
                    <p className="text-red-400 text-sm">Échec de l'analyse IA. Vérifie ta clé Anthropic dans Configuration.</p>
                    <button
                        onClick={onClose}
                        className="w-full py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg font-bold transition-colors"
                    >
                        Fermer
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {recommendations.map((reco, idx) => (
                        <div key={idx} className="bg-white/5 border border-white/10 rounded-lg p-4 flex gap-3 animate-slide-up" style={{ animationDelay: `${idx * 100}ms` }}>
                            <div className="text-indigo-400 mt-0.5 text-lg" aria-hidden="true">•</div>
                            <p className="text-sm text-gray-200 leading-relaxed">{reco}</p>
                        </div>
                    ))}
                    <button
                        onClick={onClose}
                        className="w-full mt-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition-colors"
                    >
                        Fermer le diagnostic
                    </button>
                </div>
            )}
        </Modal>
    );
};
