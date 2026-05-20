// P1.3 — Backup automatique rolling dans IndexedDB.
//
// Stratégie :
//   - 1 backup créé automatiquement par jour (vérifié au boot)
//   - Rolling buffer 7 jours (les plus vieux supprimés)
//   - Chaque backup contient le snapshot complet du localStorage `financeai-storage`
//   - Stockés dans IndexedDB (50 MB+ vs ~5 MB pour localStorage)
//   - Pas de chiffrement par défaut (le user peut activer dans Configuration)
//
// API :
//   - initAutoBackup()       — à appeler au boot, fait le check daily
//   - createBackupNow()      — manuel, pour bouton "Backup maintenant"
//   - listBackups()          — pour afficher dans Settings/Système
//   - restoreBackup(id)      — restaure un backup, recharge la page
//   - deleteBackup(id)
//   - clearAllBackups()

const DB_NAME = 'financeai-backups';
const STORE_NAME = 'backups';
const DB_VERSION = 1;
const MAX_DAILY_BACKUPS = 7;
const STORE_KEY_LOCALSTORAGE = 'financeai-storage';

export interface BackupEntry {
    id: string;
    timestamp: number;
    sizeBytes: number;
    /** Snapshot complet (string JSON) du localStorage financeai-storage */
    payload: string;
    /** Source du backup pour debug : 'auto' (daily) ou 'manual' */
    source: 'auto' | 'manual';
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB not available'));
            return;
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

function makeId(): string {
    return `bk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getCurrentPayload(): string | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage.getItem(STORE_KEY_LOCALSTORAGE);
    } catch {
        return null;
    }
}

/**
 * Crée un nouveau backup (manuel ou auto).
 * Retourne le BackupEntry créé, ou null si rien à sauvegarder.
 */
export async function createBackupNow(source: 'auto' | 'manual' = 'manual'): Promise<BackupEntry | null> {
    const payload = getCurrentPayload();
    if (!payload || payload.length === 0) return null;

    const entry: BackupEntry = {
        id: makeId(),
        timestamp: Date.now(),
        sizeBytes: payload.length,
        payload,
        source,
    };

    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.add(entry);
            tx.oncomplete = () => {
                db.close();
                resolve(entry);
            };
            tx.onerror = () => {
                db.close();
                reject(tx.error);
            };
        });
    } catch (err) {
        console.warn('[backupAuto] createBackupNow failed:', err);
        return null;
    }
}

/** Liste tous les backups, du plus récent au plus ancien. */
export async function listBackups(): Promise<BackupEntry[]> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => {
                db.close();
                const entries = (req.result as BackupEntry[]) ?? [];
                entries.sort((a, b) => b.timestamp - a.timestamp);
                resolve(entries);
            };
            req.onerror = () => {
                db.close();
                reject(req.error);
            };
        });
    } catch (err) {
        console.warn('[backupAuto] listBackups failed:', err);
        return [];
    }
}

/** Supprime un backup par id. */
export async function deleteBackup(id: string): Promise<void> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(id);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        });
    } catch (err) {
        console.warn('[backupAuto] deleteBackup failed:', err);
    }
}

/** Vide tous les backups. */
export async function clearAllBackups(): Promise<void> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).clear();
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        });
    } catch (err) {
        console.warn('[backupAuto] clearAllBackups failed:', err);
    }
}

/**
 * Restaure un backup : écrase localStorage `financeai-storage` avec le payload
 * et déclenche un reload. ATTENTION : action destructrice.
 */
export async function restoreBackup(id: string): Promise<boolean> {
    const backups = await listBackups();
    const entry = backups.find(b => b.id === id);
    if (!entry) return false;
    try {
        if (typeof localStorage === 'undefined') return false;
        // Backup la version actuelle d'abord (insurance)
        await createBackupNow('manual');
        // Restaure
        localStorage.setItem(STORE_KEY_LOCALSTORAGE, entry.payload);
        // Reload pour rehydrater
        if (typeof window !== 'undefined') window.location.reload();
        return true;
    } catch (err) {
        console.warn('[backupAuto] restoreBackup failed:', err);
        return false;
    }
}

/**
 * Garde-fou rolling : supprime les backups au-delà des N plus récents.
 * Appelé après chaque createBackupNow auto pour respecter le quota.
 */
async function pruneOldBackups(): Promise<void> {
    const backups = await listBackups();
    const toDelete = backups.slice(MAX_DAILY_BACKUPS);
    for (const entry of toDelete) {
        await deleteBackup(entry.id);
    }
}

/**
 * À appeler au boot. Crée un backup auto si aucun n'existe dans les
 * dernières 23h (≈ 1 par jour, tolérant aux fuseaux horaires).
 */
export async function initAutoBackup(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
        const backups = await listBackups();
        const last = backups[0];
        const dayMs = 23 * 60 * 60 * 1000; // 23h tolerance
        if (!last || Date.now() - last.timestamp > dayMs) {
            await createBackupNow('auto');
            await pruneOldBackups();
        }
    } catch (err) {
        console.warn('[backupAuto] init failed:', err);
    }
}

/** Statistiques rapides pour UI. */
export async function getBackupStats(): Promise<{ count: number; totalBytes: number; oldest?: number; newest?: number }> {
    const backups = await listBackups();
    const totalBytes = backups.reduce((s, b) => s + b.sizeBytes, 0);
    return {
        count: backups.length,
        totalBytes,
        oldest: backups.length > 0 ? backups[backups.length - 1].timestamp : undefined,
        newest: backups.length > 0 ? backups[0].timestamp : undefined,
    };
}
