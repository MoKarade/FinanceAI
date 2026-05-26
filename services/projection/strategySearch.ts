// services/projection/strategySearch.ts
// G21 C5 commit 4 — recherche exhaustive : lance un Monte Carlo sur CHAQUE
// StrategyConfig de l'espace de recherche et collecte les métriques par config.
//
// PUR (hors RNG) : runScenario injecté en argument (comme monteCarlo.ts /
// strategyRobustness.ts) → pas de dépendance circulaire avec projection.ts, et
// testable en Node avec un faux runScenario. Le sharding multi-worker est géré
// en amont (runAsync.ts) : ce module reçoit un sous-ensemble de configs et le
// traite séquentiellement.
//
// Deux sources de métriques par config :
//  - Monte Carlo (runMonteCarlo) → métriques de RISQUE (taux de succès, P10/P50/
//    P90, FVI, risque de séquence) : varie le monde par seed sur N itérations.
//  - Run DÉTERMINISTE (enableMonteCarlo=false) → chartData complet → impôt à vie
//    et âge FIRE du « chemin attendu ». En mode MC le chartData est allégé
//    (monthlyOutput.ts l.144 : {NetWorth, monthIndex} seulement), ces deux
//    métriques n'y sont donc pas disponibles.

import type { SimulationParams, AllocationStrategy, FutureScenarioType } from '../projection';
import type { EngineOverrides, StrategyConfig } from './strategyConfig';
import { configToEngine } from './strategySpace';
import { runMonteCarlo } from './monteCarlo';

type RunScenarioFn = (
    params: SimulationParams,
    strategy: AllocationStrategy,
    enableMonteCarlo: boolean,
    delayPensions: boolean,
    mcIterationIndex: number,
    scenarioType?: FutureScenarioType,
    overrides?: EngineOverrides,
) => any;

/** Métriques complètes d'une StrategyConfig évaluée par Monte Carlo + run déterministe. */
export interface ConfigResult {
    config: StrategyConfig;
    /** % des simulations MC où le patrimoine final reste > 0 (critère de survie). */
    successRate: number;
    /** Financial Vitality Index 0-100 (survie + sécurité + efficience + legs). */
    fvi: number;
    /** Patrimoine net final — trajectoire pessimiste (P10), médiane (P50), optimiste (P90). */
    finalNWp10: number;
    finalNWp50: number;
    finalNWp90: number;
    /** Impôt total payé sur la vie de la projection (run déterministe). */
    lifetimeTax: number;
    /** Âge auquel l'indépendance financière (FIRE) est atteinte, ou null si jamais. */
    fireAge: number | null;
    /** % des runs fragilisés dans la décennie critique autour de la retraite. */
    sequenceRiskPct: number;
}

export interface StrategySearchResult {
    results: ConfigResult[];
    iterations: number;
}

export interface RunStrategySearchOptions {
    /** Itérations MC par config. Borné [50, 1000] comme le moteur. Défaut 1000. */
    iterations?: number;
    /**
     * Appelé après chaque config évaluée : done = nb terminées, total = nb total.
     * Permet barre de progression + watchdog basé sur la progression (worker).
     */
    onProgress?: (done: number, total: number) => void;
}

const DEFAULT_ITERATIONS = 1000;
const MIN_ITERATIONS = 50;
const MAX_ITERATIONS = 1000;

const lastFinalNW = (trajectory: number[]): number =>
    trajectory.length ? trajectory[trajectory.length - 1] : 0;

/**
 * Âge FIRE depuis un chartData déterministe complet : 1er point où NetWorth
 * atteint la cible FIRE (déjà inflation-ajustée dans le moteur). null si jamais.
 */
function findFireAge(chartData: Array<{ NetWorth?: number; FireTarget?: number; age?: number }>): number | null {
    for (const point of chartData) {
        const target = point.FireTarget ?? 0;
        const netWorth = point.NetWorth ?? 0;
        if (target > 0 && netWorth >= target) return point.age ?? null;
    }
    return null;
}

/**
 * Évalue un sous-ensemble de StrategyConfig. Pour chaque config : clone params +
 * overrides (configToEngine), lance le MC (risque) + un run déterministe (impôt à
 * vie + âge FIRE). Déterministe car la RNG du moteur est seedée par
 * (scenarioType, strategy, iterationIndex).
 */
export function runStrategySearch(
    runScenario: RunScenarioFn,
    baseParams: SimulationParams,
    configs: ReadonlyArray<StrategyConfig>,
    opts: RunStrategySearchOptions = {},
): StrategySearchResult {
    const iterations = Math.max(MIN_ITERATIONS, Math.min(MAX_ITERATIONS, opts.iterations ?? DEFAULT_ITERATIONS));
    const total = configs.length;

    const results: ConfigResult[] = configs.map((config, idx) => {
        const { params, strategy, delayPensions, overrides } = configToEngine(config, baseParams);

        // Progression fractionnaire : config terminée = idx, + fraction du MC en cours.
        // Garantit un heartbeat régulier (sinon une config à 1000 sims = silence long
        // → le watchdog multi-worker tue le worker, cf. bug « sans progrès depuis 60s »).
        const heartbeat = (done: number, iterTotal: number) =>
            opts.onProgress?.(idx + done / iterTotal, total);

        const mc = runMonteCarlo(runScenario, params, strategy, delayPensions, iterations, overrides, heartbeat);
        const baseline = runScenario(params, strategy, false, delayPensions, 0, 'BASE', overrides);

        opts.onProgress?.(idx + 1, total);
        return {
            config,
            successRate: mc.successRate,
            fvi: mc.fvi,
            finalNWp10: lastFinalNW(mc.p10Data),
            finalNWp50: lastFinalNW(mc.p50Data),
            finalNWp90: lastFinalNW(mc.p90Data),
            lifetimeTax: baseline?.totalTaxesPaid ?? 0,
            fireAge: findFireAge(baseline?.chartData ?? []),
            sequenceRiskPct: mc.expertMetrics.sequenceRiskPct,
        };
    });

    return { results, iterations };
}
