// services/aiChat/attachmentDriveStore.ts
//
// [B2-CHAT-HISTORY] Pièces jointes du chat CROSS-DEVICE : les OCTETS (base64/texte) ne vont JAMAIS
// dans l'état synchronisé (ADR-4 — le push Drive resterait léger) ; ils sont stockés en FICHIERS
// SÉPARÉS du dossier caché appDataFolder (design validé Marc : « jamais inline base64 »).
//
//  - UPLOAD best-effort à l'envoi (fire-and-forget : un échec ne bloque JAMAIS le message — le
//    repli est le comportement B1 : note honnête « contenu non disponible » sur l'autre appareil) ;
//  - FETCH au cache-miss (autre appareil / après reload) pendant la construction de l'historique,
//    UNIQUEMENT si un jeton Drive est déjà en cache (jamais de popup déclenchée par le chat) ;
//  - DELETE quand la conversation est supprimée (pas d'orphelins accumulés à vie) ;
//  - un fichier par MESSAGE : `financeai-chat-attach-<msgId>.json` = payloads complets (méta+octets).
//
// Aucun secret : le contenu vit dans le Drive PRIVÉ de l'utilisateur (même modèle que le fichier de
// sync). Skip silencieux hors navigateur / sans jeton (le chat marche sans Drive).

import type { AiAttachmentPayload } from './attachments';
import {
    createAppDataFile, listAppDataFiles, readSyncFile, deleteSyncFile,
} from '../googleDrive/driveAppData';
import { getCachedToken } from '../googleDrive/gisAuth';
import { logError } from '../errorLogger';

const FILE_PREFIX = 'financeai-chat-attach-';

const fileNameFor = (messageId: string): string => `${FILE_PREFIX}${messageId}.json`;

interface AttachmentFilePayload {
    version: 1;
    messageId: string;
    payloads: AiAttachmentPayload[];
}

/** Ids de messages déjà poussés CETTE session (dédup — l'historique se reconstruit à chaque envoi). */
const _pushed = new Set<string>();
/** Ids dont le fetch a échoué/rendu vide cette session (pas de re-fetch en boucle à chaque tour). */
const _fetchMissed = new Set<string>();

/** Reset (tests). */
export function _resetAttachmentDriveStoreForTests(): void {
    _pushed.clear();
    _fetchMissed.clear();
}

/**
 * Pousse les payloads d'un message vers Drive (best-effort, fire-and-forget). Jamais de throw :
 * un échec est journalisé et le message part quand même (dégradation = B1, honnête cross-device).
 */
export function pushAttachmentsToDrive(
    messageId: string,
    payloads: AiAttachmentPayload[],
    deps?: { token?: string | null; create?: typeof createAppDataFile },
): void {
    if (payloads.length === 0 || _pushed.has(messageId)) return;
    const token = deps?.token !== undefined ? deps.token : getCachedToken();
    if (!token) return; // pas connecté à Drive → comportement B1 (session locale seulement)
    _pushed.add(messageId);
    const create = deps?.create ?? createAppDataFile;
    const body: AttachmentFilePayload = { version: 1, messageId, payloads };
    void create(token, fileNameFor(messageId), body).catch((e) => {
        _pushed.delete(messageId); // ré-essayable au prochain envoi
        logError({
            source: 'network', severity: 'warning',
            message: 'Chat in-app : sauvegarde Drive d\'une pièce jointe échouée (contenu indisponible sur les autres appareils).',
            error: e instanceof Error ? e : new Error(String(e)),
        });
    });
}

/**
 * Récupère les payloads d'un message depuis Drive (cache-miss local : autre appareil ou reload).
 * Retourne null si indisponible (pas de jeton, fichier absent, échec réseau) — l'appelant retombe
 * sur la note honnête. Un id raté n'est PAS re-tenté dans la même session (pas de latence répétée).
 */
export async function fetchAttachmentsFromDrive(
    messageId: string,
    deps?: {
        token?: string | null;
        list?: typeof listAppDataFiles;
        read?: (token: string, fileId: string) => Promise<unknown>;
    },
): Promise<AiAttachmentPayload[] | null> {
    if (_fetchMissed.has(messageId)) return null;
    const token = deps?.token !== undefined ? deps.token : getCachedToken();
    if (!token) return null;
    try {
        const list = deps?.list ?? listAppDataFiles;
        const read = deps?.read ?? (readSyncFile as (t: string, id: string) => Promise<unknown>);
        const files = await list(token, fileNameFor(messageId));
        const exact = files.find((f) => f.name === fileNameFor(messageId));
        if (!exact) {
            _fetchMissed.add(messageId);
            return null;
        }
        const raw = (await read(token, exact.id)) as Partial<AttachmentFilePayload> | null;
        const payloads = Array.isArray(raw?.payloads) ? raw!.payloads : null;
        if (!payloads || payloads.length === 0) {
            _fetchMissed.add(messageId);
            return null;
        }
        // Le message est de nouveau poussable ? Non — il EXISTE déjà sur Drive : marquer poussé.
        _pushed.add(messageId);
        return payloads;
    } catch (e) {
        _fetchMissed.add(messageId);
        logError({
            source: 'network', severity: 'warning',
            message: 'Chat in-app : lecture Drive d\'une pièce jointe échouée (repli : contenu non disponible).',
            error: e instanceof Error ? e : new Error(String(e)),
        });
        return null;
    }
}

/**
 * Supprime les fichiers Drive des messages donnés (suppression de conversation). Best-effort,
 * séquentiel (volumes minuscules), jamais de throw.
 */
export async function deleteAttachmentsFromDrive(
    messageIds: string[],
    deps?: {
        token?: string | null;
        list?: typeof listAppDataFiles;
        remove?: typeof deleteSyncFile;
    },
): Promise<void> {
    if (messageIds.length === 0) return;
    const token = deps?.token !== undefined ? deps.token : getCachedToken();
    if (!token) return;
    const list = deps?.list ?? listAppDataFiles;
    const remove = deps?.remove ?? deleteSyncFile;
    try {
        // Une seule requête de listing (préfixe commun), puis suppression des correspondances.
        const files = await list(token, FILE_PREFIX);
        const wanted = new Set(messageIds.map(fileNameFor));
        for (const f of files) {
            if (wanted.has(f.name)) {
                await remove(token, f.id).catch(() => undefined); // idempotent, best-effort
            }
        }
        for (const id of messageIds) { _pushed.delete(id); _fetchMissed.delete(id); }
    } catch (e) {
        logError({
            source: 'network', severity: 'warning',
            message: 'Chat in-app : nettoyage Drive des pièces jointes échoué (fichiers orphelins possibles).',
            error: e instanceof Error ? e : new Error(String(e)),
        });
    }
}
