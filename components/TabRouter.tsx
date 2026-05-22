import React, { Suspense } from 'react';
import { Tab, AppState } from '../types';
import { ErrorBoundary } from './ui/ErrorBoundary';
// P1 fix — wrap React.lazy avec retry + reload sur chunk-load-error
// (cf hubperso.com regression : "Failed to fetch dynamically imported module")
import { lazyWithRetry } from '../utils/lazyWithRetry';

const Dashboard = lazyWithRetry(() => import('./Dashboard').then(m => ({ default: m.Dashboard })), 'Dashboard');
const Transactions = lazyWithRetry(() => import('./Transactions').then(m => ({ default: m.Transactions })), 'Transactions');
const Budget = lazyWithRetry(() => import('./Budget').then(m => ({ default: m.Budget })), 'Budget');
const Planning = lazyWithRetry(() => import('./Planning').then(m => ({ default: m.Planning })), 'Planning');
const Investments = lazyWithRetry(() => import('./Investments').then(m => ({ default: m.Investments })), 'Investments');
const RealEstate = lazyWithRetry(() => import('./RealEstate').then(m => ({ default: m.RealEstate })), 'RealEstate');
const ChildPlanning = lazyWithRetry(() => import('./ChildPlanning').then(m => ({ default: m.ChildPlanning })), 'ChildPlanning');
const LifeProjects = lazyWithRetry(() => import('./LifeProjects').then(m => ({ default: m.LifeProjects })), 'LifeProjects');
const Documents = lazyWithRetry(() => import('./Documents').then(m => ({ default: m.Documents })), 'Documents');
const Retirement = lazyWithRetry(() => import('./Retirement').then(m => ({ default: m.Retirement })), 'Retirement');
const TaxCenter = lazyWithRetry(() => import('./TaxCenter').then(m => ({ default: m.TaxCenter })), 'TaxCenter');
const Settings = lazyWithRetry(() => import('./Settings').then(m => ({ default: m.Settings })), 'Settings');
const JsonDataView = lazyWithRetry(() => import('./JsonDataView').then(m => ({ default: m.JsonDataView })), 'JsonDataView');
const AiAssistant = lazyWithRetry(() => import('./AiAssistant').then(m => ({ default: m.AiAssistant })), 'AiAssistant');
const FutureProjection = lazyWithRetry(() => import('./FutureProjection').then(m => ({ default: m.FutureProjection })), 'FutureProjection');
const DebtManager = lazyWithRetry(() => import('./DebtManager').then(m => ({ default: m.DebtManager })), 'DebtManager');
const SystemView = lazyWithRetry(() => import('./SystemView').then(m => ({ default: m.SystemView })), 'SystemView');

const TAB_LABELS: Record<Tab, string> = {
    [Tab.DASHBOARD]: 'Accueil',
    [Tab.TRANSACTIONS]: 'Transactions',
    [Tab.BUDGET]: 'Budget',
    [Tab.PLANNING]: 'Planif. & Abos',
    [Tab.DEBT]: 'Dettes',
    [Tab.INVESTMENTS]: 'Investissements',
    [Tab.FUTURE]: 'Futur',
    [Tab.REAL_ESTATE]: 'Immobilier',
    [Tab.CHILD]: 'Enfant',
    [Tab.TRAVEL]: 'Voyages',
    [Tab.LIFE_EVENTS]: 'Parcours de Vie',
    [Tab.LIFE_PROJECTS]: 'Projets de vie',
    [Tab.DOCUMENTS]: 'Documents',
    [Tab.RETIREMENT]: 'Retraite',
    [Tab.TAX]: 'Impôts & Docs',
    [Tab.DATA]: 'Data',
    [Tab.SETTINGS]: 'Paramètres',
    [Tab.SYSTEM]: 'Système',
    [Tab.ASSISTANT]: 'Assistant IA',
};

const TabLoader: React.FC = () => (
    <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-primary border-t-transparent" />
    </div>
);

export interface TabRouterProps {
    activeTab: Tab;
    state: AppState;
    setAppState: (partial: Partial<AppState>) => void;
    setActiveTab: (tab: Tab) => void;
    isPrivacyMode: boolean;
    isLoading: boolean;
    globalNetWorth: number;
    calculatedMonthlySavings: number;
    assetBreakdown: { reer: number; celi: number; reee: number; nonReg: number };
    currentLiquidity: number;
    onSyncEra: () => void;
    onUpdateApiKeys: (keys: AppState['apiKeys']) => void;
    onManualImport: (rawData: string) => void;
}

