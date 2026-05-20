import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { Layout } from './components/Layout';
import { Onboarding } from './components/Onboarding';
import { ToastContainer, showToast } from './components/ui/Toast';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Tab, AppState, Transaction, BudgetCategory } from './types';
import { fetchTransactions } from './services/eraContext';
import { INITIAL_CHILD_GOAL } from './constants';
import { parseTransactions, markDuplicates } from './utils/transactionParser';
import { fetchAssetHistory, fetchFxRates } from './services/finance';
// Phase 3E perf — lazy-load pdfReport (jspdf = 595KB) seulement au clic
// "Générer PDF" plutôt qu'au boot de l'app.
import { useFinanceStore, getMigrationStatus } from './store/useFinanceStore';
import { useShallow } from 'zustand/shallow';
import { useDerivedFinancials } from './utils/useDerivedFinancials';
import { TabRouter } from './components/TabRouter';
import { CommandPalette, useCommandPalette, makeNavigationActions } from './components/ui/CommandPalette';
import { useTranslation } from 'react-i18next';
import { configureMarketDataProvider } from './services/marketData';

const GuideModal = React.lazy(() => import('./components/GuideModal').then(m => ({ default: m.GuideModal })));

export const App: React.FC = () => {
    // useShallow prevents cascade re-renders when unrelated store slices change
    // (e.g. aiConversation update should not re-render the whole App tree).
    const state = useFinanceStore(useShallow(s => s));
    const setAppState = state.setAppState;
    const activeTab = state.activeTab;
    const setActiveTab = state.setActiveTab;
    const isPrivacyMode = state.isPrivacyMode;
    const togglePrivacyMode = state.togglePrivacyMode;

    const [isLoading, setIsLoading] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const isHydrated = useRef(false);
    const currentSyncController = useRef<AbortController | null>(null);

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
        // Le titre est mis à jour avec le tab actif. Les labels détaillés
        // sont dans TabRouter — ici on se contente d'un fallback générique.
        document.title = `FinanceAI - ${activeTab || 'Pro'}`;
    }, [activeTab]);

    // §7.D.3 — <html lang> dynamique synchronisé avec i18next.
    const { i18n: i18nInstance } = useTranslation();
    useEffect(() => {
        const lang = (i18nInstance.language || 'fr').split('-')[0];
        if (document.documentElement.lang !== lang) {
            document.documentElement.lang = lang;
        }
    }, [i18nInstance.language]);

    // §7.F.5 — Configure le provider marketData (Finnhub) quand la clé change.
    useEffect(() => {
        configureMarketDataProvider({ finnhubKey: state.apiKeys.finnhub });
    }, [state.apiKeys.finnhub]);

    // Phase C.6 — sync Era au boot. Si l'utilisateur a un token Era configuré,
    // pré-chauffe le cache `buildEnrichedContext` (1h TTL) pour que les widgets
    // IA (NextBestAction, EraContextInsights) répondent instantanément. Silent
    // fail si l'API est indisponible — pas critique pour l'usage core.
    useEffect(() => {
        if (!state.apiKeys.eraContext) return;
        const ctrl = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const { buildEnrichedContext } = await import('./services/aiOrchestrator');
                await buildEnrichedContext(state.apiKeys.eraContext, { signal: ctrl.signal });
            } catch {
                // silencieux — le cache reste vide, les widgets feront leur fetch eux-mêmes
            }
        }, 500); // léger debounce pour ne pas bloquer le 1er paint
        return () => {
            clearTimeout(timer);
            ctrl.abort();
        };
    }, [state.apiKeys.eraContext]);

    // Cancel toute sync en cours quand le composant est démonté
    useEffect(() => {
        return () => {
            currentSyncController.current?.abort();
        };
    }, []);

    const handleSetTab = (tab: Tab) => {
        setActiveTab(tab);
        window.location.hash = tab;
    };

    // §7.B.3 — Command palette Cmd+K global
    const cmdK = useCommandPalette();
    const cmdActions = useMemo(() => [
        ...makeNavigationActions(handleSetTab),
        {
            id: 'action:privacy',
            label: isPrivacyMode ? 'Désactiver le mode privé' : 'Activer le mode privé',
            group: 'Actions',
            icon: isPrivacyMode ? '👁️' : '🙈',
            keywords: ['privacy', 'masquer', 'cacher', 'discret'],
            onSelect: () => togglePrivacyMode(),
        },
        {
            id: 'action:guide',
            label: 'Ouvrir le guide',
            group: 'Actions',
            icon: 'ℹ️',
            keywords: ['guide', 'help', 'aide'],
            onSelect: () => setShowGuide(true),
        },
        {
            id: 'action:refresh',
            label: 'Synchroniser les données',
            group: 'Actions',
            icon: '🔄',
            keywords: ['sync', 'refresh', 'reload'],
            onSelect: () => { loadData(state.apiKeys.eraContext); window.dispatchEvent(new Event('resize')); },
        },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [isPrivacyMode, handleSetTab]);

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


    useEffect(() => {
        if (state.apiKeys.eraContext && state.transactions.length === 0) {
            loadData(state.apiKeys.eraContext);
        }
    }, [state.apiKeys.eraContext]);

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

        // Abort la sync précédente si encore en cours
        currentSyncController.current?.abort();
        const controller = new AbortController();
        currentSyncController.current = controller;

        setIsLoading(true);
        try {
            const currentState = pendingState || useFinanceStore.getState();
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

            const newTxs = await fetchTransactions(token, startDateToFetch || '2000-01-01', controller.signal);

            // Vérifier qu'on n'a pas été remplacés par une sync plus récente avant d'écrire le state
            if (controller.signal.aborted) return;

            if (newTxs.length === 0) {
                return;
            }

            const base = pendingState || useFinanceStore.getState();
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

            if (controller.signal.aborted) return;

            setAppState({
                transactions: deduplicatedList,
                initialBalances: balances,
                lastUpdate: Date.now()
            });
            showToast('Donnees synchronisees', 'success');
        } catch (e: any) {
            // AbortError = sync remplacée par une plus récente, silencieux
            if (e?.name === 'AbortError' || controller.signal.aborted) return;
            console.error('[FinanceAI] Sync Error:', e);
            showToast(e?.message ? `Sync echouee : ${e.message}` : 'Erreur de synchronisation Era Context.', 'error');
        } finally {
            // Ne reset isLoading que si on est toujours le sync actif
            if (currentSyncController.current === controller) {
                currentSyncController.current = null;
                setIsLoading(false);
            }
        }
    };

    const handleUpdateApiKeys = (keys: AppState['apiKeys']) => {
        state.updateApiKeys(keys);
        if (keys.eraContext !== state.apiKeys.eraContext && keys.eraContext) {
            loadData(keys.eraContext, undefined);
        }
    };

    const handleManualImport = (rawData: string) => {
        const parsed = parseTransactions(rawData);
        const combined = [...parsed, ...state.transactions];
        const deduped = markDuplicates(combined);
        setAppState({ transactions: deduped, lastUpdate: Date.now() });
        showToast(`${deduped.length} transactions importees`, 'success');
    };

    // Phase 3B — memos extraits dans utils/useDerivedFinancials.ts
    const { globalNetWorth, calculatedMonthlySavings, assetBreakdown, currentLiquidity } = useDerivedFinancials(state);

    return (
        <div>
            {isFirstLaunch && (
                <Onboarding onComplete={(data) => {
                    setAppState({ ...data, lastUpdate: Date.now() });
                    localStorage.setItem('app_onboarding_done', 'true');
                    setIsFirstLaunch(false);
                    if (data.apiKeys?.eraContext) {
                        setTimeout(() => loadData(data.apiKeys!.eraContext), 500);
                    }
                }} />
            )}
            <Layout
                activeTab={activeTab}
                setActiveTab={handleSetTab}
                lastUpdate={state.lastUpdate}
                onRefresh={() => {
                    loadData(state.apiKeys.eraContext);
                    window.dispatchEvent(new Event('resize'));
                }}
                isLoading={isLoading}
                isPrivacyMode={isPrivacyMode}
                togglePrivacyMode={togglePrivacyMode}
                netWorth={globalNetWorth}
                onOpenGuide={() => setShowGuide(true)}
                onGeneratePDF={async () => {
                    try {
                        // Lazy-load jspdf vendor chunk seulement à l'usage
                        const { generateFinancialReport } = await import('./services/pdfReport');
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
                {/* Phase 3B — routing extrait dans components/TabRouter.tsx */}
                <TabRouter
                    activeTab={activeTab}
                    state={state}
                    setAppState={setAppState}
                    setActiveTab={handleSetTab}
                    isPrivacyMode={isPrivacyMode}
                    isLoading={isLoading}
                    globalNetWorth={globalNetWorth}
                    calculatedMonthlySavings={calculatedMonthlySavings}
                    assetBreakdown={assetBreakdown}
                    currentLiquidity={currentLiquidity}
                    onSyncEra={() => loadData(state.apiKeys.eraContext, undefined)}
                    onUpdateApiKeys={handleUpdateApiKeys}
                    onManualImport={handleManualImport}
                />

                <Suspense fallback={null}>
                    {showGuide && <GuideModal activeTab={activeTab} onClose={() => setShowGuide(false)} />}
                </Suspense>
            </Layout>
            <ToastContainer />
            <CommandPalette open={cmdK.isOpen} onClose={cmdK.close} actions={cmdActions} />
        </div>
    );
};
