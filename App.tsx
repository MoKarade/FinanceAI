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
import { useFinanceStore, getMigrationStatus, getHydrationStatus } from './store/useFinanceStore';
import { loadApiKeysDetailed, saveApiKeys } from './services/secureKeyStore';
import { useShallow } from 'zustand/shallow';
import { useDerivedFinancials } from './utils/useDerivedFinancials';
import { TabRouter } from './components/TabRouter';
import { CommandPalette, useCommandPalette, makeNavigationActions } from './components/ui/CommandPalette';
import { useTranslation } from 'react-i18next';
import { configureMarketDataProvider, getQuote, hasQuoteProvider } from './services/marketData';
import { refreshAssetPrices, applyPricePatches } from './services/priceRefresh';
import { installGlobalErrorHandlers, logError } from './services/errorLogger';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { initAutoBackup, createBackupNow } from './services/backupAuto';
import { sanitizePersonaArtifacts } from './services/personaSanitizer';
import { RULE_CATEGORIES } from './services/import/categoryRules';
import { loadLockedProjection } from './services/lockedProjectionStore';
import { initSync, runBootSync, schedulePush, pushNow, flushPush, subscribeSyncStatus, getSyncStatus, hasConnectedBefore, startDrivePolling, markApiKeysHydrated, type SyncStatus } from './services/sync/syncOrchestrator';
import { trackPageView } from './services/analytics';
import { GuidedTour } from './components/tour/GuidedTour';
import { startGuidedTour } from './components/tour/tourControl';
import { PassphraseGate } from './components/auth/PassphraseGate';
import { SyncConflictModal } from './components/sync/SyncConflictModal';
import { SyncStatusBanner } from './components/sync/SyncStatusBanner';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
// [AITOOLS-E] Provider = 1 instance de chat pour toute l'app (boot-safe : le SDK Anthropic est en
// import dynamique dans useAiChat). Le panneau latéral global est lazy (hors bundle de boot).
import { AiChatProvider } from './components/aiChat/AiChatContext';
const AiChatLauncher = lazyWithRetry(() => import('./components/aiChat/AiChatLauncher').then(m => ({ default: m.AiChatLauncher })), 'AiChatLauncher');

