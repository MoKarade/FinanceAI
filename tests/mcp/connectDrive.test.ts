// connect_drive — branches testables (déjà connecté / pas de client). Le consentement loopback (qui
// ouvre un navigateur) n'est pas testable en CI et est exercé par Marc en réel.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../../mcp/drive/tokenStore', () => ({ loadCredentials: vi.fn() }));
vi.mock('../../mcp/drive/sharedClient', () => ({ resolveSharedClient: vi.fn() }));
vi.mock('../../mcp/drive/loopbackAuth', () => ({ runLoopbackAuth: vi.fn() }));

import { registerConnectDrive } from '../../mcp/tools/connectDrive.tool';
import { loadCredentials } from '../../mcp/drive/tokenStore';
import { resolveSharedClient } from '../../mcp/drive/sharedClient';

type Handler = () => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
function capture(): Handler {
    let cap: Handler | null = null;
    const fake = { tool: (_n: string, _d: string, _s: unknown, cb: Handler) => { cap = cb; } } as unknown as McpServer;
    registerConnectDrive(fake);
    if (!cap) throw new Error('aucun handler');
    return cap;
}

beforeEach(() => vi.clearAllMocks());

describe('connect_drive', () => {
    it('déjà connecté → connected:true (pas de consentement)', async () => {
        vi.mocked(loadCredentials).mockResolvedValue({ clientId: 'c', clientSecret: 's', refreshToken: 'r' });
        const out = JSON.parse((await capture()()).content[0].text);
        expect(out.connected).toBe(true);
    });

    it('aucun client OAuth partagé → erreur claire', async () => {
        vi.mocked(loadCredentials).mockResolvedValue(null);
        vi.mocked(resolveSharedClient).mockReturnValue(null);
        const res = await capture()();
        expect(res.isError).toBe(true);
    });
});
