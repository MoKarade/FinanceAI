// tests/mcp/driveOauth.test.ts
//
// Lot 3 — coeur OAuth du connecteur (parties testables sans navigateur) : URL de consentement,
// échange code→tokens, refresh, stockage local du refresh token, et le TokenProvider (refresh + cache).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    buildAuthUrl, exchangeCodeForTokens, refreshAccessToken, TOKEN_ENDPOINT, type FetchLike,
} from '../../mcp/drive/oauth';
import { saveCredentials, loadCredentials } from '../../mcp/drive/tokenStore';
import { makeDriveTokenProvider } from '../../mcp/drive/tokenProvider';

const okJson = (data: unknown): Response =>
    ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) } as unknown as Response);
const fail = (status: number, body = ''): Response =>
    ({ ok: false, status, json: async () => ({}), text: async () => body } as unknown as Response);

describe('oauth — buildAuthUrl', () => {
    it('demande un refresh token (offline + consent) et les bons scopes', () => {
        const url = new URL(buildAuthUrl({ clientId: 'cid', redirectUri: 'http://127.0.0.1:5500' }));
        expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
        expect(url.searchParams.get('client_id')).toBe('cid');
        expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5500');
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.searchParams.get('access_type')).toBe('offline');
        expect(url.searchParams.get('prompt')).toBe('consent');
        expect(url.searchParams.get('scope')).toContain('drive.appdata');
    });
});

describe('oauth — échange / refresh', () => {
    it('exchangeCodeForTokens poste grant_type=authorization_code et renvoie les tokens', async () => {
        const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => okJson({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }));
        const t = await exchangeCodeForTokens({ clientId: 'c', clientSecret: 's', code: 'CODE', redirectUri: 'http://127.0.0.1:1' }, fetchMock as unknown as FetchLike);
        expect(t.access_token).toBe('AT');
        expect(t.refresh_token).toBe('RT');
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(TOKEN_ENDPOINT);
        expect(String(init?.body)).toContain('grant_type=authorization_code');
        expect(String(init?.body)).toContain('code=CODE');
    });

    it('refreshAccessToken poste grant_type=refresh_token', async () => {
        const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => okJson({ access_token: 'AT2', expires_in: 3600 }));
        const t = await refreshAccessToken({ clientId: 'c', clientSecret: 's', refreshToken: 'RT' }, fetchMock as unknown as FetchLike);
        expect(t.access_token).toBe('AT2');
        expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('grant_type=refresh_token');
    });

    it('réponse non-ok → erreur claire', async () => {
        const fetchMock = vi.fn(async () => fail(400, 'invalid_grant'));
        await expect(refreshAccessToken({ clientId: 'c', clientSecret: 's', refreshToken: 'RT' }, fetchMock as unknown as FetchLike))
            .rejects.toThrow(/token échouée \(400\)/);
    });
});

describe('tokenStore — persistance locale', () => {
    let dir: string;
    let path: string;
    beforeEach(async () => { dir = await fs.mkdtemp(join(tmpdir(), 'fai-cred-')); path = join(dir, 'credentials.json'); });
    afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

    it('round-trip save → load', async () => {
        await saveCredentials({ clientId: 'cid', clientSecret: 'sec', refreshToken: 'RT', email: 'marc@x.com' }, path);
        const c = await loadCredentials(path);
        expect(c?.refreshToken).toBe('RT');
        expect(c?.email).toBe('marc@x.com');
    });
    it('fichier absent → null', async () => {
        expect(await loadCredentials(join(dir, 'nope.json'))).toBeNull();
    });
    it('JSON incomplet (sans refreshToken) → null', async () => {
        await fs.writeFile(path, JSON.stringify({ clientId: 'c', clientSecret: 's' }), 'utf8');
        expect(await loadCredentials(path)).toBeNull();
    });
});

describe('tokenProvider — refresh + cache', () => {
    let dir: string;
    let path: string;
    beforeEach(async () => { dir = await fs.mkdtemp(join(tmpdir(), 'fai-cred-')); path = join(dir, 'credentials.json'); });
    afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

    it('sans identifiants → erreur « npm run mcp:auth »', async () => {
        const provider = makeDriveTokenProvider({ credentialsPath: join(dir, 'absent.json') });
        await expect(provider()).rejects.toThrow(/mcp:auth/);
    });

    it('échange le refresh token, met en cache, et re-rafraîchit après expiration', async () => {
        await saveCredentials({ clientId: 'c', clientSecret: 's', refreshToken: 'RT' }, path);
        let n = 0;
        const fetchMock = vi.fn(async () => okJson({ access_token: `AT-${++n}`, expires_in: 3600 }));
        let t = 0;
        const provider = makeDriveTokenProvider({ credentialsPath: path, fetchFn: fetchMock as unknown as FetchLike, now: () => t });

        expect(await provider()).toBe('AT-1');
        expect(await provider()).toBe('AT-1'); // cache (pas de 2e refresh)
        expect(fetchMock).toHaveBeenCalledTimes(1);

        t = 3600 * 1000; // après expiration (marge 60s incluse)
        expect(await provider()).toBe('AT-2');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
