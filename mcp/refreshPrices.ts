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
import { fetchFxRates } from '../services/finance';
import { champsFxApres, ecritureFxSelonLecture, type LectureFxComplete } from '../services/fx/ecritureFx';
import { decisionEcritureFx, type FxCause } from '../services/fx/provenance';

/** [FX-SERVEUR-JAMAIS-RAFRAICHI] Ce que la passe a fait des taux de change.
 *  `taux` = taux, provenance et date écrits ; `diagnostic` = seule la trace de la tentative (une
 *  lecture sans autorité n'écrase pas un taux saisi à la main) ; `aucune` = rien de neuf ;
 *  `echec` = la lecture a levé (les PRIX sont quand même rafraîchis). */
type FxOutcome =
    | { ecriture: 'taux' | 'diagnostic' | 'aucune'; cause: FxCause }
    | { ecriture: 'echec'; erreur: string };

interface PriceRefreshOutcome {
    /** Symboles dont le prix a réellement changé (et donc l'état réécrit). */
    refreshed: string[];
    /** Symboles quotés au même prix (aucun patch). */
    unchanged: string[];
    /** Symboles non rafraîchis + raison honnête. */
    skipped: Array<{ symbol: string; reason: PriceSkipReason }>;
    /** Un nouvel état a-t-il été écrit dans Drive ? (false si ni un prix ni les taux n'ont changé). */
    saved: boolean;
    /** [FX-SERVEUR-JAMAIS-RAFRAICHI] Taux de la Banque du Canada. */
    fx: FxOutcome;
}

/** Dépendances injectables (tests) ; défaut = source unique marketData (Finnhub/CoinGecko). */
type PriceRefreshServerDeps = Partial<Pick<PriceRefreshDeps, 'getQuote' | 'hasProvider' | 'sleep' | 'delayMs' | 'now'>> & {
    /** Lecture des taux ; défaut = la Banque du Canada, caches court-circuités (geste planifié). */
    lireTauxFx?: () => Promise<LectureFxComplete>;
};

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

    // [FX-SERVEUR-JAMAIS-RAFRAICHI] Les taux de la Banque du Canada n'étaient lus QUE par le
    // navigateur, au démarrage : le hub et le MCP valorisaient les titres étrangers au taux de la
    // dernière ouverture de l'app. Même décision et même écriture que le navigateur (source unique
    // `services/fx/ecritureFx.ts`) — dont la règle qui compte : une Banque du Canada injoignable
    // depuis le serveur n'écrase JAMAIS un taux saisi à la main ni un taux de marché déjà lu.
    // ⚠️ Un échec de lecture ne bloque pas les PRIX : il est RAPPORTÉ (`fx.ecriture: 'echec'`), jamais
    // avalé. `fetchFxRates` encode déjà réseau/HTTP/réponse illisible dans `cause` ; ce `catch` ne
    // couvre que l'imprévu.
    let fx: FxOutcome;
    let champsFx: ReturnType<typeof champsFxApres> | null = null;
    try {
        const lecture = await (deps?.lireTauxFx ?? (() => fetchFxRates({ force: true })))();
        const ecriture = ecritureFxSelonLecture(state, lecture);
        if (ecriture) champsFx = champsFxApres(state, ecriture);
        // Le RAPPORT relit la même décision pure (`ecritureFxSelonLecture` la prend aussi) : aucune
        // déduction à partir de l'écriture, qui ne dit pas laquelle des deux branches l'a produite.
        const quoi = decisionEcritureFx(state, lecture);
        fx = { ecriture: quoi === 'tout' ? 'taux' : quoi === 'diagnostic' ? 'diagnostic' : 'aucune', cause: lecture.cause };
    } catch (e) {
        fx = { ecriture: 'echec', erreur: e instanceof Error ? e.message : String(e) };
    }

    // Ni cours ni taux changés → AUCUNE écriture (pas de push parasite, pas de conflit inutile).
    if (result.patches.size === 0 && champsFx === null) {
        return { refreshed: [...result.refreshed], unchanged: [...result.unchanged], skipped, saved: false, fx };
    }

    const nextAssets = result.patches.size === 0 ? state.assets : applyPricePatches(state.assets, result.patches);
    const nextState: typeof state = { ...state, assets: nextAssets, ...(champsFx ?? {}) };

    // OCC : n'écrit que si le blob Drive n'a pas bougé depuis la lecture ci-dessus.
    await store.save(nextState, version);

    return { refreshed: [...result.refreshed], unchanged: [...result.unchanged], skipped, saved: true, fx };
}
