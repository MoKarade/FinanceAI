// services/projection/runAsync.ts
// W1.1 — Wrapper async qui exécute calculateFutureProjection dans un Web Worker
// si supporté, sinon fallback synchrone (utile pour Node/tests).
//
// FIX silent-failure (HIGH, cycle 2):
//  - requestId par appel: évite que 2 appels rapides reçoivent leurs résultats
//    croisés (le worker répondait FIFO sans corrélation).
//  - terminate() + recréation au prochain appel si le worker crash.

import type { SimulationParams, ProjectionResult, RobustnessRanking } from '../projection';

let _worker: Worker | null = null;
let _nextRequestId = 1;
let _workerDead = false;

function getWorker(): Worker | null {
    if (_worker && !_workerDead) return _worker;
    if (typeof Worker === 'undefined') return null;
    try {
        _worker = new Worker(new URL('../projection.worker.ts', import.meta.url), { type: 'module' });
        _workerDead = false;
        _worker.addEventListener('error', (e) => {
            console.warn('[projection] Worker error, marqué dead pour recréation:', e.message);
            _workerDead = true;
        });
        return _worker;
    } catch (err) {
        console.warn('[projection] Worker indisponible (CSP/MIME?), fallback synchrone:', err);
        return null;
    }
}

export function terminateProjectionWorker() {
    if (_worker) {
        _worker.terminate();
        _worker = null;
        _workerDead = false;
    }
}

interface WorkerRequest {
    __requestId: number;
    params: SimulationParams;
    runMC: boolean;
    selectedIdx: number;
}

/**
 * Exécute calculateFutureProjection de manière asynchrone via Web Worker
 * si disponible. Fallback synchrone autrement (Node, tests).
 *
 * Chaque appel reçoit un requestId unique; le listener ne résout la Promise
 * que sur le message correspondant — évite la confusion lors d'appels rapides
 * concurrents (toggle MC, debounce, params qui changent).
 */
export async function runProjectionAsync(
    params: SimulationParams,
    runMC: boolean = false,
    selectedIdx: number = 0,
): Promise<ProjectionResult> {
    const worker = getWorker();
    if (!worker) {
        const { calculateFutureProjection } = await import('../projection');
        return calculateFutureProjection(params, runMC, selectedIdx);
    }
    const id = _nextRequestId++;
    return new Promise((resolve, reject) => {
        // FIX cycle 3 silent-failure (MEDIUM): timeout + messageerror.
        // Sans timeout, un worker qui hang ou poste un message sans __requestId
        // laisse la Promise pendante indéfiniment.
        const TIMEOUT_MS = 30_000;
        const cleanup = () => {
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', onError);
            worker.removeEventListener('messageerror', onMessageError);
            clearTimeout(timeoutHandle);
        };
        const onMessage = (e: MessageEvent) => {
            // Ne réagir qu'au message correspondant à ce requestId
            if (!e.data || e.data.__requestId !== id) return;
            cleanup();
            if (e.data.__error) reject(new Error(e.data.__error));
            else resolve(e.data.result);
        };
        const onError = (e: ErrorEvent) => {
            cleanup();
            _workerDead = true; // forcera la recréation
            reject(new Error(e.message || 'Worker error'));
        };
        const onMessageError = (e: MessageEvent) => {
            cleanup();
            _workerDead = true;
            reject(new Error('Worker messageerror (payload non-clonable): ' + String(e.data ?? '')));
        };
        const timeoutHandle = setTimeout(() => {
            cleanup();
            _workerDead = true; // recréation au prochain appel
            reject(new Error(`Worker timeout après ${TIMEOUT_MS}ms (requestId=${id})`));
        }, TIMEOUT_MS);
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.addEventListener('messageerror', onMessageError);
        const req: WorkerRequest = { __requestId: id, params, runMC, selectedIdx };
        worker.postMessage(req);
    });
}

export interface RobustnessProgress {
    done: number;
    total: number;
    current: string;
}

/**
 * G21 C4 — lance le classement par robustesse (5 stratégies × jusqu'à 1000 sims)
 * dans le Web Worker. Fallback synchrone si pas de worker (Node/tests).
 *
 * Contrairement à runProjectionAsync (timeout fixe 30s), on utilise un watchdog
 * réarmé à chaque message de progression : 5000 sims peuvent largement dépasser
 * 30s sur une machine modeste, mais tant que le worker progresse (une stratégie
 * terminée régulièrement) on ne le tue pas. Le watchdog ne déclenche que sur un
 * vrai hang (aucun progrès pendant IDLE_MS).
 */
export async function runRobustnessRankingAsync(
    params: SimulationParams,
    opts: { iterationsPerStrategy?: number; onProgress?: (p: RobustnessProgress) => void } = {},
): Promise<RobustnessRanking> {
    const worker = getWorker();
    if (!worker) {
        const { calculateRobustnessRanking } = await import('../projection');
        return calculateRobustnessRanking(params, {
            iterationsPerStrategy: opts.iterationsPerStrategy,
            onProgress: (done, total, current) => opts.onProgress?.({ done, total, current }),
        });
    }
    const id = _nextRequestId++;
    return new Promise((resolve, reject) => {
        const IDLE_MS = 45_000; // hang = aucun progrès pendant 45s
        let watchdog: ReturnType<typeof setTimeout>;
        const cleanup = () => {
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', onError);
            worker.removeEventListener('messageerror', onMessageError);
            clearTimeout(watchdog);
        };
        const armWatchdog = () => {
            clearTimeout(watchdog);
            watchdog = setTimeout(() => {
                cleanup();
                _workerDead = true;
                reject(new Error(`Robustesse: aucun progrès depuis ${IDLE_MS}ms (requestId=${id})`));
            }, IDLE_MS);
        };
        const onMessage = (e: MessageEvent) => {
            if (!e.data || e.data.__requestId !== id) return;
            if (e.data.__progress) {
                opts.onProgress?.(e.data.__progress as RobustnessProgress);
                armWatchdog(); // progrès → on réarme, pas de timeout
                return;
            }
            cleanup();
            if (e.data.__error) reject(new Error(e.data.__error));
            else resolve(e.data.result);
        };
        const onError = (e: ErrorEvent) => {
            cleanup();
            _workerDead = true;
            reject(new Error(e.message || 'Worker error'));
        };
        const onMessageError = (e: MessageEvent) => {
            cleanup();
            _workerDead = true;
            reject(new Error('Worker messageerror (payload non-clonable): ' + String(e.data ?? '')));
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.addEventListener('messageerror', onMessageError);
        armWatchdog();
        worker.postMessage({
            __requestId: id,
            params,
            mode: 'robustness',
            iterationsPerStrategy: opts.iterationsPerStrategy,
        });
    });
}
