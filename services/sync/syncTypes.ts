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
 *
 * `enc` pilote DEUX formats interopérables (rétro-compat totale) :
 *  - `enc:false` (défaut, décision D3) → `payload` EN CLAIR + clés dans `apiKeysEnc` (clé dérivée
 *    du `sub` Google). C'est le chemin historique, INCHANGÉ.
 *  - `enc:true` (passphrase optionnelle activée, D-3 2026-06) → vrai zéro-knowledge : `encPayload`
 *    contient le payload COMPLET **et les clés API** chiffrés par `encryptBackup` (PBKDF2 600k +
 *    AES-256-GCM, format « FAI1 »), la passphrase n'allant JAMAIS dans Drive. `payload` vaut alors
 *    `null` (aucun clair) et `apiKeysEnc` est absent (les clés sont dans `encPayload`).
 *
 * Le flag étant un simple booléen, un lecteur qui voit `enc:false` suit le chemin clair comme avant :
 * un ancien blob reste lisible sans passphrase, et activer/désactiver la passphrase ré-écrit
 * simplement l'autre forme au prochain push.
 */
export interface SyncEnvelope {
    schemaVersion: number;
    /** Epoch ms de la dernière écriture (sert au tri « plus récent gagne »). */
    updatedAt: number;
    /** Identifie l'appareil émetteur (diagnostic + détection conflit multi-appareils). */
    deviceId: string;
    /** Version de l'app au moment de l'écriture (diagnostic). */
    appVersion: string;
    /** `false` = payload en clair (+ `apiKeysEnc`) ; `true` = `encPayload` chiffré zéro-knowledge. */
    enc: boolean;
    /** Snapshot d'état applicatif (financeai-storage, sans les clés API). `null` quand `enc:true`. */
    payload: unknown;
    /**
     * Présent UNIQUEMENT si `enc:true`. Blob `encryptBackup` (« FAI1 » base64) du payload COMPLET +
     * des clés API. Indéchiffrable sans la passphrase de l'utilisateur (zéro-knowledge). Absent en
     * `enc:false`.
     */
    encPayload?: string;
    /**
     * LEGACY (anciens blobs) : clés API EN CLAIR. Plus jamais écrit depuis 2026-05-29 (remplacé par
     * `apiKeysEnc`). Encore LU en rétro-compat — un ancien blob sera ré-écrit chiffré au prochain push.
     */
    apiKeys?: { anthropic: string; finnhub: string };
    /**
     * Clés API CHIFFRÉES (AES-GCM, clé dérivée du `sub` Google — cf keyCipher). Format actuel.
     * Sort les clés du clair dans Drive (C1, 2026-05-29). Absent si aucune clé / crypto indispo.
     */
    apiKeysEnc?: string;
}

/** Métadonnées locales de sync, persistées hors du store applicatif. */
export interface SyncMeta {
    /** Email du compte Google connecté pour Drive (affichage + invalidation si changement). */
    connectedEmail: string | null;
    /** Identifiant Google STABLE (`sub`) — sert à dériver la clé de chiffrement des clés API (keyCipher). */
    connectedSub?: string | null;
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
