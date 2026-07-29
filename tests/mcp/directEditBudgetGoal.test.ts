// tests/mcp/directEditBudgetGoal.test.ts
// [MCP-DIRECT-EDIT Lots 2-3] set_budget_item + upsert_savings_goal — upsert PAR NOM (casse/accents
// ignorés), update PARTIEL, bornes D9 + gardes non-fini côté MÉTIER (bypass-Zod, leçon MCP-WHATIF),
// idempotence au retry, et confirmation à 2 temps au niveau tool (dry-run sans écriture).
// Discriminant clé Lot 2 : éditer la CIBLE pose `autoTarget: false` (BUDGET-TX-CATEGORIES).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { applyDocument, type BudgetItemPayload, type SavingsGoalPayload } from '../../mcp/ingest/applyDocument';
import { FileStateSource, buildDefaultAppState, loadAppStateFromSource } from '../../mcp/state/loadAppState';
import { makeStateStore, type StateStore } from '../../mcp/state/stateStore';
import { registerSetBudgetItem } from '../../mcp/tools/setBudgetItem.tool';
import { registerUpsertSavingsGoal } from '../../mcp/tools/upsertSavingsGoal.tool';
import type { AppState, BudgetCategory, SavingsGoal } from '../../types';

const baseState = (): AppState => buildDefaultAppState();

function withBudget(): AppState {
    const s = baseState();
    s.budgetItems = [
        { id: 'cat_1700000000000', name: 'Épicerie', target: 550, frequency: 'Monthly', type: 'Commun', nature: 'Besoin', autoTarget: true },
        { id: 'cat_1700000000001', name: 'Loisirs', target: 200, frequency: 'Monthly', type: 'Commun', nature: 'Envie' },
    ] satisfies BudgetCategory[];
    return s;
}

function withGoal(): AppState {
    const s = baseState();
    s.savingsGoals = [
        { id: 'goal_1700000000000', name: 'Voyage Japon', targetAmount: 8000, currentAmount: 1500, deadline: '2027-06-01', icon: '✈️' },
    ] satisfies SavingsGoal[];
    return s;
}

const budgetDoc = (over: Partial<BudgetItemPayload> = {}): BudgetItemPayload =>
    ({ kind: 'budget_item', name: 'Épicerie', ...over });
const goalDoc = (over: Partial<SavingsGoalPayload> = {}): SavingsGoalPayload =>
    ({ kind: 'savings_goal', name: 'Voyage Japon', ...over });

