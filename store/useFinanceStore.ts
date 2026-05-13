import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AppState, Tab, BudgetCategory } from '../types';
import { INITIAL_BUDGET, INITIAL_CONFIG, INITIAL_PROJECTION, INITIAL_REAL_ESTATE_GOAL, INITIAL_CHILD_GOAL, DEFAULT_FX_RATES } from '../constants';

interface FinanceState extends AppState {
    activeTab: Tab;
    setActiveTab: (tab: Tab) => void;
    setAppState: (state: Partial<AppState>) => void;
    updateFxRates: (rates: { USD: number; EUR: number; CAD: number; lastFetched?: number }) => void;
    updateApiKeys: (keys: { lunchMoney: string; gemini: string }) => void;
    updateLastUpdate: () => void;
    resetState: () => void;
}

const migrateBudgetItems = (items: BudgetCategory[]): BudgetCategory[] => {
    return items.map(item => {
        const id = item.id || `cat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
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
    // Basic defaults
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
        apiKeys: { lunchMoney: '', gemini: '' },
        fxRates: DEFAULT_FX_RATES,
        lastUpdate: Date.now(),
        categorizationRules: [],
    };

    if (typeof window === 'undefined') return defaultState;

    try {
        // Read old keys
        const savedApiKeysStr = localStorage.getItem('app_api_keys');
        const legacyLm = localStorage.getItem('lm_token');
        const legacyGemini = localStorage.getItem('gemini_key');
        let safeApiKeys = { lunchMoney: legacyLm || '', gemini: legacyGemini || '' };
        if (savedApiKeysStr) {
            const parsed = JSON.parse(savedApiKeysStr);
            safeApiKeys = { lunchMoney: parsed.lunchMoney || safeApiKeys.lunchMoney, gemini: parsed.gemini || safeApiKeys.gemini };
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
        };
    } catch (e) {
        console.error("[FinanceAI] Migration de l'etat echouee:", e);
        // Phase 0 hardening: AVANT de retourner defaultState (qui ecraserait
        // potentiellement toutes les donnees utilisateur), on dump le
        // localStorage corrompu sous une cle de backup horodatee. Les donnees
        // restent recuperables manuellement si besoin.
        try {
            const corruptedDump: Record<string, string | null> = {};
            const watchedPrefixes = ['app_', 'cached_', 'financeai-', 'fx_rates_', 'categorization_', 'initial_', 'lm_', 'gemini_'];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && watchedPrefixes.some(p => key.startsWith(p))) {
                    corruptedDump[key] = localStorage.getItem(key);
                }
            }
            const backupKey = `__financeai_backup_${Date.now()}`;
            localStorage.setItem(backupKey, JSON.stringify({ error: String(e), dump: corruptedDump }));
            console.warn(`[FinanceAI] Backup des donnees corrompues sauvegarde sous la cle ${backupKey}. Donnees recuperables manuellement via DevTools > Application > Local Storage.`);
        } catch (backupErr) {
            console.error("[FinanceAI] Impossible de sauvegarder le backup:", backupErr);
        }
        return defaultState;
    }
};

const initialState: AppState = getInitialStateWithMigration();

export const useFinanceStore = create<FinanceState>()(
    persist(
        (set) => ({
            ...initialState,
            activeTab: Tab.DASHBOARD,

            setActiveTab: (tab) => set({ activeTab: tab }),
            setAppState: (state) => set((prev) => ({ ...prev, ...state })),
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
            name: 'financeai-storage', // unique name
            // By default, it uses localStorage. We can optionally configure parts to save/exclude
        }
    )
);
