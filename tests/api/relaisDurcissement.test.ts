// [DURCISSEMENT-RELAIS] 2026-09-25 — freins du relais : débit (IP + empreinte de clé), plafond de corps,
// Origin, plafond max_tokens local, mémo de vérification de clé (négatif court, éviction par ancienneté,
// empreinte salée), budget de vérification par IP, journal sans contenu.
// Tests DIRECTS du handler Web-standard, fetch mocké (aucun réseau).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    relayClaude, cleAnthropicValide, reinitialiserClesValidees, reinitialiserSanteIaLocale,
    tailleMemoCles, empreinteCle, type IaLocaleConfig,
} from '../../api/_lib/relay';
import {
    reinitialiserLimites, essayerDebit, tailleCompteurs, lireCorpsBorne, CORPS_MAX_OCTETS, CorpsTropGros,
    LIMITES_PAR_DEFAUT, type Limites,
} from '../../api/_lib/garde';
import { MODEL_IDS } from '../../services/aiChat/models';

const URL_RELAIS = 'http://localhost/api/claude/v1/messages';
const IA: IaLocaleConfig = {
    url: 'https://ia.exemple.test', cle: 'atl_cle-test',
    modeles: new Set([MODEL_IDS.haiku, MODEL_IDS.sonnet]), reflexion: 'low', maxTokens: 8_192,
    orgAutorisee: 'org-marc', empreintesAutorisees: new Set(),
};
const COUNT = 'https://api.anthropic.com/v1/messages/count_tokens';

const corps = (extra: Record<string, unknown> = {}) =>
    ({ model: MODEL_IDS.haiku, max_tokens: 100, messages: [{ role: 'user', content: 'Bonjour' }], ...extra });

const mk = (over: { headers?: Record<string, string | undefined>; body?: BodyInit; json?: Record<string, unknown> } = {}): Request => {
    const headers: Record<string, string> = {
        origin: 'http://localhost:5173', authorization: 'Bearer sk-ant-test-123', 'content-type': 'application/json',
    };
    for (const [k, v] of Object.entries(over.headers ?? {})) { if (v === undefined) delete headers[k]; else headers[k] = v; }
    return new Request(URL_RELAIS, { method: 'POST', headers, body: over.body ?? JSON.stringify(over.json ?? corps()) });
};

let fetchSpy: ReturnType<typeof vi.fn>;
const urls = () => (fetchSpy.mock.calls as [string][]).map(([u]) => u);
beforeEach(() => {
    reinitialiserLimites();
    reinitialiserClesValidees();
    reinitialiserSanteIaLocale();
    fetchSpy = vi.fn(async (url: string) => {
        if (url === `${IA.url}/sante`) return new Response('{"ok":true}');
        if (url === `${IA.url}/v1/messages`) return new Response('{"id":"msg_l"}', { status: 200, headers: { 'content-type': 'application/json' } });
        return new Response('{"id":"msg_a"}', { status: 200, headers: { 'content-type': 'application/json', 'anthropic-organization-id': 'org-marc' } });
    });
    vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks(); });

const petites = (o: Partial<Limites> = {}): Limites => ({ ...LIMITES_PAR_DEFAUT, ...o });

