// mcp/state/stateStore.ts
//
// Lot 2 — `StateStore` : lecture (cache court, comme Lot 1) + ÉCRITURE. Les tools
// d'écriture lisent l'état, le modifient, puis `save()` persiste ET rafraîchit le
// cache pour que les lectures suivantes voient le nouvel état. La source d'écriture
// (fichier local maintenant, Drive ensuite) est abstraite via WritableStateSource.

import type { AppState } from '../../types';
import {
    loadAppStateFromSource,
    isWritableSource,
    type StateSource,
} from './loadAppState';
import type { SaveResult } from './writeAppState';
import { DEFAULT_STATE_TTL_MS } from './stateProvider';

export interface StateStore {
    /** Lecture (avec cache court de session). */
    get(): Promise<AppState>;
    /** Écrit le nouvel état (sauvegarde + atomique) et rafraîchit le cache. */
    save(next: AppState): Promise<SaveResult>;
    /** La source configurée sait-elle écrire ? (fichier = oui ; aucune source = non). */
    readonly canWrite: boolean;
}

export function makeStateStore(
    source: StateSource | null,
    opts?: { ttlMs?: number; now?: () => number },
): StateStore {
    const ttl = opts?.ttlMs ?? DEFAULT_STATE_TTL_MS;
    const now = opts?.now ?? (() => Date.now());
    let cache: { state: AppState; at: number } | null = null;

    const get = async (): Promise<AppState> => {
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

    const save = async (next: AppState): Promise<SaveResult> => {
        if (!isWritableSource(source)) {
            throw new Error(
                "La source d'état n'est pas inscriptible (lecture seule). En mode stdio, " +
                "$FINANCEAI_STATE_FILE doit pointer vers un fichier accessible en écriture.",
            );
        }
        const res = await source.saveState(next);
        cache = { state: next, at: now() }; // le cache reflète immédiatement l'écriture
        return res;
    };

    return { get, save, canWrite: isWritableSource(source) };
}