const GuideModal = lazyWithRetry(() => import('./components/GuideModal').then(m => ({ default: m.GuideModal })), 'GuideModal');
// PH2-c — moteur de projection app-level LAZY-chargé : garde le bundle de BOOT léger (le code du
// moteur ~projection n'est plus tiré dans le chunk initial, comme avant via l'onglet Futur). Il monte
// juste après le 1er paint, calcule, puis publie store.lastProjection (bref ProjectionRequired possible
// au tout 1er boot, le temps que le chunk charge + le 1er calcul aboutisse).
const ProjectionEngine = lazyWithRetry(() => import('./components/ProjectionEngine').then(m => ({ default: m.ProjectionEngine })), 'ProjectionEngine');

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
        const { lastProjection: _lp, projectionStatus: _ps, ...rest } = s;
        void _lp;
        void _ps;
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
        // PH2-d — restaure la courbe VERROUILLÉE depuis IndexedDB si un verrou était actif au dernier
        // reload (le booléen isProjectionLocked est persisté, le gros blob non → relu de l'IDB ici).
        // PH2-d-1 — 'empty' (rien/erreur d'accès) → silence ; 'unreadable' (entrée présente mais clé
        // disparue) → on AVERTIT l'utilisateur (jumeau de decrypt_failed des clés API).
        if (useFinanceStore.getState().isProjectionLocked) {
            // [PERF-BUNDLE] import STATIQUE : lockedProjectionStore est déjà dans le chunk de BOOT (importé
            // statiquement par le store) → le dynamic import ne créait aucun chunk séparé (INEFFECTIVE_DYNAMIC_IMPORT).
            loadLockedProjection()
                .then((res) => {
                    if (res.status === 'ok') {
                        useFinanceStore.getState().setLockedProjection(res.result);
                    } else {
                        useFinanceStore.getState().setLockedProjection(null);
                        if (res.status === 'unreadable') {
                            showToast('Ta courbe verrouillée n\'a pas pu être restaurée (clé de chiffrement introuvable) et a été retirée.', 'info');
                        }
                    }
                })
                .catch(() => { /* module/IDB HS : on reste déverrouillé en mémoire */ });
        }
        // PH1-a (revue) : le clear du flag « chunk reload attempted » au mount a été RETIRÉ —
        // il tournait AVANT la résolution des chunks lazy du boot et neutralisait la garde
        // anti-boucle (échec persistant ⇒ reload infini). La garde est désormais un timestamp
        // auto-expirant dans utils/lazyWithRetry (au plus 1 reload auto/min, aucun clear requis).
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

        // [PERSONA-PURGE] Self-heal AVANT l'init sync : si des artefacts de persona de test ont
        // fui dans les données réelles (incident 2026-07-15 : ~600 transactions « Karim » chez
        // Marc), on les retire par id déterministe — l'état guéri est ensuite persisté et poussé
        // vers Drive par le cycle normal. No-op en mode test et sur état propre.
        // Détection À SEC d'abord ; pollution détectée → backup IndexedDB de l'état PRÉ-purge
        // (finding panel sécurité : symétrie avec applyPulledPayload — toute mutation automatique
        // des vraies données a son filet), PUIS purge. Best-effort : backup HS ≠ rester pollué.
        void (async () => {
            const st = useFinanceStore.getState();
            if (st.isTestMode) return;
            const { report } = sanitizePersonaArtifacts(st as unknown as Parameters<typeof sanitizePersonaArtifacts>[0]);
            if (report.removedTotal === 0) return;
            try {
                // Depuis [BACKUP-PROMISE-CATCH], createBackupNow journalise EN INTERNE ses échecs
                // IndexedDB (rejet async tx.onerror → null) ; ici on trace juste que le filet est absent.
                const backup = await createBackupNow('auto');
                if (!backup) {
                    logError({ source: 'storage', severity: 'warning', message: 'purgePersonaArtifacts : backup pré-purge indisponible (null) — purge SANS filet' });
                }
            } catch (e) {
                // Erreur SYNCHRONE en amont du backup (payload/crypto de chiffrement) — la purge procède
                // quand même (chirurgicale, ids déterministes), mais « filet absent » doit être visible.
                logError({ source: 'storage', severity: 'warning', message: 'purgePersonaArtifacts : backup pré-purge échoué (amont) — purge SANS filet', error: e instanceof Error ? e : new Error(String(e)) });
            }
            const purged = useFinanceStore.getState().purgePersonaArtifacts();
            if (purged > 0) {
                showToast(`${purged} donnée(s) de test (persona) retirée(s) de tes vraies données (backup pris avant).`, 'info');
            }
        })();

        // Sync Google Drive — inerte si VITE_GOOGLE_CLIENT_ID absent. Init + sync silencieuse au
        // boot (uniquement si déjà connecté), puis push debouncé sur chaque changement du store.
        initSync(import.meta.env.VITE_GOOGLE_CLIENT_ID);
        const syncTimer = setTimeout(() => { void runBootSync(); }, 2500);
        const unsubSync = useFinanceStore.subscribe(() => schedulePush());
        // Rafraîchissement « fluide » : reflète SEUL les changements de Drive (ex. doc rangé par le
        // connecteur MCP) sur intervalle + au retour sur l'onglet (garde anti-perte réutilisée).
        const stopPolling = startDrivePolling();
        // Flush du push en attente quand l'onglet se masque/ferme : garantit que le DERNIER changement
        // atteint Drive avant que Marc parte parler à Claude (sinon le debounce 8s pourrait ne jamais
        // partir → le connecteur MCP lirait une copie périmée). No-op si non connecté / rien de neuf.
        const onHide = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') flushPush();
        };
        const onPageHide = () => flushPush();
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHide);
        if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide);

        return () => {
            clearTimeout(timer);
            clearTimeout(syncTimer);
            unsubSync();
            stopPolling();
            if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHide);
            if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);
        };
    }, []);

    // GA4 — page_view explicite à chaque changement d'onglet. GA4 ne
    // track automatiquement que la page d'entrée ; sans cet effect, les
    // navigations SPA n'apparaissent pas dans "Pages and screens".
    useEffect(() => {
        trackPageView(activeTab);
    }, [activeTab]);

    // Deux refs SÉPARÉS (finding panel silent-failure, lot audit 2026-07-17) : un ref partagé
    // ferait avaler le toast d'hydratation quand migration legacy ET réhydratation échouent
    // ENSEMBLE (localStorage inaccessible : les deux chemins tombent en même temps) — le pire
    // scénario perdrait précisément son avertissement « NE RIEN SAISIR ».
    const migrationWarningShown = useRef(false);
    const hydrationWarningShown = useRef(false);
    useEffect(() => {
        const status = getMigrationStatus();
        if (status.failed && !migrationWarningShown.current) {
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
        // [STORE-REHYDRATE-SILENT, audit 2026-07-16] Chemin DISTINCT : la réhydratation ZUSTAND
        // (financeai-storage) a échoué → l'app affiche l'état par défaut alors que les données existent
        // encore (blob intact + Drive + backups). Avant ce filet : app vierge SANS AUCUN message →
        // risque de sur-réaction destructrice (re-onboarding par-dessus, pull écrasant).
        const hydration = getHydrationStatus();
        if (hydration.failed && !hydrationWarningShown.current) {
            hydrationWarningShown.current = true;
            showToast(
                '[CRITIQUE] Tes données n\'ont PAS pu être chargées (sauvegarde locale illisible). NE RIEN SAISIR : tes données existent encore — restaure un backup (Réglages → Sauvegarde) ou reconnecte Drive.',
                'error'
            );
            console.error('[FinanceAI] Hydration failure:', hydration);
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
    // dès que le gate Google in-app t'a laissé charger l'app). Quand la clé est
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
        // [PRICE-REFRESH-LIVE] — après l'hydratation d'historique, rafraîchit les currentPrice
        // depuis les quotes live (séquentiel 2 500 ms, cf services/priceRefresh). Sans ça, un prix
        // reste FIGÉ à sa valeur d'ajout pour toujours (dérive mesurée ~20 k$ vs courtier).
        // Anti-course : lit l'état FRAIS du store au lancement ET à l'application (fusion par
        // symbole) — un pull Drive pendant le refresh n'est pas écrasé. Sauté en mode test
        // (ne pas réécrire les prix des fixtures persona).
        const refreshPricesAtBoot = async (): Promise<void> => {
            const s = useFinanceStore.getState();
            if (s.isTestMode === true) return;
            const current = s.assets ?? [];
            if (current.filter(a => a?.symbol && (a.quantity || 0) > 0).length === 0) return;
            try {
                // Boot = passe NON forcée : sautée si une passe a fini il y a < 5 min (mutex +
                // intervalle min du service — anti-entrelacement avec le bouton, anti-spam reload).
                const res = await refreshAssetPrices(current, { getQuote, hasProvider: hasQuoteProvider });
                if (cancelled || res.patches.size === 0) return;
                const fresh = useFinanceStore.getState().assets ?? [];
                setAppState({ assets: applyPricePatches(fresh, res.patches) });
            } catch (e) {
                logError({ source: 'network', severity: 'warning', message: 'Rafraîchissement des cours au boot échoué (prix existants conservés)', error: e });
            }
        };
        hydrateAssets().then(() => { if (!cancelled) void refreshPricesAtBoot(); });
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

    const handleManualImport = async (rawData: string) => {
        const result = parseBankCsv(rawData);
        const combined = [...result.transactions, ...state.transactions];
        const deduped = markDuplicates(combined);
        setAppState({ transactions: deduped, lastUpdate: Date.now() });
        // SYS-AUDIT — trace l'import dans le journal d'audit (qui-quoi-quand).
        logAudit({
            field: 'transactions',
            operation: 'add',
            description: `Import relevé : ${result.transactions.length} ajoutée(s)${result.skipped > 0 ? `, ${result.skipped} ignorée(s)` : ''}`,
            countBefore: state.transactions.length,
            countAfter: deduped.length,
        });
        // No-silent-failure : on dit combien de lignes ont été ignorées.
        const baseMsg = result.skipped > 0
            ? `${result.transactions.length} transaction(s) importée(s), ${result.skipped} ligne(s) ignorée(s).`
            : `${result.transactions.length} transaction(s) importée(s).`;

        // Auto-catégorisation IA (choix Marc) : classe les NOUVELLES transactions non
        // dupliquées / non-transfert encore « à classer ». Lazy-import de claude.ts →
        // ne tire PAS le SDK Anthropic dans le bundle de BOOT (règle CLAUDE.md).
        const apiKey = state.apiKeys.anthropic;
        const newIds = new Set(result.transactions.map(t => t.id));
        const toClassify = deduped.filter(t =>
            newIds.has(t.id) && !t.isDuplicate && !t.isTransfer &&
            (t.category === 'Uncategorized' || t.category === 'Inconnu' || t.category === ''),
        );
        if (!apiKey || toClassify.length === 0) {
            showToast(apiKey ? baseMsg : `${baseMsg} Ajoute ta clé Anthropic pour la classification auto.`, 'success');
            return;
        }
        showToast(`${baseMsg} Classification IA en cours…`, 'info');
        try {
            const { categorizeBatch } = await import('./services/claude');
            // 'Inconnu' EXCLU des cibles : c'est un statut « à classer », pas une destination.
            // [TX-CATEGORY-RULES] + jeu canonique des règles : cibles IA disponibles même quand
            // le budget est encore vide (post-purge), cohérentes avec l'import et le Budget.
            const allowed = Array.from(new Set([
                ...state.budgetItems.map(b => b.name),
                'Salaire', 'Autre', 'Transfert', 'Investissement', 'Remboursement',
                ...RULE_CATEGORIES,
            ]));
            const classified = await categorizeBatch(toClassify, apiKey, deduped, allowed);
            const byId = new Map(classified.map(t => [t.id, t]));
            // Applique les catégories sur l'état FRAIS (et non le snapshot `deduped` capturé
            // avant l'await) → un edit utilisateur survenu pendant la classification n'est pas écrasé.
            const current = useFinanceStore.getState().transactions;
            setAppState({ transactions: current.map(t => byId.get(t.id) ?? t), lastUpdate: Date.now() });
            showToast(`${classified.length} nouvelle(s) transaction(s) classée(s).`, 'success');
        } catch (e) {
            logError({ source: 'ai', message: "Auto-catégorisation à l'import échouée", error: e });
            showToast("Import OK, mais la classification auto a échoué — utilise « classer ».", 'error');
        }
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
        // [Finding panel silent-failure ÉLEVÉ] Le provider vit AU-DESSUS de tout l'app (nécessaire au
        // context partagé) → sans filet, un crash du hook chat = écran blanc global (avant, l'onglet
        // Assistant était isolé par l'ErrorBoundary de TabRouter). Ceinture anti-écran-blanc.
        <ErrorBoundary label="FinanceAI">
        <AiChatProvider>
        <div>
            {/* Bandeau de statut sync EN TÊTE (in-flow → pousse le contenu, ne le recouvre pas) :
                alerte « non connecté / non sauvegardé » ou « échec de sauvegarde ». Rendu null si
                sync non configurée, en mode test, ou tout va bien. */}
            <SyncStatusBanner />
            {/* PH2-c (clé de voûte) — moteur de projection AU NIVEAU APP (headless, rend null) :
                publie store.lastProjection pour TOUS les onglets, indépendamment de l'onglet actif.
                Garde no-fake-data interne (prérequis Futur salaire+placements+profil retraite).
                Lazy + Suspense → hors du bundle de boot. */}
            <Suspense fallback={null}>
                <ProjectionEngine calculatedMonthlySavings={calculatedMonthlySavings} />
            </Suspense>
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
            {/* Résolution de conflit de sync — overlay bloquant GLOBAL (anti-clobber Marc 2026-07-14) :
                jamais d'écrasement auto, l'utilisateur choisit « cet appareil » vs « Drive » en voyant
                le résumé de chaque côté. Monté ici → surgit au premier plan quel que soit l'onglet. */}
            <SyncConflictModal />
            <PwaInstallBanner />
            {/* S-B (Loi 25) — consentement mesure d'audience, bandeau discret. */}
            <ConsentBanner />
            <CommandPalette open={cmdK.isOpen} onClose={cmdK.close} actions={cmdActions} />
            {/* G22-F4 — tutoriel guidé (overlay global, démarré par event). */}
            <GuidedTour />
            {/* [AITOOLS-E] Panneau latéral GLOBAL du chat (FAB partout) — lazy, hors bundle de boot.
                Masqué pendant l'accueil (pas de données à consulter, l'onboarding occupe l'écran).
                ErrorBoundary dédié : un crash du RENDU du panneau ne fait tomber que le panneau
                (isolation fine, restaure la protection par-onglet d'avant le refactor). */}
            {!isFirstLaunch && (
                <ErrorBoundary label="Assistant IA">
                    <Suspense fallback={null}>
                        <AiChatLauncher />
                    </Suspense>
                </ErrorBoundary>
            )}
        </div>
        </AiChatProvider>
        </ErrorBoundary>
    );
};
