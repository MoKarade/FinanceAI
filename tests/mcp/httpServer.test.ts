// tests/mcp/httpServer.test.ts
//
// [MCP-CLOUDRUN-HTTP] — le transport Streamable HTTP de bout en bout : vrai
// serveur node:http sur port éphémère, vraies requêtes fetch, vrai protocole
// JSON-RPC (initialize → session → tools/list → tools/call ping → DELETE).
// L'état est une fixture injectée (aucune dépendance Drive/fichier).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request as httpRequest } from 'node:http';
import { startHttpServer, type RunningHttpServer } from '../../mcp/http';
import { MCP_SERVER_VERSION, type ResolvedState } from '../../mcp/bootstrap';
import { normalizeAppState, type StateSource } from '../../mcp/state/loadAppState';
import { makeStateStore } from '../../mcp/state/stateStore';
import { TEST_PERSONAS } from '../../services/testPersonas';

function fixtureState(): ResolvedState {
    const state = normalizeAppState(TEST_PERSONAS.find((p) => p.id === 'karim-immigre')!.build());
    const source: StateSource = { description: 'fixture http', loadRaw: async () => JSON.stringify(state) };
    const store = makeStateStore(source);
    return { source, store, isDrive: false, driveEmail: null, describe: () => 'fixture http' };
}

const RPC_HEADERS = {
    'Content-Type': 'application/json',
    // Le transport Streamable HTTP exige l'acceptation des deux représentations.
    Accept: 'application/json, text/event-stream',
};

interface RpcEnvelope {
    jsonrpc: '2.0';
    id?: number;
    result?: Record<string, unknown>;
    error?: { code: number; message: string };
}

/** Le transport peut répondre en JSON pur ou en SSE (event: message) — on tolère les deux. */
async function parseRpc(res: Response): Promise<RpcEnvelope> {
    const text = await res.text();
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('text/event-stream')) {
        const dataLine = text.split('\n').find((l) => l.startsWith('data:'));
        expect(dataLine, `réponse SSE sans data: ${text}`).toBeDefined();
        return JSON.parse(dataLine!.slice('data:'.length).trim());
    }
    return JSON.parse(text);
}

