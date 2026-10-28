// services/projection.worker.ts
// W1.1 — Web Worker pour exécuter calculateFutureProjection hors du thread principal.
// Évite de figer l'UI pendant les 50-100 itérations Monte Carlo (jusqu'à 3s).
//
// G21 C5 — gère aussi le mode 'strategySearch' : Monte Carlo sur chaque config
// de l'espace de recherche (sharding côté main thread). Poste des messages de
// progression intermédiaires ({ __progress }) pour alimenter une barre de
// progression et un watchdog côté main thread.
//
// Usage côté main thread:
//   const worker = new Worker(new URL('./projection.worker.ts', import.meta.url), { type: 'module' });
//   worker.postMessage({ params, runMC, selectedIdx, onlyStratTypes? });
//   worker.onmessage = (e) => setResult(e.data);

import {
    calculateFutureProjection,
    calculateStrategySearch,
    type SimulationParams,
    type StrategyConfig,
} from './projection';
import type { ProjectionResult } from './projection/types';
import type { StrategySearchResult } from './projection/strategySearch';

// Payload entrant du main thread vers le worker.
interface RunMessage {
    __requestId?: string;
    params: SimulationParams;
    runMC?: boolean;
    selectedIdx?: number;
    // [UI-SCEN] — types de scénarios demandés explicitement (panneau stress-tests).
    onlyStratTypes?: string[];
    mode?: 'projection' | 'strategySearch';
    // G21 C5 commit 4 — mode 'strategySearch' : ce worker traite SA part de configs
    // (sharding fait côté main thread). iterations = sims MC par config.
    configs?: StrategyConfig[];
    iterations?: number;
}

// Payloads sortants du worker vers le main thread.
interface WorkerProgressMessage {
    __requestId: string | undefined;
    __progress: { done: number; total: number; current?: string };
}

interface WorkerResultMessage {
    __requestId: string | undefined;
    result: ProjectionResult | StrategySearchResult;
}

interface WorkerErrorMessage {
    __requestId: string | undefined;
    __error: string;
    // F3 (audit 2026-05-28) — stack du worker transmise séparément pour ne pas la
    // perdre à la frontière postMessage (le main thread la réattache à l'Error).
    __errorStack?: string;
}

type WorkerOutMessage = WorkerProgressMessage | WorkerResultMessage | WorkerErrorMessage;

const workerSelf = self as unknown as { postMessage: (msg: WorkerOutMessage) => void };

self.onmessage = (e: MessageEvent<RunMessage>) => {
    // FIX silent-failure cycle 2 (HIGH): requestId obligatoire pour corréler
    // chaque réponse à son appel — évite les résultats croisés entre appels concurrents.
    const requestId = e.data.__requestId;
    const { params, runMC = false, selectedIdx = 0, onlyStratTypes, mode = 'projection', configs, iterations } = e.data;
    try {
        if (mode === 'strategySearch') {
            const result = calculateStrategySearch(params, configs ?? [], {
                iterations,
                onProgress: (done, total) =>
                    workerSelf.postMessage({ __requestId: requestId, __progress: { done, total } }),
            });
            workerSelf.postMessage({ __requestId: requestId, result });
        } else {
            const result = calculateFutureProjection(params, runMC, selectedIdx, onlyStratTypes);
            workerSelf.postMessage({ __requestId: requestId, result });
        }
    } catch (err) {
        // F3 (audit 2026-05-28) — `String(err)` écrasait la stack (debug aveugle des
        // crashes worker). On transmet message + stack séparément ; runAsync.ts
        // reconstruit l'Error et lui réattache la stack d'origine.
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        workerSelf.postMessage({ __requestId: requestId, __error: message, __errorStack: stack });
    }
};
