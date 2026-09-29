// tests/mcp/limitesDebitMcp.test.ts
//
// [MCP-RATE-LIMIT] [MCP-ERREUR-SANS-EXTRAIT] [MCP-ACCESS-KEY-MIN] Durcissement du serveur MCP (audit P3-P6, moyennes
// 5, 6 et 8). Règle cardinale testée : ON VÉRIFIE D'ABORD, ON REFUSE APRÈS — un secret VALIDE n'est jamais bloqué par un
// flot d'échecs, et un flot non authentifié ne consomme jamais le budget légitime. Données 100 % générées.
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import {
    makeRouteGuard, adresseClient, ROUTE_LIMITS, AUTH_FAILURE_MAX_PAR_ADRESSE, type LimitedRoute,
} from '../../mcp/auth/routeRateLimit';
import {
    startHttpServer, cleAccesTropCourte, evaluerCleAcces, alerteCleAcces, MIN_ACCESS_KEY_LENGTH, type RunningHttpServer,
} from '../../mcp/http';
import { makeOAuthProvider } from '../../mcp/auth/oauthProvider';
import { createServer } from '../../mcp/server';
import { CLE_FAIBLE_PING } from '../../mcp/tools/ping.tool';
import type { ResolvedState } from '../../mcp/bootstrap';
import { normalizeAppState, parseRawToAppState, type StateSource } from '../../mcp/state/loadAppState';
import { makeStateStore } from '../../mcp/state/stateStore';
import { TEST_PERSONAS } from '../../services/testPersonas';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const A = (route: LimitedRoute, authentifie: boolean, adresse = '1.1.1.1') => ({ authentifie, adresse, route });

