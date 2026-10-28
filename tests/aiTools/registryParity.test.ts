// tests/aiTools/registryParity.test.ts
//
// [AITOOLS-B] PARITÉ « mêmes réponses que claude.ai » (exigence Marc) : pour chaque tool de
// LECTURE data-aware, le MÊME état doit produire le MÊME payload JSON, que l'état vienne du
// fournisseur MCP (normalizeAppState — chemin claude.ai/Drive) ou du store Zustand de l'app
// (chemin chat in-app). Une divergence = les deux surfaces répondent des chiffres différents,
// précisément le bug que le chantier veut rendre impossible.
//
// + Exigence Marc « AUCUNE donnée changée » : la lecture ne MUTE jamais l'état (prouvé par
// snapshot avant/après exécution de tous les handlers).

import { describe, it, expect, beforeEach } from 'vitest';
import { TEST_PERSONAS } from '../../services/testPersonas';
import { normalizeAppState, buildDefaultAppState } from '../../mcp/state/appStateDefaults';
import { useFinanceStore, personaResetBase } from '../../store/useFinanceStore';
import { READ_SPECS } from '../../services/aiTools/registry';
import { appStateProvider } from '../../services/aiTools/appStateProvider';

// Args minimaux VALIDES par tool data-aware. ⚠️ Exhaustivité verrouillée ci-dessous : un nouveau
// tool `kind: 'read'` ajouté au registre SANS cas de parité fait échouer ce test (pas d'oubli).
const CASES: Array<[string, Record<string, unknown>]> = [
    ['get_financial_overview', {}],
    ['get_holdings', {}],
    ['get_next_best_actions', {}],
    ['search_transactions', {}],
    ['get_tax_situation', { year: 2026 }],
    ['get_retirement_outlook', { monteCarlo: false }],
    ['get_projection', { years: 10, scenario: 'BASE', monteCarlo: false }],
    ['simulate_what_if', { changes: [{ kind: 'depense_recurrente', label: 'Test parité', monthlyAmount: 100 }], years: 5 }],
];

const PERSONAS = ['karim-immigre', 'couple-dettes'];

function personaBuild(id: string): Record<string, unknown> {
    return TEST_PERSONAS.find((p) => p.id === id)!.build() as Record<string, unknown>;
}

beforeEach(() => {
    useFinanceStore.getState().resetState();
});

