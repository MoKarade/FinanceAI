// components/investments/PerformanceComparee.tsx
//
// [S5-REFONTE-PLACEMENTS] « Performance comparée » (maquettes E/M-placements) : variation en % depuis
// le début de la période (base 100) du total et de chaque compte ; période au choix (1, 3, 6 mois,
// tout) ; une étiquette par série, cliquable pour la masquer, qui porte sa variation. Les titres
// individuels (absents des maquettes) restent disponibles, repliés derrière « Titres (N) ».
// Le mode Prix ($) et la superposition de titres vivent dans Détail → Comparer (StockComparisonModal).
import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import type { MarketDataPoint } from '../../services/finance';
import { CHART_TOOLTIP_STYLE } from '../../utils/chartTooltip';
import { formatDate, formatVariationPct } from '../../utils/format';
import { reperesRonds } from '../../utils/reperesRonds';
import { toPerformanceRows } from '../StockChart';
import { Skeleton } from '../ui/Skeleton';
import { ChartDataTable, type ChartDataColumn } from '../ui/ChartDataTable';

export type PeriodeGraphe = '1M' | '3M' | '6M' | 'ALL';
const PERIODES: ReadonlyArray<{ id: PeriodeGraphe; libelle: string }> = [
    { id: '1M', libelle: '1 mois' }, { id: '3M', libelle: '3 mois' }, { id: '6M', libelle: '6 mois' }, { id: 'ALL', libelle: 'Tout' },
];

/** Séries « compte » : libellé court et couleur des maquettes. */
const TOTAUX: Record<string, { libelle: string; couleur: string; ordre: number }> = {
    TOTAL: { libelle: 'Total', couleur: '#f8fafc', ordre: 0 },
    TOTAL_CELI: { libelle: 'CELI', couleur: '#34b39a', ordre: 1 },
    TOTAL_REER: { libelle: 'REER', couleur: '#7c93f2', ordre: 2 },
    'TOTAL_NON-ENREG': { libelle: 'Non-enregistré', couleur: '#d4a24c', ordre: 3 },
    TOTAL_CRYPTO: { libelle: 'Crypto', couleur: '#a78bfa', ordre: 4 },
    TOTAL_CELIAPP: { libelle: 'CELIAPP', couleur: '#7dd3c0', ordre: 5 },
};
const PALETTE_TITRES = ['#56b6d6', '#e0703a', '#f87171', '#c084fc', '#fbbf24', '#94a3b8', '#4ade80', '#f472b6'];

interface SerieDisponible { id: string; name: string }

interface Props {
    donnees: MarketDataPoint[];
    series: ReadonlyArray<SerieDisponible>;
    selection: ReadonlySet<string>;
    onSelection: (next: Set<string>) => void;
    periode: PeriodeGraphe;
    onPeriode: (p: PeriodeGraphe) => void;
    /** [PERF-STALE-TAIL-ZERO] (date, clé) raccordée au prix courant faute d'historique. */
    estSynthetique?: (date: string, cle: string) => boolean;
    chargement: boolean;
    etroit: boolean;
    children?: React.ReactNode;
}

/** « 2025-09-21 » → Date locale (jamais `new Date(iso)`, relu la veille dans un fuseau négatif). */
const jour = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };

/**
 * Variation (%) d'une série entre son premier et son dernier point valorisé de la fenêtre — le bout
 * de sa courbe base 100. `null` si moins de deux points, ou si les DEUX bornes sont synthétiques
 * (un 0 % figé n'est pas un marché plat — même règle que `seriesReturnPct`).
 */
export function variationFenetre(rows: MarketDataPoint[], cle: string, estSynthetique?: (date: string, cle: string) => boolean): number | null {
    let debut = -1;
    let fin = -1;
    rows.forEach((r, i) => {
        const v = Number(r[cle]);
        if (Number.isFinite(v) && v > 0) { if (debut < 0) debut = i; fin = i; }
    });
    if (debut < 0 || fin <= debut) return null;
    if (estSynthetique && estSynthetique(String(rows[debut].date), cle) && estSynthetique(String(rows[fin].date), cle)) return null;
    const a = Number(rows[debut][cle]);
    const b = Number(rows[fin][cle]);
    return ((b - a) / a) * 100;
}

