// tests/mcp/authorizePlafondGlobal.test.ts
//
// [MCP-RATE-LIMIT] Le plafond GLOBAL d'échecs de /oauth/authorize (200 par 15 min) n'existe que si la clé d'accès est FAIBLE
// (< 32 caractères). Avec une clé conforme, la force brute est hors de portée et un plafond global ne ferait qu'offrir un déni
// de service à un attaquant qui dispose de nombreuses adresses (avis pole-securite). Le compteur PAR ADRESSE reste toujours.
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { makeAddressAttemptLimiter, AUTHORIZE_MAX_FAILURES_GLOBAL } from '../../mcp/auth/rateLimit';
import { startHttpServer, type RunningHttpServer } from '../../mcp/http';
import { makeOAuthProvider } from '../../mcp/auth/oauthProvider';
import type { ResolvedState } from '../../mcp/bootstrap';
import { normalizeAppState, type StateSource } from '../../mcp/state/loadAppState';
import { makeStateStore } from '../../mcp/state/stateStore';
import { TEST_PERSONAS } from '../../services/testPersonas';

describe('[MCP-RATE-LIMIT] makeAddressAttemptLimiter : plafond global optionnel (pur)', () => {
    it('globalMax null : des milliers d\'adresses en échec ne bloquent jamais une NOUVELLE adresse', () => {
        const l = makeAddressAttemptLimiter({ globalMax: null, maxAdresses: 100 });
        for (let i = 0; i < 3000; i++) l.recordFailure(`10.0.${Math.floor(i / 250)}.${i % 250}`);
        expect(l.isBlocked('nouvelle')).toBe(false);
        expect(l.retryAfterSeconds('nouvelle')).toBe(0);
    });

    it('globalMax null : le compteur PAR ADRESSE reste actif', () => {
        const l = makeAddressAttemptLimiter({ globalMax: null, perAddressMax: 2 });
        l.recordFailure('a'); l.recordFailure('a');
        expect(l.isBlocked('a')).toBe(true);
        expect(l.isBlocked('b')).toBe(false);
    });

    it('globalMax par défaut (absent) : plafond appliqué', () => {
        const l = makeAddressAttemptLimiter({ perAddressMax: 1000 });
        for (let i = 0; i < AUTHORIZE_MAX_FAILURES_GLOBAL; i++) l.recordFailure(`adr-${i}`);
        expect(l.isBlocked('nouvelle')).toBe(true);
    });
});

const CLE = 'cle-acces-de-test-generee';
const REDIRECT = 'http://127.0.0.1:9/callback';
const s256 = (v: string): string => createHash('sha256').update(v, 'utf8').digest('base64url');

function fixtureState(): ResolvedState {
    const state = normalizeAppState(TEST_PERSONAS.find((p) => p.id === 'karim-immigre')!.build());
    const source: StateSource = { description: 'fixture http', loadRaw: async () => JSON.stringify(state) };
    return { source, store: makeStateStore(source), isDrive: false, driveEmail: null, describe: () => 'fixture http' };
}

describe('[MCP-RATE-LIMIT] câblage : le plafond global dépend de cleAccesFaible', () => {
    let srv: RunningHttpServer | null = null;
    afterEach(async () => { await srv?.close(); srv = null; });

    const essayer = async (cleAccesFaible: boolean): Promise<number> => {
        srv = await startHttpServer({
            port: 0, host: '127.0.0.1', state: fixtureState(), cleAccesFaible,
            auth: makeOAuthProvider({ signingKey: 's'.repeat(48), accessKey: CLE, issuer: 'http://127.0.0.1:0' }),
        });
        const base = `http://127.0.0.1:${srv.port}`;
        const reg = await fetch(`${base}/oauth/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: [REDIRECT] }),
        });
        const clientId = ((await reg.json()) as { client_id: string }).client_id;
        const soumettre = (cle: string, adresse: string): Promise<Response> => fetch(`${base}/oauth/authorize`, {
            method: 'POST', redirect: 'manual',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-forwarded-for': adresse },
            body: new URLSearchParams({
                response_type: 'code', client_id: clientId, redirect_uri: REDIRECT,
                code_challenge: s256('v'.repeat(50)), code_challenge_method: 'S256', access_key: cle,
            }).toString(),
        });
        // Un attaquant à nombreuses adresses : 1 échec par adresse (jamais le seuil par adresse), au-delà du plafond global.
        for (let i = 0; i < AUTHORIZE_MAX_FAILURES_GLOBAL + 10; i++) await soumettre('mauvaise', `203.0.113.${i % 250}, 198.51.100.${Math.floor(i / 250)}.${i}`);
        // Puis Marc, depuis une adresse jamais vue, avec la bonne clé.
        return (await soumettre(CLE, '192.0.2.1')).status;
    };

    it('clé FAIBLE : le plafond global s\'applique (les nouvelles autorisations sont bloquées)', async () => {
        expect(await essayer(true)).toBe(429);
    }, 30_000);

    it('clé CONFORME (≥ 32) : pas de plafond global, Marc peut autoriser malgré l\'attaque distribuée', async () => {
        expect(await essayer(false)).toBe(302);
    }, 30_000);
});
