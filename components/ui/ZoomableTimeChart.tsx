import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE } from '../../utils/chartTooltip';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatCAD } from '../../utils/format';
import { useTimeChartZoom } from '../../hooks/useTimeChartZoom';
import { ChartDataTable, type ChartDataColumn } from './ChartDataTable';
import { MASKED_AMOUNT_LABEL } from '../../utils/privacyAria';

/**
 * Phase D.2 — graphique temporel avec zoom molette + pan-on-drag.
 *
 * L'interaction (molette / pan / reset) vit désormais dans le hook réutilisable
 * `useTimeChartZoom` (cf. G4), partagé avec le graphique Futur. Ce composant ne
 * garde que le rendu Recharts générique (aires empilées ou lignes overlay).
 *
 *   - **Molette** : zoom in/out centré sur la position du curseur
 *   - **Drag** : pan latéral (gauche/droite) en gardant l'échelle de zoom
 *   - **Double-clic** : reset à la vue complète
 *
 * Multi-échelle : le `tickFormatter` adapte la précision selon le span visible
 * (heure, jour, mois, année).
 */

export interface ZoomableSeries {
    key: string;
    color: string;
    name?: string;
    stackId?: string;
    /** Type de rendu : 'area' (stacked par défaut) ou 'line' (overlay non empilé) */
    type?: 'area' | 'line';
    /** Épaisseur de la ligne pour type='line' (défaut 2) */
    strokeWidth?: number;
}

interface ZoomableTimeChartProps {
    data: Array<Record<string, unknown>>;
    /** Clé du timestamp (string ISO ou Date) */
    xKey: string;
    series: ZoomableSeries[];
    /** Hauteur du chart (défaut 450, parent doit avoir une hauteur définie pour ResponsiveContainer) */
    height?: number | string;
    /** Mode privacy : masque les valeurs Y et tooltip */
    privacyMode?: boolean;
    /** Stacked area chart (défaut true) */
    stacked?: boolean;
    /** Formatteur custom pour les valeurs Y (par défaut : compact k$/M$) */
    yFormatter?: (val: number) => string;
    /** Affiche la barre de contrôles (périodes + plein écran). Défaut true. */
    showControls?: boolean;
}

// Présélections de période (lookback depuis la dernière date). On n'affiche que
// celles plus courtes que l'étendue réelle des données (sinon le bouton ne zoome pas).
const PERIOD_PRESETS: ReadonlyArray<{ label: string; days: number }> = [
    { label: '1M', days: 30 },
    { label: '3M', days: 91 },
    { label: '6M', days: 182 },
    { label: '1A', days: 365 },
    { label: '5A', days: 365 * 5 },
];

function formatTick(timestamp: string | number, spanDays: number): string {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    if (spanDays < 2) {
        return d.toLocaleString('fr-CA', { hour: '2-digit', minute: '2-digit' });
    }
    if (spanDays < 90) {
        return d.toLocaleDateString('fr-CA', { month: 'short', day: 'numeric' });
    }
    if (spanDays < 365 * 2) {
        return d.toLocaleDateString('fr-CA', { month: 'short', year: '2-digit' });
    }
    return d.toLocaleDateString('fr-CA', { year: 'numeric' });
}

// MONTANT-MASQUE-AILLEURS — formateur par DÉFAUT, jamais appelé directement : les trois points de
// rendu de ce fichier (tickFormatter, infobulle, table sr-only) le passent tous par
// `privacyMode ? MASKED_AMOUNT_LABEL : yFormatter(val)`.
const defaultYFormatter = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1_000_000) return `${(val / 1_000_000).toFixed(1)} M$`;
    if (abs >= 1_000) return `${(val / 1_000).toFixed(0)} k$`;
    return formatCAD(val); // MONTANT-MASQUE-AILLEURS
};

/**
 * Valeur du TOOLTIP (exporté pour test — findings panel #495) :
 *  - un point `null` (trou HONNÊTE d'une série éparse, ex. titre pas encore acheté en Base 100)
 *    rend « — », jamais un 0 fabriqué (`val || 0` affichait « +0,00 % » sur l'absence de donnée) ;
 *  - la valeur passe par `yFormatter` (avant : `formatCAD` EN DUR → « 10 $ » affiché en mode
 *    Base 100 au lieu de « +10 % » — devenu visible partout avec l'auto-défaut Base 100).
 */
