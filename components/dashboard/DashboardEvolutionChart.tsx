// Phase 7.A.1 — chart Dashboard extrait pour lazy-load (recharts ≈ 445KB).
// Phase D.2 — Brush retiré, remplacé par <ZoomableTimeChart> (zoom molette + pan).
// Phase D.3 — support multi-comptes toggle + ligne Total overlay optionnelle.
import React from 'react';
import { ZoomableTimeChart, type ZoomableSeries } from '../ui/ZoomableTimeChart';

interface Props {
    unifiedHistory: Array<Record<string, unknown>>;
    accountKeys: string[];
    colors: string[];
    isPrivacyMode: boolean;
    /** Phase D.3 — comptes à masquer du chart (visibles dans la légende sinon). */
    hiddenAccounts?: Set<string>;
    /** Phase D.3 — superpose une ligne "Total" (somme de TOUS les comptes du dataset). */
    showTotalLine?: boolean;
}

const DashboardEvolutionChart: React.FC<Props> = ({
    unifiedHistory,
    accountKeys,
    colors,
    isPrivacyMode,
    hiddenAccounts = new Set(),
    showTotalLine = false,
}) => {
    const visibleKeys = accountKeys.filter(k => !hiddenAccounts.has(k));
    const series: ZoomableSeries[] = visibleKeys.map((key) => ({
        key,
        color: colors[accountKeys.indexOf(key) % colors.length],
        name: key,
    }));

    if (showTotalLine) {
        series.push({
            key: 'Total',
            color: '#ffffff',
            name: 'Total',
            type: 'line',
            strokeWidth: 2,
        });
    }

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
