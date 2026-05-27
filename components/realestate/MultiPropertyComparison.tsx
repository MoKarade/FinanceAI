import React from 'react';
import { Card } from '../ui/Card';
import { RealEstateGoal } from '../../types';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useTimeChartZoom } from '../../hooks/useTimeChartZoom';
import { ZoomContainer } from '../ui/ZoomContainer';

const PROP_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4'];

interface MultiPropertyComparisonProps {
    goals: RealEstateGoal[];
}

export const MultiPropertyComparison: React.FC<MultiPropertyComparisonProps> = ({ goals }) => {
    const allSeries = goals.map((goal, gi) => {
        const p = goal.price || 450000;
        const dp = goal.downPayment || (p * 0.2);
        const r = (goal.mortgageRate || 4.5) / 100 / 12;
        const amort = goal.amortization || 25;
        const mort = p - dp;
        const renewR = (goal.renewalRateProjection || 5.0) / 100 / 12;
        const growth = (goal.propertyGrowthRate || 3.0) / 100;
        const numPmt = amort * 12;
        let monthlyPmt = r > 0
            ? (r * mort * Math.pow(1 + r, numPmt)) / (Math.pow(1 + r, numPmt) - 1)
            : mort / numPmt;
        let balance = mort;
        let propVal = p + (goal.initialRenovations || 0);
        let currentR = r;

        const points: { year: number; equity: number }[] = [];
        for (let year = 1; year <= amort; year++) {
            if (year > 1 && (year - 1) % 5 === 0) {
                currentR = renewR;
                const rem = (amort - year + 1) * 12;
                if (currentR > 0)
                    monthlyPmt = (currentR * balance * Math.pow(1 + currentR, rem)) / (Math.pow(1 + currentR, rem) - 1);
            }
            for (let m = 0; m < 12; m++) {
                if (balance <= 0) break;
                const interest = balance * currentR;
                balance -= (monthlyPmt - interest);
            }
            propVal *= (1 + growth);
            points.push({ year, equity: Math.max(0, Math.round(propVal - Math.max(0, balance))) });
        }
        return { name: goal.name || `Prop. ${gi + 1}`, points, color: PROP_COLORS[gi % PROP_COLORS.length] };
    });

    const maxLen = allSeries.length > 0 ? Math.max(...allSeries.map(s => s.points.length)) : 0;
    const chartData: Record<string, number | string>[] = [];
    for (let yr = 1; yr <= maxLen; yr++) {
        const row: Record<string, number | string> = { year: yr };
        allSeries.forEach(s => {
            const pt = s.points.find(p => p.year === yr);
            if (pt) row[s.name] = pt.equity;
        });
        chartData.push(row);
    }

    // G7b — zoom molette / pan sur la comparaison multi-propriétés (x = année).
    const zoom = useTimeChartZoom(chartData);
    if (goals.length < 2) return null;

    return (
        <Card
            title={`📊 Comparaison des ${goals.length} Propriétés — Équité Projectée`}
            className="mt-4"
        >
            <div className="flex gap-4 mb-4 flex-wrap">
                {allSeries.map(s => (
                    <div key={s.name} className="flex items-center gap-2 text-xs font-bold" style={{ color: s.color }}>
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.name}
                    </div>
                ))}
            </div>
            <ZoomContainer zoom={zoom} className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={zoom.visibleData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                        <XAxis dataKey="year" stroke="#555" tick={{ fontSize: 10 }} tickFormatter={v => `An ${v}`} />
                        <YAxis stroke="#555" tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={50} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1a1e29', borderColor: '#333', borderRadius: '8px', fontSize: '11px' }}
                            formatter={(val: number, name: string) => [`${val.toLocaleString('fr-CA')} $`, name]}
                            labelFormatter={v => `Année ${v}`}
                        />
                        <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                        {allSeries.map(s => (
                            <Area
                                key={s.name}
                                type="monotone"
                                dataKey={s.name}
                                stroke={s.color}
                                fill={s.color + '15'}
                                strokeWidth={2}
                                dot={false}
                            />
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
            </ZoomContainer>
        </Card>
    );
};
