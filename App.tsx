import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { Layout } from './components/Layout';
import { Onboarding } from './components/Onboarding';
import { shouldShowOnboarding, hasMeaningfulData } from './utils/onboarding';
import { ToastContainer, showToast } from './components/ui/Toast';
import { PwaInstallBanner } from './components/PwaInstallBanner';
import { ConsentBanner } from './components/ConsentBanner';
import { Tab, AppState } from './types';
import { INITIAL_CHILD_GOAL } from './constants';
import { markDuplicates } from './utils/transactionParser';
import { parseBankCsv } from './services/import/parseBankCsv';
import { logAudit } from './services/auditLog';
import { fetchAssetHistory, fetchFxRates } from './services/finance';
// Phase 3E perf — lazy-load pdfReport (jspdf = 595KB) seulement au clic
// "Générer PDF" plutôt qu'au boot de l'app.
import { useFinanceStore, getMigrationStatus } from './store/useFinanceStore';
import { loadApiKeysDetailed, saveApiKeys } from './services/secureKeyStore';
import { useShallow } from 'zustand/shallow';
import { useDerivedFinancials } from './utils/useDerivedFinancials';
import { TabRouter } from './components/TabRouter';
import { CommandPalette, useCommandPalette, makeNavigationActions } from './components/ui/CommandPalette';
import { useTranslation } from 'react-i18next';
import { configureMarketDataProvider } from './services/marketData';
import { installGlobalErrorHandlers, logError } from './services/errorLogger';
import { lazyWithRetry, clearChunkReloadFlag } from './utils/lazyWithRetry';
import { initAutoBackup } from './services/backupAuto';
import { initSync, runBootSync, schedulePush, pushNow, subscribeSyncStatus, getSyncStatus, hasConnectedBefore, startDrivePolling, markApiKeysHydrated, type SyncStatus } from './services/sync/syncOrchestrator';
import { trackPageView } from './services/analytics';
import { GuidedTour } from './components/tour/GuidedTour';
import { startGuidedTour } from './components/tour/tourControl';
import { PassphraseGate } from './components/auth/PassphraseGate';

const GuideModal = lazyWithRetry(() => import('./components/GuideModal').then(m => ({ default: m.GuideModal })), 'GuideModal');

