// tests/mcp/deleteItem.test.ts
// [MCP-DIRECT-EDIT Lots 4-5] delete_item — suppression d'un actif (« vente totale »), d'une dette ou
// d'un objectif. Spec (ADR docs/decisions.md) : correspondance normalisée EXACTE (jamais de fuzzy sur
// un geste destructif), ambiguïté → throw, aperçu qui liste les effets, confirmation STRICTE à 2 temps.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { applyDocument, type DeleteItemPayload } from '../../mcp/ingest/applyDocument';
import { FileStateSource, buildDefaultAppState, loadAppStateFromSource } from '../../mcp/state/loadAppState';
import { makeStateStore, type StateStore } from '../../mcp/state/stateStore';
import { registerDeleteItem } from '../../mcp/tools/deleteItem.tool';
import type { AppState, Asset, Debt, SavingsGoal } from '../../types';

const baseState = (): AppState => buildDefaultAppState();

function richState(): AppState {
    const s = baseState();
    s.assets = [
        { symbol: 'VFV.TO', name: 'Vanguard S&P 500', quantity: 10, currency: 'CAD', currentPrice: 140, performance: 0, dateBought: '2025-01-01', accountType: 'CELI' },
        { symbol: 'VFV.TO', name: 'Vanguard S&P 500', quantity: 5, currency: 'CAD', currentPrice: 140, performance: 0, dateBought: '2025-06-01', accountType: 'REER' },
        { symbol: 'BTC', name: 'Bitcoin', quantity: 0.1, currency: 'CAD', currentPrice: 90000, performance: 0, dateBought: '2024-01-01', accountType: 'CRYPTO' },
    ] as Asset[];
    s.debts = [
        { id: 'debt_1700000000000', name: 'Prêt auto Honda', balance: 12000, interestRate: 6.9, minimumPayment: 300, category: 'Car' },
    ] as Debt[];
    s.savingsGoals = [
        { id: 'goal_1700000000000', name: 'Voyage Japon', targetAmount: 8000, currentAmount: 1500, deadline: '2027-06', icon: '✈️' },
    ] as SavingsGoal[];
    return s;
}

const del = (entity: DeleteItemPayload['entity'], name: string, accountType?: string): DeleteItemPayload =>
    ({ kind: 'delete_item', entity, name, ...(accountType ? { accountType } : {}) });

describe('applyDeleteItem — actif (« vente totale »)', () => {
    it('supprime l\'actif ciblé (symbole unique) et laisse les autres intacts', () => {
        const { nextState, changes, summary } = applyDocument(richState(), del('asset', 'btc'));
        expect(nextState.assets.some((a) => a.symbol === 'BTC')).toBe(false);
        expect(nextState.assets).toHaveLength(2); // les 2 VFV.TO restent
        expect(changes[0].after).toBe('supprimé');
        expect(String(changes[0].note)).toMatch(/contribution passée/); // effet courbe annoncé
        expect(summary).toMatch(/Sauvegarde/);
    });

    it('symbole détenu dans 2 comptes SANS accountType → throw (jamais de choix silencieux)', () => {
        expect(() => applyDocument(richState(), del('asset', 'VFV.TO'))).toThrow(/Plusieurs actifs|précise le compte/i);
    });

    it('avec accountType → supprime le BON compte seulement', () => {
        const { nextState } = applyDocument(richState(), del('asset', 'vfv.to', 'CELI'));
        const rest = nextState.assets.filter((a) => a.symbol === 'VFV.TO');
        expect(rest).toHaveLength(1);
        expect(rest[0].accountType).toBe('REER');
    });

    it('symbole inconnu → throw, rien supprimé, état non muté', () => {
        const s = richState();
        expect(() => applyDocument(s, del('asset', 'TSLA'))).toThrow(/Aucun actif/);
        expect(s.assets).toHaveLength(3);
    });
});

describe('applyDeleteItem — dette et objectif', () => {
    it('supprime la dette par nom (casse/accents ignorés) avec note « NW monte »', () => {
        const { nextState, changes } = applyDocument(richState(), del('debt', '  prêt auto honda '));
        expect(nextState.debts).toHaveLength(0);
        expect(String(changes[0].note)).toMatch(/patrimoine net MONTE/);
    });

    it('supprime l\'objectif avec note « décaissement annulé » (échéance présente)', () => {
        const { nextState, changes } = applyDocument(richState(), del('savings_goal', 'voyage japon'));
        expect(nextState.savingsGoals).toHaveLength(0);
        expect(String(changes[0].note)).toMatch(/6500 \$.*ANNULÉ|ANNULÉ/);
    });

    it('nom de dette/objectif inconnu → throw explicite', () => {
        expect(() => applyDocument(richState(), del('debt', 'Marge inexistante'))).toThrow(/Aucune dette/);
        expect(() => applyDocument(richState(), del('savings_goal', 'Inexistant'))).toThrow(/Aucun objectif/);
    });

    it('deux dettes à noms équivalents → throw (renommer d\'abord)', () => {
        const s = richState();
        s.debts = [...s.debts, { id: 'debt_1700000000001', name: 'PRÊT AUTO HONDA', balance: 1, interestRate: 1, minimumPayment: 1, category: 'Car' } as Debt];
        expect(() => applyDocument(s, del('debt', 'Prêt auto Honda'))).toThrow(/Plusieurs dettes/);
    });
});

// ── Tool bout en bout : confirmation STRICTE à 2 temps ──────────────────────
type Handler = (a: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
function capture(store: StateStore): Handler {
    let cap: Handler | null = null;
    const fake = { tool: (_n: string, _d: string, _s: unknown, cb: Handler) => { cap = cb; } } as unknown as McpServer;
    registerDeleteItem(fake, store);
    if (!cap) throw new Error('aucun handler capturé');
    return cap;
}

describe('delete_item — tool bout en bout', () => {
    let dir: string;
    let file: string;
    beforeEach(async () => {
        dir = await fs.mkdtemp(join(tmpdir(), 'fai-'));
        file = join(dir, 'state.json');
        await fs.writeFile(file, JSON.stringify(richState()), 'utf8');
    });
    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('1er appel SANS confirm → APERÇU, le fichier garde l\'entité ; confirm:true → supprimée', async () => {
        const store = makeStateStore(new FileStateSource(file), { ttlMs: 0 });
        const h = capture(store);
        const preview = JSON.parse((await h({ entity: 'debt', name: 'Prêt auto Honda' })).content[0].text);
        expect(preview.applied).toBe(false);
        expect(preview.preview).toBe(true);
        expect((await loadAppStateFromSource(new FileStateSource(file))).debts).toHaveLength(1); // rien supprimé
        const out = JSON.parse((await h({ entity: 'debt', name: 'Prêt auto Honda', confirm: true })).content[0].text);
        expect(out.applied).toBe(true);
        expect(out.backupPath).toBeTruthy();
        expect((await loadAppStateFromSource(new FileStateSource(file))).debts).toHaveLength(0);
    });

    it('ambiguïté d\'actif au niveau tool → erreur claire (isError), rien supprimé', async () => {
        const store = makeStateStore(new FileStateSource(file), { ttlMs: 0 });
        const res = await capture(store)({ entity: 'asset', name: 'VFV.TO', confirm: true });
        expect(res.isError).toBe(true);
        expect((await loadAppStateFromSource(new FileStateSource(file))).assets).toHaveLength(3);
    });
});
