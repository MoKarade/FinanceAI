import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AppState, Tab, BudgetCategory } from '../types';
import { INITIAL_BUDGET, INITIAL_CONFIG, INITIAL_PROJECTION, INITIAL_REAL_ESTATE_GOAL, INITIAL_CHILD_GOAL, DEFAULT_FX_RATES } from '../constants';
import type { ProjectionResult } from '../services/projection/types';

// Phase B2 — Deep-link cross-tab: un onglet pose un "intent" de focus, la page
// destination le consomme au mount (scroll, highlight, focus, etc.).
export interface PendingFocus {
    tab: Tab;
    section: string | null;
    /** Timestamp d'expiration (ms). Garde-fou: si la page cible ne consomme
     *  pas dans 5s, on auto-purge pour éviter les focus fantômes. */
    expiresAt: number;
}

interface FinanceState extends AppState {
    activeTab: Tab;
    isPrivacyMode: boolean;
    // Wiring 2026-05 (Option A): dernier résultat de calculateFutureProjection,
    // mis à jour par FutureProjection. Lu par Dashboard/Investments/Budget/etc.
    // pour afficher des projections cohérentes sans recalculer.
    lastProjection: ProjectionResult | null;
    pendingFocus: PendingFocus | null;
    setActiveTab: (tab: Tab) => void;
    setPrivacyMode: (v: boolean) => void;
    togglePrivacyMode: () => void;
    setAppState: (state: Partial<AppState>) => void;
    setLastProjection: (r: ProjectionResult | null) => void;
    /** Navigate to a tab with an optional section to scroll/focus on arrival. */
    navigateWithFocus: (tab: Tab, section?: string) => void;
    /** Called by the destination page after it has consumed the focus intent. */
    clearPendingFocus: () => void;
    updateFxRates: (rates: { USD: number; EUR: number; CAD: number; lastFetched?: number }) => void;
    updateApiKeys: (keys: { eraContext: string; gemini: string }) => void;
    updateLastUpdate: () => void;
    resetState: () => void;
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

const migrateUserConfig = (config: any): any => {
    const newUsers = config.users.map((u: any) => {
        const net = u.netSalary || u.salary || 0;
        const gross = u.grossSalary || (net * 1.35);
        return {
            ...u,
            netSalary: net,
            grossSalary: Math.round(gross)
        };
    }) as [any, any];
    return { ...config, users: newUsers };
};

const getInitialStateWithMigration = (): AppState => {
    const defaultState: AppState = {
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
        apiKeys: { eraContext: '', gemini: '', anthropic: '' },
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
    };

    if (typeof window === 'undefined') return defaultState;

    try {
        const savedApiKeysStr = localStorage.getItem('app_api_keys');
        const legacyToken = localStorage.getItem('lm_token');
        const legacyGemini = localStorage.getItem('gemini_key');
        // Migrate old lunchMoney key -> eraContext
        let safeApiKeys: { eraContext: string; gemini: string; anthropic: string } = {
            eraContext: legacyToken || '',
            gemini: legacyGemini || '',
            anthropic: '',
        };
        if (savedApiKeysStr) {
            const parsed = JSON.parse(savedApiKeysStr);
            safeApiKeys = {
                eraContext: parsed.eraContext || parsed.lunchMoney || safeApiKeys.eraContext,
                gemini: parsed.gemini || safeApiKeys.gemini,
                // Phase 4 A1 — nouvelle clé Anthropic, vide par défaut
                anthropic: parsed.anthropic || '',
            };
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
        finGoals = finGoals.map((g: any) => ({ ...g, status: g.status || 'active' }));

        let realEstateGoals: any[];
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
            categorizationRules: (() => { try { const r = localStorage.getItem('categorization_rules'); return r ? JSON.parse(r) : []; } catch { return []; } })(),
            aiConversation: [],
            // FIX agents (HIGH code-reviewer): defaults manquants dans le retour de migration
            insurancePolicies: (() => { try { const r = localStorage.getItem('app_insurance_policies'); return r ? JSON.parse(r) : []; } catch { return []; } })(),
            rentalProperties: (() => { try { const r = localStorage.getItem('app_rental_properties'); return r ? JSON.parse(r) : []; } catch { return []; } })(),
            privateBusinesses: (() => { try { const r = localStorage.getItem('app_private_businesses'); return r ? JSON.parse(r) : []; } catch { return []; } })(),
            vehicleReplacements: (() => { try { const r = localStorage.getItem('app_vehicle_replacements'); return r ? JSON.parse(r) : []; } catch { return []; } })(),
            majorRenovations: (() => { try { const r = localStorage.getItem('app_major_renovations'); return r ? JSON.parse(r) : []; } catch { return []; } })(),
            charitableGoals: (() => { try { const r = localStorage.getItem('app_charitable_goals'); return r ? JSON.parse(r) : []; } catch { return []; } })(),
        };
    } catch (e) {
        const errorStr = String(e);
        console.error("[FinanceAI] Migration de l'etat echouee:", e);
        let backupKey: string | null = null;
        try {
            const corruptedDump: Record<string, string | null> = {};
            const watchedPrefixes = ['app_', 'cached_', 'financeai-', 'fx_rates_', 'categorization_', 'initial_', 'lm_', 'gemini_'];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && watchedPrefixes.some(p => key.startsWith(p))) {
                    corruptedDump[key] = localStorage.getItem(key);
                }
            }
            backupKey = `__financeai_backup_${Date.now()}`;
            localStorage.setItem(backupKey, JSON.stringify({ error: errorStr, dump: corruptedDump }));
            console.warn(`[FinanceAI] Backup sauvegarde sous ${backupKey}`);
        } catch (backupErr) {
            console.error("[FinanceAI] Impossible de sauvegarder le backup:", backupErr);
            backupKey = null;
        }
        _migrationStatus = { failed: true, backupKey, error: errorStr };
        return defaultState;
    }
};

