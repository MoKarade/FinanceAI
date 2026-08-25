import React, { Suspense } from 'react';
import { Tab, AppState, Transaction } from '../types';
import { TAB_LABELS } from '../constants';
import { ErrorBoundary } from './ui/ErrorBoundary';
// P1 fix — wrap React.lazy avec retry + reload sur chunk-load-error
// (cf hubperso.com regression : "Failed to fetch dynamically imported module")
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { PageSetupGate } from './setup/PageSetupGate';
// [REFONTE-NAV-L2a] Bannière « import bancaire figé » : vivait sur l'ex-Accueil (leçon incident
// 2026-08-05 : une alerte doit être là où l'utilisateur regarde PAR DÉFAUT = désormais le Futur).
// Import statique : store + syncHealth + Icon, rien de lourd ; elle se tait d'elle-même (région
// live vide) quand tout va bien.
import { SyncStaleBanner } from './dashboard/SyncStaleBanner';
// [PERF panel #601, mesuré +17,3 KB] FutureKpiStrip importe useNetWorthVariation →
// usePortfolioHistory → buildMarketData : son import STATIQUE ici tirait tout ça dans le chunk
// de BOOT (leçon CLAUDE.md « hoister un import au niveau App »). Lazy comme les pages ;
// fallback `null` (bandeau léger, un skeleton flasherait plus qu'il n'aiderait).
const FutureKpiStrip = lazyWithRetry(() => import('./FutureKpiStrip').then(m => ({ default: m.FutureKpiStrip })), 'FutureKpiStrip');

