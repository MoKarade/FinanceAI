// P1.3 — Backup automatique rolling dans IndexedDB.
//
// Stratégie :
//   - 1 backup créé automatiquement par jour (vérifié au boot)
//   - Rolling buffer 7 jours (les plus vieux supprimés)
//   - Chaque backup contient le snapshot complet du localStorage `financeai-storage`
//   - Stockés dans IndexedDB (50 MB+ vs ~5 MB pour localStorage)
//   - S-A : payload CHIFFRÉ au repos (AES-GCM, clé de device non-extractible
//     partagée avec secureKeyStore). Les anciens backups en clair restent
//     restaurables. Dégradation propre en clair si la crypto est indisponible.
//
// API :
//   - initAutoBackup()       — à appeler au boot, fait le check daily
//   - createBackupNow()      — manuel, pour bouton "Backup maintenant"
//   - listBackups()          — pour afficher dans Settings/Système
//   - restoreBackup(id)      — restaure un backup, recharge la page
//   - deleteBackup(id)
//   - clearAllBackups()

import { getOrCreateDeviceKey, encryptJson, decryptJson } from './secureKeyStore';
import { logError } from './errorLogger';

// Tier 🟡 — n'avertir qu'UNE fois par session que les backups tombent en clair
// (les auto-backups sont périodiques : éviter de spammer le log borné).
let _cleartextBackupWarned = false;

const DB_NAME = 'financeai-backups';
const STORE_NAME = 'backups';
const DB_VERSION = 1;
const MAX_DAILY_BACKUPS = 7;
const STORE_KEY_LOCALSTORAGE = 'financeai-storage';

