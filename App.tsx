import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Transactions } from './components/Transactions';
import { Budget } from './components/Budget';
import { Planning } from './components/Planning';
import { Investments } from './components/Investments';
import { RealEstate } from './components/RealEstate';
import { ChildPlanning } from './components/ChildPlanning';
import { Travel } from './components/Travel';
import { LifeEvents } from './components/LifeEvents';
import { Retirement } from './components/Retirement';
import { TaxCenter } from './components/TaxCenter';
import { Settings } from './components/Settings';
import { JsonDataView } from './components/JsonDataView';
import { AiAssistant } from './components/AiAssistant';
import { FutureProjection } from './components/FutureProjection';
import { DebtManager } from './components/DebtManager';
import { SystemView } from './components/SystemView';
import { GuideModal } from './components/GuideModal';
import { Onboarding } from './components/Onboarding';
import { ToastContainer, showToast } from './components/ui/Toast';
import { Tab, AppState, Transaction, BudgetCategory } from './types';
import { fetchTransactions } from './services/lunchMoney';
import { INITIAL_CHILD_GOAL } from './constants';
import { parseTransactions, markDuplicates } from './utils/transactionParser';
import { fetchAssetHistory, fetchFxRates } from './services/finance';
import { calculateGrossFromNet } from './services/tax';
import { generateFinancialReport } from './services/pdfReport';
import { useFinanceStore, getMigrationStatus } from './store/useFinanceStore';

