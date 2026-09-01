// Phase E.5 — StockChart refactorisé pour utiliser ZoomableTimeChart
// (zoom molette + pan + multi-échelle), tout en gardant son toggle propre
// PRICE / PERFORMANCE base 100 spécifique aux actions.
//
// [INVEST-CURVES-LOW] 2026-07-23 (demande Marc « la courbe est mal visible ») :
//  - AUTO-DÉFAUT Base 100 quand ≥ 2 séries d'échelles très disparates (> 20×) sont visibles — sur
//    une échelle Prix ($) commune, un titre à 30 $ à côté d'un TOTAL à 240 k$ est un trait plat
//    invisible. Le choix MANUEL de l'utilisateur (clic sur un des deux boutons) prime toujours et
//    coupe l'auto pour la session du composant.
//  - Base 100 sur lignes ÉPARSES : la base de CHAQUE série = son PREMIER point FINI ≠ 0 (avant :
//    ligne 0 → un titre acheté plus tard avait base 0 → courbe FIGÉE À ZÉRO, invisible) ; un point
//    manquant rend null (trou honnête), jamais un 0 fabriqué.
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MarketDataPoint } from '../services/finance';
import { ZoomableTimeChart, type ZoomableSeries } from './ui/ZoomableTimeChart';
import { formatCAD, formatSigned } from '../utils/format';

interface StockChartProps {
    data: MarketDataPoint[];
    visibleKeys: Set<string>;
    timeRange?: string;
    isPrivacyMode?: boolean;
}

// Palette pour les actions individuelles
const COLORS = [
    '#5b82bf', '#8a7cc0', '#bd7d9c', '#f97316', '#b8a45e', '#8ba85a', '#5093a8', '#6f72c4',
];

/** Ratio de disparité au-delà duquel l'échelle Prix ($) commune rend les petites séries illisibles. */
const DISPARITY_RATIO = 20;

/**
 * Les séries visibles sont-elles trop DISPARATES pour une échelle $ commune ? (exporté pour test)
 * Comparaison sur la DERNIÈRE valeur finie de chaque série (l'ordre de grandeur actuel).
 */
export function seriesScaleDisparity(data: MarketDataPoint[], visibleKeys: Set<string>): boolean {
    if (visibleKeys.size < 2 || data.length === 0) return false;
    const lasts: number[] = [];
    for (const k of visibleKeys) {
        for (let i = data.length - 1; i >= 0; i--) {
            const v = Number(data[i][k]);
            if (Number.isFinite(v) && v > 0) { lasts.push(v); break; }
        }
    }
    if (lasts.length < 2) return false;
    return Math.max(...lasts) / Math.min(...lasts) > DISPARITY_RATIO;
}

/**
 * Transformation Base 100 sur lignes ÉPARSES (exporté pour test) : base de CHAQUE série = son
 * PREMIER point fini > 0 ; un point absent/non fini rend null (trou honnête, jamais 0).
 */
export function toPerformanceRows(data: MarketDataPoint[], visibleKeys: Set<string>): Array<Record<string, unknown>> {
    const baseValues: Record<string, number> = {};
    for (const k of visibleKeys) {
        for (const row of data) {
            const v = Number(row[k]);
            if (Number.isFinite(v) && v > 0) { baseValues[k] = v; break; }
        }
    }
    return data.map(row => {
        const newRow: Record<string, unknown> = { date: row.date };
        visibleKeys.forEach(k => {
            const val = Number(row[k]);
            const base = baseValues[k];
            newRow[k] = base && Number.isFinite(val) ? ((val - base) / base) * 100 : null;
        });
        return newRow;
    });
}

