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

export interface UsePortfolioHistoryResult {
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
    /** [PERF-STALE-TAIL-ZERO] Clés `${date}|${symbol}` raccordées au prix courant (candles KO, quote
     *  fraîche) → `seriesReturnPct` rend « — » plutôt qu'un 0 % trompeur si latest ET baseline le sont. */
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
            };
        }
        const { rows, noHistorySymbols, partialHistorySymbols, staleTailSymbols, syntheticTailKeys } = buildMarketData(assets, fxRates as Record<string, number>);
        return { history: rows, isLoading: false, error: null, noHistorySymbols, partialHistorySymbols, staleTailSymbols, syntheticTailKeys };
    }, [isTestMode, assets, initialBalances, fxRates]);

    return result;
}
