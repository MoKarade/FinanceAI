// Couche de persistance IndexedDB pour le cache marketData (prix historiques,
// profils, dividendes). Les prix PASSÉS sont quasi-immuables — les persister
// évite de re-fetcher Finnhub à chaque rechargement de page (vitesse + économie
// de rate-limit sur le palier gratuit 60 req/min).
//
// Best-effort : si IndexedDB est indisponible (jsdom/tests/SSR), toutes les
// opérations sont des no-op et le cache mémoire reste seul (comportement
// historique, zéro régression).

const DB_NAME = 'financeai-marketcache';
const STORE_NAME = 'entries';
const DB_VERSION = 1;

interface PersistedRow<T> {
    key: string;
    value: T;
    expiresAt: number;
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB indisponible'));
            return;
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            }
        };
    });
}

/** Lit une entrée persistée. Retourne null si absente, expirée gérée par l'appelant. */
export async function idbGetEntry<T>(key: string): Promise<{ value: T; expiresAt: number } | null> {
    if (typeof indexedDB === 'undefined') return null;
    try {
        const db = await openDB();
        return await new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(key);
            req.onsuccess = () => {
                db.close();
                const row = req.result as PersistedRow<T> | undefined;
                resolve(row ? { value: row.value, expiresAt: row.expiresAt } : null);
            };
            req.onerror = () => { db.close(); resolve(null); };
        });
    } catch {
        return null;
    }
}

/** Écrit une entrée persistée (best-effort, n'échoue jamais bruyamment). */
export async function idbSetEntry<T>(key: string, entry: { value: T; expiresAt: number }): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
        const db = await openDB();
        await new Promise<void>((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const row: PersistedRow<T> = { key, value: entry.value, expiresAt: entry.expiresAt };
            tx.objectStore(STORE_NAME).put(row);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); resolve(); };
        });
    } catch {
        // best-effort : un échec de persistance ne doit pas casser le fetch.
    }
}

/** Vide tout le cache persisté (refresh forcé). */
export async function idbClearEntries(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
        const db = await openDB();
        await new Promise<void>((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).clear();
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); resolve(); };
        });
    } catch {
        // best-effort
    }
}