export const StockChart: React.FC<StockChartProps> = ({ data, visibleKeys, isPrivacyMode = false }) => {
    // Init PARESSEUX (finding panel #495) : démarrer directement dans le bon mode — un init 'PRICE'
    // corrigé par effet après le 1er paint flashait une frame de courbes plates $ (le cas même
    // que la feature corrige).
    const [mode, setMode] = useState<'PRICE' | 'PERFORMANCE'>(
        () => (seriesScaleDisparity(data, visibleKeys) ? 'PERFORMANCE' : 'PRICE'));
    // L'utilisateur a-t-il CHOISI le mode ? (clic bouton) — l'auto-défaut ne s'applique qu'avant.
    const userChoseRef = useRef(false);

    // [INVEST-CURVES-LOW] Auto-défaut Base 100 en multi-séries disparates (même convention que les
    // comparateurs type Google Finance : les comparaisons se lisent en %). Réévalué quand la
    // sélection/les données changent, tant que l'utilisateur n'a pas cliqué le toggle.
    useEffect(() => {
        if (userChoseRef.current) return;
        setMode(seriesScaleDisparity(data, visibleKeys) ? 'PERFORMANCE' : 'PRICE');
    }, [data, visibleKeys]);

    const chooseMode = (m: 'PRICE' | 'PERFORMANCE') => {
        userChoseRef.current = true;
        setMode(m);
    };

    // Mode PERFORMANCE : transforme en base 100 (% depuis le premier point FINI de chaque série)
    const chartData = useMemo(() => {
        if (data.length === 0) return [];
        if (mode === 'PRICE') return data;
        return toPerformanceRows(data, visibleKeys);
    }, [data, mode, visibleKeys]);

    const activeSeries = Array.from(visibleKeys);
    const series: ZoomableSeries[] = activeSeries.map((key, idx) => {
        const isTotal = key.includes('TOTAL');
        return {
            key,
            color: isTotal ? '#4f9d86' : COLORS[idx % COLORS.length],
            name: key.replace(/.*:/, ''), // strip NASDAQ:/NYSE: prefix
            type: 'line', // overlay non-stacké pour comparaison
            strokeWidth: isTotal ? 3 : 2,
        };
    });

    // MONTANT-MASQUE-AILLEURS — ce formateur ne rend rien lui-même : il est passé à
    // `ZoomableTimeChart`, qui l'enveloppe dans `privacyMode ? MASKED_AMOUNT_LABEL : yFormatter(v)`
    // pour l'axe, l'infobulle ET la table sr-only. Le masquage est décidé par l'appelant
    // (`privacyMode={isPrivacyMode && mode === 'PRICE'}`, quelques lignes plus bas).
    const performanceFormatter = (val: number) => {
        if (mode === 'PERFORMANCE') return `${formatSigned(val, { decimals: 2 })}%`;
        return formatCAD(val); // MONTANT-MASQUE-AILLEURS
    };

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex justify-end mb-2 gap-2 relative z-10 shrink-0">
                {/* [Finding a11y #495] aria-pressed (état exposé aux SR — convention aria-pressed
                    des toggles d'Investments) + zone live : depuis l'auto-défaut, le mode peut
                    changer SANS geste (axe $ → %) — un SR doit en être informé (WCAG 4.1.3). */}
                <span className="sr-only" aria-live="polite">
                    Mode d'affichage du graphique : {mode === 'PRICE' ? 'prix en dollars' : 'base 100, pourcentage'}
                </span>
                <div className="bg-black/40 rounded-lg p-0.5 border border-white/10 flex">
                    <button
                        type="button"
                        aria-pressed={mode === 'PRICE'}
                        onClick={() => chooseMode('PRICE')}
                        className={`px-3 py-1 text-tiny font-bold rounded transition-colors ${mode === 'PRICE' ? 'bg-info-600 text-white shadow' : 'text-ink-300 hover:text-white'}`}
                    >
                        Prix ($)
                    </button>
                    <button
                        type="button"
                        aria-pressed={mode === 'PERFORMANCE'}
                        onClick={() => chooseMode('PERFORMANCE')}
                        className={`px-3 py-1 text-tiny font-bold rounded transition-colors ${mode === 'PERFORMANCE' ? 'bg-purple-600 text-white shadow' : 'text-ink-300 hover:text-white'}`}
                    >
                        Base 100 (%)
                    </button>
                </div>
            </div>
            <div className="flex-1 min-h-0">
                <ZoomableTimeChart
                    data={chartData}
                    xKey="date"
                    series={series}
                    privacyMode={isPrivacyMode && mode === 'PRICE'}
                    stacked={false}
                    yFormatter={performanceFormatter}
                />
            </div>
        </div>
    );
};
