// store/etatParDefaut.ts
// [GODFILE-STORE] Défauts de l'app, migration LEGACY (clés `app_*` pré-persist) et bases persona,
// extraits tels quels de useFinanceStore.ts (lot 158). ⚠️ `initialState` est calculé ICI, au
// chargement du module — UNE seule exécution de `getInitialStateWithMigration()` (elle a des
// effets : lecture ET purge de clés localStorage legacy), exactement comme avant le découpage.
import { AppState, BudgetCategory, FinancialGoal, RealEstateGoal } from '../types';
import { INITIAL_BUDGET, INITIAL_CONFIG, INITIAL_PROJECTION, INITIAL_REAL_ESTATE_GOAL, INITIAL_CHILD_GOAL, DEFAULT_FX_RATES } from '../constants';
import { logError } from '../services/errorLogger';
import { loadLegacyHealthWeights } from '../utils/healthWeights';
import { calculateGrossFromNet } from '../utils/tax';
import { DEFAULT_AI_CHAT_MODEL } from '../services/aiChat/models';
import { STORAGE_KEYS } from '../utils/storageKeys';

const safeRandomId = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
};

interface MigrationStatus {
    failed: boolean;
    backupKey: string | null;
    error: string | null;
}
let _migrationStatus: MigrationStatus = { failed: false, backupKey: null, error: null };
export const getMigrationStatus = (): MigrationStatus => _migrationStatus;

const migrateBudgetItems = (items: BudgetCategory[]): BudgetCategory[] => {
    return items.map(item => {
        const id = item.id || `cat_${safeRandomId()}`;
        let nature = item.nature;
        if (!nature) {
            const n = (item.name || '').toLowerCase();
            nature = 'Envie';
            if (n.includes('épargne') || n.includes('finances') || n.includes('reer') || n.includes('celi')) nature = 'Epargne';
            else if (n.includes('loyer') || n.includes('hypothèque') || n.includes('hydro') || n.includes('épicerie') || n.includes('internet') || n.includes('assurance') || n.includes('essence') || n.includes('transport')) nature = 'Besoin';
        }
        return { ...item, id, nature };
    });
};

type LegacyUser = { netSalary?: number; salary?: number; grossSalary?: number; [k: string]: unknown };
type LegacyBudgetConfig = { users: LegacyUser[]; [k: string]: unknown };
const migrateUserConfig = (config: LegacyBudgetConfig): LegacyBudgetConfig => {
    const newUsers = config.users.map((u) => {
        const net = u.netSalary || u.salary || 0;
        // [MIGRATE-GROSS-135] Le brut FABRIQUÉ ici est PERSISTÉ : une fois écrit, le moteur prend la
        // branche `users[0].grossSalary` et ne recalcule plus jamais. Un facteur plat de 1,35 y
        // gravait donc une erreur durable — MESURÉE sur le barème 2026 : +2 681 $ à 30 k$ de net
        // annuel (surestimé), mais −22 028 $ à 100 k$ et −132 196 $ à 250 k$ (sous-estimé). Le signe
        // s'inverse, donc aucun réglage du facteur ne peut marcher : c'est l'INVERSE exact qu'il
        // faut. `calculateGrossFromNet` le donne par dichotomie, à moins de 1 $ près (vérifié).
        // ⚠️ UNITÉS : `netSalary`/`grossSalary` sont MENSUELS dans le store, `calculateGrossFromNet`
        // prend et rend de l'ANNUEL — d'où le ×12 puis le /12.
        const gross = u.grossSalary || (net > 0 ? calculateGrossFromNet(net * 12, new Date().getFullYear()) / 12 : 0);
        return {
            ...u,
            netSalary: net,
            grossSalary: Math.round(gross)
        };
    });
    return { ...config, users: newUsers };
};

