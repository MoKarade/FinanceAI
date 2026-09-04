import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { Layout } from './components/Layout';
import { Onboarding } from './components/Onboarding';
import { shouldShowOnboarding, hasMeaningfulData } from './utils/onboarding';
import { ToastContainer, showToast } from './components/ui/Toast';
import { PwaInstallBanner } from './components/PwaInstallBanner';
import { ConsentBanner } from './components/ConsentBanner';
import { Tab, AppState } from './types';
import { INITIAL_CHILD_GOAL } from './constants';
import { useFinanceStore } from './store/useFinanceStore';
import { saveApiKeys } from './services/secureKeyStore';
import { useShallow } from 'zustand/shallow';
import { useDerivedFinancials } from './utils/useDerivedFinancials';
import { TabRouter } from './components/TabRouter';
import { CommandPalette, useCommandPalette, makeNavigationActions } from './components/ui/CommandPalette';
// [GODFILE-APP] Les effets de boot / navigation / hydratation marché et les deux gros handlers
// (PDF, import de relevé) vivent dans leurs modules — App reste l'assemblage.
import { useAppBootEffects } from './hooks/useAppBootEffects';
import { useTabNavigation } from './hooks/useTabNavigation';
import { useAssetDataHydration } from './hooks/useAssetDataHydration';
import { genererRapportPdfEcran } from './components/app/exportPdfEcran';
import { importerReleveManuel } from './components/app/importReleveManuel';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { pushNow, subscribeSyncStatus, getSyncStatus, hasConnectedBefore, type SyncStatus } from './services/sync/syncOrchestrator';
import { GuidedTour } from './components/tour/GuidedTour';
import { startGuidedTour } from './components/tour/tourControl';
import { PassphraseGate } from './components/auth/PassphraseGate';
import { SyncConflictModal } from './components/sync/SyncConflictModal';
import { SyncStatusBanner } from './components/sync/SyncStatusBanner';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
// [AITOOLS-E] Provider = 1 instance de chat pour toute l'app (boot-safe : le SDK Anthropic est en
// import dynamique dans useAiChat). Le panneau latéral global est lazy (hors bundle de boot).
import { AiChatProvider } from './components/aiChat/AiChatContext';
import { Analytics } from '@vercel/analytics/react';
import { STORAGE_KEYS } from './utils/storageKeys';
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


    // [GODFILE-APP] Effets de démarrage (handlers d'erreur, courbe verrouillée, SW, purge
    // persona, init sync Drive, filets migration/hydratation, provider marché, clés API,
    // sync bancaire auto, taux FX) : extraits dans hooks/useAppBootEffects.ts. ⚠️ Appelé
    // AVANT useAssetDataHydration — la config du provider marketData précède ses consommateurs.
    useAppBootEffects();

    // [GODFILE-APP] Navigation par onglet (hash + redirections héritées, titre, Alt+1..9,
    // GA4, <html lang>) : extraite dans hooks/useTabNavigation.ts.
    useTabNavigation(activeTab, setActiveTab);

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
            const flag = localStorage.getItem(STORAGE_KEYS.onboardingDone);
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

    // [GODFILE-APP] Hydratation marché des actifs (historiques, prix live, profils) :
    // extraite dans hooks/useAssetDataHydration.ts (même clé de re-déclenchement).
    useAssetDataHydration(state.assets, setAppState);

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

    // [GODFILE-APP] Corps extrait dans components/app/importReleveManuel.ts (comportement
    // inchangé — dédup + virements + audit + classification IA paresseuse).
    const handleManualImport = (rawData: string): Promise<void> => importerReleveManuel(rawData, {
        transactions: state.transactions,
        budgetItems: state.budgetItems,
        apiKeyAnthropic: state.apiKeys.anthropic,
        setAppState,
    });

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
                    localStorage.setItem(STORAGE_KEYS.onboardingDone, 'true');
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
                onGeneratePDF={() => genererRapportPdfEcran({
                    // [GODFILE-APP] Corps extrait dans components/app/exportPdfEcran.ts.
                    state, globalNetWorth, calculatedMonthlySavings, assetBreakdown, currentLiquidity,
                })}
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
        <Analytics />
        </ErrorBoundary>
    );
};