describe('applyBudgetItem — mise à jour PAR NOM (partielle, idempotente)', () => {
    it('édite la CIBLE d\'un poste auto-géré → target changé ET autoTarget décroché (false)', () => {
        const { nextState, changes } = applyDocument(withBudget(), budgetDoc({ targetCad: 600 }));
        const b = nextState.budgetItems.find((x) => x.name === 'Épicerie')!;
        expect(b.target).toBe(600);
        expect(b.autoTarget).toBe(false); // BUDGET-TX-CATEGORIES : édition manuelle = décrochage
        expect(changes).toHaveLength(1);
        expect(changes[0].note).toMatch(/auto-gérée décrochée/);
        // Les autres champs sont INTACTS (update partiel).
        expect(b.frequency).toBe('Monthly');
        expect(b.nature).toBe('Besoin');
    });

    it('matche le nom SANS casse ni accents (« epicerie » → poste « Épicerie », pas de doublon)', () => {
        const { nextState } = applyDocument(withBudget(), budgetDoc({ name: '  epicerie ', targetCad: 700 }));
        expect(nextState.budgetItems).toHaveLength(2); // pas de doublon
        expect(nextState.budgetItems.find((x) => x.name === 'Épicerie')!.target).toBe(700);
    });

    it('retry identique → 0 changement (idempotent), autoTarget NON décroché par un no-op', () => {
        const first = applyDocument(withBudget(), budgetDoc({ targetCad: 600 }));
        const second = applyDocument(first.nextState, budgetDoc({ targetCad: 600 }));
        expect(second.changes).toHaveLength(0);
        // Et une cible IDENTIQUE à l'existant sur un poste auto-géré ne décroche PAS l'auto.
        const noop = applyDocument(withBudget(), budgetDoc({ targetCad: 550 }));
        expect(noop.changes).toHaveLength(0);
        expect(noop.nextState.budgetItems.find((x) => x.name === 'Épicerie')!.autoTarget).toBe(true);
    });

    it('met à jour fréquence/nature/type SANS toucher la cible (autoTarget PRÉSERVÉ)', () => {
        const { nextState, changes } = applyDocument(withBudget(), budgetDoc({ nature: 'Envie' }));
        const b = nextState.budgetItems.find((x) => x.name === 'Épicerie')!;
        expect(b.nature).toBe('Envie');
        expect(b.target).toBe(550);
        expect(b.autoTarget).toBe(true); // la cible n'a pas été éditée → l'auto reste accroché
        expect(changes).toHaveLength(1);
    });

    it('AJOUT : cible requise ; défauts Monthly/Commun/Besoin, autoTarget false, id horodaté cat_', () => {
        expect(() => applyDocument(baseState(), budgetDoc({ name: 'Nouveau poste' })))
            .toThrow(/introuvable.*requis/s);
        const { nextState, changes } = applyDocument(baseState(), budgetDoc({ name: 'Resto', targetCad: 250 }));
        const b = nextState.budgetItems.find((x) => x.name === 'Resto')!;
        expect(b.target).toBe(250);
        expect(b.frequency).toBe('Monthly');
        expect(b.type).toBe('Commun');
        expect(b.nature).toBe('Besoin');
        expect(b.autoTarget).toBe(false);
        expect(b.id).toMatch(/^cat_\d+_[a-z0-9]+$/);
        expect(changes).toHaveLength(1);
    });

    it('REJETTE (throw, rien écrit) : cible négative / non finie / aberrante ; nom vide', () => {
        for (const t of [-1, Infinity, NaN, 2_000_000]) {
            expect(() => applyDocument(withBudget(), budgetDoc({ targetCad: t }))).toThrow(/invalide|aberrant/i);
        }
        expect(() => applyDocument(withBudget(), budgetDoc({ name: '  ' }))).toThrow(/requis/);
        // Pur : l'état d'entrée n'est pas muté.
        const s = withBudget();
        try { applyDocument(s, budgetDoc({ targetCad: Infinity })); } catch { /* attendu */ }
        expect(s.budgetItems.find((x) => x.name === 'Épicerie')!.target).toBe(550);
    });
});

describe('applySavingsGoal — mise à jour PAR NOM (partielle, idempotente)', () => {
    it('update PARTIEL : seul le champ fourni change, les autres restent intacts', () => {
        const { nextState, changes } = applyDocument(withGoal(), goalDoc({ currentAmountCad: 2500 }));
        const g = nextState.savingsGoals.find((x) => x.name === 'Voyage Japon')!;
        expect(g.currentAmount).toBe(2500);
        expect(g.targetAmount).toBe(8000);   // intact
        expect(g.deadline).toBe('2027-06-01'); // intact
        expect(changes).toHaveLength(1);
    });

    it('matche le nom sans casse/accents, retry identique → 0 changement', () => {
        const first = applyDocument(withGoal(), goalDoc({ name: 'voyage japon', targetAmountCad: 9000 }));
        expect(first.nextState.savingsGoals).toHaveLength(1);
        expect(first.nextState.savingsGoals[0].targetAmount).toBe(9000);
        const second = applyDocument(first.nextState, goalDoc({ name: 'voyage japon', targetAmountCad: 9000 }));
        expect(second.changes).toHaveLength(0);
    });

    it('AJOUT : cible requise ; défauts currentAmount 0 / icône 💰 / id horodaté goal_', () => {
        expect(() => applyDocument(baseState(), goalDoc({ name: 'Fonds urgence' })))
            .toThrow(/introuvable.*requis/s);
        const { nextState } = applyDocument(baseState(), goalDoc({ name: 'Fonds urgence', targetAmountCad: 15000 }));
        const g = nextState.savingsGoals.find((x) => x.name === 'Fonds urgence')!;
        expect(g.targetAmount).toBe(15000);
        expect(g.currentAmount).toBe(0);
        expect(g.icon).toBe('💰');
        expect(g.id).toMatch(/^goal_\d+_[a-z0-9]+$/);
    });

    it('REJETTE : montants non finis/aberrants, cible ≤ 0, accumulé négatif, échéance mal formée', () => {
        for (const t of [0, -5, Infinity, NaN, 200_000_000]) {
            expect(() => applyDocument(withGoal(), goalDoc({ targetAmountCad: t }))).toThrow(/invalide|aberrant/i);
        }
        expect(() => applyDocument(withGoal(), goalDoc({ currentAmountCad: -1 }))).toThrow(/invalide|aberrant/i);
        expect(() => applyDocument(withGoal(), goalDoc({ deadline: 'juin 2027' }))).toThrow(/Échéance|format/i);
        expect(() => applyDocument(withGoal(), goalDoc({ deadline: '2027-6-1' }))).toThrow(/Échéance|format/i);
        // YYYY-MM accepté.
        const ok = applyDocument(withGoal(), goalDoc({ deadline: '2027-12' }));
        expect(ok.nextState.savingsGoals[0].deadline).toBe('2027-12');
    });
});

