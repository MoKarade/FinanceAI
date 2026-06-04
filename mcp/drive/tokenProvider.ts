// mcp/drive/tokenProvider.ts
//
// Lot 3 — fabrique le `TokenProvider` (jeton d'accès Drive) pour DriveStateSource, à partir des
// identifiants stockés localement : charge le refresh token, l'échange contre un access token, et le
// CACHE jusqu'à ~1 min avant expiration (évite un refresh à chaque requête). Aucune interaction.

import { loadCredentials } from './tokenStore';
import { refreshAccessToken, type FetchLike } from './oauth';
import type { TokenProvider } from './driveStateSource';

const EXPIRY_MARGIN_MS = 60_000; // rafraîchit 60 s avant l'expiration réelle

export function makeDriveTokenProvider(opts?: {
    credentialsPath?: string;
    fetchFn?: FetchLike;
    now?: () => number;
}): TokenProvider {
    const now = opts?.now ?? (() => Date.now());
    let cache: { token: string; expiresAt: number } | null = null;

    return async (): Promise<string> => {
        if (cache && now() < cache.expiresAt - EXPIRY_MARGIN_MS) return cache.token;
        const creds = await loadCredentials(opts?.credentialsPath);
        if (!creds) {
            throw new Error(
                "Connecteur non autorisé à accéder à ton Google Drive. Lance d'abord : npm run mcp:auth",
            );
        }
        const t = await refreshAccessToken(
            { clientId: creds.clientId, clientSecret: creds.clientSecret, refreshToken: creds.refreshToken },
            opts?.fetchFn,
        );
        cache = { token: t.access_token, expiresAt: now() + (t.expires_in ?? 3600) * 1000 };
        return cache.token;
    };
}
