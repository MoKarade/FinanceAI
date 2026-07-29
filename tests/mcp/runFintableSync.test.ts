// [FINTABLE-3] Orchestrateur de sync serveur : écriture atomique, rapport TOUJOURS persisté,
// distinction conflit transitoire vs panne réelle.

import { describe, it, expect, vi } from 'vitest';
import { runFintableSync } from '../../mcp/runFintableSync';
import { FintableError } from '../../services/fintable/types';
import { StateConflictError } from '../../mcp/state/stateErrors';
import type { AppState, Transaction } from '../../types';
import type { StateStore } from '../../mcp/state/stateStore';
import type { FintableClient } from '../../services/fintable/client';

function baseState(over: Partial<AppState> = {}): AppState {
    return {
        transactions: [], assets: [], investmentTransactions: [], investmentAccounts: [],
        budgetItems: [], config: {} as AppState['config'], projection: {} as AppState['projection'],
        realEstateGoals: [], childGoals: [], savingsGoals: [], debts: [], travelGoals: [],
        lifeEvents: [], retirementGoal: {} as AppState['retirementGoal'], financialGoals: [],
        initialBalances: {}, apiKeys: { anthropic: '', finnhub: '' },
        fxRates: { USD: 1, EUR: 1, CAD: 1 }, lastUpdate: 0, categorizationRules: [], aiConversation: [],
        ...over,
    } as AppState;
}

function tx(id: number, date: string): Transaction {
    return { id, date, payee: 'x', amount: -1, category: 'x', status: 'processed' };
}

function makeStore(state: AppState): { store: StateStore; saved: AppState[] } {
    const saved: AppState[] = [];
    const store: StateStore = {
        get: async () => state,
        getWithVersion: async () => ({ state, version: 1 }),
        save: async (next) => { saved.push(next); return { backupPath: '/backup' }; },
        canWrite: true,
    };
    return { store, saved };
}

function makeFakeClient(): FintableClient {
    // readFintableSnapshot n'appelle que .get et .getAllPages — mock minimal.
    return {
        get: vi.fn(async (path: string) => {
            if (path === '/accounts') return { data: [], nextCursor: null, snapshotDate: null };
            throw new Error(`route inattendue : ${path}`);
        }),
        getAllPages: vi.fn(async () => []),
    } as unknown as FintableClient;
}

describe('runFintableSync — écriture atomique', () => {
    it('écrit un rapport de SUCCÈS et sauvegarde UNE seule fois', async () => {
        const { store, saved } = makeStore(baseState({ transactions: [tx(1, '2026-07-08')] }));
        const report = await runFintableSync(store, { token: 't', roles: {}, client: makeFakeClient() });

        expect(report.error).toBeNull();
        expect(report.cutoverDateUsed).toBe('2026-07-08'); // dérivée, pas passée en dur
        expect(saved).toHaveLength(1);
        expect(saved[0].fintableSyncReport).toEqual(report);
    });

    it('dérive la bascule à CHAQUE passe (jamais un paramètre figé)', async () => {
        const { store: store1 } = makeStore(baseState({ transactions: [tx(1, '2026-06-01')] }));
        const r1 = await runFintableSync(store1, { token: 't', roles: {}, client: makeFakeClient() });
        expect(r1.cutoverDateUsed).toBe('2026-06-01');

        const { store: store2 } = makeStore(baseState({ transactions: [tx(1, '2026-06-01'), tx(2, '2026-07-15')] }));
        const r2 = await runFintableSync(store2, { token: 't', roles: {}, client: makeFakeClient() });
        expect(r2.cutoverDateUsed).toBe('2026-07-15');
    });

    it('état vierge → cutoverDateUsed null, sync quand même exécutée', async () => {
        const { store } = makeStore(baseState());
        const report = await runFintableSync(store, { token: 't', roles: {}, client: makeFakeClient() });
        expect(report.cutoverDateUsed).toBeNull();
        expect(report.error).toBeNull();
    });
});

describe('runFintableSync — gestion des pannes', () => {
    it('un conflit OCC est RELANCÉ TEL QUEL, sans écrire de rapport d\'échec', async () => {
        // Transitoire (l'app a poussé entre-temps) : rien d'écrasé, pas une panne à tracer.
        const state = baseState();
        const store: StateStore = {
            get: async () => state,
            getWithVersion: async () => ({ state, version: 1 }),
            save: async () => { throw new StateConflictError('conflit'); },
            canWrite: true,
        };
        await expect(
            runFintableSync(store, { token: 't', roles: {}, client: makeFakeClient() }),
        ).rejects.toThrow(StateConflictError);
    });

    it('une panne Fintable RÉELLE (AUTH) persiste un rapport d\'ÉCHEC puis relance l\'erreur d\'origine', async () => {
        const state = baseState({ transactions: [tx(1, '2026-07-01')] });
        const saved: AppState[] = [];
        const store: StateStore = {
            get: async () => state,
            getWithVersion: async () => ({ state, version: 1 }),
            save: async (next) => { saved.push(next); return { backupPath: '/backup' }; },
            canWrite: true,
        };
        const failingClient = {
            get: vi.fn(async () => { throw new FintableError('jeton révoqué', 'AUTH'); }),
            getAllPages: vi.fn(async () => []),
        } as unknown as FintableClient;

        await expect(
            runFintableSync(store, { token: 't', roles: {}, client: failingClient }),
        ).rejects.toThrow(FintableError);

        expect(saved).toHaveLength(1);
        expect(saved[0].fintableSyncReport?.error).toContain('AUTH');
        expect(saved[0].fintableSyncReport?.error).toContain('jeton révoqué');
        // La bascule était déjà connue AVANT l'échec Fintable : le rapport la porte quand même.
        expect(saved[0].fintableSyncReport?.cutoverDateUsed).toBe('2026-07-01');
        // Aucun compteur fabriqué sur un échec (no-fake-data).
        expect(saved[0].fintableSyncReport?.transactionsAdded).toBe(0);
    });

    it('source non inscriptible → échec immédiat, aucun appel réseau', async () => {
        const store: StateStore = {
            get: async () => baseState(),
            getWithVersion: async () => ({ state: baseState(), version: null }),
            save: async () => { throw new Error('ne devrait jamais être appelé'); },
            canWrite: false,
        };
        const client = makeFakeClient();
        await expect(runFintableSync(store, { token: 't', roles: {}, client })).rejects.toThrow(/inscriptible/);
        expect(client.get).not.toHaveBeenCalled();
    });

    it('si même la persistance du rapport d\'échec échoue, l\'erreur D\'ORIGINE reste celle relancée', async () => {
        const state = baseState();
        let getCalls = 0;
        const store: StateStore = {
            get: async () => state,
            getWithVersion: async () => {
                getCalls++;
                if (getCalls > 1) throw new Error('Drive indisponible pour la relecture');
                return { state, version: 1 };
            },
            save: async () => { throw new Error('sauvegarde du rapport d\'échec impossible'); },
            canWrite: true,
        };
        const failingClient = {
            get: vi.fn(async () => { throw new FintableError('panne réseau', 'NETWORK'); }),
            getAllPages: vi.fn(async () => []),
        } as unknown as FintableClient;

        await expect(
            runFintableSync(store, { token: 't', roles: {}, client: failingClient }),
        ).rejects.toThrow(/panne réseau/);
    });
});
