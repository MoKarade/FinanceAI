// services/googleDrive/driveAppData.ts
// Accès REST au dossier caché `appDataFolder` du Drive de l'utilisateur (scope drive.appdata).
// 1 seul fichier : financeai-sync.json. `fetch` est injectable → testable sans réseau.
//
// Erreurs typées : DriveAuthError (401, le token doit être rafraîchi) vs DriveError (autre).

import type { SyncEnvelope } from '../sync/syncTypes';
import { logError } from '../errorLogger';

export const SYNC_FILE_NAME = 'financeai-sync.json';

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo';

/** Token expiré/invalide → l'appelant doit re-demander un access token (gisAuth). */
export class DriveAuthError extends Error {
    constructor(message = 'Token Drive invalide ou expiré') {
        super(message);
        this.name = 'DriveAuthError';
    }
}

/** Toute autre erreur Drive (réseau, quota, 5xx…). */
export class DriveError extends Error {
    constructor(message: string, readonly status?: number) {
        super(message);
        this.name = 'DriveError';
    }
}

/** Signature minimale de fetch utilisée ici — permet d'injecter un mock dans les tests. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const resolveFetch = (f?: FetchLike): FetchLike => {
    if (f) return f;
    if (typeof fetch !== 'undefined') return fetch as unknown as FetchLike;
    throw new DriveError('fetch indisponible dans cet environnement');
};

function authHeader(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

/**
 * Convertit une réponse non-ok en erreur typée. On lit d'abord le corps (Google y met la vraie
 * raison) puis on distingue :
 *  - 401 = token réellement invalide/expiré → re-auth aide (DriveAuthError, silencieux au boot).
 *  - 403 = refusé MALGRÉ un token valide (API Drive non activée, scope drive.appdata manquant,
 *    consentement à refaire). Re-cliquer « Connecter » ne suffit PAS → message explicite + détail
 *    Google, surfacé comme DriveError (pas avalé silencieusement au boot).
 */
async function failFromResponse(res: Response): Promise<never> {
    let detail = '';
    try {
        detail = (await res.text()).slice(0, 300);
    } catch {
        /* corps illisible — on garde juste le status */
    }
    if (res.status === 401) throw new DriveAuthError();
    if (res.status === 403) {
        throw new DriveError(
            'Accès Drive refusé (403). Causes fréquentes : API Google Drive non activée dans le projet, ' +
                'ou autorisation « drive.appdata » non accordée (ajoute le scope puis Déconnecte/Reconnecte). ' +
                `Détail Google : ${detail || 'aucun'}`,
            403,
        );
    }
    throw new DriveError(`Drive a répondu ${res.status}${detail ? `: ${detail}` : ''}`, res.status);
}

export interface DriveFileRef {
    id: string;
    modifiedTime: string;
}

/** Cherche le fichier de sync dans appDataFolder. Retourne sa réf ou null s'il n'existe pas. */
export async function findSyncFile(token: string, fetchFn?: FetchLike): Promise<DriveFileRef | null> {
    const f = resolveFetch(fetchFn);
    const params = new URLSearchParams({
        spaces: 'appDataFolder',
        q: `name='${SYNC_FILE_NAME}'`,
        fields: 'files(id,modifiedTime)',
        pageSize: '1',
    });
    const res = await f(`${DRIVE_FILES}?${params.toString()}`, { headers: authHeader(token) });
    if (!res.ok) await failFromResponse(res);
    const data = (await res.json()) as { files?: DriveFileRef[] };
    const file = data.files?.[0];
    return file ? { id: file.id, modifiedTime: file.modifiedTime } : null;
}

