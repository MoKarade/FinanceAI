// services/sync/syncState.ts
// Persistance des métadonnées locales de sync (hors store applicatif, donc jamais synchronisées).
// localStorage uniquement, dégradation silencieuse si indisponible (priorité : ne jamais crasher).

import type { SyncMeta } from './syncTypes';

const META_KEY = 'financeai:sync:meta:v1';
const DEVICE_ID_KEY = 'financeai:deviceId:v1';

function safeGet(key: string): string | null {
    try {
        return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
        return null;
    }
}

function safeSet(key: string, value: string): void {
    try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch {
        /* localStorage plein/indispo — on n'échoue pas l'app pour ça */
    }
}

function safeRemove(key: string): void {
    try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {
        /* idem */
    }
}

/** Génère un id d'appareil aléatoire (crypto si dispo, repli Math.random). */
function generateDeviceId(): string {
    try {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return (crypto as Crypto).randomUUID();
        }
    } catch {
        /* repli ci-dessous */
    }
    return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Identifiant stable de cet appareil — créé puis persisté au premier appel. */
export function getOrCreateDeviceId(): string {
    const existing = safeGet(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = generateDeviceId();
    safeSet(DEVICE_ID_KEY, id);
    return id;
}

/** Lit les métadonnées de sync, ou `null` si absentes/corrompues. */
export function readSyncMeta(): SyncMeta | null {
    const raw = safeGet(META_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<SyncMeta>;
        // Validation minimale des champs critiques (un meta corrompu = repartir de zéro,
        // surtout pas faire des décisions de sync sur des valeurs bidon).
        if (
            typeof parsed.lastPulledUpdatedAt !== 'number' ||
            typeof parsed.lastLocalHash !== 'string' ||
            typeof parsed.deviceId !== 'string'
        ) {
            return null;
        }
        return {
            connectedEmail: typeof parsed.connectedEmail === 'string' ? parsed.connectedEmail : null,
            connectedSub: typeof parsed.connectedSub === 'string' ? parsed.connectedSub : null,
            lastSyncedAt: typeof parsed.lastSyncedAt === 'number' ? parsed.lastSyncedAt : 0,
            lastPulledUpdatedAt: parsed.lastPulledUpdatedAt,
            lastLocalHash: parsed.lastLocalHash,
            deviceId: parsed.deviceId,
        };
    } catch {
        return null;
    }
}

/** Écrit les métadonnées de sync (remplacement complet). */
export function writeSyncMeta(meta: SyncMeta): void {
    safeSet(META_KEY, JSON.stringify(meta));
}

/** Efface les métadonnées de sync (déconnexion Drive). Garde le deviceId. */
export function clearSyncMeta(): void {
    safeRemove(META_KEY);
}