// Défauts purs de l'app (toutes les tranches vides/par défaut). SOURCE UNIQUE réutilisée par
// l'init ET par le chargement d'un persona de test (base propre anti-fuite — cf personaResetBase).
const DEFAULT_APP_STATE: AppState = {
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
    lastUpdate: Date.now(),
    categorizationRules: [],
    aiConversation: [],
    // [B2-CHAT-HISTORY] Multi-conversations (additif, persisté via partialize allow-all — sync Drive).
    aiConversations: [],
    activeAiConversationId: null,
    // [B3+B4] Modèle par conversation + coût API cumulé à vie (additifs, persistés/synchronisés).
    aiChatModel: DEFAULT_AI_CHAT_MODEL,
    aiChatCostUsdTotal: 0,
    // W5.x — Nouveaux containers (vide par défaut)
    insurancePolicies: [],
    rentalProperties: [],
    privateBusinesses: [],
    vehicleReplacements: [],
    majorRenovations: [],
    charitableGoals: [],
    documents: [],
    // [FINTABLE-3, finding sécurité panel PR #531] Présent EXPLICITEMENT (pas omis) pour que
    // `personaResetBase()` (dérivé de ce littéral) le remette à `undefined` à CHAQUE entrée en mode
    // démo persona — sinon le rapport RÉEL (comptes/dettes/dates de Marc) traverserait le spread de
    // `enableTestMode` intact (un objet qui n'a pas une clé ne la réinitialise pas). Même classe que
    // PERSONA-PURGE : « zéro fuite inter-persona ».
    // [TX-REVIEW] Champ ADDITIF déclaré EXPLICITEMENT ici : `personaResetBase()` dérive de
    // DEFAULT_APP_STATE, et spreader un objet SANS une clé ne réinitialise pas cette clé — la vraie
    // revue de Marc traverserait alors le mode démo (extension de PERSONA-PURGE).
    categoryReview: undefined,
    fintableSyncReport: undefined,
    // [FINTABLE-6] MÊME raison que ci-dessus : soldes RÉELS des comptes de placement de Marc — la
    // donnée la plus sensible du lot. Présent explicitement pour être purgé au switch de persona.
    fintableBrokerBalances: undefined,
    // [FINTABLE-7] Rôles assignés depuis Réglages. Présent explicitement (même raison) : la liste
    // des comptes réels de Marc n'a rien à faire dans une démo persona.
    fintableRoles: undefined,
};

// Base PROPRE pour charger un persona de test : toutes les tranches de DONNÉES remises aux défauts
// vides, SAUF apiKeys (credentials), fxRates (données de marché) et lastUpdate — gardées telles
// quelles. Garantit qu'AUCUNE donnée du persona précédent (ni des vraies données) ne subsiste quand
// le nouveau persona ne définit pas une tranche (fix « des données qui restent au switch de profil »).
export const personaResetBase = (): Partial<AppState> => {
    const { apiKeys: _ak, fxRates: _fx, lastUpdate: _lu, ...data } = DEFAULT_APP_STATE;
    void _ak; void _fx; void _lu;
    // structuredClone : copies FRAÎCHES des tranches (arrays/objets) à chaque chargement de persona.
    // Sinon le state pointerait sur les mêmes références que DEFAULT_APP_STATE/initialState, et une
    // mutation en place en aval corromprait silencieusement les défauts globaux partagés.
    return structuredClone(data);
};

