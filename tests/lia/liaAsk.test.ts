// [LIA-1253] api/lia/ask : la question de Marc à LIA, relayée au hub. Échec FERMÉ à chaque étape.
// Les sessions sont de VRAIES sessions ES256 (paire générée ici), jamais un contournement du contrôle.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import type { JWK, CryptoKey } from 'jose';
import ask from '../../api/lia/ask';
import { NOM_COOKIE_SESSION_HUB, lireCookie, repondreLiaAsk, demanderAuHub, LiaIndisponible } from '../../api/_lib/lia';

const ORIGINE = 'https://finance.hubperso.com';
const MARC = 'proprietaire@example.test';

let privee: CryptoKey;
let jwks: { keys: JWK[] };
let autreJwks: { keys: JWK[] };

async function session(email: string, { kid = 'k1', cle = privee, expireDans = 3600 }: { kid?: string; cle?: CryptoKey; expireDans?: number } = {}): Promise<string> {
    const maintenant = Math.floor(Date.now() / 1000);
    return new SignJWT({ email })
        .setProtectedHeader({ alg: 'ES256', kid })
        .setIssuer('hubperso.com')
        .setIssuedAt(maintenant)
        .setExpirationTime(maintenant + expireDans)
        .sign(cle);
}

beforeAll(async () => {
    const paire = await generateKeyPair('ES256');
    privee = paire.privateKey;
    jwks = { keys: [{ ...(await exportJWK(paire.publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' }] };
    const autre = await generateKeyPair('ES256');
    autreJwks = { keys: [{ ...(await exportJWK(autre.publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' }] };
});

const envComplet = (extra: Record<string, string | undefined> = {}) => ({
    HUB_SESSION_PUBLIC_KEYS: JSON.stringify(jwks),
    AUTHORIZED_EMAIL: MARC,
    HUB_TOKEN: 'jeton-test-app',
    ...extra,
});

function requete(corps: unknown, { cookie, origine = ORIGINE, methode = 'POST' }: { cookie?: string; origine?: string | null; methode?: string } = {}): Request {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (cookie) headers.cookie = `${NOM_COOKIE_SESSION_HUB}=${cookie}`;
    if (origine) headers.origin = origine;
    return new Request('https://finance.hubperso.com/api/lia/ask', {
        method: methode,
        headers,
        ...(methode === 'POST' ? { body: typeof corps === 'string' ? corps : JSON.stringify(corps) } : {}),
    });
}

const hubOk = () => vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify({ text: 'Bonjour Marc.', mood: 'joyeux' }), { status: 200, headers: { 'content-type': 'application/json' } }));

describe('[LIA-1253] lireCookie', () => {
    it('trouve le cookie parmi d\'autres et ignore les noms voisins', () => {
        expect(lireCookie('a=1; __Secure-hub.session=abc.def; b=2', NOM_COOKIE_SESSION_HUB)).toBe('abc.def');
        expect(lireCookie('x__Secure-hub.session=zzz', NOM_COOKIE_SESSION_HUB)).toBeUndefined();
        expect(lireCookie(null, NOM_COOKIE_SESSION_HUB)).toBeUndefined();
    });
});

describe('[LIA-1253] repondreLiaAsk : échec fermé', () => {
    it('GET → 405 avec Allow: POST', async () => {
        const r = await repondreLiaAsk(requete(null, { methode: 'GET' }), { env: envComplet() });
        expect(r.status).toBe(405);
        expect(r.headers.get('allow')).toBe('POST');
    });

    it('sans cookie → 401, no-store, et le hub n\'est JAMAIS appelé', async () => {
        const fetchImpl = hubOk();
        const r = await repondreLiaAsk(requete({ question: 'Salut ?' }), { env: envComplet(), fetchImpl });
        expect(r.status).toBe(401);
        expect(r.headers.get('cache-control')).toBe('no-store');
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('cookie signé par une AUTRE clé, ou kid inconnu, ou expiré → 401', async () => {
        const fetchImpl = hubOk();
        const env = envComplet({ HUB_SESSION_PUBLIC_KEYS: JSON.stringify(autreJwks) });
        expect((await repondreLiaAsk(requete({ question: 'Salut ?' }, { cookie: await session(MARC) }), { env, fetchImpl })).status).toBe(401);
        expect((await repondreLiaAsk(requete({ question: 'Salut ?' }, { cookie: await session(MARC, { kid: 'inconnu' }) }), { env: envComplet(), fetchImpl })).status).toBe(401);
        expect((await repondreLiaAsk(requete({ question: 'Salut ?' }, { cookie: await session(MARC, { expireDans: -120 }) }), { env: envComplet(), fetchImpl })).status).toBe(401);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('clés publiques absentes ou illisibles → 401 (jamais de session acceptée sans clé)', async () => {
        const cookie = await session(MARC);
        for (const cles of [undefined, '', 'pas du json']) {
            const r = await repondreLiaAsk(requete({ question: 'Salut ?' }, { cookie }), { env: envComplet({ HUB_SESSION_PUBLIC_KEYS: cles }), fetchImpl: hubOk() });
            expect(r.status).toBe(401);
        }
    });

    it('session valide d\'une AUTRE personne → 403 ; AUTHORIZED_EMAIL absent → 403 (personne n\'est le propriétaire)', async () => {
        const fetchImpl = hubOk();
        const autre = await session('invite@example.test');
        expect((await repondreLiaAsk(requete({ question: 'Salut ?' }, { cookie: autre }), { env: envComplet(), fetchImpl })).status).toBe(403);
        const moi = await session(MARC);
        expect((await repondreLiaAsk(requete({ question: 'Salut ?' }, { cookie: moi }), { env: envComplet({ AUTHORIZED_EMAIL: undefined }), fetchImpl })).status).toBe(403);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('origine absente ou étrangère → 403 avant toute lecture de session (anti-CSRF)', async () => {
        const fetchImpl = hubOk();
        const cookie = await session(MARC);
        expect((await repondreLiaAsk(requete({ question: 'Salut ?' }, { cookie, origine: null }), { env: envComplet(), fetchImpl })).status).toBe(403);
        expect((await repondreLiaAsk(requete({ question: 'Salut ?' }, { cookie, origine: 'https://evil.example' }), { env: envComplet(), fetchImpl })).status).toBe(403);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('corps trop gros → 413 ; JSON cassé ou question vide → 400', async () => {
        const cookie = await session(MARC);
        const env = envComplet();
        const fetchImpl = hubOk();
        expect((await repondreLiaAsk(requete('x'.repeat(9 * 1024), { cookie }), { env, fetchImpl })).status).toBe(413);
        expect((await repondreLiaAsk(requete('{pas du json', { cookie }), { env, fetchImpl })).status).toBe(400);
        expect((await repondreLiaAsk(requete({ question: '   ' }, { cookie }), { env, fetchImpl })).status).toBe(400);
        expect((await repondreLiaAsk(requete({ question: 'a'.repeat(2001) }, { cookie }), { env, fetchImpl })).status).toBe(400);
        expect((await repondreLiaAsk(requete({ question: 'Salut ?', page: 'http://x' }, { cookie }), { env, fetchImpl })).status).toBe(400);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

describe('[LIA-1253] repondreLiaAsk : relais vers le hub', () => {
    it('Marc, session valide → 200 ; le hub reçoit x-hub-token, la question, la page et proprietaire:true', async () => {
        const fetchImpl = hubOk();
        const cookie = await session(MARC);
        const r = await repondreLiaAsk(requete({ question: '  Où en est mon budget ?  ', page: '/#BUDGET' }, { cookie }), { env: envComplet(), fetchImpl });
        expect(r.status).toBe(200);
        expect(r.headers.get('cache-control')).toBe('no-store');
        expect(await r.json()).toEqual({ text: 'Bonjour Marc.', mood: 'joyeux' });

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://hubperso.com/api/lia/ask');
        expect((init.headers as Record<string, string>)['x-hub-token']).toBe('jeton-test-app');
        expect(JSON.parse(String(init.body))).toEqual({ question: 'Où en est mon budget ?', page: '/#BUDGET', proprietaire: true });
        expect(init.cache).toBe('no-store');
    });

    it('le jeton de l\'app ne figure JAMAIS dans la réponse au navigateur', async () => {
        const cookie = await session(MARC);
        const r = await repondreLiaAsk(requete({ question: 'Salut ?' }, { cookie }), { env: envComplet(), fetchImpl: hubOk() });
        expect(await r.text()).not.toContain('jeton-test-app');
    });

    it('HUB_URL peut pointer un autre hub https ; http: est refusé → 503', async () => {
        const cookie = await session(MARC);
        const fetchImpl = hubOk();
        await repondreLiaAsk(requete({ question: 'Salut ?' }, { cookie }), { env: envComplet({ HUB_URL: 'https://hub-test.example' }), fetchImpl });
        expect(fetchImpl.mock.calls[0][0]).toBe('https://hub-test.example/api/lia/ask');
        const r = await repondreLiaAsk(requete({ question: 'Salut ?' }, { cookie }), { env: envComplet({ HUB_URL: 'http://hub-test.example' }), fetchImpl: hubOk() });
        expect(r.status).toBe(503);
    });

    it.each([
        ['HUB_TOKEN absent', { HUB_TOKEN: undefined }, hubOk()],
        ['hub en panne (500)', {}, vi.fn(async () => new Response('boom', { status: 500 }))],
        ['hub refuse (403)', {}, vi.fn(async () => new Response('{}', { status: 403 }))],
        ['hub injoignable', {}, vi.fn(async () => { throw new TypeError('fetch failed'); })],
        ['réponse non JSON', {}, vi.fn(async () => new Response('<html>', { status: 200 }))],
        ['réponse non conforme', {}, vi.fn(async () => new Response(JSON.stringify({ text: '' }), { status: 200 }))],
        ['humeur inconnue', {}, vi.fn(async () => new Response(JSON.stringify({ text: 'ok', mood: 'furieuse-inventee' }), { status: 200 }))],
    ])('%s → 503 lia_indisponible, jamais une réponse inventée', async (_nom, env, fetchImpl) => {
        const cookie = await session(MARC);
        const r = await repondreLiaAsk(requete({ question: 'Salut ?' }, { cookie }), { env: envComplet(env), fetchImpl: fetchImpl as unknown as typeof fetch });
        expect(r.status).toBe(503);
        expect(await r.json()).toEqual({ error: 'lia_indisponible' });
    });

    it('les blocs composés du hub ne sont PAS relayés (FinanceAI n\'a pas de rendu pour eux)', async () => {
        const cookie = await session(MARC);
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ text: 'Voici.', blocks: [{ type: 'x', html: '<img onerror=1>' }] }), { status: 200 }));
        const r = await repondreLiaAsk(requete({ question: 'Salut ?' }, { cookie }), { env: envComplet(), fetchImpl: fetchImpl as unknown as typeof fetch });
        expect(await r.json()).toEqual({ text: 'Voici.' });
    });

    it('demanderAuHub lève LiaIndisponible (type exporté) sans jeton', async () => {
        await expect(demanderAuHub({ question: 'Salut ?' }, { env: {} })).rejects.toBeInstanceOf(LiaIndisponible);
    });
});

describe('[LIA-1253] api/lia/ask.ts : l\'export que Vercel appelle', () => {
    it('runtime Node ; sans cookie → 401 (jamais 200)', async () => {
        const r = await ask.fetch(requete({ question: 'Salut ?' }));
        expect(r.status).toBe(401);
    });
});
