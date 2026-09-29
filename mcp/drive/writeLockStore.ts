// mcp/drive/writeLockStore.ts
//
// [VERROU-ECRITURE] Étape 2 — LECTURE SEULE du verrou d'écriture MCP, depuis le fichier
// `financeai-write-lock.json` de l'appDataFolder Drive (même dossier que financeai-sync.json, un
// fichier DIFFÉRENT). Contenu attendu : `{ deverrouilleJusqua: <ISO>, version: 1 }`. Aucune donnée
// financière dedans.
//
// ⚠️ POINT DE SÉCURITÉ CENTRAL (voir plan §4) : ce module n'expose AUCUNE fonction de création ou de
// prolongation du verrou — seule l'app web écrit ce fichier (services/googleDrive/writeLock.ts). Un
// modèle piégé par un document, même s'il compromettait totalement le serveur MCP applicatif, n'a
// ICI aucun appel possible qui déverrouille : le code pour le faire n'existe simplement pas dans ce
// fichier. Un test structurel (tests/mcp/verrouEcritureIntegration.test.ts) vérifie qu'aucun
// `mcp/tools/*.tool.ts` n'importe ce module directement (seul `driveStateSource.ts` le fait).
//
// Échec fermé PARTOUT : réseau, fichier absent, JSON invalide, champ manquant ou invalide, jeton
// d'accès indisponible → verrou considéré FERMÉ. Jamais un repli « ouvert » par défaut.

import { findAppDataFileByName, readAppDataFile, type FetchLike } from '../../services/googleDrive/driveAppData';

/** Nom du fichier de verrou dans appDataFolder — DIFFÉRENT de financeai-sync.json (aucun conflit). */
export const WRITE_LOCK_FILE_NAME = 'financeai-write-lock.json';

/** Cache mémoire COURT (≤ 10 s) : évite un appel Drive à chaque appel d'outil, jamais plus long
 *  (le verrou doit rester réactif à une fermeture manuelle par Marc). */
const CACHE_TTL_MS_DEFAUT = 10_000;

/** Fournit un jeton d'accès Drive valide (même contrat que DriveStateSource). */
export type TokenProvider = () => Promise<string>;

interface WriteLockPayloadBrut {
    deverrouilleJusqua?: unknown;
    version?: unknown;
}

/** Vrai si `payload` décrit un verrou OUVERT à l'instant `maintenant` (ms epoch). Fonction PURE,
 *  aucune exception : une forme inattendue est traitée comme fermée (jamais un throw). */
function estOuvert(payload: unknown, maintenant: number): boolean {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
    const brut = (payload as WriteLockPayloadBrut).deverrouilleJusqua;
    if (typeof brut !== 'string') return false;
    const jusqua = Date.parse(brut);
    if (!Number.isFinite(jusqua)) return false;
    return jusqua > maintenant; // borne STRICTE : exactement à l'échéance = fermé
}

/**
 * Fabrique un vérificateur de verrou (fonction sans argument, réutilisable à chaque appel d'outil
 * d'écriture). Le cache court est capturé dans la fermeture : une instance par `DriveStateSource`
 * (donc par processus serveur — cohérent avec Cloud Run 0 instance minimum, cf plan C7).
 */
export function creerVerificateurVerrou(
    getToken: TokenProvider,
    fetchFn?: FetchLike,
    opts?: { ttlMs?: number; now?: () => number },
): () => Promise<boolean> {
    const ttl = opts?.ttlMs ?? CACHE_TTL_MS_DEFAUT;
    const now = opts?.now ?? (() => Date.now());
    let cache: { at: number; ouvert: boolean } | null = null;

    return async function verifierVerrou(): Promise<boolean> {
        const t = now();
        if (cache && t - cache.at < ttl) return cache.ouvert;
        let ouvert = false; // échec fermé par défaut : toute sortie anticipée ci-dessous reste `false`.
        try {
            const token = await getToken();
            const ref = await findAppDataFileByName(token, WRITE_LOCK_FILE_NAME, fetchFn);
            if (ref) {
                const payload = await readAppDataFile<unknown>(token, ref.id, fetchFn);
                ouvert = estOuvert(payload, t);
            }
        } catch {
            // Réseau, jeton OAuth expiré, JSON invalide, statut HTTP non-ok… : `ouvert` reste `false`.
            // Jamais de fail-open sur une erreur (plan §4, « échec fermé partout »).
        }
        cache = { at: t, ouvert };
        return ouvert;
    };
}
