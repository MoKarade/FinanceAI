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
    StrategyConfig,
    StrategySearchResult,
    ConfigResult,
} from '../projection';
import { logError } from '../errorLogger';

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
            logError({ source: 'projection', severity: 'warning', message: `Worker projection en erreur (recréation au prochain appel): ${e.message}` });
            _workerDead = true;
        });
        return _worker;
    } catch (err) {
        logError({ source: 'projection', severity: 'warning', message: 'Worker projection indisponible (CSP/MIME?), fallback synchrone', error: err });
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
    // [UI-SCEN] — types de scénarios demandés explicitement (panneau stress-tests).
    onlyStratTypes?: string[];
}

/**
 * F3 (audit 2026-05-28) — reconstruit une Error depuis le payload d'erreur du worker
 * en réattachant la stack d'origine. Sans ça, `new Error(__error)` repart d'une stack
 * pointant ici (runAsync) au lieu du vrai site du crash dans le worker → debug aveugle.
 */
export function reconstructWorkerError(
    data: { __error?: string; __errorStack?: string },
    prefix = '',
): Error {
    const err = new Error(prefix + (data.__error ?? 'Worker error'));
    if (data.__errorStack) err.stack = data.__errorStack;
    return err;
}

/**
 * Exécute calculateFutureProjection de manière asynchrone via Web Worker
 * si disponible. Fallback synchrone autrement (Node, tests).
 *
 * Chaque appel reçoit un requestId unique; le listener ne résout la Promise
 * que sur le message correspondant — évite la confusion lors d'appels rapides
 * concurrents (toggle MC, debounce, params qui changent).
 */
// PH2-b (clé de voûte) — dédup des requêtes IDENTIQUES en vol. Si on quitte l'onglet Futur
// pendant un calcul MC puis on revient (remount → re-requête des MÊMES params), on RE-RACCROCHE
// à la promesse déjà en vol au lieu d'en relancer une seconde : la projection « reprend où elle
// en était » (un seul calcul worker, résultat dispo plus tôt). La clé EFFECTIVE combine la
// signature de contenu fournie par l'appelant (dedupKey) ET les discriminants du calcul
// (runMC/selectedIdx/onlyStratTypes) → deux appels ne se raccrochent que s'ils calculent VRAIMENT
// la même chose. L'entrée est vidée à la résolution. Sans dedupKey (appels hors-UI : MCP, tests),
// comportement strictement inchangé.
const _inflight = new Map<string, Promise<ProjectionResult>>();

// NON-async VOLONTAIREMENT : on doit retourner la MÊME référence de promesse pour la dédup
// (un `async function` envelopperait `return existing` dans une nouvelle promesse → identité
// perdue → re-raccrochage cassé). Le corps n'a aucun `await`, il relaie la promesse de
// computeProjectionAsync.
/** Erreur sentinelle : la projection a été annulée par l'appelant (pas un échec). */
export const PROJECTION_CANCELLED = '__PROJECTION_CANCELLED__';

export function runProjectionAsync(
    params: SimulationParams,
    runMC: boolean = false,
    selectedIdx: number = 0,
    onlyStratTypes?: string[],
    dedupKey?: string,
    opts?: { signal?: AbortSignal },
): Promise<ProjectionResult> {
    // [HARDEN-SNAPSHOT-RACE] Abort sur le chemin « projection simple », parité avec la recherche de
    // stratégies (qui a son AbortSignal depuis toujours). Déjà annulé à l'entrée ⇒ on ne lance RIEN
    // et on ne touche pas à la dédup : une requête identique déjà en vol pour d'autres appelants vit
    // sa vie, et un appel légitime suivant recréera la sienne.
    const signal = opts?.signal;
    if (signal?.aborted) return Promise.reject(new Error(PROJECTION_CANCELLED));
    // Clé EFFECTIVE = dedupKey (signature de contenu de l'appelant) + TOUT ce qui distingue le
    // calcul. Sans ça, un futur appelant réutilisant la même dedupKey avec un runMC/selectedIdx
    // différent recevrait SILENCIEUSEMENT la projection de l'autre mode (re-raccrochage à la
    // mauvaise promesse). On encode donc le mode dans la clé, côté wrapper → aucun appelant à blinder.
    const key = dedupKey
        ? `${dedupKey}|mc=${runMC}|idx=${selectedIdx}|st=${onlyStratTypes ? onlyStratTypes.join(',') : ''}`
        : undefined;
    if (key) {
        const existing = _inflight.get(key);
        if (existing) return existing;
    }
    const promise = computeProjectionAsync(params, runMC, selectedIdx, onlyStratTypes);
    if (key) {
        _inflight.set(key, promise);
        // Vide l'entrée à la résolution (succès OU échec), sans écraser une requête plus récente.
        // `.then(clear, clear)` (PAS `.finally().catch()`) : le 2e handler ABSORBE le rejet de cette
        // branche interne → aucun « unhandled rejection » (le rejet user-facing reste géré par l'appelant).
        const clearInflight = () => { if (_inflight.get(key) === promise) _inflight.delete(key); };
        promise.then(clearInflight, clearInflight);
    }
    if (!signal) return promise;

    // ⚠️ L'abort s'applique à une promesse DÉRIVÉE, jamais à la promesse PARTAGÉE de `_inflight` :
    // deux appelants peuvent être raccrochés au même calcul (dédup PH2-b) — celui qui annule ne doit
    // pas rejeter la promesse de l'autre. Le calcul lui-même n'est PAS interrompu : le worker
    // singleton est un canal partagé (le terminer tuerait les requêtes des autres) ; son message
    // tardif est simplement ignoré (filtre par requestId). Annuler = se DÉTACHER, comme un
    // `removeEventListener` — pas tirer sur le canal.
    return new Promise<ProjectionResult>((resolve, reject) => {
        const onAbort = () => reject(new Error(PROJECTION_CANCELLED));
        signal.addEventListener('abort', onAbort, { once: true });
        // `then(resolve, reject)` garde la promesse sous-jacente HANDLED même après un abort : un
        // rejet tardif (timeout worker) atterrit dans un `reject` déjà réglé — no-op, pas
        // d'« unhandled rejection ». Le listener est retiré au règlement (signal potentiellement
        // long-vécu côté appelant : ne pas y accumuler un listener par requête).
        const settle = () => signal.removeEventListener('abort', onAbort);
        promise.then(
            (v) => { settle(); resolve(v); },
            (e) => { settle(); reject(e); },
        );
    });
}

async function computeProjectionAsync(
    params: SimulationParams,
    runMC: boolean = false,
    selectedIdx: number = 0,
    onlyStratTypes?: string[],
): Promise<ProjectionResult> {
    const worker = getWorker();
    if (!worker) {
        const { calculateFutureProjection } = await import('../projection');
        return calculateFutureProjection(params, runMC, selectedIdx, onlyStratTypes);
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
            if (e.data.__error) reject(reconstructWorkerError(e.data));
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
        const req: WorkerRequest = { __requestId: id, params, runMC, selectedIdx, onlyStratTypes };
        worker.postMessage(req);
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
 * Pool dédié (PAS le singleton `_worker` réservé à la projection) : on
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
                    fail(reconstructWorkerError(e.data, `Worker ${k}: `));
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