describe('débit par IP et par empreinte de clé', () => {
    it('au-delà du plafond par IP : 429 en enveloppe Anthropic + retry-after, et plus aucun appel amont', async () => {
        const limites = petites({ parIp: 3 });
        const envoie = () => relayClaude(mk({ headers: { 'x-forwarded-for': '203.0.113.7' } }), { access: null, env: () => undefined, iaLocale: null, limites });
        for (let i = 0; i < 3; i++) expect((await envoie()).status).toBe(200);
        const r = await envoie();
        expect(r.status).toBe(429);
        expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
        expect(((await r.json()) as { error: { type: string } }).error.type).toBe('rate_limit_error');
        expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('les IP sont indépendantes (premier saut de x-forwarded-for)', async () => {
        const limites = petites({ parIp: 1 });
        const depuis = (ip: string) => relayClaude(mk({ headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } }), { access: null, env: () => undefined, iaLocale: null, limites });
        expect((await depuis('203.0.113.1')).status).toBe(200);
        expect((await depuis('203.0.113.2')).status).toBe(200);
        expect((await depuis('203.0.113.1')).status).toBe(429);
    });

    it('plafond par empreinte de clé : deux IP différentes, même clé → 429 ; une autre clé passe', async () => {
        const limites = petites({ parCle: 2 });
        const avec = (ip: string, cle: string) => relayClaude(
            mk({ headers: { 'x-forwarded-for': ip, authorization: `Bearer ${cle}` } }), { access: null, env: () => undefined, iaLocale: null, limites });
        expect((await avec('203.0.113.1', 'sk-ant-A')).status).toBe(200);
        expect((await avec('203.0.113.2', 'sk-ant-A')).status).toBe(200);
        expect((await avec('203.0.113.3', 'sk-ant-A')).status).toBe(429);
        expect((await avec('203.0.113.3', 'sk-ant-B')).status).toBe(200);
    });

    it('la fenêtre se referme après une minute', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
        expect(essayerDebit('x', 1).ok).toBe(true);
        expect(essayerDebit('x', 1).ok).toBe(false);
        vi.setSystemTime(new Date('2026-09-25T12:01:01Z'));
        expect(essayerDebit('x', 1).ok).toBe(true);
    });

    it('mémoire BORNÉE : 2 500 IP distinctes ne font pas grossir les compteurs au-delà de 2 000, et les récentes restent', () => {
        for (let i = 0; i < 2_500; i++) essayerDebit(`ip:${i}`, 5);
        expect(tailleCompteurs()).toBeLessThanOrEqual(2_000);
        expect(essayerDebit('ip:2499', 1).ok).toBe(false);   // la plus récente est encore là (déjà comptée une fois)
        expect(essayerDebit('ip:0', 1).ok).toBe(true);       // la plus ancienne a été évincée : compteur neuf
    });
});