describe('[AITOOLS-B] parité de payloads MCP ↔ app (même état → même JSON)', () => {
    it('la liste des cas COUVRE tous les tools de lecture data-aware du registre (exhaustivité prouvée)', () => {
        const dataAware = READ_SPECS.filter((s) => s.kind === 'read').map((s) => s.name).sort();
        expect(dataAware.length).toBeGreaterThanOrEqual(8); // volume (leçon FISC-CONST-LINT)
        expect(CASES.map(([n]) => n).sort()).toEqual(dataAware);
    });

    for (const personaId of PERSONAS) {
        it(`persona ${personaId} : les 8 tools data-aware rendent un payload IDENTIQUE via les deux fournisseurs`, async () => {
            const raw = personaBuild(personaId);
            const mcpState = normalizeAppState(raw);
            const mcpProvider = async () => mcpState;

            // Chemin RÉEL de l'app : store Zustand → appStateProvider (pick data-only + normalize).
            useFinanceStore.setState(raw as never);
            const appProvider = appStateProvider;

            for (const [name, args] of CASES) {
                const spec = READ_SPECS.find((s) => s.name === name)!;
                const viaMcp = await spec.handler(args, mcpProvider);
                const viaApp = await spec.handler(args, appProvider);
                expect(viaMcp.isError, `${name} (MCP) ne doit pas être en erreur`).toBeUndefined();
                expect(viaApp.isError, `${name} (app) ne doit pas être en erreur`).toBeUndefined();
                // content[0] = le payload JSON (un éventuel bloc de fraîcheur additif est hors périmètre).
                expect(
                    JSON.parse(viaApp.content[0].text),
                    `${name} : payload app ≠ payload MCP (parité « mêmes réponses » violée)`,
                ).toEqual(JSON.parse(viaMcp.content[0].text));
            }
        }, 120_000); // get_projection/simulate_what_if exécutent le vrai moteur (> 5 s défaut)
    }

    it('[ceinture panel] les VRAIES clés API ne peuvent JAMAIS entrer dans le snapshot (exclues à la frontière)', async () => {
        // Discriminant : l'ancien pick copiait store.apiKeys tel quel — un futur spec (ou un
        // jsonContent(state) accidentel) aurait pu envoyer la clé Anthropic RÉELLE dans un
        // tool_result vers l'API (finding security-privacy).
        useFinanceStore.setState({ apiKeys: { anthropic: 'sk-ant-VRAIE-CLE', finnhub: 'fh-vraie' } } as never);
        const { snapshotAppState } = await import('../../services/aiTools/appStateProvider');
        const snap = snapshotAppState();
        expect(JSON.stringify(snap)).not.toContain('sk-ant-VRAIE-CLE');
        expect(snap.apiKeys).toEqual({ anthropic: '', finnhub: '' }); // défauts vides via normalize
    });

    it('[ceinture panel] un champ store CORROMPU (transactions: null) → erreur CLAIRE, jamais des zéros plausibles', async () => {
        // Discriminant : sans validateAppStateShape, les `??` des handlers masquaient un null
        // corrompu en « absence légitime » (0 transaction trouvée, impôt 0 $, zéro trace).
        useFinanceStore.setState({ transactions: null } as never);
        const { snapshotAppState } = await import('../../services/aiTools/appStateProvider');
        expect(() => snapshotAppState()).toThrowError(/AppState invalide/);
    });

    it('[ceinture panel] le snapshot est un CLONE : muter ce que reçoit un handler ne touche pas le store', async () => {
        useFinanceStore.setState(personaBuild('karim-immigre') as never);
        const { snapshotAppState } = await import('../../services/aiTools/appStateProvider');
        const before = useFinanceStore.getState().transactions.length;
        const snap = snapshotAppState();
        snap.transactions.length = 0; // mutation hostile côté handler
        (snap.debts as unknown[]).push({ id: 'evil' });
        expect(useFinanceStore.getState().transactions.length).toBe(before); // le store est INTACT
        expect(useFinanceStore.getState().debts.find((d) => d.id === 'evil')).toBeUndefined();
    });

    it('[dérive des défauts] buildDefaultAppState (MCP) ≡ défauts du store après resetState (champ par champ)', () => {
        // Finding code-reviewer : deux littéraux de défauts dupliqués (ex. retirementGoal) jamais
        // exercés par les personas (qui les surchargent) — une dérive rendrait chat in-app ≠ claude.ai
        // pour un blob ANCIEN sans le champ. lastUpdate exclu (horodatage) ; apiKeys exclu (snapshot).
        const mcpDefaults = buildDefaultAppState() as unknown as Record<string, unknown>;
        const store = useFinanceStore.getState() as unknown as Record<string, unknown>;
        const skip = new Set(['lastUpdate', 'apiKeys']);
        for (const key of Object.keys(mcpDefaults)) {
            if (skip.has(key)) continue;
            expect(store[key], `défaut divergent pour « ${key} » (MCP vs store)`).toEqual(mcpDefaults[key]);
        }
    });

    it('[DEFAULTS-DRIFT-FINTABLE-FIELDS] BIDIRECTIONNEL : chaque champ du store existe dans buildDefaultAppState', () => {
        // Cause racine du drift 2026-07-31 : le test ci-dessus n'itère QUE sur les clés de
        // buildDefaultAppState → un champ ajouté au store SEULEMENT (categoryReview,
        // fintableSyncReport, fintableBrokerBalances, fintableRoles) passait inaperçu, et
        // `snapshotAppState` (qui pick ses clés depuis buildDefaultAppState) le rendait
        // structurellement INVISIBLE au chat in-app. Ici on itère dans l'AUTRE sens : l'univers
        // des clés de données du store = personaResetBase() + les 3 clés qu'il retire.
        const mcpDefaults = buildDefaultAppState();
        const storeKeys = [...Object.keys(personaResetBase()), 'apiKeys', 'fxRates', 'lastUpdate'];
        expect(storeKeys.length).toBeGreaterThan(20); // non-vacuité : l'univers est bien peuplé
        for (const key of storeKeys) {
            expect(
                key in mcpDefaults,
                `champ « ${key} » présent au store mais ABSENT de buildDefaultAppState — invisible au chat in-app`,
            ).toBe(true);
        }
    });

    // [Extension panel security-privacy] couple-dettes (dettes/immobilier peuplés) + monteCarlo:true
    // + d'autres kinds de what-if : la preuve couvre les branches du moteur à données non vides —
    // en COMPLÉMENT du clone à la frontière (ceinture structurelle, testée ci-dessus).
    const MUTATION_PERSONAS = ['karim-immigre', 'couple-dettes'];
    const MUTATION_EXTRA_CASES: Array<[string, Record<string, unknown>]> = [
        ['get_retirement_outlook', { monteCarlo: true }],
        ['simulate_what_if', { changes: [{ kind: 'achat_ponctuel', label: 'Auto test', amount: 20000 }], years: 5 }],
        ['simulate_what_if', { changes: [{ kind: 'nouvelle_dette', label: 'Prêt test', amount: 10000, ratePct: 7, years: 5 }], years: 5 }],
    ];

    for (const personaId of MUTATION_PERSONAS) {
        it(`[aucune donnée changée] persona ${personaId} : TOUS les tools de lecture (+MC, +what-if variés) ne mutent PAS le store`, async () => {
            useFinanceStore.setState(personaBuild(personaId) as never);
            const appProvider = appStateProvider;
            const readSlices = () => JSON.stringify({
                transactions: useFinanceStore.getState().transactions,
                assets: useFinanceStore.getState().assets,
                debts: useFinanceStore.getState().debts,
                config: useFinanceStore.getState().config,
                budgetItems: useFinanceStore.getState().budgetItems,
                financialGoals: useFinanceStore.getState().financialGoals,
                realEstateGoals: useFinanceStore.getState().realEstateGoals,
                initialBalances: useFinanceStore.getState().initialBalances,
            });
            const snapshotBefore = readSlices();
            for (const [name, args] of [...CASES, ...MUTATION_EXTRA_CASES]) {
                const spec = READ_SPECS.find((s) => s.name === name)!;
                const res = await spec.handler(args, appProvider);
                expect(res.isError, `${name} en erreur pendant la preuve de non-mutation`).toBeUndefined();
            }
            expect(readSlices()).toBe(snapshotBefore);
        }, 180_000);
    }
});
