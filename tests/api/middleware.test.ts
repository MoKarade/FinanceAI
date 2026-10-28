// @vitest-environment node
// [SESSION-HUB] Le garde du site (FinanceAI#1159) : ce que rend le middleware pour une page, une API, une sonde, un autre courriel,
// une configuration absente. Valide ET rejeté pour chaque règle ; sessions ES256 réelles (tests/helpers/sessionHub.ts).
import { describe, it, expect, beforeEach } from 'vitest';
import { garderSite, urlConnexionHub } from '../../api/_lib/gardeSite';
import { reinitialiserCacheAcces } from '../../api/_lib/accesHub';
import { COOKIE_AUTHJS, hubFictif, type ScenarioHub } from '../helpers/sessionHub';

const SITE = 'https://finance.hubperso.com';

beforeEach(() => reinitialiserCacheAcces());

const sansEnv = () => undefined;
const req = (chemin: string, { methode = 'GET', cookie }: { methode?: string; cookie?: string } = {}) =>
    new Request(`${SITE}${chemin}`, { method: methode, headers: cookie ? { cookie } : {} });
/** Garde du site avec un hub fictif répondant `scenario`. */
const garde = (r: Request, scenario: ScenarioHub = 'proprietaire', get: (k: string) => string | undefined = sansEnv) =>
    garderSite(r, get, { fetchImpl: hubFictif(scenario).fetchImpl });

describe('session du propriétaire : la requête continue (null)', () => {
    it.each(['/', '/index.html', '/assets/noyau-abc.js', '/icon.svg', '/api/claude/v1/messages', '/api/yahoo/search?q=a'])('%s', async (chemin) => {
        expect(await garde(req(chemin, { cookie: COOKIE_AUTHJS }))).toBeNull();
    });
    it('POST d\'API compris', async () => {
        expect(await garde(req('/api/claude/v1/messages', { methode: 'POST', cookie: COOKIE_AUTHJS }))).toBeNull();
    });
});

describe('sans session', () => {
    it('une PAGE est redirigée (302) vers la connexion du hub, avec la page demandée pour revenir', async () => {
        const r = await garde(req('/?onglet=placements#x'));
        expect(r?.status).toBe(302);
        const loc = new URL(r!.headers.get('location')!);
        expect(loc.origin + loc.pathname).toBe('https://hubperso.com/login');
        expect(loc.searchParams.get('callbackUrl')).toBe(`${SITE}/?onglet=placements`);
        expect(r!.headers.get('cache-control')).toBe('no-store');
    });
    it('un fichier statique (chunk JS, icône de sonde) est redirigé aussi : la sonde d\'expiration de l\'app le voit', async () => {
        for (const chemin of ['/assets/noyau-abc.js', '/icon.svg', '/sw.js', '/manifest.json']) {
            expect((await garde(req(chemin)))?.status, chemin).toBe(302);
        }
    });
    it('/api/* : 401 JSON, JAMAIS une redirection (fetch la suivrait vers une autre origine)', async () => {
        for (const chemin of ['/api/claude/v1/messages', '/api/yahoo/search?q=a', '/api/history/yahoo/AAPL', '/api/fintable/accounts', '/api/lia/ask']) {
            const r = await garde(req(chemin));
            expect(r?.status, chemin).toBe(401);
            expect(r!.headers.get('location'), chemin).toBeNull();
            expect(r!.headers.get('content-type')).toContain('application/json');
            expect(r!.headers.get('cache-control')).toBe('no-store');
            expect(await r!.json()).toMatchObject({ type: 'error', error: { type: 'authentication_error' } });
        }
    });
    it('une page demandée par une autre méthode que GET/HEAD : 401 JSON, pas de redirection', async () => {
        const r = await garde(req('/', { methode: 'POST' }));
        expect(r?.status).toBe(401);
        expect(r!.headers.get('location')).toBeNull();
    });
    it('cookie présent mais refusé par le hub (expiré, révoqué) : même traitement qu\'une session absente', async () => {
        expect((await garde(req('/', { cookie: COOKIE_AUTHJS }), 'sans_session'))?.status).toBe(302);
        expect((await garde(req('/api/yahoo/search?q=a', { cookie: COOKIE_AUTHJS }), 'sans_session'))?.status).toBe(401);
    });
    it('sans cookie de session, le hub n\'est même pas interrogé', async () => {
        const hub = hubFictif('proprietaire');
        await garderSite(req('/'), sansEnv, { fetchImpl: hub.fetchImpl });
        expect(hub.fetchImpl).not.toHaveBeenCalled();
    });
});

