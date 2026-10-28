// @vitest-environment node
// [SESSION-HUB] Le relais Claude et les proxys exigent la session du hub : sans elle, 401 (enveloppe Anthropic pour le relais),
// AVANT tout débit, toute lecture de clé et tout appel amont. Fetch mocké : aucun réseau.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { relayClaude, reinitialiserClesValidees, reinitialiserSanteIaLocale } from '../../api/_lib/relay';
import { proxyYahooHistorique, proxyYahooRecherche, proxyFintable } from '../../api/_lib/proxies';
import { reinitialiserLimites } from '../../api/_lib/garde';
import { reinitialiserCacheAcces } from '../../api/_lib/accesHub';
import { MODEL_IDS } from '../../services/aiChat/models';
import { COOKIE_AUTHJS, hubFictif, type ScenarioHub } from '../helpers/sessionHub';

/** Le contrôle de session interroge un hub FICTIF (jamais le `fetch` global, que ces tests réservent à Anthropic / Yahoo / Fintable). */
const acces = (scenario: ScenarioHub = 'proprietaire') => ({ fetchImpl: hubFictif(scenario).fetchImpl });
const jeton = async () => COOKIE_AUTHJS;

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
    reinitialiserLimites(); reinitialiserClesValidees(); reinitialiserSanteIaLocale(); reinitialiserCacheAcces();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const relais = async (headers: Record<string, string> = {}) => new Request('http://localhost/api/claude/v1/messages', {
    method: 'POST',
    headers: { origin: 'http://localhost:5173', authorization: 'Bearer sk-ant-test-1', 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ model: MODEL_IDS.haiku, max_tokens: 50, messages: [{ role: 'user', content: 'Bonjour' }] }),
});

