// mcp/drive/tokenProvider.ts
//
// Lot 3 — fabrique le `TokenProvider` (jeton d'accès Drive) pour DriveStateSource, à partir des
// identifiants stockés localement : charge le refresh token, l'échange contre un access token, et le
// CACHE jusqu'à ~1 min avant expiration (évite un refresh à chaque requête). Aucune interaction.

import { refreshAccessToken, type FetchLike } from './oauth';
import type { TokenProvider } from './driveStateSource';
import { makeFileBackend, type CredentialsBackend } from '../auth/credentialsBackend';

const EXPIRY_MARGIN_MS = 60_000; // rafraîchit 60 s avant l'expiration réelle

export function makeDriveTokenProvider(opts?: {
    credentialsPath?: string;
    /** [MCP-CLOUDRUN-A] backend d'identifiants (fichier local par défaut ; Secret Manager sur Cloud Run). */
    backend?: CredentialsBackend;
    fetchFn?: FetchLike;
    now?: () => number;
}): TokenProvider {
    const now = opts?.now ?? (() => Date.now());
    const backend = opts?.backend ?? makeFileBackend(opts?.credentialsPath);
    let cache: { token: string; expiresAt: number } | null = null;

    return async (): Promise<string> => {
        if (cache && now() < cache.expiresAt - EXPIRY_MARGIN_MS) return cache.token;
        const creds = await backend.load();
        if (!creds) {
            throw new Error(
                "Connecteur non autorisé à accéder à ton Google Drive. Lance d'abord : npm run mcp:auth",
            );
        }
        let t;
        try {
            t = await refreshAccessToken(
                { clientId: creds.clientId, clientSecret: creds.clientSecret, refreshToken: creds.refreshToken },
                opts?.fetchFn,
            );
        } catch (err) {
            // [MCP-CLOUDRUN-A] `invalid_grant` = refresh token EXPIRÉ ou RÉVOQUÉ (pas une panne
            // réseau) → message ACTIONNABLE au lieu du texte brut de Google (le symptôme
            // historique du brief : « Token has been expired or revoked » sans piste).
            if (err instanceof Error && err.message.includes('invalid_grant')) {
                throw new Error(
                    'Autorisation Google EXPIRÉE ou RÉVOQUÉE (invalid_grant). Reconnecte le Drive : ' +
                    '`npm run mcp:auth` en local, puis re-provisionne le secret si le serveur tourne sur Cloud Run ' +
                    `(backend actuel : ${backend.description}).`,
                );
            }
            throw err;
        }
        cache = { token: t.access_token, expiresAt: now() + (t.expires_in ?? 3600) * 1000 };
        return cache.token;
    };
}
