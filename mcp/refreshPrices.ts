// mcp/refreshPrices.ts
//
// [HUB-REFRESH-CRON] Rafraîchissement AUTONOME des prix côté serveur (Cloud Run), déclenché de
// l'extérieur (GitHub Actions planifié). Objectif : la valeur nette du hub/de l'app suit les
// marchés SANS que l'utilisateur ouvre l'app navigateur (qui, seule, poussait jusqu'ici l'état
// dans Drive → tout figeait dès l'onglet fermé).
//
// Ce module NE fait QUE des prix : il lit l'état Drive, rafraîchit les `currentPrice` via le
// moteur PARTAGÉ `refreshAssetPrices` (services/priceRefresh — devise protégée, changement réel
// uniquement, provider-aware), applique les patches, et RÉÉCRIT le blob Drive avec la garde de
// concurrence OCC (`save(next, version)` — refuse d'écraser si l'app a poussé entre-temps). Les
// données SAISIES (dettes, budgets, relevés) ne sont JAMAIS touchées : `applyPricePatches` ne
// modifie que des champs DÉRIVÉS du cours d'un actif — `currentPrice`/`priceUpdatedAt`, la
// `performance` recalculée, et (self-heal uniquement) la `currency` d'un actif legacy SANS devise,
// jamais une devise saisie. Aucun prix inventé (no-fake-data) : un symbole non quotable est SKIPPÉ.
//
// force:true — le déclencheur planifié est un geste EXPLICITE (≠ boot navigateur) : on outrepasse
// la garde d'intervalle 5 min de `refreshAssetPrices` (sinon deux passes rapprochées seraient
// sautées) ; le pacing intra-passe (2 500 ms) et le cache quote 5 min protègent toujours les quotas.

import type { StateStore } from './state/stateStore';
import {
    refreshAssetPrices,
    applyPricePatches,
    type PriceRefreshDeps,
    type PriceSkipReason,
} from '../services/priceRefresh';
import { getQuote, canAttemptQuote } from '../services/marketData';

interface PriceRefreshOutcome {
    /** Symboles dont le prix a réellement changé (et donc l'état réécrit). */
    refreshed: string[];
    /** Symboles quotés au même prix (aucun patch). */
    unchanged: string[];
    /** Symboles non rafraîchis + raison honnête. */
    skipped: Array<{ symbol: string; reason: PriceSkipReason }>;
    /** Un nouvel état a-t-il été écrit dans Drive ? (false si aucun prix n'a changé). */
    saved: boolean;
}

/** Dépendances injectables (tests) ; défaut = source unique marketData (Finnhub/CoinGecko). */
type PriceRefreshServerDeps = Partial<Pick<PriceRefreshDeps, 'getQuote' | 'hasProvider' | 'sleep' | 'delayMs' | 'now'>>;

/**
 * Rafraîchit les prix de l'état du store et réécrit Drive si (et seulement si) un cours a changé.
 * @throws si la source n'est pas inscriptible, ou en cas de conflit OCC (l'app a poussé entre-temps
 *         — rien n'est écrasé ; le déclencheur planifié réessaiera au prochain tick).
 */
export async function runPriceRefresh(
    store: StateStore,
    deps?: PriceRefreshServerDeps,
): Promise<PriceRefreshOutcome> {
    if (!store.canWrite) {
        throw new Error('Source d\'état non inscriptible : rafraîchissement des prix impossible.');
    }

    // Lecture ATOMIQUE état + jeton de version (pour l'OCC du save).
    const { state, version } = await store.getWithVersion();

    const result = await refreshAssetPrices(
        state.assets,
        {
            getQuote: deps?.getQuote ?? getQuote,
            // [QUOTE-NEGATIVE-CACHE] négative-aware comme le boot app (« fix porté à toutes les
            // surfaces ») — un symbole connu-mort ne paie pas le pacing 2,5 s ici non plus.
            hasProvider: deps?.hasProvider ?? canAttemptQuote,
            sleep: deps?.sleep,
            delayMs: deps?.delayMs,
            now: deps?.now,
        },
        { force: true },
    );

    const skipped = result.skipped.map((s) => ({ symbol: s.symbol, reason: s.reason }));

    // Aucun cours n'a changé → AUCUNE écriture (pas de push parasite, pas de conflit inutile).
    if (result.patches.size === 0) {
        return { refreshed: [...result.refreshed], unchanged: [...result.unchanged], skipped, saved: false };
    }

    const nextAssets = applyPricePatches(state.assets, result.patches);
    const nextState: typeof state = { ...state, assets: nextAssets };

    // OCC : n'écrit que si le blob Drive n'a pas bougé depuis la lecture ci-dessus.
    await store.save(nextState, version);

    return { refreshed: [...result.refreshed], unchanged: [...result.unchanged], skipped, saved: true };
}