describe('relais Claude', () => {
    it('sans cookie de session : 401 en enveloppe Anthropic, AUCUN appel amont', async () => {
        const r = await relayClaude(await relais(), { iaLocale: null, access: acces() });
        expect(r.status).toBe(401);
        const j = await r.json();
        expect(j).toMatchObject({ type: 'error', error: { type: 'authentication_error' } });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
    it('le hub refuse la session (expirée, révoquée) : 401, aucun appel amont', async () => {
        const r = await relayClaude(await relais({ cookie: await jeton() }), { iaLocale: null, access: acces('sans_session') });
        expect(r.status).toBe(401);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
    it('session d\'un invité du hub : 403, aucun appel amont', async () => {
        const r = await relayClaude(await relais({ cookie: await jeton() }), { iaLocale: null, access: acces('invite') });
        expect(r.status).toBe(403);
        expect(await r.json()).toMatchObject({ error: { type: 'permission_error' } });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
    it('session du propriétaire : le relais continue (appel amont Anthropic)', async () => {
        const r = await relayClaude(await relais({ cookie: await jeton() }), { iaLocale: null, access: acces() });
        expect(r.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(String(fetchSpy.mock.calls[0][0])).toContain('api.anthropic.com');
    });
    it('hub injoignable : 503, jamais un passage libre (même avec un cookie)', async () => {
        const r = await relayClaude(await relais({ cookie: await jeton() }), { iaLocale: null, access: acces('panne') });
        expect(r.status).toBe(503);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
    it('aucune variable ne coupe le contrôle : l\'ancienne valeur d\'observation n\'ouvre rien', async () => {
        process.env.CF_ACCESS_REQUIRED = '0';
        try {
            const r = await relayClaude(await relais(), { env: (k) => (k === 'CF_ACCESS_REQUIRED' ? '0' : undefined), iaLocale: null, access: acces() });
            expect(r.status).toBe(401);
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            delete process.env.CF_ACCESS_REQUIRED;
        }
    });
    it('le cookie du hub et les en-têtes cf-* ne sont pas transmis à Anthropic', async () => {
        await relayClaude(await relais({ cookie: await jeton(), 'cf-connecting-ip': '198.51.100.7' }), { iaLocale: null, access: acces() });
        const h = new Headers((fetchSpy.mock.calls[0][1] as RequestInit).headers);
        expect([...h.keys()].filter((k) => k.startsWith('cf-') || k === 'cookie')).toEqual([]);
    });
    it('débit par IP : une cf-connecting-ip forgée ne donne pas un compteur à soi', async () => {
        // La limite s'applique à l'IP de la PLATEFORME, pas à l'en-tête cf-*.
        const limites = { parIp: 2, parCle: 100, verifParIp: 10 };
        const c = await jeton();
        const a = acces();
        const essai = (cf: string) => relais({ cookie: c, 'cf-connecting-ip': cf, 'x-vercel-forwarded-for': '203.0.113.9' })
            .then((q) => relayClaude(q, { iaLocale: null, access: a, limites }));
        expect((await essai('1.1.1.1')).status).toBe(200);
        expect((await essai('2.2.2.2')).status).toBe(200);
        expect((await essai('3.3.3.3')).status).toBe(429);
    });
});

describe('proxys Yahoo / Fintable', () => {
    const get = (url: string, headers: Record<string, string> = {}) => new Request(`http://localhost${url}`, { method: 'GET', headers });
    const opts = () => ({ access: acces() });

    it.each([
        ['historique', (r: Request, o = opts()) => proxyYahooHistorique(r, o), '/api/yahoo/history?symbol=AAPL&range=1d&interval=1d'],
        ['recherche', (r: Request, o = opts()) => proxyYahooRecherche(r, o), '/api/yahoo/search?q=apple'],
        ['fintable', (r: Request, o = opts()) => proxyFintable(r, o), '/api/proxy/fintable?path=accounts'],
    ])('%s : sans cookie de session → 401, aucun appel amont ; avec session du propriétaire → 200', async (_n, f, url) => {
        const sans = await f(get(url));
        expect(sans.status).toBe(401);
        expect(fetchSpy).not.toHaveBeenCalled();
        const avec = await f(get(url, { cookie: await jeton() }));
        expect(avec.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(avec.headers.get('cache-control')).toBe('no-store');
    });

    it('méthode autre que GET : 405', async () => {
        const r = await proxyYahooRecherche(new Request('http://localhost/api/yahoo/search?q=a', { method: 'POST' }), opts());
        expect(r.status).toBe(405);
    });

    it('Yahoo : hôte amont fixe, symbole encodé, paramètres relayés', async () => {
        await proxyYahooHistorique(get('/api/yahoo/history?symbol=BRK.B&period1=100&period2=200&interval=1d', { cookie: await jeton() }), opts());
        const u = new URL(String(fetchSpy.mock.calls[0][0]));
        expect(u.origin).toBe('https://query1.finance.yahoo.com');
        expect(u.pathname).toBe('/v8/finance/chart/BRK.B');
        expect(u.searchParams.get('period1')).toBe('100');
    });

    it.each([
        '/api/yahoo/history?symbol=..%2F..%2Fetc',
        '/api/yahoo/history?symbol=AAPL%3Fx%3D1',
        '/api/yahoo/history?symbol=',
        '/api/yahoo/history?symbol=AAPL&range=99x',
        '/api/yahoo/history?symbol=AAPL&period1=abc',
    ])('Yahoo : entrée invalide refusée en 400 sans appel amont : %s', async (url) => {
        const r = await proxyYahooHistorique(get(url, { cookie: await jeton() }), opts());
        expect(r.status).toBe(400);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('Yahoo recherche : terme vide ou trop long refusé', async () => {
        const h = { cookie: await jeton() };
        expect((await proxyYahooRecherche(get('/api/yahoo/search?q=', h), opts())).status).toBe(400);
        expect((await proxyYahooRecherche(get(`/api/yahoo/search?q=${'a'.repeat(101)}`, h), opts())).status).toBe(400);
    });

    it('Fintable : chemin sous /api/v2, jeton Fintable relayé, autres paramètres conservés', async () => {
        await proxyFintable(get('/api/proxy/fintable?path=accounts/12/transactions&limit=50', { cookie: await jeton(), authorization: 'Bearer ft-test' }), opts());
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://fintable.io/api/v2/accounts/12/transactions?limit=50');
        expect(new Headers(init.headers).get('authorization')).toBe('Bearer ft-test');
        expect([...new Headers(init.headers).keys()].filter((k) => k.startsWith('cf-'))).toEqual([]);
    });

    it.each(['../admin', 'a/../../b', './x', '/x', 'a//b', 'a?b=1', 'a#b', 'a b', '%2e%2e/x', ''])(
        'Fintable : chemin hostile refusé (%j)', async (chemin) => {
            const r = await proxyFintable(get(`/api/proxy/fintable?path=${encodeURIComponent(chemin)}`, { cookie: await jeton() }), opts());
            expect(r.status).toBe(400);
            expect(fetchSpy).not.toHaveBeenCalled();
        });

    it('amont en panne : 502 sans détail', async () => {
        fetchSpy.mockRejectedValueOnce(new TypeError('connect ECONNREFUSED 10.0.0.1'));
        const r = await proxyYahooRecherche(get('/api/yahoo/search?q=a', { cookie: await jeton() }), opts());
        expect(r.status).toBe(502);
        expect(await r.text()).not.toContain('10.0.0.1');
    });

    it('débit par IP : au-delà de 120/min → 429', async () => {
        const h = { cookie: await jeton(), 'x-vercel-forwarded-for': '203.0.113.77' };
        let dernier = 200;
        for (let i = 0; i < 121; i++) dernier = (await proxyYahooRecherche(get('/api/yahoo/search?q=a', h), opts())).status;
        expect(dernier).toBe(429);
    });
});

describe('proxys : la réécriture Vercel peut livrer l\'URL réécrite OU l\'URL d\'origine', () => {
    const get = (url: string, headers: Record<string, string> = {}) => new Request(`http://localhost${url}`, { method: 'GET', headers });
    const opts = () => ({ access: acces() });

    it('Yahoo : symbole lu depuis le chemin d\'origine (^GSPC, CAD=X décodés UNE fois) et paramètres d\'origine conservés', async () => {
        const h = { cookie: await jeton() };
        await proxyYahooHistorique(get('/api/history/yahoo/%5EGSPC?range=1d&interval=1d', h), opts());
        await proxyYahooHistorique(get('/api/history/yahoo/CAD%3DX?range=5d&interval=1d', h), opts());
        const urls = fetchSpy.mock.calls.map((c) => new URL(String(c[0])));
        expect(urls[0].pathname).toBe('/v8/finance/chart/%5EGSPC');
        expect(urls[0].searchParams.get('range')).toBe('1d');
        expect(urls[1].pathname).toBe('/v8/finance/chart/CAD%3DX');
    });
    it('Yahoo : symbole de la requête réécrite décodé une seule fois', async () => {
        await proxyYahooHistorique(get('/api/yahoo/history?symbol=%5EGSPC&range=1d', { cookie: await jeton() }), opts());
        expect(new URL(String(fetchSpy.mock.calls[0][0])).pathname).toBe('/v8/finance/chart/%5EGSPC');
    });
    it('Fintable : chemin multi-segments lu depuis l\'URL d\'origine, requête d\'origine conservée', async () => {
        await proxyFintable(get('/api/fintable/accounts/12/transactions?limit=50&cursor=abc', { cookie: await jeton() }), opts());
        expect(String(fetchSpy.mock.calls[0][0])).toBe('https://fintable.io/api/v2/accounts/12/transactions?limit=50&cursor=abc');
    });
    it('paramètre répété (`?symbol=` ou `?path=` ajouté par l\'appelant) : refusé, jamais « le premier gagne »', async () => {
        const h = { cookie: await jeton() };
        expect((await proxyYahooHistorique(get('/api/yahoo/history?symbol=AAPL&symbol=MSFT', h), opts())).status).toBe(400);
        expect((await proxyFintable(get('/api/proxy/fintable?path=accounts&path=me', h), opts())).status).toBe(400);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
    it('symbole composé de points refusé (« .. » sortirait du chemin /chart/)', async () => {
        const h = { cookie: await jeton() };
        expect((await proxyYahooHistorique(get('/api/yahoo/history?symbol=..', h), opts())).status).toBe(400);
        expect((await proxyYahooHistorique(get('/api/yahoo/history?symbol=.', h), opts())).status).toBe(400);
    });
    it('le refus d\'accès porte la forme { error: { type, message } } lue par le client Fintable, et nosniff sur les réponses relayées', async () => {
        const refus = await proxyFintable(get('/api/proxy/fintable?path=accounts'), opts());
        expect(await refus.json()).toMatchObject({ error: { type: 'access_denied' } });
        const ok = await proxyYahooRecherche(get('/api/yahoo/search?q=a', { cookie: await jeton() }), opts());
        expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
    });
});

describe('paramètre répété : refus, jamais de repli silencieux sur le chemin d\'origine', () => {
    it('URL d\'origine avec `?symbol=` ajouté par l\'appelant', async () => {
        const r = await proxyYahooHistorique(new Request('http://localhost/api/history/yahoo/AAPL?symbol=MSFT&symbol=X', { headers: { cookie: await jeton() } }), { access: acces() });
        expect(r.status).toBe(400);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
    it('URL d\'origine Fintable avec `?path=` répété', async () => {
        const r = await proxyFintable(new Request('http://localhost/api/fintable/accounts?path=a&path=b', { headers: { cookie: await jeton() } }), { access: acces() });
        expect(r.status).toBe(400);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
