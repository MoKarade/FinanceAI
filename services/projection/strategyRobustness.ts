// services/projection/strategyRobustness.ts
// G21 C4 — classement des stratégies par ROBUSTESSE réelle (Monte Carlo).
//
// Contrairement à strategyRanking.ts (PUR, classe les résultats déterministes
// déjà calculés), ce module RE-LANCE un Monte Carlo complet par stratégie pour
// mesurer le taux de succès = % des simulations où le patrimoine ne s'épuise
// jamais (finalNW > 0). C'est coûteux : 5 stratégies × N itérations (jusqu'à
// 1000) = jusqu'à 5000 simulations mensuelles complètes → à exécuter dans un
// Web Worker avec un rapport de progression (voir projection.worker.ts).
//
// Pattern injection de dépendance : runScenario passé en argument (comme
// monteCarlo.ts) pour éviter la dépendance circulaire avec projection.ts.

import type { SimulationParams, AllocationStrategy } from '../projection';
import { runMonteCarlo } from './monteCarlo';
import { SCENARIO_DEFINITIONS } from './scenarios';

type RunScenarioFn = (
    params: SimulationParams,
    strategy: AllocationStrategy,
    enableMonteCarlo: boolean,
    delayPensions: boolean,
    mcIterationIndex: number,
) => {
    chartData: { NetWorth: number }[];
    finalNetWorth: number;
    minNetWorth: number;
    estateNetWorth: number;
    totalTaxesPaid: number;
    totalGrowth: number;
    totalExpenses: number;
    shortfallRate: number;
};

export interface StrategyRobustness {
    strategy: AllocationStrategy;
    strategyName: string;
    icon: string;
    /** % des simulations MC où le patrimoine final reste > 0. Critère de tri. */
    successRate: number;
    /** Financial Vitality Index 0-100 (survie + sécurité + efficience + legs). */
    fvi: number;
    /** Patrimoine net final de la trajectoire médiane (P50). */
    medianFinalNW: number;
    iterations: number;
}

export interface RobustnessRanking {
    /** Plus robuste en premier (taux de succès décroissant). */
    ranked: StrategyRobustness[];
    iterationsPerStrategy: number;
}

export interface RankRobustnessOptions {
    /** Itérations MC par stratégie. Borné [50, 1000] comme le moteur. Défaut 1000. */
    iterationsPerStrategy?: number;
    /**
     * Appelé avant chaque stratégie (done = nb déjà terminées, total = nb de
     * stratégies, current = nom de celle qui démarre) puis une dernière fois à
     * la fin (done === total, current === ''). Permet une barre de progression
     * et un watchdog basé sur la progression côté worker.
     */
    onProgress?: (done: number, total: number, current: string) => void;
}

const DEFAULT_ITERATIONS = 1000;
const MIN_ITERATIONS = 50;
const MAX_ITERATIONS = 1000;

/**
 * Lance un Monte Carlo par stratégie de GESTION (kind 'strategy', donc sous le
 * même monde réaliste — les stress-tests sont exclus car non comparables) et
 * classe par taux de succès. Fonction pure hors RNG : déterministe car la RNG
 * du moteur est seedée par (scenarioType, strategy, iterationIndex).
 */
export function rankStrategiesByRobustness(
    runScenario: RunScenarioFn,
    params: SimulationParams,
    opts: RankRobustnessOptions = {},
): RobustnessRanking {
    const iterationsPerStrategy = Math.max(
        MIN_ITERATIONS,
        Math.min(MAX_ITERATIONS, opts.iterationsPerStrategy ?? DEFAULT_ITERATIONS),
    );

    const strategyDefs = SCENARIO_DEFINITIONS.filter((d) => d.kind === 'strategy');
    const total = strategyDefs.length;

    const results: StrategyRobustness[] = strategyDefs.map((def, idx) => {
        opts.onProgress?.(idx, total, def.strategyName);
        const mc = runMonteCarlo(runScenario, params, def.strategy, def.delayPensions, iterationsPerStrategy);
        // p50Data = trajectoire net-worth mensuelle de la run médiane ; dernier
        // point = patrimoine final médian.
        const medianFinalNW = mc.p50Data.length ? mc.p50Data[mc.p50Data.length - 1] : 0;
        return {
            strategy: def.strategy,
            strategyName: def.strategyName,
            icon: def.icon,
            successRate: mc.successRate,
            fvi: mc.fvi,
            medianFinalNW,
            iterations: iterationsPerStrategy,
        };
    });
    opts.onProgress?.(total, total, '');

    // Tri stable : taux de succès décroissant, départage par FVI puis patrimoine
    // médian (deux stratégies peuvent atteindre 100 % — on préfère alors la plus
    // saine, puis la plus riche).
    const ranked = [...results].sort(
        (a, b) => b.successRate - a.successRate || b.fvi - a.fvi || b.medianFinalNW - a.medianFinalNW,
    );

    return { ranked, iterationsPerStrategy };
}