// ── Garde de débit (pur, horloge maîtrisée) ─────────────────────────────────────────────────────────
describe('[MCP-RATE-LIMIT] routeRateLimit (pur)', () => {
    it('volume des appels AUTHENTIFIÉS : le (max+1)ᵉ est refusé avec un Retry-After, la fenêtre glisse', () => {
        let t = 0;
        const g = makeRouteGuard({ now: () => t, limits: { '/refresh': { max: 2, windowMs: 60_000 } } });
        for (let i = 0; i < 2; i++) expect(g.enter('/refresh', A('/refresh', true)).ok).toBe(true);
        const refus = g.enter('/refresh', A('/refresh', true));
        expect(refus).toMatchObject({ ok: false, reason: 'debit' });
        if (!refus.ok) expect(refus.retryAfterSeconds).toBeGreaterThanOrEqual(1);
        t += 60_001;
        expect(g.enter('/refresh', A('/refresh', true)).ok).toBe(true);
    });

    it('un flot NON authentifié (même énorme, même concurrent) ne consomme JAMAIS le budget de volume', () => {
        const g = makeRouteGuard({ limits: { '/refresh': { max: 2, windowMs: 60_000 } }, failureMax: 1_000_000 });
        const enCours = Array.from({ length: 5000 }, () => g.enter('/refresh', A('/refresh', false)));
        expect(enCours.every((e) => e.ok)).toBe(true); // rien n'a fini : aucun remboursement possible, aucun budget touché
        for (let i = 0; i < 2; i++) expect(g.enter('/refresh', A('/refresh', true)).ok).toBe(true);
        expect(g.enter('/refresh', A('/refresh', true)).ok).toBe(false);
    });

    it('échecs d\'authentification : blocage PAR ADRESSE seulement, levé après la fenêtre', () => {
        let t = 0;
        const g = makeRouteGuard({ now: () => t, failureMax: 3, failureWindowMs: 10_000 });
        for (let i = 0; i < 3; i++) { const e = g.enter('/hub/summary', A('/hub/summary', false, '6.6.6.6')); expect(e.ok).toBe(true); if (e.ok) e.done(401); }
        expect(g.enter('/hub/summary', A('/hub/summary', false, '6.6.6.6'))).toMatchObject({ ok: false, reason: 'echecs' });
        expect(g.enter('/hub/summary', A('/hub/summary', false, '7.7.7.7')).ok).toBe(true); // une autre adresse n'est pas touchée
        t += 10_001;
        expect(g.enter('/hub/summary', A('/hub/summary', false, '6.6.6.6')).ok).toBe(true);
    });

    it('un secret VALIDE n\'est JAMAIS bloqué, même depuis une adresse au quota d\'échecs épuisé', () => {
        const g = makeRouteGuard({ failureMax: 2 });
        for (let i = 0; i < 2; i++) { const e = g.enter('/refresh', A('/refresh', false, '6.6.6.6')); if (e.ok) e.done(403); }
        expect(g.enter('/refresh', A('/refresh', false, '6.6.6.6')).ok).toBe(false);
        expect(g.enter('/refresh', A('/refresh', true, '6.6.6.6')).ok).toBe(true);
    });

    it('seuls les 401/403 comptent comme échecs (un 404 ou un 200 non authentifié ne compte pas)', () => {
        const g = makeRouteGuard({ failureMax: 1 });
        for (const statut of [200, 404, 405, 500]) { const e = g.enter('/mcp', A('/mcp', false)); if (e.ok) e.done(statut); }
        expect(g.enter('/mcp', A('/mcp', false)).ok).toBe(true);
    });

    it('les routes sont indépendantes ; la table d\'adresses est bornée', () => {
        const g = makeRouteGuard({ failureMax: 1, maxAdresses: 3 });
        const e = g.enter('/refresh', A('/refresh', false, 'a')); if (e.ok) e.done(401);
        expect(g.enter('/refresh', A('/refresh', false, 'a')).ok).toBe(false);
        expect(g.enter('/mcp', A('/mcp', false, 'a')).ok).toBe(true);
        // 3 autres adresses évincent la plus ancienne (« a » repart de zéro) : mémoire bornée
        for (const ad of ['b', 'c', 'd']) g.enter('/vehicule/bail', A('/vehicule/bail', false, ad));
        expect(g.enter('/refresh', A('/refresh', false, 'a')).ok).toBe(true);
    });

    it('adresseClient : DERNIER élément de X-Forwarded-For (les précédents sont forgeables), sinon la socket', () => {
        expect(adresseClient('9.9.9.9, 1.1.1.1', '10.0.0.1')).toBe('1.1.1.1');
        expect(adresseClient(['8.8.8.8', '2.2.2.2'], undefined)).toBe('2.2.2.2');
        expect(adresseClient(undefined, '10.0.0.1')).toBe('10.0.0.1');
        expect(adresseClient('', undefined)).toBe('inconnue');
    });

    it('les plafonds par défaut couvrent les 5 routes et restent bornés', () => {
        expect(Object.keys(ROUTE_LIMITS).sort()).toEqual(['/fintable-sync', '/hub/summary', '/mcp', '/refresh', '/vehicule/bail']);
        for (const l of Object.values(ROUTE_LIMITS)) { expect(l.max).toBeGreaterThan(0); expect(l.max).toBeLessThanOrEqual(600); }
        expect(AUTH_FAILURE_MAX_PAR_ADRESSE).toBeGreaterThanOrEqual(50);
    });
});

// ── Câblage HTTP réel ───────────────────────────────────────────────────────────────────────────────
function fixtureState(): ResolvedState {
    const state = normalizeAppState(TEST_PERSONAS.find((p) => p.id === 'karim-immigre')!.build());
    const source: StateSource = { description: 'fixture http', loadRaw: async () => JSON.stringify(state) };
    return { source, store: makeStateStore(source), isDrive: false, driveEmail: null, describe: () => 'fixture http' };
}
const HUB = 'jeton-hub-genere-0123456789';
const AUTRE = 'refresh-genere-0123456789';

