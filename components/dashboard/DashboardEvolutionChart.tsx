// Phase 7.A.1 — chart Dashboard extrait pour lazy-load (recharts ≈ 445KB).
// Phase D.2 — Brush retiré, remplacé par <ZoomableTimeChart> (zoom molette + pan).
import React from 'react';
import { ZoomableTimeChart, type ZoomableSeries } from '../ui/ZoomableTimeChart';

interface Props {
    unifiedHistory: Array<Record<string, unknown>>;
    accountKeys: string[];
    colors: string[];
    isPrivacyMode: boolean;
}

const DashboardEvolutionChart: React.FC<Props> = ({ unifiedHistory, accountKeys, colors, isPrivacyMode }) => {
    const series: ZoomableSeries[] = accountKeys.map((key, idx) => ({
        key,
        color: colors[idx % colors.length],
        name: key,
    }));

    return (
        <ZoomableTimeChart
            data={unifiedHistory}
            xKey="date"
            series={series}
            privacyMode={isPrivacyMode}
            stacked
        />
    );
};

export default DashboardEvolutionChart;
