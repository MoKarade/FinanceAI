// components/projection/StrategyOptimizerPanel.tsx
// G21 C5 commit 6 — optimiseur de stratégies configurable.
//
// L'utilisateur compose son espace de recherche en cochant des valeurs de leviers ;
// le compte de configurations + le temps estimé s'affichent en direct. Au clic, un
// pool multi-worker lance un Monte Carlo sur chaque config (runStrategySearchAsync).
// Le classement par objectif (rankConfigResults) est re-calculé en mémoire au
// changement d'objectif — aucun recalcul moteur. Verdict détaillé du gagnant +
// score complet + tableau triable/filtrable de toutes les configs.

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { SimulationParams, ConfigResult } from '../../services/projection';
import {
    rankConfigResults,
    explainWinner,
    OBJECTIVE_LABELS,
    type OptimizeObjective,
    type RankedConfig,
} from '../../services/projection';
import {
    runStrategySearchAsync,
    type StrategySearchProgress,
} from '../../services/projection/runAsync';
import {
    LEVER_LIBRARY,
    leverValueLabel,
    type StrategyConfig,
} from '../../services/projection/strategyConfig';
import {
    countConfigs,
    estimateRuntimeMs,
    generateStrategySpace,
    type LeverSelection,
    type SpaceContext,
} from '../../services/projection/strategySpace';

interface Props {
    params: SimulationParams;
    /** Itérations MC par config (borné [50,1000] côté moteur). Défaut 1000. */
    iterations?: number;
}

type Status = 'idle' | 'running' | 'done' | 'error';

const OBJECTIVES: OptimizeObjective[] = ['balanced', 'wealth', 'tax', 'fire'];
const WARN_THRESHOLD = 300; // au-delà : avertissement temps de calcul

const fmtM = (v: number): string => `${(v / 1_000_000).toFixed(2)}M$`;
const fmtMs = (ms: number): string => {
    const s = Math.ceil(ms / 1000);
    if (s < 60) return `~${s} s`;
    return `~${Math.ceil(s / 60)} min`;
};

function successColor(rate: number): string {
    if (rate >= 90) return 'bg-green-400';
    if (rate >= 75) return 'bg-emerald-400';
    if (rate >= 50) return 'bg-amber-400';
    return 'bg-red-400';
}

// Une barre de sous-score 0..1 (détail du score).
const ScoreBar: React.FC<{ label: string; value: number }> = ({ label, value }) => (
    <div className="flex items-center gap-2">
        <span className="text-tiny text-ink-400 w-24 shrink-0">{label}</span>
        <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-indigo-400" style={{ width: `${Math.round(value * 100)}%` }} />
        </div>
        <span className="text-tiny text-ink-300 tabular-nums w-9 text-right">{Math.round(value * 100)}</span>
    </div>
);

