// services/googleDrive/writeLock.ts
//
// [VERROU-ECRITURE] Étape 2 — SEUL endroit qui peut créer, prolonger ou fermer le verrou d'écriture
// MCP (financeai-write-lock.json, appDataFolder). Le serveur MCP (mcp/drive/writeLockStore.ts) ne
// fait que LIRE ce fichier : aucun outil claude.ai n'a de moyen de l'atteindre. Même patron Drive que
// financeai-sync.json (services/googleDrive/driveAppData.ts), aucun nouveau scope OAuth requis.
//
// Contenu du fichier : `{ deverrouilleJusqua: <ISO>, version: 1 }`. Aucune donnée financière.

import {
    findAppDataFileByName,
    readAppDataFile,
    createAppDataFile,
    updateAppDataFile,
    type FetchLike,
} from './driveAppData';

/** Nom du fichier de verrou dans appDataFolder — DIFFÉRENT de financeai-sync.json. */
export const WRITE_LOCK_FILE_NAME = 'financeai-write-lock.json';

interface WriteLockPayload {
    deverrouilleJusqua: string;
    version: 1;
}

export interface EtatEcriture {
    /** ISO de fin de fenêtre, ou `null` si jamais activé / fichier absent / lecture en échec. */
    deverrouilleJusqua: string | null;
}

/** Lit l'état courant du verrou. Toute erreur (réseau, fichier absent, JSON invalide) → `null`
 *  (affiché comme « verrouillé » côté app — cohérent avec l'échec fermé du serveur MCP, même si
 *  cette lecture-ci ne bloque AUCUNE écriture elle-même : c'est le MCP qui applique le verrou). */
export async function lireEtatEcriture(token: string, fetchFn?: FetchLike): Promise<EtatEcriture> {
    try {
        const ref = await findAppDataFileByName(token, WRITE_LOCK_FILE_NAME, fetchFn);
        if (!ref) return { deverrouilleJusqua: null };
        const payload = await readAppDataFile<Partial<WriteLockPayload>>(token, ref.id, fetchFn);
        return { deverrouilleJusqua: typeof payload.deverrouilleJusqua === 'string' ? payload.deverrouilleJusqua : null };
    } catch {
        return { deverrouilleJusqua: null };
    }
}

/** Autorise les écritures pendant `minutes` à partir de maintenant. Crée le fichier s'il n'existe pas
 *  encore, sinon le met à jour (jamais de doublon). */
export async function activerEcriture(
    minutes: number,
    token: string,
    fetchFn?: FetchLike,
    opts?: { now?: () => number },
): Promise<void> {
    const now = opts?.now ?? (() => Date.now());
    const payload: WriteLockPayload = { deverrouilleJusqua: new Date(now() + minutes * 60_000).toISOString(), version: 1 };
    const ref = await findAppDataFileByName(token, WRITE_LOCK_FILE_NAME, fetchFn);
    if (ref) await updateAppDataFile(token, ref.id, payload, fetchFn);
    else await createAppDataFile(token, WRITE_LOCK_FILE_NAME, payload, fetchFn);
}

/** Referme le verrou immédiatement (écrit une échéance déjà passée). Si le fichier n'existe pas
 *  encore, rien à faire : l'état par défaut (aucun fichier) est déjà « verrouillé ». */
export async function desactiverEcriture(
    token: string,
    fetchFn?: FetchLike,
    opts?: { now?: () => number },
): Promise<void> {
    const now = opts?.now ?? (() => Date.now());
    const ref = await findAppDataFileByName(token, WRITE_LOCK_FILE_NAME, fetchFn);
    if (!ref) return;
    const payload: WriteLockPayload = { deverrouilleJusqua: new Date(now() - 1).toISOString(), version: 1 };
    await updateAppDataFile(token, ref.id, payload, fetchFn);
}
