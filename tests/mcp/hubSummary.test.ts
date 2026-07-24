// tests/mcp/hubSummary.test.ts
//
// [HUB-01] GET /hub/summary — le contrat hub de bout en bout : vrai serveur
// node:http sur port éphémère, auth x-hub-token (401 sinon), Cache-Control:
// no-store, et payload validé par le VRAI schéma de @mokarade/hub-contract.
// L'état est une fixture persona (aucune dépendance Drive/fichier).

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { CONTRACT_VERSION, HUB_TOKEN_HEADER, validateSummary } from '@mokarade/hub-contract';
import { startHttpServer, type RunningHttpServer } from '../../mcp/http';
import type { ResolvedState } from '../../mcp/bootstrap';
import { normalizeAppState, type StateSource } from '../../mcp/state/loadAppState';
import { makeStateStore } from '../../mcp/state/stateStore';
import { setStateFreshness, STALE_THRESHOLD_MS } from '../../mcp/state/freshness';
import { buildHubSummary, errorHubSummary, HUB_APP } from '../../mcp/hubSummary';
import { TEST_PERSONAS } from '../../services/testPersonas';

const HUB_TOKEN = 'jeton-de-test-hub-0123456789';

function personaState() {
    return normalizeAppState(TEST_PERSONAS.find((p) => p.id === 'karim-immigre')!.build());
}

function fixtureState(): ResolvedState {
    const state = personaState();
    const source: StateSource = { description: 'fixture hub', loadRaw: async () => JSON.stringify(state) };
    const store = makeStateStore(source);
    return { source, store, isDrive: false, driveEmail: null, describe: () => 'fixture hub' };
}

/** Fixture dont la lecture d'état ÉCHOUE (source cassée) — cas « error » honnête. */
function brokenState(): ResolvedState {
    const source: StateSource = {
        description: 'fixture cassée',
        loadRaw: async () => { throw new Error('source injoignable (test)'); },
    };
    const store = makeStateStore(source);
    return { source, store, isDrive: false, driveEmail: null, describe: () => 'fixture cassée' };
}

// Le registre de fraîcheur est module-level : on le remet à zéro après chaque test.
afterEach(() => setStateFreshness({ updatedAt: null, source: null }));

describe('buildHubSummary (unitaire)', () => {
    it('produit un summary conforme au contrat avec les vraies données de la fixture', () => {
        const summary = buildHubSummary(personaState());
        expect(() => validateSummary(summary)).not.toThrow();
        expect(summary.contractVersion).toBe(CONTRACT_VERSION);
        expect(summary.app).toEqual(HUB_APP);
        expect(summary.status).toBe('ok');
        expect(summary.metrics.length).toBeGreaterThan(0);
        expect(summary.metrics.length).toBeLessThanOrEqual(6);
        expect(summary.metrics.map((m) => m.label)).toContain('Valeur nette');
        expect(summary.actions).toHaveLength(1);
        expect(summary.actions[0]?.kind).toBe('link');
    });

    it('publie usage.cost (coût cumulé du chat IA, USD) depuis l’AppState', () => {
        const summary = buildHubSummary({ ...personaState(), aiChatCostUsdTotal: 1.234 });
        expect(summary.usage?.cost).toEqual({ amount: 1.23, currency: 'USD', period: 'total' });
    });

    it('coût absent/0 → usage.cost à 0 (l’app suit vraiment, jamais un chiffre inventé)', () => {
        const summary = buildHubSummary({ ...personaState(), aiChatCostUsdTotal: undefined });
        expect(summary.usage?.cost?.amount).toBe(0);
    });

    it('passe en degraded avec dataAsOf et une alerte quand l’état date de plus de 6 h', () => {
        const now = Date.now();
        setStateFreshness({ updatedAt: now - STALE_THRESHOLD_MS - 60_000, source: 'test' });
        const summary = buildHubSummary(personaState(), now);
        expect(() => validateSummary(summary)).not.toThrow();
        expect(summary.status).toBe('degraded');
        expect(summary.dataAsOf).toBeDefined();
        expect(summary.alerts[0]?.severity).toBe('warn');
        expect(summary.alerts[0]?.label).toContain('périmées');
    });

    it('reste ok avec dataAsOf quand l’état est frais', () => {
        const now = Date.now();
        setStateFreshness({ updatedAt: now - 60_000, source: 'test' });
        const summary = buildHubSummary(personaState(), now);
        expect(summary.status).toBe('ok');
        expect(summary.dataAsOf).toBe(new Date(now - 60_000).toISOString());
    });

    it('errorHubSummary est conforme au contrat et honnête (metrics vides, alerte)', () => {
        const summary = errorHubSummary('panne de test');
        expect(() => validateSummary(summary)).not.toThrow();
        expect(summary.status).toBe('error');
        expect(summary.metrics).toEqual([]);
        expect(summary.alerts[0]?.severity).toBe('alert');
        expect(summary.alerts[0]?.label).toContain('panne de test');
    });
});