describe('MCP Streamable HTTP — /mcp + /health', () => {
    let running: RunningHttpServer;
    let base: string;

    beforeAll(async () => {
        running = await startHttpServer({ port: 0, host: '127.0.0.1', state: fixtureState() });
        base = `http://127.0.0.1:${running.port}`;
    });
    afterAll(async () => {
        await running.close();
    });

    async function initializeSession(): Promise<string> {
        const res = await fetch(`${base}/mcp`, {
            method: 'POST',
            headers: RPC_HEADERS,
            body: JSON.stringify({
                jsonrpc: '2.0', id: 1, method: 'initialize',
                params: {
                    protocolVersion: '2025-03-26',
                    capabilities: {},
                    clientInfo: { name: 'test-client', version: '0.0.1' },
                },
            }),
        });
        expect(res.status).toBe(200);
        const sessionId = res.headers.get('mcp-session-id');
        expect(sessionId, 'initialize doit renvoyer un mcp-session-id').toBeTruthy();
        const body = await parseRpc(res);
        expect(body.error).toBeUndefined();
        expect((body.result as { serverInfo?: { name?: string } })?.serverInfo?.name).toBe('financeai-mcp');
        return sessionId!;
    }

    it('GET /health → 200 + version', async () => {
        const res = await fetch(`${base}/health`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe('ok');
        expect(body.version).toBe(MCP_SERVER_VERSION);
    });

    it('route inconnue → 404', async () => {
        const res = await fetch(`${base}/autre`);
        expect(res.status).toBe(404);
    });

    it('initialize → session, tools/list expose les 16 tools (dont simulate_what_if)', async () => {
        const sessionId = await initializeSession();
        // Le client doit notifier `initialized` avant d'utiliser la session.
        await fetch(`${base}/mcp`, {
            method: 'POST',
            headers: { ...RPC_HEADERS, 'mcp-session-id': sessionId },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
        });
        const res = await fetch(`${base}/mcp`, {
            method: 'POST',
            headers: { ...RPC_HEADERS, 'mcp-session-id': sessionId },
            body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
        });
        expect(res.status).toBe(200);
        const body = await parseRpc(res);
        const tools = (body.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
        // Tous les tools préexistants (contrainte MCP-CLOUDRUN : « ne rien casser »)
        // + write tools ABSENTS seulement si la source est en lecture seule.
        for (const expected of [
            'ping', 'get_tax_room', 'calculate_real_estate', 'run_projection', 'connect_drive',
            'get_financial_overview', 'get_projection', 'get_tax_situation', 'get_retirement_outlook',
            'get_next_best_actions', 'search_transactions', 'simulate_what_if',
        ]) {
            expect(tools, `tool manquant : ${expected}`).toContain(expected);
        }
    });

    it('tools/call ping → pong, sur la MÊME session', async () => {
        const sessionId = await initializeSession();
        const res = await fetch(`${base}/mcp`, {
            method: 'POST',
            headers: { ...RPC_HEADERS, 'mcp-session-id': sessionId },
            body: JSON.stringify({
                jsonrpc: '2.0', id: 3, method: 'tools/call',
                params: { name: 'ping', arguments: {} },
            }),
        });
        expect(res.status).toBe(200);
        const body = await parseRpc(res);
        const content = (body.result as { content: Array<{ type: string; text: string }> }).content;
        expect(content[0].text.toLowerCase()).toContain('pong');
    });

    it('tools/call get_financial_overview → données RÉELLES de la fixture (data-aware via HTTP)', async () => {
        const sessionId = await initializeSession();
        const res = await fetch(`${base}/mcp`, {
            method: 'POST',
            headers: { ...RPC_HEADERS, 'mcp-session-id': sessionId },
            body: JSON.stringify({
                jsonrpc: '2.0', id: 4, method: 'tools/call',
                params: { name: 'get_financial_overview', arguments: {} },
            }),
        });
        const body = await parseRpc(res);
        const content = (body.result as { content: Array<{ type: string; text: string }> }).content;
        const overview = JSON.parse(content[0].text);
        expect(overview.currency).toBe('CAD');
        expect(overview.netWorth).toBeGreaterThan(0);
    });

    it('requête sans session (hors initialize) → 400 avec message clair', async () => {
        const res = await fetch(`${base}/mcp`, {
            method: 'POST',
            headers: RPC_HEADERS,
            body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/list' }),
        });
        expect(res.status).toBe(400);
        const body = await parseRpc(res);
        expect(body.error?.message).toContain('initialize');
    });

    it('session inconnue → 404', async () => {
        const res = await fetch(`${base}/mcp`, {
            method: 'POST',
            headers: { ...RPC_HEADERS, 'mcp-session-id': 'session-inexistante' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 6, method: 'tools/list' }),
        });
        expect(res.status).toBe(404);
    });

    it('corps JSON invalide → 400 (parse error), le serveur survit', async () => {
        const res = await fetch(`${base}/mcp`, { method: 'POST', headers: RPC_HEADERS, body: '{pas du json' });
        expect(res.status).toBe(400);
        const health = await fetch(`${base}/health`);
        expect(health.status).toBe(200);
    });

    it('corps > 5 Mo → 413 (cap mémoire, reste du corps drainé), le serveur survit', async () => {
        const big = '"' + 'x'.repeat(6 * 1024 * 1024) + '"';
        const res = await fetch(`${base}/mcp`, { method: 'POST', headers: RPC_HEADERS, body: big });
        expect(res.status).toBe(413);
        const health = await fetch(`${base}/health`);
        expect(health.status).toBe(200);
    });

    it('DELETE ferme la session : la requête suivante → 404', async () => {
        const sessionId = await initializeSession();
        const del = await fetch(`${base}/mcp`, {
            method: 'DELETE',
            headers: { ...RPC_HEADERS, 'mcp-session-id': sessionId },
        });
        expect([200, 204]).toContain(del.status);
        const res = await fetch(`${base}/mcp`, {
            method: 'POST',
            headers: { ...RPC_HEADERS, 'mcp-session-id': sessionId },
            body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' }),
        });
        expect(res.status).toBe(404);
    });
});

describe('MCP Streamable HTTP — garde-fous (rebinding, cap sessions, balayage)', () => {
    function initBody(id = 1): string {
        return JSON.stringify({
            jsonrpc: '2.0', id, method: 'initialize',
            params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } },
        });
    }

    /** POST brut via node:http — `fetch` (undici) REFUSE de forger Host/Origin, il faut la couche basse. */
    function rawPost(port: number, headers: Record<string, string>, body: string): Promise<number> {
        return new Promise((resolve, reject) => {
            const req = httpRequest(
                { host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { ...RPC_HEADERS, ...headers } },
                (res) => {
                    res.resume();
                    res.on('end', () => resolve(res.statusCode ?? 0));
                },
            );
            req.on('error', reject);
            req.end(body);
        });
    }

    it('anti-DNS-rebinding sur port ÉPHÉMÈRE : Host légitime accepté, Host forgé rejeté', async () => {
        // Discriminant du fix « allowedHosts sur le port RÉELLEMENT lié » : avec l'ancien code
        // (options.port=0), `127.0.0.1:0` rejetait TOUT — ce test échouait sur le 1er appel.
        const running = await startHttpServer({
            port: 0, host: '127.0.0.1', state: fixtureState(), dnsRebindingProtection: true,
        });
        try {
            const ok = await fetch(`http://127.0.0.1:${running.port}/mcp`, {
                method: 'POST', headers: RPC_HEADERS, body: initBody(),
            });
            expect(ok.status).toBe(200);
            const forged = await rawPost(running.port, { Host: 'evil.example:80' }, initBody(2));
            expect(forged).toBeGreaterThanOrEqual(400);
            const badOrigin = await rawPost(running.port, { Origin: 'https://evil.example' }, initBody(3));
            expect(badOrigin).toBeGreaterThanOrEqual(400);
        } finally {
            await running.close();
        }
    });

    it('cap de sessions : la (max+1)ᵉ initialisation → 503', async () => {
        const running = await startHttpServer({
            port: 0, host: '127.0.0.1', state: fixtureState(), maxSessions: 3,
        });
        try {
            const base = `http://127.0.0.1:${running.port}`;
            for (let i = 0; i < 3; i++) {
                const res = await fetch(`${base}/mcp`, { method: 'POST', headers: RPC_HEADERS, body: initBody(i + 1) });
                expect(res.status).toBe(200);
            }
            const overflow = await fetch(`${base}/mcp`, { method: 'POST', headers: RPC_HEADERS, body: initBody(9) });
            expect(overflow.status).toBe(503);
        } finally {
            await running.close();
        }
    });

    it('balayage : une session inactive est fermée (requête suivante → 404)', async () => {
        const running = await startHttpServer({
            port: 0, host: '127.0.0.1', state: fixtureState(),
            sessionIdleMs: 100, sweepIntervalMs: 50,
        });
        try {
            const base = `http://127.0.0.1:${running.port}`;
            const init = await fetch(`${base}/mcp`, { method: 'POST', headers: RPC_HEADERS, body: initBody() });
            const sessionId = init.headers.get('mcp-session-id')!;
            await new Promise((r) => setTimeout(r, 300));
            const res = await fetch(`${base}/mcp`, {
                method: 'POST',
                headers: { ...RPC_HEADERS, 'mcp-session-id': sessionId },
                body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
            });
            expect(res.status).toBe(404);
        } finally {
            await running.close();
        }
    });
});
