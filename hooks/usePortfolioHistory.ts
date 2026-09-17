// hooks/usePortfolioHistory.ts
//
// [PORTFOLIO-HISTORY] Fournit les lignes `MarketDataPoint` des graphes (Dashboard « Évolution
// détaillée », Investissements « Performance comparée », modal de comparaison) :
//  - mode TEST : marketData synthétique généré depuis les fixtures persona (inchangé) ;
//  - mode RÉEL : DÉRIVÉ des avoirs du store — priceHistory daté (hydraté au boot par
//    hydrateAssetHistories via Finnhub → repli Yahoo → CoinGecko) × détention DCA à la date t ×
//    taux de change → valeur CAD par symbole + totaux (buildMarketData, pur).
//
// AVANT : fetch d'un CSV Google Sheet SUPPRIMÉ (stub `[]`) → tous les graphes de cours étaient
// VIDES en données réelles (bug Marc 2026-07-22) alors qu'ils marchaient en mode démo — l'illusion
// venait des fixtures. Plus AUCUN réseau ici : l'hydratation écrit le store, ce hook ne fait que
// dériver (les graphes se remplissent au fil de l'hydratation via la réactivité du store).

import { useMemo } from 'react';
import type { MarketDataPoint } from '../services/finance';
import { useFinanceStore } from '../store/useFinanceStore';
import { generateTestMarketData } from '../services/testFixtures';
import { buildMarketData } from '../services/history/buildMarketData';

interface UsePortfolioHistoryResult {
    history: MarketDataPoint[];
    isLoading: boolean;
    error: Error | null;
    /** [HIST-COVERAGE-TOTAL] Symboles détenus SANS historique de prix : pas de courbe, mais INCLUS
     *  au TOTAL à leur valeur actuelle (`valueCad` ; 0 = aucun prix connu → non compté). */
    noHistorySymbols: Array<{ symbol: string; valueCad: number }>;
    /** Symboles à historique PARTIEL (commence après le 1er achat — provider borné, ex. CoinGecko 365 j) :
     *  avant `historyStart`, le titre compte à son PREMIER cours connu (approximation signalée). */
    partialHistorySymbols: Array<{ symbol: string; historyStart: string }>;
    /** Symboles à queue d'historique PÉRIMÉE sans quote fraîche : absents du total des derniers jours. */
    staleTailSymbols: Array<{ symbol: string; lastKnownDate: string }>;
    /** [HUB-TOTAL-AMPUTE] Clés `[date, symbole]` d'un titre DÉTENU absent du `TOTAL` de cette date.
     *  À TOUTE date, contrairement à `staleTailSymbols` qui ne couvre que la dernière — donc le
     *  seul inventaire utilisable par un consommateur qui compare DEUX dates. */
    omittedKeys: Set<string>;
    /** [PERF-STALE-TAIL-ZERO] Clés `JSON.stringify([date, symbol])` raccordées au prix courant (candles
     *  KO, quote fraîche) → `seriesReturnPct` rend « — » plutôt qu'un 0 % trompeur si latest ET baseline
     *  le sont. Sérialisation JSON (pas `date|symbol`) : un symbole manuel peut contenir « | ». */
    syntheticTailKeys: Set<string>;
}

export function usePortfolioHistory(): UsePortfolioHistoryResult {
    const isTestMode = useFinanceStore(s => s.isTestMode);
    const assets = useFinanceStore(s => s.assets);
    const initialBalances = useFinanceStore(s => s.initialBalances);
    const fxRates = useFinanceStore(s => s.fxRates);

    const result = useMemo<UsePortfolioHistoryResult>(() => {
        if (isTestMode) {
            return {
                history: generateTestMarketData(assets, initialBalances as Record<string, number>),
                isLoading: false,
                error: null,
                noHistorySymbols: [],
                partialHistorySymbols: [],
                staleTailSymbols: [],
                syntheticTailKeys: new Set(),
                omittedKeys: new Set(),
            };
        }
        // [HUB-TOTAL-AMPUTE] `omittedKeys` est EXPOSÉ : un inventaire que le hook garde pour lui
        // ne protège personne — c'est le défaut exact que ce lot a trouvé un étage plus haut
        // (`UN-INVENTAIRE-N-EST-UNE-PROTECTION-QUE-POUR-QUI-LE-LIT`). ⚠️ Ici `buildMarketData` est
        // appelé SANS `maxPoints`, donc `rows` est décimé (500 points) alors que `omittedKeys` ne
        // l'est pas : c'est sans danger, l'inventaire reste un SUR-ensemble des dates des lignes
        // (`downsample` ne fait que SÉLECTIONNER des lignes existantes, il n'en fabrique aucune).
        const { rows, noHistorySymbols, partialHistorySymbols, staleTailSymbols, syntheticTailKeys, omittedKeys } = buildMarketData(assets, fxRates as Record<string, number>);
        return { history: rows, isLoading: false, error: null, noHistorySymbols, partialHistorySymbols, staleTailSymbols, syntheticTailKeys, omittedKeys };
    }, [isTestMode, assets, initialBalances, fxRates]);

    return result;
}
