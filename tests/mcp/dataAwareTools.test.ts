// tests/mcp/dataAwareTools.test.ts
//
// Lot 1 — tools MCP « data-aware » sur un AppState fixture : sorties sensées.
// On exerce les VRAIS handlers via les fonctions register*, en capturant
// (nom, schéma, handler) avec un faux serveur minimal, puis on appelle le
// handler avec des arguments valides. Cela teste le câblage réel (StateProvider,
// adaptateur Lot 0, moteur pur, fiscalité) sans dépendre du transport MCP.

import { describe, it, expect } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TEST_PERSONAS } from '../../services/testPersonas';
import {
    normalizeAppState,
    loadAppStateFromSource,
    validateAppStateShape,
    buildDefaultAppState,
    type StateSource,
} from '../../mcp/state/loadAppState';
import { makeStateProvider } from '../../mcp/state/stateProvider';
import type { StateProvider } from '../../mcp/tools/_dataAware';
import { registerGetFinancialOverview } from '../../mcp/tools/getFinancialOverview.tool';
import { registerGetProjection } from '../../mcp/tools/getProjection.tool';
import { registerGetTaxSituation } from '../../mcp/tools/getTaxSituation.tool';
import { registerGetRetirementOutlook } from '../../mcp/tools/getRetirementOutlook.tool';
import { registerGetNextBestActions } from '../../mcp/tools/getNextBestActions.tool';
import { registerSearchTransactions } from '../../mcp/tools/searchTransactions.tool';
import { searchTransactions } from '../../services/transactionsSearch';
import type { AppState } from '../../types';

// ── Faux serveur : capture les handlers enregistrés ─────────────────────────
type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

function captureTool(register: (s: McpServer, getState: StateProvider) => void, getState: StateProvider): Handler {
    let captured: Handler | null = null;
    const fake = {
        tool: (_name: string, _desc: string, _schema: unknown, cb: Handler) => {
            captured = cb;
        },
    } as unknown as McpServer;
    register(fake, getState);
    if (!captured) throw new Error('aucun handler capturé');
    return captured;
}

async function callJson(handler: Handler, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const res = await handler(args);
    expect(res.isError).toBeFalsy();
    expect(res.content[0]?.type).toBe('text');
    return JSON.parse(res.content[0].text);
}

// État fixture : Karim (salarié aisé, célibataire, immigré) — impôt > 0, actifs.
function karimState(): AppState {
    return normalizeAppState(TEST_PERSONAS.find((p) => p.id === 'karim-immigre')!.build());
}
function providerFor(state: AppState): StateProvider {
    const src: StateSource = { description: 'fixture', loadRaw: async () => JSON.stringify(state) };
    return makeStateProvider(src, { ttlMs: 0 });
}

describe('Lot 1 — get_financial_overview', () => {
    it("renvoie un patrimoine net cohérent et la ventilation par compte", async () => {
        const h = captureTool(registerGetFinancialOverview, providerFor(karimState()));
        const out = await callJson(h);
        expect(out.currency).toBe('CAD');
        expect(out.netWorth).toBeGreaterThan(0);
        // Karim : CELI ~20k, REER ~15k (cf personaAudit).
        expect((out.accounts as Record<string, number>).celi).toBeGreaterThan(15000);
        expect((out.accounts as Record<string, number>).reer).toBeGreaterThan(12000);
        expect(out.totalDebt).toBe(0);
        expect(out.coupleMode).toBe(false);
    });
});

describe('Lot 1 — get_projection', () => {
    it('patrimoine final fini et > 0 sur 20 ans (BASE)', async () => {
        const h = captureTool(registerGetProjection, providerFor(karimState()));
        const out = await callJson(h, { years: 20, scenario: 'BASE', monteCarlo: false });
        expect(out.horizonYears).toBe(20);
        expect(Number.isFinite(out.finalNetWorthNominal as number)).toBe(true);
        expect(out.finalNetWorthNominal as number).toBeGreaterThan(0);
        expect(out.finalNetWorthReal as number).toBeGreaterThan(0);
        // Réel ≤ nominal (déflaté par l'inflation).
        expect(out.finalNetWorthReal as number).toBeLessThanOrEqual(out.finalNetWorthNominal as number);
        expect(Array.isArray(out.byScenario)).toBe(true);
    });

    it('Monte Carlo renvoie une probabilité de réussite', async () => {
        const h = captureTool(registerGetProjection, providerFor(karimState()));
        const out = await callJson(h, { years: 15, scenario: 'BASE', monteCarlo: true });
        const mc = out.monteCarlo as Record<string, unknown> | null;
        expect(mc).not.toBeNull();
        expect(mc!.successProbabilityPct).not.toBeUndefined();
    });
});

describe('Lot 1 — get_tax_situation', () => {
    it("impôt > 0 pour un salarié, et room REER/CELI ≥ 0", async () => {
        const h = captureTool(registerGetTaxSituation, providerFor(karimState()));
        const out = await callJson(h, { year: 2026 });
        expect(out.grossAnnualIncome as number).toBeGreaterThan(0);
        expect(out.totalTax as number).toBeGreaterThan(0);
        expect(out.taxFederal as number).toBeGreaterThan(0);
        expect(out.taxQuebec as number).toBeGreaterThan(0);
        expect(out.marginalRatePct as number).toBeGreaterThan(0);
        expect(out.celiRoomRemaining as number).toBeGreaterThanOrEqual(0);
        expect(out.reerRoomRemaining as number).toBeGreaterThanOrEqual(0);
    });
});

