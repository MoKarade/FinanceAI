// tests/mcp/httpAuth.test.ts
//
// [MCP-CLOUDRUN-B] — le flux OAuth 2.1 de bout en bout SUR le serveur HTTP :
// découverte (.well-known) → DCR → page d'autorisation (clé d'accès) → code →
// token (PKCE) → /mcp gardé par Bearer (toutes méthodes). Vrai serveur, vrai fetch.
// + [MCP-CLOUDRUN-A] backend Secret Manager avec fetch simulé (aucun réseau).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { startHttpServer, type RunningHttpServer } from '../../mcp/http';
import { makeOAuthProvider } from '../../mcp/auth/oauthProvider';
import { makeSecretManagerBackend, makeFileBackend, resolveCredentialsBackend } from '../../mcp/auth/credentialsBackend';
import { makeDriveTokenProvider } from '../../mcp/drive/tokenProvider';
import type { ResolvedState } from '../../mcp/bootstrap';
import { normalizeAppState, type StateSource } from '../../mcp/state/loadAppState';
import { makeStateStore } from '../../mcp/state/stateStore';
import { TEST_PERSONAS } from '../../services/testPersonas';

const SIGNING_KEY = 's'.repeat(48);
const ACCESS_KEY = 'cle-acces-de-test-longue';
const REDIRECT = 'http://127.0.0.1:9/callback'; // loopback = allowlisté, port fictif (jamais suivi)

function fixtureState(): ResolvedState {
    const state = normalizeAppState(TEST_PERSONAS.find((p) => p.id === 'karim-immigre')!.build());
    const source: StateSource = { description: 'fixture http-auth', loadRaw: async () => JSON.stringify(state) };
    const store = makeStateStore(source);
    return { source, store, isDrive: false, driveEmail: null, describe: () => 'fixture http-auth' };
}

const RPC_HEADERS = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
};
const s256 = (v: string): string => createHash('sha256').update(v, 'utf8').digest('base64url');

