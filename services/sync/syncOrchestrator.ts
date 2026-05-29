// services/sync/syncOrchestrator.ts
// Orchestration de la sync Google Drive : colle gisAuth + driveAppData + syncEngine + syncState
// au snapshot du store. Toute la logique critique de décision est dans syncEngine (pur, testé) ;
// ici on fait l'I/O, toujours en try/catch (ne JAMAIS crasher l'app pour une erreur de sync).
//
// INERTE tant que VITE_GOOGLE_CLIENT_ID n'est pas configuré (cf gisAuth.isGoogleAuthConfigured).

import { logError } from '../errorLogger';
import {
    configureGoogleAuth,
    isGoogleAuthConfigured,
    requestAccessToken,
    getValidAccessToken,
    revokeAccess,
} from '../googleDrive/gisAuth';
import {
    findSyncFile,
    createSyncFile,
    readSyncFile,
    updateSyncFile,
    fetchUserEmail,
    DriveAuthError,
} from '../googleDrive/driveAppData';
import { decideOnLoad, shouldPush, hashPayload, buildEnvelope } from './syncEngine';
import { getOrCreateDeviceId, readSyncMeta, writeSyncMeta, clearSyncMeta } from './syncState';
import type { SyncEnvelope, SyncMeta } from './syncTypes';

// Doit correspondre au `name` du persist Zustand (store/useFinanceStore.ts) et à backupAuto.
const STORE_KEY = 'financeai-storage';
// `__APP_VERSION__` est injecté par Vite (define). `typeof` évite un ReferenceError en test
// (où le define n'existe pas) — diagnostic uniquement dans l'enveloppe.
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'web';

// ── Helpers purs (testables) ─────────────────────────────────────────────────

/** Retire défensivement les clés API du snapshot (déjà exclues par le partialize, ceinture+bretelles). */
export function stripApiKeys(snapshot: unknown): unknown {
    if (!snapshot || typeof snapshot !== 'object') return snapshot;
    const obj = snapshot as Record<string, unknown>;
    const state = obj.state as Record<string, unknown> | undefined;
    if (state && 'apiKeys' in state) {
        const { apiKeys: _drop, ...rest } = state;
        return { ...obj, state: rest };
    }
    return snapshot;
}

/** « Vide » = pas de snapshot, ou state sans transactions ni actifs (incognito/nouvel appareil). */
export function computeIsEmpty(snapshot: unknown): boolean {
    if (!snapshot || typeof snapshot !== 'object') return true;
    const state = (snapshot as { state?: Record<string, unknown> }).state;
    if (!state) return true;
    const tx = state.transactions;
    const assets = state.assets;
    const hasTx = Array.isArray(tx) && tx.length > 0;
    const hasAssets = Array.isArray(assets) && assets.length > 0;
    return !hasTx && !hasAssets;
}

interface LocalPayload {
    payload: unknown;
    isEmpty: boolean;
    hash: string;
}

function getLocalPayload(): LocalPayload {
    let raw: string | null = null;
    try {
        raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_KEY) : null;
    } catch {
        raw = null;
    }
    let parsed: unknown = null;
    if (raw) {
        try {
            parsed = JSON.parse(raw);
        } catch {
            parsed = null;
        }
    }
    const payload = stripApiKeys(parsed);
    return { payload, isEmpty: computeIsEmpty(payload), hash: hashPayload(payload) };
}

/** Réapplique un payload tiré de Drive : backup d'assurance, écriture, reload (rehydrate). */
async function applyPulledPayload(payload: unknown): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    // Filet : backup local de l'état courant avant d'écraser (réutilise backupAuto).
    try {
        const { createBackupNow } = await import('../backupAuto');
        await createBackupNow('auto');
    } catch {
        /* le backup d'assurance est best-effort, on ne bloque pas la restauration */
    }
    localStorage.setItem(STORE_KEY, JSON.stringify(payload));
    if (typeof window !== 'undefined') window.location.reload();
}

// ── Statut observable (pour l'UI) ────────────────────────────────────────────

export interface SyncStatus {
    configured: boolean;
    connected: boolean;
    email: string | null;
    lastSyncedAt: number;
    busy: boolean;
    conflict: boolean;
    error: string | null;
}

let _status: SyncStatus = {
    configured: false,
    connected: false,
    email: null,
    lastSyncedAt: 0,
    busy: false,
    conflict: false,
    error: null,
};
const _listeners = new Set<(s: SyncStatus) => void>();

function setStatus(patch: Partial<SyncStatus>): void {
    _status = { ..._status, ...patch };
    _listeners.forEach((cb) => cb(_status));
}

export function getSyncStatus(): SyncStatus {
    return _status;
}

export function subscribeSyncStatus(cb: (s: SyncStatus) => void): () => void {
    _listeners.add(cb);
    cb(_status);
    return () => _listeners.delete(cb);
}

// ── Cycle de vie ─────────────────────────────────────────────────────────────

/** À appeler au boot : configure le Client ID et publie l'état initial (a-t-on déjà connecté ?). */
export function initSync(clientId: string | undefined | null): void {
    configureGoogleAuth(clientId);
    const meta = readSyncMeta();
    setStatus({
        configured: isGoogleAuthConfigured(),
        email: meta?.connectedEmail ?? null,
        lastSyncedAt: meta?.lastSyncedAt ?? 0,
    });
}

function currentMeta(): SyncMeta {
    return (
        readSyncMeta() ?? {
            connectedEmail: _status.email,
            lastSyncedAt: 0,
            lastPulledUpdatedAt: 0,
            lastLocalHash: '',
            deviceId: getOrCreateDeviceId(),
        }
    );
}

