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
        debts: [],
        travelGoals: [],
        lifeEvents: [],
        retirementGoal: { targetAge: 65, targetMonthlyIncome: 4000, governmentPension: 1200 },
        financialGoals: [],
        initialBalances: {},
        apiKeys: { anthropic: '', finnhub: '' },
        fxRates: DEFAULT_FX_RATES,
        fxRatesEstimated: true, // [FX-FALLBACK-SILENCIEUX] DEFAULT_FX_RATES est un repli en dur.
        // ⚠️⚠️ [FX-TAUX-JAMAIS-ARRIVES] `fxRatesSource` est DÉLIBÉRÉMENT ABSENT de l'état initial.
        // Mon premier jet y écrivait `'repli'`, au motif qu'une provenance explicite vaut mieux
        // qu'une absence. C'était une RÉGRESSION, et un test existant l'a trouvée : `merge` de
        // zustand superpose le blob persisté sur CET objet, CLÉ PAR CLÉ. Un blob écrit AVANT ce
        // lot ne porte pas la clé — elle serait donc restée à `'repli'` alors que l'utilisateur a
        // de VRAIS taux (`fxRatesEstimated: false`, `lastFetched > 0`). Résultat : son compte
        // courtier en devise étrangère aurait CESSÉ d'être converti le jour du déploiement,
        // c'est-à-dire l'exact contraire de ce que ce lot corrige.
        // Laissée absente, la clé fait retomber `fxSourceEffective` sur l'ancienne lecture — la
        // rétrocompatibilité écrite pour ça. `fxRatesEstimated: true` ci-dessus dit déjà « repli »
        // pour un état NEUF, sans jamais pouvoir contredire un état ANCIEN.
        fxLastAttemptCause: 'jamais-tente',
        fxLastAttemptAt: 0,
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
        fintableBrokerHistory: undefined,
        fintableRoles: undefined,
        // [PTF-L1A] Miroir de DEFAULT_APP_STATE : `undefined`, jamais `[]` — une valeur `[]` ici
        // serait MATÉRIALISÉE dans le blob Drive au premier outil d'écriture (« importé et vide »).
        brokerLedger: undefined,
        instruments: undefined,
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
