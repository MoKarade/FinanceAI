import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AppState, Tab } from '../types';
import type { ProjectionResult } from '../services/projection/types';
import { quotaStorage } from '../services/quotaStorage';
import { saveLockedProjection, clearLockedProjection } from '../services/lockedProjectionStore';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { initialState } from './etatParDefaut';
import { migratePersistedState } from './migrationsPersistees';
import { creerActionsModeTest } from './actionsModeTest';
import { fusionnerEtatPersiste, surRehydratation, extrairePersistable } from './optionsPersistance';

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
    /** [ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] Phrase à montrer quand une ENTRÉE du moteur est
     *  illisible (valeur non finie restaurée d'un backup, d'une sync Drive, d'un import). Elle NOMME
     *  le champ et la personne : « ouvre Future » ne répare pas une donnée corrompue.
     *  `null` = rien à refuser. Transitoire (NON persisté) : c'est un état DÉRIVÉ de l'état
     *  persisté, le sauvegarder le ferait survivre à la correction du champ. */
    projectionRefus: string | null;
    /** PH2-d — courbe VERROUILLÉE : snapshot complet d'un ProjectionResult choisi par l'utilisateur.
     *  TRANSITOIRE en mémoire (NON dans le persist localStorage — trop gros) ; persisté CHIFFRÉ en
     *  IndexedDB (services/lockedProjectionStore) et restauré au boot si `isProjectionLocked`. */
    lockedProjection: ProjectionResult | null;
    /** PH2-d — vrai si une courbe est verrouillée. Persisté (booléen ADDITIF, pas de bump v7) ;
     *  le gros blob `lockedProjection` vit en IndexedDB. */
    isProjectionLocked: boolean;
    /** [PROJECTION-PERSIST 2026-07-16] Signature des inputs de la DERNIÈRE projection RÉVÉLÉE par
     *  l'utilisateur (clic « Calculer »/« Appliquer »). Persistée (string ADDITIVE, pas de bump v7,
     *  synchronisée Drive → cross-PC) : au reload/changement de page/autre appareil, la courbe reste
     *  affichée au lieu de re-demander un calcul (demande Marc). null = jamais révélé.
     *  Si les inputs divergent (sig ≠ courante), l'UI FIGE l'ancienne courbe (blob IDB, cf
     *  lockedProjectionStore record `revealed`) + badge « pas à jour » (choix Marc : figer, pas recalculer). */
    revealedProjectionSig: string | null;
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
    setProjectionRefus: (m: string | null) => void;
    /** PH2-d — verrouille la courbe courante (snapshot mémoire + persistance IndexedDB chiffrée). */
    lockProjection: (r: ProjectionResult) => void;
    /** PH2-d — déverrouille (efface le snapshot mémoire ET l'entrée IndexedDB). */
    unlockProjection: () => void;
    /** PH2-d — restaure la courbe verrouillée depuis IndexedDB au boot (sans ré-écrire l'IDB). */
    setLockedProjection: (r: ProjectionResult | null) => void;
    /** [PROJECTION-PERSIST] fixe/efface la signature de la projection révélée (null = re-gate). */
    setRevealedProjectionSig: (sig: string | null) => void;
    /** Navigate to a tab with an optional section to scroll/focus on arrival. */
    navigateWithFocus: (tab: Tab, section?: string) => void;
    /** Called by the destination page after it has consumed the focus intent. */
    clearPendingFocus: () => void;
    updateFxRates: (rates: { USD: number; EUR: number; CAD: number; lastFetched?: number; estimated?: boolean }) => void;
    updateApiKeys: (keys: { anthropic: string; finnhub?: string }) => void;
    updateLastUpdate: () => void;
    resetState: () => void;
    /** Active le mode test : sauvegarde l'état actuel + applique des fixtures.
     *  `personaId` (optionnel) identifie le persona chargé pour le banner. */
    enableTestMode: (fixtures: Partial<AppState>, personaId?: string | null) => void;
    /** Désactive le mode test : restaure l'état sauvegardé. */
    disableTestMode: () => void;
    /** [PERSONA-PURGE] Retire du mode RÉEL tout artefact de persona de test (ids déterministes).
     *  No-op en mode test. Rend le nombre d'items retirés (0 = déjà propre). */
    purgePersonaArtifacts: () => number;
}


