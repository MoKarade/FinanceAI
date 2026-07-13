// tests/mcp/oauthProvider.test.ts
//
// [MCP-CLOUDRUN-B] — unités PURES du mini serveur OAuth 2.1 mono-utilisateur :
// signature/expiration/altération des jetons (horloge injectée), PKCE S256,
// DCR stateless (secret dérivé), clé d'accès constant-time, allowlist.

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { makeOAuthProvider, OAuthError } from '../../mcp/auth/oauthProvider';

const SIGNING_KEY = 's'.repeat(48);
const ACCESS_KEY = 'cle-acces-de-test-longue';
const ISSUER = 'https://mcp.example.test';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

function providerAt(nowMs: () => number) {
    return makeOAuthProvider({
        signingKey: SIGNING_KEY, accessKey: ACCESS_KEY, issuer: ISSUER, now: nowMs,
    });
}

const s256 = (verifier: string): string =>
    createHash('sha256').update(verifier, 'utf8').digest('base64url');

/** Flux complet jusqu'aux tokens (helper). */
function fullFlow(p: ReturnType<typeof providerAt>) {
    const client = p.registerClient([REDIRECT]);
    const verifier = 'verificateur-pkce-suffisamment-long-0123456789';
    const code = p.authorize({
        clientId: client.client_id, redirectUri: REDIRECT,
        codeChallenge: s256(verifier), accessKey: ACCESS_KEY,
    });
    const tokens = p.exchangeCode({
        code, clientId: client.client_id, clientSecret: client.client_secret,
        redirectUri: REDIRECT, codeVerifier: verifier,
    });
    return { client, tokens, verifier };
}

describe('oauthProvider — flux nominal', () => {
    it('register → authorize → exchange → Bearer accepté ; refresh ROTATIONNE', () => {
        let t = 1_000_000;
        const p = providerAt(() => t);
        const { client, tokens } = fullFlow(p);
        expect(tokens.token_type).toBe('Bearer');
        expect(() => p.verifyAccessToken(`Bearer ${tokens.access_token}`)).not.toThrow();

        const refreshed = p.refreshGrant({
            refreshToken: tokens.refresh_token, clientId: client.client_id, clientSecret: client.client_secret,
        });
        expect(refreshed.access_token).not.toBe(tokens.access_token);
        expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);
        t += 1; // l'horloge n'a presque pas bougé : les nouveaux jetons restent valides
        expect(() => p.verifyAccessToken(`Bearer ${refreshed.access_token}`)).not.toThrow();
    });

    it('le client_secret DCR est DÉRIVÉ : une autre instance (même clé) le re-vérifie', () => {
        const p1 = providerAt(() => 0);
        const p2 = providerAt(() => 0); // « autre instance Cloud Run » — même signingKey, zéro état partagé
        const client = p1.registerClient([REDIRECT]);
        const verifier = 'verificateur-pkce-suffisamment-long-0123456789';
        const code = p1.authorize({
            clientId: client.client_id, redirectUri: REDIRECT,
            codeChallenge: s256(verifier), accessKey: ACCESS_KEY,
        });
        // p2 n'a JAMAIS vu ce client ni ce code → doit quand même tout vérifier (stateless).
        const tokens = p2.exchangeCode({
            code, clientId: client.client_id, clientSecret: client.client_secret,
            redirectUri: REDIRECT, codeVerifier: verifier,
        });
        expect(() => p1.verifyAccessToken(`Bearer ${tokens.access_token}`)).not.toThrow();
    });
});

