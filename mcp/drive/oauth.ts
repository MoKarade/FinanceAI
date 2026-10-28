// mcp/drive/oauth.ts
//
// Lot 3 — OAuth Google « installed app » (loopback) pour le connecteur LOCAL (Claude Desktop).
// Aucune dépendance : juste `fetch` + URLSearchParams. Trois primitives PURES (fetch injectable) :
//   - buildAuthUrl : l'URL de consentement (access_type=offline + prompt=consent → refresh token) ;
//   - exchangeCodeForTokens : code → { access_token, refresh_token, expires_in } ;
//   - refreshAccessToken : refresh_token → { access_token, expires_in }.
// Le flux interactif (serveur loopback + ouverture navigateur) vit dans loopbackAuth.ts ; le stockage
// du refresh token dans tokenStore.ts. Conçu pour Claude Desktop : le jeton reste sur la machine de Marc.

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** Scopes minimaux : dossier caché de l'app (PAS tout le Drive) + e-mail (identité). */
export const DRIVE_SCOPES = [
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/userinfo.email',
];

/** fetch minimal injectable (compatible avec le fetch global Node ≥18). */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
}

export function buildAuthUrl(opts: {
    clientId: string;
    redirectUri: string;
    scopes?: string[];
    state?: string;
}): string {
    const params = new URLSearchParams({
        client_id: opts.clientId,
        redirect_uri: opts.redirectUri,
        response_type: 'code',
        scope: (opts.scopes ?? DRIVE_SCOPES).join(' '),
        access_type: 'offline', // demande un refresh token
        prompt: 'consent', // force la ré-émission du refresh token même si déjà consenti
    });
    if (opts.state) params.set('state', opts.state);
    return `${AUTH_ENDPOINT}?${params.toString()}`;
}

async function postToken(body: URLSearchParams, fetchFn: FetchLike): Promise<TokenResponse> {
    const res = await fetchFn(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    if (!res.ok) {
        let detail = '';
        try { detail = await res.text(); } catch { /* ignore */ }
        throw new Error(`OAuth Google: requête token échouée (${res.status}). ${detail}`);
    }
    return (await res.json()) as TokenResponse;
}

export async function exchangeCodeForTokens(
    opts: { clientId: string; clientSecret: string; code: string; redirectUri: string },
    fetchFn: FetchLike = fetch,
): Promise<TokenResponse> {
    return postToken(
        new URLSearchParams({
            client_id: opts.clientId,
            client_secret: opts.clientSecret,
            code: opts.code,
            redirect_uri: opts.redirectUri,
            grant_type: 'authorization_code',
        }),
        fetchFn,
    );
}

export async function refreshAccessToken(
    opts: { clientId: string; clientSecret: string; refreshToken: string },
    fetchFn: FetchLike = fetch,
): Promise<TokenResponse> {
    return postToken(
        new URLSearchParams({
            client_id: opts.clientId,
            client_secret: opts.clientSecret,
            refresh_token: opts.refreshToken,
            grant_type: 'refresh_token',
        }),
        fetchFn,
    );
}
