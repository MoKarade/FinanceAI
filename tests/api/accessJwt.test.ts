// @vitest-environment node
// [SESSION-HUB] Contrôle de la session du hub (api/_lib/accesHub.ts, FinanceAI#1159) : chaque condition a son test, valide ET rejeté.
// (Le fichier garde son nom d'origine, celui du contrôle Cloudflare qu'il remplace.) Le hub est un `fetch` simulé (tests/helpers/sessionHub.ts).
import { describe, it, expect, beforeEach } from 'vitest';
import {
    controlerAcces, cookiesDeSession, messageRefus, reinitialiserCacheAcces, statutRefus, URL_HUB_SESSION, CHEMIN_SESSION_HUB, type RaisonRefus,
} from '../../api/_lib/accesHub';
import { ipClient } from '../../api/_lib/garde';
import { COOKIE_AUTHJS, COOKIE_SIGNE, hubFictif, type ScenarioHub } from '../helpers/sessionHub';

beforeEach(() => reinitialiserCacheAcces());

const requete = (cookie?: string) => new Headers(cookie ? { cookie } : {});
const verdict = (scenario: ScenarioHub, cookie: string | null = COOKIE_AUTHJS, maintenantMs?: number) => {
    const hub = hubFictif(scenario);
    return controlerAcces(requete(cookie ?? undefined), { fetchImpl: hub.fetchImpl, ...(maintenantMs !== undefined ? { maintenantMs } : {}) }).then((v) => ({ v, hub }));
};

describe('le hub dit « propriétaire » : la requête continue', () => {
    it('cookie Auth.js partagé', async () => {
        const { v } = await verdict('proprietaire');
        expect(v).toEqual({ autorise: true });
    });
    it('cookie signé ES256 (phase 2 du hub)', async () => {
        expect((await verdict('proprietaire', COOKIE_SIGNE)).v).toEqual({ autorise: true });
    });
    it('cookie Auth.js découpé en morceaux (.0, .1)', async () => {
        const { v, hub } = await verdict('proprietaire', '__Secure-authjs.session-token.0=aaa; __Secure-authjs.session-token.1=bbb');
        expect(v.autorise).toBe(true);
        expect(new Headers(hub.appels[0].init.headers).get('cookie')).toBe('__Secure-authjs.session-token.0=aaa; __Secure-authjs.session-token.1=bbb');
    });
});

