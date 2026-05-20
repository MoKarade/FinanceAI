import React, { useState, useRef, useMemo, useCallback } from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatCAD } from '../../utils/format';

/**
 * Phase D.2 — graphique temporel avec zoom molette + pan-on-drag.
 *
 * Remplace les `<Brush>` Recharts (slide bar) par une interaction directe :
 *   - **Molette** : zoom in/out centré sur la position du curseur
 *   - **Drag** : pan latéral (gauche/droite) en gardant l'échelle de zoom
 *   - **Double-clic** : reset à la vue complète
 *
 * Multi-échelle : le `tickFormatter` adapte la précision selon le span visible
 * (heure, jour, mois, année). Réutilisable pour Investments stocks (Phase E.5)
 * et autres graphiques temporels.
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
}

type Pan = { startX: number; startStart: number; startEnd: number } | null;

const MIN_ZOOM_POINTS = 5; // empêche de zoomer trop fin

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

const defaultYFormatter = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1_000_000) return `${(val / 1_000_000).toFixed(1)} M$`;
    if (abs >= 1_000) return `${(val / 1_000).toFixed(0)} k$`;
    return formatCAD(val);
};

export const ZoomableTimeChart: React.FC<ZoomableTimeChartProps> = ({
    data,
    xKey,
    series,
    height = 450,
    privacyMode = false,
    stacked = true,
    yFormatter = defaultYFormatter,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [range, setRange] = useState<[number, number] | null>(null); // null = vue complète
    const [pan, setPan] = useState<Pan>(null);

    const dataLength = data.length;
    const [startIdx, endIdx] = range ?? [0, Math.max(0, dataLength - 1)];

    const visibleData = useMemo(() => {
        if (!range) return data;
        return data.slice(startIdx, endIdx + 1);
    }, [data, range, startIdx, endIdx]);

    const spanDays = useMemo(() => {
        if (visibleData.length < 2) return 0;
        const first = new Date(visibleData[0][xKey] as string).getTime();
        const last = new Date(visibleData[visibleData.length - 1][xKey] as string).getTime();
        return (last - first) / (1000 * 60 * 60 * 24);
    }, [visibleData, xKey]);

    const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (dataLength < 2) return;

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        // Position relative du curseur dans le chart (0 = gauche, 1 = droite)
        const cursorRel = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

        const currentStart = range?.[0] ?? 0;
        const currentEnd = range?.[1] ?? dataLength - 1;
        const currentSpan = currentEnd - currentStart;
        const cursorIdx = currentStart + cursorRel * currentSpan;

        // Zoom factor : 0.85x (zoom in) ou 1.15x (zoom out)
        const factor = e.deltaY < 0 ? 0.85 : 1.15;
        const newSpan = Math.max(MIN_ZOOM_POINTS, Math.min(dataLength - 1, currentSpan * factor));

        // Garder le cursor au même point du chart
        const newStart = Math.max(0, cursorIdx - cursorRel * newSpan);
        const newEnd = Math.min(dataLength - 1, newStart + newSpan);
        const adjustedStart = Math.max(0, newEnd - newSpan);

        // Si on revient à la vue complète, reset
        if (adjustedStart <= 0 && newEnd >= dataLength - 1) {
            setRange(null);
        } else {
            setRange([Math.round(adjustedStart), Math.round(newEnd)]);
        }
    }, [dataLength, range]);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (dataLength < 2 || !range) return; // pan désactivé en vue complète
        setPan({ startX: e.clientX, startStart: range[0], startEnd: range[1] });
    }, [dataLength, range]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!pan || !range) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const deltaPx = e.clientX - pan.startX;
        const deltaIdx = -(deltaPx / rect.width) * (pan.startEnd - pan.startStart);
        const newStart = Math.max(0, Math.min(dataLength - 1, pan.startStart + deltaIdx));
        const span = pan.startEnd - pan.startStart;
        const newEnd = Math.min(dataLength - 1, newStart + span);
        const adjustedStart = Math.max(0, newEnd - span);
        setRange([Math.round(adjustedStart), Math.round(newEnd)]);
    }, [pan, range, dataLength]);

    const handleMouseUp = useCallback(() => setPan(null), []);

    const handleDoubleClick = useCallback(() => setRange(null), []);

    const isZoomed = range !== null;

    return (
        <div
            ref={containerRef}
            className={`relative w-full h-full select-none ${isZoomed && pan ? 'cursor-grabbing' : (isZoomed ? 'cursor-grab' : 'cursor-default')}`}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            style={{ height }}
            role="img"
            aria-label="Graphique temporel — molette pour zoomer, glisser pour déplacer, double-clic pour réinitialiser"
        >
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
                        contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', fontSize: '12px' }}
                        itemStyle={{ color: '#fff' }}
                        formatter={(val: number, name: string) => [privacyMode ? '*** $' : formatCAD(val || 0), name]}
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

            {/* Hint visuel + bouton reset */}
            {isZoomed && (
                <button
                    type="button"
                    onClick={() => setRange(null)}
                    className="absolute top-2 right-2 px-2 py-1 text-tiny bg-white/10 hover:bg-white/20 border border-white/15 rounded-card text-ink-200 font-medium transition-colors focus-ring"
                    title="Réinitialiser la vue (double-clic aussi)"
                >
                    ↺ Vue complète
                </button>
            )}
            {!isZoomed && dataLength > 1 && (
                <div className="absolute bottom-2 right-2 text-tiny text-ink-600 pointer-events-none bg-black/30 px-1.5 py-0.5 rounded">
                    Molette = zoom · double-clic = reset
                </div>
            )}
        </div>
    );
};