const initialState: AppState = getInitialStateWithMigration();

export const useFinanceStore = create<FinanceState>()(
    persist(
        (set) => ({
            ...initialState,
            activeTab: Tab.DASHBOARD,
            isPrivacyMode: false,
            lastProjection: null,
            pendingFocus: null,

            setActiveTab: (tab) => set({ activeTab: tab }),
            setPrivacyMode: (v) => set({ isPrivacyMode: v }),
            togglePrivacyMode: () => set((prev) => ({ isPrivacyMode: !prev.isPrivacyMode })),
            setAppState: (state) => set((prev) => ({ ...prev, ...state })),
            setLastProjection: (r) => set({ lastProjection: r }),
            navigateWithFocus: (tab, section) => set({
                activeTab: tab,
                pendingFocus: { tab, section: section ?? null, expiresAt: Date.now() + 5000 },
            }),
            clearPendingFocus: () => set({ pendingFocus: null }),
            updateFxRates: (rates) => set((prev) => ({
                fxRates: { ...prev.fxRates, ...rates }
            })),
            updateApiKeys: (keys) => set((prev) => ({
                apiKeys: { ...prev.apiKeys, ...keys }
            })),
            updateLastUpdate: () => set({ lastUpdate: Date.now() }),
            resetState: () => set(initialState),
        }),
        {
            name: 'financeai-storage',
            // Schema versioning: incrémenter à chaque changement non-rétrocompatible
            // de la forme du state, et ajouter une étape dans `migrate`.
            // Sans version, toute évolution casse silencieusement le boot des
            // utilisateurs existants (cf audit 2026-05 §State management).
            version: 2,
            migrate: (persistedState: unknown, fromVersion: number) => {
                let state = persistedState as Partial<FinanceState>;
                // v0/undefined → v1 : pas de transformation (intro versioning)
                if (fromVersion === undefined || fromVersion < 1) {
                    state = state as Partial<FinanceState>;
                }
                // v1 → v2 : Phase 4 A1 — ajout du champ apiKeys.anthropic.
                // Si l'utilisateur a une clé gemini mais pas anthropic, on
                // n'auto-copie PAS (clés API distinctes par provider).
                if (fromVersion < 2 && state?.apiKeys) {
                    state = {
                        ...state,
                        apiKeys: {
                            eraContext: state.apiKeys.eraContext || '',
                            gemini: state.apiKeys.gemini || '',
                            anthropic: state.apiKeys.anthropic || '',
                        },
                    };
                }
                return state;
            },
            partialize: (state) => {
                const { apiKeys, activeTab, isPrivacyMode, lastProjection, pendingFocus, ...persistable } = state;
                return persistable;
            },
        }
    )
);
