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
        realEstateGoals: [], childGoals: [], debts: [], travelGoals: [],
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

    /**
     * ⚠️ [FINTABLE-SYNC-STALE-BASE, finding code-reviewer PR #566] Le test de conflit ci-dessus fait
     * échouer `save` À CHAQUE appel : il ne distingue donc PAS « conflit puis succès sur base
     * fraîche » de « conflit permanent » — prouvé par injection, un retry qui repasserait la version
     * PÉRIMÉE le laissait 100 % vert. Ce test-ci exerce le chemin de SUCCÈS de la re-tentative.
     *
     * DISCRIMINANT sur les deux erreurs possibles :
     *   (a) mauvaise VERSION au retry → le store rejette encore → la passe échoue ;
     *   (b) mauvaise BASE au retry → la transaction que l'app a poussée entre-temps DISPARAÎT de
     *       l'état sauvegardé, ce qui est exactement la perte silencieuse que le ticket corrige.
     */
    it('conflit OCC puis SUCCÈS : la re-tentative écrit sur la base ET la version FRAÎCHES', async () => {
        const stale = baseState({ transactions: [tx(1, '2026-07-01')] });
        // Ce que l'app a poussé pendant notre fenêtre réseau — invisible de la base pré-fetch.
        const fresh = baseState({ transactions: [tx(1, '2026-07-01'), tx(2, '2026-07-02')] });

        let currentVersion = 1;
        let reads = 0;
        const saved: Array<{ state: AppState; version: number }> = [];
        const store: StateStore = {
            get: async () => (reads === 0 ? stale : fresh),
            getWithVersion: async () => {
                // 1re lecture = état pré-fetch (v1) ; après la collision, l'app a écrit → v2.
                const out = reads === 0
                    ? { state: stale, version: 1 }
                    : { state: fresh, version: currentVersion };
                reads++;
                if (reads === 1) currentVersion = 2;
                return out;
            },
            save: async (next, version) => {
                if (version !== currentVersion) throw new StateConflictError('conflit');
                saved.push({ state: next, version: version as number });
                return { backupPath: '/backup' };
            },
            canWrite: true,
        };

        const report = await runFintableSync(store, { token: 't', roles: {}, client: makeFakeClient() });

        expect(report.error).toBeNull();
        expect(saved).toHaveLength(1);          // (a) une SEULE écriture effective
        expect(saved[0].version).toBe(2);       // (b) portée par la version FRAÎCHE
        // (c) la transaction poussée par l'app pendant la fenêtre a SURVÉCU.
        expect(saved[0].state.transactions?.map((t) => t.id)).toEqual([1, 2]);
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

// [FINTABLE-6] Les soldes courtier étaient calculés par le mapper puis JETÉS (seul un compteur
// survivait). Sans persistance, la demande de Marc — « dans investissements, utilise exactement le
// montant que j'ai dans Fintable » — n'a aucune donnée à consommer.
describe('runFintableSync — persistance des soldes courtier (FINTABLE-6)', () => {
    it('un compte de placement CAD avec régime déclaré est PERSISTÉ (id stable + horodatage)', async () => {
        const { store, saved } = makeStore(baseState({ transactions: [] }));
        const client = {
            get: vi.fn(async (path: string) => {
                if (path.startsWith('/accounts')) {
                    return {
                        data: [{
                            id: 'acc_disnat', connection_id: 'conn_1', name: 'Disnat L7B1',
                            type: 'brokerage', currency: 'CAD', balance: '136863.18',
                            cash_balance: null, debt: null,
                        }],
                    };
                }
                return { data: [] };
            }),
            getAllPages: vi.fn(async () => []),
        } as unknown as FintableClient;

        const report = await runFintableSync(store, {
            token: 't',
            roles: { acc_disnat: { kind: 'investment', taxRegime: 'NON-ENREG' } },
            client,
        });

        expect(report.error).toBeNull();
        expect(saved).toHaveLength(1);
        const balances = saved[0].fintableBrokerBalances;
        expect(balances).toHaveLength(1);
        expect(balances?.[0]).toMatchObject({
            accountId: 'acc_disnat',        // clé STABLE (pas le libellé, renommable côté banque)
            balanceCad: 136863.18,
            taxRegime: 'NON-ENREG',
        });
        // Horodatage réel → l'UI peut dire honnêtement « vu il y a N jours » plutôt que faire semblant.
        expect(balances?.[0].at).toBe(report.at);
    });

    it('aucun compte de placement exploitable → liste VIDE écrite (efface une autorité périmée)', async () => {
        // Une valeur d'hier laissée en place ferait autorité à tort : une autorité périmée est pire
        // qu'une absence assumée (l'app retombe alors sur la somme des titres saisis, comportement connu).
        const previous = baseState({ transactions: [] });
        previous.fintableBrokerBalances = [
            { accountId: 'vieux', label: 'Compte fermé', balanceCad: 999_999, taxRegime: 'CELI', at: 1 },
        ];
        const { store, saved } = makeStore(previous);

        await runFintableSync(store, { token: 't', roles: {}, client: makeFakeClient() });

        expect(saved).toHaveLength(1);
        expect(saved[0].fintableBrokerBalances).toEqual([]);
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
