
import React, { useState } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush
} from 'recharts';
import { MarketDataPoint } from '../services/finance';

interface StockChartProps {
    data: MarketDataPoint[];
    visibleKeys: Set<string>;
    timeRange?: string;
    isPrivacyMode?: boolean; // NEW PROP
}

// Color palette for individual stocks
const COLORS = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#84cc16', '#06b6d4', '#6366f1'
];

export const StockChart: React.FC<StockChartProps> = ({ data, visibleKeys, isPrivacyMode = false }) => {
    const [mode, setMode] = useState<'PRICE' | 'PERFORMANCE'>('PRICE');

    // Transform data for Performance Mode (Base 100) if needed
    const chartData = React.useMemo(() => {
        if (data.length === 0) return [];

        if (mode === 'PRICE') return data;

        // Base values (first row of the *current sliced data*)
        // Only consider visible keys for base calc to avoid errors
        const baseValues: Record<string, number> = {};
        const firstRow = data[0];

        visibleKeys.forEach(k => {
            baseValues[k] = Number(firstRow[k]) || 0;
        });

        return data.map(row => {
            const newRow: any = { date: row.date };
            visibleKeys.forEach(k => {
                const val = Number(row[k]);
                const base = baseValues[k];
                if (base && base !== 0) {
                    // Calculate % change starting at 0
                    newRow[k] = ((val - base) / base) * 100;
                } else {
                    newRow[k] = 0;
                }
            });
            return newRow;
        });

    }, [data, mode, visibleKeys]);

    const activeSeries = Array.from(visibleKeys);

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex justify-end mb-2 gap-2 relative z-10">
                <div className="bg-black/40 rounded-lg p-0.5 border border-white/10 flex">
                    <button
                        onClick={() => setMode('PRICE')}
                        className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${mode === 'PRICE' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >
                        Prix ($)
                    </button>
                    <button
                        onClick={() => setMode('PERFORMANCE')}
                        className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${mode === 'PERFORMANCE' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >
                        Base 100 (%)
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            {activeSeries.map((key: string, idx: number) => (
                                <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={key.includes('TOTAL') ? '#10b981' : COLORS[idx % COLORS.length]} stopOpacity={0.4} />
                                    <stop offset="95%" stopColor={key.includes('TOTAL') ? '#10b981' : COLORS[idx % COLORS.length]} stopOpacity={0} />
                                </linearGradient>
                            ))}
                        </defs>

                        <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />

                        <XAxis
                            dataKey="date"
                            stroke="#666"
                            tick={{ fontSize: 10 }}
                            minTickGap={50}
                            tickFormatter={(str) => {
                                try {
                                    return new Date(str).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
                                } catch (e) { return str; }
                            }}
                        />

                        <YAxis
                            stroke="#666"
                            tick={{ fontSize: 10 }}
                            domain={['auto', 'auto']}
                            width={45}
                            tickFormatter={(val) => {
                                if (isPrivacyMode && mode === 'PRICE') return '***';
                                return mode === 'PERFORMANCE' ? `${val > 0 ? '+' : ''}${val.toFixed(0)}%` : `${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val.toFixed(0)}`
                            }}
                        />


                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(21, 25, 34, 0.8)',
                                backdropFilter: 'blur(12px)',
                                borderColor: 'rgba(255, 255, 255, 0.1)',
                                borderRadius: '12px',
                                fontSize: '12px',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                                color: '#fff',
                                padding: '12px',
                                border: '1px solid rgba(255, 255, 255, 0.08)'
                            }}
                            itemStyle={{ color: '#fff', paddingBottom: '2px', fontWeight: '500' }}
                            labelStyle={{ color: '#94a3b8', marginBottom: '8px', fontWeight: 'bold', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                            labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            formatter={(value: number, name: string) => {
                                if (isPrivacyMode && mode === 'PRICE') return ['*** $', name.replace(/.*:/, '')];
                                const cleanName = name.replace(/.*:/, '');
                                return [
                                    `${mode === 'PERFORMANCE' ? (value > 0 ? '+' : '') + value.toFixed(2) + '%' : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $'}`,
                                    cleanName
                                ];
                            }}
                            itemSorter={(item: any) => {
                                const name = item?.name as string | undefined;
                                if (name && name.includes('TOTAL')) return -1000000;
                                return -(item.value as number);
                            }}
                        />

                        {activeSeries.map((key, idx) => {
                            const isTotal = (key as string).includes('TOTAL');
                            const color = isTotal ? '#10b981' : COLORS[idx % COLORS.length];

                            return (
                                <Area
                                    key={key}
                                    type="monotone"
                                    dataKey={key}
                                    name={key}
                                    stroke={color}
                                    fill={`url(#grad-${key})`}
                                    strokeWidth={isTotal ? 3 : 1.5}
                                    fillOpacity={isTotal ? 0.1 : 0.6}
                                    isAnimationActive={false}
                                    connectNulls={true}
                                />
                            );
                        })}

                        <Brush dataKey="date" height={30} stroke="#8884d8" fill="#1a1a1a" tickFormatter={() => ''} travellerWidth={10} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
