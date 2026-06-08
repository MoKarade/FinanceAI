// components/projection/RobustnessPanel.tsx
// G21 C4 — classement des stratégies par robustesse (Monte Carlo, taux de succès).
//
// Déclenché par bouton explicite : 5 stratégies × 1000 sims = ~5000 simulations
// complètes, beaucoup trop lourd pour tourner à chaque rendu ou changement de
// paramètre. Exécuté dans le Web Worker via runRobustnessRankingAsync, avec une
// barre de progression alimentée par les messages de progrès du worker.

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Icon } from '../ui/Icon';
import type { SimulationParams, RobustnessRanking } from '../../services/projection';
import { runRobustnessRankingAsync, type RobustnessProgress } from '../../services/projection/runAsync';

interface Props {
    params: SimulationParams;
    /** Itérations MC par stratégie (borné [50,1000] côté moteur). Défaut 1000. */
    iterationsPerStrategy?: number;
}

type Status = 'idle' | 'running' | 'done' | 'error';

// Couleur de la barre selon le taux de succès (sémantique, pas décorative).
function successColor(rate: number): string {
    if (rate >= 90) return 'bg-green-400';
    if (rate >= 75) return 'bg-success-400';
    if (rate >= 50) return 'bg-warning-400';
    return 'bg-danger-400';
}

export const RobustnessPanel: React.FC<Props> = ({ params, iterationsPerStrategy = 1000 }) => {
    const [status, setStatus] = useState<Status>('idle');
    const [progress, setProgress] = useState<RobustnessProgress | null>(null);
    const [ranking, setRanking] = useState<RobustnessRanking | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Évite de poser un state sur un composant démonté si l'utilisateur change
    // d'onglet pendant les ~secondes de calcul.
    const aliveRef = useRef(true);
    useEffect(() => () => { aliveRef.current = false; }, []);

    const run = useCallback(async () => {
        setStatus('running');
        setError(null);
        setProgress({ done: 0, total: 5, current: '' });
        try {
            const result = await runRobustnessRankingAsync(params, {
                iterationsPerStrategy,
                onProgress: (p) => { if (aliveRef.current) setProgress(p); },
            });
            if (!aliveRef.current) return;
            setRanking(result);
            setStatus('done');
        } catch (e: unknown) {
            if (!aliveRef.current) return;
            setError(e instanceof Error ? e.message : 'Échec du calcul de robustesse');
            setStatus('error');
        }
    }, [params, iterationsPerStrategy]);

    const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
    const bestRate = ranking?.ranked[0]?.successRate ?? null;

    return (
        <div className="mt-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3.5">
            <div className="flex items-center justify-between gap-2">
                <span className="text-meta font-black text-white tracking-tight flex items-center gap-1.5">
                    <Icon name="dice" size={14} className="text-ink-300" /> Robustesse des stratégies
                </span>
                {status === 'done' && bestRate !== null && (
                    <span className="text-tiny font-bold text-indigo-300">
                        Meilleure : {bestRate}% de succès
                    </span>
                )}
            </div>

            <p className="text-tiny text-ink-300 mt-1.5">
                Lance un Monte Carlo ({iterationsPerStrategy.toLocaleString('fr-CA')} simulations × 5 stratégies)
                pour classer les façons de gérer par <strong className="text-white">taux de succès</strong> —
                le % de scénarios où votre patrimoine ne s'épuise jamais.
            </p>

            {status !== 'done' && (
                <button
                    type="button"
                    onClick={run}
                    disabled={status === 'running'}
                    className="mt-3 w-full rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 disabled:opacity-60 disabled:cursor-not-allowed border border-indigo-500/40 px-3 py-2 text-meta font-bold text-indigo-200 focus-ring transition-colors"
                >
                    {status === 'running' ? 'Calcul en cours…' : 'Tester la robustesse'}
                </button>
            )}

            {status === 'running' && progress && (
                <div className="mt-3">
                    <div className="flex items-center justify-between text-tiny text-ink-400 mb-1">
                        <span>{progress.current || 'Préparation…'}</span>
                        <span>{progress.done}/{progress.total}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full bg-indigo-400 transition-[width] duration-300" style={{ width: `${pct}%` }} />
                    </div>
                </div>
            )}

            {status === 'error' && (
                <p className="mt-3 text-tiny text-red-300 flex items-center gap-1.5"><Icon name="alert" size={12} /> {error}</p>
            )}

            {status === 'done' && ranking && (
                <div className="mt-3 space-y-1.5">
                    {ranking.ranked.map((r, i) => (
                        <div key={r.strategy} className="flex items-center gap-2.5 rounded-lg bg-white/5 px-3 py-2">
                            <span className="text-tiny font-mono text-ink-500 w-4 shrink-0">{i + 1}</span>
                            <span aria-hidden="true" className="shrink-0">{r.icon}</span>
                            <div className="min-w-0 flex-1">
                                <div className="text-tiny font-bold text-white truncate">{r.strategyName}</div>
                                <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                    <div className={`h-full ${successColor(r.successRate)}`} style={{ width: `${r.successRate}%` }} />
                                </div>
                            </div>
                            <div className="text-right shrink-0">
                                <div className="text-meta font-black text-white tabular-nums">{r.successRate}%</div>
                                <div className="text-tiny text-ink-400 tabular-nums privacy-blur">
                                    {(r.medianFinalNW / 1_000_000).toFixed(2)}M$
                                </div>
                            </div>
                        </div>
                    ))}
                    <p className="text-tiny text-ink-500 mt-1">
                        Médiane = patrimoine final de la trajectoire centrale. Basé sur {ranking.iterationsPerStrategy.toLocaleString('fr-CA')} simulations/stratégie.
                    </p>
                    <button
                        type="button"
                        onClick={run}
                        className="mt-1 text-tiny text-indigo-300 hover:text-indigo-200 focus-ring rounded"
                    >
                        ↻ Relancer
                    </button>
                </div>
            )}
        </div>
    );
};
