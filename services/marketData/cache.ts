// §7.F.1 — Cache TTL en mémoire pour les appels marketData.
// Pas de localStorage : on veut un cache rapide qui s'invalide au refresh
// pour garder des données fraîches. Si besoin de persistence cross-session,
// upgrade futur vers IndexedDB.

import { idbGetEntry, idbSetEntry, idbClearEntries, idbSweepExpired } from './persistentCache';

interface CachedEntry<T> {
    value: T;
    expiresAt: number;
}

const TTL_PRESETS = {
    /** Quote spot : 5 min (variations rapides). */
    quote: 5 * 60 * 1000,
    /** Historique : 24h. Les prix passés sont quasi-immuables → persistés en IndexedDB. */
    history: 24 * 60 * 60 * 1000,
    /** Profil statique : 24h (très rarement changeant). */
    profile: 24 * 60 * 60 * 1000,
    /** Dividendes : 6h. */
    dividends: 6 * 60 * 60 * 1000,
} as const;

export type CacheBucket = keyof typeof TTL_PRESETS;

const store = new Map<string, CachedEntry<unknown>>();
let sweepScheduled = false;

// Buckets persistés en IndexedDB (survivent au rechargement de page).
// 'quote' (spot 5 min) reste mémoire-seule : on le veut toujours frais.
const PERSISTENT_BUCKETS = new Set<CacheBucket>(['history', 'profile', 'dividends']);

function k(bucket: CacheBucket, key: string): string {
    return `${bucket}::${key}`;
}

/**
 * Wrapper : retourne la valeur cachée si fraîche, sinon fetch + cache.
 * Si fetch fail, retourne null sans cacher (re-try possible).
 */
export async function withCache<T>(
    bucket: CacheBucket,
    key: string,
    fetcher: () => Promise<T | null>,
): Promise<T | null> {
    const cacheKey = k(bucket, key);

    // L1 — cache mémoire (rapide, synchrone).
    const cached = store.get(cacheKey) as CachedEntry<T> | undefined;
    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }

    // L2 — cache IndexedDB persistant (buckets lents seulement). No-op si IDB absent.
    if (PERSISTENT_BUCKETS.has(bucket)) {
        // Balayage UNIQUE par session des lignes expirées (les clés d'historique tournent chaque
        // jour → sans sweep, croissance IDB à vie maintenant que le cache survit aux reloads).
        if (!sweepScheduled) {
            sweepScheduled = true;
            void idbSweepExpired();
        }
        const persisted = await idbGetEntry<T>(cacheKey);
        if (persisted && persisted.expiresAt > Date.now()) {
            store.set(cacheKey, persisted); // réhydrate L1
            return persisted.value;
        }
    }

    const value = await fetcher();
    if (value !== null) {
        const entry: CachedEntry<T> = { value, expiresAt: Date.now() + TTL_PRESETS[bucket] };
        store.set(cacheKey, entry);
        if (PERSISTENT_BUCKETS.has(bucket)) {
            void idbSetEntry(cacheKey, entry); // fire-and-forget, best-effort
        }
    }
    return value;
}

/** Invalidation manuelle (pour tests + refresh forcé). */
export function clearMarketDataCache(bucket?: CacheBucket): void {
    if (!bucket) {
        store.clear();
        void idbClearEntries();
        return;
    }
    const prefix = `${bucket}::`;
    for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key);
    }
}

/** Pour les tests : inspecte la taille du cache. */
export function getCacheSize(): number {
    return store.size;
}