export interface BackupEntry {
    id: string;
    timestamp: number;
    sizeBytes: number;
    /** Snapshot du localStorage financeai-storage. Chiffré (base64 AES-GCM) si
     *  `encrypted` est vrai ; sinon JSON en clair (anciens backups). */
    payload: string;
    /** Source du backup pour debug : 'auto' (daily) ou 'manual' */
    source: 'auto' | 'manual';
    /** S-A — vrai si `payload` est chiffré avec la clé de device. Absent/false
     *  sur les anciens backups, qui restent restaurables en clair. */
    encrypted?: boolean;
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

// ─── S-A : chiffrement au repos du payload ───────────────────────────────────
// Le payload (snapshot complet : transactions, soldes, dettes, revenus = PII
// financière) était stocké EN CLAIR dans IndexedDB. On le chiffre désormais avec
// la clé de device partagée (secureKeyStore), en réutilisant encryptJson/decryptJson.
// Ces fonctions pures (clé injectée) portent la logique métier et sont testées
// sans IndexedDB — la glue IDB n'a, elle, pas de logique propre.

/** Chiffre un payload de backup (string JSON localStorage). */
export const encryptBackupPayload = (key: CryptoKey, payload: string): Promise<string> =>
    encryptJson(key, payload);

/** Déchiffre un payload de backup. Lève si clé incorrecte / blob altéré. */
export const decryptBackupPayload = (key: CryptoKey, blob: string): Promise<string> =>
    decryptJson<string>(key, blob);

export interface StoredPayload {
    payload: string;
    encrypted: boolean;
}

/**
 * Prépare la représentation à stocker : chiffrée si une clé de device est
 * disponible, sinon en clair (dégradation propre en contexte non sécurisé —
 * on préfère un backup en clair à pas de backup du tout).
 */
export async function buildStoredPayload(plaintext: string, key: CryptoKey | null): Promise<StoredPayload> {
    if (!key) return { payload: plaintext, encrypted: false };
    return { payload: await encryptBackupPayload(key, plaintext), encrypted: true };
}

/**
 * Inverse : retourne le plaintext, que l'entrée soit chiffrée (nouveau format)
 * ou en clair (ancien backup). Lève si chiffré mais clé absente (indéchiffrable).
 */
export async function readStoredPayload(
    entry: { payload: string; encrypted?: boolean },
    key: CryptoKey | null,
): Promise<string> {
    if (!entry.encrypted) return entry.payload;
    if (!key) throw new Error('Clé de device absente : backup chiffré indéchiffrable');
    return decryptBackupPayload(key, entry.payload);
}

/** Récupère la clé de device sans lever (null si crypto/IndexedDB indisponible). */
async function tryGetDeviceKey(): Promise<CryptoKey | null> {
    try {
        return await getOrCreateDeviceKey();
    } catch (e) {
        // Tier 🟡 : clé absente → buildStoredPayload tombe en clair. Avant, ce repli était
        // TOTALEMENT silencieux (backups financiers non chiffrés sans aucune trace). On
        // journalise une fois (log borné) pour que l'utilisateur/dev le sache.
        if (!_cleartextBackupWarned) {
            _cleartextBackupWarned = true;
            logError({
                source: 'storage',
                severity: 'warning',
                message: 'Crypto/IndexedDB indisponible : les backups sont stockés EN CLAIR (non chiffrés).',
                error: e instanceof Error ? e : new Error(String(e)),
            });
        }
        return null;
    }
}

/**
 * Crée un nouveau backup (manuel ou auto).
 * Retourne le BackupEntry créé, ou null si rien à sauvegarder.
 */
export async function createBackupNow(source: 'auto' | 'manual' = 'manual'): Promise<BackupEntry | null> {
    const plaintext = getCurrentPayload();
    if (!plaintext || plaintext.length === 0) return null;

    // S-A — chiffre avant stockage (clé de device). Crypto indisponible →
    // dégradation en clair pour ne pas perdre la capacité de backup.
    const deviceKey = await tryGetDeviceKey();
    const stored = await buildStoredPayload(plaintext, deviceKey);

    const entry: BackupEntry = {
        id: makeId(),
        timestamp: Date.now(),
        sizeBytes: stored.payload.length,
        payload: stored.payload,
        source,
        encrypted: stored.encrypted,
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
        // SF-1 — échec d'écriture du backup : NE PAS avaler (l'utilisateur croirait
        // être sauvegardé). On journalise via le logger borné (visible diagnostics/UI)
        // tout en gardant le contrat null (l'appelant décide quoi afficher).
        logError({ source: 'storage', severity: 'error', message: 'createBackupNow: échec écriture du backup (IndexedDB)', error: err instanceof Error ? err : new Error(String(err)) });
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
        // SF-1 — distinguer « base vide » (légitime) de « base inaccessible » : on
        // journalise l'erreur d'accès (sinon [] est indistinguable de 0 backup).
        logError({ source: 'storage', severity: 'error', message: 'listBackups: échec lecture des backups (IndexedDB)', error: err instanceof Error ? err : new Error(String(err)) });
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
        logError({ source: 'storage', severity: 'warning', message: 'deleteBackup: échec suppression du backup', error: err instanceof Error ? err : new Error(String(err)) });
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
        logError({ source: 'storage', severity: 'warning', message: 'clearAllBackups: échec du vidage des backups', error: err instanceof Error ? err : new Error(String(err)) });
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
        // S-A — déchiffre (si besoin) AVANT toute écriture : un backup
        // indéchiffrable lève ici → catch → false, sans rien écraser.
        const deviceKey = await tryGetDeviceKey();
        const plaintext = await readStoredPayload(entry, deviceKey);
        // Backup la version actuelle d'abord (insurance)
        await createBackupNow('manual');
        // Restaure
        localStorage.setItem(STORE_KEY_LOCALSTORAGE, plaintext);
        // Reload pour rehydrater
        if (typeof window !== 'undefined') window.location.reload();
        return true;
    } catch (err) {
        // SF-1 — échec de restauration (déchiffrement ou écriture) : critique pour
        // l'utilisateur qui attend ses données. Journalisé en 'error', contrat false gardé.
        logError({ source: 'storage', severity: 'error', message: 'restoreBackup: échec de la restauration du backup', error: err instanceof Error ? err : new Error(String(err)) });
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
        logError({ source: 'storage', severity: 'warning', message: 'initAutoBackup: échec du backup quotidien automatique', error: err instanceof Error ? err : new Error(String(err)) });
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
