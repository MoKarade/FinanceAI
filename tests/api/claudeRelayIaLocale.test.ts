// [IA-LOCALE] Relais → passerelle IA locale (Ollama du PC de Marc). Tests DIRECTS du handler Web-standard,
// fetch mocké et routé par URL. Couvre : éligibilité (modèle, contenu non texte, outils serveur,
// tool_choice forcé), clé BYOK JAMAIS envoyée à la passerelle, réécriture du modèle, bascule Anthropic
// (passerelle éteinte, 5xx, exception), mémorisation de la sonde /sante, config env (HTTPS obligatoire).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    relayClaude, iaLocaleDepuisEnv, eligibleIaLocale, reinitialiserSanteIaLocale, type IaLocaleConfig,
    cleAnthropicValide, reinitialiserClesValidees,
} from '../../api/_lib/relay';
import { reinitialiserLimites } from '../../api/_lib/garde';
import { MODEL_IDS, LOCAL_MODEL_ID } from '../../services/aiChat/models';

const RELAY_URL = 'http://localhost/api/claude/v1/messages';
const ORIGINE = 'http://localhost:5173';
const IA: IaLocaleConfig = {
    url: 'https://ia.exemple.test', cle: 'atl_cle-test',
    modeles: new Set([MODEL_IDS.haiku, MODEL_IDS.sonnet]), reflexion: 'low', maxTokens: 8_192,
    orgAutorisee: 'org-marc', empreintesAutorisees: new Set(),
};

