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
    //    (`localIsEmpty` = pas de données SIGNIFICATIVES, cf hasMeaningfulData : un défaut/onboarding
    //    frais compte comme vide → la restauration « nouvel appareil » passe ici, sans risque.)
    if (localIsEmpty) {
        return decision('pull', 'local-vide-restaurer');
    }

    // 3) Les DEUX côtés ont des données significatives → garde anti-perte STRICTE, sans exception.
    //    On n'écrase (pull/push) que si la cible est CERTAINEMENT plus ancienne ; toute divergence
    //    réelle — y compris « méta vierge » (appareil déconnecté/jamais syncé, impossible de comparer)
    //    → `conflict` : l'utilisateur choisit (UI globale SyncConflictModal), JAMAIS d'écrasement auto.
    //
    //    ⚠️ Retrait de l'ancien `restoreIntent` (« gate → Drive gagne ») : il faisait gagner Drive même
    //    sur du LOCAL réel → à la reconnexion, une VIEILLE copie Drive écrasait des données récentes.
    //    Bug Marc 2026-07-14 : 230k$ de placements locaux clobberés par une copie Drive périmée (SPCX
    //    seul). Le local significatif ne se perd désormais JAMAIS en silence. Le cas légitime « nouvel
    //    appareil, je restaure » est déjà couvert par (2) (local vide → pull).
    const driveAdvanced = drive.updatedAt > meta.lastPulledUpdatedAt;
    const localChanged = localHash !== meta.lastLocalHash;

    if (driveAdvanced && localChanged) {
        // Contenu strictement IDENTIQUE des deux côtés (ex. reconnexion sur le même compte après un
        // `disconnectSync` qui a vidé la méta → tout « compte » comme divergent alors que rien n'a
        // changé) → rien à choisir : noop. Évite un conflit « bruyant » sur des données identiques.
        // (Seulement en clair : un blob chiffré a `payload:null`, non comparable → on garde le conflit.)
        if (!drive.enc && hashPayload(drive.payload) === localHash) {
            return decision('noop', 'contenu-identique');
        }
        // Les deux ont divergé depuis la dernière sync (ou méta vierge : les deux « comptent » comme
        // avancés) → décision à l'utilisateur.
        return decision('conflict', 'divergence-deux-cotes');
    }
    if (driveAdvanced) {
        // Drive a avancé, local intact depuis la dernière sync → restaurer (sûr, rien de local perdu).
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

/**
 * Construit l'enveloppe à écrire dans Drive. `now`/`appVersion` injectés pour testabilité.
 * `apiKeysEnc` = blob de clés API DÉJÀ CHIFFRÉ (cf keyCipher) — buildEnvelope reste pur (le
 * chiffrement, asynchrone, est fait par l'orchestrateur avant l'appel). On n'écrit plus jamais de
 * clés en clair (le champ legacy `apiKeys` n'est plus produit, seulement lu en rétro-compat).
 */
export function buildEnvelope(
    payload: unknown,
    deviceId: string,
    appVersion: string,
    now: number,
    apiKeysEnc?: string,
): SyncEnvelope {
    const envelope: SyncEnvelope = {
        schemaVersion: SYNC_SCHEMA_VERSION,
        updatedAt: now,
        deviceId,
        appVersion,
        enc: false,
        payload,
    };
    // On n'inclut le champ chiffré que s'il y a des clés (enveloppe propre + rétro-compat).
    if (apiKeysEnc) envelope.apiKeysEnc = apiKeysEnc;
    return envelope;
}

/**
 * Variante CHIFFRÉE (`enc:true`) de l'enveloppe — chemin passphrase zéro-knowledge (D-3, opt-in).
 * Restée PURE : le ciphertext (`encPayload`) est calculé en amont par l'orchestrateur via
 * `encryptBackup` (asynchrone), exactement comme `apiKeysEnc` pour `buildEnvelope`. Le payload clair
 * et les clés API ne sont PAS dans l'enveloppe (ils sont déjà DANS `encPayload`) : `payload` vaut
 * `null` et il n'y a pas d'`apiKeysEnc`. On garde une fonction séparée (plutôt qu'un paramètre de
 * `buildEnvelope`) pour que le chemin clair par défaut reste strictement inchangé — anti-régression.
 */
export function buildEncryptedEnvelope(
    encPayload: string,
    deviceId: string,
    appVersion: string,
    now: number,
): SyncEnvelope {
    return {
        schemaVersion: SYNC_SCHEMA_VERSION,
        updatedAt: now,
        deviceId,
        appVersion,
        enc: true,
        payload: null,
        encPayload,
    };
}