describe('[MCP-RATE-LIMIT] câblage sur le vrai serveur HTTP', () => {
    let running: RunningHttpServer | null = null;
    afterEach(async () => { await running?.close(); running = null; });
    const hub = (port: number, token: string, xff?: string): Promise<Response> =>
        fetch(`http://127.0.0.1:${port}/hub/summary`, { headers: { 'x-hub-token': token, ...(xff ? { 'x-forwarded-for': xff } : {}) } });

    it('/hub/summary : échecs répétés → 429 + Retry-After pour l\'adresse fautive, mais le jeton VALIDE passe toujours', async () => {
        running = await startHttpServer({
            port: 0, host: '127.0.0.1', state: fixtureState(), hubToken: HUB,
            rateGuard: makeRouteGuard({ failureMax: 3 }),
        });
        for (let i = 0; i < 3; i++) expect((await hub(running.port, 'mauvais-jeton')).status).toBe(401);
        const bloque = await hub(running.port, 'mauvais-jeton');
        expect(bloque.status).toBe(429);
        expect(Number(bloque.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
        expect((await hub(running.port, HUB)).status).toBe(200); // vérifier d'abord, refuser après
    });

    it('un flot d\'échecs d\'une adresse ne touche PAS une autre adresse (X-Forwarded-For : dernier élément, préfixe forgé ignoré)', async () => {
        running = await startHttpServer({
            port: 0, host: '127.0.0.1', state: fixtureState(), hubToken: HUB,
            rateGuard: makeRouteGuard({ failureMax: 2 }),
        });
        for (let i = 0; i < 2; i++) expect((await hub(running.port, 'faux', '9.9.9.9, 6.6.6.6')).status).toBe(401);
        expect((await hub(running.port, 'faux', 'autre, 6.6.6.6')).status).toBe(429); // même adresse réelle malgré un préfixe différent
        expect((await hub(running.port, 'faux', '6.6.6.6, 7.7.7.7')).status).toBe(401); // autre adresse réelle : intacte
    });

    it('/hub/summary : plafond de volume → 429 au (max+1)ᵉ appel authentifié', async () => {
        running = await startHttpServer({
            port: 0, host: '127.0.0.1', state: fixtureState(), hubToken: HUB,
            rateGuard: makeRouteGuard({ limits: { '/hub/summary': { max: 2, windowMs: 60_000 } } }),
        });
        expect((await hub(running.port, HUB)).status).toBe(200);
        expect((await hub(running.port, HUB)).status).toBe(200);
        expect((await hub(running.port, HUB)).status).toBe(429);
    });

    it('un flot non authentifié n\'affame pas l\'appel légitime (le budget de volume reste intact)', async () => {
        running = await startHttpServer({
            port: 0, host: '127.0.0.1', state: fixtureState(), hubToken: HUB,
            rateGuard: makeRouteGuard({ limits: { '/hub/summary': { max: 2, windowMs: 60_000 } }, failureMax: 1000 }),
        });
        for (let i = 0; i < 10; i++) expect((await hub(running.port, 'mauvais-jeton')).status).toBe(401);
        expect((await hub(running.port, HUB)).status).toBe(200);
        expect((await hub(running.port, HUB)).status).toBe(200);
    });

    it.each([
        ['/refresh', 'POST'],
        ['/fintable-sync', 'POST'],
        ['/vehicule/bail', 'GET'],
    ])('%s : échecs d\'authentification répétés → 429 pour cette adresse', async (route, method) => {
        running = await startHttpServer({
            port: 0, host: '127.0.0.1', state: fixtureState(),
            refreshSecret: AUTRE, fintableSyncSecret: AUTRE + 'f', vehiculeSecret: AUTRE + 'v', hubToken: HUB,
            rateGuard: makeRouteGuard({ failureMax: 2 }),
        });
        const appel = (): Promise<Response> => fetch(`http://127.0.0.1:${running!.port}${route}`, {
            method, headers: { Authorization: 'Bearer faux', 'x-hub-token': 'faux' },
        });
        const statuts: number[] = [];
        for (let i = 0; i < 4; i++) statuts.push((await appel()).status);
        expect(statuts.slice(2)).toEqual([429, 429]);
        expect(statuts.slice(0, 2).every((s) => s === 401 || s === 403)).toBe(true);
    });

    it('/mcp (sans OAuth) : plafond de volume → 429 ; /health jamais limité', async () => {
        running = await startHttpServer({
            port: 0, host: '127.0.0.1', state: fixtureState(),
            rateGuard: makeRouteGuard({ limits: { '/mcp': { max: 2, windowMs: 60_000 } } }),
        });
        const init = (i: number): string => JSON.stringify({
            jsonrpc: '2.0', id: i, method: 'initialize',
            params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } },
        });
        const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
        const statuts: number[] = [];
        for (let i = 1; i <= 3; i++) statuts.push((await fetch(`http://127.0.0.1:${running.port}/mcp`, { method: 'POST', headers, body: init(i) })).status);
        expect(statuts).toEqual([200, 200, 429]);
        for (let i = 0; i < 5; i++) expect((await fetch(`http://127.0.0.1:${running.port}/health`)).status).toBe(200);
    });
});