/** Crée le fichier de sync (multipart : métadonnées + contenu). Retourne l'id créé. */
export async function createSyncFile(
    token: string,
    envelope: SyncEnvelope,
    fetchFn?: FetchLike,
): Promise<string> {
    const f = resolveFetch(fetchFn);
    const boundary = `fai-${Math.random().toString(36).slice(2)}`;
    const metadata = { name: SYNC_FILE_NAME, parents: ['appDataFolder'] };
    const body =
        `--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        'Content-Type: application/json\r\n\r\n' +
        `${JSON.stringify(envelope)}\r\n` +
        `--${boundary}--`;
    const res = await f(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id`, {
        method: 'POST',
        headers: { ...authHeader(token), 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
    });
    if (!res.ok) await failFromResponse(res);
    const data = (await res.json()) as { id?: string };
    if (!data.id) throw new DriveError('Création du fichier sans id retourné');
    return data.id;
}

/** Lit et parse le contenu du fichier de sync. */
export async function readSyncFile(
    token: string,
    fileId: string,
    fetchFn?: FetchLike,
): Promise<SyncEnvelope> {
    const f = resolveFetch(fetchFn);
    const res = await f(`${DRIVE_FILES}/${fileId}?alt=media`, { headers: authHeader(token) });
    if (!res.ok) await failFromResponse(res);
    try {
        return (await res.json()) as SyncEnvelope;
    } catch {
        throw new DriveError('Contenu du fichier de sync illisible (JSON invalide)');
    }
}

/** Remplace le contenu du fichier de sync existant (media). */
export async function updateSyncFile(
    token: string,
    fileId: string,
    envelope: SyncEnvelope,
    fetchFn?: FetchLike,
): Promise<void> {
    const f = resolveFetch(fetchFn);
    const res = await f(`${DRIVE_UPLOAD}/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: { ...authHeader(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
    });
    if (!res.ok) await failFromResponse(res);
}

/** Supprime le fichier de sync de l'appDataFolder. Idempotent : un 404 (déjà absent) = succès. */
export async function deleteSyncFile(token: string, fileId: string, fetchFn?: FetchLike): Promise<void> {
    const f = resolveFetch(fetchFn);
    const res = await f(`${DRIVE_FILES}/${fileId}`, { method: 'DELETE', headers: authHeader(token) });
    // 204 No Content = succès ; 404 = fichier déjà supprimé → on tolère (idempotent).
    if (!res.ok && res.status !== 404) await failFromResponse(res);
}

/**
 * Récupère l'identité Google : `email` (affichage) + `sub` (identifiant STABLE, sert à dériver la
 * clé de chiffrement des clés API — cf keyCipher). `{ null, null }` si indispo. Le scope
 * `userinfo.email` suffit : l'endpoint v3 renvoie `sub` et `email`.
 */
export async function fetchUserIdentity(
    token: string,
    fetchFn?: FetchLike,
): Promise<{ email: string | null; sub: string | null }> {
    const f = resolveFetch(fetchFn);
    try {
        const res = await f(USERINFO, { headers: authHeader(token) });
        if (!res.ok) {
            // D5 « ne jamais avaler » : un échec ici prive `sub` → la clé de chiffrement
            // des clés API ne peut plus être dérivée (clés non synchronisées/déchiffrables
            // sur les autres appareils). On loggue (warning : le caller gère le null
            // gracieusement, c'est best-effort) sans changer le repli existant.
            logError({
                source: 'network',
                severity: 'warning',
                message: `fetchUserIdentity: réponse Google ${res.status}`,
                context: { status: res.status },
            });
            return { email: null, sub: null };
        }
        const data = (await res.json()) as { email?: string; sub?: string };
        return { email: data.email ?? null, sub: data.sub ?? null };
    } catch (e) {
        logError({
            source: 'network',
            severity: 'warning',
            message: 'fetchUserIdentity: échec réseau',
            error: e,
        });
        return { email: null, sub: null };
    }
}

/** Récupère l'email du compte Google connecté (nécessite le scope email). null si indispo. */
export async function fetchUserEmail(token: string, fetchFn?: FetchLike): Promise<string | null> {
    return (await fetchUserIdentity(token, fetchFn)).email;
}