export function tooltipValue(
    val: number | null | undefined,
    privacyMode: boolean,
    yFormatter: (v: number) => string,
): string {
    if (val == null || !Number.isFinite(val)) return '—';
    return privacyMode ? MASKED_AMOUNT_LABEL : yFormatter(val);
}

export const ZoomableTimeChart: React.FC<ZoomableTimeChartProps> = ({
    data,
    xKey,
    series,
    height = 450,
    privacyMode = false,
    stacked = true,
    yFormatter = defaultYFormatter,
    showControls = true,
}) => {
    const { containerRef, containerEl, visibleData, isZoomed, isPanning, handlers, reset, showRange } = useTimeChartZoom(data);

    const spanDays = useMemo(() => {
        if (visibleData.length < 2) return 0;
        const first = new Date(visibleData[0][xKey] as string).getTime();
        const last = new Date(visibleData[visibleData.length - 1][xKey] as string).getTime();
        return (last - first) / (1000 * 60 * 60 * 24);
    }, [visibleData, xKey]);

    // Étendue totale des données (pour ne proposer que les périodes pertinentes).
    const totalSpanDays = useMemo(() => {
        if (data.length < 2) return 0;
        const first = new Date(data[0][xKey] as string).getTime();
        const last = new Date(data[data.length - 1][xKey] as string).getTime();
        return (last - first) / (1000 * 60 * 60 * 24);
    }, [data, xKey]);

    const availablePeriods = useMemo(
        () => PERIOD_PRESETS.filter((p) => p.days < totalSpanDays),
        [totalSpanDays],
    );

    // Affiche les `days` derniers jours : 1er indice dont la date >= (dernière date − days).
    const showPeriod = useCallback((days: number) => {
        if (data.length < 2) return;
        const lastTs = new Date(data[data.length - 1][xKey] as string).getTime();
        const fromTs = lastTs - days * 86_400_000;
        let fromIdx = data.findIndex((d) => new Date(d[xKey] as string).getTime() >= fromTs);
        if (fromIdx < 0) fromIdx = 0;
        showRange(fromIdx, data.length - 1);
    }, [data, xKey, showRange]);

    // Plein écran natif sur le conteneur du graphe (Fullscreen API).
    const [isFullscreen, setIsFullscreen] = useState(false);
    useEffect(() => {
        const onFsChange = () => setIsFullscreen(document.fullscreenElement === containerEl.current);
        document.addEventListener('fullscreenchange', onFsChange);
        return () => document.removeEventListener('fullscreenchange', onFsChange);
    }, [containerEl]);
    const toggleFullscreen = useCallback(() => {
        const el = containerEl.current;
        if (!el) return;
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        else el.requestFullscreen?.().catch(() => {});
    }, [containerEl]);

    // [A11Y-CHARTS] colonnes de la table de données sr-only (alternative texte au graphe Recharts,
    // opaque aux lecteurs d'écran). Le mode privé masque les valeurs (parité avec l'axe/tooltip).
    const dataColumns = useMemo<ChartDataColumn[]>(() => [
        { key: xKey, label: 'Date', format: (v) => { const d = new Date(v as string); return isNaN(d.getTime()) ? String(v ?? '') : d.toLocaleDateString('fr-CA'); } },
        ...series.map((s) => ({
            key: s.key,
            label: s.name ?? s.key,
            format: (v: unknown) => privacyMode ? MASKED_AMOUNT_LABEL : yFormatter(Number(v) || 0),
        })),
    ], [xKey, series, privacyMode, yFormatter]);

    return (
        <>
        <div
            ref={containerRef}
            className={`relative w-full h-full select-none ${isZoomed && isPanning ? 'cursor-grabbing' : (isZoomed ? 'cursor-grab' : 'cursor-default')} ${isFullscreen ? 'bg-surface p-4' : ''}`}
            {...handlers}
            style={{ height: isFullscreen ? '100vh' : height }}
            role="img"
            aria-label="Graphique temporel — molette ou pincement pour zoomer, glisser pour déplacer, double-clic pour réinitialiser"
        >
            {/* Barre de contrôles : périodes (gauche) + plein écran (droite). */}
            {showControls && (
                <div className="absolute top-2 left-2 z-10 flex items-center gap-1 flex-wrap">
                    {availablePeriods.map((p) => (
                        <button
                            key={p.label}
                            type="button"
                            onClick={() => showPeriod(p.days)}
                            className="px-2 py-0.5 text-tiny font-bold rounded-card bg-white/10 hover:bg-white/20 border border-white/15 text-ink-200 transition-colors focus-ring"
                            title={`Afficher les ${p.label} derniers`}
                        >
                            {p.label}
                        </button>
                    ))}
                    {availablePeriods.length > 0 && (
                        <button
                            type="button"
                            onClick={reset}
                            className={`px-2 py-0.5 text-tiny font-bold rounded-card border transition-colors focus-ring ${isZoomed ? 'bg-white/10 hover:bg-white/20 border-white/15 text-ink-200' : 'bg-indigo-500/25 border-indigo-400/40 text-white'}`}
                            title="Vue complète"
                        >
                            Tout
                        </button>
                    )}
                </div>
            )}
            {showControls && (
                <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="absolute top-2 right-2 z-10 px-2 py-0.5 text-tiny font-bold rounded-card bg-white/10 hover:bg-white/20 border border-white/15 text-ink-200 transition-colors focus-ring"
                    title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
                    aria-label={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
                >
                    {isFullscreen ? 'Réduire' : 'Plein écran'}
                </button>
            )}
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={visibleData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        {series.map((s, idx) => (
                            <linearGradient key={s.key} id={`ztc-grad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={s.color} stopOpacity={0.8} />
                                <stop offset="95%" stopColor={s.color} stopOpacity={0.1} />
                            </linearGradient>
                        ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                    <XAxis
                        dataKey={xKey}
                        stroke="#555"
                        tick={{ fontSize: 10 }}
                        minTickGap={40}
                        tickFormatter={(str) => formatTick(str, spanDays)}
                    />
                    <YAxis
                        stroke="#555"
                        tick={{ fontSize: 10 }}
                        width={55}
                        domain={['auto', 'auto']}
                        tickFormatter={(val) => privacyMode ? '***' : yFormatter(val)}
                    />
                    <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                        formatter={(val, name) => [tooltipValue(typeof val === 'number' ? val : null, privacyMode, yFormatter), String(name)]}
                        labelFormatter={(label) => new Date(label).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
                    />
                    <Legend verticalAlign="top" iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                    {series.map((s, idx) =>
                        s.type === 'line' ? (
                            <Line
                                key={s.key}
                                type="monotone"
                                dataKey={s.key}
                                stroke={s.color}
                                strokeWidth={s.strokeWidth ?? 2}
                                dot={false}
                                name={s.name ?? s.key}
                                isAnimationActive={false}
                            />
                        ) : (
                            <Area
                                key={s.key}
                                type="monotone"
                                dataKey={s.key}
                                stackId={stacked ? (s.stackId ?? '1') : undefined}
                                stroke={s.color}
                                fill={`url(#ztc-grad-${idx})`}
                                name={s.name ?? s.key}
                                isAnimationActive={false}
                            />
                        ),
                    )}
                </ComposedChart>
            </ResponsiveContainer>

            {/* Reset autonome quand la barre de contrôles est masquée (sinon « Tout » l'assure). */}
            {isZoomed && !showControls && (
                <button
                    type="button"
                    onClick={reset}
                    className="absolute top-2 right-2 px-2 py-1 text-tiny bg-white/10 hover:bg-white/20 border border-white/15 rounded-card text-ink-200 font-medium transition-colors focus-ring"
                    title="Réinitialiser la vue (double-clic aussi)"
                >
                    ↺ Vue complète
                </button>
            )}
            {!isZoomed && data.length > 1 && (
                <div className="absolute bottom-2 right-2 text-tiny text-ink-400 pointer-events-none bg-black/30 px-1.5 py-0.5 rounded">
                    Molette ou pincement = zoom · double-clic = reset
                </div>
            )}
        </div>
        <ChartDataTable caption="Graphique d'évolution dans le temps" columns={dataColumns} rows={data} />
        </>
    );
};
