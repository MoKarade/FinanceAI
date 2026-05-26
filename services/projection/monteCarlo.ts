// services/projection/monteCarlo.ts
// Cycle 6/7 split: module Monte Carlo autonome.
// Pattern injection de dépendance: runScenario passé en argument pour
// éviter dépendance circulaire avec projection.ts.

import type { SimulationParams, AllocationStrategy, FutureScenarioType } from '../projection';
import type { EngineOverrides } from './strategyConfig';

type RunScenarioFn = (
    params: SimulationParams,
    strategy: AllocationStrategy,
    enableMonteCarlo: boolean,
    delayPensions: boolean,
    mcIterationIndex: number,
    scenarioType?: FutureScenarioType,
    overrides?: EngineOverrides,
) => any;

export interface MonteCarloResult {
    successRate: number;
    p10Data: number[];
    p50Data: number[];
    p90Data: number[];
    fvi: number;
    expertMetrics: {
        swr: number;
        taxLeakage: number;
        shortfallRisk: number;
        sequenceRiskPct: number;
        worstDecadeDrawdown: number;
        criticalDecadeStartYear: number;
        criticalDecadeEndYear: number;
    };
}

export function runMonteCarlo(
    runScenario: RunScenarioFn,
    params: SimulationParams,
    strategy: AllocationStrategy,
    delayPensions: boolean,
    iterations = 100,
    overrides: EngineOverrides = {},
    /** Heartbeat optionnel : appelé périodiquement (i, total) pendant la boucle MC.
     * Sert au watchdog multi-worker (évite un silence > timeout sur une config lourde). */
    onIteration?: (done: number, total: number) => void,
): MonteCarloResult {
    const allRuns: {
        netWorthByMonth: number[];
        finalNW: number;
        minNetWorth: number;
        totalTaxesPaid: number;
        totalGrowth: number;
        totalExpenses: number;
        shortfallRate: number;
        estateNetWorth: number;
        chartData: any[];
    }[] = [];
    const nMonths = params.projection.years * 12;

    for (let i = 0; i < iterations; i++) {
        // Heartbeat ~tous les 5% (au moins tous les 25 tours) → le worker poste un
        // progrès régulier même sur une config qui prend > 60s à elle seule.
        if (onIteration && i % Math.max(25, Math.floor(iterations / 20)) === 0) onIteration(i, iterations);
        const result = runScenario(params, strategy, true, delayPensions, i, 'BASE', overrides);
        const nwHistory = result.chartData.map((d: any) => d.NetWorth);
        while (nwHistory.length <= nMonths) nwHistory.push(0);
        allRuns.push({
            netWorthByMonth: nwHistory,
            finalNW: result.finalNetWorth,
            minNetWorth: result.minNetWorth,
            totalTaxesPaid: result.totalTaxesPaid,
            totalGrowth: result.totalGrowth,
            totalExpenses: result.totalExpenses,
            shortfallRate: result.shortfallRate,
            estateNetWorth: result.estateNetWorth,
            chartData: result.chartData,
        });
    }

    const successRate = Math.round((allRuns.filter(r => r.finalNW > 0).length / iterations) * 100);
    const sorted = [...allRuns].sort((a, b) => a.finalNW - b.finalNW);
    const p10Index = Math.floor(iterations * 0.10);
    const p50Index = Math.floor(iterations * 0.50);
    const p90Index = Math.floor(iterations * 0.90);
    const p10Data = sorted[p10Index]?.netWorthByMonth || Array(nMonths + 1).fill(0);
    const p50Data = sorted[p50Index]?.netWorthByMonth || Array(nMonths + 1).fill(0);
    const p90Data = sorted[p90Index]?.netWorthByMonth || Array(nMonths + 1).fill(0);

    const startNW = (params.calculatedStartingCash + params.liveCSVBalances.CELI + params.liveCSVBalances.CELIAPP + params.liveCSVBalances.REER + params.liveCSVBalances.NON_ENREG + params.liveCSVBalances.CRYPTO + params.liveCSVBalances.REEE);

    const survivalScore = successRate / 100;
    const safetyScore = allRuns.filter(r => r.minNetWorth > startNW * 0.1).length / iterations;
    const avgEfficiency = allRuns.reduce((acc, r) => {
        const leakage = r.totalGrowth > 0 ? Math.min(1, r.totalTaxesPaid / r.totalGrowth) : 0.5;
        return acc + (1 - leakage);
    }, 0) / iterations;
    const avgLegacyRatio = allRuns.reduce((acc, r) => acc + Math.min(3, r.estateNetWorth / (startNW || 1)), 0) / iterations;
    const legacyScore = Math.min(1, avgLegacyRatio / 2);
    const fvi = Math.round((survivalScore * 0.3 + safetyScore * 0.3 + avgEfficiency * 0.2 + legacyScore * 0.2) * 100);

    const retAge = params.retirementGoal.targetAge || 65;
    const currentAge = params.config.users[0]?.age || 30;
    const yearsToRetirement = Math.max(0, retAge - currentAge);
    const criticalDecadeStartMonth = Math.max(0, (yearsToRetirement - 5) * 12);
    const criticalDecadeEndMonth = Math.min(nMonths, (yearsToRetirement + 5) * 12);
    const fragileThreshold = startNW * 0.5;

    let fragileCount = 0;
    let worstDecadeDrawdown = 0;
    for (const run of allRuns) {
        let minInDecade = Infinity;
        for (let mi = criticalDecadeStartMonth; mi <= criticalDecadeEndMonth && mi < run.netWorthByMonth.length; mi++) {
            const nw = run.netWorthByMonth[mi];
            if (nw < minInDecade) minInDecade = nw;
        }
        if (minInDecade < fragileThreshold) fragileCount++;
        const drawdown = startNW > 0 ? Math.max(0, (startNW - minInDecade) / startNW) : 0;
        if (drawdown > worstDecadeDrawdown) worstDecadeDrawdown = drawdown;
    }
    const sequenceRiskPct = Math.round((fragileCount / iterations) * 100);

    const representativeRun = sorted[p50Index] || sorted[0];
    const expertMetrics = {
        swr: representativeRun ? (representativeRun.totalExpenses / (representativeRun.chartData?.length || 1) * 12) / (startNW || 1) : 0,
        taxLeakage: representativeRun ? (representativeRun.totalTaxesPaid / (representativeRun.totalGrowth || 1)) : 0,
        shortfallRisk: representativeRun ? representativeRun.shortfallRate : 0,
        sequenceRiskPct,
        worstDecadeDrawdown,
        criticalDecadeStartYear: Math.floor(criticalDecadeStartMonth / 12),
        criticalDecadeEndYear: Math.floor(criticalDecadeEndMonth / 12),
    };

    return { successRate, p10Data, p50Data, p90Data, fvi, expertMetrics };
}
