// services/lockedProjectionStore.ts
// PH2-d — persistance IndexedDB (CHIFFRÉE au repos) de la courbe VERROUILLÉE.
//
// Pourquoi un module + une DB DÉDIÉS (pas le persist Zustand / localStorage) :
//   - le ProjectionResult complet (~360 pts × ~40 champs + allResults) est trop volumineux
//     pour localStorage (~5 MB) ; IndexedDB gère 50 MB+.
//   - DB SÉPARÉE (`financeai-locked-projection`) → aucun risque de corruption du schéma
//     persist v7 (cf vigilance CLAUDE.md). Côté Zustand on ne persiste qu'un BOOLÉEN additif.
//
// Sécurité : données financières → chiffrées avec la clé de device non-extractible
// (secureKeyStore, AES-GCM), comme les backups. Dégradation propre EN CLAIR si la crypto est
// indisponible (on préfère un verrou non chiffré à pas de verrou) — journalisé une fois.
//
// Robustesse : un seul enregistrement (clé fixe `current`). Toutes les fonctions sont best-effort :
// elles NE LÈVENT JAMAIS (retournent false/null + logError) — un échec IDB ne doit pas casser l'UI.

import type { ProjectionResult } from './projection/types';
import { getOrCreateDeviceKey, encryptJson, decryptJson } from './secureKeyStore';
import { logError } from './errorLogger';

const DB_NAME = 'financeai-locked-projection';
const STORE_NAME = 'locked';
const DB_VERSION = 1;
const FIXED_KEY = 'current';

// N'avertir qu'UNE fois par session que le verrou tombe en clair (log borné).
let _cleartextWarned = false;

interface LockedRecord {
    id: string;
    /** ProjectionResult, chiffré (base64 AES-GCM) si `encrypted`, sinon JSON brut. */
    payload: string;
    encrypted: boolean;
    timestamp: number;
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
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

/** Clé de device sans lever (null si crypto/IndexedDB indisponible → repli clair). */
async function tryGetKey(): Promise<CryptoKey | null> {
    try {
        return await getOrCreateDeviceKey();
    } catch (e) {
        if (!_cleartextWarned) {
            _cleartextWarned = true;
            logError({
                source: 'storage',
                severity: 'warning',
                message: 'Crypto/IndexedDB indisponible : la courbe verrouillée est stockée EN CLAIR.',
                error: e instanceof Error ? e : new Error(String(e)),
            });
        }
        return null;
    }
}

/**
 * Persiste la courbe verrouillée (chiffrée si une clé de device existe, sinon en clair).
 * Best-effort : retourne `false` sans lever en cas d'échec.
 */
export async function saveLockedProjection(result: ProjectionResult): Promise<boolean> {
    try {
        const key = await tryGetKey();
        const payload = key ? await encryptJson(key, result) : JSON.stringify(result);
        const rec: LockedRecord = { id: FIXED_KEY, payload, encrypted: !!key, timestamp: Date.now() };
        const db = await openDB();
        try {
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).put(rec);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
        } finally {
            db.close();
        }
        return true;
    } catch (e) {
        logError({
            source: 'storage',
            severity: 'warning',
            message: 'Échec de persistance de la courbe verrouillée (IndexedDB).',
            error: e instanceof Error ? e : new Error(String(e)),
        });
        return false;
    }
}

/** PH2-d-1 — résultat de restauration DISCRIMINÉ : distingue « rien de stocké » d'« entrée illisible »
 *  (clé absente / blob altéré), pour que le boot puisse AVERTIR l'utilisateur dans ce 2e cas. */
export type LoadLockedResult =
    | { status: 'ok'; result: ProjectionResult }
    | { status: 'empty' }
    | { status: 'unreadable' };

/**
 * Restaure la courbe verrouillée. Retourne un statut DISCRIMINÉ (ne lève JAMAIS) :
 *  - 'ok'         : courbe relue (clair ou déchiffré).
 *  - 'empty'      : rien de stocké (jamais verrouillé) OU erreur d'ACCÈS IDB → silence légitime.
 *  - 'unreadable' : une entrée EXISTE mais est indéchiffrable (clé device disparue / blob altéré)
 *                   → l'appelant (boot) avertit l'utilisateur (PH2-d-1, jumeau de `decrypt_failed`).
 */
export async function loadLockedProjection(): Promise<LoadLockedResult> {
    let rec: LockedRecord | undefined;
    try {
        const db = await openDB();
        try {
            rec = await new Promise<LockedRecord | undefined>((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const req = tx.objectStore(STORE_NAME).get(FIXED_KEY);
                req.onsuccess = () => resolve(req.result as LockedRecord | undefined);
                req.onerror = () => reject(req.error);
            });
        } finally {
            db.close();
        }
    } catch (e) {
        // Erreur d'ACCÈS (ouverture/lecture IDB) : on ignore si une entrée existait → 'empty' (silence).
        // Un hoquet IDB transitoire ne doit pas alarmer l'utilisateur.
        logError({
            source: 'storage',
            severity: 'warning',
            message: 'Échec d\'accès à la courbe verrouillée (IndexedDB).',
            error: e instanceof Error ? e : new Error(String(e)),
        });
        return { status: 'empty' };
    }

    if (!rec) return { status: 'empty' };
    try {
        if (!rec.encrypted) return { status: 'ok', result: JSON.parse(rec.payload) as ProjectionResult };
        const key = await tryGetKey();
        if (!key) {
            logError({
                source: 'storage',
                severity: 'warning',
                message: 'Courbe verrouillée chiffrée mais clé de device absente : indéchiffrable.',
            });
            return { status: 'unreadable' };
        }
        return { status: 'ok', result: await decryptJson<ProjectionResult>(key, rec.payload) };
    } catch (e) {
        // Une entrée EXISTE mais déchiffrement/parse a échoué (blob altéré, clé changée) → 'unreadable'.
        logError({
            source: 'storage',
            severity: 'warning',
            message: 'Courbe verrouillée présente mais indéchiffrable (blob altéré ?).',
            error: e instanceof Error ? e : new Error(String(e)),
        });
        return { status: 'unreadable' };
    }
}

/** Efface la courbe verrouillée persistée (au déverrouillage). Best-effort, ne lève jamais. */
export async function clearLockedProjection(): Promise<void> {
    try {
        const db = await openDB();
        try {
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).delete(FIXED_KEY);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
        } finally {
            db.close();
        }
    } catch (e) {
        logError({
            source: 'storage',
            severity: 'warning',
            message: 'Échec d\'effacement de la courbe verrouillée (IndexedDB).',
            error: e instanceof Error ? e : new Error(String(e)),
        });
    }
}
