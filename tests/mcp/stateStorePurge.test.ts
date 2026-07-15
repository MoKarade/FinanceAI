// tests/mcp/stateStorePurge.test.ts
// [PERSONA-PURGE] — ceinture MCP (finding panel 2026-07-15) : le StateStore désinfecte à la
// LECTURE tout artefact de persona de test resté dans un blob historique (fichier/Drive) →
// les tools ne résument jamais de données contaminées à Claude, et toute écriture dérivée
// (state lu → modifié → save) re-persiste un état PROPRE.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStateSource, buildDefaultAppState } from '../../mcp/state/loadAppState';
import { makeStateStore } from '../../mcp/state/stateStore';
import type { AppState, Transaction, FinancialGoal } from '../../types';

describe('StateStore MCP — désinfection persona à la lecture', () => {
    let dir: string;
    let file: string;
    beforeEach(async () => {
        dir = await fs.mkdtemp(join(tmpdir(), 'fai-purge-'));
        file = join(dir, 'state.json');
    });
    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('un blob pollué (persona-tx-* + kar-fg1) est lu PROPRE ; le réel est intact', async () => {
        const polluted: AppState = {
            ...buildDefaultAppState(),
            transactions: [
                { id: 'persona-tx-1', payee: 'Shopify - Dépôt paie', amount: 3200, date: '2026-06-01', category: 'Salaire' } as unknown as Transaction,
                { id: '1752585600001', payee: 'Paie / ROBOVIC INC.', amount: 837.31, date: '2026-06-04', category: 'Salaire' } as unknown as Transaction,
            ],
            financialGoals: [{ id: 'kar-fg1', name: 'Indépendance financière (1 M$)' } as unknown as FinancialGoal],
        };
        await fs.writeFile(file, JSON.stringify(polluted), 'utf8');

        const store = makeStateStore(new FileStateSource(file), { ttlMs: 0 });
        const state = await store.get();
        expect(state.transactions.map(t => t.id)).toEqual(['1752585600001']); // persona-tx-1 ignoré
        expect(state.financialGoals).toEqual([]);                              // kar-fg1 ignoré
    });

    it('un blob propre est lu tel quel (aucune altération)', async () => {
        const clean: AppState = {
            ...buildDefaultAppState(),
            transactions: [{ id: '1752585600002', payee: 'Achat / IGA #8376', amount: -12.05, date: '2026-06-05', category: 'Épicerie' } as unknown as Transaction],
        };
        await fs.writeFile(file, JSON.stringify(clean), 'utf8');
        const store = makeStateStore(new FileStateSource(file), { ttlMs: 0 });
        const state = await store.get();
        expect(state.transactions).toHaveLength(1);
        expect(state.transactions[0].id).toBe('1752585600002');
    });
});