// [GODFILE-STORE] Ré-exports de compatibilité : les consommateurs (composants, services, tests)
// importent ces symboles depuis CE module depuis toujours — la façade les garde adressables.
export { personaResetBase, getInitialStateWithMigration, getMigrationStatus } from './etatParDefaut';
export { migratePersistedState } from './migrationsPersistees';
export { getHydrationStatus } from './optionsPersistance';

export const useFinanceStore = create<FinanceState>()(
    persist(
        (set, get) => ({
            ...initialState,
            // [REFONTE-NAV Lot 1] L'app s'ouvre sur la courbe Future (l'Accueil est retiré —
            // GO Marc 2026-08-12). activeTab n'est pas persisté : ce défaut vaut à chaque boot.
            activeTab: Tab.FUTURE,
            isPrivacyMode: false,
            lastProjection: null,
            projectionRunMC: true,
            projectionStatus: 'idle',
            projectionRefus: null,
            lockedProjection: null,
            isProjectionLocked: false,
            revealedProjectionSig: null,
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
            setProjectionRefus: (m) => set({ projectionRefus: m }),
            // PH2-d — verrou : état sync (source de vérité = Zustand) + persistance IndexedDB best-effort.
            // Fire-and-forget VOULU : le set d'UI ne doit pas attendre une écriture disque, et une écriture
            // ratée n'invalide pas le verrou en mémoire (l'IDB n'est qu'un cache de RESTAURATION au reload).
            // Le module logue ses propres échecs et ne lève jamais.
            lockProjection: (r) => { set({ lockedProjection: r, isProjectionLocked: true }); void saveLockedProjection(r); },
            unlockProjection: () => { set({ lockedProjection: null, isProjectionLocked: false }); void clearLockedProjection(); },
            // Boot uniquement : pose le blob restauré depuis l'IDB (réconcilie le booléen persisté
            // avec le contenu réel — si l'IDB est vide/illisible, r=null → on retombe déverrouillé).
            setLockedProjection: (r) => set({ lockedProjection: r, isProjectionLocked: r !== null }),
            setRevealedProjectionSig: (sig) => set({ revealedProjectionSig: sig }),
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
            updateFxRates: ({ estimated, ...rates }) => set((prev) => ({
                // [FX-FALLBACK-SILENCIEUX] `estimated` vit SIBLING de fxRates (jamais dans l'objet
                // lui-même — il resterait un Record<string, number> pour ses ~13 consommateurs).
                fxRates: { ...prev.fxRates, ...rates },
                fxRatesEstimated: estimated ?? prev.fxRatesEstimated,
            })),
            updateApiKeys: (keys) => set((prev) => ({
                apiKeys: { ...prev.apiKeys, ...keys }
            })),
            updateLastUpdate: () => set({ lastUpdate: Date.now() }),
            // `set` fait un merge superficiel et `initialState` (AppState) ne contient PAS les flags
            // propres au store (isTestMode/realDataSnapshot/activeTestPersonaId) → on les remet
            // explicitement, sinon un reset déclenché EN mode test n'en sortirait jamais (bannière figée).
            resetState: () => set({ ...initialState, isTestMode: false, realDataSnapshot: null, activeTestPersonaId: null }),

            ...creerActionsModeTest(set, get),
        }),
        {
            name: STORAGE_KEYS.persistStore,
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
            // Les trois portes (fusion typée, filet d'échec, sélection des clés) vivent dans
            // `optionsPersistance.ts` — corps extraits tels quels au lot 158 ; la CONFIG
            // (name/version/storage/migrate) reste ICI, à côté du create().
            merge: fusionnerEtatPersiste,
            onRehydrateStorage: surRehydratation,
            partialize: extrairePersistable,
        }
    )
);