/** Lit l'enveloppe Drive (ou null). Rafraîchit le token une fois sur 401. */
async function readDrive(token: string): Promise<SyncEnvelope | null> {
    const ref = await findSyncFile(token);
    if (!ref) return null;
    return readSyncFile(token, ref.id);
}

/** Pousse le payload local vers Drive (create ou update) et met à jour la meta. */
export async function pushNow(): Promise<void> {
    if (!isGoogleAuthConfigured()) return;
    const local = getLocalPayload();
    if (!shouldPush(local.isEmpty)) return; // jamais pousser un état vide
    setStatus({ busy: true, error: null });
    try {
        const token = await getValidAccessToken();
        const now = Date.now();
        const envelope = buildEnvelope(local.payload, getOrCreateDeviceId(), APP_VERSION, now);
        const ref = await findSyncFile(token);
        if (ref) await updateSyncFile(token, ref.id, envelope);
        else await createSyncFile(token, envelope);
        const meta = currentMeta();
        writeSyncMeta({
            ...meta,
            lastSyncedAt: now,
            lastPulledUpdatedAt: now,
            lastLocalHash: local.hash,
        });
        setStatus({ busy: false, lastSyncedAt: now, connected: true, conflict: false });
    } catch (e) {
        handleError('push', e);
    }
}

// Push auto debouncé : appelé à chaque changement du store (cf câblage App.tsx).
let _pushTimer: ReturnType<typeof setTimeout> | null = null;
const PUSH_DEBOUNCE_MS = 8000;

/** Programme un push après une période d'inactivité (debounce). No-op si non connecté. */
export function schedulePush(): void {
    if (!isGoogleAuthConfigured() || !_status.connected) return;
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => {
        _pushTimer = null;
        // Ignore si rien n'a changé depuis la dernière sync (les changements d'UI transitoires
        // — onglet actif, mode privé — déclenchent l'abonnement store sans modifier le snapshot).
        if (getLocalPayload().hash === currentMeta().lastLocalHash) return;
        void pushNow();
    }, PUSH_DEBOUNCE_MS);
}

/** Tire Drive et applique (reload). Met à jour la meta avant le reload. */
export async function pullNow(): Promise<void> {
    if (!isGoogleAuthConfigured()) return;
    setStatus({ busy: true, error: null });
    try {
        const token = await getValidAccessToken();
        const drive = await readDrive(token);
        if (!drive) {
            setStatus({ busy: false });
            return;
        }
        const meta = currentMeta();
        writeSyncMeta({
            ...meta,
            lastSyncedAt: Date.now(),
            lastPulledUpdatedAt: drive.updatedAt,
            lastLocalHash: hashPayload(drive.payload),
        });
        setStatus({ conflict: false });
        await applyPulledPayload(drive.payload); // déclenche un reload
    } catch (e) {
        handleError('pull', e);
    }
}

/**
 * Connexion interactive (clic utilisateur) : consentement Google, récupère l'email,
 * puis exécute la décision de sync initiale.
 */
export async function connectAndSync(): Promise<void> {
    if (!isGoogleAuthConfigured()) return;
    setStatus({ busy: true, error: null });
    try {
        const token = await requestAccessToken(true);
        const email = await fetchUserEmail(token);
        const meta = currentMeta();
        writeSyncMeta({ ...meta, connectedEmail: email });
        setStatus({ connected: true, email });
        await runDecision(token);
    } catch (e) {
        handleError('connect', e);
    }
}

/** Sync au boot (silencieux) si l'utilisateur a déjà connecté Drive. Ne bloque jamais l'app. */
export async function runBootSync(): Promise<void> {
    if (!isGoogleAuthConfigured()) return;
    const meta = readSyncMeta();
    if (!meta?.connectedEmail) return; // jamais connecté → rien au boot
    try {
        const token = await getValidAccessToken(); // silencieux (refresh)
        setStatus({ connected: true });
        await runDecision(token);
    } catch (e) {
        // Échec silencieux du refresh (session Google expirée) → l'utilisateur recliquera.
        setStatus({ connected: false });
        if (!(e instanceof DriveAuthError)) handleError('boot', e);
    }
}

/** Applique decideOnLoad puis exécute l'action résultante. */
async function runDecision(token: string): Promise<void> {
    setStatus({ busy: true, error: null });
    const drive = await readDrive(token);
    const local = getLocalPayload();
    const meta = currentMeta();
    const decision = decideOnLoad({
        drive,
        localIsEmpty: local.isEmpty,
        localHash: local.hash,
        meta,
    });
    switch (decision.action) {
        case 'pull':
            await pullNow();
            break;
        case 'push':
            await pushNow();
            break;
        case 'conflict':
            setStatus({ busy: false, conflict: true });
            break;
        case 'noop':
        default:
            setStatus({ busy: false, conflict: false });
            break;
    }
}

/** Résolution de conflit par l'utilisateur : garder le local (push) ou garder Drive (pull). */
export async function resolveConflict(keep: 'local' | 'drive'): Promise<void> {
    setStatus({ conflict: false });
    if (keep === 'local') await pushNow();
    else await pullNow();
}

/** Déconnexion : révoque le token et efface la meta de sync. */
export function disconnectSync(): void {
    revokeAccess();
    clearSyncMeta();
    setStatus({ connected: false, email: null, conflict: false, lastSyncedAt: 0 });
}

function handleError(phase: string, e: unknown): void {
    const message = e instanceof Error ? e.message : String(e);
    setStatus({ busy: false, error: `Sync (${phase}) : ${message}` });
    logError({
        source: 'storage',
        severity: 'warning',
        message: `Sync Google Drive échouée (${phase})`,
        error: e instanceof Error ? e : new Error(message),
    });
}