describe('/api/sante : la seule exception publique', () => {
    it('passe sans session, sans interroger le hub', async () => {
        const hub = hubFictif('panne');
        expect(await garderSite(req('/api/sante'), sansEnv, { fetchImpl: hub.fetchImpl })).toBeNull();
        expect(await garderSite(req('/api/sante', { methode: 'HEAD' }), sansEnv, { fetchImpl: hub.fetchImpl })).toBeNull();
        expect(hub.fetchImpl).not.toHaveBeenCalled();
    });
    it('rien d\'autre n\'est public : ni un préfixe, ni un suffixe, ni une variante de casse', async () => {
        for (const chemin of ['/api/sante/', '/api/sante2', '/api/sante/x', '/api/Sante', '/api/santé', '/x/api/sante']) {
            expect(await garde(req(chemin)), chemin).not.toBeNull();
        }
    });
});

describe('session d\'un invité du hub : 403, sans redirection (elle bouclerait)', () => {
    it('page : 403 HTML', async () => {
        const r = await garde(req('/', { cookie: COOKIE_AUTHJS }), 'invite');
        expect(r?.status).toBe(403);
        expect(r!.headers.get('location')).toBeNull();
        expect(r!.headers.get('content-type')).toContain('text/html');
    });
    it('API : 403 JSON', async () => {
        const r = await garde(req('/api/claude/v1/messages', { methode: 'POST', cookie: COOKIE_AUTHJS }), 'invite');
        expect(r?.status).toBe(403);
        expect(await r!.json()).toMatchObject({ error: { type: 'permission_error' } });
    });
});

describe('hub injoignable ou hors contrat : 503, échec fermé', () => {
    it.each<ScenarioHub>(['panne', 'redirige', 'erreur_500', 'hors_contrat', 'non_json'])('%s : page ET API en 503, même avec un cookie', async (scenario) => {
        const page = await garde(req('/', { cookie: COOKIE_AUTHJS }), scenario);
        const api = await garde(req('/api/yahoo/search?q=a', { cookie: COOKIE_AUTHJS }), scenario);
        expect(page?.status).toBe(503);
        expect(page!.headers.get('location')).toBeNull();
        expect(api?.status).toBe(503);
    });
    it('un refus n\'est jamais mis en cache', async () => {
        for (const [chemin, cookie] of [['/', undefined], ['/', COOKIE_AUTHJS]] as const) {
            const r = await garde(req(chemin, cookie ? { cookie } : {}), cookie ? 'panne' : 'sans_session');
            expect(r!.headers.get('cache-control')).toBe('no-store');
        }
    });
    it('un garde qui lèverait une exception refuse (503) au lieu de laisser passer', async () => {
        const r = await garderSite(req('/', { cookie: COOKIE_AUTHJS }), sansEnv, { fetchImpl: (() => { throw new Error('boum'); }) as unknown as typeof fetch });
        expect(r?.status).toBe(503);
    });
});

describe('urlConnexionHub', () => {
    const get = (extra: Record<string, string> = {}) => (k: string) => extra[k];
    const dest = (u: string) => new URL(u).searchParams.get('callbackUrl');

    it('hub par défaut, retour vers la page demandée', () => {
        expect(urlConnexionHub(new URL(`${SITE}/budget?x=1`), get())).toBe('https://hubperso.com/login?callbackUrl=https%3A%2F%2Ffinance.hubperso.com%2Fbudget%3Fx%3D1');
    });
    it('HUB_URL https acceptée (origine seule)', () => {
        expect(urlConnexionHub(new URL(`${SITE}/`), get({ HUB_URL: 'https://www.hubperso.com/chemin/ignore' }))).toMatch(/^https:\/\/www\.hubperso\.com\/login\?/);
    });
    it.each(['http://hubperso.com', 'javascript:alert(1)', 'pas une url', '//evil.example'])('HUB_URL non https ou illisible (%s) : retour au hub par défaut', (valeur) => {
        expect(urlConnexionHub(new URL(`${SITE}/`), get({ HUB_URL: valeur }))).toMatch(/^https:\/\/hubperso\.com\/login\?/);
    });
    it('le retour reste sur l\'origine de CETTE app, jamais sur une destination fournie par l\'appelant', () => {
        // Un chemin en `//evil.example/x` est résolu contre l'origine : il ne peut pas devenir un autre hôte.
        const r = urlConnexionHub(new URL(`${SITE}//evil.example/x`), get());
        expect(new URL(dest(r)!).origin).toBe(SITE);
    });
});