const mkRequest = (body: Record<string, unknown>, signal?: AbortSignal): Request => new Request(RELAY_URL, {
    method: 'POST',
    headers: {
        'origin': ORIGINE,
        'authorization': 'Bearer sk-ant-test-123',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
});

const texte = (model: string = MODEL_IDS.haiku, extra: Record<string, unknown> = {}) =>
    ({ model, max_tokens: 100, messages: [{ role: 'user', content: 'Bonjour' }], ...extra });

type Appel = [string, RequestInit & { headers?: Record<string, string> }];
let fetchSpy: ReturnType<typeof vi.fn>;
let sante: () => Response | Promise<Response>;
let locale: () => Response | Promise<Response>;

beforeEach(() => {
    reinitialiserLimites();
    reinitialiserSanteIaLocale();
    sante = () => new Response('{"ok": true}', { status: 200 });
    locale = () => new Response(JSON.stringify({ id: 'msg_l', model: LOCAL_MODEL_ID }), {
        status: 200, headers: { 'content-type': 'application/json' },
    });
    fetchSpy = vi.fn(async (url: string) => {
        if (url === `${IA.url}/sante`) return sante();
        if (url === `${IA.url}/v1/messages`) return locale();
        return new Response(JSON.stringify({ id: 'msg_a', model: 'claude' }), {
            status: 200, headers: { 'content-type': 'application/json', 'anthropic-organization-id': 'org-marc' },
        });
    });
    vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

const call = (body: Record<string, unknown>, ia: IaLocaleConfig | null = IA, signal?: AbortSignal) =>
    relayClaude(mkRequest(body, signal), { iaLocale: ia, verifierCle: async () => ({ valide: true, orgId: 'org-marc' }) });
const urls = () => (fetchSpy.mock.calls as Appel[]).map(([u]) => u);

describe('[IA-LOCALE] routage du relais vers la passerelle locale', () => {
    it('appel texte Haiku éligible → passerelle : modèle réécrit, clé dédiée, clé BYOK JAMAIS transmise', async () => {
        const r = await call(texte());
        expect(r.status).toBe(200);
        expect(r.headers.get('x-financeai-ia')).toBe('locale');
        expect(r.headers.get('cache-control')).toBe('no-store');
        expect(((await r.json()) as { model: string }).model).toBe(LOCAL_MODEL_ID);
        expect(urls()).toEqual([`${IA.url}/sante`, `${IA.url}/v1/messages`]);
        const [, init] = (fetchSpy.mock.calls as Appel[])[1];
        expect(init.headers!['x-api-key']).toBe('atl_cle-test');
        expect(init.headers!['x-atelier-reflexion']).toBe('low');
        expect(JSON.stringify(init.headers)).not.toContain('sk-ant-test-123');      // BYOK hors passerelle
        expect((JSON.parse(init.body as string) as { model: string }).model).toBe(LOCAL_MODEL_ID);
    });

    it('agent avec outils « custom » (chat) → passerelle ; outil serveur ou tool_choice forcé → Anthropic', async () => {
        const outil = { name: 'get_financial_overview', description: 'x', input_schema: { type: 'object' } };
        expect(eligibleIaLocale(texte(MODEL_IDS.sonnet, { tools: [outil] }), IA)).toBe(true);
        expect(eligibleIaLocale(texte(MODEL_IDS.sonnet, { tools: [outil], tool_choice: { type: 'auto' } }), IA)).toBe(true);
        expect(eligibleIaLocale(texte(MODEL_IDS.sonnet, { tools: [outil], tool_choice: { type: 'any' } }), IA)).toBe(false);
        expect(eligibleIaLocale(texte(MODEL_IDS.sonnet, { tools: [{ type: 'web_search_20250305', name: 'web_search' }] }), IA)).toBe(false);
    });

    it('image / PDF (même dans un tool_result) → Anthropic direct, passerelle jamais appelée', async () => {
        const image = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'x' } };
        const pdf = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'x' } };
        expect(eligibleIaLocale(texte(MODEL_IDS.haiku, { messages: [{ role: 'user', content: [image] }] }), IA)).toBe(false);
        expect(eligibleIaLocale(texte(MODEL_IDS.haiku, {
            messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: [pdf] }] }],
        }), IA)).toBe(false);
        await call(texte(MODEL_IDS.haiku, { messages: [{ role: 'user', content: [image] }] }));
        expect(urls()).toEqual(['https://api.anthropic.com/v1/messages']);
    });

    it('Opus (choix explicite du meilleur modèle) → Anthropic ; et Opus n\'est plus rejeté par l\'allowlist', async () => {
        const r = await call(texte(MODEL_IDS.opus));
        expect(r.status).toBe(200);
        expect(urls()).toEqual(['https://api.anthropic.com/v1/messages']);
    });

    it('routage coupé (config null) → comportement historique : Anthropic seul', async () => {
        await call(texte(), null);
        expect(urls()).toEqual(['https://api.anthropic.com/v1/messages']);
    });

    it('passerelle éteinte (sonde en échec) → Anthropic ; sonde MÉMORISÉE (pas re-sondée à l\'appel suivant)', async () => {
        sante = () => { throw new TypeError('fetch failed'); };
        await call(texte());
        await call(texte());
        expect(urls()).toEqual([
            `${IA.url}/sante`, 'https://api.anthropic.com/v1/messages', 'https://api.anthropic.com/v1/messages',
        ]);
    });

    it('passerelle en erreur (529 GPU occupé) → bascule Anthropic avec la clé BYOK, puis plus d\'essai local', async () => {
        locale = () => new Response('{"type":"error"}', { status: 529 });
        const r = await call(texte());
        expect(r.status).toBe(200);
        expect(r.headers.get('x-financeai-ia')).toBeNull();
        const [urlA, initA] = (fetchSpy.mock.calls as Appel[])[2];
        expect(urlA).toBe('https://api.anthropic.com/v1/messages');
        expect(initA.headers!['x-api-key']).toBe('sk-ant-test-123');
        expect((JSON.parse(initA.body as string) as { model: string }).model).toBe(MODEL_IDS.haiku);   // modèle d'origine
        await call(texte());
        expect(urls().filter((u) => u.startsWith(IA.url))).toHaveLength(2);                      // pas de 2e essai
    });

    it('exception réseau pendant l\'appel local → bascule Anthropic (jamais d\'erreur montrée au client)', async () => {
        locale = () => { throw new TypeError('fetch failed'); };
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const r = await call(texte());
        warn.mockRestore();
        expect(r.status).toBe(200);
        expect(urls().at(-1)).toBe('https://api.anthropic.com/v1/messages');
    });

    it('flux (stream: true) → corps SSE de la passerelle relayé tel quel', async () => {
        locale = () => new Response('event: message_start\ndata: {}\n\n', {
            status: 200, headers: { 'content-type': 'text/event-stream' },
        });
        const r = await call(texte(MODEL_IDS.sonnet, { stream: true }));
        expect(r.headers.get('content-type')).toBe('text/event-stream');
        expect(await r.text()).toContain('message_start');
    });

    it('annulation client pendant l\'appel local → 499, sans bascule payante sur Anthropic', async () => {
        const ctrl = new AbortController();
        locale = () => { ctrl.abort(); throw new DOMException('aborted', 'AbortError'); };
        const r = await call(texte(), IA, ctrl.signal);
        expect(r.status).toBe(499);
        expect(urls()).not.toContain('https://api.anthropic.com/v1/messages');
    });
});

