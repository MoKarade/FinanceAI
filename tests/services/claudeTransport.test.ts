// [P0-PROXY] Bascule de transport de services/claude.ts — DISCRIMINANT : sans le switch de
// makeClient, le mode `proxy` continuerait d'appeler api.anthropic.com (le 1er test échouerait).
// On mocke le fetch global (utilisé par le SDK) et on inspecte la cible + les en-têtes d'auth.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chat } from '../../services/claude';

const anthropicMessage = () => new Response(JSON.stringify({
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6',
    content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn',
    usage: { input_tokens: 1, output_tokens: 1 },
}), { status: 200, headers: { 'content-type': 'application/json' } });

let fetchSpy: ReturnType<typeof vi.fn>;
const targetOf = (call: unknown[]): string => {
    const first = call[0] as string | URL | Request;
    return typeof first === 'string' ? first : first instanceof URL ? first.href : first.url;
};
const headersOf = (call: unknown[]): Headers => {
    const [first, init] = call as [string | Request, RequestInit | undefined];
    if (first instanceof Request) return first.headers;
    return new Headers(init?.headers as HeadersInit | undefined);
};

beforeEach(() => {
    fetchSpy = vi.fn(async () => anthropicMessage());
    vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('claude.ts — transport direct vs proxy (P0-PROXY)', () => {
    it('proxy : chat() cible <origine>/api/claude/v1/messages avec Bearer + jeton de relais', async () => {
        vi.stubEnv('VITE_CLAUDE_TRANSPORT', 'proxy');
        vi.stubEnv('VITE_PROXY_ACCESS_TOKEN', 'tok-front');
        const out = await chat([{ role: 'user', content: 'salut' }], 'sk-ant-perso');
        expect(out).toBe('ok');
        expect(fetchSpy).toHaveBeenCalled();
        const call = fetchSpy.mock.calls[0] as unknown[];
        expect(targetOf(call)).toBe(`${window.location.origin}/api/claude/v1/messages`);
        const h = headersOf(call);
        expect(h.get('authorization')).toBe('Bearer sk-ant-perso');   // clé BYOK en authToken
        expect(h.get('x-financeai-proxy')).toBe('tok-front');         // jeton de relais joint
        expect(h.get('x-api-key')).toBeNull();                        // PAS de x-api-key côté client en mode proxy
    });

    it('direct (défaut) : chat() cible api.anthropic.com avec x-api-key (comportement historique)', async () => {
        vi.stubEnv('VITE_CLAUDE_TRANSPORT', '');
        const out = await chat([{ role: 'user', content: 'salut' }], 'sk-ant-perso');
        expect(out).toBe('ok');
        const call = fetchSpy.mock.calls[0] as unknown[];
        expect(targetOf(call)).toContain('https://api.anthropic.com/v1/messages');
        expect(headersOf(call).get('x-api-key')).toBe('sk-ant-perso');
    });
});
