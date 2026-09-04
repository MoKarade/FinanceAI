// store/migrationsPersistees.ts
// [GODFILE-STORE] Migrations du blob persisté `financeai-storage` (v1→v7), extraites telles
// quelles de useFinanceStore.ts (lot 158). La version courante (7) reste déclarée dans les
// options de persistance, à côté de son consommateur.
import type { AppState } from '../types';
import { logError } from '../services/errorLogger';
import type { FinanceState } from './useFinanceStore';

/** Type de migration : union de l'état courant + champs legacy des versions précédentes. */
type MigratingState = Partial<FinanceState> & {
    apiKeys?: { gemini?: string; anthropic?: string; finnhub?: string };
    retirementGoal?: Partial<FinanceState['retirementGoal']> & { lifeExpectancy?: number };
    assets?: unknown[];
    isTestMode?: boolean;
    realDataSnapshot?: Partial<AppState> | null;
    activeTestPersonaId?: string | null;
};

/**
 * Migrations du state persisté (`financeai-storage`). Extrait du `persist()` pour être testable
 * unitairement (cf tests/store/migratePersistedState.test.ts). Chaque palier est chaîné : un vieux
 * blob v3 traverse v3→v4→…→v7. Sans ça, toute évolution de la forme du state casse silencieusement
 * le boot des utilisateurs existants.
 */
export function migratePersistedState(persistedState: unknown, fromVersion: number): unknown {
    // [STORE-REHYDRATE-SILENT, audit 2026-07-16] Un palier qui LÈVE (blob inattendu/corrompu) doit être
    // DIAGNOSTICABLE : on trace le palier fautif puis on RELANCE — l'erreur remonte à `onRehydrateStorage`
    // (le filet, cf config persist) qui journalise en critique + lève la bannière. Ne JAMAIS avaler ici :
    // continuer sur un blob à moitié migré serait pire que l'état initial.
    let palier = 'init';
    try {
        return migratePersistedStateUnsafe(persistedState, fromVersion, (p) => { palier = p; });
    } catch (e) {
        logError({
            source: 'storage', severity: 'critical',
            message: `Migration du state persisté ÉCHOUÉE au palier « ${palier} » (v${fromVersion}→v7) — réhydratation abandonnée.`,
            error: e instanceof Error ? e : new Error(String(e)),
        });
        throw e;
    }
}

function migratePersistedStateUnsafe(
    persistedState: unknown,
    fromVersion: number,
    step: (palier: string) => void,
): unknown {
    let state = persistedState as MigratingState;
    // v0/undefined → v1 : intro versioning
    step('v0→v1');
    if (fromVersion === undefined || fromVersion < 1) {
        state = state as MigratingState;
    }
    // v1 → v2 : Phase 4 A1 — ajout apiKeys.anthropic (gemini gardé).
    // v2 → v3 : Phase 4 A5 — suppression de apiKeys.gemini (pas de copie vers anthropic, formats ≠).
    step('v2→v3 (apiKeys)');
    if (fromVersion < 3 && state?.apiKeys) {
        const apiKeys = state.apiKeys;
        state = { ...state, apiKeys: { anthropic: apiKeys.anthropic || '' } } as MigratingState;
    }
    // v3 → v4 : §7.F.5 — ajout apiKeys.finnhub pour le data sourcing marketData (default vide).
    step('v3→v4 (finnhub)');
    if (fromVersion < 4 && state?.apiKeys) {
        const apiKeys = state.apiKeys;
        state = {
            ...state,
            apiKeys: { anthropic: apiKeys.anthropic || '', finnhub: apiKeys.finnhub || '' },
        } as MigratingState;
    }
    // v4 → v5 : Phase C.3 — `lifeExpectancy` migré du state local Retirement.tsx vers
    //   retirementGoal global (default 90).
    step('v4→v5 (lifeExpectancy)');
    if (fromVersion < 5 && state?.retirementGoal) {
        const rg = state.retirementGoal;
        if (rg.lifeExpectancy === undefined) {
            state = { ...state, retirementGoal: { ...rg, lifeExpectancy: 90 } } as MigratingState;
        }
    }
    // v5 → v6 : Phase E.8 — DCA multi-achat (dateBought+buyPrice+quantity → purchases[]).
    //   Les champs legacy restent pour rétrocompat.
    step('v5→v6 (purchases DCA)');
    if (fromVersion < 6 && Array.isArray(state?.assets)) {
        type LegacyAsset = { dateBought?: string; buyPrice?: number; quantity?: number; purchases?: unknown };
        state = {
            ...state,
            assets: (state.assets as LegacyAsset[]).map((a: LegacyAsset) => {
                if (Array.isArray(a.purchases) && a.purchases.length > 0) return a;
                if (a.dateBought && typeof a.buyPrice === 'number' && a.buyPrice > 0 && a.quantity && a.quantity > 0) {
                    return { ...a, purchases: [{ date: a.dateBought, quantity: a.quantity, price: a.buyPrice }] };
                }
                return a;
            }),
        } as MigratingState;
    }
    // v6 → v7 : le MODE TEST ne doit JAMAIS être persisté (bug 2026-05-29 : l'auto-push Drive
    //   envoyait des données persona et écrasait la vraie sauvegarde). Si un blob a été figé en
    //   mode test, on restaure les vraies données depuis realDataSnapshot, puis on purge les
    //   champs de test (ils ne seront plus jamais réécrits — cf partialize).
    step('v6→v7 (purge mode test)');
    if (fromVersion < 7) {
        if (state?.isTestMode && state.realDataSnapshot) {
            state = { ...state, ...state.realDataSnapshot } as MigratingState;
        }
        const cleaned = { ...(state as Record<string, unknown>) };
        delete cleaned.isTestMode;
        delete cleaned.realDataSnapshot;
        delete cleaned.activeTestPersonaId;
        state = cleaned as MigratingState;
    }
    return state;
}

