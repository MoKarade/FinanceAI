// mcp/state/stateProvider.ts
//
// Lot 1 — fabrique le `StateProvider` injecté aux tools data-aware, à partir
// d'une `StateSource`. Ajoute un CACHE mémoire de session court (TTL) pour éviter
// de relire la source à chaque tool d'une même conversation (cf design §3 :
// « cache mémoire court par session »). Le cache est volontairement simple ;
// le loader Drive (Lot 3) réutilisera cette même fabrique.

import type { AppState } from '../../types';
import { loadAppStateFromSource, type StateSource } from './loadAppState';
import type { StateProvider } from '../tools/_dataAware';

/** TTL par défaut du cache d'état (ms). 30 s = compromis fraîcheur / latence. */
export const DEFAULT_STATE_TTL_MS = 30_000;

/**
 * Construit un `StateProvider` à partir d'une source. Si `source` est null
 * (aucune source configurée), le provider lève une Error claire — les tools
 * data-aware la présentent proprement (« configure ta source d'état »), tandis
 * que les tools sans état restent utilisables.
 */
export function makeStateProvider(
    source: StateSource | null,
    opts?: { ttlMs?: number; now?: () => number },
): StateProvider {
    const ttl = opts?.ttlMs ?? DEFAULT_STATE_TTL_MS;
    const now = opts?.now ?? (() => Date.now());
    let cache: { state: AppState; at: number } | null = null;

    return async (): Promise<AppState> => {
        if (!source) {
            throw new Error(
                "Aucune source d'état configurée. En mode stdio, renseigne $FINANCEAI_STATE_FILE " +
                "(chemin d'un export JSON de ton état FinanceAI).",
            );
        }
        const t = now();
        if (cache && t - cache.at < ttl) return cache.state;
        const state = await loadAppStateFromSource(source);
        cache = { state, at: t };
        return state;
    };
}
