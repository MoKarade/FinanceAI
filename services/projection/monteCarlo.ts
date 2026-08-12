// services/projection/monteCarlo.ts
// Cycle 6/7 split: module Monte Carlo autonome.
// Pattern injection de dépendance: runScenario passé en argument pour
// éviter dépendance circulaire avec projection.ts.

import type { SimulationParams, AllocationStrategy, FutureScenarioType } from '../projection';
import type { EngineOverrides } from './strategyConfig';
import { logErrorThrottled } from '../errorLogger';

type RunScenarioFn = (
    params: SimulationParams,
    strategy: AllocationStrategy,
    enableMonteCarlo: boolean,
    delayPensions: boolean,
    mcIterationIndex: number,
    scenarioType?: FutureScenarioType,
    overrides?: EngineOverrides,
) => {
    chartData: { NetWorth: number }[];
    finalNetWorth: number;
    estateNetWorth: number;
    totalTaxesPaid: number;
    totalGrowth: number;
    totalExpenses: number;
    minNetWorth: number;
    shortfallRate: number;
};

/** Bornes moteur des itérations Monte Carlo — SOURCE UNIQUE consommée par le calcul
 *  (projection.ts) ET par l'UI (libellé « Monte Carlo (N itér.) », input des paramètres
 *  avancés). [REFONTE-NAV-L2a] Avant : « 100 » re-codé en dur dans FutureProjection alors que
 *  `monteCarloIterations` est configurable → libellé mensonger dès qu'on changeait la valeur. */
export const MC_ITERATIONS_MIN = 50;
export const MC_ITERATIONS_MAX = 1000;
export const MC_ITERATIONS_DEFAULT = 100;

/** Nombre d'itérations réellement EXÉCUTÉES par le moteur pour une valeur demandée : défaut 100,
 *  borné 50–1000. Afficher autre chose que CE nombre, c'est mentir sur le calcul fait.
 *  [Panel #601, silent-failure] Distingue ABSENT (config jamais saisie : repli silencieux
 *  légitime) de PRÉSENT mais non fini (NaN/Infinity : donnée corrompue → logguée AVANT le
 *  repli, jamais avalée) — pattern `parseRate` de services/finance.ts. */
export function effectiveMcIterations(requested?: number): number {
    if (requested === undefined) return MC_ITERATIONS_DEFAULT; // absent : défaut légitime, silencieux
    if (typeof requested !== 'number' || !Number.isFinite(requested)) {
        logErrorThrottled('effectiveMcIterations:non-finite', {
            source: 'projection', severity: 'warning',
            message: `Itérations Monte Carlo non finies — repli sur le défaut (${MC_ITERATIONS_DEFAULT})`,
            context: { requested: String(requested) },
        });
        return MC_ITERATIONS_DEFAULT;
    }
    return Math.max(MC_ITERATIONS_MIN, Math.min(MC_ITERATIONS_MAX, requested));
}

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
        // Tier 🟡 perf — on ne garde QUE la longueur (seul usage : nb de mois pour le SWR).
        // Les valeurs NetWorth sont déjà dans `netWorthByMonth` ; stocker le chartData complet
        // sur chaque run dupliquait ~nMonths objets × `iterations` (jusqu'à ~600k objets retenus).
        chartDataLength: number;
    }[] = [];
    const nMonths = params.projection.years * 12;

    for (let i = 0; i < iterations; i++) {
        // Heartbeat ~tous les 5% (au moins tous les 25 tours) → le worker poste un
        // progrès régulier même sur une config qui prend > 60s à elle seule.
        if (onIteration && i % Math.max(25, Math.floor(iterations / 20)) === 0) onIteration(i, iterations);
        const result = runScenario(params, strategy, true, delayPensions, i, 'BASE', overrides);
        const nwHistory = result.chartData.map((d: { NetWorth: number }) => d.NetWorth);
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
            chartDataLength: result.chartData.length,
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
        // [PROJ-TAXPAID-LABEL] Clamp [0,1] : `totalTaxesPaid` peut être NÉGATIF (année à gros
        // remboursement net) → sans plancher 0, leakage < 0 donnait une « efficacité » > 100 %.
        const leakage = r.totalGrowth > 0 ? Math.min(1, Math.max(0, r.totalTaxesPaid / r.totalGrowth)) : 0.5;
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
        swr: representativeRun ? (representativeRun.totalExpenses / (representativeRun.chartDataLength || 1) * 12) / (startNW || 1) : 0,
        // [PROJ-TAXPAID-LABEL] Plancher 0 seulement (un compteur net négatif — année à gros
        // remboursement — rendait un « -50 % » absurde). PAS de cap haut : en décaissement, un
        // ratio > 1 est une INFORMATION réelle (impôts payés > croissance de la période, mesuré
        // 3-5× sur un retraité REER) — le capper fabriquerait un 100 % plausible (finding
        // financial-integrity #549). growth ≤ 0 → 0 honnête (pas « ratio = dollars bruts »).
        taxLeakage: representativeRun && representativeRun.totalGrowth > 0
            ? Math.max(0, representativeRun.totalTaxesPaid / representativeRun.totalGrowth)
            : 0,
        shortfallRisk: representativeRun ? representativeRun.shortfallRate : 0,
        sequenceRiskPct,
        worstDecadeDrawdown,
        criticalDecadeStartYear: Math.floor(criticalDecadeStartMonth / 12),
        criticalDecadeEndYear: Math.floor(criticalDecadeEndMonth / 12),
    };

    return { successRate, p10Data, p50Data, p90Data, fvi, expertMetrics };
}
