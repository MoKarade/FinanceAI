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

describe('[HUB-PLACEMENTS-SEANCE] variation des placements sur la carte', () => {
    // Demande Marc 2026-08-19 : rendement du jour, variation $ du jour, variation de la semaine.
    // Ce qui se joue ici n'est pas le calcul (couvert par `portfolioSessionMetrics.test.ts`) mais
    // la CARTE : ordre des métriques, plafond de 6, libellés, et surtout ce qui se passe quand la
    // donnée refuse — le hub n'affiche QUE ce qu'il reçoit, donc omettre EST la métrique.

    const MAINTENANT = Date.parse('2026-08-19T18:00:00Z');

    /** Titre CAD à 1 unité : la valeur du portefeuille vaut le prix — les montants se lisent à l'œil. */
    const titre = (jours: number, dernierJour: number) => ({
        symbol: 'XEQT.TO', quantity: 1, currency: 'CAD' as const, currentPrice: 100 + jours - 1,
        name: 'XEQT', performance: 0, dateBought: '2026-08-01',
        purchases: [{ date: '2026-08-01', quantity: 1, price: 100 }],
        priceHistory: Array.from({ length: jours }, (_, i) => ({
            date: `2026-08-${String(dernierJour - jours + 1 + i).padStart(2, '0')}`,
            price: 100 + i,
        })),
        accountType: 'NON-ENREG' as const,
    });

    const avecPlacements = (jours: number, dernierJour: number) => ({
        ...personaState(),
        assets: [titre(jours, dernierJour)],
        fxRates: { USD: 1.35, EUR: 1.45 },
    });

    it('publie 6 métriques ordonnées, la valeur nette en tête et sa tendance du jour', () => {
        const s = buildHubSummary(avecPlacements(14, 18) as never, MAINTENANT);
        expect(s.metrics).toHaveLength(6);   // le PLAFOND du contrat, exactement

        // L'ordre est un arbitrage : le hub rend la PREMIÈRE en gros.
        expect(s.metrics.map((m) => m.label)).toEqual([
            'Valeur nette',
            'Cashflow mensuel',
            'Liquidités',
            'Placements (séance du 18 août)',
            'Variation de la séance',
            'Variation 7 jours',
        ]);

        // Les trois sortantes ne doivent PLUS être là (sinon on dépasserait 6 et le contrat casserait).
        for (const parti of ['Investissements', 'Dette totale', 'Espace CELI dispo']) {
            expect(s.metrics.some((m) => m.label === parti), `${parti} aurait dû sortir`).toBe(false);
        }

        // Le libellé porte la DATE — jamais « aujourd'hui » (les marchés ferment, et l'historique
        // daté n'avance que quand l'app navigateur s'ouvre).
        expect(s.metrics.some((m) => /aujourd/i.test(m.label))).toBe(false);

        // Montants et tendances : 113 la veille de rien, +1 $ sur la séance, +7 $ sur 7 jours.
        const parLabel = Object.fromEntries(s.metrics.map((m) => [m.label, m]));
        expect(parLabel['Placements (séance du 18 août)'].value).toBe(113);
        expect(parLabel['Variation de la séance'].value).toBe(1);
        expect(parLabel['Variation 7 jours'].value).toBe(7);
        expect(parLabel['Valeur nette'].trend).toBeCloseTo((1 / 112) * 100, 2);
        expect(parLabel['Variation de la séance'].trend).toBeCloseTo((1 / 112) * 100, 2);

        // Tout doit rester conforme au contrat — c'est le hub qui valide, on ne triche pas.
        expect(() => validateSummary(s as never)).not.toThrow();
    });

    it('donnée PÉRIMÉE : la carte publie MOINS, pas autre chose', () => {
        // Dernier close le 8 août, soit 11 jours avant : aucune des trois métriques n'est publiable.
        const s = buildHubSummary(avecPlacements(5, 8) as never, MAINTENANT);
        expect(s.metrics.map((m) => m.label)).toEqual(['Valeur nette', 'Cashflow mensuel', 'Liquidités']);

        // ⚠️ Le point le plus important du lot : AUCUN zéro n'est fabriqué. Un « 0 $ / 0 % » se
        // lirait « journée stable » alors qu'on ne sait simplement pas.
        expect(s.metrics.some((m) => /placement|variation/i.test(m.label))).toBe(false);
        expect(s.metrics[0].trend).toBeUndefined();

        // Et les trois sortantes ne REVIENNENT pas : une carte dont la composition change selon la
        // fraîcheur des cours serait illisible.
        expect(s.metrics.some((m) => m.label === 'Dette totale')).toBe(false);
        expect(() => validateSummary(s as never)).not.toThrow();
    });

    it('semaine incalculable : la séance seule est publiée (refus indépendants)', () => {
        const s = buildHubSummary(avecPlacements(2, 18) as never, MAINTENANT);
        expect(s.metrics.map((m) => m.label)).toEqual([
            'Valeur nette', 'Cashflow mensuel', 'Liquidités',
            'Placements (séance du 18 août)', 'Variation de la séance',
        ]);
        expect(s.metrics.some((m) => m.label === 'Variation 7 jours')).toBe(false);
    });

    it('dataAsOf reflète la donnée la plus ANCIENNE, pas l\'instant du build', () => {
        // Le push Drive est TRÈS récent, la clôture date du 18. Servir l'horodatage du push
        // surestimerait la fraîcheur de ce qui est à l'écran.
        setStateFreshness({ updatedAt: MAINTENANT - 60_000, source: 'test' });
        const s = buildHubSummary(avecPlacements(14, 18) as never, MAINTENANT);
        expect(s.dataAsOf).toBe(new Date(Date.parse('2026-08-18T23:59:59Z')).toISOString());

        // Symétrique : quand c'est le PUSH qui est le plus vieux, c'est lui qui gouverne.
        setStateFreshness({ updatedAt: Date.parse('2026-08-17T09:00:00Z'), source: 'test' });
        const s2 = buildHubSummary(avecPlacements(14, 18) as never, MAINTENANT);
        expect(s2.dataAsOf).toBe(new Date(Date.parse('2026-08-17T09:00:00Z')).toISOString());
    });
});
