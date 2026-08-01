// mcp/state/appStateDefaults.ts
//
// [AITOOLS-B] Défauts + normalisation d'AppState — extraits VERBATIM de loadAppState.ts pour être
// BROWSER-SAFE (loadAppState importe node:fs pour FileStateSource → inutilisable côté app). Les
// DEUX fournisseurs d'état passent par `normalizeAppState` : le serveur MCP (fichier/Drive) ET le
// chat in-app (services/aiTools/appStateProvider) — même normalisation = parité par construction.
// loadAppState ré-exporte ces symboles (compat : aucun consommateur existant à retoucher).

import type { AppState } from '../../types';
import { DEFAULT_AI_CHAT_MODEL } from '../../services/aiChat/models';
import {
    INITIAL_BUDGET,
    INITIAL_CONFIG,
    INITIAL_PROJECTION,
    INITIAL_REAL_ESTATE_GOAL,
    INITIAL_CHILD_GOAL,
    DEFAULT_FX_RATES,
} from '../../constants';

/**
 * Construit un AppState COMPLET par défaut (sans dépendance React/localStorage).
 * Mirroir du `defaultState` du store, utilisé comme base de normalisation pour
 * fusionner un état partiel (export app, persona, blob Drive) → AppState valide.
 */
export function buildDefaultAppState(): AppState {
    return {
        transactions: [],
        assets: [],
        investmentTransactions: [],
        investmentAccounts: [],
        budgetItems: INITIAL_BUDGET,
        config: INITIAL_CONFIG,
        projection: INITIAL_PROJECTION,
        realEstateGoals: [INITIAL_REAL_ESTATE_GOAL],
        childGoal: INITIAL_CHILD_GOAL,
        childGoals: [INITIAL_CHILD_GOAL],
        savingsGoals: [],
        debts: [],
        travelGoals: [],
        lifeEvents: [],
        retirementGoal: { targetAge: 65, targetMonthlyIncome: 4000, governmentPension: 1200 },
        financialGoals: [],
        initialBalances: {},
        apiKeys: { anthropic: '', finnhub: '' },
        fxRates: DEFAULT_FX_RATES,
        lastUpdate: Date.now(),
        categorizationRules: [],
        aiConversation: [],
        aiConversations: [],
        activeAiConversationId: null,
        aiChatModel: DEFAULT_AI_CHAT_MODEL,
        aiChatCostUsdTotal: 0,
        insurancePolicies: [],
        rentalProperties: [],
        privateBusinesses: [],
        vehicleReplacements: [],
        majorRenovations: [],
        charitableGoals: [],
        documents: [],
        // [DEFAULTS-DRIFT-FINTABLE-FIELDS] Champs ADDITIFS optionnels présents EXPLICITEMENT
        // (`: undefined`) : `snapshotAppState` (chat in-app) itère sur les clés de CE littéral —
        // un champ absent ici est structurellement INVISIBLE au chat, même s'il existe au store.
        // Miroir exact du littéral DEFAULT_APP_STATE du store ; parité verrouillée par le test
        // BIDIRECTIONNEL de registryParity.test.ts.
        categoryReview: undefined,
        fintableSyncReport: undefined,
        fintableBrokerBalances: undefined,
        fintableRoles: undefined,
    };
}

/**
 * Normalise un état (potentiellement partiel) en AppState complet : on part des
 * défauts et on écrase avec les champs présents. Garantit que les collections et
 * `config`/`projection`/`fxRates` existent toujours pour le moteur pur.
 */
export function normalizeAppState(partial: Partial<AppState>): AppState {
    const base = buildDefaultAppState();
    return {
        ...base,
        ...partial,
        // Sous-objets : fusion peu profonde pour ne pas perdre les défauts si la
        // source ne fournit qu'une partie (ex. fxRates sans CAD).
        config: { ...base.config, ...(partial.config ?? {}) },
        fxRates: { ...base.fxRates, ...(partial.fxRates ?? {}) },
    };
}
