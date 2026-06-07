import React, { useState } from 'react';
import { Icon } from '../ui/Icon';
import { Card } from '../ui/Card';
import { useFinanceStore } from '../../store/useFinanceStore';
import { getCoupleOptimizationStrategies, type CoupleOptimizationStrategy, type CoupleTaxContext } from '../../services/claude';
import { formatCAD } from '../../utils/format';

/**
 * Phase G.4 — Optimisation fiscale croisée pour couple.
 *
 * Affiche un bouton "Générer stratégies IA" qui appelle Claude Haiku avec
 * le contexte fiscal complet du couple. Retourne 3 suggestions concrètes :
 *  - Spousal RRSP (allocation REER conjoint)
 *  - Allocation CELI optimale
 *  - Pension splitting (si retraite)
 *  - Transferts de crédits
 *  - Etc.
 *
 * Cache de session (pas localStorage — sensible). Refresh manuel.
 */

const CONFIDENCE_COLORS: Record<CoupleOptimizationStrategy['confidence'], string> = {
    high: 'text-emerald-300 border-success-500/30 bg-success-500/5',
    medium: 'text-amber-300 border-warning-500/30 bg-warning-500/5',
    low: 'text-ink-300 border-white/10 bg-white/5',
};

const CONFIDENCE_LABELS: Record<CoupleOptimizationStrategy['confidence'], string> = {
    high: 'Haute confiance',
    medium: 'Estimation',
    low: 'Idée à creuser',
};

export const CoupleOptimizationCard: React.FC = () => {
    const config = useFinanceStore(s => s.config);
    const apiKey = useFinanceStore(s => s.apiKeys.anthropic);

    const [strategies, setStrategies] = useState<CoupleOptimizationStrategy[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasError, setHasError] = useState(false);

    const u1 = config?.users?.[0];
    const u2 = config?.users?.[1];

    // N'affiche pas la card si mode individuel (pas de second user)
    if (!u1 || !u2 || !u2.name?.trim()) return null;

    const handleGenerate = async () => {
        if (!apiKey) return;
        setIsLoading(true);
        setHasError(false);
        const ctx: CoupleTaxContext = {
            user1: {
                name: u1.name || 'Personne 1',
                grossAnnual: (u1.grossSalary || 0) * 12,
                netAnnual: (u1.netSalary || 0) * 12,
            },
            user2: {
                name: u2.name || 'Personne 2',
                grossAnnual: (u2.grossSalary || 0) * 12,
                netAnnual: (u2.netSalary || 0) * 12,
            },
        };
        try {
            const result = await getCoupleOptimizationStrategies(ctx, apiKey);
            if (result.length === 0) {
                setHasError(true);
            } else {
                setStrategies(result);
            }
        } catch {
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card icon={<Icon name="sparkles" size={18} />} title="Optimisation fiscale couple (IA)" className="bg-gradient-to-br from-purple-900/10 to-pink-900/10 border-purple-500/20">
            <div className="space-y-4">
                <p className="text-tiny text-ink-300 leading-snug">
                    Génère 3 stratégies concrètes d'optimisation fiscale croisée :
                    fractionnement REER, allocation CELI, pension splitting, transfert de crédits.
                    Calculé pour <strong className="text-white">{u1.name}</strong> et <strong className="text-white">{u2.name}</strong>.
                </p>

                {strategies.length === 0 && (
                    <div className="text-center py-4">
                        {!apiKey ? (
                            <p className="text-warning-400 text-body">
                                ℹ️ Configure ta clé Anthropic dans Configuration pour activer l'IA.
                            </p>
                        ) : (
                            <button
                                type="button"
                                onClick={handleGenerate}
                                disabled={isLoading}
                                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-bold text-body hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                                {isLoading ? '⏳ Analyse fiscale…' : '✨ Générer 3 stratégies IA'}
                            </button>
                        )}
                        {hasError && (
                            <p className="text-danger-400 text-tiny mt-2">
                                Erreur lors de la génération. Vérifie ta clé Anthropic.
                            </p>
                        )}
                    </div>
                )}

                {strategies.length > 0 && (
                    <div className="space-y-3">
                        {strategies.map((s, i) => {
                            const colors = CONFIDENCE_COLORS[s.confidence];
                            return (
                                <div key={i} className={`p-4 rounded-lg border ${colors}`}>
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-base shrink-0" aria-hidden="true">
                                                {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                                            </span>
                                            <h4 className="font-bold text-white text-body">{s.title}</h4>
                                        </div>
                                        <span className="text-tiny font-mono opacity-70 shrink-0">{CONFIDENCE_LABELS[s.confidence]}</span>
                                    </div>
                                    <p className="text-tiny text-ink-200 leading-relaxed">{s.description}</p>
                                    {s.estimated_savings_cad !== undefined && s.estimated_savings_cad > 0 && (
                                        <div className="mt-2 inline-block px-2 py-1 bg-success-500/15 border border-success-500/30 rounded text-tiny font-mono font-bold text-emerald-300">
                                            Économie estimée : {formatCAD(s.estimated_savings_cad)}/an
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        <button
                            type="button"
                            onClick={handleGenerate}
                            disabled={isLoading}
                            className="w-full py-2 bg-white/5 hover:bg-white/10 text-ink-200 rounded-lg text-tiny font-bold transition-colors disabled:opacity-50"
                        >
                            {isLoading ? '⏳ Régénération…' : '↻ Régénérer les stratégies'}
                        </button>
                    </div>
                )}
            </div>
        </Card>
    );
};
