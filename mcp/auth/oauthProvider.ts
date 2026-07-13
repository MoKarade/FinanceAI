// mcp/auth/oauthProvider.ts
//
// [MCP-CLOUDRUN-B] — mini serveur OAuth 2.1 MONO-UTILISATEUR pour l'auth
// Claude ↔ serveur MCP. Pourquoi pas un simple Bearer statique : l'UI des
// connecteurs custom de claude.ai n'offre QUE OAuth (vérifié 2026-07-13,
// cf BACKLOG §MCP-CLOUDRUN-B).
//
// Conception SANS ÉTAT (Cloud Run scale-to-zero : rien en mémoire ne survit) :
//   - tokens/codes = payload JSON signé HMAC-SHA256 (clé $FINANCEAI_OAUTH_SIGNING_KEY)
//     → n'importe quelle instance les vérifie, aucun stockage ;
//   - DCR (enregistrement dynamique de client) sans base : client_secret =
//     HMAC(client_id) → dérivable/vérifiable partout ;
//   - la VRAIE porte = la CLÉ D'ACCÈS de l'utilisateur ($FINANCEAI_ACCESS_KEY),
//     saisie une fois sur la page /oauth/authorize (comparaison constant-time).
//     PKCE S256 OBLIGATOIRE (OAuth 2.1) ; redirect_uri sur ALLOWLIST (claude.ai
//     + loopback) ET lié cryptographiquement au code.
//
// Module PUR (aucun réseau, aucune horloge implicite — `now` injectable) :
// le câblage HTTP vit dans mcp/http.ts.

import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export interface OAuthConfig {
    /** Clé HMAC de signature des tokens (≥ 32 caractères). */
    signingKey: string;
    /** Clé d'accès de l'utilisateur (la « porte » mono-user). */
    accessKey: string;
    /** URL publique de base du serveur (issuer), ex. https://financeai-mcp-…run.app */
    issuer: string;
    /** Origines HTTPS EXACTES de redirection admises (défaut : claude.ai/claude.com) ; le loopback
     *  (127.0.0.1/localhost, tout port) est toujours admis pour l'entrée « custom connector localhost ». */
    allowedOrigins?: string[];
    accessTokenTtlMs?: number;   // défaut 1 h
    refreshTokenTtlMs?: number;  // défaut 30 j
    codeTtlMs?: number;          // défaut 10 min
    now?: () => number;
}

/** Origines HTTPS exactes admises (comparaison sur `URL.origin`, jamais un préfixe de chaîne). */
const DEFAULT_ALLOWED_ORIGINS = ['https://claude.ai', 'https://claude.com'];
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

const b64url = (buf: Buffer): string => buf.toString('base64url');
const fromB64url = (s: string): Buffer => Buffer.from(s, 'base64url');

interface TokenPayload {
    t: 'access' | 'refresh' | 'code';
    cid: string;           // client_id
    exp: number;           // epoch ms
    ru?: string;           // redirect_uri (codes seulement)
    cc?: string;           // code_challenge S256 (codes seulement)
    jti: string;           // unicité
}

export interface TokenSet {
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;    // secondes
    refresh_token: string;
}

export class OAuthError extends Error {
    constructor(public code: string, message: string, public status = 400) {
        super(message);
    }
}