export const getInitialStateWithMigration = (): AppState => {
    const defaultState: AppState = { ...DEFAULT_APP_STATE, lastUpdate: Date.now() };

    if (typeof window === 'undefined') return defaultState;

    // [ASSISTANT-HUB, finding sécurité #492 + code-reviewer 2bis] Cache de l'ancien widget
    // « Prochaine action » (conseils IA dérivés du patrimoine = PII, Loi 25) : le widget est retiré,
    // plus aucun code ne purgeait cette clé. Purge INCONDITIONNELLE — quiconque a cette clé a
    // forcément `financeai-storage` (le widget lisait le store hydraté), donc une purge placée dans
    // le bloc legacy ci-dessous (early-return si financeai-storage existe) ne s'exécuterait JAMAIS
    // pour la population concernée (code mort — 1er jet du fix, réfuté par le panel).
    try { localStorage.removeItem('nba:cache:v1'); } catch { /* localStorage indispo */ }

    // CONSOLIDATION persistance (2026-05-25) : `financeai-storage` (Zustand persist)
    // est LA source de vérité. S'il existe, persist hydrate les vraies données
    // juste après → inutile (et risqué) de relire ~25 clés legacy `app_*` à chaque
    // boot. Cette 2e source/migration parallèle était la dette #1 (corruption
    // silencieuse possible + parse synchrone bloquant au boot). La lecture legacy
    // ci-dessous ne sert donc plus qu'à l'IMPORT UNIQUE des utilisateurs d'avant
    // l'ère persist (aucune perte : financeai-storage contient toutes les données
    // persistables ; les clés API vivent dans secureKeyStore).
    try {
        if (localStorage.getItem(STORAGE_KEYS.persistStore) !== null) return defaultState;
    } catch { /* localStorage inaccessible : on tente la lecture legacy quand même */ }

    try {
        const savedApiKeysStr = localStorage.getItem(STORAGE_KEYS.apiKeysLegacy);
        // Phase 4 A5: Gemini retiré — pas de migration depuis l'ancienne clé.
        // L'utilisateur doit fournir une clé Anthropic Claude.
        let safeApiKeys: { anthropic: string; finnhub: string } = {
            anthropic: '',
            finnhub: '',
        };
        if (savedApiKeysStr) {
            // SECURITY (audit C5 2026-05-21, révisé 2026-05-25) : la clef legacy
            // `app_api_keys` stockait les clefs API EN CLAIR (exfiltrable via XSS
            // ou extension). On la lit une dernière fois pour ne rien perdre,
            // puis on la SUPPRIME du localStorage.
            //
            // Les clefs ne sont JAMAIS persistées en clair : exclues du persist
            // Zustand via partialize. Elles sont désormais persistées CHIFFRÉES
            // (AES-256-GCM, clef non-extractible en IndexedDB) via
            // services/secureKeyStore, et ré-hydratées en async au boot par
            // App.tsx. Ici, en synchrone, elles ne sont qu'en mémoire le temps
            // que l'hydratation chiffrée prenne le relais.
            try {
                const parsed = JSON.parse(savedApiKeysStr);
                safeApiKeys = {
                    anthropic: parsed.anthropic || '',
                    finnhub: parsed.finnhub || '',
                };
            } catch { /* parse error, ignorer */ }
            try { localStorage.removeItem(STORAGE_KEYS.apiKeysLegacy); } catch { /* quota / privacy */ }
        }

        const savedTransactions = localStorage.getItem('cached_transactions');
        const savedBalances = localStorage.getItem('initial_balances');
        const savedConfig = localStorage.getItem('app_config');
        const savedBudget = localStorage.getItem('app_budget');
        const savedAssets = localStorage.getItem('app_assets');
        const savedProjection = localStorage.getItem('app_projection');
        const savedInvTx = localStorage.getItem('app_investment_tx');
        const savedInvAcc = localStorage.getItem('app_investment_acc');
        const savedRealEstate = localStorage.getItem('app_real_estate_goal');
        const savedRealEstateArray = localStorage.getItem('app_real_estate_goals');
        const savedChildGoal = localStorage.getItem('app_child_goal');
        const savedDebts = localStorage.getItem('app_debts');
        const savedTravelGoals = localStorage.getItem('app_travel_goals');
        const savedLifeEvents = localStorage.getItem('app_life_events');
        const savedRetirementGoal = localStorage.getItem('app_retirement_goal');
        const savedFinancialGoals = localStorage.getItem('app_financial_goals');
        const storedFxRates = localStorage.getItem('fx_rates_cache');

        let budgetItems = savedBudget ? JSON.parse(savedBudget) : INITIAL_BUDGET;
        budgetItems = migrateBudgetItems(budgetItems);

        let config = savedConfig ? JSON.parse(savedConfig) : INITIAL_CONFIG;
        config = migrateUserConfig(config);

        let finGoals = savedFinancialGoals ? JSON.parse(savedFinancialGoals) : [];
        finGoals = finGoals.map((g: FinancialGoal) => ({ ...g, status: g.status || 'active' }));

        let realEstateGoals: RealEstateGoal[];
        if (savedRealEstateArray) {
            realEstateGoals = JSON.parse(savedRealEstateArray);
        } else if (savedRealEstate) {
            const single = JSON.parse(savedRealEstate);
            realEstateGoals = [{ ...single, id: single.id || 'main_property', isPrimaryResidence: single.isPrimaryResidence ?? true }];
        } else {
            realEstateGoals = [INITIAL_REAL_ESTATE_GOAL];
        }

        return {
            transactions: savedTransactions ? JSON.parse(savedTransactions) : [],
            assets: savedAssets ? JSON.parse(savedAssets) : [],
            investmentTransactions: savedInvTx ? JSON.parse(savedInvTx) : [],
            investmentAccounts: savedInvAcc ? JSON.parse(savedInvAcc) : [],
            budgetItems: budgetItems,
            config: config,
            projection: savedProjection ? JSON.parse(savedProjection) : INITIAL_PROJECTION,
            realEstateGoals: realEstateGoals,
            childGoal: savedChildGoal ? JSON.parse(savedChildGoal) : INITIAL_CHILD_GOAL,
            childGoals: savedChildGoal ? [JSON.parse(savedChildGoal)] : [INITIAL_CHILD_GOAL],
            // [PH4D-WEIGHTS-STORE] poids santé migrés de l'ancienne clé localStorage vers le store persisté
            // (lecture one-shot ; ensuite ils vivent dans `financeai-storage` via partialize allow-all).
            healthWeights: loadLegacyHealthWeights(),
            // [PH4-F] abonnements épinglés (additif) : défaut [] ; persistés via partialize allow-all.
            // Pas de bump v7→v8 — rien à migrer (les abos n'étaient jamais stockés, seulement détectés).
            subscriptions: [],
            debts: savedDebts ? JSON.parse(savedDebts) : [],
            travelGoals: savedTravelGoals ? JSON.parse(savedTravelGoals) : [],
            lifeEvents: savedLifeEvents ? JSON.parse(savedLifeEvents) : [],
            retirementGoal: savedRetirementGoal ? JSON.parse(savedRetirementGoal) : { targetAge: 65, targetMonthlyIncome: 4000, governmentPension: 1200 },
            financialGoals: finGoals,
            initialBalances: savedBalances ? JSON.parse(savedBalances) : {},
            apiKeys: safeApiKeys,
            fxRates: storedFxRates ? JSON.parse(storedFxRates) : DEFAULT_FX_RATES,
            // [FX-FALLBACK-SILENCIEUX] Cette migration LEGACY (pré-persist Zustand) n'a aucune
            // source pour ce nouveau champ — `true` est le même défaut neutre que DEFAULT_APP_STATE.
            fxRatesEstimated: true,
            lastUpdate: Date.now(),
            categorizationRules: (() => { try { const r = localStorage.getItem('categorization_rules'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            aiConversation: [],
            aiConversations: [],
            activeAiConversationId: null,
            aiChatModel: DEFAULT_AI_CHAT_MODEL,
            aiChatCostUsdTotal: 0,
            // FIX agents (HIGH code-reviewer): defaults manquants dans le retour de migration
            insurancePolicies: (() => { try { const r = localStorage.getItem('app_insurance_policies'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            rentalProperties: (() => { try { const r = localStorage.getItem('app_rental_properties'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            privateBusinesses: (() => { try { const r = localStorage.getItem('app_private_businesses'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            vehicleReplacements: (() => { try { const r = localStorage.getItem('app_vehicle_replacements'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            majorRenovations: (() => { try { const r = localStorage.getItem('app_major_renovations'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            charitableGoals: (() => { try { const r = localStorage.getItem('app_charitable_goals'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            // [Dérive attrapée par tests/aiTools/registryParity 2026-07-21] `documents` MANQUAIT du
            // littéral legacy (même classe que le « FIX agents : defaults manquants » ci-dessus) →
            // state.documents undefined au 1er boot sans financeai-storage. Jamais stocké en legacy → [].
            documents: [],
        };
    } catch (e) {
        const errorStr = String(e);
        logError({ source: 'storage', severity: 'critical', message: "Migration de l'état échouée — retour à un état par défaut (données possiblement non chargées)", error: e });
        let backupKey: string | null = null;
        try {
            const corruptedDump: Record<string, string | null> = {};
            const watchedPrefixes = ['app_', 'cached_', 'financeai-', 'fx_rates_', 'categorization_', 'initial_', 'lm_', 'gemini_'];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                // On exclut le blob de clés chiffrées du dump de crash (sécurité H1) :
                // pas besoin de l'élargir à une 2e clef localStorage.
                if (key && key !== STORAGE_KEYS.apiKeysEncrypted && key !== STORAGE_KEYS.apiKeysLegacy && watchedPrefixes.some(p => key.startsWith(p))) {
                    corruptedDump[key] = localStorage.getItem(key);
                }
            }
            backupKey = `__financeai_backup_${Date.now()}`;
            localStorage.setItem(backupKey, JSON.stringify({ error: errorStr, dump: corruptedDump }));
            console.warn(`[FinanceAI] Backup sauvegarde sous ${backupKey}`);
        } catch (backupErr) {
            logError({ source: 'storage', severity: 'error', message: 'Échec de la sauvegarde du dump de migration corrompu', error: backupErr });
            backupKey = null;
        }
        _migrationStatus = { failed: true, backupKey, error: errorStr };
        return defaultState;
    }
};


export const initialState: AppState = getInitialStateWithMigration();
