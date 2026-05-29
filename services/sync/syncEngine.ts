// services/sync/syncEngine.ts
// Cœur DÉCISIONNEL de la sync — 100 % pur (aucun I/O, aucun accès réseau/localStorage).
// C'est la partie critique anti-perte : un bug ici effacerait des données financières.
// Toute la logique est donc en fonctions pures, testées ligne par ligne (syncEngine.test.ts).
//
// Voir la matrice §4 de docs/GOOGLE_DRIVE_SYNC_DESIGN.md.

import { SYNC_SCHEMA_VERSION, type SyncEnvelope, type SyncDecision, type DecideOnLoadInput } from './syncTypes';

const decision = (action: SyncDecision['action'], reason: string): SyncDecision => ({ action, reason });

/**
 * Décide quoi faire au chargement / à la connexion, à partir de l'état Drive + local.
 *
 * Garde d'or : on ne déclenche un `pull` (écrase le local) ou un `push` (écrase Drive) que
 * lorsque la cible est certainement plus ancienne ; toute divergence réelle → `conflict`
 * (choix laissé à l'utilisateur, jamais d'écrasement automatique).
 */
export function decideOnLoad(input: DecideOnLoadInput): SyncDecision {
    const { drive, localIsEmpty, localHash, meta } = input;

    // 1) Drive n'existe pas encore.
    if (!drive) {
        return localIsEmpty
            ? decision('noop', 'drive-absent-local-vide')
            : decision('push', 'premiere-sync');
    }

    // 2) Local vide (incognito / nouvel appareil) → restaurer depuis Drive. Aucun conflit possible.
    if (localIsEmpty) {
        return decision('pull', 'local-vide-restaurer');
    }

    // 3) Les deux côtés existent : comparer l'avancement.
    const driveAdvanced = drive.updatedAt > meta.lastPulledUpdatedAt;
    const localChanged = localHash !== meta.lastLocalHash;

    if (driveAdvanced && localChanged) {
        // Les deux ont divergé depuis la dernière sync → décision à l'utilisateur.
        return decision('conflict', 'divergence-deux-cotes');
    }
    if (driveAdvanced) {
        // Drive a avancé, local intact → restaurer (sûr).
        return decision('pull', 'drive-plus-recent-local-inchange');
    }
    if (localChanged) {
        // Local a changé, Drive intact → publier.
        return decision('push', 'local-modifie');
    }
    // Rien n'a bougé des deux côtés.
    return decision('noop', 'deja-sync');
}

/**
 * Garde du push « au changement » (debouncé) : on ne pousse JAMAIS
 *  - un état vide → anti-catastrophe « incognito vide → efface Drive » (combiné à decideOnLoad) ;
 *  - un état en MODE TEST (fixtures persona) → sinon l'auto-push enverrait des données de démo
 *    dans Drive et écraserait la vraie sauvegarde de l'utilisateur (bug 2026-05-29).
 */
export function shouldPush(localIsEmpty: boolean, isTestMode = false): boolean {
    return !localIsEmpty && !isTestMode;
}

/**
 * Sérialisation canonique : clés d'objet triées récursivement → hash stable quel que soit
 * l'ordre d'insertion. (Pour la détection de changement, pas pour la sécurité.)
 */
export function canonicalJson(value: unknown): string {
    return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(obj).sort()) out[key] = sortKeys(obj[key]);
        return out;
    }
    return value;
}

/**
 * Hash déterministe (FNV-1a 32 bits, hex) du payload — sert à détecter si le local a changé
 * depuis la dernière sync. Rapide, sans dépendance, suffisant pour de la détection de changement
 * (PAS une garantie cryptographique).
 */
export function hashPayload(payload: unknown): string {
    const str = canonicalJson(payload);
    let hash = 0x811c9dc5; // offset basis FNV-1a 32 bits
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        // multiplication FNV (32 bits) via Math.imul pour rester en entier 32 bits.
        hash = Math.imul(hash, 0x01000193);
    }
    // >>> 0 → entier non signé, puis hex padé.
    return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Construit l'enveloppe à écrire dans Drive. `now`/`appVersion` injectés pour testabilité. */
export function buildEnvelope(
    payload: unknown,
    deviceId: string,
    appVersion: string,
    now: number,
    apiKeys?: { anthropic: string; finnhub: string },
): SyncEnvelope {
    const envelope: SyncEnvelope = {
        schemaVersion: SYNC_SCHEMA_VERSION,
        updatedAt: now,
        deviceId,
        appVersion,
        enc: false,
        payload,
    };
    // Sync v2 : on n'inclut le champ que s'il y a des clés (enveloppe propre + rétro-compat v1).
    if (apiKeys) envelope.apiKeys = apiKeys;
    return envelope;
}
