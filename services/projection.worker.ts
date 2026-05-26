// services/projection.worker.ts
// W1.1 — Web Worker pour exécuter calculateFutureProjection hors du thread principal.
// Évite de figer l'UI pendant les 50-100 itérations Monte Carlo (jusqu'à 3s).
//
// G21 C4 — gère aussi le mode 'robustness' : 5 stratégies × jusqu'à 1000 sims.
// Poste des messages de progression intermédiaires ({ __progress }) pour
// alimenter une barre de progression et un watchdog côté main thread.
//
// Usage côté main thread:
//   const worker = new Worker(new URL('./projection.worker.ts', import.meta.url), { type: 'module' });
//   worker.postMessage({ params, runMC, selectedIdx });
//   worker.onmessage = (e) => setResult(e.data);

import {
    calculateFutureProjection,
    calculateRobustnessRanking,
    calculateStrategySearch,
    type SimulationParams,
    type StrategyConfig,
} from './projection';

interface RunMessage {
    params: SimulationParams;
    runMC?: boolean;
    selectedIdx?: number;
    mode?: 'projection' | 'robustness' | 'strategySearch';
    iterationsPerStrategy?: number;
    // G21 C5 commit 4 — mode 'strategySearch' : ce worker traite SA part de configs
    // (sharding fait côté main thread). iterations = sims MC par config.
    configs?: StrategyConfig[];
    iterations?: number;
}

self.onmessage = (e: MessageEvent<RunMessage>) => {
    // FIX silent-failure cycle 2 (HIGH): requestId obligatoire pour corréler
    // chaque réponse à son appel — évite les résultats croisés entre appels concurrents.
    const requestId = (e.data as any).__requestId;
    const { params, runMC = false, selectedIdx = 0, mode = 'projection', iterationsPerStrategy, configs, iterations } = e.data;
    try {
        if (mode === 'robustness') {
            const result = calculateRobustnessRanking(params, {
                iterationsPerStrategy,
                onProgress: (done, total, current) =>
                    (self as any).postMessage({ __requestId: requestId, __progress: { done, total, current } }),
            });
            (self as any).postMessage({ __requestId: requestId, result });
        } else if (mode === 'strategySearch') {
            const result = calculateStrategySearch(params, configs ?? [], {
                iterations,
                onProgress: (done, total) =>
                    (self as any).postMessage({ __requestId: requestId, __progress: { done, total } }),
            });
            (self as any).postMessage({ __requestId: requestId, result });
        } else {
            const result = calculateFutureProjection(params, runMC, selectedIdx);
            (self as any).postMessage({ __requestId: requestId, result });
        }
    } catch (err) {
        (self as any).postMessage({ __requestId: requestId, __error: String(err) });
    }
};