/**
 * Phase 3B — Extrait le routing par tab de App.tsx.
 *
 * Tous les `activeTab === Tab.X && <Component />` JSX déménagent ici.
 * Réduit App.tsx de ~400L à ~250L et centralise le câblage des props
 * pour chaque page.
 */
export const TabRouter: React.FC<TabRouterProps> = ({
    activeTab, state, setAppState, setActiveTab, isPrivacyMode, isLoading,
    globalNetWorth, calculatedMonthlySavings, assetBreakdown, currentLiquidity,
    onSyncEra, onUpdateApiKeys, onManualImport,
}) => {
    return (
        <Suspense fallback={<TabLoader />}>
            <ErrorBoundary resetKey={activeTab} label={TAB_LABELS[activeTab]}>
                {activeTab === Tab.DASHBOARD && (
                    <Dashboard
                        transactions={state.transactions}
                        assets={state.assets}
                        initialBalances={state.initialBalances}
                        budgetItems={state.budgetItems}
                        realEstateGoals={state.realEstateGoals}
                        childGoals={state.childGoals || []}
                        travelGoals={state.travelGoals}
                        lifeEvents={state.lifeEvents}
                        retirementGoal={state.retirementGoal}
                        debts={state.debts}
                        config={state.config}
                        apiKey={state.apiKeys.anthropic}
                        calculatedMonthlySavings={calculatedMonthlySavings}
                        onNavigate={setActiveTab}
                        isPrivacyMode={isPrivacyMode}
                    />
                )}

                {activeTab === Tab.TRANSACTIONS && (
                    <Transactions
                        transactions={state.transactions}
                        setTransactions={(t) => setAppState({ transactions: typeof t === 'function' ? (t as any)(state.transactions) : t })}
                        apiKey={state.apiKeys.anthropic}
                        onSyncEraContext={onSyncEra}
                        isSyncing={isLoading}
                        budgetItems={state.budgetItems}
                        categorizationRules={state.categorizationRules || []}
                        setCategorizationRules={(rules) => setAppState({ categorizationRules: rules })}
                    />
                )}

                {activeTab === Tab.BUDGET && (
                    <Budget
                        transactions={state.transactions}
                        config={state.config}
                        budgetItems={state.budgetItems}
                        setBudgetItems={(items) => setAppState({ budgetItems: items })}
                        apiKey={state.apiKeys.anthropic}
                    />
                )}

                {/* Phase G.5 — préparation architecturale : Dettes et Planning sont des
                    candidats à la fusion en sous-onglets de Transactions (doc directives §10).
                    Pour l'instant : tabs séparés, mais la possibilité est documentée. */}
                {activeTab === Tab.PLANNING && (
                    <Planning
                        transactions={state.transactions}
                        savingsGoals={state.savingsGoals}
                        setSavingsGoals={(goals) => setAppState({ savingsGoals: goals })}
                        apiKey={state.apiKeys.anthropic}
                        budgetItems={state.budgetItems}
                        setBudgetItems={(items) => setAppState({ budgetItems: items })}
                        config={state.config}
                    />
                )}

                {activeTab === Tab.DEBT && (
                    <DebtManager debts={state.debts} setDebts={(d) => setAppState({ debts: d })} />
                )}

                {activeTab === Tab.INVESTMENTS && (
                    <Investments
                        assets={state.assets} setAssets={(a) => setAppState({ assets: a })}
                        investmentAccounts={state.investmentAccounts}
                        setInvestmentAccounts={(accs) => setAppState({ investmentAccounts: accs })}
                        investmentTransactions={state.investmentTransactions}
                        setInvestmentTransactions={(txs) => setAppState({ investmentTransactions: txs })}
                        apiKey={state.apiKeys.anthropic}
                        transactions={state.transactions}
                        budgetItems={state.budgetItems}
                        config={state.config}
                        projection={state.projection}
                        setProjection={(p) => setAppState({ projection: p })}
                    />
                )}

                {activeTab === Tab.TAX && (
                    <TaxCenter
                        config={state.config} setConfig={(c) => setAppState({ config: c })}
                        assets={state.assets} apiKey={state.apiKeys.anthropic}
                    />
                )}

                {activeTab === Tab.REAL_ESTATE && (
                    <RealEstate
                        availableCash={globalNetWorth - state.assets.reduce((sum, a) => sum + (a.quantity * a.currentPrice * (state.fxRates[a.currency] || 1)), 0)}
                        goals={state.realEstateGoals}
                        setGoals={(g) => setAppState({ realEstateGoals: g })}
                    />
                )}

                {activeTab === Tab.FUTURE && (
                    <FutureProjection
                        assets={state.assets}
                        initialBalances={state.initialBalances}
                        transactions={state.transactions}
                        budgetItems={state.budgetItems}
                        config={state.config}
                        realEstateGoals={state.realEstateGoals}
                        setRealEstateGoals={(g) => setAppState({ realEstateGoals: g })}
                        childGoals={state.childGoals || []}
                        setChildGoals={(g) => setAppState({ childGoals: g })}
                        travelGoals={state.travelGoals}
                        lifeEvents={state.lifeEvents}
                        debts={state.debts}
                        retirementGoal={state.retirementGoal}
                        calculatedMonthlySavings={calculatedMonthlySavings}
                        projection={state.projection}
                        setProjection={(p) => setAppState({ projection: p })}
                        financialGoals={state.financialGoals}
                        isPrivacyMode={isPrivacyMode}
                    />
                )}

                {activeTab === Tab.CHILD && (
                    <ChildPlanning
                        goals={state.childGoals || []}
                        setGoals={(g) => setAppState({ childGoals: g })}
                        projection={state.projection}
                        currentRESP={assetBreakdown.reee}
                    />
                )}

                {/* Phase F.12 — Tab.TRAVEL et Tab.LIFE_EVENTS forwardent vers le nouvel onglet unifié */}
                {(activeTab === Tab.LIFE_PROJECTS || activeTab === Tab.TRAVEL || activeTab === Tab.LIFE_EVENTS) && (
                    <LifeProjects
                        travelGoals={state.travelGoals}
                        setTravelGoals={(g) => setAppState({ travelGoals: g })}
                        lifeEvents={state.lifeEvents}
                        setLifeEvents={(e) => setAppState({ lifeEvents: e })}
                        netWorth={globalNetWorth}
                        returnRate={state.projection.returnRate}
                    />
                )}

                {activeTab === Tab.RETIREMENT && (
                    <Retirement
                        goal={state.retirementGoal} setGoal={(g) => setAppState({ retirementGoal: g })}
                        currentREER={assetBreakdown.reer} currentCELI={assetBreakdown.celi} currentNonReg={assetBreakdown.nonReg}
                        calculatedMonthlySavings={calculatedMonthlySavings}
                        grossIncome={state.config.users.reduce((acc, u) => acc + (u.grossSalary || u.salary || 0), 0)}
                        projection={state.projection}
                        config={state.config}
                        assets={state.assets}
                        initialBalances={state.initialBalances}
                        budgetItems={state.budgetItems}
                        realEstateGoals={state.realEstateGoals}
                        childGoals={state.childGoals || []}
                        travelGoals={state.travelGoals}
                        lifeEvents={state.lifeEvents}
                        debts={state.debts}
                    />
                )}

                {activeTab === Tab.DOCUMENTS && <Documents />}
                {activeTab === Tab.DATA && <JsonDataView />}
                {activeTab === Tab.SYSTEM && <SystemView state={state} />}

                {activeTab === Tab.SETTINGS && (
                    <Settings
                        apiKeys={state.apiKeys} setApiKeys={onUpdateApiKeys}
                        config={state.config} setConfig={(c) => setAppState({ config: c })}
                        budgetItems={state.budgetItems}
                        onImportData={onManualImport}
                        initialBalances={state.initialBalances} setInitialBalances={(b) => setAppState({ initialBalances: b })}
                        transactions={state.transactions} setTransactions={(t) => setAppState({ transactions: t })}
                        assets={state.assets}
                        savingsGoals={state.savingsGoals}
                        travelGoals={state.travelGoals}
                        debts={state.debts}
                        investmentAccounts={state.investmentAccounts} investmentTransactions={state.investmentTransactions}
                        lifeEvents={state.lifeEvents} retirementGoal={state.retirementGoal}
                        realEstateGoals={state.realEstateGoals}
                        setRealEstateGoals={(g) => setAppState({ realEstateGoals: g })}
                        childGoal={state.childGoal} childGoals={state.childGoals || []} financialGoals={state.financialGoals}
                    />
                )}

                {activeTab === Tab.ASSISTANT && (
                    <AiAssistant
                        // Phase 4 A5: clé Anthropic Claude (Gemini retiré)
                        apiKey={state.apiKeys.anthropic}
                        transactions={state.transactions}
                        budgetItems={state.budgetItems}
                        assets={state.assets}
                        projection={state.projection}
                        realEstateGoal={state.realEstateGoals[0]}
                        config={state.config}
                        initialBalances={state.initialBalances}
                    />
                )}
            </ErrorBoundary>
        </Suspense>
    );
};