export const App: React.FC = () => {
    const state = useFinanceStore();
    const setAppState = state.setAppState;
    const activeTab = state.activeTab;
    const setActiveTab = state.setActiveTab;

    const [isLoading, setIsLoading] = useState(false);
    const [isPrivacyMode, setIsPrivacyMode] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const isHydrated = useRef(false);

    // Phase silent-failure-hunter #8 : detecter et signaler la datapocalypse
    // silencieuse. Si getInitialStateWithMigration a echoue au mount,
    // l'app retourne defaultState mais le backup des donnees corrompues
    // est sauvegarde sous __financeai_backup_<ts>. On previent l'utilisateur
    // via un toast d'urgence pour qu'il puisse recuperer ses donnees.
    const migrationWarningShown = useRef(false);
    useEffect(() => {
        if (migrationWarningShown.current) return;
        const status = getMigrationStatus();
        if (status.failed) {
            migrationWarningShown.current = true;
            const backupHint = status.backupKey
                ? `Backup sauvegarde sous la cle ${status.backupKey} (F12 -> Application -> Local Storage).`
                : 'Aucun backup recuperable.';
            showToast(
                `[CRITIQUE] Etat corrompu detecte au demarrage. ${backupHint} Vos donnees actuelles sont vides ou par defaut.`,
                'error'
            );
            console.error('[FinanceAI] Migration failure:', status);
        }
    }, []);

    useEffect(() => {
        const handleHashChange = () => {
            const hash = window.location.hash.replace('#', '');
            if (Object.values(Tab).includes(hash as Tab) && hash !== activeTab) {
                setActiveTab(hash as Tab);
            }
        };
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, [activeTab, setActiveTab]);

    useEffect(() => {
        const tabNames: Record<Tab, string> = {
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
            [Tab.RETIREMENT]: 'Retraite',
            [Tab.TAX]: 'Impôts & Docs',
            [Tab.DATA]: 'Data',
            [Tab.SETTINGS]: 'Paramètres',
            [Tab.SYSTEM]: 'Système',
            [Tab.ASSISTANT]: 'Assistant IA'
        };
        document.title = `FinanceAI - ${tabNames[activeTab] || 'Pro'}`;
    }, [activeTab]);

    const handleSetTab = (tab: Tab) => {
        setActiveTab(tab);
        window.location.hash = tab;
    };

    const [isFirstLaunch, setIsFirstLaunch] = useState<boolean>(() => {
        try {
            const hasBeenConfigured = localStorage.getItem('app_onboarding_done');
            return hasBeenConfigured !== 'true';
        } catch (err) {
            console.error("Hydration error:", err);
            return true;
        }
    });

    useEffect(() => { isHydrated.current = true; }, []);

    useEffect(() => {
        if (!state.childGoals || state.childGoals.length === 0) {
            if (state.childGoal) {
                setAppState({
                    childGoals: [{ ...state.childGoal, id: 'child_1', name: 'Enfant 1' }],
                    childGoal: undefined
                });
            } else {
                setAppState({
                    childGoals: [{ ...INITIAL_CHILD_GOAL, id: 'child_1', name: 'Enfant 1' }]
                });
            }
        }
    }, [state.childGoal, state.childGoals, setAppState]);

    useEffect(() => {
        const updateFxRates = async () => {
            try {
                const rates = await fetchFxRates();
                if (state.fxRates.USD !== rates.USD || state.fxRates.EUR !== rates.EUR) {
                    state.updateFxRates(rates);
                }
            } catch (e) {
                console.warn('Impossible de mettre a jour les taux FX:', e);
            }
        };
        updateFxRates();
    }, []);

    const baseGrossAnnual = useMemo(() => state.config.users.reduce((sum, u) => {
        if (u.grossSalary) return sum + (u.grossSalary * 12);
        const netAnnual = (u.netSalary || u.salary || 0) * 12;
        return sum + calculateGrossFromNet(netAnnual);
    }, 0), [state.config]);

    useEffect(() => {
        if (state.apiKeys.lunchMoney && state.transactions.length === 0) {
            loadData(state.apiKeys.lunchMoney);
        }
    }, [state.apiKeys.lunchMoney]);

    useEffect(() => {
        let cancelled = false;
        const hydrateAssets = async () => {
            const updates = new Map();
            let changed = false;

            for (const asset of state.assets) {
                if (cancelled) return;
                if (!asset.priceHistory || asset.priceHistory.length === 0) {
                    try {
                        const { history, fromCache } = await fetchAssetHistory(
                            asset.symbol,
                            asset.currency,
                            asset.currentPrice,
                            asset.performance
                        );
                        if (cancelled) return;
                        if (history && history.length > 0) {
                            updates.set(asset.symbol, history);
                            changed = true;
                        }
                        if (!fromCache) await new Promise(r => setTimeout(r, 2500));
                    } catch (e) {
                        console.warn('[FinanceAI] hydrateAssets failed for', asset.symbol, e);
                    }
                }
            }

            if (!cancelled && changed) {
                setAppState({
                    assets: state.assets.map(a => updates.has(a.symbol) ? { ...a, priceHistory: updates.get(a.symbol) } : a)
                });
            }
        };
        hydrateAssets();
        return () => { cancelled = true; };
    }, []);

    const loadData = async (token: string, pendingState?: AppState) => {
        if (!token) return;
        setIsLoading(true);
        try {
            const currentState = pendingState || state;
            let startDateToFetch: string | undefined = undefined;

            if (currentState.transactions.length > 0) {
                const sorted = [...currentState.transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                const latestTx = sorted[0];
                if (latestTx && latestTx.date) {
                    const d = new Date(latestTx.date);
                    d.setDate(d.getDate() - 7);
                    startDateToFetch = d.toISOString().split('T')[0];
                }
            } else {
                startDateToFetch = '2000-01-01';
            }

            const newTxs = await fetchTransactions(token, startDateToFetch || '2000-01-01');

            if (newTxs.length === 0) {
                setIsLoading(false);
                return;
            }

            const base = pendingState || state;
            const existingTxMap = new Map<number, Transaction>(base.transactions.map(t => [t.id, t]));
            const mergedList = [...base.transactions];

            newTxs.forEach(fetchedTx => {
                if (existingTxMap.has(fetchedTx.id)) {
                    const existing = existingTxMap.get(fetchedTx.id)!;
                    const idx = mergedList.findIndex(t => t.id === fetchedTx.id);
                    if (idx !== -1) {
                        mergedList[idx] = {
                            ...fetchedTx,
                            category: (existing.category !== 'Uncategorized' && existing.category !== 'Autre' && existing.category !== 'Inconnu') ? existing.category : fetchedTx.category,
                            payee: existing.payee,
                            status: existing.status && existing.status !== 'pending' ? existing.status : fetchedTx.status,
                            isAiProcessed: existing.isAiProcessed,
                            isVerified: existing.isVerified,
                            isTransfer: existing.isTransfer,
                            isDuplicate: existing.isDuplicate,
                            originalCategory: fetchedTx.category
                        };
                    }
                } else {
                    mergedList.push(fetchedTx);
                }
            });

            const deduplicatedList = markDuplicates(mergedList);

            let balances = { ...base.initialBalances };
            if (Object.keys(balances).length === 0) {
                const accs = Array.from(new Set(deduplicatedList.map(t => t.accountName)));
                accs.forEach(acc => {
                    if (acc && (acc.toLowerCase().includes('courant') || acc.toLowerCase().includes('checking'))) {
                        balances[acc] = 2000;
                    } else if (acc) {
                        balances[acc] = 0;
                    }
                });
            }

            setAppState({
                transactions: deduplicatedList,
                initialBalances: balances,
                lastUpdate: Date.now()
            });
            showToast('Donnees synchronisees', 'success');
        } catch (e: any) {
            console.error('[FinanceAI] Sync Error:', e);
            showToast(e?.message ? `Sync echouee : ${e.message}` : 'Erreur de synchronisation LunchMoney.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateApiKeys = (keys: AppState['apiKeys']) => {
        state.updateApiKeys(keys);
        if (keys.lunchMoney !== state.apiKeys.lunchMoney && keys.lunchMoney) {
            loadData(keys.lunchMoney, undefined);
        }
    };

    const handleManualImport = (rawData: string) => {
        const parsed = parseTransactions(rawData);
        const combined = [...parsed, ...state.transactions];
        const deduped = markDuplicates(combined);
        setAppState({ transactions: deduped, lastUpdate: Date.now() });
        showToast(`${deduped.length} transactions importees`, 'success');
    };

    const globalNetWorth = useMemo(() => {
        let cash = 0;
        (Object.values(state.initialBalances) as number[]).forEach(v => cash += v);
        state.transactions.forEach((t: Transaction) => {
            if (!t.isDuplicate && !t.isTransfer) cash += t.amount;
        });
        const investments = state.assets.reduce((sum, a) => sum + (a.quantity * a.currentPrice * (state.fxRates[a.currency] || 1)), 0);
        return cash + investments;
    }, [state.initialBalances, state.transactions, state.assets]);

    const { calculatedMonthlySavings } = useMemo(() => {
        const income = state.config.users.reduce((acc, u) => acc + (u.netSalary || u.salary || 0), 0);
        const budgetExp = state.budgetItems.reduce((acc, item) => {
            if (item.nature === 'Epargne') return acc;
            let amount = item.target;
            if (item.frequency === 'Yearly') amount /= 12;
            if (item.frequency === 'Quarterly') amount /= 3;
            if (item.frequency === 'Weekly') amount *= 4.33;
            return acc + amount;
        }, 0);
        return {
            calculatedMonthlySavings: Math.max(0, income - budgetExp)
        };
    }, [state.config, state.budgetItems]);

    const assetBreakdown = useMemo(() => {
        let reer = 0;
        let celi = 0;
        let reee = 0;
        let nonReg = 0;
        state.assets.forEach(a => {
            const val = a.quantity * a.currentPrice * (state.fxRates[a.currency] || 1);
            if (a.accountType === 'REER') reer += val;
            else if (a.accountType === 'CELI') celi += val;
            else nonReg += val;
        });
        return { reer, celi, reee, nonReg };
    }, [state.assets]);

    const currentLiquidity = useMemo(() => {
        let cash = 0;
        (Object.values(state.initialBalances) as number[]).forEach(v => cash += v);
        state.transactions.forEach((t: Transaction) => {
            if (!t.isDuplicate && !t.isTransfer) cash += t.amount;
        });
        return cash;
    }, [state.initialBalances, state.transactions]);

    return (
        <div>
            {isFirstLaunch && (
                <Onboarding onComplete={(data) => {
                    setAppState({ ...data, lastUpdate: Date.now() });
                    localStorage.setItem('app_onboarding_done', 'true');
                    setIsFirstLaunch(false);
                    if (data.apiKeys?.lunchMoney) {
                        setTimeout(() => loadData(data.apiKeys!.lunchMoney), 500);
                    }
                }} />
            )}
            <Layout
                activeTab={activeTab}
                setActiveTab={handleSetTab}
                lastUpdate={state.lastUpdate}
                onRefresh={() => {
                    loadData(state.apiKeys.lunchMoney);
                    window.dispatchEvent(new Event('resize'));
                }}
                isLoading={isLoading}
                isPrivacyMode={isPrivacyMode}
                togglePrivacyMode={() => setIsPrivacyMode(!isPrivacyMode)}
                netWorth={globalNetWorth}
                onOpenGuide={() => setShowGuide(true)}
                onGeneratePDF={async () => {
                    try {
                        await generateFinancialReport({
                            netWorth: globalNetWorth,
                            monthlySavings: calculatedMonthlySavings,
                            monthlyIncome: state.config.users.reduce((s, u) => s + (u.netSalary || u.salary || 0), 0),
                            totalDebts: state.debts.reduce((s, d) => s + d.balance, 0),
                            celiBalance: assetBreakdown.celi,
                            reerBalance: assetBreakdown.reer,
                            investmentsTotal: assetBreakdown.nonReg,
                            liquidityBalance: currentLiquidity,
                            budgetItems: state.budgetItems.map(b => ({ name: b.name, nature: b.nature || 'Autre', target: b.target, frequency: b.frequency || 'Monthly' })),
                            realEstateGoals: state.realEstateGoals.filter(g => g.isActive).map(g => ({
                                name: g.name || 'Propriete',
                                price: g.price || 0,
                                equity: 0,
                            })),
                            retirementTargetAge: state.retirementGoal.targetAge,
                            retirementTargetIncome: state.retirementGoal.targetMonthlyIncome,
                            userName: state.config.users[0]?.name,
                            generatedAt: new Date().toLocaleDateString('fr-CA'),
                            lang: document.documentElement.lang || 'fr',
                        });
                        showToast('Rapport PDF genere avec succes !', 'success');
                    } catch (e) {
                        console.error('[FinanceAI] PDF generation error:', e);
                        showToast('Erreur lors de la generation du PDF', 'error');
                    }
                }}
                monthlySavings={calculatedMonthlySavings}
                financialGoals={state.financialGoals}
                currentValues={{ celi: assetBreakdown.celi, reer: assetBreakdown.reer, liquidity: currentLiquidity }}
            >
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
                        apiKey={state.apiKeys.gemini}
                        calculatedMonthlySavings={calculatedMonthlySavings}
                        onNavigate={handleSetTab}
                        isPrivacyMode={isPrivacyMode}
                    />
                )}

                {activeTab === Tab.TRANSACTIONS && <Transactions transactions={state.transactions} setTransactions={(t) => setAppState({ transactions: typeof t === 'function' ? (t as any)(state.transactions) : t })} apiKey={state.apiKeys.gemini} onSyncLunchMoney={() => loadData(state.apiKeys.lunchMoney, undefined)} isSyncing={isLoading} budgetItems={state.budgetItems} categorizationRules={state.categorizationRules || []} setCategorizationRules={(rules) => setAppState({ categorizationRules: rules })} />}
                {activeTab === Tab.BUDGET && <Budget transactions={state.transactions} config={state.config} budgetItems={state.budgetItems} setBudgetItems={(items) => setAppState({ budgetItems: items })} apiKey={state.apiKeys.gemini} />}
                {activeTab === Tab.PLANNING && <Planning transactions={state.transactions} savingsGoals={state.savingsGoals} setSavingsGoals={(goals) => setAppState({ savingsGoals: goals })} apiKey={state.apiKeys.gemini} budgetItems={state.budgetItems} setBudgetItems={(items) => setAppState({ budgetItems: items })} config={state.config} />}
                {activeTab === Tab.DEBT && <DebtManager debts={state.debts} setDebts={(d) => setAppState({ debts: d })} />}
                {activeTab === Tab.INVESTMENTS && <Investments assets={state.assets} setAssets={(a) => setAppState({ assets: a })} investmentAccounts={state.investmentAccounts} setInvestmentAccounts={(accs: AppState['investmentAccounts']) => setAppState({ investmentAccounts: accs })} investmentTransactions={state.investmentTransactions} setInvestmentTransactions={(txs: AppState['investmentTransactions']) => setAppState({ investmentTransactions: txs })} apiKey={state.apiKeys.gemini} transactions={state.transactions} budgetItems={state.budgetItems} config={state.config} projection={state.projection} setProjection={(p: AppState['projection']) => setAppState({ projection: p })} />}
                {activeTab === Tab.TAX && <TaxCenter config={state.config} setConfig={(c) => setAppState({ config: c })} assets={state.assets} apiKey={state.apiKeys.gemini} />}
                {activeTab === Tab.REAL_ESTATE && <RealEstate availableCash={globalNetWorth - (state.assets.reduce((sum, a) => sum + (a.quantity * a.currentPrice * (state.fxRates[a.currency] || 1)), 0))} goals={state.realEstateGoals} setGoals={(g) => setAppState({ realEstateGoals: g })} />}

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

                {activeTab === Tab.CHILD && <ChildPlanning goals={state.childGoals || []} setGoals={(g) => setAppState({ childGoals: g })} projection={state.projection} currentRESP={assetBreakdown.reee} />}
                {activeTab === Tab.LIFE_EVENTS && <LifeEvents events={state.lifeEvents} setEvents={(e) => setAppState({ lifeEvents: e })} travelGoals={state.travelGoals} setTravelGoals={(g) => setAppState({ travelGoals: g })} netWorth={globalNetWorth} returnRate={state.projection.returnRate} />}
                {activeTab === Tab.RETIREMENT && <Retirement
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
                />}
                {activeTab === Tab.DATA && <JsonDataView />}
                {activeTab === Tab.SYSTEM && <SystemView state={state} />}

                {activeTab === Tab.SETTINGS && (
                    <Settings
                        apiKeys={state.apiKeys} setApiKeys={handleUpdateApiKeys}
                        config={state.config} setConfig={(c) => setAppState({ config: c })}
                        budgetItems={state.budgetItems} setBudgetItems={(items) => setAppState({ budgetItems: items })}
                        onImportData={handleManualImport}
                        initialBalances={state.initialBalances} setInitialBalances={(b) => setAppState({ initialBalances: b })}
                        transactions={state.transactions} setTransactions={(t) => setAppState({ transactions: t })}
                        assets={state.assets} setAssets={(a) => setAppState({ assets: a })}
                        savingsGoals={state.savingsGoals} setSavingsGoals={(goals) => setAppState({ savingsGoals: goals })}
                        travelGoals={state.travelGoals} setTravelGoals={(goals) => setAppState({ travelGoals: goals })}
                        debts={state.debts} setDebts={(d) => setAppState({ debts: d })}
                        investmentAccounts={state.investmentAccounts} investmentTransactions={state.investmentTransactions}
                        lifeEvents={state.lifeEvents} retirementGoal={state.retirementGoal}
                        realEstateGoals={state.realEstateGoals}
                        setRealEstateGoals={(g) => setAppState({ realEstateGoals: g })}
                        childGoal={state.childGoal} childGoals={state.childGoals || []} financialGoals={state.financialGoals}
                    />
                )}

                {activeTab === Tab.ASSISTANT && <AiAssistant apiKey={state.apiKeys.gemini} transactions={state.transactions} budgetItems={state.budgetItems} assets={state.assets} projection={state.projection} realEstateGoal={state.realEstateGoals[0]} config={state.config} initialBalances={state.initialBalances} />}

                {showGuide && <GuideModal activeTab={activeTab} onClose={() => setShowGuide(false)} />}
            </Layout>
            <ToastContainer />
        </div>
    );
};
