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
/**
 * Ids dont le fetch a raté, avec l'horodatage du raté. ⚠️ TTL et non « à vie » (finding panel
 * MOYEN) : l'appareil B peut fetcher AVANT que le push fire-and-forget de l'appareil A n'aboutisse
 * (course de sync) — un raté mémorisé définitivement rendait le contenu introuvable pour toute la
 * session alors qu'il arrivait sur Drive quelques secondes plus tard. Re-tentative après le TTL
 * (coût borné : un listing par tentative, jamais en boucle serrée).
 */
const _fetchMissedAt = new Map<string, number>();
const FETCH_RETRY_AFTER_MS = 60_000;

/** Purge des mémos de session (tests + changement de compte/déconnexion Drive — hygiène). */
export function resetAttachmentDriveMemos(): void {
    _pushed.clear();
    _fetchMissedAt.clear();
}
/** Alias test (nom historique). */
export const _resetAttachmentDriveStoreForTests = resetAttachmentDriveMemos;

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
        now?: () => number;
    },
): Promise<AiAttachmentPayload[] | null> {
    const now = deps?.now ?? Date.now;
    const missedAt = _fetchMissedAt.get(messageId);
    if (missedAt !== undefined && now() - missedAt < FETCH_RETRY_AFTER_MS) return null;
    const token = deps?.token !== undefined ? deps.token : getCachedToken();
    if (!token) return null;
    try {
        const list = deps?.list ?? listAppDataFiles;
        const read = deps?.read ?? (readSyncFile as (t: string, id: string) => Promise<unknown>);
        const files = await list(token, fileNameFor(messageId));
        const exact = files.find((f) => f.name === fileNameFor(messageId));
        if (!exact) {
            _fetchMissedAt.set(messageId, now()); // re-tenté après le TTL (push de l'autre appareil en cours ?)
            return null;
        }
        const raw = (await read(token, exact.id)) as Partial<AttachmentFilePayload> | null;
        const payloads = Array.isArray(raw?.payloads) ? raw!.payloads : null;
        if (!payloads || payloads.length === 0) {
            _fetchMissedAt.set(messageId, now());
            return null;
        }
        // Le message est de nouveau poussable ? Non — il EXISTE déjà sur Drive : marquer poussé.
        _pushed.add(messageId);
        _fetchMissedAt.delete(messageId);
        return payloads;
    } catch (e) {
        _fetchMissedAt.set(messageId, now());
        logError({
            source: 'network', severity: 'warning',
            message: 'Chat in-app : lecture Drive d\'une pièce jointe échouée (repli : contenu non disponible).',
            error: e instanceof Error ? e : new Error(String(e)),
        });
        return null;
    }
}

/**
 * [Finding panel CRITIQUE — droit à l'effacement, Loi 25] Supprime TOUS les fichiers de pièces
 * jointes du chat (`financeai-chat-attach-*`) du Drive. Appelé par `deleteRemoteData` (« Supprimer
 * mes données de Google Drive ») : sans ce wipe, les relevés/PDF joints au chat restaient dans
 * l'appDataFolder après un effacement explicitement libellé irréversible. Throw sur échec de
 * LISTING (l'appelant doit savoir que le wipe n'a pas pu se faire) ; échec par-fichier tracé.
 */
export async function deleteAllChatAttachmentsFromDrive(
    token: string,
    deps?: { list?: typeof listAppDataFiles; remove?: typeof deleteSyncFile },
): Promise<void> {
    const list = deps?.list ?? listAppDataFiles;
    const remove = deps?.remove ?? deleteSyncFile;
    const files = await list(token, FILE_PREFIX);
    let failed = 0;
    for (const f of files) {
        if (!f.name.startsWith(FILE_PREFIX)) continue;
        try {
            await remove(token, f.id);
        } catch {
            failed++;
        }
    }
    resetAttachmentDriveMemos();
    if (failed > 0) {
        logError({
            source: 'network', severity: 'warning',
            message: `Suppression Drive : ${failed} fichier(s) de pièce jointe du chat non supprimé(s) (réessaie « Supprimer mes données »).`,
        });
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
        // Une seule requête de listing PAGINÉ (préfixe commun), puis suppression des correspondances.
        const files = await list(token, FILE_PREFIX);
        const wanted = new Map(messageIds.map((id) => [fileNameFor(id), id]));
        let failed = 0;
        for (const f of files) {
            const msgId = wanted.get(f.name);
            if (msgId === undefined) continue;
            try {
                await remove(token, f.id); // 404 déjà toléré par deleteSyncFile (idempotent)
                _pushed.delete(msgId);
                _fetchMissedAt.delete(msgId);
            } catch {
                // [Finding panel ÉLEVÉ] JAMAIS un swallow inconditionnel : un 403/500/timeout réel
                // laisse un ORPHELIN dans le Drive (des relevés « supprimés » qui restent) — tracé,
                // et le mémo _pushed est CONSERVÉ (une future suppression pourra retenter).
                failed++;
            }
        }
        if (failed > 0) {
            logError({
                source: 'network', severity: 'warning',
                message: `Chat in-app : ${failed} fichier(s) de pièce jointe non supprimé(s) du Drive (orphelins — retentés à la prochaine suppression).`,
            });
        }
    } catch (e) {
        logError({
            source: 'network', severity: 'warning',
            message: 'Chat in-app : nettoyage Drive des pièces jointes échoué (fichiers orphelins possibles).',
            error: e instanceof Error ? e : new Error(String(e)),
        });
    }
}
