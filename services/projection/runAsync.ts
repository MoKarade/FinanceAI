// services/projection/runAsync.ts
// W1.1 — Wrapper async qui exécute calculateFutureProjection dans un Web Worker
// si supporté, sinon fallback synchrone (utile pour Node/tests).

import type { SimulationParams } from '../projection';

let _worker: Worker | null = null;

function getWorker(): Worker | null {
    if (_worker) return _worker;
    if (typeof Worker === 'undefined') return null;
    try {
        _worker = new Worker(new URL('../projection.worker.ts', import.meta.url), { type: 'module' });
        return _worker;
    } catch (err) {
        // FIX agent (silent-failure): ne pas swallow silencieusement
        console.warn('[projection] Worker indisponible (CSP/MIME?), fallback synchrone:', err);
        return null;
    }
}

export function terminateProjectionWorker() {
    if (_worker) {
        _worker.terminate();
        _worker = null;
    }
}

/**
 * Exécute calculateFutureProjection de manière asynchrone via Web Worker
 * si disponible. Fallback synchrone autrement (Node, tests).
 */
export async function runProjectionAsync(
    params: SimulationParams,
    runMC: boolean = false,
    selectedIdx: number = 0,
): Promise<any> {
    const worker = getWorker();
    if (!worker) {
        // Fallback synchrone
        const { calculateFutureProjection } = await import('../projection');
        return calculateFutureProjection(params, runMC, selectedIdx);
    }
    return new Promise((resolve, reject) => {
        const onMessage = (e: MessageEvent) => {
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', onError);
            if (e.data && e.data.__error) reject(new Error(e.data.__error));
            else resolve(e.data);
        };
        const onError = (e: ErrorEvent) => {
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', onError);
            reject(new Error(e.message || 'Worker error'));
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.postMessage({ params, runMC, selectedIdx });
    });
}
