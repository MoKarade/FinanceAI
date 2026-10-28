// services/sync/syncMeta.ts
// [ARCH-SYNC-SPLIT] Utilitaires de méta Drive + lecture d'enveloppe + résolution du `sub` Google.
// Sans état module-level propre (délègue à syncState). Importé par : syncPush, syncPull, syncLifecycle.

import {
    findSyncFile,
    readSyncFile,
    fetchUserIdentity,
} from '../googleDrive/driveAppData';
import { getOrCreateDeviceId, readSyncMeta, writeSyncMeta } from './syncState';
import { getSyncStatus } from './syncStatusStore';
import type { SyncEnvelope, SyncMeta } from './syncTypes';

/** @internal — méta locale courante (fallback e-mail depuis le statut vivant si pas encore persistée). */
export function currentMeta(): SyncMeta {
    return (
        readSyncMeta() ?? {
            connectedEmail: getSyncStatus().email,
            lastSyncedAt: 0,
            lastPulledUpdatedAt: 0,
            lastLocalHash: '',
            deviceId: getOrCreateDeviceId(),
        }
    );
}

/** @internal — Lit l'enveloppe Drive (ou null). Rafraîchit le token une fois sur 401. */
export async function readDrive(token: string): Promise<SyncEnvelope | null> {
    const ref = await findSyncFile(token);
    if (!ref) return null;
    return readSyncFile(token, ref.id);
}

/**
 * @internal — Récupère le `sub` Google (id stable) qui sert à chiffrer/déchiffrer les clés API (keyCipher).
 * Depuis la meta si déjà connu (cas normal : écrit au login) ; sinon fetch via le token et persiste.
 * `null` si indispo (userinfo HS) → l'appelant ne chiffrera pas (clés non synchronisées plutôt qu'en clair).
 */
export async function resolveSub(token: string): Promise<string | null> {
    const existing = currentMeta().connectedSub;
    if (existing) return existing;
    try {
        const { sub } = await fetchUserIdentity(token);
        if (sub) writeSyncMeta({ ...currentMeta(), connectedSub: sub });
        return sub;
    } catch {
        return null;
    }
}