export const StrategyOptimizerPanel: React.FC<Props> = ({ params, iterations = 1000 }) => {
    const [selection, setSelection] = useState<LeverSelection>({});
    const [objective, setObjective] = useState<OptimizeObjective>('balanced');
    const [status, setStatus] = useState<Status>('idle');
    const [progress, setProgress] = useState<StrategySearchProgress | null>(null);
    const [results, setResults] = useState<ConfigResult[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<{ key: keyof StrategyConfig; value: unknown } | null>(null);

    const aliveRef = useRef(true);
    useEffect(() => () => { aliveRef.current = false; }, []);

    const ctx: SpaceContext = useMemo(() => ({
        hasPrimaryPurchase: (params.realEstateGoals?.length ?? 0) > 0,
        currentAge: params.config.users[0]?.age ?? 35,
    }), [params]);

    const configCount = useMemo(() => countConfigs(selection, ctx), [selection, ctx]);
    const nWorkers = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
    const estMs = useMemo(
        () => estimateRuntimeMs(configCount, iterations) / Math.max(1, nWorkers),
        [configCount, iterations, nWorkers],
    );

    // Re-tri par objectif SANS recalcul moteur : dérivé des résultats bruts.
    const ranking = useMemo(
        () => (results ? rankConfigResults(results, objective) : null),
        [results, objective],
    );

    const toggleValue = useCallback(<K extends keyof StrategyConfig>(key: K, value: StrategyConfig[K]) => {
        setSelection((prev) => {
            const current = (prev[key] as ReadonlyArray<StrategyConfig[K]> | undefined) ?? [];
            const next = current.includes(value)
                ? current.filter((v) => v !== value)
                : [...current, value];
            return { ...prev, [key]: next };
        });
    }, []);

    const run = useCallback(async () => {
        setStatus('running');
        setError(null);
        setResults(null);
        setProgress({ done: 0, total: configCount });
        try {
            const configs = generateStrategySpace(selection, ctx);
            const result = await runStrategySearchAsync(params, configs, {
                iterations,
                onProgress: (p) => { if (aliveRef.current) setProgress(p); },
            });
            if (!aliveRef.current) return;
            setResults(result.results);
            setStatus('done');
        } catch (e: unknown) {
            if (!aliveRef.current) return;
            setError(e instanceof Error ? e.message : 'Échec de la recherche de stratégie');
            setStatus('error');
        }
    }, [params, selection, ctx, configCount, iterations]);

    const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
    const winner = ranking?.ranked[0] ?? null;
    const runnerUp = ranking?.ranked[1] ?? null;

    const filteredRows = useMemo(() => {
        if (!ranking) return [];
        if (!filter) return ranking.ranked;
        return ranking.ranked.filter((r) => r.result.config[filter.key] === filter.value);
    }, [ranking, filter]);

    return (
        <div className="mt-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3.5">
            <div className="flex items-center justify-between gap-2">
                <span className="text-meta font-black text-white tracking-tight flex items-center gap-1.5">
                    <span aria-hidden="true">🧭</span> Optimiseur de stratégie
                </span>
                {status === 'done' && winner && (
                    <span className="text-tiny font-bold text-indigo-300">
                        {ranking!.ranked.length} stratégies testées
                    </span>
                )}
            </div>

            <p className="text-tiny text-ink-300 mt-1.5">
                Cochez les leviers à explorer. On teste <strong className="text-white">toutes les combinaisons</strong> par
                Monte Carlo et on désigne la meilleure selon votre objectif.
            </p>

            {/* Composeur de leviers */}
            <div className="mt-3 space-y-2.5">
                {LEVER_LIBRARY.map((lever) => {
                    const selected = (selection[lever.key] as ReadonlyArray<unknown> | undefined) ?? [];
                    return (
                        <div key={String(lever.key)}>
                            <div className="text-tiny font-bold text-ink-200 mb-1">{lever.label}</div>
                            <div className="flex flex-wrap gap-1.5">
                                {lever.options.map((opt) => {
                                    const active = selected.includes(opt.value);
                                    return (
                                        <button
                                            key={String(opt.value)}
                                            type="button"
                                            onClick={() => toggleValue(lever.key, opt.value as never)}
                                            aria-pressed={active}
                                            className={`rounded-lg border px-2.5 py-1 text-tiny font-medium focus-ring transition-colors ${
                                                active
                                                    ? 'border-indigo-400 bg-indigo-500/30 text-white'
                                                    : 'border-white/10 bg-white/5 text-ink-300 hover:bg-white/10'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Compte + temps estimé en direct */}
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
                <span className="text-tiny text-ink-300">
                    <strong className="text-white tabular-nums">{configCount.toLocaleString('fr-CA')}</strong> configuration{configCount > 1 ? 's' : ''}
                    {' · '}{fmtMs(estMs)} sur {nWorkers} cœur{nWorkers > 1 ? 's' : ''}
                </span>
                {configCount > WARN_THRESHOLD && (
                    <span className="text-tiny font-bold text-amber-300">⚠️ calcul long</span>
                )}
            </div>

            {status !== 'running' && (
                <button
                    type="button"
                    onClick={run}
                    className="mt-3 w-full rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 px-3 py-2 text-meta font-bold text-indigo-200 focus-ring transition-colors"
                >
                    {status === 'done' ? '↻ Relancer la recherche' : 'Trouver la meilleure stratégie'}
                </button>
            )}

            {status === 'running' && progress && (
                <div className="mt-3">
                    <div className="flex items-center justify-between text-tiny text-ink-400 mb-1">
                        <span>Simulation en cours…</span>
                        <span className="tabular-nums">{progress.done}/{progress.total}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full bg-indigo-400 transition-[width] duration-300" style={{ width: `${pct}%` }} />
                    </div>
                </div>
            )}

            {status === 'error' && <p className="mt-3 text-tiny text-red-300">⚠️ {error}</p>}

            {status === 'done' && ranking && winner && (
                <div className="mt-4 space-y-3">
                    {/* Sélecteur d'objectif — re-trie sans recalcul */}
                    <div className="flex flex-wrap gap-1.5">
                        {OBJECTIVES.map((obj) => (
                            <button
                                key={obj}
                                type="button"
                                onClick={() => setObjective(obj)}
                                aria-pressed={objective === obj}
                                className={`rounded-lg border px-2.5 py-1 text-tiny font-bold focus-ring transition-colors ${
                                    objective === obj
                                        ? 'border-indigo-400 bg-indigo-500/30 text-white'
                                        : 'border-white/10 bg-white/5 text-ink-300 hover:bg-white/10'
                                }`}
                            >
                                {OBJECTIVE_LABELS[obj]}
                            </button>
                        ))}
                    </div>

                    <WinnerCard winner={winner} explanation={explainWinner(winner, runnerUp, objective)} survivalThreshold={ranking.survivalThreshold} hasSurvivor={ranking.hasSurvivor} />

                    {/* Tableau de toutes les configs + filtre par levier */}
                    <ResultsTable
                        rows={filteredRows}
                        totalRows={ranking.ranked.length}
                        filter={filter}
                        onFilter={setFilter}
                    />
                </div>
            )}
        </div>
    );
};

// ── Carte du gagnant : 10 leviers en clair + explication + détail du score ──
const WinnerCard: React.FC<{
    winner: RankedConfig;
    explanation: string;
    survivalThreshold: number;
    hasSurvivor: boolean;
}> = ({ winner, explanation, survivalThreshold, hasSurvivor }) => {
    const r = winner.result;
    return (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-3">
            <div className="flex items-center gap-2">
                <span aria-hidden="true">🏆</span>
                <span className="text-meta font-black text-white">Stratégie gagnante</span>
                {!hasSurvivor && (
                    <span className="text-tiny text-amber-300">aucune n'atteint {survivalThreshold}% de succès</span>
                )}
            </div>

            {/* Métriques clés */}
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Metric label="Succès" value={`${r.successRate}%`} />
                <Metric label="Patrimoine méd." value={fmtM(r.finalNWp50)} blur />
                <Metric label="Impôt à vie" value={fmtM(r.lifetimeTax)} blur />
                <Metric label="FIRE" value={r.fireAge !== null ? `${Math.round(r.fireAge)} ans` : '—'} />
            </div>

            {/* Les 10 leviers en clair */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
                {LEVER_LIBRARY.map((lever) => (
                    <span key={String(lever.key)} className="rounded bg-white/5 px-2 py-0.5 text-tiny text-ink-300">
                        {lever.label}: <strong className="text-white">{leverValueLabel(lever.key, r.config[lever.key])}</strong>
                    </span>
                ))}
            </div>

            <p className="mt-2.5 text-tiny text-ink-200 leading-relaxed">{explanation}</p>

            {/* Détail du score */}
            <div className="mt-2.5 space-y-1">
                <div className="text-tiny font-bold text-ink-300 mb-1">Détail du score</div>
                <ScoreBar label="Survie" value={winner.breakdown.survival} />
                <ScoreBar label="Patrimoine" value={winner.breakdown.wealth} />
                <ScoreBar label="Fiscalité" value={winner.breakdown.tax} />
                <ScoreBar label="FIRE" value={winner.breakdown.fire} />
                <ScoreBar label="Robustesse" value={winner.breakdown.robustness} />
            </div>
        </div>
    );
};

const Metric: React.FC<{ label: string; value: string; blur?: boolean }> = ({ label, value, blur }) => (
    <div className="rounded-lg bg-white/5 px-2.5 py-1.5">
        <div className="text-tiny text-ink-400">{label}</div>
        <div className={`text-meta font-black text-white tabular-nums ${blur ? 'privacy-blur' : ''}`}>{value}</div>
    </div>
);

// ── Tableau de toutes les configs (triable par le classement courant, filtrable) ──
const ResultsTable: React.FC<{
    rows: RankedConfig[];
    totalRows: number;
    filter: { key: keyof StrategyConfig; value: unknown } | null;
    onFilter: (f: { key: keyof StrategyConfig; value: unknown } | null) => void;
}> = ({ rows, totalRows, filter, onFilter }) => {
    // Filtre simple : choix d'un levier + valeur. La 1re sélection construit le filtre.
    const filterKey = filter?.key ?? '';
    const lever = LEVER_LIBRARY.find((l) => l.key === filterKey);

    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-tiny font-bold text-ink-300">
                    Toutes les stratégies {filter ? `(${rows.length}/${totalRows})` : `(${totalRows})`}
                </span>
                <div className="flex items-center gap-1.5">
                    <select
                        value={String(filterKey)}
                        onChange={(e) => {
                            const key = e.target.value as keyof StrategyConfig | '';
                            if (!key) { onFilter(null); return; }
                            const def = LEVER_LIBRARY.find((l) => l.key === key)!;
                            onFilter({ key, value: def.options[0].value });
                        }}
                        className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-tiny text-ink-200 focus-ring"
                        aria-label="Filtrer par levier"
                    >
                        <option value="">Filtrer par…</option>
                        {LEVER_LIBRARY.map((l) => (
                            <option key={String(l.key)} value={String(l.key)}>{l.label}</option>
                        ))}
                    </select>
                    {lever && (
                        <select
                            value={String(filter?.value)}
                            onChange={(e) => {
                                const opt = lever.options.find((o) => String(o.value) === e.target.value);
                                if (opt) onFilter({ key: lever.key, value: opt.value });
                            }}
                            className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-tiny text-ink-200 focus-ring"
                            aria-label="Valeur du filtre"
                        >
                            {lever.options.map((o) => (
                                <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-lg border border-white/10">
                <table className="w-full text-tiny">
                    <thead className="sticky top-0 bg-ink-900/95 text-ink-400">
                        <tr>
                            <th className="px-2 py-1.5 text-left font-medium">#</th>
                            <th className="px-2 py-1.5 text-right font-medium">Succès</th>
                            <th className="px-2 py-1.5 text-right font-medium">Patrim. méd.</th>
                            <th className="px-2 py-1.5 text-right font-medium">Impôt</th>
                            <th className="px-2 py-1.5 text-right font-medium">FIRE</th>
                            <th className="px-2 py-1.5 text-right font-medium">Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.rank} className={`border-t border-white/5 ${row.rank === 1 ? 'bg-green-500/10' : ''} ${!row.survived ? 'opacity-50' : ''}`}>
                                <td className="px-2 py-1.5 font-mono text-ink-500">{row.rank}</td>
                                <td className="px-2 py-1.5 text-right">
                                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${successColor(row.result.successRate)} mr-1`} aria-hidden="true" />
                                    <span className="tabular-nums text-white">{row.result.successRate}%</span>
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-ink-200 privacy-blur">{fmtM(row.result.finalNWp50)}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-ink-300 privacy-blur">{fmtM(row.result.lifetimeTax)}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-ink-300">{row.result.fireAge !== null ? `${Math.round(row.result.fireAge)}` : '—'}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums font-bold text-indigo-300">{Math.round(row.score * 100)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-tiny text-ink-500 mt-1">
                Patrimoine médian = trajectoire P50. Lignes estompées = sous le seuil de survie.
            </p>
        </div>
    );
};
