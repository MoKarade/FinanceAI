import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { useFinanceStore } from '../../store/useFinanceStore';
import { getRealEstateAdvice, type RealEstateContext, type RealEstateAdvice } from '../../services/claude';

/**
 * Phase F.8 — Conseils IA Immobilier poussés.
 *
 * Appelle Claude Haiku avec le contexte du projet immobilier en cours et
 * affiche 3 insights catégorisés (cost / timing / leverage / tax / risk).
 */

const CATEGORY_META: Record<RealEstateAdvice['insights'][number]['category'], { icon: string; label: string; color: string }> = {
    cost: { icon: '💰', label: 'Coût', color: 'text-amber-300 border-warning-500/30 bg-warning-500/5' },
    timing: { icon: '⏱️', label: 'Timing', color: 'text-info-300 border-info-500/30 bg-info-500/5' },
    leverage: { icon: '⚖️', label: 'Levier', color: 'text-purple-300 border-purple-500/30 bg-purple-500/5' },
    tax: { icon: '🏛️', label: 'Fiscal', color: 'text-emerald-300 border-success-500/30 bg-success-500/5' },
    risk: { icon: '⚠️', label: 'Risque', color: 'text-red-300 border-danger-500/30 bg-danger-500/5' },
};

interface RealEstateAdviceCardProps {
    context: RealEstateContext;
}

export const RealEstateAdviceCard: React.FC<RealEstateAdviceCardProps> = ({ context }) => {
    const apiKey = useFinanceStore(s => s.apiKeys.anthropic);
    const [advice, setAdvice] = useState<RealEstateAdvice | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGenerate = async () => {
        if (!apiKey) {
            setError('Configure ta clé Anthropic dans Configuration.');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const result = await getRealEstateAdvice(context, apiKey);
            if (result) {
                setAdvice(result);
            } else {
                setError('Aucun conseil généré. Réessaie.');
            }
        } catch {
            setError('Erreur IA. Vérifie ta clé.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card title="✨ Conseils IA — Projet immobilier" className="bg-gradient-to-br from-emerald-900/10 to-blue-900/10 border-success-500/20">
            <div className="space-y-3">
                {!advice && (
                    <div className="text-center py-4 space-y-2">
                        <p className="text-tiny text-ink-300">
                            Génère 3 conseils personnalisés sur les coûts cachés, le timing, le levier
                            fiscal (RAP/CELIAPP), et les risques (stress test B-20) pour ce projet.
                        </p>
                        <button
                            type="button"
                            onClick={handleGenerate}
                            disabled={isLoading || !apiKey}
                            className="px-4 py-2 bg-gradient-to-r from-success-600 to-info-600 text-white rounded-lg font-bold text-body hover:opacity-90 disabled:opacity-50"
                        >
                            {isLoading ? '⏳ Analyse…' : '✨ Conseiller le projet'}
                        </button>
                        {error && <p className="text-danger-400 text-tiny mt-1">{error}</p>}
                        {!apiKey && <p className="text-warning-400 text-tiny italic">Clé Anthropic requise (Configuration)</p>}
                    </div>
                )}

                {advice && (
                    <>
                        <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                            <div className="text-tiny text-ink-400 uppercase font-bold mb-1">Bilan IA</div>
                            <p className="text-meta text-ink-100 leading-relaxed">{advice.summary}</p>
                        </div>
                        <div className="space-y-2">
                            {advice.insights.map((ins, i) => {
                                const meta = CATEGORY_META[ins.category];
                                return (
                                    <div key={i} className={`p-3 rounded-lg border ${meta.color}`}>
                                        <div className="flex items-start gap-2 mb-1">
                                            <span aria-hidden="true" className="text-base">{meta.icon}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-white text-body">{ins.title}</div>
                                                <div className="text-tiny opacity-80 uppercase tracking-wide">{meta.label}</div>
                                            </div>
                                        </div>
                                        <p className="text-tiny text-ink-200 leading-relaxed ml-7">{ins.detail}</p>
                                    </div>
                                );
                            })}
                        </div>
                        <button
                            type="button"
                            onClick={handleGenerate}
                            disabled={isLoading}
                            className="w-full py-2 bg-white/5 hover:bg-white/10 text-ink-200 rounded-lg text-tiny font-bold transition-colors"
                        >
                            ↻ Régénérer
                        </button>
                    </>
                )}
            </div>
        </Card>
    );
};
