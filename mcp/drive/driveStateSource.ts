// mcp/drive/driveStateSource.ts
//
// Lot 3 — source d'état adossée au GOOGLE DRIVE de l'utilisateur : le connecteur lit/écrit le MÊME
// blob `financeai-sync.json` (appDataFolder) que l'app web. C'est le canal qui rend la synchro
// AUTOMATIQUE : Claude écrit → l'app récupère à son prochain pull.
//
// Implémente `WritableStateSource` (cf mcp/state/loadAppState) → se branche tel quel dans
// `makeStateStore` et tous les tools (lecture + apply_*), SANS les modifier.
//
// Réutilise ce qui existe : `driveAppData` (REST portable, fetch injectable) + `buildEnvelope` (pur).
// Le JETON d'accès Drive vient d'un `TokenProvider` injecté (le flux OAuth local vit ailleurs, Lot 3b).
//
// MVP : mode CLAIR (`enc:false`). Si le coffre est chiffré (passphrase), on répond une erreur claire
// (« retire la passphrase ») — le connecteur ne peut pas déchiffrer sans elle.

import type { AppState } from '../../types';
import {
    findSyncFile,
    readSyncFile,
    createSyncFile,
    updateSyncFile,
    type FetchLike,
} from '../../services/googleDrive/driveAppData';
import { buildEnvelope } from '../../services/sync/syncEngine';
import type { SyncEnvelope } from '../../services/sync/syncTypes';
import type { WritableStateSource } from '../state/loadAppState';
import type { SaveResult } from '../state/writeAppState';

/** Fournit un jeton d'accès Drive valide (OAuth local, Lot 3b). */
export type TokenProvider = () => Promise<string>;

const DEVICE_ID = 'financeai-mcp-connector';
const APP_VERSION = 'mcp-connector';
/** Version persist Zustand de repli si le blob existant n'en porte pas (l'existant fait foi sinon). */
const FALLBACK_PERSIST_VERSION = 7;

const ENC_MSG =
    'Ton coffre Drive est chiffré par passphrase : le connecteur ne peut pas le lire/écrire. ' +
    "Retire la passphrase dans l'app (Réglages → Sync), puis réessaie.";

/** payload du blob = persist Zustand `{ state, version }` (format de l'app) → on rend l'AppState nu. */
function extractState(payload: unknown): unknown {
    if (payload && typeof payload === 'object' && 'state' in (payload as Record<string, unknown>)) {
        return (payload as { state: unknown }).state;
    }
    return payload;
}

/** Retire les clés API d'un état (le payload de l'app n'en contient pas ; les clés vivent dans apiKeysEnc). */
function stripApiKeys<T>(state: T): T {
    if (state && typeof state === 'object' && 'apiKeys' in (state as Record<string, unknown>)) {
        const clone = { ...(state as Record<string, unknown>) };
        delete clone.apiKeys;
        return clone as T;
    }
    return state;
}

export class DriveStateSource implements WritableStateSource {
    constructor(
        private readonly getToken: TokenProvider,
        private readonly fetchFn?: FetchLike,
    ) {}

    get description(): string {
        return 'Google Drive (appDataFolder/financeai-sync.json)';
    }

    async loadRaw(): Promise<string> {
        const token = await this.getToken();
        const ref = await findSyncFile(token, this.fetchFn);
        if (!ref) {
            throw new Error(
                "Aucune sauvegarde FinanceAI dans ton Google Drive. Ouvre l'app et fais « Sauvegarder » d'abord.",
            );
        }
        const env = await readSyncFile(token, ref.id, this.fetchFn);
        if (env.enc === true) throw new Error(ENC_MSG);
        return JSON.stringify(extractState(env.payload));
    }

    async saveState(state: AppState): Promise<SaveResult> {
        const token = await this.getToken();
        const ref = await findSyncFile(token, this.fetchFn);
        let existing: SyncEnvelope | null = null;
        if (ref) {
            existing = await readSyncFile(token, ref.id, this.fetchFn);
            if (existing.enc === true) throw new Error(ENC_MSG);
        }
        // Re-écrit le payload persist { state, version } en CONSERVANT : la version persist existante
        // (pas de migration parasite côté app) ET `apiKeysEnc` (les clés de l'app restent intactes).
        const existingPersist = (existing?.payload ?? null) as { version?: number } | null;
        const persistVersion = existingPersist?.version ?? FALLBACK_PERSIST_VERSION;
        const newPayload = { state: stripApiKeys(state), version: persistVersion };
        const env = buildEnvelope(newPayload, DEVICE_ID, APP_VERSION, Date.now(), existing?.apiKeysEnc);

        if (ref) await updateSyncFile(token, ref.id, env, this.fetchFn);
        else await createSyncFile(token, env, this.fetchFn);

        // Pas de sauvegarde locale .bak pour Drive : la sécurité est la garde anti-perte de l'app
        // (backup auto au prochain pull) + l'écriture délibérée par Claude.
        return { backupPath: null };
    }
}