describe('ce qui part vers le hub', () => {
    it('www.hubperso.com (jamais l\'apex qui redirige), GET, sans suivre de redirection, sans cache, avec un délai', async () => {
        const { hub } = await verdict('proprietaire');
        expect(hub.appels).toHaveLength(1);
        expect(hub.appels[0].url).toBe(`${URL_HUB_SESSION}${CHEMIN_SESSION_HUB}`);
        expect(hub.appels[0].url).toMatch(/^https:\/\/www\.hubperso\.com\//);
        expect(hub.appels[0].init).toMatchObject({ method: 'GET', redirect: 'manual', cache: 'no-store' });
        expect(hub.appels[0].init.signal).toBeInstanceOf(AbortSignal);
    });
    it('SEULS les cookies de session du hub sont transmis : jamais un autre cookie du navigateur', async () => {
        const { hub } = await verdict('proprietaire', `a=1; ${COOKIE_AUTHJS}; __Secure-authjs.csrf-token=x; theme=sombre; ${COOKIE_SIGNE}`);
        expect(new Headers(hub.appels[0].init.headers).get('cookie')).toBe(`${COOKIE_AUTHJS}; ${COOKIE_SIGNE}`);
    });
    it('cookiesDeSession : ignore les noms voisins et les valeurs vides', () => {
        expect(cookiesDeSession('x__Secure-hub.session=zzz; __Secure-hub.session=; __Secure-authjs.session-token.abc=1')).toBe('');
        expect(cookiesDeSession(null)).toBe('');
        expect(cookiesDeSession('__Secure-hub.session=' + 'a'.repeat(9000))).toBe(''); // démesuré : jamais transmis
    });
});

describe('refus « session_absente » (401)', () => {
    const attendu: { autorise: false; raison: RaisonRefus } = { autorise: false, raison: 'session_absente' };
    it.each([
        ['aucun en-tête Cookie', null],
        ['aucun cookie de session du hub', 'a=1; theme=sombre'],
        ['cookie voisin seulement', 'x__Secure-hub.session=zzz'],
    ])('%s : refus SANS appel réseau', async (_nom, cookie) => {
        const { v, hub } = await verdict('proprietaire', cookie);
        expect(v).toEqual(attendu);
        expect(hub.fetchImpl).not.toHaveBeenCalled();
    });
    it('le hub répond 401 (session expirée, révoquée ou illisible)', async () => {
        expect((await verdict('sans_session')).v).toEqual(attendu);
    });
});

describe('refus « autre_courriel » (403)', () => {
    it('le hub dit proprietaire:false : invité du hub, jamais admis (FinanceAI n\'a que Marc)', async () => {
        expect((await verdict('invite')).v).toEqual({ autorise: false, raison: 'autre_courriel' });
    });
});

describe('refus « hub_indisponible » (503) : JAMAIS un passage libre', () => {
    const attendu: { autorise: false; raison: RaisonRefus } = { autorise: false, raison: 'hub_indisponible' };
    it.each<[string, ScenarioHub]>([
        ['hub injoignable ou trop lent (fetch rejette)', 'panne'],
        ['redirection (308 de l\'apex, ou 307 vers /login)', 'redirige'],
        ['erreur 500', 'erreur_500'],
        ['réponse hors contrat (proprietaire n\'est pas un booléen)', 'hors_contrat'],
        ['réponse qui n\'est pas du JSON', 'non_json'],
    ])('%s', async (_nom, scenario) => {
        expect((await verdict(scenario)).v).toEqual(attendu);
    });
});

describe('cache : un « oui » 60 s, un refus JAMAIS', () => {
    it('un oui n\'interroge le hub qu\'une fois par minute', async () => {
        const hub = hubFictif('proprietaire');
        const t0 = 1_000_000;
        for (const dt of [0, 10_000, 59_000]) expect((await controlerAcces(requete(COOKIE_AUTHJS), { fetchImpl: hub.fetchImpl, maintenantMs: t0 + dt })).autorise).toBe(true);
        expect(hub.fetchImpl).toHaveBeenCalledTimes(1);
        expect((await controlerAcces(requete(COOKIE_AUTHJS), { fetchImpl: hub.fetchImpl, maintenantMs: t0 + 61_000 })).autorise).toBe(true);
        expect(hub.fetchImpl).toHaveBeenCalledTimes(2);
    });
    it('un refus est redemandé à CHAQUE requête', async () => {
        const hub = hubFictif('sans_session');
        for (let i = 0; i < 3; i++) await controlerAcces(requete(COOKIE_AUTHJS), { fetchImpl: hub.fetchImpl, maintenantMs: 5_000 + i });
        expect(hub.fetchImpl).toHaveBeenCalledTimes(3);
    });
    it('un refus efface un oui périmé : la session révoquée ne repasse pas', async () => {
        const oui = hubFictif('proprietaire');
        expect((await controlerAcces(requete(COOKIE_AUTHJS), { fetchImpl: oui.fetchImpl, maintenantMs: 0 })).autorise).toBe(true);
        const non = hubFictif('sans_session');
        expect((await controlerAcces(requete(COOKIE_AUTHJS), { fetchImpl: non.fetchImpl, maintenantMs: 61_000 })).autorise).toBe(false);
        expect((await controlerAcces(requete(COOKIE_AUTHJS), { fetchImpl: non.fetchImpl, maintenantMs: 61_001 })).autorise).toBe(false);
        expect(non.fetchImpl).toHaveBeenCalledTimes(2);
    });
    it('un oui est propre à SON cookie : un autre cookie n\'en profite pas', async () => {
        const hub = hubFictif('proprietaire');
        await controlerAcces(requete(COOKIE_AUTHJS), { fetchImpl: hub.fetchImpl, maintenantMs: 0 });
        await controlerAcces(requete(COOKIE_SIGNE), { fetchImpl: hub.fetchImpl, maintenantMs: 1 });
        expect(hub.fetchImpl).toHaveBeenCalledTimes(2);
    });
    it('mémoire bornée : au plus 50 oui retenus', async () => {
        const hub = hubFictif('proprietaire');
        for (let i = 0; i < 80; i++) await controlerAcces(requete(`__Secure-hub.session=v${i}`), { fetchImpl: hub.fetchImpl, maintenantMs: i });
        // les 30 premiers ont été évincés : ils sont redemandés
        await controlerAcces(requete('__Secure-hub.session=v0'), { fetchImpl: hub.fetchImpl, maintenantMs: 100 });
        expect(hub.fetchImpl).toHaveBeenCalledTimes(81);
    });
});

describe('aucune variable ne peut couper le contrôle', () => {
    it('le contrôle ne lit pas l\'environnement : les anciennes valeurs d\'observation n\'ouvrent rien', async () => {
        for (const nom of ['CF_ACCESS_REQUIRED', 'ACCES_REQUIS', 'OBSERVATION']) process.env[nom] = '0';
        try {
            expect((await verdict('proprietaire', null)).v).toEqual({ autorise: false, raison: 'session_absente' });
        } finally {
            for (const nom of ['CF_ACCESS_REQUIRED', 'ACCES_REQUIS', 'OBSERVATION']) delete process.env[nom];
        }
    });
});

describe('statuts et messages', () => {
    it('401 / 403 / 503', () => {
        expect(statutRefus('session_absente')).toBe(401);
        expect(statutRefus('autre_courriel')).toBe(403);
        expect(statutRefus('hub_indisponible')).toBe(503);
    });
    it('un message par raison, sans courriel ni cause technique', () => {
        const messages = (['session_absente', 'autre_courriel', 'hub_indisponible'] as const).map(messageRefus);
        expect(new Set(messages).size).toBe(3);
        for (const m of messages) expect(m).not.toMatch(/@|cookie|jeton|kid|ES256|AUTH_SECRET/i);
    });
});

describe('ipClient (débit) : plus aucune confiance en cf-connecting-ip, qui se falsifie hors Cloudflare', () => {
    it('ignore cf-connecting-ip', () => {
        expect(ipClient(new Headers({ 'cf-connecting-ip': '1.2.3.4', 'x-vercel-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9');
        expect(ipClient(new Headers({ 'cf-connecting-ip': '1.2.3.4' }))).toBe('inconnue');
    });
});