// [REFONTE-NAV Lot 1] Dashboard (Accueil) retiré de la nav — ses chiffres de tête vivent dans
// FutureKpiStrip (le composant Dashboard.tsx reste sur disque : le Lot 2 y puisera le reste).
const Transactions = lazyWithRetry(() => import('./Transactions').then(m => ({ default: m.Transactions })), 'Transactions');
// G22-N3 — Budget + Planif/Abos fusionnés en sous-onglets via BudgetWorkspace.
const BudgetWorkspace = lazyWithRetry(() => import('./budget/BudgetWorkspace').then(m => ({ default: m.BudgetWorkspace })), 'BudgetWorkspace');
const Investments = lazyWithRetry(() => import('./Investments').then(m => ({ default: m.Investments })), 'Investments');
const RealEstate = lazyWithRetry(() => import('./RealEstate').then(m => ({ default: m.RealEstate })), 'RealEstate');
// [REFONTE-NAV-L3] Projets d'achat FUTURS (destination Vie) — même tranche realEstateGoals,
// partitionnée côté UI (l'ACTUEL reste sous Tab.REAL_ESTATE, destination Config).
const RealEstateProjects = lazyWithRetry(() => import('./life/RealEstateProjects').then(m => ({ default: m.RealEstateProjects })), 'RealEstateProjects');
const ChildPlanning = lazyWithRetry(() => import('./ChildPlanning').then(m => ({ default: m.ChildPlanning })), 'ChildPlanning');
const LifeProjects = lazyWithRetry(() => import('./LifeProjects').then(m => ({ default: m.LifeProjects })), 'LifeProjects');
const Retirement = lazyWithRetry(() => import('./Retirement').then(m => ({ default: m.Retirement })), 'Retirement');
const TaxCenter = lazyWithRetry(() => import('./TaxCenter').then(m => ({ default: m.TaxCenter })), 'TaxCenter');
const Settings = lazyWithRetry(() => import('./Settings').then(m => ({ default: m.Settings })), 'Settings');
const Profile = lazyWithRetry(() => import('./Profile').then(m => ({ default: m.Profile })), 'Profile');
const AiAssistant = lazyWithRetry(() => import('./AiAssistant').then(m => ({ default: m.AiAssistant })), 'AiAssistant');
// NBA-PAGE — « Prochaine action » en page dédiée (même composant que l'ex-widget, mode asPage).
const FutureProjection = lazyWithRetry(() => import('./FutureProjection').then(m => ({ default: m.FutureProjection })), 'FutureProjection');
const DebtManager = lazyWithRetry(() => import('./DebtManager').then(m => ({ default: m.DebtManager })), 'DebtManager');
// G22-N5 — SystemView n'est plus une route top-level : fusionné dans Settings
// (sous-onglet « Système & diagnostics »).

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
    // [REFONTE-NAV Lot 1] setActiveTab n'a plus de consommateur ici (seul l'ex-Accueil
    // naviguait) — gardé dans l'interface pour App, préfixé le temps du Lot 2.
    activeTab, state, setAppState, setActiveTab: _setActiveTab, isPrivacyMode, isLoading: _isLoading,
    globalNetWorth, calculatedMonthlySavings, assetBreakdown, currentLiquidity,
    onUpdateApiKeys, onManualImport,
}) => {
    return (
        <Suspense fallback={<TabLoader />}>
            <ErrorBoundary resetKey={activeTab} label={TAB_LABELS[activeTab]}>
                {/* ANIM — fondu d'entrée à chaque changement d'onglet (opacité pure, key=tab). */}
                <div key={activeTab} className="animate-tab-in motion-reduce:animate-none">
                {activeTab === Tab.TRANSACTIONS && (
                    <PageSetupGate tab={Tab.TRANSACTIONS}>
                        <Transactions
                            transactions={state.transactions}
                            setTransactions={(t) => setAppState({ transactions: typeof t === 'function' ? (t as (prev: Transaction[]) => Transaction[])(state.transactions) : t })}
                            apiKey={state.apiKeys.anthropic}
                            budgetItems={state.budgetItems}
                            categorizationRules={state.categorizationRules || []}
                            setCategorizationRules={(rules) => setAppState({ categorizationRules: rules })}
                            onImport={onManualImport}
                        />
                    </PageSetupGate>
                )}

                {activeTab === Tab.BUDGET && (
                    <PageSetupGate tab={Tab.BUDGET}>
                        <BudgetWorkspace
                            transactions={state.transactions}
                            config={state.config}
                            budgetItems={state.budgetItems}
                            setBudgetItems={(items) => setAppState({ budgetItems: items })}
                            apiKey={state.apiKeys.anthropic}
                            savingsGoals={state.savingsGoals}
                            setSavingsGoals={(goals) => setAppState({ savingsGoals: goals })}
                        />
                    </PageSetupGate>
                )}

                {activeTab === Tab.DEBT && (
                    <PageSetupGate tab={Tab.DEBT}>
                        <DebtManager debts={state.debts} setDebts={(d) => setAppState({ debts: d })} />
                    </PageSetupGate>
                )}

                {activeTab === Tab.INVESTMENTS && (
                    <PageSetupGate tab={Tab.INVESTMENTS}>
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
                    </PageSetupGate>
                )}

                {activeTab === Tab.TAX && (
                    <PageSetupGate tab={Tab.TAX}>
                        <TaxCenter
                            config={state.config}
                            assets={state.assets} apiKey={state.apiKeys.anthropic}
                        />
                    </PageSetupGate>
                )}

                {activeTab === Tab.REAL_ESTATE && (
                    <PageSetupGate tab={Tab.REAL_ESTATE}>
                        <RealEstate
                            /* [NW-UI-DEBT] mise de fonds = LIQUIDITÉ (pas NW − placements : depuis que
                               globalNetWorth soustrait les dettes, cette dérivation donnait cash − dettes).
                               currentLiquidity est la valeur juste, déjà dérivée. */
                            availableCash={currentLiquidity}
                            goals={state.realEstateGoals}
                            setGoals={(g) => setAppState({ realEstateGoals: g })}
                        />
                    </PageSetupGate>
                )}

                {activeTab === Tab.REAL_ESTATE_PROJECTS && (
                    <PageSetupGate tab={Tab.REAL_ESTATE_PROJECTS}>
                        <RealEstateProjects
                            availableCash={currentLiquidity}
                            goals={state.realEstateGoals}
                            setGoals={(g) => setAppState({ realEstateGoals: g })}
                        />
                    </PageSetupGate>
                )}

                {activeTab === Tab.FUTURE && (
                    <PageSetupGate tab={Tab.FUTURE}>
                        {/* [REFONTE-NAV-L2a] L'alerte de fraîcheur d'import AU-DESSUS des KPI :
                            des chiffres calculés sur un flux gelé se lisent AVEC l'avertissement. */}
                        <SyncStaleBanner />
                        {/* [REFONTE-NAV Lot 1] Chiffres de tête de l'ex-Accueil, compacts au-dessus
                            de la courbe. Suspense DÉDIÉ (fallback null) : le bandeau qui charge ne
                            doit pas remplacer toute la page par le spinner du Suspense parent. */}
                        <Suspense fallback={null}>
                            <FutureKpiStrip
                                netWorth={globalNetWorth}
                                liquidity={currentLiquidity}
                                monthlySavings={calculatedMonthlySavings}
                            />
                        </Suspense>
                        <FutureProjection
                            initialBalances={state.initialBalances}
                            transactions={state.transactions}
                            budgetItems={state.budgetItems}
                            config={state.config}
                            realEstateGoals={state.realEstateGoals}
                            setRealEstateGoals={(g) => setAppState({ realEstateGoals: g })}
                            retirementGoal={state.retirementGoal}
                            setRetirementGoal={(g) => setAppState({ retirementGoal: g })}
                            calculatedMonthlySavings={calculatedMonthlySavings}
                            projection={state.projection}
                            setProjection={(p) => setAppState({ projection: p })}
                            isPrivacyMode={isPrivacyMode}
                        />
                    </PageSetupGate>
                )}

                {activeTab === Tab.CHILD && (
                    <PageSetupGate tab={Tab.CHILD}>
                        <ChildPlanning
                            goals={state.childGoals || []}
                            setGoals={(g) => setAppState({ childGoals: g })}
                            projection={state.projection}
                            currentRESP={assetBreakdown.reee}
                        />
                    </PageSetupGate>
                )}

                {/* Phase F.12 — Tab.TRAVEL et Tab.LIFE_EVENTS forwardent vers le nouvel onglet unifié */}
                {(activeTab === Tab.LIFE_PROJECTS || activeTab === Tab.TRAVEL || activeTab === Tab.LIFE_EVENTS) && (
                    <PageSetupGate tab={Tab.LIFE_PROJECTS}>
                        <LifeProjects
                            travelGoals={state.travelGoals}
                            setTravelGoals={(g) => setAppState({ travelGoals: g })}
                            lifeEvents={state.lifeEvents}
                            setLifeEvents={(e) => setAppState({ lifeEvents: e })}
                            netWorth={globalNetWorth}
                            returnRate={state.projection.returnRate}
                        />
                    </PageSetupGate>
                )}

                {activeTab === Tab.RETIREMENT && (
                    <PageSetupGate tab={Tab.RETIREMENT}>
                        <Retirement
                            goal={state.retirementGoal}
                            currentREER={assetBreakdown.reer} currentCELI={assetBreakdown.celi} currentNonReg={assetBreakdown.nonReg}
                            calculatedMonthlySavings={calculatedMonthlySavings}
                            projection={state.projection}
                            config={state.config}
                            initialBalances={state.initialBalances}
                            budgetItems={state.budgetItems}
                            realEstateGoals={state.realEstateGoals}
                            childGoals={state.childGoals || []}
                            travelGoals={state.travelGoals}
                            lifeEvents={state.lifeEvents}
                            debts={state.debts}
                        />
                    </PageSetupGate>
                )}

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
                        appState={state}
                    />
                )}

                {activeTab === Tab.PROFILE && (
                    <Profile />
                )}

                {activeTab === Tab.ASSISTANT && (
                    <PageSetupGate tab={Tab.ASSISTANT}>
                        {/* [AITOOLS-E] L'onglet rend la conversation partagée (variant tab) via le
                            context AiChatProvider (monté App) — même instance que le panneau global. */}
                        <AiAssistant />
                    </PageSetupGate>
                )}
                </div>
            </ErrorBoundary>
        </Suspense>
    );
};