// ── Tools bout en bout : confirmation à 2 temps (dry-run sans écriture, confirm écrit) ──
type Handler = (a: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
function capture(register: (s: McpServer, st: StateStore) => void, store: StateStore): Handler {
    let cap: Handler | null = null;
    const fake = { tool: (_n: string, _d: string, _s: unknown, cb: Handler) => { cap = cb; } } as unknown as McpServer;
    register(fake, store);
    if (!cap) throw new Error('aucun handler capturé');
    return cap;
}

describe('set_budget_item / upsert_savings_goal — confirmation à 2 temps (bout en bout)', () => {
    let dir: string;
    let file: string;
    beforeEach(async () => {
        dir = await fs.mkdtemp(join(tmpdir(), 'fai-'));
        file = join(dir, 'state.json');
        await fs.writeFile(file, JSON.stringify(baseState()), 'utf8');
    });
    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('set_budget_item : 1er appel = APERÇU sans écriture ; confirm:true = écrit + backup', async () => {
        const store = makeStateStore(new FileStateSource(file), { ttlMs: 0 });
        const h = capture(registerSetBudgetItem, store);
        const preview = JSON.parse((await h({ name: 'Resto', targetCad: 250 })).content[0].text);
        expect(preview.applied).toBe(false);
        expect(preview.preview).toBe(true);
        expect((await loadAppStateFromSource(new FileStateSource(file))).budgetItems ?? []).toHaveLength(0);
        const out = JSON.parse((await h({ name: 'Resto', targetCad: 250, confirm: true })).content[0].text);
        expect(out.applied).toBe(true);
        expect(out.backupPath).toBeTruthy();
        const reloaded = await loadAppStateFromSource(new FileStateSource(file));
        expect(reloaded.budgetItems.find((x) => x.name === 'Resto')!.target).toBe(250);
    });

    it('upsert_savings_goal : 1er appel = APERÇU sans écriture ; confirm:true = écrit', async () => {
        const store = makeStateStore(new FileStateSource(file), { ttlMs: 0 });
        const h = capture(registerUpsertSavingsGoal, store);
        const preview = JSON.parse((await h({ name: 'Fonds urgence', targetAmountCad: 15000 })).content[0].text);
        expect(preview.applied).toBe(false);
        expect(preview.preview).toBe(true);
        expect((await loadAppStateFromSource(new FileStateSource(file))).savingsGoals ?? []).toHaveLength(0);
        const out = JSON.parse((await h({ name: 'Fonds urgence', targetAmountCad: 15000, confirm: true })).content[0].text);
        expect(out.applied).toBe(true);
        const reloaded = await loadAppStateFromSource(new FileStateSource(file));
        expect(reloaded.savingsGoals.find((x) => x.name === 'Fonds urgence')!.targetAmount).toBe(15000);
    });

    it('source non inscriptible → erreur claire, pas de crash', async () => {
        const h = capture(registerSetBudgetItem, makeStateStore(null));
        expect((await h({ name: 'Resto', targetCad: 250, confirm: true })).isError).toBe(true);
    });
});
