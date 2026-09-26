// tests/mcp/limitesDebitMcp.test.ts
//
// [MCP-RATE-LIMIT] [MCP-ERREUR-SANS-EXTRAIT] [MCP-ACCESS-KEY-MIN] Durcissement du serveur MCP (audit P3-P6, moyennes
// 5, 6 et 8) : limites de débit des routes, message d'erreur de parse sans extrait, longueur minimale de la clé
// d'accès. Données 100 % générées.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeRouteGuard, ROUTE_LIMITS, AUTH_FAILURE_MAX } from '../../mcp/auth/routeRateLimit';
import { startHttpServer, cleAccesTropCourte, MIN_ACCESS_KEY_LENGTH, type RunningHttpServer } from '../../mcp/http';
import type { ResolvedState } from '../../mcp/bootstrap';
import { normalizeAppState, parseRawToAppState, type StateSource } from '../../mcp/state/loadAppState';
import { makeStateStore } from '../../mcp/state/stateStore';
import { TEST_PERSONAS } from '../../services/testPersonas';

// ── Garde de débit (pur, horloge maîtrisée) ─────────────────────────────────────────────────────────
describe('[MCP-RATE-LIMIT] routeRateLimit (pur)', () => {
    it('plafond de volume : le (max+1)ᵉ appel réussi est refusé avec un Retry-After', () => {
        let t = 0;
        const g = makeRouteGuard({ now: () => t, limits: { '/refresh': { max: 2, windowMs: 60_000 } } });
        for (let i = 0; i < 2; i++) { const e = g.enter('/refresh'); expect(e.ok).toBe(true); if (e.ok) e.done(200); }
        const refus = g.enter('/refresh');
        expect(refus).toMatchObject({ ok: false, reason: 'debit' });
        if (!refus.ok) expect(refus.retryAfterSeconds).toBeGreaterThanOrEqual(1);
        t += 60_001; // la fenêtre glisse
        expect(g.enter('/refresh').ok).toBe(true);
    });

    it('un refus d\'authentification est REMBOURSÉ : un flot non authentifié ne consomme pas le budget légitime', () => {
        const g = makeRouteGuard({ limits: { '/refresh': { max: 2, windowMs: 60_000 } }, failureMax: 1000 });
        for (let i = 0; i < 50; i++) { const e = g.enter('/refresh'); expect(e.ok).toBe(true); if (e.ok) e.done(401); }
        for (let i = 0; i < 2; i++) { const e = g.enter('/refresh'); expect(e.ok).toBe(true); if (e.ok) e.done(200); }
        expect(g.enter('/refresh').ok).toBe(false);
    });

    it('trop d\'échecs d\'authentification : blocage AVANT d\'examiner le secret, levé après la fenêtre', () => {
        let t = 0;
        const g = makeRouteGuard({ now: () => t, failureMax: 3, failureWindowMs: 10_000 });
        for (let i = 0; i < 3; i++) { const e = g.enter('/hub/summary'); expect(e.ok).toBe(true); if (e.ok) e.done(403); }
        expect(g.enter('/hub/summary')).toMatchObject({ ok: false, reason: 'echecs' });
        t += 10_001;
        expect(g.enter('/hub/summary').ok).toBe(true);
    });

    it('les routes sont indépendantes (un blocage sur /refresh ne touche pas /mcp)', () => {
        const g = makeRouteGuard({ failureMax: 1 });
        const e = g.enter('/refresh'); if (e.ok) e.done(401);
        expect(g.enter('/refresh').ok).toBe(false);
        expect(g.enter('/mcp').ok).toBe(true);
    });

    it('les plafonds par défaut couvrent les 5 routes et restent bornés', () => {
        expect(Object.keys(ROUTE_LIMITS).sort()).toEqual(['/fintable-sync', '/hub/summary', '/mcp', '/refresh', '/vehicule/bail']);
        for (const l of Object.values(ROUTE_LIMITS)) { expect(l.max).toBeGreaterThan(0); expect(l.max).toBeLessThanOrEqual(600); }
        expect(AUTH_FAILURE_MAX).toBeLessThanOrEqual(50);
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
    const hub = (port: number, token: string): Promise<Response> =>
        fetch(`http://127.0.0.1:${port}/hub/summary`, { headers: { 'x-hub-token': token } });

    it('/hub/summary : échecs répétés → 429 + Retry-After, même pour un jeton valide ensuite (blocage avant examen)', async () => {
        running = await startHttpServer({
            port: 0, host: '127.0.0.1', state: fixtureState(), hubToken: HUB,
            rateGuard: makeRouteGuard({ failureMax: 3 }),
        });
        for (let i = 0; i < 3; i++) expect((await hub(running.port, 'mauvais-jeton')).status).toBe(401);
        const bloque = await hub(running.port, 'mauvais-jeton');
        expect(bloque.status).toBe(429);
        expect(Number(bloque.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
        expect((await hub(running.port, HUB)).status).toBe(429);
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

    it('un flot non authentifié n\'affame pas l\'appel légitime (remboursement)', async () => {
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
    ])('%s : échecs d\'authentification répétés → 429', async (route, method) => {
        running = await startHttpServer({
            port: 0, host: '127.0.0.1', state: fixtureState(),
            refreshSecret: AUTRE, fintableSyncSecret: AUTRE + 'f', vehiculeSecret: AUTRE + 'v', hubToken: HUB,
            rateGuard: makeRouteGuard({ failureMax: 2 }),
        });
        const appel = (): Promise<Response> => fetch(`http://127.0.0.1:${running!.port}${route}`, {
            method, headers: { Authorization: 'Bearer faux', 'x-hub-token': 'faux', 'x-vehicule-token': 'faux' },
        });
        const statuts: number[] = [];
        for (let i = 0; i < 4; i++) statuts.push((await appel()).status);
        expect(statuts.slice(2)).toEqual([429, 429]);
        expect(statuts.slice(0, 2).every((s) => s === 401 || s === 403)).toBe(true);
    });

    it('/mcp : plafond de volume → 429', async () => {
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
    });

    it('/health n\'est jamais limité', async () => {
        running = await startHttpServer({
            port: 0, host: '127.0.0.1', state: fixtureState(),
            rateGuard: makeRouteGuard({ limits: { '/mcp': { max: 1, windowMs: 60_000 } } }),
        });
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

// ── Longueur minimale de la clé d'accès ─────────────────────────────────────────────────────────────
describe('[MCP-ACCESS-KEY-MIN] FINANCEAI_ACCESS_KEY', () => {
    it('refuse < 32 caractères, accepte ≥ 32, ignore l\'absence', () => {
        expect(MIN_ACCESS_KEY_LENGTH).toBe(32);
        expect(cleAccesTropCourte('a'.repeat(31))).toBe(true);
        expect(cleAccesTropCourte('')).toBe(true);
        expect(cleAccesTropCourte('a'.repeat(32))).toBe(false);
        expect(cleAccesTropCourte(undefined)).toBe(false);
    });

    it('le démarrage applique la règle et son message ne contient pas la valeur', () => {
        const src = readFileSync(resolve(__dirname, '../../mcp/http.ts'), 'utf8');
        expect(src).toMatch(/if \(cleAccesTropCourte\(accessKey\)\) \{\s*console\.error\(`[^`]*FINANCEAI_ACCESS_KEY trop courte[^`]*`\);\s*process\.exit\(1\);/);
        expect(src).not.toMatch(/console\.error\([^)]*\$\{accessKey\}/);
    });
});