describe('oauthProvider — rejets', () => {
    it('clé d’accès invalide → access_denied 403 (jamais de code émis)', () => {
        const p = providerAt(() => 0);
        const client = p.registerClient([REDIRECT]);
        expect(() => p.authorize({
            clientId: client.client_id, redirectUri: REDIRECT,
            codeChallenge: s256('v'), accessKey: 'mauvaise-cle',
        })).toThrowError(expect.objectContaining({ code: 'access_denied', status: 403 }));
    });

    it('PKCE : mauvais verifier → invalid_grant', () => {
        const p = providerAt(() => 0);
        const client = p.registerClient([REDIRECT]);
        const code = p.authorize({
            clientId: client.client_id, redirectUri: REDIRECT,
            codeChallenge: s256('le-bon-verifier'), accessKey: ACCESS_KEY,
        });
        expect(() => p.exchangeCode({
            code, clientId: client.client_id, redirectUri: REDIRECT, codeVerifier: 'un-autre-verifier',
        })).toThrowError(expect.objectContaining({ code: 'invalid_grant' }));
    });

    it('jeton ALTÉRÉ (1 caractère) → invalid_token', () => {
        const p = providerAt(() => 0);
        const { tokens } = fullFlow(p);
        const tampered = tokens.access_token.slice(0, -2) + (tokens.access_token.endsWith('A') ? 'B' : 'A') + tokens.access_token.slice(-1);
        expect(() => p.verifyAccessToken(`Bearer ${tampered}`))
            .toThrowError(expect.objectContaining({ code: 'invalid_token', status: 401 }));
    });

    it('jeton signé par une AUTRE clé → invalid_token', () => {
        const other = makeOAuthProvider({
            signingKey: 'x'.repeat(48), accessKey: ACCESS_KEY, issuer: ISSUER, now: () => 0,
        });
        const p = providerAt(() => 0);
        const { tokens } = fullFlow(other);
        expect(() => p.verifyAccessToken(`Bearer ${tokens.access_token}`)).toThrow(OAuthError);
    });

    it('expiration : access token mort après 1 h, code après 10 min (horloge injectée)', () => {
        let t = 0;
        const p = providerAt(() => t);
        const { client, tokens } = fullFlow(p);
        t = 60 * 60 * 1000 + 1;
        expect(() => p.verifyAccessToken(`Bearer ${tokens.access_token}`))
            .toThrowError(/expiré/i);
        t = 0;
        const code = p.authorize({
            clientId: client.client_id, redirectUri: REDIRECT,
            codeChallenge: s256('v2'), accessKey: ACCESS_KEY,
        });
        t = 10 * 60 * 1000 + 1;
        expect(() => p.exchangeCode({
            code, clientId: client.client_id, redirectUri: REDIRECT, codeVerifier: 'v2',
        })).toThrow(OAuthError);
    });

    it('code lié au client ET au redirect_uri : tout écart → invalid_grant', () => {
        const p = providerAt(() => 0);
        const client = p.registerClient([REDIRECT]);
        const verifier = 'verificateur-pkce-suffisamment-long-0123456789';
        const code = p.authorize({
            clientId: client.client_id, redirectUri: REDIRECT,
            codeChallenge: s256(verifier), accessKey: ACCESS_KEY,
        });
        expect(() => p.exchangeCode({
            code, clientId: 'autre-client', redirectUri: REDIRECT, codeVerifier: verifier,
        })).toThrowError(expect.objectContaining({ code: 'invalid_grant' }));
        expect(() => p.exchangeCode({
            code, clientId: client.client_id, redirectUri: 'http://127.0.0.1/callback', codeVerifier: verifier,
        })).toThrowError(expect.objectContaining({ code: 'invalid_grant' }));
    });

    it('DCR : redirect_uri hors allowlist → invalid_redirect_uri', () => {
        const p = providerAt(() => 0);
        expect(() => p.registerClient(['https://attaquant.example/callback']))
            .toThrowError(expect.objectContaining({ code: 'invalid_redirect_uri' }));
        expect(() => p.registerClient([])).toThrow(OAuthError);
    });

    it('SÉCURITÉ : allowlist par ORIGINE exacte — les contournements de préfixe/userinfo sont REJETÉS', () => {
        // Finding CRITIQUE panel 2026-07-13 : `startsWith` laissait passer ces 4 formes.
        const p = providerAt(() => 0);
        for (const evil of [
            'http://127.0.0.1.evil.example/cb',       // sous-domaine
            'http://localhost.evil.example/cb',        // sous-domaine
            'http://127.0.0.1@evil.example/cb',        // userinfo → host réel = evil
            'https://claude.ai.evil.example/cb',       // sous-domaine de claude.ai
            'https://claude.ai@evil.example/cb',       // userinfo
            'pas-une-url',                             // URL invalide
        ]) {
            expect(() => p.registerClient([evil]), `doit rejeter : ${evil}`).toThrow(OAuthError);
        }
        // Les formes LÉGITIMES passent (claude.ai exact + loopback tout port).
        expect(() => p.registerClient(['https://claude.ai/api/mcp/auth_callback'])).not.toThrow();
        expect(() => p.registerClient(['http://127.0.0.1:54321/cb'])).not.toThrow();
        expect(() => p.registerClient(['http://localhost:8976/callback'])).not.toThrow();
    });

    it('SÉCURITÉ : le code est à USAGE UNIQUE (rejeu → invalid_grant)', () => {
        const p = providerAt(() => 1000);
        const client = p.registerClient([REDIRECT]);
        const verifier = 'verificateur-pkce-suffisamment-long-0123456789';
        const code = p.authorize({
            clientId: client.client_id, redirectUri: REDIRECT,
            codeChallenge: s256(verifier), accessKey: ACCESS_KEY,
        });
        p.exchangeCode({ code, clientId: client.client_id, redirectUri: REDIRECT, codeVerifier: verifier });
        expect(() => p.exchangeCode({ code, clientId: client.client_id, redirectUri: REDIRECT, codeVerifier: verifier }))
            .toThrowError(expect.objectContaining({ code: 'invalid_grant' }));
    });

    it('SÉCURITÉ : rotation du refresh — l’ancien jeton est INVALIDÉ', () => {
        const p = providerAt(() => 1000);
        const { client, tokens } = fullFlow(p);
        p.refreshGrant({ refreshToken: tokens.refresh_token, clientId: client.client_id, clientSecret: client.client_secret });
        // 2ᵉ usage du MÊME refresh token → refusé (rotation OAuth 2.1).
        expect(() => p.refreshGrant({ refreshToken: tokens.refresh_token, clientId: client.client_id, clientSecret: client.client_secret }))
            .toThrowError(expect.objectContaining({ code: 'invalid_grant' }));
    });

    it('authorize() se garde LUI-MÊME (redirect hors allowlist rejeté sans passer par validate)', () => {
        const p = providerAt(() => 0);
        expect(() => p.authorize({
            clientId: 'c', redirectUri: 'https://attaquant.example/cb',
            codeChallenge: s256('v'), accessKey: ACCESS_KEY,
        })).toThrowError(expect.objectContaining({ code: 'invalid_request' }));
    });

    it('refresh token expire après 30 j', () => {
        let t = 0;
        const p = providerAt(() => t);
        const { client, tokens } = fullFlow(p);
        t = 30 * 24 * 60 * 60 * 1000 + 1;
        expect(() => p.refreshGrant({ refreshToken: tokens.refresh_token, clientId: client.client_id, clientSecret: client.client_secret }))
            .toThrowError(/expiré/i);
    });

    it('validateAuthorizeRequest : PKCE S256 exigé, redirect allowlisté', () => {
        const p = providerAt(() => 0);
        const base = { response_type: 'code', client_id: 'c', redirect_uri: REDIRECT };
        expect(() => p.validateAuthorizeRequest({ ...base, code_challenge: 'x', code_challenge_method: 'S256' })).not.toThrow();
        expect(() => p.validateAuthorizeRequest({ ...base, code_challenge: 'x', code_challenge_method: 'plain' })).toThrow(OAuthError);
        expect(() => p.validateAuthorizeRequest({ ...base, redirect_uri: 'https://attaquant.example/', code_challenge: 'x', code_challenge_method: 'S256' })).toThrow(OAuthError);
    });

    it('config faible refusée (clé de signature/accès trop courte)', () => {
        expect(() => makeOAuthProvider({ signingKey: 'courte', accessKey: ACCESS_KEY, issuer: ISSUER })).toThrow(/32/);
        expect(() => makeOAuthProvider({ signingKey: SIGNING_KEY, accessKey: 'courte', issuer: ISSUER })).toThrow(/16/);
    });
});
