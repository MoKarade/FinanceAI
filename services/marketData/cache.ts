// §7.F.1 — Cache TTL en mémoire pour les appels marketData.
// Pas de localStorage : on veut un cache rapide qui s'invalide au refresh
// pour garder des données fraîches. Si besoin de persistence cross-session,
// upgrade futur vers IndexedDB.

interface CachedEntry<T> {
    value: T;
    expiresAt: number;
}

const TTL_PRESETS = {
    /** Quote spot : 5 min (variations rapides). */
    quote: 5 * 60 * 1000,
    /** Historique : 1h (recalcul rare). */
    history: 60 * 60 * 1000,
    /** Profil statique : 24h (très rarement changeant). */
    profile: 24 * 60 * 60 * 1000,
    /** Dividendes : 6h. */
    dividends: 6 * 60 * 60 * 1000,
} as const;

export type CacheBucket = keyof typeof TTL_PRESETS;

const store = new Map<string, CachedEntry<unknown>>();

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
    const cached = store.get(cacheKey) as CachedEntry<T> | undefined;
    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }
    const value = await fetcher();
    if (value !== null) {
        store.set(cacheKey, {
            value,
            expiresAt: Date.now() + TTL_PRESETS[bucket],
        });
    }
    return value;
}

/** Invalidation manuelle (pour tests + refresh forcé). */
export function clearMarketDataCache(bucket?: CacheBucket): void {
    if (!bucket) {
        store.clear();
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
