// tests/mcp/directEditBudgetGoal.test.ts
// [MCP-DIRECT-EDIT Lot 2] set_budget_item — upsert PAR NOM (casse/accents
// ignorés), update PARTIEL, bornes D9 + gardes non-fini côté MÉTIER (bypass-Zod, leçon MCP-WHATIF),
// idempotence au retry, et confirmation à 2 temps au niveau tool (dry-run sans écriture).
// Discriminant clé : éditer la CIBLE pose `autoTarget: false` (BUDGET-TX-CATEGORIES).
// [NAV-REMOVE-OBJECTIFS-TAB] Le volet `upsert_savings_goal` (Lot 3) de ce fichier a été retiré
// avec la feature (UI + moteur + tools MCP) — décision Marc 2026-08-27.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { applyDocument, type BudgetItemPayload } from '../../mcp/ingest/applyDocument';
import { FileStateSource, buildDefaultAppState, loadAppStateFromSource } from '../../mcp/state/loadAppState';
import { makeStateStore, type StateStore } from '../../mcp/state/stateStore';
import { registerSetBudgetItem } from '../../mcp/tools/setBudgetItem.tool';
import type { AppState, BudgetCategory } from '../../types';

const baseState = (): AppState => buildDefaultAppState();

function withBudget(): AppState {
    const s = baseState();
    s.budgetItems = [
        { id: 'cat_1700000000000', name: 'Épicerie', target: 550, frequency: 'Monthly', type: 'Commun', nature: 'Besoin', autoTarget: true },
        { id: 'cat_1700000000001', name: 'Loisirs', target: 200, frequency: 'Monthly', type: 'Commun', nature: 'Envie' },
    ] satisfies BudgetCategory[];
    return s;
}

const budgetDoc = (over: Partial<BudgetItemPayload> = {}): BudgetItemPayload =>
    ({ kind: 'budget_item', name: 'Épicerie', ...over });

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

    it('met à jour nature/type SANS toucher la cible (autoTarget PRÉSERVÉ)', () => {
        const { nextState, changes } = applyDocument(withBudget(), budgetDoc({ nature: 'Envie' }));
        const b = nextState.budgetItems.find((x) => x.name === 'Épicerie')!;
        expect(b.nature).toBe('Envie');
        expect(b.target).toBe(550);
        expect(b.autoTarget).toBe(true); // ni cible ni fréquence éditées → l'auto reste accroché
        expect(changes).toHaveLength(1);
    });

    it('éditer la FRÉQUENCE seule DÉCROCHE autoTarget (parité Budget.tsx — finding ÉLEVÉ panel)', () => {
        // Sans le décrochage, le refresh auto réécrit une moyenne MENSUELLE dans un poste devenu
        // Yearly → cible mensuelle effective ÷12 (+épargne fabriquée dans la projection).
        const { nextState, changes } = applyDocument(withBudget(), budgetDoc({ frequency: 'Yearly' }));
        const b = nextState.budgetItems.find((x) => x.name === 'Épicerie')!;
        expect(b.frequency).toBe('Yearly');
        expect(b.autoTarget).toBe(false); // décroché, comme l'édition UI de la fréquence
        expect(b.target).toBe(550);       // la cible elle-même n'a pas bougé
        // L'aperçu montre l'équivalent MENSUEL avant/après (piège ×12 visible à la confirmation).
        expect(String(changes[0].note)).toMatch(/550 \$ à 46 \$/);
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

    it('AJOUT d\'un poste SANS catégorie de transactions observée → avertit qu\'il sera RETIRÉ au prochain sync', () => {
        const s = withBudget(); // aucune transaction → toute catégorie est non observée
        const { changes, summary } = applyDocument(s, budgetDoc({ name: 'Cadeaux Noël', targetCad: 1200, frequency: 'Yearly' }));
        expect(String(changes[0].note)).toMatch(/RETIRÉ au prochain chargement/);
        expect(summary).toMatch(/RETIRÉ au prochain chargement/);
    });

    it('AJOUT d\'un poste dont le nom rapproche une catégorie OBSERVÉE (fuzzy budgetSync) → pas d\'avertissement', () => {
        const s = withBudget();
        s.transactions = [{ id: 9, date: '2026-01-05', amount: -80, category: 'Restaurants', payee: 'Bistro', status: 'processed' }] as AppState['transactions'];
        const { changes } = applyDocument(s, budgetDoc({ name: 'Restaurant', targetCad: 300 }));
        expect(String(changes[0].note ?? '')).not.toMatch(/RETIRÉ/);
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

describe('applyBudgetItem — garde ménage solo (Perso 2)', () => {
    it("rejette « Perso 2 » quand aucun 2ᵉ conjoint n'est NOMMÉ (contenu, pas longueur du tuple)", () => {
        const solo = withBudget();
        if (solo.config?.users?.[1]) solo.config.users[1].name = '';
        expect(() => applyDocument(solo, budgetDoc({ type: 'Perso 2' }))).toThrow(/2ᵉ conjoint|Perso 2/);
    });

    it('accepte « Perso 2 » quand le 2ᵉ conjoint est nommé', () => {
        const duo = withBudget();
        if (duo.config?.users?.[1]) duo.config.users[1].name = 'Sophie';
        const { nextState } = applyDocument(duo, budgetDoc({ type: 'Perso 2' }));
        expect(nextState.budgetItems.find((x) => x.name === 'Épicerie')!.type).toBe('Perso 2');
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

describe('set_budget_item — confirmation à 2 temps (bout en bout)', () => {
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

    it('source non inscriptible → erreur claire, pas de crash', async () => {
        const h = capture(registerSetBudgetItem, makeStateStore(null));
        expect((await h({ name: 'Resto', targetCad: 250, confirm: true })).isError).toBe(true);
    });
});
