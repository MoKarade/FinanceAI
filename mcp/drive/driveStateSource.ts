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
    createAppDataFile,
    listAppDataFiles,
    deleteSyncFile,
    SYNC_FILE_NAME,
    type FetchLike,
} from '../../services/googleDrive/driveAppData';
import { buildEnvelope } from '../../services/sync/syncEngine';
import type { SyncEnvelope } from '../../services/sync/syncTypes';
import type { WritableStateSource } from '../state/loadAppState';
import type { SaveResult } from '../state/writeAppState';
import { setStateFreshness } from '../state/freshness';
import { logError } from '../../services/errorLogger';

/** Fournit un jeton d'accès Drive valide (OAuth local, Lot 3b). */
export type TokenProvider = () => Promise<string>;

const DEVICE_ID = 'financeai-mcp-connector';
const APP_VERSION = 'mcp-connector';
/** Version persist Zustand de repli si le blob existant n'en porte pas (l'existant fait foi sinon). */
const FALLBACK_PERSIST_VERSION = 7;
/** Suffixe des sauvegardes Drive du connecteur : `financeai-sync.<ISO>.bak.json` (l'ISO trie chrono). */
const BACKUP_SUFFIX = '.bak.json';
/** Nombre de sauvegardes Drive conservées (rolling — aligné sur writeAppState keepBackups=5). */
const KEEP_DRIVE_BACKUPS = 5;

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
    /**
     * `updatedAt` du DERNIER blob Drive vu par CE processus (lecture ou écriture). Sert de garde de
     * CONCURRENCE au save : si le blob a avancé depuis (l'app a poussé entre-temps — fenêtre réelle,
     * le cache d'état du store dure 30 s), on REFUSE d'écraser au lieu de faire du last-writer-wins
     * silencieux ([MCP-PAYSLIP-BACKUP] 2026-07-14). null = jamais lu (garde inactive).
     *
     * ⚠️ Limite connue (panel 2026-07-14) : ce champ est PROCESS-WIDE (une seule source par serveur,
     * cf bootstrap.resolveState) — la garde protège contre l'APP qui pousse entre lecture et écriture
     * MCP (le cas de l'incident), pas contre DEUX tool-calls MCP concurrents dont les mutations
     * partent du même état en cache (fenêtre = durée d'un handler ; le mutex `_saveQueue` sérialise
     * les writes mais la base de calcul peut rester périmée). Le vrai fix = jeton de version par
     * appel plumbé via StateStore → `[MCP-WRITE-VERSION-TOKEN]` au BACKLOG.
     */
    private lastSeenUpdatedAt: number | null = null;

    /** Mutex des écritures : UN SEUL saveState Drive à la fois dans le processus (les awaits internes
     *  — read, backup, prune, write — laisseraient sinon deux saves s'entrelacer : double backup,
     *  garde évaluée sur un état en plein milieu d'un autre write). */
    private _saveQueue: Promise<unknown> = Promise.resolve();

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
        this.lastSeenUpdatedAt = env.updatedAt ?? null;
        // [MCP-STALE-FRESHNESS] — publie l'âge du blob : chaque réponse de tool portera la note de
        // fraîcheur (Claude sait si la copie Drive est périmée au lieu d'affirmer des chiffres morts).
        setStateFreshness({ updatedAt: env.updatedAt ?? null, source: 'Google Drive' });
        return JSON.stringify(extractState(env.payload));
    }

    saveState(state: AppState): Promise<SaveResult> {
        // Sérialisation : chaque save attend la fin du précédent (voir _saveQueue). Le résultat de
        // CE save est retourné à SON appelant ; un échec ne casse pas la chaîne (catch → maillon suivant).
        const run = this._saveQueue.then(() => this.doSaveState(state));
        this._saveQueue = run.catch(() => undefined);
        return run;
    }

    private async doSaveState(state: AppState): Promise<SaveResult> {
        const token = await this.getToken();
        const ref = await findSyncFile(token, this.fetchFn);
        let existing: SyncEnvelope | null = null;
        if (ref) {
            existing = await readSyncFile(token, ref.id, this.fetchFn);
            if (existing.enc === true) throw new Error(ENC_MSG);
            // Garde de CONCURRENCE : le blob a avancé depuis notre dernière lecture → l'app (ou un
            // autre appareil) a sauvegardé entre-temps. Écraser maintenant jetterait ses changements
            // (last-writer-wins silencieux). On refuse avec un message actionnable — le store
            // invalide son cache sur échec de save → le prochain get() relit l'état frais.
            if (this.lastSeenUpdatedAt != null && (existing.updatedAt ?? 0) > this.lastSeenUpdatedAt) {
                // Journalisé côté serveur (observabilité Cloud Run) EN PLUS du throw vers le tool :
                // un refus de write money-critical ne doit laisser aucune zone d'ombre.
                logError({
                    source: 'storage',
                    severity: 'warning',
                    message: 'DriveStateSource: conflit de concurrence détecté — écriture REFUSÉE (rien d\'écrasé)',
                    context: { existingUpdatedAt: existing.updatedAt, lastSeenUpdatedAt: this.lastSeenUpdatedAt },
                });
                throw new Error(
                    'Conflit : la sauvegarde Drive a été modifiée depuis la lecture (l\'app a ' +
                    'synchronisé entre-temps). Rien n\'a été écrasé. Relance le tool : il relira ' +
                    'l\'état à jour, puis réapplique le changement.',
                );
            }
        }

        // [MCP-PAYSLIP-BACKUP] — sauvegarde Drive HORODATÉE de l'existant AVANT tout écrasement
        // (la description des tools apply_* le promet ; avant, le chemin Drive écrasait sans filet).
        // FAIL-CLOSED : si la sauvegarde échoue, on N'ÉCRASE PAS (mieux vaut une écriture refusée
        // qu'une promesse de rollback rompue sur des données financières).
        let backupPath: string | null = null;
        if (ref && existing) {
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `${SYNC_FILE_NAME}.${ts}${BACKUP_SUFFIX}`;
            await createAppDataFile(token, backupName, existing, this.fetchFn);
            backupPath = `appDataFolder/${backupName}`;
            await this.pruneDriveBackups(token);
        }

        // Re-écrit le payload persist { state, version } en CONSERVANT : la version persist existante
        // (pas de migration parasite côté app) ET `apiKeysEnc` (les clés de l'app restent intactes).
        const existingPersist = (existing?.payload ?? null) as { version?: number } | null;
        const persistVersion = existingPersist?.version ?? FALLBACK_PERSIST_VERSION;
        const newPayload = { state: stripApiKeys(state), version: persistVersion };
        const now = Date.now();
        const env = buildEnvelope(newPayload, DEVICE_ID, APP_VERSION, now, existing?.apiKeysEnc);

        if (ref) await updateSyncFile(token, ref.id, env, this.fetchFn);
        else await createSyncFile(token, env, this.fetchFn);

        this.lastSeenUpdatedAt = now;
        setStateFreshness({ updatedAt: now, source: 'Google Drive' });
        return { backupPath };
    }

    /** Rolling : garde les KEEP_DRIVE_BACKUPS sauvegardes les plus récentes, supprime le reste.
     *  Best-effort (un échec de pruning ne doit pas faire échouer un save réussi). */
    private async pruneDriveBackups(token: string): Promise<void> {
        try {
            const backups = await listAppDataFiles(token, BACKUP_SUFFIX, this.fetchFn);
            // Le nom porte l'ISO → tri lexical descendant = plus récent d'abord.
            const sorted = backups
                .filter((b) => b.name.startsWith(`${SYNC_FILE_NAME}.`) && b.name.endsWith(BACKUP_SUFFIX))
                .sort((a, b) => b.name.localeCompare(a.name));
            for (const old of sorted.slice(KEEP_DRIVE_BACKUPS)) {
                await deleteSyncFile(token, old.id, this.fetchFn); // DELETE générique par id (idempotent)
            }
        } catch (e) {
            // Best-effort (un échec de pruning ne doit pas faire échouer un save réussi), mais JAMAIS
            // muet : une panne PERSISTANTE (quota/scope Drive) ferait proliférer les .bak.json sans
            // aucun signal de diagnostic (finding panel 2026-07-14).
            logError({
                source: 'storage',
                severity: 'warning',
                message: 'DriveStateSource: pruning des sauvegardes Drive échoué (backups conservés en trop)',
                error: e instanceof Error ? e : new Error(String(e)),
            });
        }
    }
}
