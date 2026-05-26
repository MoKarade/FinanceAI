// services/projection/runAsync.ts
// W1.1 — Wrapper async qui exécute calculateFutureProjection dans un Web Worker
// si supporté, sinon fallback synchrone (utile pour Node/tests).
//
// FIX silent-failure (HIGH, cycle 2):
//  - requestId par appel: évite que 2 appels rapides reçoivent leurs résultats
//    croisés (le worker répondait FIFO sans corrélation).
//  - terminate() + recréation au prochain appel si le worker crash.

import type {
    SimulationParams,
    ProjectionResult,
    RobustnessRanking,
    StrategyConfig,
    StrategySearchResult,
    ConfigResult,
} from '../projection';

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

export interface StrategySearchProgress {
    done: number;
    total: number;
}

/** Découpe `items` en `n` tranches contiguës aussi équilibrées que possible. Exporté pour test. */
export function shardContiguous<T>(items: ReadonlyArray<T>, n: number): T[][] {
    const shards: T[][] = [];
    const base = Math.floor(items.length / n);
    const remainder = items.length % n;
    let offset = 0;
    for (let i = 0; i < n; i++) {
        const size = base + (i < remainder ? 1 : 0); // les 1ers shards prennent +1
        shards.push(items.slice(offset, offset + size));
        offset += size;
    }
    return shards;
}

/**
 * G21 C5 commit 4 — recherche exhaustive de la meilleure stratégie : lance un
 * Monte Carlo sur CHAQUE StrategyConfig de l'espace de recherche, réparti sur un
 * POOL de Web Workers (un par cœur logique). Chaque worker traite sa tranche de
 * configs et rapporte sa progression locale ; on agrège la progression globale.
 *
 * Pool dédié (PAS le singleton `_worker` réservé à projection/robustness) : on
 * crée les workers à la volée et on les termine à la fin de la recherche — c'est
 * une opération lourde et ponctuelle, pas un canal réutilisé.
 *
 * Fallback synchrone (Node/tests/CSP) : `calculateStrategySearch` sur toutes les
 * configs, ordre préservé.
 *
 * L'ordre des résultats agrégés suit l'ordre d'entrée de `configs` (tranches
 * contiguës réassemblées par index de worker) → déterministe et testable.
 */
/** Erreur sentinelle : la recherche a été annulée par l'utilisateur (pas un échec). */
export const SEARCH_CANCELLED = '__SEARCH_CANCELLED__';

export async function runStrategySearchAsync(
    params: SimulationParams,
    configs: ReadonlyArray<StrategyConfig>,
    opts: {
        iterations?: number;
        maxWorkers?: number;
        onProgress?: (p: StrategySearchProgress) => void;
        /** Annulation : terminer les workers et rejeter avec SEARCH_CANCELLED. */
        signal?: AbortSignal;
    } = {},
): Promise<StrategySearchResult> {
    const { signal } = opts;
    const total = configs.length;

    // Détermine le parallélisme effectif (borné par le nb de configs).
    const hardware = typeof navigator !== 'undefined' && navigator.hardwareConcurrency
        ? navigator.hardwareConcurrency
        : 4;
    const requested = opts.maxWorkers ?? hardware;
    const nWorkers = Math.max(1, Math.min(requested, total || 1));

    if (signal?.aborted) throw new Error(SEARCH_CANCELLED);

    const canUseWorkers = typeof Worker !== 'undefined' && total > 0;
    if (!canUseWorkers) {
        const { calculateStrategySearch } = await import('../projection');
        return calculateStrategySearch(params, configs, {
            iterations: opts.iterations,
            onProgress: (done) => opts.onProgress?.({ done, total }),
        });
    }

    const shards = shardContiguous(configs, nWorkers).filter((s) => s.length > 0);
    const workers: Worker[] = [];
    const perShardDone = new Array(shards.length).fill(0);
    const perShardResults: (ConfigResult[] | null)[] = new Array(shards.length).fill(null);
    let resolvedIterations = opts.iterations ?? 1000;

    const emitProgress = () => {
        const done = perShardDone.reduce((s, d) => s + d, 0);
        opts.onProgress?.({ done, total });
    };

    return new Promise<StrategySearchResult>((resolve, reject) => {
        // Watchdog = écart MAX sans progrès (réarmé à chaque heartbeat), pas la durée
        // totale. Le heartbeat tire tous les ~5% d'itérations (sub-seconde en nominal),
        // donc 15 min est une marge de sécurité : ne coupe jamais une recherche longue
        // ni un onglet mis en arrière-plan (timers throttlés par le navigateur).
        const IDLE_MS = 15 * 60_000; // 15 min sans aucun progrès = vrai hang
        let settled = false;
        const watchdogs: ReturnType<typeof setTimeout>[] = [];

        const cleanupAll = () => {
            for (const w of watchdogs) clearTimeout(w);
            for (const w of workers) w.terminate();
            signal?.removeEventListener('abort', onAbort);
        };
        const fail = (err: Error) => {
            if (settled) return;
            settled = true;
            cleanupAll();
            reject(err);
        };
        // Annulation utilisateur : termine immédiatement tous les workers du pool.
        function onAbort() { fail(new Error(SEARCH_CANCELLED)); }
        if (signal) {
            if (signal.aborted) { fail(new Error(SEARCH_CANCELLED)); return; }
            signal.addEventListener('abort', onAbort);
        }
        const tryResolve = () => {
            if (settled) return;
            if (perShardResults.some((r) => r === null)) return;
            settled = true;
            cleanupAll();
            const results = perShardResults.flatMap((r) => r ?? []);
            resolve({ results, iterations: resolvedIterations });
        };

        shards.forEach((shard, k) => {
            let worker: Worker;
            try {
                worker = new Worker(new URL('../projection.worker.ts', import.meta.url), { type: 'module' });
            } catch (err) {
                fail(new Error('Pool worker indisponible: ' + String(err)));
                return;
            }
            workers.push(worker);

            const armWatchdog = () => {
                clearTimeout(watchdogs[k]);
                watchdogs[k] = setTimeout(
                    () => fail(new Error(`Recherche: worker ${k} sans progrès depuis ${IDLE_MS}ms`)),
                    IDLE_MS,
                );
            };
            const onMessage = (e: MessageEvent) => {
                if (!e.data || e.data.__requestId !== k) return;
                if (e.data.__progress) {
                    perShardDone[k] = e.data.__progress.done;
                    emitProgress();
                    armWatchdog();
                    return;
                }
                if (e.data.__error) {
                    fail(new Error(`Worker ${k}: ${e.data.__error}`));
                    return;
                }
                const shardResult = e.data.result as StrategySearchResult;
                perShardResults[k] = shardResult.results;
                resolvedIterations = shardResult.iterations;
                perShardDone[k] = shard.length;
                emitProgress();
                tryResolve();
            };
            worker.addEventListener('message', onMessage);
            worker.addEventListener('error', (e) => fail(new Error(`Worker ${k} error: ${e.message}`)));
            worker.addEventListener('messageerror', () => fail(new Error(`Worker ${k} messageerror`)));
            armWatchdog();
            worker.postMessage({
                __requestId: k,
                params,
                mode: 'strategySearch',
                configs: shard,
                iterations: opts.iterations,
            });
        });
    });
}
