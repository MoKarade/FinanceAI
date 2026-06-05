// Phase E.5 — StockChart refactorisé pour utiliser ZoomableTimeChart
// (zoom molette + pan + multi-échelle), tout en gardant son toggle propre
// PRICE / PERFORMANCE base 100 spécifique aux actions.
import React, { useState, useMemo } from 'react';
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
    '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#84cc16', '#06b6d4', '#6366f1',
];

export const StockChart: React.FC<StockChartProps> = ({ data, visibleKeys, isPrivacyMode = false }) => {
    const [mode, setMode] = useState<'PRICE' | 'PERFORMANCE'>('PRICE');

    // Mode PERFORMANCE : transforme en base 100 (% depuis le premier point)
    const chartData = useMemo(() => {
        if (data.length === 0) return [];
        if (mode === 'PRICE') return data;

        const baseValues: Record<string, number> = {};
        const firstRow = data[0];
        visibleKeys.forEach(k => { baseValues[k] = Number(firstRow[k]) || 0; });

        return data.map(row => {
            const newRow: Record<string, unknown> = { date: row.date };
            visibleKeys.forEach(k => {
                const val = Number(row[k]);
                const base = baseValues[k];
                if (base && base !== 0) {
                    newRow[k] = ((val - base) / base) * 100;
                } else {
                    newRow[k] = 0;
                }
            });
            return newRow;
        });
    }, [data, mode, visibleKeys]);

    const activeSeries = Array.from(visibleKeys);
    const series: ZoomableSeries[] = activeSeries.map((key, idx) => {
        const isTotal = key.includes('TOTAL');
        return {
            key,
            color: isTotal ? '#10b981' : COLORS[idx % COLORS.length],
            name: key.replace(/.*:/, ''), // strip NASDAQ:/NYSE: prefix
            type: 'line', // overlay non-stacké pour comparaison
            strokeWidth: isTotal ? 3 : 2,
        };
    });

    const performanceFormatter = (val: number) => {
        if (mode === 'PERFORMANCE') return `${formatSigned(val, { decimals: 2 })}%`;
        return formatCAD(val);
    };

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex justify-end mb-2 gap-2 relative z-10 shrink-0">
                <div className="bg-black/40 rounded-lg p-0.5 border border-white/10 flex">
                    <button
                        type="button"
                        onClick={() => setMode('PRICE')}
                        className={`px-3 py-1 text-tiny font-bold rounded transition-colors ${mode === 'PRICE' ? 'bg-info-600 text-white shadow' : 'text-ink-300 hover:text-white'}`}
                    >
                        Prix ($)
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('PERFORMANCE')}
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