describe('Lot 1 — get_retirement_outlook', () => {
    it('renvoie âge cible, statut FIRE et un verdict', async () => {
        const h = captureTool(registerGetRetirementOutlook, providerFor(karimState()));
        const out = await callJson(h, { monteCarlo: false });
        expect(out.targetRetirementAge).toBe(50); // persona Karim
        expect(typeof out.fireReached).toBe('boolean');
        expect(typeof out.verdict).toBe('string');
        expect(Number.isFinite(out.estateNetWorth as number)).toBe(true);
    });
});

describe('Lot 1 — get_next_best_actions', () => {
    it('renvoie des signaux chiffrés (room/dette/cashflow)', async () => {
        const h = captureTool(registerGetNextBestActions, providerFor(karimState()));
        const out = await callJson(h);
        const snap = out.snapshot as Record<string, number>;
        expect(snap.netWorth).toBeGreaterThan(0);
        expect(snap.celiRoomRemaining).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(out.signals)).toBe(true);
    });
});

describe('Lot 1 — search_transactions', () => {
    it("filtre par requête texte et agrège les montants", async () => {
        const state = karimState();
        const h = captureTool(registerSearchTransactions, providerFor(state));
        const out = await callJson(h, { query: 'metro', includeTransfers: false, limit: 50 });
        expect(out.count as number).toBeGreaterThan(0);
        // Toutes les transactions renvoyées contiennent « metro » (payee/catégorie).
        for (const t of out.transactions as Array<{ payee: string; category: string }>) {
            const hay = `${t.payee} ${t.category}`.toLowerCase();
            expect(hay.includes('metro')).toBe(true);
        }
        // Épicerie = dépenses → total dépensé > 0.
        expect(out.totalSpent as number).toBeGreaterThan(0);
    });

    it('une requête sans correspondance renvoie 0 (et n\'inclut pas les transferts par défaut)', async () => {
        const state = karimState();
        const h = captureTool(registerSearchTransactions, providerFor(state));
        const out = await callJson(h, { query: 'zzz-introuvable-zzz' });
        expect(out.count).toBe(0);
        expect((out.transactions as unknown[]).length).toBe(0);
    });
});

// ── Filtre pur (services/transactionsSearch) ────────────────────────────────
describe('Lot 1 — searchTransactions (filtre pur)', () => {
    const txns = [
        { id: 1, date: '2026-01-10', payee: 'Metro Plus', amount: -85.5, category: 'Alimentation', status: 'processed' as const },
        { id: 2, date: '2026-02-01', payee: 'Dépôt paie', amount: 3200, category: 'Revenu', status: 'processed' as const },
        { id: 3, date: '2026-01-20', payee: 'Virement CELI', amount: -1000, category: 'Transfert', status: 'processed' as const, isTransfer: true },
        { id: 4, date: '2026-03-05', payee: 'Metro Jean-Talon', amount: -42, category: 'Alimentation', status: 'processed' as const },
    ];

    it('exclut les transferts par défaut, filtre par texte, agrège', () => {
        const r = searchTransactions(txns, { query: 'metro' });
        expect(r.count).toBe(2);
        expect(Math.round(r.totalSpent)).toBe(128); // 85.5 + 42 ≈ 127.5 → 128
        expect(r.totalReceived).toBe(0);
        // Tri récent d'abord.
        expect(r.matches[0].date >= r.matches[1].date).toBe(true);
    });

    it('filtre par plage de montants et de dates', () => {
        const r = searchTransactions(txns, { minAmount: 0, fromDate: '2026-02-01', toDate: '2026-02-28' });
        expect(r.count).toBe(1);
        expect(r.matches[0].id).toBe(2);
        expect(r.totalReceived).toBe(3200);
    });

    it('includeTransfers=true réintègre les virements', () => {
        const r = searchTransactions(txns, { category: 'Transfert', includeTransfers: true });
        expect(r.count).toBe(1);
        expect(r.matches[0].id).toBe(3);
    });
});

// ── Loader / validation d'état ───────────────────────────────────────────────
describe('Lot 1 — loader & validation AppState', () => {
    it('charge un état valide depuis une StateSource (JSON nu)', async () => {
        const state = karimState();
        const src: StateSource = { description: 'mem', loadRaw: async () => JSON.stringify(state) };
        const loaded = await loadAppStateFromSource(src);
        expect(loaded.config.users.length).toBe(1);
        expect(loaded.fxRates.CAD).toBe(1);
    });

    it("accepte une enveloppe { payload: AppState }", async () => {
        const state = karimState();
        const src: StateSource = { description: 'mem', loadRaw: async () => JSON.stringify({ payload: state, updatedAt: 1 }) };
        const loaded = await loadAppStateFromSource(src);
        expect((loaded.config.users[0]?.name ?? '')).toContain('Karim');
    });

    it('rejette un JSON illisible avec une erreur claire', async () => {
        const src: StateSource = { description: 'mem', loadRaw: async () => '{ pas du json' };
        await expect(loadAppStateFromSource(src)).rejects.toThrow(/JSON invalide/);
    });

    it('rejette une forme invalide (config.users non tableau)', () => {
        expect(() => validateAppStateShape({ config: { users: 'oops' } })).toThrow(/AppState invalide/);
    });

    it('normalizeAppState remplit les défauts manquants', () => {
        const norm = normalizeAppState({ transactions: [] });
        const def = buildDefaultAppState();
        expect(norm.fxRates.CAD).toBe(def.fxRates.CAD);
        expect(Array.isArray(norm.budgetItems)).toBe(true);
        expect(norm.config.users.length).toBe(def.config.users.length);
    });

    it("makeStateProvider sans source lève une erreur explicite", async () => {
        const provider = makeStateProvider(null);
        await expect(provider()).rejects.toThrow(/source d'état/i);
    });
});
