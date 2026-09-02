import React, { useState, useEffect } from 'react';
import { logError } from '../../services/errorLogger';
import { messageErreurIa } from '../../services/messageErreurIa';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { chatStream, safeJsonValidate, MODEL_HAIKU } from '../../services/claude';
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
    /**
     * [AI-BUDGETMODAL-RAW-FALLBACK] ⚠️ DEUX RÉSULTATS DE NATURE DIFFÉRENTE, et le composant n'en
     * connaissait qu'un. Quand le modèle rend le JSON demandé, chaque entrée a traversé `RecosSchema`.
     * Quand il rend autre chose, on affichait le texte BRUT dans les mêmes puces — indiscernable
     * d'une recommandation validée.
     *
     * ⚠️ Le ticket prescrivait « échec honnête plutôt qu'affichage de secours ». Ce serait une
     * RÉGRESSION : le repli sur le texte brut est délibéré (`[BUDGET-AI-DUP-PARSING]`), parce que
     * jeter une réponse lisible pour cause de format est pire que de la montrer. Ce qui manquait
     * n'était pas le refus, c'était le STATUT — même leçon que le lot 69, où le mot « estimée » était
     * là mais l'habillage mentait.
     */
    type Diagnostic =
        | { readonly forme: 'validee'; readonly items: readonly string[] }
        | { readonly forme: 'brute'; readonly texte: string };
    const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
    // [AI-BUDGETMODAL-ERROR-COLLAPSE] Le message, pas un booléen : quatre causes se disaient
    // pareil. `null` couvre à la fois « pas d'erreur » et « annulation volontaire ».
    const [erreur, setErreur] = useState<string | null>(null);

    // Phase D'.7 — diagnostic IA fluide (streaming) au lieu d'un one-shot 30s.
    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();

        const run = async () => {
            if (!apiKey) {
                setErreur(messageErreurIa(null, { cleAbsente: true }));
                setIsStreaming(false);
                return;
            }
            let accumulator = '';
            try {
                for await (const chunk of chatStream(
                    [{ role: 'user', content: buildPrompt(payload) }],
                    apiKey,
                    // [BUDGET-AI-WRONG-MODEL] Haiku EXPLICITE : sans `model`, `chatStream` retombe
                    // sur MODEL_SONNET. Les 5 autres surfaces de même nature (catégorisation,
                    // rééquilibrage, abonnements, conseil immo, optimisation couple) passent toutes
                    // Haiku — celle-ci était la seule Haiku-éligible à payer le tarif Sonnet.
                    { model: MODEL_HAIKU, system: QUEBEC_SYSTEM, maxTokens: 1024, temperature: 0.7, signal: controller.signal },
                )) {
                    if (cancelled) return;
                    accumulator += chunk;
                    setStreamingText(accumulator);
                }
                // [BUDGET-AI-DUP-PARSING] `safeJsonValidate` (services/claude.ts) au lieu d'un
                // parsing réimplémenté ici : il gère déjà les fences ```json, la prose autour, et
                // rend `null` au lieu de JETER sur un JSON malformé — l'ancienne version faisait
                // remonter l'exception au `catch` global, qui affichait « erreur » et perdait TOUT
                // le texte déjà streamé alors qu'il était lisible.
                const validated = safeJsonValidate(accumulator, RecosSchema);
                if (validated) {
                    if (!cancelled) setDiagnostic({ forme: 'validee', items: validated });
                } else {
                    // Rien d'exploitable en JSON : on montre le texte brut plutôt que rien — mais
                    // MARQUÉ, parce qu'il n'a traversé aucun schéma.
                    if (!cancelled) setDiagnostic({ forme: 'brute', texte: accumulator });
                }
            } catch (err) {
                logError({ source: 'ai', severity: 'error', message: 'Diagnostic budget IA : échec du streaming', error: err });
                // [AI-BUDGETMODAL-ERROR-COLLAPSE] `null` = annulation (l'utilisateur a fermé) : rien
                // à afficher. Un booléen ne pouvait pas exprimer cette nuance — il rendait « erreur »
                // sur un geste volontaire.
                if (!cancelled) setErreur(messageErreurIa(err));
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
            icon={<Icon name="sparkles" size={22} />}
            size="lg"
        >
            {isStreaming && diagnostic === null ? (
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                        <p className="text-body text-ink-300 animate-pulse">L'IA analyse vos lignes de budget…</p>
                    </div>
                    {streamingText && (
                        <div className="bg-white/5 border border-white/10 rounded-lg p-3 max-h-48 overflow-y-auto">
                            <p className="text-tiny text-ink-400 font-mono whitespace-pre-wrap leading-relaxed">
                                {streamingText}
                                <span className="inline-block w-1 h-3 bg-indigo-400 ml-1 animate-pulse" aria-hidden="true" />
                            </p>
                        </div>
                    )}
                </div>
            ) : erreur !== null ? (
                <div className="space-y-3">
                    <p className="text-danger-400 text-body">{erreur}</p>
                    <button
                        onClick={onClose}
                        className="w-full py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg font-bold transition-colors"
                    >
                        Fermer
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {diagnostic?.forme === 'validee' && diagnostic.items.map((reco, idx) => (
                        <div key={idx} className="bg-white/5 border border-white/10 rounded-lg p-4 flex gap-3 animate-slide-up" style={{ animationDelay: `${idx * 100}ms` }}>
                            <div className="text-indigo-400 mt-0.5 text-lg" aria-hidden="true">•</div>
                            <p className="text-body text-ink-100 leading-relaxed">{reco}</p>
                        </div>
                    ))}
                    {diagnostic?.forme === 'brute' && (
                        // ⚠️ Présentation DIFFÉRENTE, volontairement : ni puce ni carte de
                        // recommandation. Le texte est conservé (le jeter serait pire) mais il
                        // n'emprunte pas l'apparence de ce qui a été validé.
                        <div className="bg-white/[0.03] border border-dashed border-white/15 rounded-lg p-4 space-y-2">
                            <p className="text-tiny text-ink-400 italic">
                                L'IA n'a pas répondu dans le format attendu. Voici sa réponse telle
                                quelle — elle n'a été ni découpée ni vérifiée par l'app.
                            </p>
                            <p className="text-body text-ink-200 leading-relaxed whitespace-pre-wrap">{diagnostic.texte}</p>
                        </div>
                    )}
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
