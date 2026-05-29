// services/sync/syncTypes.ts
// Types partagés de la synchronisation Google Drive (cf docs/GOOGLE_DRIVE_SYNC_DESIGN.md).
//
// Le « payload » est le snapshot d'état applicatif (financeai-storage MOINS les clés API).
// On ne le type pas précisément ici : le moteur de sync ne raisonne que sur l'enveloppe
// (timestamps + hash). La forme exacte du payload est gérée par l'orchestrateur (S3) et les
// migrations du store.

/** Version du format d'enveloppe (bump si on change la structure de SyncEnvelope). */
export const SYNC_SCHEMA_VERSION = 1;

/**
 * Enveloppe stockée dans le fichier `financeai-sync.json` du dossier appData Drive.
 * `enc` est réservé : `false` aujourd'hui (pas de chiffrement applicatif — décision D3),
 * passera à `true` si on ajoute une passphrase optionnelle plus tard, sans casser le format.
 */
export interface SyncEnvelope {
    schemaVersion: number;
    /** Epoch ms de la dernière écriture (sert au tri « plus récent gagne »). */
    updatedAt: number;
    /** Identifie l'appareil émetteur (diagnostic + détection conflit multi-appareils). */
    deviceId: string;
    /** Version de l'app au moment de l'écriture (diagnostic). */
    appVersion: string;
    /** Réservé : `false` = payload en clair, `true` = payload chiffré (futur). */
    enc: boolean;
    /** Snapshot d'état applicatif (sans les clés API). */
    payload: unknown;
}

/** Métadonnées locales de sync, persistées hors du store applicatif. */
export interface SyncMeta {
    /** Email du compte Google connecté pour Drive (affichage + invalidation si changement). */
    connectedEmail: string | null;
    /** Epoch ms de la dernière sync réussie (pull ou push). */
    lastSyncedAt: number;
    /** `updatedAt` du dernier blob Drive vu (pull ou push) — base de comparaison « Drive a avancé ». */
    lastPulledUpdatedAt: number;
    /** Hash du dernier payload local synchronisé — base de comparaison « local a changé ». */
    lastLocalHash: string;
    /** Identifiant stable de cet appareil. */
    deviceId: string;
}

export type SyncAction = 'pull' | 'push' | 'conflict' | 'noop';

export interface SyncDecision {
    action: SyncAction;
    /** Raison machine-lisible (logs + tests). */
    reason: string;
}

/** Entrée de la décision au chargement — tout est fourni par l'appelant (fonction pure). */
export interface DecideOnLoadInput {
    /** Enveloppe lue depuis Drive, ou `null` si le fichier n'existe pas encore. */
    drive: SyncEnvelope | null;
    /** Le state local est-il « vide » (aucune donnée significative — incognito/nouvel appareil) ? */
    localIsEmpty: boolean;
    /** Hash du payload local courant. */
    localHash: string;
    /** Métadonnées locales (dernière sync connue). */
    meta: SyncMeta;
}