describe('plafond de corps (~200 Ko)', () => {
    it('Content-Length annoncé trop grand → 413 sans rien lire ni appeler', async () => {
        const gros = JSON.stringify(corps({ system: 'x'.repeat(CORPS_MAX_OCTETS + 10) }));
        const r = await relayClaude(mk({ body: gros }), { access: null, env: () => undefined, iaLocale: null });
        expect(r.status).toBe(413);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('sans Content-Length (flux) : la lecture s\'arrête au plafond', async () => {
        const morceau = new TextEncoder().encode('x'.repeat(64 * 1024));
        let envoyes = 0;
        const flux = new ReadableStream<Uint8Array>({
            pull(c) { if (envoyes++ < 100) c.enqueue(morceau); else c.close(); },
        });
        const req = new Request(URL_RELAIS, { method: 'POST', body: flux, duplex: 'half' } as RequestInit);
        await expect(lireCorpsBorne(req)).rejects.toBeInstanceOf(CorpsTropGros);
        expect(envoyes).toBeLessThan(10); // ~200 Ko / 64 Ko : jamais les 6,4 Mo
    });

    it('un corps de taille normale passe', async () => {
        const r = await relayClaude(mk(), { access: null, env: () => undefined, iaLocale: null });
        expect(r.status).toBe(200);
    });
});

describe('max_tokens et passerelle locale', () => {
    const local = (json: Record<string, unknown>, ia: IaLocaleConfig = IA) =>
        relayClaude(mk({ json }), { access: null, env: () => undefined, iaLocale: ia, verifierCle: async () => ({ valide: true, orgId: 'org-marc' }) });

    it('sous le plafond local : servi localement', async () => {
        await local(corps({ max_tokens: 8_000 }));
        expect(urls()).toContain(`${IA.url}/v1/messages`);
    });

    it('au-dessus du plafond local : jamais tronqué en silence, l\'appel part chez Claude', async () => {
        await local(corps({ max_tokens: 9_000 }));
        expect(urls()).toEqual(['https://api.anthropic.com/v1/messages']);
    });

    it('plafond configurable par IA_LOCALE_MAX_TOKENS (borné à 16 000)', async () => {
        const { iaLocaleDepuisEnv } = await import('../../api/_lib/relay');
        const env = (k: string) => ({ IA_LOCALE_URL: 'https://ia.exemple.test', IA_LOCALE_CLE: 'c', RELAIS_ORG_LOCALE: 'org-marc', IA_LOCALE_MAX_TOKENS: '2000' } as Record<string, string>)[k];
        expect(iaLocaleDepuisEnv(env)?.maxTokens).toBe(2_000);
        expect(iaLocaleDepuisEnv((k) => (k === 'IA_LOCALE_MAX_TOKENS' ? '99999999' : env(k)))?.maxTokens).toBe(16_000);
    });
});

describe('allowlists (routes, modèles, version)', () => {
    it('modèle hors allowlist → 400, aucun appel', async () => {
        const r = await relayClaude(mk({ json: corps({ model: 'claude-inconnu' }) }), { access: null, env: () => undefined, iaLocale: null });
        expect(r.status).toBe(400);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
    it('toute autre route ou méthode → 404', async () => {
        for (const [m, path] of [['POST', '/api/claude/v1/complete'], ['POST', '/api/claude/v1/messages/batches'], ['GET', '/api/claude/v1/messages'], ['DELETE', '/api/claude/v1/messages']]) {
            const r = await relayClaude(new Request(`http://localhost${path}`, { method: m, headers: { origin: 'http://localhost:5173' }, body: m === 'POST' ? '{}' : undefined }), { access: null, env: () => undefined });
            expect(r.status, `${m} ${path}`).toBe(404);
        }
    });
    it('anthropic-version : seule la forme AAAA-MM-JJ est recopiée vers l\'amont', async () => {
        await relayClaude(mk({ headers: { 'anthropic-version': '2023-06-01; X-Injecte: 1' } }), { access: null, env: () => undefined, iaLocale: null });
        await relayClaude(mk({ headers: { 'anthropic-version': '2024-10-22' } }), { access: null, env: () => undefined, iaLocale: null });
        const versions = (fetchSpy.mock.calls as [string, { headers: Record<string, string> }][]).map(([, i]) => i.headers['anthropic-version']);
        expect(versions).toEqual(['2023-06-01', '2024-10-22']);
    });
});

describe('mémo de vérification de clé', () => {
    it('éviction PAR ANCIENNETÉ : 250 clés → borné à 200, les plus anciennes sortent, les récentes restent (plus de vidage total)', async () => {
        const sig = new AbortController().signal;
        for (let i = 0; i < 250; i++) await cleAnthropicValide(`sk-${i}`, MODEL_IDS.haiku, sig);
        expect(tailleMemoCles()).toBe(200);
        fetchSpy.mockClear();
        await cleAnthropicValide('sk-249', MODEL_IDS.haiku, sig);   // récente : en mémoire
        expect(fetchSpy).not.toHaveBeenCalled();
        await cleAnthropicValide('sk-0', MODEL_IDS.haiku, sig);     // ancienne : sortie du mémo
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('refus d\'Anthropic mémorisé 60 s puis revérifié ; panne mémorisée 15 s', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
        const sig = new AbortController().signal;
        fetchSpy.mockImplementation(async () => new Response('{}', { status: 401 }));
        expect((await cleAnthropicValide('sk-x', MODEL_IDS.haiku, sig)).valide).toBe(false);
        expect((await cleAnthropicValide('sk-x', MODEL_IDS.haiku, sig)).valide).toBe(false);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        vi.setSystemTime(new Date('2026-09-25T12:00:30Z'));
        await cleAnthropicValide('sk-x', MODEL_IDS.haiku, sig);
        expect(fetchSpy).toHaveBeenCalledTimes(1);                  // 30 s : encore mémorisé
        vi.setSystemTime(new Date('2026-09-25T12:01:05Z'));
        await cleAnthropicValide('sk-x', MODEL_IDS.haiku, sig);
        expect(fetchSpy).toHaveBeenCalledTimes(2);                  // 65 s : revérifié

        fetchSpy.mockImplementation(async () => { throw new TypeError('fetch failed'); });
        await cleAnthropicValide('sk-y', MODEL_IDS.haiku, sig);
        vi.setSystemTime(new Date('2026-09-25T12:01:25Z'));         // +20 s > 15 s
        await cleAnthropicValide('sk-y', MODEL_IDS.haiku, sig);
        expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it('empreinte SALÉE : jamais le SHA-256 nu de la clé, et le sel de l\'env serveur change l\'empreinte', async () => {
        const nu = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('sk-ant-test'))), (o) => o.toString(16).padStart(2, '0')).join('');
        const a = await empreinteCle('sk-ant-test');
        expect(a).not.toBe(nu);
        expect(await empreinteCle('sk-ant-test')).toBe(a);           // stable dans une instance
        vi.stubEnv('RELAIS_SEL_EMPREINTE', 'sel-1');
        const b = await empreinteCle('sk-ant-test');
        vi.stubEnv('RELAIS_SEL_EMPREINTE', 'sel-2');
        const c = await empreinteCle('sk-ant-test');
        expect(new Set([a, b, c]).size).toBe(3);
        expect(b).not.toBe(nu);
    });
});

describe('budget de vérification de clé par IP', () => {
    it('au-delà de verifParIp clés INCONNUES par minute : plus de count_tokens, plus de local, l\'appel part chez Anthropic', async () => {
        const limites = petites({ verifParIp: 2 });
        const essai = (cle: string) => relayClaude(
            mk({ headers: { 'x-forwarded-for': '203.0.113.9', authorization: `Bearer ${cle}` } }), { access: null, env: () => undefined, iaLocale: IA, limites });
        await essai('sk-1'); await essai('sk-2');
        expect(urls().filter((u) => u === COUNT)).toHaveLength(2);
        fetchSpy.mockClear();
        const r = await essai('sk-3');
        expect(r.status).toBe(200);
        expect(urls()).toEqual(['https://api.anthropic.com/v1/messages']);   // ni count_tokens, ni passerelle
        fetchSpy.mockClear();
        await essai('sk-1');                                                  // clé DÉJÀ vérifiée : ne coûte rien
        expect(urls().filter((u) => u === COUNT)).toHaveLength(0);
        expect(urls()).toContain(`${IA.url}/v1/messages`);
    });
});

describe('journal : jamais de clé, de corps, d\'IP ni de jeton', () => {
    it('sur les chemins de refus, de limite et de panne amont, aucun console.* ne porte de contenu', async () => {
        const sonde = ['console.log', 'console.info', 'console.warn', 'console.error', 'console.debug']
            .map((m) => vi.spyOn(console, m.split('.')[1] as 'log', ).mockImplementation(() => undefined));
        const CLE = 'sk-ant-SECRET-journal';
        const SECRET_CORPS = 'donnee-financiere-confidentielle';
        const ip = '198.51.100.77';
        const h = { 'x-forwarded-for': ip, authorization: `Bearer ${CLE}` };
        const json = corps({ messages: [{ role: 'user', content: SECRET_CORPS }] });
        // limite de débit
        for (let i = 0; i < 3; i++) await relayClaude(mk({ headers: h, json }), { access: null, env: () => undefined, iaLocale: null, limites: petites({ parIp: 1 }) });
        // origine refusée
        await relayClaude(mk({ headers: { ...h, origin: 'https://evil.example' }, json }), { access: null, env: () => undefined });
        // panne amont
        reinitialiserLimites();
        fetchSpy.mockImplementation(async () => { throw new TypeError(`fetch failed ${CLE} ${SECRET_CORPS}`); });
        await relayClaude(mk({ headers: h, json }), { access: null, env: () => undefined, iaLocale: null });
        // passerelle locale en panne (bascule)
        reinitialiserLimites();
        await relayClaude(mk({ headers: h, json }), { access: null, env: () => undefined, iaLocale: IA, verifierCle: async () => ({ valide: true, orgId: 'org-marc' }) });
        const tout = JSON.stringify(sonde.flatMap((s) => s.mock.calls));
        for (const interdit of [CLE, SECRET_CORPS, ip]) expect(tout).not.toContain(interdit);
    });
});

// ─── [DURCISSEMENT-RELAIS-CLE-DE-MARC] la passerelle locale (le GPU de Marc) n'est servie qu'à SA clé ─────────────
describe('routage local réservé à la clé de Marc (échec fermé)', () => {
    const COUNT_URL = 'https://api.anthropic.com/v1/messages/count_tokens';
    const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
    const reponduParOrg = (org: string | null, status = 200) => fetchSpy.mockImplementation(async (url: string) => {
        if (url === COUNT_URL) return new Response('{}', { status, headers: org ? { 'anthropic-organization-id': org } : {} });
        if (url === `${IA.url}/sante`) return new Response('{"ok":true}');
        if (url === `${IA.url}/v1/messages`) return new Response('{"id":"msg_l"}', { status: 200, headers: { 'content-type': 'application/json' } });
        return new Response('{"id":"msg_a"}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const appel = (ia: IaLocaleConfig, cle = 'sk-ant-quelconque') =>
        relayClaude(mk({ headers: { authorization: `Bearer ${cle}` } }), { access: null, env: () => undefined, iaLocale: ia });

    it('organisation de Marc → servi en local', async () => {
        reponduParOrg('org-marc');
        await appel(IA);
        expect(urls()).toContain(`${IA.url}/v1/messages`);
    });

    it('clé valide d\'une AUTRE organisation → Anthropic, jamais la passerelle (ni même sa sonde)', async () => {
        reponduParOrg('org-etrangere');
        await appel(IA);
        expect(urls()).toEqual([COUNT_URL, ANTHROPIC]);
    });

    it('en-tête d\'organisation absent → refus (échec fermé), l\'appel part chez Anthropic', async () => {
        reponduParOrg(null);
        await appel(IA);
        expect(urls()).toEqual([COUNT_URL, ANTHROPIC]);
    });

    it('clé refusée par Anthropic, même avec la bonne organisation annoncée → pas de local', async () => {
        reponduParOrg('org-marc', 401);
        await appel(IA);
        expect(urls()).not.toContain(`${IA.url}/v1/messages`);
    });

    it('empreinte salée autorisée → local SANS appel count_tokens ; autre clé → Anthropic', async () => {
        const ia: IaLocaleConfig = { ...IA, orgAutorisee: undefined, empreintesAutorisees: new Set([await empreinteCle('sk-ant-de-marc')]) };
        await appel(ia, 'sk-ant-de-marc');
        expect(urls()).toEqual([`${IA.url}/sante`, `${IA.url}/v1/messages`]);
        fetchSpy.mockClear();
        await appel(ia, 'sk-ant-intruse');
        expect(urls()).toEqual([ANTHROPIC]);
    });

    it('variable absente : ni organisation ni empreinte → routage local DÉSACTIVÉ (config nulle), tout va chez Anthropic', async () => {
        const { iaLocaleDepuisEnv } = await import('../../api/_lib/relay');
        const base = { IA_LOCALE_URL: 'https://ia.exemple.test', IA_LOCALE_CLE: 'c' } as Record<string, string>;
        expect(iaLocaleDepuisEnv((k) => base[k])).toBeNull();
        expect(iaLocaleDepuisEnv((k) => ({ ...base, RELAIS_ORG_LOCALE: '  ' } as Record<string, string>)[k])).toBeNull();
        expect(iaLocaleDepuisEnv((k) => ({ ...base, RELAIS_CLES_LOCALES: ' , ' } as Record<string, string>)[k])).toBeNull();
        const r = await relayClaude(mk(), { access: null, env: (k) => base[k] });
        expect(r.status).toBe(200);
        expect(urls()).toEqual([ANTHROPIC]);
    });

    it('RELAIS_CLES_LOCALES sans RELAIS_SEL_EMPREINTE : empreintes ÉCARTÉES, routage local coupé, et une ligne SANS valeur le dit', async () => {
        const { iaLocaleDepuisEnv } = await import('../../api/_lib/relay');
        const avert = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const base = { IA_LOCALE_URL: 'https://ia.exemple.test', IA_LOCALE_CLE: 'c', RELAIS_CLES_LOCALES: 'ab12cd34' } as Record<string, string>;
        expect(iaLocaleDepuisEnv((k) => base[k])).toBeNull();
        expect(avert).toHaveBeenCalledTimes(1);
        expect(String(avert.mock.calls[0][0])).toContain('sel manquant');
        expect(JSON.stringify(avert.mock.calls)).not.toContain('ab12cd34');
        // Avec le sel : l'empreinte est retenue, et le sel voyage dans la config (dev Vite : pas dans process.env).
        const ok = iaLocaleDepuisEnv((k) => ({ ...base, RELAIS_SEL_EMPREINTE: 'un-sel-de-test-assez-long' } as Record<string, string>)[k]);
        expect([...(ok?.empreintesAutorisees ?? [])]).toEqual(['ab12cd34']);
        expect(ok?.sel).toBe('un-sel-de-test-assez-long');
        // Avec l'organisation en plus mais sans sel : seule l'organisation reste.
        const org = iaLocaleDepuisEnv((k) => ({ ...base, RELAIS_ORG_LOCALE: 'org-marc' } as Record<string, string>)[k]);
        expect(org?.orgAutorisee).toBe('org-marc');
        expect(org?.empreintesAutorisees.size).toBe(0);
    });

    it('le sel de la config sert bien au calcul (une empreinte faite avec CE sel autorise la clé)', async () => {
        const ia: IaLocaleConfig = { ...IA, orgAutorisee: undefined, sel: 'sel-de-la-config-assez-long', empreintesAutorisees: new Set([await empreinteCle('sk-ant-de-marc', 'sel-de-la-config-assez-long')]) };
        reponduParOrg('org-etrangere');
        await appel(ia, 'sk-ant-de-marc');
        expect(urls()).toContain(`${IA.url}/v1/messages`);
    });

    it('les empreintes de RELAIS_CLES_LOCALES se lisent en minuscules, séparées par des virgules', async () => {
        const { iaLocaleDepuisEnv } = await import('../../api/_lib/relay');
        const c = iaLocaleDepuisEnv((k) => ({ IA_LOCALE_URL: 'https://ia.exemple.test', IA_LOCALE_CLE: 'c', RELAIS_CLES_LOCALES: 'AB12, cd34', RELAIS_SEL_EMPREINTE: 'un-sel-de-test-assez-long' } as Record<string, string>)[k]);
        expect([...(c?.empreintesAutorisees ?? [])]).toEqual(['ab12', 'cd34']);
    });

    it('scripts/empreinteCleRelais.mjs donne EXACTEMENT l\'empreinte que le relais calcule (et n\'écrit rien d\'autre)', async () => {
        const { spawnSync } = await import('node:child_process');
        const { resolve } = await import('node:path');
        vi.stubEnv('RELAIS_SEL_EMPREINTE', 'un-sel-de-test-assez-long');
        const attendu = await empreinteCle('sk-ant-essai');
        const r = spawnSync(process.execPath, [resolve(__dirname, '../../scripts/empreinteCleRelais.mjs')], {
            input: 'sk-ant-essai\n', encoding: 'utf8', env: { ...process.env, RELAIS_SEL_EMPREINTE: 'un-sel-de-test-assez-long' },
        });
        expect(r.status).toBe(0);
        expect(r.stdout.trim()).toBe(attendu);
        expect(r.stdout + r.stderr).not.toContain('sk-ant-essai');
        const sans = spawnSync(process.execPath, [resolve(__dirname, '../../scripts/empreinteCleRelais.mjs')], {
            input: 'x', encoding: 'utf8', env: { ...process.env, RELAIS_SEL_EMPREINTE: '' },
        });
        expect(sans.status).toBe(1);
    });
});

describe('IP du client : la plateforme d\'abord', () => {
    it('x-vercel-forwarded-for l\'emporte sur un x-forwarded-for préfixé par l\'attaquant', async () => {
        const { ipClient } = await import('../../api/_lib/garde');
        const h = new Headers({ 'x-forwarded-for': '1.2.3.4, 203.0.113.50', 'x-vercel-forwarded-for': '203.0.113.50' });
        expect(ipClient(h)).toBe('203.0.113.50');
        expect(ipClient(new Headers({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '203.0.113.51' }))).toBe('203.0.113.51');
        expect(ipClient(new Headers({ 'x-forwarded-for': '198.51.100.9, 10.0.0.1' }))).toBe('198.51.100.9');
        expect(ipClient(new Headers())).toBe('inconnue');
    });

    it('tourner la valeur de x-forwarded-for ne contourne pas le plafond quand la plateforme donne l\'IP', async () => {
        const limites = petites({ parIp: 2 });
        const essai = (xff: string) => relayClaude(
            mk({ headers: { 'x-forwarded-for': xff, 'x-vercel-forwarded-for': '203.0.113.60' } }), { access: null, env: () => undefined, iaLocale: null, limites });
        expect((await essai('9.9.9.1')).status).toBe(200);
        expect((await essai('9.9.9.2')).status).toBe(200);
        expect((await essai('9.9.9.3')).status).toBe(429);
    });
});