describe('[IA-LOCALE] configuration depuis l\'env serveur', () => {
    const env = (vals: Record<string, string>) => (k: string) => vals[k];

    it('incomplète → null (routage coupé)', () => {
        expect(iaLocaleDepuisEnv(env({ IA_LOCALE_URL: 'https://ia.exemple.test' }))).toBeNull();
        expect(iaLocaleDepuisEnv(env({ IA_LOCALE_CLE: 'k', RELAIS_ORG_LOCALE: 'org-marc' }))).toBeNull();
    });

    it('HTTPS obligatoire (sauf localhost) — la clé ne voyage jamais en clair', () => {
        expect(iaLocaleDepuisEnv(env({ IA_LOCALE_URL: 'http://ia.exemple.test', IA_LOCALE_CLE: 'k', RELAIS_ORG_LOCALE: 'org-marc' }))).toBeNull();
        expect(iaLocaleDepuisEnv(env({ IA_LOCALE_URL: 'http://localhost:8766', IA_LOCALE_CLE: 'k', RELAIS_ORG_LOCALE: 'org-marc' }))?.url).toBe('http://localhost:8766');
    });

    it('défauts : Haiku + Sonnet, réflexion low ; URL réduite à son origine (chemins constants)', () => {
        const c = iaLocaleDepuisEnv(env({ IA_LOCALE_URL: 'https://ia.exemple.test/autre/chemin', IA_LOCALE_CLE: 'k', RELAIS_ORG_LOCALE: 'org-marc' }))!;
        expect(c.url).toBe('https://ia.exemple.test');
        expect([...c.modeles].sort()).toEqual([MODEL_IDS.haiku, MODEL_IDS.sonnet].sort());
        expect(c.reflexion).toBe('low');
    });

    it('IA_LOCALE_MODELES filtré par l\'allowlist du relais (un id inconnu est ignoré)', () => {
        const c = iaLocaleDepuisEnv(env({
            IA_LOCALE_URL: 'https://ia.exemple.test', IA_LOCALE_CLE: 'k', RELAIS_ORG_LOCALE: 'org-marc',
            IA_LOCALE_MODELES: `${MODEL_IDS.opus}, modele-bidon`, IA_LOCALE_REFLEXION: 'medium',
        }))!;
        expect([...c.modeles]).toEqual([MODEL_IDS.opus]);
        expect(c.reflexion).toBe('medium');
    });
});

describe('[S5-RELAIS-CLE] la passerelle locale exige une clé Anthropic VALIDE', () => {
    // Sans cette vérification, n'importe quelle chaîne « Bearer » ouvrait la passerelle (le GPU du PC de Marc).
    beforeEach(() => reinitialiserClesValidees());
    const COUNT = 'https://api.anthropic.com/v1/messages/count_tokens';

    it('clé refusée par Anthropic → pas de passerelle (ni même sa sonde), appel Anthropic avec la clé fournie', async () => {
        const res = await relayClaude(mkRequest(texte()), { iaLocale: IA, verifierCle: async () => ({ valide: false }) });
        expect(res.status).toBe(200);
        expect(urls()).toEqual(['https://api.anthropic.com/v1/messages']);
    });

    it('vérification réelle : count_tokens avec la clé BYOK et un contenu FACTICE (aucune donnée envoyée)', async () => {
        const res = await relayClaude(mkRequest(texte()), { iaLocale: IA });
        expect(res.status).toBe(200);
        expect(urls()).toEqual([COUNT, `${IA.url}/sante`, `${IA.url}/v1/messages`]);
        const [, init] = (fetchSpy.mock.calls as Appel[])[0];
        expect(init.headers?.['x-api-key']).toBe('sk-ant-test-123');
        expect(JSON.parse(String(init.body)).messages).toEqual([{ role: 'user', content: '.' }]);
    });

    it('clé mémorisée 10 min (par empreinte) : pas de seconde vérification', async () => {
        await relayClaude(mkRequest(texte()), { iaLocale: IA });
        await relayClaude(mkRequest(texte()), { iaLocale: IA });
        expect(urls().filter((u) => u === COUNT)).toHaveLength(1);
    });

    it('échec fermé : 401 d\'Anthropic ou panne réseau → faux ; le refus est mémorisé COURT (pas de martelage)', async () => {
        fetchSpy.mockImplementationOnce(async () => new Response('{}', { status: 401 }));
        expect((await cleAnthropicValide('sk-fausse', MODEL_IDS.haiku, new AbortController().signal)).valide).toBe(false);
        // Même clé tout de suite : verdict négatif en mémoire, AUCUN nouvel appel.
        expect((await cleAnthropicValide('sk-fausse', MODEL_IDS.haiku, new AbortController().signal)).valide).toBe(false);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        // Panne réseau sur une autre clé : faux aussi.
        fetchSpy.mockImplementationOnce(async () => { throw new TypeError('fetch failed'); });
        expect((await cleAnthropicValide('sk-autre', MODEL_IDS.haiku, new AbortController().signal)).valide).toBe(false);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
});