describe('HTTP + OAuth 2.1 — /mcp gardé, flux complet', () => {
    let running: RunningHttpServer;
    let base: string;

    beforeAll(async () => {
        running = await startHttpServer({
            port: 0, host: '127.0.0.1', state: fixtureState(),
            auth: makeOAuthProvider({
                signingKey: SIGNING_KEY, accessKey: ACCESS_KEY,
                issuer: 'http://127.0.0.1:0', // les tests ne suivent pas les URLs de métadonnées
            }),
        });
        base = `http://127.0.0.1:${running.port}`;
    });
    afterAll(async () => {
        await running.close();
    });

    it('/mcp sans Bearer → 401 + WWW-Authenticate (découverte RFC 9728)', async () => {
        const res = await fetch(`${base}/mcp`, {
            method: 'POST', headers: RPC_HEADERS,
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } } }),
        });
        expect(res.status).toBe(401);
        expect(res.headers.get('www-authenticate')).toContain('resource_metadata');
    });

    it('découverte : .well-known authorization-server + protected-resource', async () => {
        const as = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
        expect(as.code_challenge_methods_supported).toEqual(['S256']);
        expect(as.grant_types_supported).toContain('refresh_token');
        const pr = await (await fetch(`${base}/.well-known/oauth-protected-resource`)).json();
        expect(pr.authorization_servers?.length).toBe(1);
    });

    it('flux COMPLET : register → authorize (clé) → code → token PKCE → tools/call OK', async () => {
        // 1. DCR
        const reg = await fetch(`${base}/oauth/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ redirect_uris: [REDIRECT] }),
        });
        expect(reg.status).toBe(201);
        const client = await reg.json() as { client_id: string; client_secret: string };

        // 2. GET authorize → formulaire HTML (clé d'accès)
        const verifier = 'verificateur-pkce-suffisamment-long-0123456789';
        const authorizeQuery = new URLSearchParams({
            response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT,
            code_challenge: s256(verifier), code_challenge_method: 'S256', state: 'etat-claude',
        });
        const form = await fetch(`${base}/oauth/authorize?${authorizeQuery}`);
        expect(form.status).toBe(200);
        const formHtml = await form.text();
        expect(formHtml).toContain('name="access_key"');
        expect(formHtml).toContain('Autoriser');

        // 3. POST authorize avec la BONNE clé → 302 vers redirect_uri?code=…&state=…
        const submit = await fetch(`${base}/oauth/authorize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            redirect: 'manual',
            body: new URLSearchParams({
                response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT,
                code_challenge: s256(verifier), code_challenge_method: 'S256', state: 'etat-claude',
                access_key: ACCESS_KEY,
            }).toString(),
        });
        expect(submit.status).toBe(302);
        const location = new URL(submit.headers.get('location')!);
        expect(location.searchParams.get('state')).toBe('etat-claude');
        const code = location.searchParams.get('code')!;
        expect(code).toBeTruthy();

        // 4. Échange code → tokens (PKCE)
        const tokenRes = await fetch(`${base}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code', code, client_id: client.client_id,
                client_secret: client.client_secret, redirect_uri: REDIRECT, code_verifier: verifier,
            }).toString(),
        });
        expect(tokenRes.status).toBe(200);
        const tokens = await tokenRes.json() as { access_token: string; refresh_token: string };

        // 5. /mcp AVEC Bearer : initialize + tools/call ping → 200
        const init = await fetch(`${base}/mcp`, {
            method: 'POST',
            headers: { ...RPC_HEADERS, Authorization: `Bearer ${tokens.access_token}` },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } } }),
        });
        expect(init.status).toBe(200);
        const sessionId = init.headers.get('mcp-session-id')!;
        const call = await fetch(`${base}/mcp`, {
            method: 'POST',
            headers: { ...RPC_HEADERS, Authorization: `Bearer ${tokens.access_token}`, 'mcp-session-id': sessionId },
            body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'ping', arguments: {} } }),
        });
        expect(call.status).toBe(200);

        // 6. refresh_token → nouveaux jetons utilisables
        const refreshRes = await fetch(`${base}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token', refresh_token: tokens.refresh_token,
                client_id: client.client_id, client_secret: client.client_secret,
            }).toString(),
        });
        expect(refreshRes.status).toBe(200);
        const refreshed = await refreshRes.json() as { access_token: string };
        expect(refreshed.access_token).not.toBe(tokens.access_token);
    });

    it('mauvaise clé d’accès → 403, formulaire ré-affiché avec erreur, AUCUN code émis', async () => {
        const res = await fetch(`${base}/oauth/authorize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            redirect: 'manual',
            body: new URLSearchParams({
                response_type: 'code', client_id: 'x', redirect_uri: REDIRECT,
                code_challenge: s256('v'), code_challenge_method: 'S256',
                access_key: 'mauvaise-cle',
            }).toString(),
        });
        expect(res.status).toBe(403);
        expect(await res.text()).toContain('invalide');
    });

    it('Bearer altéré ou GET sans Bearer → 401 (toutes méthodes gardées)', async () => {
        const forged = await fetch(`${base}/mcp`, {
            method: 'POST',
            headers: { ...RPC_HEADERS, Authorization: 'Bearer fa1.aaaa.bbbb' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } } }),
        });
        expect(forged.status).toBe(401);
        const get = await fetch(`${base}/mcp`, { headers: { Accept: 'application/json, text/event-stream' } });
        expect(get.status).toBe(401);
    });

    it('DCR avec redirect hors allowlist → invalid_redirect_uri', async () => {
        const res = await fetch(`${base}/oauth/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ redirect_uris: ['https://attaquant.example/cb'] }),
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('invalid_redirect_uri');
    });

    it('/health reste PUBLIC (sonde Cloud Run sans jeton)', async () => {
        const res = await fetch(`${base}/health`);
        expect(res.status).toBe(200);
    });

    it('DELETE /mcp sans Bearer → 401 (garde sur toutes les méthodes)', async () => {
        const res = await fetch(`${base}/mcp`, { method: 'DELETE', headers: { Accept: 'application/json' } });
        expect(res.status).toBe(401);
    });

    it('/oauth/register avec JSON malformé → 400 invalid_request (pas 500)', async () => {
        const res = await fetch(`${base}/oauth/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{pas du json',
        });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('invalid_request');
    });
});

describe('[MCP-CLOUDRUN-A] backend Secret Manager (fetch simulé)', () => {
    const CREDS = { clientId: 'cid', clientSecret: 'csec', refreshToken: 'rtok', email: 'marc@example.test' };
    const SECRET = 'projects/p/secrets/financeai-google-refresh';

    function fakeFetch(store: { versions: string[] }, opts?: { failMetadata?: boolean }) {
        return async (url: string, init?: RequestInit): Promise<Response> => {
            if (url.includes('metadata.google.internal')) {
                return opts?.failMetadata
                    ? new Response('nope', { status: 404 })
                    : Response.json({ access_token: 'sa-token' });
            }
            if (url.endsWith(':access')) {
                if (!store.versions.length) return new Response('{}', { status: 404 });
                return Response.json({ payload: { data: store.versions[store.versions.length - 1] } });
            }
            if (url.endsWith(':addVersion')) {
                const body = JSON.parse(String(init?.body)) as { payload: { data: string } };
                store.versions.push(body.payload.data);
                return Response.json({ name: `${SECRET}/versions/${store.versions.length}` });
            }
            throw new Error(`URL inattendue : ${url}`);
        };
    }

    it('save puis load round-trip (base64), secret vide → null (pas d’erreur)', async () => {
        const store = { versions: [] as string[] };
        const backend = makeSecretManagerBackend(SECRET, fakeFetch(store));
        expect(await backend.load()).toBeNull();
        await backend.save(CREDS);
        const loaded = await backend.load();
        expect(loaded).toEqual(CREDS);
        // Le token du compte de service est demandé au metadata server, jamais en dur.
        expect(store.versions.length).toBe(1);
    });

    it('hors GCP (metadata absent) → erreur CLAIRE, pas un crash cryptique', async () => {
        const backend = makeSecretManagerBackend(SECRET, fakeFetch({ versions: [] }, { failMetadata: true }));
        await expect(backend.load()).rejects.toThrow(/Metadata server/);
    });

    it('resolveCredentialsBackend : env var présente → Secret Manager, absente → fichier', () => {
        expect(resolveCredentialsBackend({ FINANCEAI_GOOGLE_SECRET: SECRET } as NodeJS.ProcessEnv).description)
            .toContain('Secret Manager');
        expect(resolveCredentialsBackend({} as NodeJS.ProcessEnv).description).toContain('fichier');
    });

    it('invalid_grant au refresh → message ACTIONNABLE (reconnecte le Drive)', async () => {
        const backend = makeFileBackend('/tmp/inexistant-financeai-creds.json');
        // Backend fichier VIDE → message « non autorisé » (le cas de base).
        const provider = makeDriveTokenProvider({ backend });
        await expect(provider()).rejects.toThrow(/mcp:auth/);
        // Backend qui RETOURNE des creds mais Google répond invalid_grant :
        const withCreds = {
            description: 'fake', load: async () => CREDS, save: async () => undefined,
        };
        const failingFetch = async (): Promise<Response> =>
            new Response('{"error":"invalid_grant"}', { status: 400 });
        const provider2 = makeDriveTokenProvider({ backend: withCreds, fetchFn: failingFetch });
        await expect(provider2()).rejects.toThrow(/EXPIRÉE ou RÉVOQUÉE/);
    });
});
