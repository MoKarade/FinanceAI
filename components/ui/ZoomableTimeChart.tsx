import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE } from '../../utils/chartTooltip';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceDot } from 'recharts';
import { formatCompactCAD } from '../../utils/format';
import { useTimeChartZoom } from '../../hooks/useTimeChartZoom';
import { ChartDataTable, type ChartDataColumn } from './ChartDataTable';
import { MASKED_AMOUNT_LABEL } from '../../utils/privacyAria';
import { maskedTick } from '../../utils/chartPrivacy';

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
    /**
     * [FUTUR-AXE-Y-MINIMAL, FinanceAI#1144] Masque l'axe Y numérique (55 px récupérés pour le tracé)
     * et le remplace par un badge portant la valeur du DERNIER point visible. Fourni par l'appelant,
     * défaut `false` : les autres usages (StockChart, comparateur de titres) gardent leur axe.
     * Le badge n'existe qu'en mode empilé (le haut de la pile = la somme des séries) et seulement
     * si chaque série empilée a une valeur finie au dernier point — jamais un total partiel.
     */
    axeYMinimal?: boolean;
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
// [FORMAT-EXPLAINS-TOLOCALESTRING] Trois seuils composés à la main, remplacés par la source unique.
// ⚠️ Un seul changement de rendu, MESURÉ : les millions passent de UNE à DEUX décimales
// (« 2,3 M$ » → « 2,35 M$ »). C'est une étiquette d'AXE, donc un peu plus large ; le reste est
// identique au caractère près. À signaler à Marc plutôt qu'à exempter — une exemption sur l'axe du
// graphique principal serait le plus gros trou de la garde qui accompagne ce lot.
const defaultYFormatter = (val: number) => formatCompactCAD(val); // MONTANT-MASQUE-AILLEURS

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

/**
 * Total EMPILÉ du dernier point visible (haut de la pile d'aires = ce que le badge ancre). `null`
 * si la valeur n'est pas honnêtement calculable : aucune aire, une série absente/non finie au
 * dernier point (un trou n'est pas un 0 — le total serait partiel). Les séries `line` (ex. la
 * ligne « Total » superposée) ne s'empilent pas : exclues.
 */
export function totalEmpileDernierPoint(
    visibleData: ReadonlyArray<Record<string, unknown>>,
    series: ReadonlyArray<ZoomableSeries>,
): number | null {
    const last = visibleData[visibleData.length - 1];
    const aires = series.filter((s) => s.type !== 'line');
    if (!last || aires.length === 0) return null;
    let total = 0;
    for (const s of aires) {
        const v = last[s.key];
        if (typeof v !== 'number' || !Number.isFinite(v)) return null;
        total += v;
    }
    return total;
}

/**
 * Forme du badge « valeur du dernier point » (`ReferenceDot`, recharts y injecte `cx`/`cy`).
 * Le dernier point colle au bord droit du graphe : la pastille se pose à sa GAUCHE (contrairement
 * à `TodayValueBadge`, ancrée à droite d'un point central) et reste dans la zone visible.
 */
export const BadgeValeurFinale = (props: { cx?: number; cy?: number; value?: string }) => {
    const { cx, cy, value } = props;
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !value) return null;
    const h = 22;
    const w = Math.round(value.length * 12 * 0.58 + 20);
    const x = Math.max(2, (cx as number) - w - 8);
    const y = Math.max(2, (cy as number) - h - 8);
    return (
        <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
            <circle cx={cx} cy={cy} r={4} fill="#ffffff" stroke="#0B0E14" strokeWidth={1.5} />
            <rect x={x} y={y} width={w} height={h} rx={11} fill="#0B0E14" fillOpacity={0.92} stroke="#ffffff" strokeOpacity={0.55} />
            <text x={x + w / 2} y={y + h / 2 + 0.5} textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize={12} fontWeight="bold">{value}</text>
        </g>
    );
};

export const ZoomableTimeChart: React.FC<ZoomableTimeChartProps> = ({
    data,
    xKey,
    series,
    height = 450,
    privacyMode = false,
    stacked = true,
    yFormatter = defaultYFormatter,
    showControls = true,
    axeYMinimal = false,
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

    // [FUTUR-AXE-Y-MINIMAL] Valeur du badge : calculée seulement quand l'axe est masqué ET empilé,
    // formatée comme l'axe (`yFormatter`) et masquée en mode discret (`maskedTick`, source du « *** »).
    const badgeFinal = useMemo(() => {
        if (!axeYMinimal || !stacked || visibleData.length === 0) return null;
        const total = totalEmpileDernierPoint(visibleData, series);
        if (total === null) return null;
        return {
            x: visibleData[visibleData.length - 1][xKey] as string | number,
            y: total,
            texte: maskedTick(privacyMode, yFormatter)(total),
        };
    }, [axeYMinimal, stacked, visibleData, series, xKey, privacyMode, yFormatter]);

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
                    {axeYMinimal ? (
                        // Axe masqué (domaine identique) : le tracé récupère la gouttière de 55 px.
                        <YAxis hide domain={['auto', 'auto']} />
                    ) : (
                        <YAxis
                            stroke="#555"
                            tick={{ fontSize: 10 }}
                            width={55}
                            domain={['auto', 'auto']}
                            tickFormatter={(val) => privacyMode ? '***' : yFormatter(val)}
                        />
                    )}
                    <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                        formatter={(val, name) => [tooltipValue(typeof val === 'number' ? val : null, privacyMode, yFormatter), String(name)]}
                        // recharts 3.10 type le libellé en ReactNode (avant : any). L'axe X porte une date
                        // (chaîne ISO ou horodatage) : on ne formate que ces deux cas, le reste passe tel quel
                        // au lieu d'afficher « Invalid Date ».
                        labelFormatter={(label) =>
                            typeof label === 'string' || typeof label === 'number'
                                ? new Date(label).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' })
                                : label}
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
                    {badgeFinal && (
                        <ReferenceDot
                            x={badgeFinal.x}
                            y={badgeFinal.y}
                            r={0}
                            ifOverflow="extendDomain"
                            shape={<BadgeValeurFinale value={badgeFinal.texte} />}
                        />
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
                <div className="absolute bottom-2 right-2 text-tiny text-ink-400 pointer-events-none bg-black/30 px-1.5 py-0.5 rounded-sm">
                    Molette ou pincement = zoom · double-clic = reset
                </div>
            )}
        </div>
        <ChartDataTable caption="Graphique d'évolution dans le temps" columns={dataColumns} rows={data} />
        </>
    );
};
