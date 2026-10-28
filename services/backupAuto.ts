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
import { sanitizePersistEnvelope } from './personaSanitizer';

// Tier 🟡 — n'avertir qu'UNE fois par session que les backups tombent en clair
// (les auto-backups sont périodiques : éviter de spammer le log borné).
let _cleartextBackupWarned = false;

const DB_NAME = 'financeai-backups';
import { STORAGE_KEYS } from '../utils/storageKeys';
const STORE_NAME = 'backups';
const DB_VERSION = 1;
const MAX_DAILY_BACKUPS = 7;
const STORE_KEY_LOCALSTORAGE = STORAGE_KEYS.persistStore;

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
    /** Vrai si le snapshot a été pris pendant que l'app tournait sur des données FICTIVES
     *  (mode test / bac à sable). Additif et optionnel : absent sur tous les backups
     *  antérieurs, qui sont donc réels — c'est la lecture juste, pas un repli commode.
     *  ⚠️ Il n'existe QUE parce qu'un backup-FILET reste créé en mode fictif (cf `BackupIntent`
     *  plus bas) : sans lui, une entrée fictive serait indiscernable d'une vraie dans la liste
     *  des sauvegardes, et restaurable des mois plus tard en croyant restaurer son dossier. */
    testMode?: boolean;
}

/**
 * POURQUOI une intention, alors que `source: 'auto' | 'manual'` existe déjà.
 *
 * `source` dit QUI a déclenché, pas À QUOI ça sert — et les deux ne coïncident pas : mesuré, sur
 * les cinq sites qui appellent `createBackupNow`, `restoreBackup` passe `'manual'` pour un filet
 * et `writeExecutor`/`syncPull` passent `'auto'` pour un filet aussi. Un même drapeau recouvrait
 * donc deux faits OPPOSÉS vis-à-vis des données fictives
 * (`UN-BOOLEEN-QUI-RECOUVRE-DEUX-FAITS-OPPOSES-SE-CORRIGE-EN-LES-SEPARANT`).
 *
 * ⚠️ La distinction n'est pas cosmétique : refuser TOUS les backups en mode fictif casserait
 * trois protections d'un coup. `services/aiTools/writeExecutor.ts` écrit en toutes lettres que
 * « le filet est la condition de l'écriture » — un refus y interdirait à l'assistant toute
 * écriture dans le bac à sable, c'est-à-dire l'usage même que le bac à sable sert ;
 * `services/sync/syncPull.ts` journaliserait « restauration SANS filet » à chaque pull, et un
 * avertissement permanent est un avertissement mort ; `restoreBackup` perdrait le sien.
 */
export type BackupIntent =
    /** Archiver l'état pour le retrouver plus tard (quotidien du boot, bouton « Sauvegarder
     *  maintenant »). Archiver du FICTIF est au mieux inutile, au pire trompeur → REFUSÉ. */
    | 'archive'
    /** Filet posé juste avant une opération destructive, pour pouvoir l'annuler. Ce qu'il
     *  protège est l'opération QUI SUIT, pas la valeur des données → JAMAIS refusé, même
     *  fictif ; marqué `testMode` à la place. */
    | 'filet';

/** Ce que `createBackupNow` a fait. Une union plutôt qu'un `null` : « refusé par règle » et
 *  « l'écriture a échoué » appellent des réactions OPPOSÉES chez l'appelant, et les confondre
 *  rendait l'écran muet (`UN-SERVICE-QUI-REND-LA-MEME-VALEUR-POUR-N-SITUATIONS-REND-SON-ECRAN-MUET`). */
export type BackupResultat =
    | { ok: true; entry: BackupEntry }
    /** Règle métier : on n'archive pas des données fictives. Rien n'est cassé, rien à réparer. */
    | { ok: false; cause: 'donnees-fictives' }
    /** Rien à sauvegarder (localStorage vide/absent). */
    | { ok: false; cause: 'rien-a-sauvegarder' }
    /** L'écriture IndexedDB a échoué — déjà journalisé. */
    | { ok: false; cause: 'echec-ecriture' };

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
const encryptBackupPayload = (key: CryptoKey, payload: string): Promise<string> =>
    encryptJson(key, payload);

/** Déchiffre un payload de backup. Lève si clé incorrecte / blob altéré. */
const decryptBackupPayload = (key: CryptoKey, blob: string): Promise<string> =>
    decryptJson<string>(key, blob);

interface StoredPayload {
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
export async function createBackupNow(
    source: 'auto' | 'manual',
    /**
     * ⚠️ REQUIS, les deux champs. Optionnels, un appelant qui les oublie retomberait en silence
     * sur « archive d'un dossier réel » — c'est-à-dire exactement le cas qu'on veut interdire,
     * et sans rien de rouge. Requis, le compilateur énumère les sites à chaque ajout.
     * `donneesFictives` est PASSÉ, jamais lu ici : ce module ne connaît pas le store (il lit
     * `localStorage` brut), et l'y faire entrer élargirait le graphe d'imports de tout ce qui
     * monte le boot (`UN-IMPORT-DANS-LA-COUCHE-SERVICES-ELARGIT-LE-CONTRAT-DE-MOCK-DE-TOUS-LES-MONTAGES`).
     * C'est la forme déjà retenue par `shouldPush(localIsEmpty, isTestMode)`.
     */
    opts: { intent: BackupIntent; donneesFictives: boolean },
): Promise<BackupResultat> {
    // Règle : on n'ARCHIVE pas des données fictives. Le filet, lui, passe toujours — voir
    // `BackupIntent`, qui dit pourquoi les deux ne peuvent pas partager la même décision.
    if (opts.intent === 'archive' && opts.donneesFictives) {
        return { ok: false, cause: 'donnees-fictives' };
    }
    const plaintext = getCurrentPayload();
    if (!plaintext || plaintext.length === 0) return { ok: false, cause: 'rien-a-sauvegarder' };

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
        // Seul un FILET peut arriver ici avec des données fictives (l'archive a été refusée
        // plus haut). On le MARQUE : la liste des sauvegardes le montrera, et la restauration
        // pourra prévenir. ⚠️ `false` explicite plutôt qu'omis quand c'est réel — un champ absent
        // veut dire « ce backup est antérieur au marquage », pas « il est réel ».
        testMode: opts.donneesFictives,
    };