export function makeOAuthProvider(config: OAuthConfig) {
    if (config.signingKey.length < 32) throw new Error('FINANCEAI_OAUTH_SIGNING_KEY : 32 caractères minimum.');
    if (config.accessKey.length < 16) throw new Error('FINANCEAI_ACCESS_KEY : 16 caractères minimum.');
    const now = config.now ?? (() => Date.now());
    const accessTtl = config.accessTokenTtlMs ?? 60 * 60 * 1000;
    const refreshTtl = config.refreshTokenTtlMs ?? 30 * 24 * 60 * 60 * 1000;
    const codeTtl = config.codeTtlMs ?? 10 * 60 * 1000;
    const allowedOrigins = config.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS;

    // [sécurité] jti consommés (codes + refresh rotationnés) → single-use / anti-rejeu.
    // Best-effort en mémoire : sur un serveur mono-user (1 instance à la fois en pratique),
    // ça élimine le rejeu nominal. TTL borné = celui du refresh (le plus long) ; un GC lazy
    // purge les entrées expirées pour ne pas fuir la mémoire. Un cold-start Cloud Run vide le
    // set → le kill-switch en cas d'incident reste la rotation de FINANCEAI_OAUTH_SIGNING_KEY.
    const consumedJti = new Map<string, number>(); // jti → epoch d'expiration
    const consume = (jti: string, exp: number): boolean => {
        const t = now();
        if (consumedJti.size > 4096) {
            for (const [k, e] of consumedJti) if (e <= t) consumedJti.delete(k);
        }
        if (consumedJti.has(jti)) return false; // déjà utilisé
        consumedJti.set(jti, exp);
        return true;
    };

    const hmac = (data: string): Buffer => createHmac('sha256', config.signingKey).update(data).digest();

    const sign = (payload: TokenPayload): string => {
        const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
        return `fa1.${body}.${b64url(hmac(body))}`;
    };

    const verify = (token: string, kind: TokenPayload['t']): TokenPayload => {
        const parts = token.split('.');
        if (parts.length !== 3 || parts[0] !== 'fa1') throw new OAuthError('invalid_token', 'Format de jeton invalide.', 401);
        const expected = hmac(parts[1]);
        const given = fromB64url(parts[2]);
        if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
            throw new OAuthError('invalid_token', 'Signature de jeton invalide.', 401);
        }
        let payload: TokenPayload;
        try {
            payload = JSON.parse(fromB64url(parts[1]).toString('utf8')) as TokenPayload;
        } catch {
            throw new OAuthError('invalid_token', 'Charge de jeton illisible.', 401);
        }
        if (payload.t !== kind) throw new OAuthError('invalid_token', `Jeton de type ${payload.t} là où ${kind} est attendu.`, 401);
        if (now() >= payload.exp) throw new OAuthError('invalid_token', 'Jeton expiré.', 401);
        return payload;
    };

    /** client_secret DÉRIVÉ (stateless) : HMAC(client_id) — vérifiable par toute instance. */
    const deriveClientSecret = (clientId: string): string => b64url(hmac(`client:${clientId}`));

    const constantTimeEqual = (a: string, b: string): boolean => {
        const da = createHash('sha256').update(a, 'utf8').digest();
        const db = createHash('sha256').update(b, 'utf8').digest();
        return timingSafeEqual(da, db);
    };

    /** Compare l'ORIGINE EXACTE (jamais un préfixe de chaîne) et rejette tout userinfo embarqué
     *  (`http://127.0.0.1@evil.com` a pour host `evil.com`) — finding CRITIQUE panel 2026-07-13. */
    const isRedirectAllowed = (redirectUri: string): boolean => {
        let u: URL;
        try {
            u = new URL(redirectUri);
        } catch {
            return false;
        }
        if (u.username !== '' || u.password !== '') return false;
        if (LOOPBACK_HOSTS.has(u.hostname) && (u.protocol === 'http:' || u.protocol === 'https:')) return true;
        return allowedOrigins.includes(u.origin);
    };

    const issueTokens = (clientId: string): TokenSet => ({
        access_token: sign({ t: 'access', cid: clientId, exp: now() + accessTtl, jti: randomUUID() }),
        token_type: 'Bearer',
        expires_in: Math.floor(accessTtl / 1000),
        refresh_token: sign({ t: 'refresh', cid: clientId, exp: now() + refreshTtl, jti: randomUUID() }),
    });

    return {
        /** RFC 8414 — métadonnées du serveur d'autorisation. */
        authorizationServerMetadata: () => ({
            issuer: config.issuer,
            authorization_endpoint: `${config.issuer}/oauth/authorize`,
            token_endpoint: `${config.issuer}/oauth/token`,
            registration_endpoint: `${config.issuer}/oauth/register`,
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            code_challenge_methods_supported: ['S256'],
            token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
            scopes_supported: ['financeai'],
        }),

        /** URL de découverte RFC 9728 (pour le WWW-Authenticate du 401). */
        resourceMetadataUrl: () => `${config.issuer}/.well-known/oauth-protected-resource`,

        /** RFC 9728 — métadonnées de la ressource protégée (découverte MCP). */
        protectedResourceMetadata: () => ({
            resource: `${config.issuer}/mcp`,
            authorization_servers: [config.issuer],
            bearer_methods_supported: ['header'],
        }),

        /** DCR (RFC 7591) sans stockage : le secret est dérivé du client_id. */
        registerClient: (redirectUris: string[]) => {
            if (!redirectUris.length || !redirectUris.every(isRedirectAllowed)) {
                throw new OAuthError('invalid_redirect_uri',
                    `redirect_uris hors allowlist (origines admises : ${allowedOrigins.join(', ')} ou loopback).`);
            }
            const clientId = randomUUID();
            return {
                client_id: clientId,
                client_secret: deriveClientSecret(clientId),
                redirect_uris: redirectUris,
                token_endpoint_auth_method: 'client_secret_post',
                grant_types: ['authorization_code', 'refresh_token'],
            };
        },

        /** Validation des paramètres d'une requête /oauth/authorize (AVANT d'afficher le formulaire). */
        validateAuthorizeRequest: (q: {
            response_type?: string; client_id?: string; redirect_uri?: string;
            code_challenge?: string; code_challenge_method?: string;
        }) => {
            if (q.response_type !== 'code') throw new OAuthError('unsupported_response_type', 'response_type=code requis (OAuth 2.1).');
            if (!q.client_id) throw new OAuthError('invalid_request', 'client_id manquant.');
            if (!q.redirect_uri || !isRedirectAllowed(q.redirect_uri)) {
                throw new OAuthError('invalid_request', 'redirect_uri manquant ou hors allowlist.');
            }
            if (!q.code_challenge || q.code_challenge_method !== 'S256') {
                throw new OAuthError('invalid_request', 'PKCE S256 obligatoire (code_challenge + code_challenge_method=S256).');
            }
        },

        /** Après saisie de la clé d'accès : émet le code d'autorisation (signé, lié au client/redirect/PKCE). */
        authorize: (params: { clientId: string; redirectUri: string; codeChallenge: string; accessKey: string }) => {
            // Ceinture + bretelles : `authorize` re-vérifie l'allowlist lui-même (ne dépend pas
            // de la discipline de l'appelant — finding #4 panel 2026-07-13).
            if (!isRedirectAllowed(params.redirectUri)) {
                throw new OAuthError('invalid_request', 'redirect_uri hors allowlist.');
            }
            if (!constantTimeEqual(params.accessKey, config.accessKey)) {
                throw new OAuthError('access_denied', 'Clé d’accès invalide.', 403);
            }
            return sign({
                t: 'code', cid: params.clientId, exp: now() + codeTtl,
                ru: params.redirectUri, cc: params.codeChallenge, jti: randomUUID(),
            });
        },

        /** grant_type=authorization_code — vérifie code + PKCE + client, émet access+refresh. */
        exchangeCode: (params: {
            code: string; clientId: string; clientSecret?: string;
            redirectUri: string; codeVerifier: string;
        }): TokenSet => {
            const payload = verify(params.code, 'code');
            // OAuth 2.1 : le code est à USAGE UNIQUE (anti-rejeu — finding #2 panel).
            if (!consume(payload.jti, payload.exp)) throw new OAuthError('invalid_grant', 'Code déjà utilisé.');
            if (payload.cid !== params.clientId) throw new OAuthError('invalid_grant', 'Code émis pour un autre client.');
            if (payload.ru !== params.redirectUri) throw new OAuthError('invalid_grant', 'redirect_uri différent de celui du code.');
            // Client confidentiel : secret dérivé exigé s'il est fourni ; PKCE couvre le client public.
            if (params.clientSecret != null && !constantTimeEqual(params.clientSecret, deriveClientSecret(params.clientId))) {
                throw new OAuthError('invalid_client', 'client_secret invalide.', 401);
            }
            const challenge = b64url(createHash('sha256').update(params.codeVerifier, 'utf8').digest());
            if (challenge !== payload.cc) throw new OAuthError('invalid_grant', 'Vérification PKCE échouée.');
            return issueTokens(params.clientId);
        },

        /** grant_type=refresh_token — rotation (OAuth 2.1 : nouveau refresh à chaque usage). */
        refreshGrant: (params: { refreshToken: string; clientId: string; clientSecret?: string }): TokenSet => {
            const payload = verify(params.refreshToken, 'refresh');
            if (payload.cid !== params.clientId) throw new OAuthError('invalid_grant', 'Refresh token émis pour un autre client.');
            if (params.clientSecret != null && !constantTimeEqual(params.clientSecret, deriveClientSecret(params.clientId))) {
                throw new OAuthError('invalid_client', 'client_secret invalide.', 401);
            }
            // Rotation OAuth 2.1 : l'ancien refresh token est INVALIDÉ (best-effort mémoire) — finding #3.
            if (!consume(payload.jti, payload.exp)) throw new OAuthError('invalid_grant', 'Refresh token déjà utilisé (rotation).');
            return issueTokens(payload.cid);
        },

        /** Garde du endpoint /mcp : jette OAuthError(401) si le Bearer est absent/invalide/expiré. */
        verifyAccessToken: (authorizationHeader: string | undefined): void => {
            // Scheme insensible à la casse (RFC 7235) : « bearer <token> » aussi accepté.
            const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
            if (!match) throw new OAuthError('invalid_token', 'Jeton Bearer requis.', 401);
            verify(match[1].trim(), 'access');
        },
    };
}

export type OAuthProvider = ReturnType<typeof makeOAuthProvider>;