export const App: React.FC = () => {
    // C1 fix (Sprint 1) — `useShallow(s => s)` ne fait PAS ce que le commentaire
    // précédent prétendait : il sélectionnait l'objet entier du store, donc
    // toute mise à jour de slice (notamment `lastProjection` mis à jour
    // toutes les ~300ms+timer Worker pendant le calcul Monte Carlo) faisait
    // re-render App → Layout → TabRouter → toutes les pages.
    //
    // `lastProjection` est un objet volumineux (chartData ~360 points × 40 champs)
    // qui n'est jamais lu directement via `state.lastProjection` dans App.tsx ni
    // dans les composants enfants (ils l'accèdent via `useFinanceStore(s => s.lastProjection)`
    // pattern Wiring 2026-05). On l'exclut donc du selector App pour éliminer
    // les re-renders cascade.
    //
    // Refactor complet (sélecteurs atomiques, suppression du prop-drilling
    // TabRouter) reporté à Sprint 3 (issue H2).
    const state = useFinanceStore(useShallow(s => {
        const { lastProjection: _lp, ...rest } = s;
        void _lp;
        return rest;
    }));
    const setAppState = state.setAppState;
    const activeTab = state.activeTab;
    const setActiveTab = state.setActiveTab;
    const isPrivacyMode = state.isPrivacyMode;
    const togglePrivacyMode = state.togglePrivacyMode;

    const [isLoading] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const isHydrated = useRef(false);


    // P1 — installation des handlers d'erreur globaux au boot (une seule fois)
    const errorHandlersInstalled = useRef(false);
    useEffect(() => {
        if (errorHandlersInstalled.current) return;
        errorHandlersInstalled.current = true;
        installGlobalErrorHandlers();
        // P1 fix : si l'app a chargé OK, clear le flag "chunk reload attempted"
        // pour permettre un retry futur si nouveau deploy.
        clearChunkReloadFlag();
        // P1.3 — auto-backup quotidien dans IndexedDB (silent fail si indispo).
        // Léger debounce (2s) pour ne pas bloquer le 1er paint.
        const timer = setTimeout(() => { initAutoBackup(); }, 2000);

        // P2.9 — service worker en PROD seulement (Vite HMR en dev s'auto-gère).
        // Bug fix 2026-05-21 : ce useEffect tourne souvent APRÈS window.load
        // (mount React arrive après l'event), donc addEventListener('load') ne
        // déclenchait jamais le callback → SW jamais registered, cache vide.
        // Fix : register direct si le DOM est déjà loaded, sinon on attend l'event.
        if (import.meta.env.PROD && 'serviceWorker' in navigator) {
            const registerSW = () => {
                navigator.serviceWorker.register('/sw.js').catch((err) => {
                    // log explicite plutôt qu'un silent catch — utile en cas
                    // de régression future (anti-pattern silent-failure-hunter).
                    console.error('[SW] registration failed:', err);
                });
            };
            if (document.readyState === 'complete') {
                registerSW();
            } else {
                window.addEventListener('load', registerSW, { once: true });
            }
        }

        // Sync Google Drive — inerte si VITE_GOOGLE_CLIENT_ID absent. Init + sync silencieuse au
        // boot (uniquement si déjà connecté), puis push debouncé sur chaque changement du store.
        initSync(import.meta.env.VITE_GOOGLE_CLIENT_ID);
        const syncTimer = setTimeout(() => { void runBootSync(); }, 2500);
        const unsubSync = useFinanceStore.subscribe(() => schedulePush());
        // Rafraîchissement « fluide » : reflète SEUL les changements de Drive (ex. doc rangé par le
        // connecteur MCP) sur intervalle + au retour sur l'onglet (garde anti-perte réutilisée).
        const stopPolling = startDrivePolling();

        return () => {
            clearTimeout(timer);
            clearTimeout(syncTimer);
            unsubSync();
            stopPolling();
        };
    }, []);

    // GA4 — page_view explicite à chaque changement d'onglet. GA4 ne
    // track automatiquement que la page d'entrée ; sans cet effect, les
    // navigations SPA n'apparaissent pas dans "Pages and screens".
    useEffect(() => {
        trackPageView(activeTab);
    }, [activeTab]);

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
        const applyHash = () => {
            const hash = window.location.hash.replace('#', '');
            if (Object.values(Tab).includes(hash as Tab) && hash !== activeTab) {
                setActiveTab(hash as Tab);
            }
        };
        // BUG FIX 2026-05-21 (audit checklist) : `hashchange` ne se déclenche
        // PAS au boot. Sans cet appel direct, ouvrir https://www.hubperso.com/#FUTURE
        // affichait toujours le Dashboard (le tab `title` changeait mais pas
        // le contenu). Appel immédiat au mount + listener pour les changements
        // ultérieurs.
        applyHash();
        window.addEventListener('hashchange', applyHash);
        return () => window.removeEventListener('hashchange', applyHash);
    }, [activeTab, setActiveTab]);

    useEffect(() => {
        // Le titre est mis à jour avec le tab actif. Les labels détaillés
        // sont dans TabRouter — ici on se contente d'un fallback générique.
        document.title = `FinanceAI - ${activeTab || 'Pro'}`;
    }, [activeTab]);

    // Q3 — Keyboard shortcuts Alt+1..9 pour switcher d'onglet rapidement
    useEffect(() => {
        const SHORTCUTS: Array<Tab> = [
            // G22-N3 : Planif fusionné dans Budget → raccourci 4 = Dettes.
            Tab.DASHBOARD, Tab.TRANSACTIONS, Tab.BUDGET, Tab.DEBT,
            Tab.INVESTMENTS, Tab.FUTURE, Tab.RETIREMENT, Tab.TAX, Tab.ASSISTANT,
        ];
        const onKeyDown = (e: KeyboardEvent) => {
            // Ignore si l'utilisateur tape dans un input/textarea/contenteditable
            const target = e.target as HTMLElement | null;
            if (target && (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'SELECT' ||
                target.isContentEditable
            )) return;
            // Alt+1..9 pour naviguer (Cmd/Ctrl+1 est réservé navigateur)
            if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            const num = parseInt(e.key, 10);
            if (Number.isNaN(num) || num < 1 || num > SHORTCUTS.length) return;
            e.preventDefault();
            setActiveTab(SHORTCUTS[num - 1]);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [setActiveTab]);

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

    // Hydratation des clés API depuis le coffre chiffré (au boot, une fois).
    // C5 les avait rendues mémoire-seulement → elles disparaissaient à chaque
    // rechargement. Désormais : on les recharge tout seul au démarrage (donc
    // dès que Cloudflare Access t'a laissé entrer via Google). Quand la clé est
    // posée dans le store, les effets réactifs ci-dessous (Finnhub) partent
    // automatiquement. Best-effort : si le coffre est indisponible (vieux
    // navigateur, pas de Web Crypto), on ne casse pas le boot.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const result = await loadApiKeysDetailed();
                if (cancelled) return;
                // D5 (anti-race sync) : le vault a répondu « ok » → l'état des clés est CONNU (même
                // vide). À partir d'ici, un push avec clés vides reflète l'intention (et n'est plus
                // bloqué/préservé). NB : on NE marque PAS sur decrypt_failed (clés présentes mais
                // illisibles ici → mieux vaut préserver celles du Drive).
                if (result.status === 'ok') markApiKeysHydrated();
                if (result.status === 'decrypt_failed') {
                    // Blob chiffré présent mais clé IDB absente (ex: navigation privée
                    // entre sessions, IndexedDB vidé) → on prévient l'utilisateur.
                    showToast(
                        'Clés API non restaurées — la clé de chiffrement est introuvable. Re-saisissez vos clés dans Paramètres.',
                        'error'
                    );
                    return;
                }
                if (result.status === 'ok' && (result.keys.anthropic || result.keys.finnhub)) {
                    useFinanceStore.getState().updateApiKeys(result.keys);
                    return;
                }
                // Migration : clés legacy encore lues en clair au boot (avant C5)
                // mais pas encore dans le coffre → on les chiffre maintenant.
                const current = useFinanceStore.getState().apiKeys;
                if (current.anthropic || current.finnhub) {
                    await saveApiKeys(current);
                }
            } catch (e) {
                // Règle « ne jamais avaler les erreurs » : un échec d'hydratation des clés (l'IA et
                // les cours d'actions ne fonctionneront pas) doit être visible dans les diagnostics.
                logError({ source: 'storage', severity: 'error', message: 'Hydratation des clés API chiffrées impossible', error: e });
            }
        })();
        return () => { cancelled = true; };
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
            id: 'action:sync',
            label: 'Synchroniser les données',
            group: 'Actions',
            icon: '🔄',
            keywords: ['sync', 'refresh', 'reload', 'sauvegarder', 'drive'],
            onSelect: async () => {
                // D8 : déclenche la VRAIE sync Drive (avant : un dispatch de resize factice qui ne
                // synchronisait rien). Mirror du bouton « Sauvegarder maintenant » (GoogleDriveSyncCard).
                const result = await pushNow();
                if (result === 'pushed') showToast('Données synchronisées vers Google Drive.', 'success');
                else if (result === 'not-configured') showToast("Connecte d'abord Google Drive (Réglages → Sauvegarde).", 'info');
                else if (result === 'skipped-empty') showToast('Rien à synchroniser : aucune donnée sur cet appareil.', 'info');
                else if (result === 'skipped-testmode') showToast('Mode test actif — synchronisation désactivée.', 'info');
                else if (result === 'error') showToast('Échec de la synchronisation (voir Réglages → Système).', 'error');
            },
        },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [isPrivacyMode, handleSetTab]);

    const [isFirstLaunch, setIsFirstLaunch] = useState<boolean>(() => {
        try {
            const flag = localStorage.getItem('app_onboarding_done');
            // On n'accueille pas un utilisateur qui a déjà des données : après un restore Drive
            // (nouvel appareil / navigation privée), le flag local n'est pas posé mais les données
            // sont là → sans ce garde, l'onboarding « du début » réapparaissait (retour Marc). On
            // regarde PROFIL + tableaux de données (pas seulement transactions/actifs) : sinon une
            // restauration profil/retraite sans transactions affichait l'onboarding, qui écrasait
            // ensuite les profils + clés restaurés (bug Marc 2026-05-29).
            return shouldShowOnboarding(flag, hasMeaningfulData(useFinanceStore.getState()), { connectedBefore: hasConnectedBefore() });
        } catch (err) {
            console.error("Hydration error:", err);
            return true;
        }
    });

    // État de la sync Drive (observable) — pilote le gate passphrase + la suppression de l'accueil.
    const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus);
    useEffect(() => subscribeSyncStatus(setSyncStatus), []);

    useEffect(() => { isHydrated.current = true; }, []);

    // Utilisateur de RETOUR détecté par la sync (compte Drive connecté, pull en cours, ou coffre
    // verrouillé) → on masque l'écran d'accueil : il ne doit jamais s'afficher à quelqu'un qui a déjà
    // un compte (les vraies données arrivent du Drive juste après).
    useEffect(() => {
        if (isFirstLaunch && (syncStatus.connected || syncStatus.busy || syncStatus.needsPassphrase)) {
            setIsFirstLaunch(false);
        }
    }, [isFirstLaunch, syncStatus.connected, syncStatus.busy, syncStatus.needsPassphrase]);

    // Garde réactive : si des données arrivent APRÈS le mount (restauration Drive asynchrone, gate),
    // on masque l'onboarding pour qu'il ne s'affiche pas puis n'écrase les profils/clés restaurés.
    useEffect(() => {
        if (!isFirstLaunch) return;
        if (hasMeaningfulData(useFinanceStore.getState())) {
            setIsFirstLaunch(false);
            return;
        }
        const unsub = useFinanceStore.subscribe((s) => {
            if (hasMeaningfulData(s)) setIsFirstLaunch(false);
        });
        return unsub;
    }, [isFirstLaunch]);

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
                logError({ source: 'network', severity: 'warning', message: 'Mise à jour des taux FX impossible (taux de repli utilisés)', error: e });
            }
        };
        updateFxRates();
    // Effet run-once au boot : fetch FX rates une seule fois, sans re-run réactif sur state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


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
                        logError({ source: 'network', severity: 'warning', message: "Hydratation du prix d'un actif échouée", context: { symbol: asset.symbol }, error: e });
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
    // Effet run-once au boot : setAppState et state.assets omis pour éviter une boucle de re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleUpdateApiKeys = async (keys: AppState['apiKeys']) => {
        state.updateApiKeys(keys);
        // Persistance chiffrée : saisies une fois → rechargées tout seul au
        // prochain boot. No-silent-failure : si le coffre est indisponible, on
        // le dit (les clés restent valides pour la session en cours).
        try {
            await saveApiKeys(useFinanceStore.getState().apiKeys);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : '';
            showToast(
                msg
                    ? `Clés non sauvegardées (${msg}). Elles resteront valides jusqu'au rechargement.`
                    : "Clés non sauvegardées : coffre chiffré indisponible. Elles resteront valides jusqu'au rechargement.",
                'error'
            );
        }
    };

    const handleManualImport = (rawData: string) => {
        const result = parseBankCsv(rawData);
        const combined = [...result.transactions, ...state.transactions];
        const deduped = markDuplicates(combined);
        setAppState({ transactions: deduped, lastUpdate: Date.now() });
        // SYS-AUDIT — trace l'import dans le journal d'audit (qui-quoi-quand).
        logAudit({
            field: 'transactions',
            operation: 'add',
            description: `Import CSV : ${result.transactions.length} ajoutée(s)${result.skipped > 0 ? `, ${result.skipped} ignorée(s)` : ''}`,
            countBefore: state.transactions.length,
            countAfter: deduped.length,
        });
        // No-silent-failure : on dit combien de lignes ont été ignorées.
        const msg = result.skipped > 0
            ? `${result.transactions.length} transaction(s) importée(s), ${result.skipped} ligne(s) ignorée(s).`
            : `${result.transactions.length} transaction(s) importée(s)`;
        showToast(msg, 'success');
    };

    // Phase 3B — memos extraits dans utils/useDerivedFinancials.ts
    const { globalNetWorth, calculatedMonthlySavings, assetBreakdown, currentLiquidity } = useDerivedFinancials(state);

    // Coffre Drive verrouillé (blob chiffré) → on déverrouille AVANT tout le reste : le prompt de
    // passphrase est LE premier message (jamais l'écran d'accueil par-dessus). Tous les hooks sont
    // au-dessus de ce point → l'early-return ne casse pas l'ordre des hooks.
    if (syncStatus.needsPassphrase) {
        return <PassphraseGate status={syncStatus} />;
    }

    return (
        <div>
            {isFirstLaunch && (
                <Onboarding onComplete={(data) => {
                    setAppState({ ...data, lastUpdate: Date.now() });
                    localStorage.setItem('app_onboarding_done', 'true');
                    setIsFirstLaunch(false);
                    // G22-F4 — lance le tutoriel guidé juste après l'onboarding (1re fois).
                    setTimeout(() => startGuidedTour(), 700);
                }} />
            )}
            <Layout
                activeTab={activeTab}
                setActiveTab={handleSetTab}
                lastUpdate={state.lastUpdate}
                isLoading={isLoading}
                isPrivacyMode={isPrivacyMode}
                togglePrivacyMode={togglePrivacyMode}
                netWorth={globalNetWorth}
                onOpenGuide={() => setShowGuide(true)}
                onGeneratePDF={async () => {
                    try {
                        // P1.5 — PDF complet : patrimoine + fiscal + holdings + dettes + goals + retraite + budget.
                        // Lazy-load jspdf vendor chunk seulement à l'usage.
                        const {
                            generateFinancialReport,
                            buildHoldingsRows,
                            buildDebtsRows,
                            buildGoalsRows,
                            buildFiscalSummary,
                            buildScenariosRows,
                        } = await import('./services/pdfReport');
                        // Snapshot store hors React pour éviter la dépendance sur state
                        // (lastProjection est délibérément exclu du selector App.tsx).
                        const { lastProjection } = useFinanceStore.getState();

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
                            // P1.5 — sections étendues (dérivées via builders purs testés)
                            fiscal: buildFiscalSummary(state),
                            holdings: buildHoldingsRows(state),
                            debtsDetail: buildDebtsRows(state),
                            goalsDetail: buildGoalsRows(state),
                            // PDF Futur — comparaison scénarios (allResults depuis lastProjection)
                            scenarios: lastProjection?.allResults
                                ? buildScenariosRows(
                                      lastProjection.allResults,
                                      lastProjection.bestStrategyIdx as number | undefined,
                                  )
                                : [],
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
                    onUpdateApiKeys={handleUpdateApiKeys}
                    onManualImport={handleManualImport}
                />

                <Suspense fallback={null}>
                    {showGuide && <GuideModal activeTab={activeTab} onClose={() => setShowGuide(false)} />}
                </Suspense>
            </Layout>
            <ToastContainer />
            <PwaInstallBanner />
            {/* S-B (Loi 25) — consentement mesure d'audience, bandeau discret. */}
            <ConsentBanner />
            <CommandPalette open={cmdK.isOpen} onClose={cmdK.close} actions={cmdActions} />
            {/* G22-F4 — tutoriel guidé (overlay global, démarré par event). */}
            <GuidedTour />
        </div>
    );
};
