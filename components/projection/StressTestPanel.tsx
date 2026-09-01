// components/projection/StressTestPanel.tsx
// [UI-SCEN] (2026-06-09) — les 6 STRESS-TESTS (Liberté 55, Choc d'inflation, Héritage,
// Hiver économique, Tempête parfaite, Héritage tardif) ne sont PLUS recalculés à chaque
// changement de paramètre : ils vivent ici, calculés À LA DEMANDE (bouton explicite,
// 6 simulations complètes dans le Web Worker via onlyStratTypes).
// Chaque résultat est comparé au scénario RÉALISTE courant (delta de patrimoine successoral).

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Icon } from '../ui/Icon';
import type { SimulationParams } from '../../services/projection';
import type { ProjectionResult } from '../../services/projection/types';
import { runProjectionAsync } from '../../services/projection/runAsync';
import { STRESS_STRAT_TYPES } from '../../services/projection/scenarios';
import { logError } from '../../services/errorLogger';
import { PrivateAmount } from '../ui/PrivateAmount';
import { formatCompactCAD } from '../../utils/format';

interface Props {
    params: SimulationParams;
    /** Patrimoine successoral du scénario réaliste courant (allResults[0]) — base des deltas. */
    baselineEstateNW?: number;
}

type Status = 'idle' | 'running' | 'done' | 'error';

// [FORMAT-EXPLAINS-TOLOCALESTRING] Même correctif que `StrategyOptimizerPanel` : le format
// composé à la main écrivait « 2.35M$ », séparateur décimal ANGLAIS dans une app fr-CA.
const fmtM = (v: number): string => formatCompactCAD(v);

export const StressTestPanel: React.FC<Props> = ({ params, baselineEstateNW }) => {
    const [status, setStatus] = useState<Status>('idle');
    const [results, setResults] = useState<ProjectionResult[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const aliveRef = useRef(true);
    useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []); // ré-armé au remount (StrictMode dev)
    // Invalidation : un changement de paramètres rend les résultats PÉRIMÉS (le delta
    // « vs réaliste » comparerait deux mondes différents) → retour à l'état initial.
    useEffect(() => { setStatus('idle'); setResults(null); setError(null); }, [params]);

    const run = useCallback(async () => {
        setStatus('running');
        setError(null);
        try {
            const res = await runProjectionAsync(params, false, 0, STRESS_STRAT_TYPES as string[]);
            if (!aliveRef.current) return;
            setResults(res.allResults ?? []);
            setStatus('done');
        } catch (e: unknown) {
            logError({ source: 'projection', severity: 'warning', message: 'StressTestPanel : échec des stress-tests', error: e instanceof Error ? e : new Error(String(e)) });
            if (!aliveRef.current) return;
            setError(e instanceof Error ? e.message : 'Échec des stress-tests');
            setStatus('error');
        }
    }, [params]);

    return (
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-meta font-black text-white tracking-tight flex items-center gap-1.5">
                    <Icon name="alert" size={14} className="text-amber-300" /> Stress-tests
                </h3>
                {status === 'done' && results && (
                    <span role="status" aria-live="polite" className="text-tiny font-bold text-amber-300">{results.length} chocs testés</span>
                )}
            </div>
            <p className="text-tiny text-ink-300 mt-1.5">
                Soumet ton plan à des chocs (inflation, hiver économique, retraite à 55 ans, héritages…)
                et mesure l'écart avec ton scénario réaliste. Calculé à la demande — ne ralentit pas tes réglages.
                Les montants = patrimoine successoral (rentes RRQ/PSV incluses).
            </p>

            {/* Bouton TOUJOURS monté (a11y : le démonter faisait retomber le focus clavier
                sur <body> à la fin du run) ; libellé ternaire, « Relancer » absorbé. */}
            <button
                type="button"
                onClick={run}
                disabled={status === 'running'}
                className="mt-3 w-full rounded-lg bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-60 disabled:cursor-not-allowed border border-amber-500/40 px-3 py-2 text-meta font-bold text-amber-200 focus-ring transition-colors"
            >
                {status === 'running' ? 'Simulation des chocs…' : status === 'done' ? '↻ Relancer les stress-tests' : 'Lancer les stress-tests'}
            </button>

            {status === 'error' && (
                <p role="alert" className="mt-3 text-tiny text-danger-400 flex items-center gap-1.5"><Icon name="alert" size={12} /> {error}</p>
            )}

            {status === 'done' && results && (
                <div className="mt-3 space-y-1.5">
                    {results.map((r) => {
                        const delta = baselineEstateNW !== undefined ? (r.estateNetWorth ?? 0) - baselineEstateNW : null;
                        return (
                            <div key={r.stratType} className="rounded-lg bg-white/5 px-3 py-2">
                                <div className="flex items-center gap-2.5">
                                    <span aria-hidden="true" className="shrink-0">{r.icon}</span>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-tiny font-bold text-white truncate">{r.strategyName}</div>
                                        <div className="text-tiny text-ink-400 truncate">{r.stratDescription}</div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <PrivateAmount as="div" className="text-meta font-black text-white tabular-nums">{fmtM(r.estateNetWorth ?? 0)}</PrivateAmount>
                                        {delta !== null && (
                                            <PrivateAmount as="div" className={`text-tiny font-bold tabular-nums ${delta >= 0 ? 'text-success-400' : 'text-orange-300'}`}>
                                                {delta >= 0 ? '+' : ''}{fmtM(delta)} vs réaliste
                                            </PrivateAmount>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
