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
        // chartData contient possiblement des références circulaires ou des objets non sérialisables
        // On force un round-trip JSON pour garantir la sérialisabilité postMessage.
        (self as any).postMessage(JSON.parse(JSON.stringify(result)));
    } catch (err) {
        (self as any).postMessage({ __error: String(err) });
    }
};
