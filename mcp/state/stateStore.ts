// mcp/state/stateStore.ts
//
// Lot 2 — `StateStore` : lecture (cache court, comme Lot 1) + ÉCRITURE. Les tools
// d'écriture lisent l'état, le modifient, puis `save()` persiste ET rafraîchit le
// cache pour que les lectures suivantes voient le nouvel état. La source d'écriture
// (fichier local maintenant, Drive ensuite) est abstraite via WritableStateSource.

import type { AppState } from '../../types';
import {
    loadAppStateFromSource,
    parseRawToAppState,
    isWritableSource,
    type StateSource,
    type StateVersion,
} from './loadAppState';
import type { SaveResult } from './writeAppState';
import { DEFAULT_STATE_TTL_MS } from './stateProvider';
import { sanitizePersonaArtifacts } from '../../services/personaSanitizer';

export interface StateStore {
    /** Lecture (avec cache court de session). */
    get(): Promise<AppState>;
    /**
     * [MCP-WRITE-VERSION-TOKEN] Lecture + jeton de version pour l'OCC des writers : passe `version` à
     * `save(next, version)` pour refuser un write dont la base a été écrasée entre-temps. Les tools de
     * LECTURE gardent `get()` (jeton non requis).
     */
    getWithVersion(): Promise<{ state: AppState; version: StateVersion }>;
    /**
     * Écrit le nouvel état (sauvegarde + atomique) et rafraîchit le cache. `expectedVersion` (optionnel) :
     * si fourni, l'écriture est refusée en cas de conflit de concurrence (OCC per-call).
     */
    save(next: AppState, expectedVersion?: StateVersion): Promise<SaveResult>;
    /** La source configurée sait-elle écrire ? (fichier = oui ; aucune source = non). */
    readonly canWrite: boolean;
}

export function makeStateStore(
    source: StateSource | null,
    opts?: { ttlMs?: number; now?: () => number },
): StateStore {
    const ttl = opts?.ttlMs ?? DEFAULT_STATE_TTL_MS;
    const now = opts?.now ?? (() => Date.now());
    let cache: { state: AppState; at: number; version: StateVersion } | null = null;

    /** Désinfecte + journalise la purge persona (ceinture MCP). Partagé lecture nue / versionnée. */
    const sanitize = (raw: AppState): AppState => {
        // [PERSONA-PURGE] Ceinture MCP : un blob Drive/fichier HISTORIQUE peut encore porter des
        // artefacts de persona de test (fuite d'avant les gardes navigateur, appareil jamais
        // rouvert) → sans ce filtre, les tools résument des données CONTAMINÉES à Claude et
        // save() re-perpétue la pollution (finding panel 2026-07-15). Lecture désinfectée =
        // toutes les écritures dérivées le sont aussi. NB : le connecteur ne voit jamais un
        // état de MODE TEST (shouldPush le coupe côté app) → pas de skip isTestMode requis ici.
        const { state, report } = sanitizePersonaArtifacts(raw);
        if (report.removedTotal > 0) {
            console.error(`[PERSONA-PURGE] stateStore : ${report.removedTotal} artefact(s) de persona de test ignorés à la lecture (${Object.entries(report.bySlice).map(([k, v]) => `${k}:${v}`).join(', ')})`);
        }
        return state;
    };

    const requireSource = (): StateSource => {
        if (!source) {
            throw new Error(
                "Aucune source d'état FinanceAI. Demande à l'utilisateur de dire « connecte mes finances » " +
                '(j\'ouvrirai le consentement Google Drive via le tool connect_drive), ou configure ' +
                '$FINANCEAI_STATE_FILE (export JSON local).',
            );
        }
        return source;
    };

    const getWithVersion = async (): Promise<{ state: AppState; version: StateVersion }> => {
        const src = requireSource();
        const t = now();
        if (cache && t - cache.at < ttl) return { state: cache.state, version: cache.version };
        // [MCP-WRITE-VERSION-TOKEN] Lecture ATOMIQUE raw+version quand la source la fournit (Drive) →
        // le jeton correspond EXACTEMENT à l'état lu. Sinon (fichier local) : version null, pas d'OCC.
        let state: AppState;
        let version: StateVersion = null;
        const versioned = (src as Partial<import('./loadAppState').WritableStateSource>).loadRawVersioned;
        if (typeof versioned === 'function') {
            const r = await versioned.call(src);
            state = sanitize(parseRawToAppState(r.raw, src.description));
            version = r.version;
        } else {
            state = sanitize(await loadAppStateFromSource(src));
        }
        cache = { state, at: t, version };
        return { state, version };
    };

    const get = async (): Promise<AppState> => (await getWithVersion()).state;

    const save = async (next: AppState, expectedVersion?: StateVersion): Promise<SaveResult> => {
        if (!isWritableSource(source)) {
            throw new Error(
                "La source d'état n'est pas inscriptible (lecture seule). En mode stdio, " +
                "$FINANCEAI_STATE_FILE doit pointer vers un fichier accessible en écriture.",
            );
        }
        try {
            const res = await source.saveState(next, expectedVersion);
            // Le cache reflète immédiatement l'écriture, AVEC le nouveau jeton retourné par la source
            // (sinon un 2ᵉ write dans la même session repartirait de l'ancien jeton → faux conflit).
            cache = { state: next, at: now(), version: res.version ?? null };
            return res;
        } catch (err) {
            // Échec d'écriture (dont CONFLIT de concurrence Drive : le blob a avancé entre-temps) →
            // le cache est suspect (il peut porter l'état PÉRIMÉ qui a causé le conflit). On
            // l'invalide pour que le prochain get() relise la source fraîche — c'est ce qui rend
            // le « relance le tool » du message de conflit réellement efficace.
            cache = null;
            throw err;
        }
    };

    return { get, getWithVersion, save, canWrite: isWritableSource(source) };
}
