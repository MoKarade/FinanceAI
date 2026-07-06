// [P0-PROXY] Relais BYOK — tests DIRECTS du handler Web-standard (aucun serveur : on construit
// des `Request` et on inspecte les `Response`/le fetch amont mocké). Couvre le contrat sécurité :
// route unique, jeton de relais, mapping Bearer→x-api-key, allowlist modèles, clamp max_tokens,
// headers minimaux (pas de fuite du jeton de relais vers Anthropic), no-store, passthrough statut,
// annulation chaînée. Le handler tourne tel quel en Edge Vercel ET en dev Vite.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { relayClaude } from '../../api/_lib/relay';

const RELAY_URL = 'http://localhost/api/claude/v1/messages';
const TOKEN = 'tok-test';

const mkRequest = (over: {
    url?: string; method?: string; headers?: Record<string, string>; body?: string;
    signal?: AbortSignal;
} = {}): Request => new Request(over.url ?? RELAY_URL, {
    method: over.method ?? 'POST',
    headers: {
        'x-financeai-proxy': TOKEN,
        'authorization': 'Bearer sk-ant-test-123',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        ...over.headers,
    },
    body: over.method === 'GET' ? undefined : (over.body ?? JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 100, messages: [] })),
    signal: over.signal,
});

const upstreamOk = () => new Response(JSON.stringify({ id: 'msg_1' }), {
    status: 200, headers: { 'content-type': 'application/json' },
});

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
    fetchSpy = vi.fn(async () => upstreamOk());
    vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

const call = (req: Request, accessToken: string | undefined = TOKEN) =>
    relayClaude(req, { accessToken });

describe('relayClaude — contrat sécurité', () => {
    it('rejette toute route hors POST /v1/messages (404, fetch amont JAMAIS appelé)', async () => {
        const r1 = await call(mkRequest({ url: 'http://localhost/api/claude/v1/complete' }));
        const r2 = await call(mkRequest({ method: 'GET' }));
        expect(r1.status).toBe(404);
        expect(r2.status).toBe(404);
        expect(fetchSpy).not.toHaveBeenCalled();
        // Enveloppe Anthropic native (le SDK client mappe dessus).
        expect((await r1.json() as { type: string }).type).toBe('error');
    });

    it('503 si le relais n\'est pas configuré (aucun jeton serveur)', async () => {
        // Chemin RÉEL de prod (pas d'opts) : configuredToken() lit l'env — stub à vide.
        // NB : `call(req, undefined)` serait un piège (paramètre par défaut ⇒ jeton fourni).
        vi.stubEnv('PROXY_ACCESS_TOKEN', '');
        const r = await relayClaude(mkRequest());
        vi.unstubAllEnvs();
        expect(r.status).toBe(503);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('401 si le jeton de relais est absent ou faux', async () => {
        const r = await call(mkRequest({ headers: { 'x-financeai-proxy': 'mauvais' } }));
        expect(r.status).toBe(401);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('401 si la clé BYOK (Authorization: Bearer) manque', async () => {
        const r = await call(mkRequest({ headers: { authorization: '' } }));
        expect(r.status).toBe(401);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('400 si le corps n\'est pas du JSON ou si le modèle est hors allowlist', async () => {
        const bad = await call(mkRequest({ body: 'pas-du-json' }));
        const model = await call(mkRequest({ body: JSON.stringify({ model: 'claude-3-opus', max_tokens: 10, messages: [] }) }));
        expect(bad.status).toBe(400);
        expect(model.status).toBe(400);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('400 (pas TypeError) sur du JSON valide mais non-objet : null, tableau, scalaire', async () => {
        for (const b of ['null', '[1,2]', '"texte"']) {
            expect((await call(mkRequest({ body: b }))).status).toBe(400);
        }
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('happy path : Bearer→x-api-key, jeton de relais NON transmis, clamp max_tokens, no-store', async () => {
        const r = await call(mkRequest({ body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 999_999, messages: [] }) }));
        expect(r.status).toBe(200);
        expect(r.headers.get('cache-control')).toBe('no-store');
        expect(r.headers.get('content-type')).toBe('application/json');
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
        expect(url).toBe('https://api.anthropic.com/v1/messages');           // URL CONSTANTE (anti-SSRF)
        expect(init.headers['x-api-key']).toBe('sk-ant-test-123');           // clé BYOK re-mappée
        expect(init.headers['anthropic-version']).toBe('2023-06-01');
        expect('x-financeai-proxy' in init.headers).toBe(false);             // jeton de relais JAMAIS forwardé
        expect('authorization' in init.headers).toBe(false);
        const body = JSON.parse(init.body as string) as { max_tokens: number };
        expect(body.max_tokens).toBe(16_000);                                // clamp serveur
    });

    it('max_tokens absent/invalide → défaut serveur (1024), jamais NaN', async () => {
        await call(mkRequest({ body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', messages: [] }) }));
        const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string) as { max_tokens: number };
        expect(body.max_tokens).toBe(1024);
    });

    it('passthrough du statut/corps amont (ex. 429 rate-limit Anthropic intact pour le SDK)', async () => {
        fetchSpy.mockResolvedValueOnce(new Response(
            JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'ralentis' } }),
            { status: 429, headers: { 'content-type': 'application/json' } },
        ));
        const r = await call(mkRequest());
        expect(r.status).toBe(429);
        expect(((await r.json()) as { error: { type: string } }).error.type).toBe('rate_limit_error');
    });

    it('502 enveloppé si l\'amont est injoignable (panne réseau) — jamais un rejet nu', async () => {
        fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const r = await call(mkRequest());
        errSpy.mockRestore();
        expect(r.status).toBe(502);
        expect(((await r.json()) as { error: { type: string } }).error.type).toBe('api_error');
    });

    it('annulation chaînée : le signal de la requête est transmis au fetch amont', async () => {
        const ctrl = new AbortController();
        await call(mkRequest({ signal: ctrl.signal }));
        const init = (fetchSpy.mock.calls[0] as [string, RequestInit])[1];
        expect(init.signal).toBeInstanceOf(AbortSignal);
    });
});
