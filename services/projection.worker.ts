// services/projection.worker.ts
// W1.1 — Web Worker pour exécuter calculateFutureProjection hors du thread principal.
// Évite de figer l'UI pendant les 50-100 itérations Monte Carlo (jusqu'à 3s).
//
// Usage côté main thread:
//   const worker = new Worker(new URL('./projection.worker.ts', import.meta.url), { type: 'module' });
//   worker.postMessage({ params, runMC, selectedIdx });
//   worker.onmessage = (e) => setResult(e.data);

import { calculateFutureProjection, type SimulationParams } from './projection';

interface RunMessage {
    params: SimulationParams;
    runMC?: boolean;
    selectedIdx?: number;
}

self.onmessage = (e: MessageEvent<RunMessage>) => {
    // FIX silent-failure cycle 2 (HIGH): requestId obligatoire pour corréler
    // chaque réponse à son appel — évite les résultats croisés entre appels concurrents.
    const requestId = (e.data as any).__requestId;
    const { params, runMC = false, selectedIdx = 0 } = e.data;
    try {
        const result = calculateFutureProjection(params, runMC, selectedIdx);
        (self as any).postMessage({ __requestId: requestId, result });
    } catch (err) {
        (self as any).postMessage({ __requestId: requestId, __error: String(err) });
    }
};