export const PerformanceComparee: React.FC<Props> = ({ donnees, series, selection, onSelection, periode, onPeriode, estSynthetique, chargement, etroit, children }) => {
    const [titresOuverts, setTitresOuverts] = useState(false);
    const decor = useMemo(() => {
        let i = 0;
        return new Map(series.map((s) => {
            const t = TOTAUX[s.id];
            return [s.id, t ? { libelle: t.libelle, couleur: t.couleur, total: true, ordre: t.ordre } : { libelle: s.name, couleur: PALETTE_TITRES[i++ % PALETTE_TITRES.length], total: false, ordre: 99 }];
        }));
    }, [series]);
    const totaux = series.filter((s) => decor.get(s.id)?.total).sort((a, b) => (decor.get(a.id)!.ordre - decor.get(b.id)!.ordre));
    const titres = series.filter((s) => !decor.get(s.id)?.total);
    const lignes = useMemo(() => toPerformanceRows(donnees, new Set(series.map((s) => s.id))), [donnees, series]);
    const variations = useMemo(() => new Map(series.map((s) => [s.id, variationFenetre(donnees, s.id, estSynthetique)])), [donnees, series, estSynthetique]);
    const visibles = series.filter((s) => selection.has(s.id));
    const reperes = useMemo(() => {
        const r = reperesRonds(lignes.flatMap((l) => visibles.map((s) => l[s.id])).filter((v): v is number => typeof v === 'number'));
        return etroit && r ? r.filter((_, i) => i % 2 === 0) : r;
    }, [lignes, visibles, etroit]);
    const dates = useMemo(() => {
        const n = lignes.length;
        if (n === 0) return [];
        const nb = Math.min(n, etroit ? 3 : 5);
        return Array.from(new Set(Array.from({ length: nb }, (_, k) => String(lignes[Math.round((k * (n - 1)) / Math.max(1, nb - 1))].date))));
    }, [lignes, etroit]);
    const debut = donnees[0]?.date ? formatDate(jour(String(donnees[0].date)), { day: 'numeric', month: 'short', year: 'numeric' }) : null;

    const basculer = (id: string) => {
        const next = new Set(selection);
        if (next.has(id)) next.delete(id); else next.add(id);
        onSelection(next);
    };
    const etiquette = (s: SerieDisponible) => {
        const d = decor.get(s.id)!;
        const v = variations.get(s.id) ?? null;
        const actif = selection.has(s.id);
        return (
            <button
                key={s.id}
                type="button"
                onClick={() => basculer(s.id)}
                aria-pressed={actif}
                className={`h-9 px-3 rounded-full border flex items-center gap-2 text-[13px] transition-colors focus-ring ${actif ? 'border-white/12 bg-surfaceHighlight/60 text-ink-50' : 'border-white/6 text-ink-400'}`}
            >
                <span className="w-3 h-[3px] rounded-sm" style={{ background: d.couleur, opacity: actif ? 1 : 0.4 }} aria-hidden="true" />
                {d.libelle}
                <span className={`font-mono text-meta ${v === null ? 'text-ink-400' : v >= 0 ? 'text-success-400' : 'text-danger-400'}`}>{formatVariationPct(v)}</span>
            </button>
        );
    };
    const TickDate = (props: { x?: number; y?: number; payload?: { value: string }; index?: number; visibleTicksCount?: number }) => {
        const { x = 0, y = 0, payload, index = 0, visibleTicksCount = 1 } = props;
        return (
            <text x={x} y={y + 12} textAnchor={index === 0 ? 'start' : index === visibleTicksCount - 1 ? 'end' : 'middle'} fill="#8896a8" fontSize={etroit ? 10 : 11} fontFamily="JetBrains Mono">
                {payload ? formatDate(jour(payload.value), { month: 'short', year: '2-digit' }) : ''}
            </text>
        );
    };
    const colonnes: ChartDataColumn[] = [
        { key: 'date', label: 'Date', format: (v) => formatDate(jour(String(v))) },
        ...visibles.map((s) => ({ key: s.id, label: decor.get(s.id)!.libelle, format: (v: unknown) => formatVariationPct(v, 2) })),
    ];

    return (
        <section aria-labelledby="perf-comparee-titre" className="rounded-2xl bg-surface border border-white/6 p-4 sm:px-6 sm:py-5 flex flex-col gap-3.5 min-w-0">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                    <h2 id="perf-comparee-titre" className="text-[17px] lg:text-[18px] font-semibold text-ink-50">Performance comparée</h2>
                    <p className="text-meta lg:text-[13px] text-ink-400">
                        Variation en % {debut ? `depuis le ${debut} ` : ''}(base 100) · {etroit ? 'touche' : 'clique'} une étiquette pour masquer
                    </p>
                </div>
                <div role="group" aria-label="Période du graphe" className={etroit ? 'grid grid-cols-4 p-1 rounded-xl bg-dark border border-white/6' : 'flex gap-1 shrink-0'}>
                    {PERIODES.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => onPeriode(p.id)}
                            aria-pressed={periode === p.id}
                            className={`h-9 px-3 rounded-lg text-[13px] transition-colors focus-ring ${periode === p.id ? (etroit ? 'bg-ink-50 text-dark font-semibold' : 'bg-surfaceHighlight text-ink-50 font-semibold') : 'text-ink-300 hover:bg-white/5'}`}
                        >
                            {p.libelle}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ width: '100%', height: etroit ? 220 : 300 }}>
                {chargement ? (
                    <Skeleton variant="chart" className="h-full!" />
                ) : lignes.length > 1 ? (
                    <div role="img" aria-label="Variation en pourcentage du portefeuille et de chaque compte sur la période — détail chiffré dans le tableau de données." className="w-full h-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={lignes} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                                <XAxis dataKey="date" ticks={dates} interval={0} tick={<TickDate />} tickLine={false} axisLine={false} />
                                <YAxis /* AXE-NON-MONETAIRE : variation en %, jamais un montant */
                                    orientation={etroit ? 'left' : 'right'} mirror={etroit} ticks={reperes} domain={['dataMin', 'dataMax']}
                                    stroke="#8896a8" tick={{ fontSize: etroit ? 10 : 11, fontFamily: 'JetBrains Mono', dy: etroit ? -8 : 0 }}
                                    tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => formatVariationPct(v)}
                                />
                                <Tooltip
                                    contentStyle={CHART_TOOLTIP_STYLE}
                                    labelFormatter={(d) => formatDate(jour(String(d)))}
                                    formatter={(v: number, cle: string) => [formatVariationPct(v, 2), decor.get(cle)?.libelle ?? cle]}
                                />
                                {visibles.map((s) => {
                                    const d = decor.get(s.id)!;
                                    return <Line key={s.id} type="linear" dataKey={s.id} stroke={d.couleur} strokeWidth={s.id === 'TOTAL' ? 2.5 : 1.75} dot={false} connectNulls isAnimationActive={false} />;
                                })}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-body text-ink-400 rounded-xl bg-white/3">Aucune donnée disponible pour cette période.</div>
                )}
            </div>
            <ChartDataTable caption="Variation en % de chaque série affichée, par date" columns={colonnes} rows={lignes} />

            <div className="flex flex-wrap gap-2">
                {totaux.map(etiquette)}
                {titres.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setTitresOuverts((o) => !o)}
                        aria-expanded={titresOuverts}
                        className="h-9 px-3 rounded-full border border-dashed border-white/15 text-[13px] text-ink-300 hover:text-ink-50 focus-ring"
                    >
                        Titres ({titres.length}) {titresOuverts ? '−' : '+'}
                    </button>
                )}
            </div>
            {titresOuverts && titres.length > 0 && <div className="flex flex-wrap gap-2">{titres.map(etiquette)}</div>}
            {children}
        </section>
    );
};