    try {
        const db = await openDB();
        // [BACKUP-PROMISE-CATCH] `await` la promesse AVANT de la retourner : sinon un rejet ASYNC
        // (tx.onerror IndexedDB, ex. quota) passe au caller SANS être journalisé par le catch ci-dessous
        // (l'utilisateur croirait être sauvegardé). L'await ramène le rejet dans ce catch → logué + null.
        return await new Promise<BackupResultat>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.add(entry);
            tx.oncomplete = () => {
                db.close();
                resolve({ ok: true, entry });
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
        return { ok: false, cause: 'echec-ecriture' };
    }
}

/** Liste tous les backups, du plus récent au plus ancien. */
export async function listBackups(): Promise<BackupEntry[]> {
    try {
        const db = await openDB();
        // [BACKUP-PROMISE-CATCH] `await` : un rejet async (req.onerror) doit repasser par le catch ci-dessous
        // (sinon il fuit non journalisé jusqu'au caller — restoreBackup appelle listBackups HORS de son try).
        return await new Promise((resolve, reject) => {
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
        return await new Promise((resolve, reject) => { // [BACKUP-PROMISE-CATCH] rejet async → catch
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
        return await new Promise((resolve, reject) => { // [BACKUP-PROMISE-CATCH] rejet async → catch
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
export async function restoreBackup(id: string, donneesFictives: boolean): Promise<boolean> {
    const backups = await listBackups();
    const entry = backups.find(b => b.id === id);
    if (!entry) return false;
    try {
        if (typeof localStorage === 'undefined') return false;
        // S-A — déchiffre (si besoin) AVANT toute écriture : un backup
        // indéchiffrable lève ici → catch → false, sans rien écraser.
        const deviceKey = await tryGetDeviceKey();
        const plaintext = await readStoredPayload(entry, deviceKey);
        // Backup la version actuelle d'abord (insurance). C'est un FILET, malgré `'manual'` :
        // il existe pour pouvoir annuler la restauration qui suit, pas pour archiver. Il passe
        // donc même sur des données fictives — le refuser retirerait la protection à l'instant
        // précis où elle sert.
        await createBackupNow('manual', { intent: 'filet', donneesFictives });
        // [PERSONA-PURGE] Un backup HISTORIQUE peut contenir des artefacts de persona de test
        // (fuite d'avant les gardes) → désinfection avant restauration (skip auto si le backup
        // est un état de mode test légitime). Parse best-effort : illisible → restauré tel quel
        // (le self-heal du boot rattrapera après le reload).
        let toRestore = plaintext;
        try {
            const { envelope, report } = sanitizePersistEnvelope(JSON.parse(plaintext));
            if (report.removedTotal > 0) {
                logError({
                    source: 'storage', severity: 'warning',
                    message: `restoreBackup : ${report.removedTotal} artefact(s) de persona retirés du backup avant restauration`,
                });
                toRestore = JSON.stringify(envelope);
            }
        } catch (e) {
            // Backup au contenu NON-JSON = corruption réelle — à ne JAMAIS avaler (finding
            // silent-failure 2026-07-15) : on journalise l'origine AVANT que l'hydratation
            // Zustand n'échoue en aval sans cause visible. On restaure quand même tel quel
            // (contrat existant : le boot self-heal/migration tentera de récupérer).
            logError({ source: 'storage', severity: 'error', message: 'restoreBackup: backup illisible (JSON invalide) — restauré tel quel, cause probable de l\'état vide au reboot', error: e instanceof Error ? e : new Error(String(e)) });
        }
        // Restaure
        localStorage.setItem(STORE_KEY_LOCALSTORAGE, toRestore);
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
export async function initAutoBackup(donneesFictives: boolean): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
        const backups = await listBackups();
        const last = backups[0];
        const dayMs = 23 * 60 * 60 * 1000; // 23h tolerance
        if (!last || Date.now() - last.timestamp > dayMs) {
            // ARCHIVE : refusée en données fictives, et c'est un silence VOULU — ce chemin
            // tourne tout seul au boot, une alerte y parlerait à chaque démarrage du bac à
            // sable sans que personne n'ait rien demandé (un avertissement permanent est un
            // avertissement mort). Le refus reste lisible : aucune entrée neuve n'apparaît.
            const r = await createBackupNow('auto', { intent: 'archive', donneesFictives });
            if (!r.ok && r.cause === 'donnees-fictives') return;
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
