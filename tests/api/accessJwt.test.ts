// @vitest-environment node
// [CF-ACCESS] Contrôle du jeton Cloudflare Access : chaque condition du plan pole-securite a son test.
// Les clés sont GÉNÉRÉES ici à chaque exécution (aucune clé réelle, aucun jeton réel dans le dépôt). Le réseau n'est jamais
// touché : les clés publiques sont injectées (`opts.cles`).
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet, type JWK, type CryptoKey, type JWTPayload } from 'jose';
import {
    accessDepuisEnv, accesExige, jetonAccessValide, controlerAcces, reinitialiserCleAccess, ENTETE_JETON, type AccessConfig,
} from '../../api/_lib/accessJwt';
import { ipClient } from '../../api/_lib/garde';

const CFG: AccessConfig = { equipe: 'equipe-test', aud: 'aud-test-0123', email: 'marc@exemple.test' };
const ISS = 'https://equipe-test.cloudflareaccess.com';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

let priv: CryptoKey;
let autrePriv: CryptoKey;
let cles: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
    const paire = await generateKeyPair('RS256', { extractable: true });
    const autre = await generateKeyPair('RS256', { extractable: true });
    priv = paire.privateKey;
    autrePriv = autre.privateKey;
    const jwk: JWK = { ...(await exportJWK(paire.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    cles = createLocalJWKSet({ keys: [jwk] });
});

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { reinitialiserCleAccess(); warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { vi.restoreAllMocks(); });

async function jeton(over: { payload?: JWTPayload; cle?: CryptoKey; kid?: string; iss?: string | null; aud?: string | null; exp?: string | number | null } = {}) {
    const p = new SignJWT({ email: CFG.email, ...over.payload }).setProtectedHeader({ alg: 'RS256', kid: over.kid ?? 'k1' }).setIssuedAt();
    if (over.iss !== null) p.setIssuer(over.iss ?? ISS);
    if (over.aud !== null) p.setAudience(over.aud ?? CFG.aud);
    if (over.exp !== null) p.setExpirationTime(over.exp ?? '10m');
    return p.sign(over.cle ?? priv);
}
const ok = (t: string | null | undefined, extra: { maintenant?: Date } = {}) => jetonAccessValide(t, CFG, { cles, ...extra });

describe('jeton valide', () => {
    it('un jeton correct est accepté', async () => {
        expect(await ok(await jeton())).toBe(true);
    });
    it('l\'e-mail se compare sans tenir compte de la casse', async () => {
        expect(await ok(await jeton({ payload: { email: 'MARC@Exemple.TEST' } }))).toBe(true);
    });
    it('aud sous forme de tableau : accepté s\'il CONTIENT la valeur attendue', async () => {
        const t = await new SignJWT({ email: CFG.email }).setProtectedHeader({ alg: 'RS256', kid: 'k1' })
            .setIssuer(ISS).setAudience(['autre-app', CFG.aud]).setExpirationTime('10m').sign(priv);
        expect(await ok(t)).toBe(true);
    });
});

describe('jeton refusé', () => {
    it('absent / vide', async () => {
        expect(await ok(undefined)).toBe(false);
        expect(await ok(null)).toBe(false);
        expect(await ok('')).toBe(false);
    });
    it('n\'importe quelle chaîne qui n\'est pas un jeton', async () => {
        expect(await ok('abc')).toBe(false);
        expect(await ok('a.b.c')).toBe(false);
    });
    it('altéré : charge utile modifiée après signature (e-mail changé)', async () => {
        const [h, , s] = (await jeton()).split('.');
        const faux = `${h}.${b64({ email: 'pirate@exemple.test', iss: ISS, aud: CFG.aud, exp: Math.floor(Date.now() / 1000) + 600 })}.${s}`;
        expect(await ok(faux)).toBe(false);
    });
    it('altéré : un octet de la signature change', async () => {
        const t = await jeton();
        const i = t.length - 5;
        const c = t[i] === 'A' ? 'B' : 'A';
        expect(await ok(t.slice(0, i) + c + t.slice(i + 1))).toBe(false);
    });
    it('signé par une AUTRE clé (même kid)', async () => {
        expect(await ok(await jeton({ cle: autrePriv }))).toBe(false);
    });
    it('kid inconnu', async () => {
        expect(await ok(await jeton({ kid: 'inconnu' }))).toBe(false);
    });
    it('expiré', async () => {
        const t = await jeton({ exp: Math.floor(Date.now() / 1000) - 3600 });
        expect(await ok(t)).toBe(false);
    });
    it('exp OBLIGATOIRE : un jeton sans expiration est refusé', async () => {
        expect(await ok(await jeton({ exp: null }))).toBe(false);
    });
    it('pas encore valide (nbf dans le futur)', async () => {
        const t = await new SignJWT({ email: CFG.email }).setProtectedHeader({ alg: 'RS256', kid: 'k1' })
            .setIssuer(ISS).setAudience(CFG.aud).setNotBefore(Math.floor(Date.now() / 1000) + 3600).setExpirationTime('2h').sign(priv);
        expect(await ok(t)).toBe(false);
    });
    it('horloge injectée : accepté juste avant l\'expiration, refusé juste après (tolérance 5 s)', async () => {
        const exp = Math.floor(Date.now() / 1000) + 600;
        const t = await jeton({ exp });
        expect(await ok(t, { maintenant: new Date((exp - 10) * 1000) })).toBe(true);
        expect(await ok(t, { maintenant: new Date((exp + 60) * 1000) })).toBe(false);
    });
    it('mauvais aud', async () => {
        expect(await ok(await jeton({ aud: 'autre-application' }))).toBe(false);
    });
    it('aud absent', async () => {
        expect(await ok(await jeton({ aud: null }))).toBe(false);
    });
    it('mauvais iss (autre équipe, même préfixe, http, suffixe, slash final)', async () => {
        for (const iss of ['https://autre.cloudflareaccess.com', 'https://equipe-test.cloudflareaccess.com.evil.test',
            'http://equipe-test.cloudflareaccess.com', `${ISS}/`, 'https://evil.test']) {
            expect(await ok(await jeton({ iss })), iss).toBe(false);
        }
    });
    it('iss absent', async () => {
        expect(await ok(await jeton({ iss: null }))).toBe(false);
    });
    it('e-mail différent', async () => {
        expect(await ok(await jeton({ payload: { email: 'quelquun@exemple.test' } }))).toBe(false);
    });
    it('e-mail absent ou non textuel', async () => {
        expect(await ok(await jeton({ payload: { email: undefined } }))).toBe(false);
        expect(await ok(await jeton({ payload: { email: 42 as unknown as string } }))).toBe(false);
    });
    it('alg « none » : jeton non signé refusé', async () => {
        const t = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ email: CFG.email, iss: ISS, aud: CFG.aud, exp: Math.floor(Date.now() / 1000) + 600 })}.`;
        expect(await ok(t)).toBe(false);
    });
    it('alg HS256 : refusé (confusion d\'algorithme, même avec un secret quelconque)', async () => {
        const t = await new SignJWT({ email: CFG.email }).setProtectedHeader({ alg: 'HS256', kid: 'k1' })
            .setIssuer(ISS).setAudience(CFG.aud).setExpirationTime('10m').sign(new TextEncoder().encode('un-secret-de-test-de-32-octets-mini!'));
        expect(await ok(t)).toBe(false);
    });
    it('alg RS512 : refusé (RS256 SEULEMENT)', async () => {
        const paire = await generateKeyPair('RS512', { extractable: true });
        const jwk: JWK = { ...(await exportJWK(paire.publicKey)), kid: 'k512', alg: 'RS512' };
        const t = await new SignJWT({ email: CFG.email }).setProtectedHeader({ alg: 'RS512', kid: 'k512' })
            .setIssuer(ISS).setAudience(CFG.aud).setExpirationTime('10m').sign(paire.privateKey);
        expect(await jetonAccessValide(t, CFG, { cles: createLocalJWKSet({ keys: [jwk] }) })).toBe(false);
    });
});

describe('jamais de journal du jeton', () => {
    it('un refus n\'écrit que le code d\'erreur, jamais le jeton ni un morceau', async () => {
        const t = await jeton({ aud: 'autre' });
        expect(await ok(t)).toBe(false);
        const tout = JSON.stringify(warn.mock.calls);
        for (const morceau of t.split('.')) expect(tout).not.toContain(morceau);
        expect(tout).toContain('[access] jeton refusé');
    });
});

describe('configuration', () => {
    const env = (o: Record<string, string>) => (k: string) => o[k];
    it('complète : lue, e-mail en minuscules', () => {
        expect(accessDepuisEnv(env({ CF_ACCESS_TEAM_DOMAIN: 'equipe-test', CF_ACCESS_AUD: 'a', CF_ACCESS_EMAIL: 'Marc@Exemple.test' })))
            .toEqual({ equipe: 'equipe-test', aud: 'a', email: 'marc@exemple.test' });
    });
    it.each([
        ['équipe absente', { CF_ACCESS_AUD: 'a', CF_ACCESS_EMAIL: 'm@e.t' }],
        ['aud absent', { CF_ACCESS_TEAM_DOMAIN: 'x', CF_ACCESS_EMAIL: 'm@e.t' }],
        ['e-mail absent', { CF_ACCESS_TEAM_DOMAIN: 'x', CF_ACCESS_AUD: 'a' }],
        ['équipe = hôte complet (on ne laisse pas choisir où chercher les clés)', { CF_ACCESS_TEAM_DOMAIN: 'evil.test/x', CF_ACCESS_AUD: 'a', CF_ACCESS_EMAIL: 'm@e.t' }],
        ['équipe = URL', { CF_ACCESS_TEAM_DOMAIN: 'https://x.cloudflareaccess.com', CF_ACCESS_AUD: 'a', CF_ACCESS_EMAIL: 'm@e.t' }],
        ['e-mail sans @', { CF_ACCESS_TEAM_DOMAIN: 'x', CF_ACCESS_AUD: 'a', CF_ACCESS_EMAIL: 'marc' }],
    ])('invalide → null : %s', (_n, o) => {
        expect(accessDepuisEnv(env(o as Record<string, string>))).toBeNull();
    });
    it('CF_ACCESS_REQUIRED : SEULE la valeur exacte « 0 » désactive l\'exigence', () => {
        expect(accesExige(env({}))).toBe(true); // absente = exiger
        for (const v of ['', '1', 'true', 'false', 'non', 'off', ' 0', '0 ', '00', 'O']) {
            expect(accesExige(env({ CF_ACCESS_REQUIRED: v })), JSON.stringify(v)).toBe(true);
        }
        expect(accesExige(env({ CF_ACCESS_REQUIRED: '0' }))).toBe(false);
    });
});

describe('controlerAcces (en-tête + exigence)', () => {
    const base = { CF_ACCESS_TEAM_DOMAIN: CFG.equipe, CF_ACCESS_AUD: CFG.aud, CF_ACCESS_EMAIL: CFG.email };
    const get = (o: Record<string, string>) => (k: string) => o[k];
    const avec = async (over: Record<string, string> = {}) => new Headers({ [ENTETE_JETON]: await jeton(), ...over });

    it('exigé (défaut) + jeton valide → autorisé, jetonValide', async () => {
        expect(await controlerAcces(await avec(), get(base), { cles })).toEqual({ autorise: true, jetonValide: true, observation: false });
    });
    it('exigé + sans en-tête → refusé', async () => {
        expect(await controlerAcces(new Headers(), get(base), { cles })).toEqual({ autorise: false, jetonValide: false, observation: false });
    });
    it('exigé + jeton d\'une autre clé → refusé', async () => {
        const h = new Headers({ [ENTETE_JETON]: await jeton({ cle: autrePriv }) });
        expect((await controlerAcces(h, get(base), { cles })).autorise).toBe(false);
    });
    it('CAS « valeur absente = exiger » : sans CF_ACCESS_REQUIRED, un appel sans jeton est REFUSÉ', async () => {
        expect((await controlerAcces(new Headers(), get(base), { cles })).autorise).toBe(false);
        expect((await controlerAcces(new Headers(), get({ ...base, CF_ACCESS_REQUIRED: '' }), { cles })).autorise).toBe(false);
    });
    it('exigé + configuration absente → refusé (échec FERMÉ), même avec un en-tête', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect((await controlerAcces(await avec(), get({}), { cles })).autorise).toBe(false);
        expect(err).toHaveBeenCalled();
    });
    it('observation (« 0 ») : laisse passer sans jeton, journalise « observation active », sans donnée', async () => {
        const v = await controlerAcces(new Headers({ [ENTETE_JETON]: 'jeton-bidon' }), get({ ...base, CF_ACCESS_REQUIRED: '0' }), { cles });
        expect(v).toEqual({ autorise: true, jetonValide: false, observation: true });
        const tout = JSON.stringify(warn.mock.calls);
        expect(tout).toContain('observation active');
        expect(tout).not.toContain('jeton-bidon');
    });
    it('observation + jeton valide : jetonValide vrai (l\'IP Cloudflare peut être crue)', async () => {
        const v = await controlerAcces(await avec(), get({ ...base, CF_ACCESS_REQUIRED: '0' }), { cles });
        expect(v).toEqual({ autorise: true, jetonValide: true, observation: false });
    });
    it('observation sans configuration : passe, jamais de jeton valide', async () => {
        const v = await controlerAcces(await avec(), get({ CF_ACCESS_REQUIRED: '0' }), { cles });
        expect(v).toEqual({ autorise: true, jetonValide: false, observation: true });
    });
});

describe('ipClient : cf-connecting-ip seulement avec un jeton valide', () => {
    const h = new Headers({ 'cf-connecting-ip': '198.51.100.7', 'x-vercel-forwarded-for': '104.16.0.1' });
    it('sans jeton valide : cf-connecting-ip est IGNORÉE (falsifiable hors Cloudflare)', () => {
        expect(ipClient(h)).toBe('104.16.0.1');
        expect(ipClient(h, false)).toBe('104.16.0.1');
        expect(ipClient(new Headers({ 'cf-connecting-ip': '198.51.100.7' }))).toBe('inconnue');
    });
    it('avec un jeton valide : cf-connecting-ip est crue', () => {
        expect(ipClient(h, true)).toBe('198.51.100.7');
    });
    it('jeton valide mais en-tête absent : repli sur les en-têtes de la plateforme', () => {
        expect(ipClient(new Headers({ 'x-vercel-forwarded-for': '104.16.0.1' }), true)).toBe('104.16.0.1');
    });
});

describe('journal : jamais inondable', () => {
    const get = (o: Record<string, string>) => (k: string) => o[k];
    it('configuration incomplète : UNE ligne par minute, quel que soit le nombre d\'appels, sans donnée', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        for (let i = 0; i < 20; i++) await controlerAcces(new Headers({ [ENTETE_JETON]: `secret-${i}` }), get({}), { cles });
        expect(err).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(err.mock.calls)).not.toContain('secret-');
    });
    it('jetons refusés : au plus une ligne par 10 s', async () => {
        for (let i = 0; i < 20; i++) await ok(`a.b.${i}`);
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
