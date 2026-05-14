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
    const { params, runMC = false, selectedIdx = 0 } = e.data;
    try {
        const result = calculateFutureProjection(params, runMC, selectedIdx);
        // FIX agent (perf + code-reviewer): structured clone gère nativement
        // les objets sérialisables. JSON.parse(JSON.stringify) coûte ~15-30ms
        // sur un chartData de 360 entrées et est inutile.
        (self as any).postMessage(result);
    } catch (err) {
        (self as any).postMessage({ __error: String(err) });
    }
};
