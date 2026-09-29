// tests/mcp/authorizeParAdresse.test.ts
//
// [MCP-RATE-LIMIT] /oauth/authorize : compteur d'échecs PAR ADRESSE (seuil bas) + plafond global de sécurité (haut). Avant :
// un compteur GLOBAL de 8 échecs par 15 min laissait n'importe quel internaute interdire à Marc toute nouvelle autorisation.
// Données 100 % générées.
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
    makeAddressAttemptLimiter, AUTHORIZE_MAX_FAILURES_PAR_ADRESSE, AUTHORIZE_MAX_FAILURES_GLOBAL,
} from '../../mcp/auth/rateLimit';
import { startHttpServer, type RunningHttpServer } from '../../mcp/http';
import { makeOAuthProvider } from '../../mcp/auth/oauthProvider';
import type { ResolvedState } from '../../mcp/bootstrap';
import { normalizeAppState, type StateSource } from '../../mcp/state/loadAppState';
import { makeStateStore } from '../../mcp/state/stateStore';
import { TEST_PERSONAS } from '../../services/testPersonas';

describe('[MCP-RATE-LIMIT] makeAddressAttemptLimiter (pur)', () => {
    it('seuils par défaut : bas par adresse, beaucoup plus haut en global', () => {
        expect(AUTHORIZE_MAX_FAILURES_PAR_ADRESSE).toBe(8);
        expect(AUTHORIZE_MAX_FAILURES_GLOBAL).toBeGreaterThanOrEqual(100);
    });

    it('une adresse au quota est bloquée, une autre adresse ne l\'est pas ; levé après la fenêtre', () => {
        let t = 0;
        const l = makeAddressAttemptLimiter({ now: () => t, perAddressMax: 3, windowMs: 1000, globalMax: 1000 });
        for (let i = 0; i < 3; i++) l.recordFailure('6.6.6.6');
        expect(l.isBlocked('6.6.6.6')).toBe(true);
        expect(l.retryAfterSeconds('6.6.6.6')).toBeGreaterThanOrEqual(1);
        expect(l.isBlocked('7.7.7.7')).toBe(false);
        t += 1001;
        expect(l.isBlocked('6.6.6.6')).toBe(false);
    });

    it('le plafond global bloque tout le monde (attaque distribuée) et un succès ne le remet PAS à zéro', () => {
        const l = makeAddressAttemptLimiter({ perAddressMax: 100, globalMax: 4 });
        for (const a of ['a', 'b', 'c', 'd']) l.recordFailure(a);
        expect(l.isBlocked('nouvelle')).toBe(true);
        l.reset('a');
        expect(l.isBlocked('nouvelle')).toBe(true);
    });

    it('un succès n\'efface que les échecs de SON adresse', () => {
        const l = makeAddressAttemptLimiter({ perAddressMax: 2, globalMax: 1000 });
        l.recordFailure('a'); l.recordFailure('a'); l.recordFailure('b');
        expect(l.isBlocked('a')).toBe(true);
        l.reset('a');
        expect(l.isBlocked('a')).toBe(false);
        l.recordFailure('b');
        expect(l.isBlocked('b')).toBe(true);
    });

    it('la table d\'adresses est bornée', () => {
        const l = makeAddressAttemptLimiter({ perAddressMax: 1, globalMax: 1000, maxAdresses: 2 });
        l.recordFailure('a');
        expect(l.isBlocked('a')).toBe(true);
        l.recordFailure('b'); l.recordFailure('c'); // évince « a »
        expect(l.isBlocked('a')).toBe(false);
    });
});

const COURTE = 'cle-acces-de-test-generee';
const REDIRECT = 'http://127.0.0.1:9/callback';
const s256 = (v: string): string => createHash('sha256').update(v, 'utf8').digest('base64url');

function fixtureState(): ResolvedState {
    const state = normalizeAppState(TEST_PERSONAS.find((p) => p.id === 'karim-immigre')!.build());
    const source: StateSource = { description: 'fixture http', loadRaw: async () => JSON.stringify(state) };
    return { source, store: makeStateStore(source), isDrive: false, driveEmail: null, describe: () => 'fixture http' };
}

describe('[MCP-RATE-LIMIT] /oauth/authorize sur le vrai serveur', () => {
    let srv: RunningHttpServer | null = null;
    afterEach(async () => { await srv?.close(); srv = null; });

    const demarrer = async (limiter = makeAddressAttemptLimiter({ perAddressMax: 3, globalMax: 1000 })): Promise<{ base: string; clientId: string }> => {
        srv = await startHttpServer({
            port: 0, host: '127.0.0.1', state: fixtureState(), authorizeLimiter: limiter,
            auth: makeOAuthProvider({ signingKey: 's'.repeat(48), accessKey: COURTE, issuer: 'http://127.0.0.1:0' }),
        });
        const base = `http://127.0.0.1:${srv.port}`;
        const reg = await fetch(`${base}/oauth/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: [REDIRECT] }),
        });
        return { base, clientId: ((await reg.json()) as { client_id: string }).client_id };
    };
    const soumettre = (base: string, clientId: string, cle: string, xff: string): Promise<Response> => fetch(`${base}/oauth/authorize`, {
        method: 'POST', redirect: 'manual',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-forwarded-for': xff },
        body: new URLSearchParams({
            response_type: 'code', client_id: clientId, redirect_uri: REDIRECT,
            code_challenge: s256('v'.repeat(50)), code_challenge_method: 'S256', access_key: cle,
        }).toString(),
    });

    it('trop d\'échecs depuis UNE adresse → 429 pour elle ; une autre adresse avec la bonne clé passe (plus de déni de service global)', async () => {
        const { base, clientId } = await demarrer();
        for (let i = 0; i < 3; i++) expect((await soumettre(base, clientId, 'mauvaise', '9.9.9.9, 6.6.6.6')).status).toBe(403);
        const bloque = await soumettre(base, clientId, 'mauvaise', 'autre-prefixe, 6.6.6.6');
        expect(bloque.status).toBe(429);
        expect(Number(bloque.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
        const ailleurs = await soumettre(base, clientId, COURTE, '6.6.6.6, 7.7.7.7');
        expect(ailleurs.status).toBe(302);
    });

    it('depuis une adresse bloquée, même la bonne clé est refusée (sinon on devinerait à la vitesse de la ligne)', async () => {
        const { base, clientId } = await demarrer();
        for (let i = 0; i < 3; i++) await soumettre(base, clientId, 'mauvaise', '6.6.6.6');
        expect((await soumettre(base, clientId, COURTE, '6.6.6.6')).status).toBe(429);
    });

    it('plafond global : atteint par plusieurs adresses, il bloque les nouvelles', async () => {
        const { base, clientId } = await demarrer(makeAddressAttemptLimiter({ perAddressMax: 100, globalMax: 3 }));
        for (const a of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) expect((await soumettre(base, clientId, 'mauvaise', a)).status).toBe(403);
        expect((await soumettre(base, clientId, COURTE, '4.4.4.4')).status).toBe(429);
    });

    it('un succès efface les échecs de son adresse (l\'usage légitime ne consomme rien)', async () => {
        const { base, clientId } = await demarrer();
        for (let i = 0; i < 2; i++) expect((await soumettre(base, clientId, 'mauvaise', '8.8.8.8')).status).toBe(403);
        expect((await soumettre(base, clientId, COURTE, '8.8.8.8')).status).toBe(302);
        for (let i = 0; i < 2; i++) expect((await soumettre(base, clientId, 'mauvaise', '8.8.8.8')).status).toBe(403);
    });
});
