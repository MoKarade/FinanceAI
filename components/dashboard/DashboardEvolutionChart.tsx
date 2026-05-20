// Phase 7.A.1 — chart Dashboard extrait pour lazy-load.
// recharts ≈ 445KB (gzip 128KB) ; sortir l'import statique de Dashboard.tsx
// permet de différer le chunk recharts hors du premier paint au boot
// (Dashboard est le tab par défaut, chargé immédiatement).
import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Brush } from 'recharts';

interface Props {
    unifiedHistory: any[];
    accountKeys: string[];
    colors: string[];
    isPrivacyMode: boolean;
}

const DashboardEvolutionChart: React.FC<Props> = ({ unifiedHistory, accountKeys, colors, isPrivacyMode }) => {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={unifiedHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                    {accountKeys.map((key, idx) => (
                        <linearGradient key={key} id={`color${idx}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={colors[idx % colors.length]} stopOpacity={0.8} />
                            <stop offset="95%" stopColor={colors[idx % colors.length]} stopOpacity={0.1} />
                        </linearGradient>
                    ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                <XAxis dataKey="date" stroke="#555" tick={{ fontSize: 10 }} minTickGap={50} tickFormatter={(str) => new Date(str).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })} />
                <YAxis stroke="#555" tick={{ fontSize: 10 }} width={45} domain={['auto', 'auto']} tickFormatter={(val) => isPrivacyMode ? '***' : `${(val / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', fontSize: '12px' }} itemStyle={{ color: '#fff' }} formatter={(val: number, name: string) => [isPrivacyMode ? '*** $' : (val || 0).toLocaleString() + ' $', name]} labelFormatter={(label) => new Date(label).toLocaleDateString()} />
                <Legend verticalAlign="top" iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                {accountKeys.map((key, idx) => (
                    <Area key={key} type="monotone" dataKey={key} stackId="1" stroke={colors[idx % colors.length]} fill={`url(#color${idx})`} name={key} />
                ))}
                <Brush dataKey="date" height={20} stroke="#444" fill="#111" tickFormatter={() => ''} />
            </AreaChart>
        </ResponsiveContainer>
    );
};

export default DashboardEvolutionChart;
