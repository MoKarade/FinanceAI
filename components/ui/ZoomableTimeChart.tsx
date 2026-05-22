import React, { useMemo } from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatCAD } from '../../utils/format';
import { useTimeChartZoom } from '../../hooks/useTimeChartZoom';

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
}

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
    const { containerRef, visibleData, isZoomed, isPanning, handlers, reset } = useTimeChartZoom(data);

    const spanDays = useMemo(() => {
        if (visibleData.length < 2) return 0;
        const first = new Date(visibleData[0][xKey] as string).getTime();
        const last = new Date(visibleData[visibleData.length - 1][xKey] as string).getTime();
        return (last - first) / (1000 * 60 * 60 * 24);
    }, [visibleData, xKey]);

    return (
        <div
            ref={containerRef}
            className={`relative w-full h-full select-none ${isZoomed && isPanning ? 'cursor-grabbing' : (isZoomed ? 'cursor-grab' : 'cursor-default')}`}
            {...handlers}
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
                    onClick={reset}
                    className="absolute top-2 right-2 px-2 py-1 text-tiny bg-white/10 hover:bg-white/20 border border-white/15 rounded-card text-ink-200 font-medium transition-colors focus-ring"
                    title="Réinitialiser la vue (double-clic aussi)"
                >
                    ↺ Vue complète
                </button>
            )}
            {!isZoomed && data.length > 1 && (
                <div className="absolute bottom-2 right-2 text-tiny text-ink-600 pointer-events-none bg-black/30 px-1.5 py-0.5 rounded">
                    Molette = zoom · double-clic = reset
                </div>
            )}
        </div>
    );
};