// ── Message d'erreur de parse sans extrait ──────────────────────────────────────────────────────────
describe('[MCP-ERREUR-SANS-EXTRAIT] parseRawToAppState', () => {
    it('un JSON invalide ne cite jamais un extrait du contenu', () => {
        const brut = '{"transactions": [{"payee": "MARCHAND-SENTINELLE-XYZ", "amount": 987654.32 ,, }';
        let message = '';
        try { parseRawToAppState(brut, 'source de test'); } catch (e) { message = (e as Error).message; }
        expect(message).toMatch(/JSON invalide depuis source de test/);
        expect(message).not.toMatch(/SENTINELLE|987654|payee|transactions|position|token/i);
    });
});

// ── Clé d'accès faible : alerte + état, refus seulement en STRICT (et alors seule /oauth/authorize) ─────
describe('[MCP-ACCESS-KEY-MIN] FINANCEAI_ACCESS_KEY', () => {
    const COURTE = 'CLE-COURTE-SENTINELLE';
    const LONGUE = 'a'.repeat(MIN_ACCESS_KEY_LENGTH);

    it('verdicts : courte sans STRICT = faible mais pas de refus ; courte + STRICT=1 = refus ; longue = rien', () => {
        expect(MIN_ACCESS_KEY_LENGTH).toBe(32);
        expect(cleAccesTropCourte('a'.repeat(31))).toBe(true);
        expect(cleAccesTropCourte(LONGUE)).toBe(false);
        expect(evaluerCleAcces(COURTE, undefined)).toEqual({ faible: true, refuser: false });
        expect(evaluerCleAcces(COURTE, '0')).toEqual({ faible: true, refuser: false });
        expect(evaluerCleAcces(COURTE, '')).toEqual({ faible: true, refuser: false });
        expect(evaluerCleAcces(COURTE, '1')).toEqual({ faible: true, refuser: true });
        expect(evaluerCleAcces(LONGUE, '1')).toEqual({ faible: false, refuser: false });
        expect(evaluerCleAcces(undefined, '1')).toEqual({ faible: false, refuser: false });
    });

    it('l\'alerte existe pour faible et STRICT, jamais pour une clé conforme, et ne contient ni la clé ni sa longueur', () => {
        const faible = alerteCleAcces(evaluerCleAcces(COURTE, undefined));
        const strict = alerteCleAcces(evaluerCleAcces(COURTE, '1'));
        expect(faible).toMatch(/ALERTE/);
        expect(strict).toMatch(/STRICT/);
        expect(alerteCleAcces(evaluerCleAcces(LONGUE, undefined))).toBeNull();
        for (const m of [faible!, strict!]) {
            expect(m).not.toContain(COURTE);
            expect(m).not.toMatch(new RegExp(`\\b${COURTE.length}\\b`));
        }
    });

    it('état visible de Marc : `ping` (derrière l\'OAuth) signale la clé faible, sans clé ni longueur ; rien si conforme', async () => {
        const ping = async (faible: boolean): Promise<string> => {
            const server = createServer({ cleAccesFaible: faible });
            const client = new Client({ name: 't', version: '0' });
            const [c, s] = InMemoryTransport.createLinkedPair();
            await Promise.all([server.connect(s), client.connect(c)]);
            const rep = await client.callTool({ name: 'ping', arguments: {} });
            await client.close();
            return (rep.content as Array<{ text: string }>)[0].text;
        };
        const faible = await ping(true);
        expect(faible).toContain(CLE_FAIBLE_PING);
        expect(await ping(false)).toMatch(/^pong \d{4}-/);
        expect(await ping(false)).not.toContain('faible');
    });

    describe('STRICT + clé faible : le serveur démarre, seule /oauth/authorize répond 503', () => {
        let srv: RunningHttpServer | null = null;
        afterEach(async () => { await srv?.close(); srv = null; });
        const s256 = (v: string): string => createHash('sha256').update(v, 'utf8').digest('base64url');

        it('/oauth/authorize (GET et POST) → 503 sans la clé ; .well-known, register, hub et /health continuent', async () => {
            srv = await startHttpServer({
                port: 0, host: '127.0.0.1', state: fixtureState(), hubToken: HUB, autorisationBloquee: true,
                auth: makeOAuthProvider({ signingKey: 's'.repeat(48), accessKey: COURTE, issuer: 'http://127.0.0.1:0' }),
            });
            const base = `http://127.0.0.1:${srv.port}`;
            const q = new URLSearchParams({ response_type: 'code', client_id: 'x', redirect_uri: 'http://127.0.0.1:9/cb', code_challenge: s256('v'.repeat(50)), code_challenge_method: 'S256' });
            const get = await fetch(`${base}/oauth/authorize?${q}`);
            expect(get.status).toBe(503);
            const post = await fetch(`${base}/oauth/authorize`, {
                method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ access_key: COURTE }).toString(),
            });
            expect(post.status).toBe(503);
            expect(`${await get.text()}${await post.text()}`).not.toContain(COURTE);
            expect((await fetch(`${base}/.well-known/oauth-authorization-server`)).status).toBe(200);
            expect((await fetch(`${base}/oauth/register`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ redirect_uris: ['http://127.0.0.1:9/callback'] }),
            })).status).toBe(201);
            expect((await fetch(`${base}/health`)).status).toBe(200);
            expect((await fetch(`${base}/hub/summary`, { headers: { 'x-hub-token': HUB } })).status).toBe(200);
            // /mcp reste gardé par l'OAuth (401 sans jeton), pas coupé : la porte d'autorisation seule est fermée.
            const mcp = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{}' });
            expect(mcp.status).toBe(401);
        });

        it('sans STRICT (autorisationBloquee absent) : /oauth/authorize fonctionne avec une clé courte', async () => {
            srv = await startHttpServer({
                port: 0, host: '127.0.0.1', state: fixtureState(),
                auth: makeOAuthProvider({ signingKey: 's'.repeat(48), accessKey: COURTE, issuer: 'http://127.0.0.1:0' }),
            });
            const q = new URLSearchParams({ response_type: 'code', client_id: 'x', redirect_uri: 'http://127.0.0.1:9/cb', code_challenge: s256('v'.repeat(50)), code_challenge_method: 'S256' });
            const res = await new Promise<number>((resolve, reject) => {
                const r = httpRequest({ host: '127.0.0.1', port: srv!.port, path: `/oauth/authorize?${q}` }, (rep) => { rep.resume(); resolve(rep.statusCode ?? 0); });
                r.on('error', reject); r.end();
            });
            expect(res).not.toBe(503);
        });
    });
});