describe('GET /hub/summary (HTTP, jeton configuré)', () => {
    let running: RunningHttpServer;
    let base: string;

    beforeAll(async () => {
        running = await startHttpServer({ port: 0, host: '127.0.0.1', state: fixtureState(), hubToken: HUB_TOKEN });
        base = `http://127.0.0.1:${running.port}`;
    });
    afterAll(async () => {
        await running.close();
    });

    it('401 sans header x-hub-token', async () => {
        const res = await fetch(`${base}/hub/summary`);
        expect(res.status).toBe(401);
    });

    it('401 avec un jeton invalide', async () => {
        const res = await fetch(`${base}/hub/summary`, { headers: { [HUB_TOKEN_HEADER]: 'mauvais-jeton' } });
        expect(res.status).toBe(401);
    });

    it('405 sur POST même avec le bon jeton', async () => {
        const res = await fetch(`${base}/hub/summary`, {
            method: 'POST',
            headers: { [HUB_TOKEN_HEADER]: HUB_TOKEN },
        });
        expect(res.status).toBe(405);
    });

    it('200 + summary valide + Cache-Control: no-store avec le bon jeton', async () => {
        const res = await fetch(`${base}/hub/summary`, { headers: { [HUB_TOKEN_HEADER]: HUB_TOKEN } });
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        const summary = validateSummary(await res.json());
        expect(summary.status).toBe('ok');
        expect(summary.app.id).toBe('financeai');
    });

    it('la route est listée dans le 404 des endpoints connus', async () => {
        const res = await fetch(`${base}/nexiste-pas`);
        expect(res.status).toBe(404);
        const body = await res.json() as { endpoints: string[] };
        expect(body.endpoints).toContain('/hub/summary');
    });
});

describe('GET /hub/summary (HTTP, cas limites)', () => {
    it('404 quand aucun jeton hub n’est configuré (route désactivée)', async () => {
        const running = await startHttpServer({ port: 0, host: '127.0.0.1', state: fixtureState() });
        try {
            const res = await fetch(`http://127.0.0.1:${running.port}/hub/summary`, {
                headers: { [HUB_TOKEN_HEADER]: HUB_TOKEN },
            });
            expect(res.status).toBe(404);
        } finally {
            await running.close();
        }
    });

    it('état illisible → 200 avec summary status "error" (jamais un 500 muet)', async () => {
        const running = await startHttpServer({ port: 0, host: '127.0.0.1', state: brokenState(), hubToken: HUB_TOKEN });
        try {
            const res = await fetch(`http://127.0.0.1:${running.port}/hub/summary`, {
                headers: { [HUB_TOKEN_HEADER]: HUB_TOKEN },
            });
            expect(res.status).toBe(200);
            const summary = validateSummary(await res.json());
            expect(summary.status).toBe('error');
            expect(summary.metrics).toEqual([]);
        } finally {
            await running.close();
        }
    });
});
