import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AppState, Tab, BudgetCategory, FinancialGoal, RealEstateGoal } from '../types';
import { INITIAL_BUDGET, INITIAL_CONFIG, INITIAL_PROJECTION, INITIAL_REAL_ESTATE_GOAL, INITIAL_CHILD_GOAL, DEFAULT_FX_RATES } from '../constants';
import type { ProjectionResult } from '../services/projection/types';
import { quotaStorage } from '../services/quotaStorage';
import { logError } from '../services/errorLogger';
import { saveLockedProjection, clearLockedProjection } from '../services/lockedProjectionStore';

// Phase B2 — Deep-link cross-tab: un onglet pose un "intent" de focus, la page
// destination le consomme au mount (scroll, highlight, focus, etc.).
export interface PendingFocus {
    tab: Tab;
    section: string | null;
    /** Timestamp d'expiration (ms). Garde-fou: si la page cible ne consomme
     *  pas dans 5s, on auto-purge pour éviter les focus fantômes. */
    expiresAt: number;
}

/** PH2-c — statut du moteur de projection app-level (ProjectionEngine). */
export type ProjectionStatus = 'idle' | 'computing' | 'error';

export interface FinanceState extends AppState {
    activeTab: Tab;
    isPrivacyMode: boolean;
    // Wiring 2026-05 (Option A): dernier résultat de calculateFutureProjection,
    // mis à jour par FutureProjection. Lu par Dashboard/Investments/Budget/etc.
    // pour afficher des projections cohérentes sans recalculer.
    lastProjection: ProjectionResult | null;
    /** PH2-a (clé de voûte) — toggle Monte-Carlo de l'onglet Futur, REMONTÉ dans le store
     *  pour survivre aux changements d'onglet (le contrôle ne se réinitialise plus au retour
     *  sur Futur) et persisté pour survivre au reload. */
    projectionRunMC: boolean;
    /** PH2-c (clé de voûte) — statut du moteur de projection app-level (ProjectionEngine).
     *  Transitoire (NON persisté) : tout onglet peut afficher « recalcul… » / erreur sans
     *  tenir l'état de calcul localement. */
    projectionStatus: ProjectionStatus;
    /** PH2-d — courbe VERROUILLÉE : snapshot complet d'un ProjectionResult choisi par l'utilisateur.
     *  TRANSITOIRE en mémoire (NON dans le persist localStorage — trop gros) ; persisté CHIFFRÉ en
     *  IndexedDB (services/lockedProjectionStore) et restauré au boot si `isProjectionLocked`. */
    lockedProjection: ProjectionResult | null;
    /** PH2-d — vrai si une courbe est verrouillée. Persisté (booléen ADDITIF, pas de bump v7) ;
     *  le gros blob `lockedProjection` vit en IndexedDB. */
    isProjectionLocked: boolean;
    pendingFocus: PendingFocus | null;
    // Mode test : true = l'app affiche des fixtures de test, banner visible
    isTestMode: boolean;
    /** Snapshot des vraies données sauvegardé AVANT activation du mode test.
     *  Restauré quand l'utilisateur sort du mode test. */
    // Omit<…,'apiKeys'> : invariant de sécurité GARANTI au compilateur — le snapshot des vraies
    // données (désormais persisté en localStorage) ne peut JAMAIS contenir les clés API.
    realDataSnapshot: Partial<Omit<AppState, 'apiKeys'>> | null;
    /** Id du persona de test actuellement chargé (null hors mode test). */
    activeTestPersonaId: string | null;
    setActiveTab: (tab: Tab) => void;
    setPrivacyMode: (v: boolean) => void;
    togglePrivacyMode: () => void;
    setAppState: (state: Partial<AppState>) => void;
    setLastProjection: (r: ProjectionResult | null) => void;
    setProjectionRunMC: (v: boolean) => void;
    setProjectionStatus: (s: ProjectionStatus) => void;
    /** PH2-d — verrouille la courbe courante (snapshot mémoire + persistance IndexedDB chiffrée). */
    lockProjection: (r: ProjectionResult) => void;
    /** PH2-d — déverrouille (efface le snapshot mémoire ET l'entrée IndexedDB). */
    unlockProjection: () => void;
    /** PH2-d — restaure la courbe verrouillée depuis IndexedDB au boot (sans ré-écrire l'IDB). */
    setLockedProjection: (r: ProjectionResult | null) => void;
    /** Navigate to a tab with an optional section to scroll/focus on arrival. */
    navigateWithFocus: (tab: Tab, section?: string) => void;
    /** Called by the destination page after it has consumed the focus intent. */
    clearPendingFocus: () => void;
    updateFxRates: (rates: { USD: number; EUR: number; CAD: number; lastFetched?: number }) => void;
    updateApiKeys: (keys: { anthropic: string; finnhub?: string }) => void;
    updateLastUpdate: () => void;
    resetState: () => void;
    /** Active le mode test : sauvegarde l'état actuel + applique des fixtures.
     *  `personaId` (optionnel) identifie le persona chargé pour le banner. */
    enableTestMode: (fixtures: Partial<AppState>, personaId?: string | null) => void;
    /** Désactive le mode test : restaure l'état sauvegardé. */
    disableTestMode: () => void;
}

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
        const gross = u.grossSalary || (net * 1.35);
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
    // W5.x — Nouveaux containers (vide par défaut)
    insurancePolicies: [],
    rentalProperties: [],
    privateBusinesses: [],
    vehicleReplacements: [],
    majorRenovations: [],
    charitableGoals: [],
    documents: [],
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

    // CONSOLIDATION persistance (2026-05-25) : `financeai-storage` (Zustand persist)
    // est LA source de vérité. S'il existe, persist hydrate les vraies données
    // juste après → inutile (et risqué) de relire ~25 clés legacy `app_*` à chaque
    // boot. Cette 2e source/migration parallèle était la dette #1 (corruption
    // silencieuse possible + parse synchrone bloquant au boot). La lecture legacy
    // ci-dessous ne sert donc plus qu'à l'IMPORT UNIQUE des utilisateurs d'avant
    // l'ère persist (aucune perte : financeai-storage contient toutes les données
    // persistables ; les clés API vivent dans secureKeyStore).
    try {
        if (localStorage.getItem('financeai-storage') !== null) return defaultState;
    } catch { /* localStorage inaccessible : on tente la lecture legacy quand même */ }

    try {
        const savedApiKeysStr = localStorage.getItem('app_api_keys');
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
            try { localStorage.removeItem('app_api_keys'); } catch { /* quota / privacy */ }
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
        const savedSavingsGoals = localStorage.getItem('app_savings_goals');
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
            savingsGoals: savedSavingsGoals ? JSON.parse(savedSavingsGoals) : [],
            debts: savedDebts ? JSON.parse(savedDebts) : [],
            travelGoals: savedTravelGoals ? JSON.parse(savedTravelGoals) : [],
            lifeEvents: savedLifeEvents ? JSON.parse(savedLifeEvents) : [],
            retirementGoal: savedRetirementGoal ? JSON.parse(savedRetirementGoal) : { targetAge: 65, targetMonthlyIncome: 4000, governmentPension: 1200 },
            financialGoals: finGoals,
            initialBalances: savedBalances ? JSON.parse(savedBalances) : {},
            apiKeys: safeApiKeys,
            fxRates: storedFxRates ? JSON.parse(storedFxRates) : DEFAULT_FX_RATES,
            lastUpdate: Date.now(),
            categorizationRules: (() => { try { const r = localStorage.getItem('categorization_rules'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            aiConversation: [],
            // FIX agents (HIGH code-reviewer): defaults manquants dans le retour de migration
            insurancePolicies: (() => { try { const r = localStorage.getItem('app_insurance_policies'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            rentalProperties: (() => { try { const r = localStorage.getItem('app_rental_properties'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            privateBusinesses: (() => { try { const r = localStorage.getItem('app_private_businesses'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            vehicleReplacements: (() => { try { const r = localStorage.getItem('app_vehicle_replacements'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            majorRenovations: (() => { try { const r = localStorage.getItem('app_major_renovations'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            charitableGoals: (() => { try { const r = localStorage.getItem('app_charitable_goals'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
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
                if (key && key !== 'app_api_keys_enc' && key !== 'app_api_keys' && watchedPrefixes.some(p => key.startsWith(p))) {
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

const initialState: AppState = getInitialStateWithMigration();

/** Type de migration : union de l'état courant + champs legacy des versions précédentes. */
type MigratingState = Partial<FinanceState> & {
    apiKeys?: { gemini?: string; anthropic?: string; finnhub?: string };
    retirementGoal?: Partial<FinanceState['retirementGoal']> & { lifeExpectancy?: number };
    assets?: unknown[];
    isTestMode?: boolean;
    realDataSnapshot?: Partial<AppState> | null;
    activeTestPersonaId?: string | null;
};

/**
 * Migrations du state persisté (`financeai-storage`). Extrait du `persist()` pour être testable
 * unitairement (cf tests/store/migratePersistedState.test.ts). Chaque palier est chaîné : un vieux
 * blob v3 traverse v3→v4→…→v7. Sans ça, toute évolution de la forme du state casse silencieusement
 * le boot des utilisateurs existants.
 */
export function migratePersistedState(persistedState: unknown, fromVersion: number): unknown {
    let state = persistedState as MigratingState;
    // v0/undefined → v1 : intro versioning
    if (fromVersion === undefined || fromVersion < 1) {
        state = state as MigratingState;
    }
    // v1 → v2 : Phase 4 A1 — ajout apiKeys.anthropic (gemini gardé).
    // v2 → v3 : Phase 4 A5 — suppression de apiKeys.gemini (pas de copie vers anthropic, formats ≠).
    if (fromVersion < 3 && state?.apiKeys) {
        const apiKeys = state.apiKeys;
        state = { ...state, apiKeys: { anthropic: apiKeys.anthropic || '' } } as MigratingState;
    }
    // v3 → v4 : §7.F.5 — ajout apiKeys.finnhub pour le data sourcing marketData (default vide).
    if (fromVersion < 4 && state?.apiKeys) {
        const apiKeys = state.apiKeys;
        state = {
            ...state,
            apiKeys: { anthropic: apiKeys.anthropic || '', finnhub: apiKeys.finnhub || '' },
        } as MigratingState;
    }
    // v4 → v5 : Phase C.3 — `lifeExpectancy` migré du state local Retirement.tsx vers
    //   retirementGoal global (default 90).
    if (fromVersion < 5 && state?.retirementGoal) {
        const rg = state.retirementGoal;
        if (rg.lifeExpectancy === undefined) {
            state = { ...state, retirementGoal: { ...rg, lifeExpectancy: 90 } } as MigratingState;
        }
    }
    // v5 → v6 : Phase E.8 — DCA multi-achat (dateBought+buyPrice+quantity → purchases[]).
    //   Les champs legacy restent pour rétrocompat.
    if (fromVersion < 6 && Array.isArray(state?.assets)) {
        type LegacyAsset = { dateBought?: string; buyPrice?: number; quantity?: number; purchases?: unknown };
        state = {
            ...state,
            assets: (state.assets as LegacyAsset[]).map((a: LegacyAsset) => {
                if (Array.isArray(a.purchases) && a.purchases.length > 0) return a;
                if (a.dateBought && typeof a.buyPrice === 'number' && a.buyPrice > 0 && a.quantity && a.quantity > 0) {
                    return { ...a, purchases: [{ date: a.dateBought, quantity: a.quantity, price: a.buyPrice }] };
                }
                return a;
            }),
        } as MigratingState;
    }
    // v6 → v7 : le MODE TEST ne doit JAMAIS être persisté (bug 2026-05-29 : l'auto-push Drive
    //   envoyait des données persona et écrasait la vraie sauvegarde). Si un blob a été figé en
    //   mode test, on restaure les vraies données depuis realDataSnapshot, puis on purge les
    //   champs de test (ils ne seront plus jamais réécrits — cf partialize).
    if (fromVersion < 7) {
        if (state?.isTestMode && state.realDataSnapshot) {
            state = { ...state, ...state.realDataSnapshot } as MigratingState;
        }
        const cleaned = { ...(state as Record<string, unknown>) };
        delete cleaned.isTestMode;
        delete cleaned.realDataSnapshot;
        delete cleaned.activeTestPersonaId;
        state = cleaned as MigratingState;
    }
    return state;
}

export const useFinanceStore = create<FinanceState>()(
    persist(
        (set) => ({
            ...initialState,
            activeTab: Tab.DASHBOARD,
            isPrivacyMode: false,
            lastProjection: null,
            projectionRunMC: true,
            projectionStatus: 'idle',
            lockedProjection: null,
            isProjectionLocked: false,
            pendingFocus: null,
            isTestMode: false,
            realDataSnapshot: null,
            activeTestPersonaId: null,

            // Navigation : on synchronise window.location.hash AVANT le set.
            // Sinon l'effet applyHash (App.tsx, deps [activeTab]) se relance au
            // changement d'activeTab, lit le hash resté périmé et revert vers
            // l'onglet courant → les boutons navigateWithFocus semblent « morts ».
            // Cf. BACKLOG G1 (2026-05-22).
            setActiveTab: (tab) => {
                if (typeof window !== 'undefined' && window.location.hash.replace('#', '') !== tab) {
                    window.location.hash = tab;
                }
                set({ activeTab: tab });
            },
            setPrivacyMode: (v) => set({ isPrivacyMode: v }),
            togglePrivacyMode: () => set((prev) => ({ isPrivacyMode: !prev.isPrivacyMode })),
            setAppState: (state) => set((prev) => ({ ...prev, ...state })),
            setLastProjection: (r) => set({ lastProjection: r }),
            setProjectionRunMC: (v) => set({ projectionRunMC: v }),
            setProjectionStatus: (s) => set({ projectionStatus: s }),
            // PH2-d — verrou : état sync + persistance IndexedDB best-effort (fire-and-forget ; le
            // module logue ses propres échecs et ne lève jamais, donc ne casse pas l'UI).
            lockProjection: (r) => { set({ lockedProjection: r, isProjectionLocked: true }); void saveLockedProjection(r); },
            unlockProjection: () => { set({ lockedProjection: null, isProjectionLocked: false }); void clearLockedProjection(); },
            // Boot uniquement : pose le blob restauré depuis l'IDB (réconcilie le booléen persisté
            // avec le contenu réel — si l'IDB est vide/illisible, r=null → on retombe déverrouillé).
            setLockedProjection: (r) => set({ lockedProjection: r, isProjectionLocked: r !== null }),
            navigateWithFocus: (tab, section) => {
                if (typeof window !== 'undefined' && window.location.hash.replace('#', '') !== tab) {
                    window.location.hash = tab;
                }
                set({
                    activeTab: tab,
                    pendingFocus: { tab, section: section ?? null, expiresAt: Date.now() + 5000 },
                });
            },
            clearPendingFocus: () => set({ pendingFocus: null }),
            updateFxRates: (rates) => set((prev) => ({
                fxRates: { ...prev.fxRates, ...rates }
            })),
            updateApiKeys: (keys) => set((prev) => ({
                apiKeys: { ...prev.apiKeys, ...keys }
            })),
            updateLastUpdate: () => set({ lastUpdate: Date.now() }),
            // `set` fait un merge superficiel et `initialState` (AppState) ne contient PAS les flags
            // propres au store (isTestMode/realDataSnapshot/activeTestPersonaId) → on les remet
            // explicitement, sinon un reset déclenché EN mode test n'en sortirait jamais (bannière figée).
            resetState: () => set({ ...initialState, isTestMode: false, realDataSnapshot: null, activeTestPersonaId: null }),

            // Mode test : sauve l'état "vrai" actuel, applique les fixtures,
            // active le flag (banner visible via Layout).
            enableTestMode: (fixtures, personaId) => set((prev) => {
                // Snapshot des VRAIES données SEULEMENT à la 1re activation (hors flags UI/credentials).
                // Au changement de persona (déjà en test), on CONSERVE ce snapshot initial — sinon on
                // « sauvegarderait » les données fictives par-dessus les vraies (perte définitive).
                let realDataSnapshot = prev.realDataSnapshot;
                if (!prev.isTestMode) {
                    const { apiKeys: _ak, activeTab: _at, isPrivacyMode: _pm, lastProjection: _lp, pendingFocus: _pf, isTestMode: _tm, realDataSnapshot: _rds, activeTestPersonaId: _atp, ...persistable } = prev as FinanceState;
                    void _ak; void _at; void _pm; void _lp; void _pf; void _tm; void _rds; void _atp;
                    realDataSnapshot = persistable as Partial<Omit<AppState, 'apiKeys'>>;
                }
                return {
                    ...prev,
                    // Repart d'une base de données PROPRE avant d'appliquer le persona : aucune tranche
                    // de l'ancien persona (ni des vraies données) ne subsiste (fix « données qui restent »).
                    ...personaResetBase(),
                    ...fixtures,
                    // Les clés API sont des credentials, jamais des données financières : le mode test
                    // ne doit JAMAIS les écraser (sinon market data tombe en panne au retour).
                    apiKeys: prev.apiKeys,
                    isTestMode: true,
                    realDataSnapshot,
                    activeTestPersonaId: personaId ?? null,
                };
            }),
            // Restaure les vraies données sauvegardées + désactive le flag.
            disableTestMode: () => set((prev) => {
                if (!prev.isTestMode) return prev;
                const snap = prev.realDataSnapshot;
                if (!snap) {
                    // État corrompu : en mode test mais sans snapshot des vraies données (blob édité,
                    // quota au moment du snapshot, futur bug de migration…). On ne PEUT PAS restaurer —
                    // on échoue franchement (log) et on repart d'une base PROPRE plutôt que de laisser
                    // les données fictives passer pour réelles (ce qui, le flag retombé, ré-ouvrirait le
                    // push Drive — le bug 2026-05-29). Jamais avalé.
                    logError({ source: 'storage', severity: 'warning', message: 'disableTestMode : mode test actif sans realDataSnapshot — vraies données non restaurables, retour à un état vide.' });
                    return { ...prev, ...personaResetBase(), isTestMode: false, realDataSnapshot: null, activeTestPersonaId: null };
                }
                return {
                    ...prev,
                    ...snap,
                    isTestMode: false,
                    realDataSnapshot: null,
                    activeTestPersonaId: null,
                };
            }),
        }),
        {
            name: 'financeai-storage',
            storage: createJSONStorage(() => quotaStorage),
            // Schema versioning: incrémenter à chaque changement non-rétrocompatible
            // de la forme du state, et ajouter une étape dans `migrate`.
            // Sans version, toute évolution casse silencieusement le boot des
            // utilisateurs existants (cf audit 2026-05 §State management).
            // NB : la persistance du MODE TEST (cf partialize : isTestMode/realDataSnapshot/
            // activeTestPersonaId) est ADDITIVE/rétrocompatible (champs en plus) → pas de bump requis.
            // Le strip <7 (cf migrate) reste pour nettoyer les blobs de l'ère buggée (≤ v6).
            version: 7,
            migrate: migratePersistedState,
            partialize: (state) => {
                // Exclut de la persistance : les clés API (chiffrées ailleurs) et les états UI
                // transitoires (onglet, mode privé, projection calculée, focus en attente).
                // Le MODE TEST (isTestMode/realDataSnapshot/activeTestPersonaId) EST désormais persisté
                // pour que la bannière + le persona survivent au reload (cohérence demandée par Marc).
                // Sûr côté Drive : `shouldPush` lit isTestMode → le push reste DÉSACTIVÉ tant qu'on est
                // en mode test, donc aucune donnée fictive ne part en ligne (le bug 2026-05-29 reste couvert).
                const {
                    apiKeys: _apiKeys,
                    activeTab: _activeTab,
                    isPrivacyMode: _isPrivacyMode,
                    lastProjection: _lastProjection,
                    projectionStatus: _projectionStatus,
                    lockedProjection: _lockedProjection,
                    pendingFocus: _pendingFocus,
                    ...persistable
                } = state;
                return persistable;
            },
        }
    )
);
