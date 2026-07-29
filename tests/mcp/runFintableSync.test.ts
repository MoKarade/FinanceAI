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

    // [finding financial-integrity A3, PR #531] Une transaction mal datée dans le FUTUR pousserait la
    // bascule en avant → le mapper filtrerait TOUTES les transactions Fintable comme "avant la
    // bascule", chaque jour, sans aucun signal (transactionsAdded:0 indéfiniment). La bascule ne doit
    // JAMAIS dépasser aujourd'hui, et le plafonnement doit être TRACÉ (pas un cap silencieux).
    it('transaction datée dans le futur → bascule plafonnée à AUJOURD\'HUI, avec avertissement', async () => {
        const farFuture = '2099-01-01';
        const { store } = makeStore(baseState({ transactions: [tx(1, farFuture)] }));
        const report = await runFintableSync(store, { token: 't', roles: {}, client: makeFakeClient() });

        const todayStr = new Date().toISOString().slice(0, 10);
        expect(report.cutoverDateUsed).toBe(todayStr); // jamais la date future brute
        expect(report.cutoverDateUsed).not.toBe(farFuture);
        expect(report.warnings.some((w) => w.includes('dans le FUTUR'))).toBe(true);
        expect(report.error).toBeNull(); // un plafonnement n'est pas une panne
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

    // [finding silent-failure-hunter, PR #531] Avant le fix, la lecture initiale (`getWithVersion`)
    // vivait HORS du `try` : une panne à CET endroit précis (Drive KO, jeton révoqué, coffre chiffré)
    // ne déclenchait AUCUN rapport d'échec, contredisant la garantie documentée « TOUJOURS écrit ».
    it('la lecture INITIALE de l\'état échoue → un rapport d\'échec est quand même écrit', async () => {
        const fallbackState = baseState();
        const saved: AppState[] = [];
        let getCalls = 0;
        const store: StateStore = {
            get: async () => fallbackState,
            getWithVersion: async () => {
                getCalls++;
                // 1er appel = celui de runFintableSync (échoue) ; 2e = celui de persistFailureReport (réussit).
                if (getCalls === 1) throw new Error('Drive inaccessible (jeton révoqué)');
                return { state: fallbackState, version: 1 };
            },
            save: async (next) => { saved.push(next); return { backupPath: '/backup' }; },
            canWrite: true,
        };
        await expect(
            runFintableSync(store, { token: 't', roles: {}, client: makeFakeClient() }),
        ).rejects.toThrow(/Drive inaccessible/);

        expect(saved).toHaveLength(1);
        expect(saved[0].fintableSyncReport?.error).toContain('Drive inaccessible');
        // La bascule n'a jamais pu être dérivée (la lecture d'état a échoué avant) : honnête, pas 0/fabriqué.
        expect(saved[0].fintableSyncReport?.cutoverDateUsed).toBeNull();
    });
});

describe('runFintableSync — isolation par payload (un payload rejeté n\'avorte pas les autres)', () => {
    // [finding financial-integrity, PR #531, MESURÉ] Une carte remboursée à 0 $ ce mois-ci est un
    // solde LÉGITIME chez Fintable, mais `applyDocument` le juge « aberrant » pour une dette (design
    // volontaire, cf applyDebt). Avant le fix, ce rejet AVORTAIT toute la boucle avant `store.save` —
    // aucun payload, même valide (transactions, cash), n'était écrit tant que la carte restait à 0 $.
    it('une dette à solde 0 (rejetée) devient un AVERTISSEMENT — transaction + cash restent appliqués', async () => {
        const state = baseState({ transactions: [] });
        const { store, saved } = makeStore(state);
        const client = {
            get: vi.fn(async (path: string) => {
                if (path === '/accounts') {
                    return {
                        data: [
                            { id: 'acc_cash', connection_id: 'conn_1', name: 'PCA', type: 'depository', currency: 'CAD', balance: '1000.00', enabled: true },
                            { id: 'acc_visa', connection_id: 'conn_1', name: 'Visa', type: 'credit', currency: 'CAD', balance: '0.00', enabled: true },
                        ],
                        nextCursor: null, snapshotDate: null,
                    };
                }
                if (path.endsWith('/holdings')) return { data: [], nextCursor: null, snapshotDate: null };
                throw new Error(`route inattendue : ${path}`);
            }),
            getAllPages: vi.fn(async () => ([
                { id: 'tx1', account_id: 'acc_cash', date: '2026-07-15', amount: '-50.00', currency: 'CAD', description: 'Test' },
            ])),
        } as unknown as FintableClient;

        const report = await runFintableSync(store, {
            token: 't',
            roles: { acc_cash: { kind: 'cash' }, acc_visa: { kind: 'debt', debtName: 'Visa Card' } },
            client,
        });

        expect(report.error).toBeNull();
        expect(report.debtsUpdated).toEqual([]); // le payload dette a échoué : pas de fausse réussite
        expect(report.warnings.some((w) => w.includes('Payload « debt » NON appliqué'))).toBe(true);
        // Les payloads VALIDES sont bien appliqués ET sauvegardés malgré l'échec du 3e.
        expect(report.transactionsAdded).toBe(1);
        expect(report.cashUpdated).toBe(true);
        expect(saved).toHaveLength(1);
        expect(saved[0].transactions).toHaveLength(1);
    });
});
