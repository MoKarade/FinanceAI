// tests/mcp/sharedClient.test.ts
// Client OAuth FinanceAI partagé : env prioritaire ; null si rien (ni env ni connector-client.json).
import { describe, it, expect, afterEach } from 'vitest';
import { resolveSharedClient } from '../../mcp/drive/sharedClient';

const origId = process.env.GOOGLE_DESKTOP_CLIENT_ID;
const origSecret = process.env.GOOGLE_DESKTOP_CLIENT_SECRET;

afterEach(() => {
    if (origId === undefined) delete process.env.GOOGLE_DESKTOP_CLIENT_ID; else process.env.GOOGLE_DESKTOP_CLIENT_ID = origId;
    if (origSecret === undefined) delete process.env.GOOGLE_DESKTOP_CLIENT_SECRET; else process.env.GOOGLE_DESKTOP_CLIENT_SECRET = origSecret;
});

describe('resolveSharedClient', () => {
    it('utilise les variables d\'environnement en priorité', () => {
        process.env.GOOGLE_DESKTOP_CLIENT_ID = 'env-id';
        process.env.GOOGLE_DESKTOP_CLIENT_SECRET = 'env-secret';
        expect(resolveSharedClient()).toEqual({ clientId: 'env-id', clientSecret: 'env-secret' });
    });

    it('null si aucun client partagé (ni env ni fichier embarqué)', () => {
        delete process.env.GOOGLE_DESKTOP_CLIENT_ID;
        delete process.env.GOOGLE_DESKTOP_CLIENT_SECRET;
        expect(resolveSharedClient()).toBeNull();
    });
});
