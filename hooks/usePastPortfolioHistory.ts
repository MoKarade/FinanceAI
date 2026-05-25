// hooks/usePastPortfolioHistory.ts
// A1 + A2 — produit le PASSÉ réel de la valeur des comptes de placement pour le
// graphe Futur. Reconstruit (services/history) à partir des avoirs :
//   - mode test : les fixtures ont déjà `priceHistory[]` → reconstruction directe.
//   - mode réel : on va chercher l'historique quotidien Finnhub par titre
//     (getHistory) pour peupler `priceHistory[]`, puis on reconstruit.
// Toujours non bloquant : on rend d'abord la reconstruction avec ce qu'on a
// (couverture éventuellement partielle), puis on l'enrichit quand le réseau
// répond. No-fake : `coverage` < 1 signale la part estimée au prix actuel.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFinanceStore } from '../store/useFinanceStore';
import { getEffectivePurchases } from '../utils/assetPurchases';
import { getHistory, configureMarketDataProvider } from '../services/marketData';
import {
    reconstructPortfolioHistory,
    type MinimalAsset,
    type PortfolioHistoryResult,
} from '../services/history/reconstructPortfolioHistory';

const EMPTY_RESULT: PortfolioHistoryResult = { points: [], coverage: 1, firstDate: null };

// Convertit un Asset du store en entrée minimale pour la reconstruction, en
// utilisant getEffectivePurchases (gère le legacy dateBought/buyPrice).
function toMinimal(asset: any, priceHistoryOverride?: Array<{ date: string; price: number }>): MinimalAsset {
    return {
        symbol: asset.symbol,
        quantity: asset.quantity || 0,
        currency: asset.currency || 'CAD',
        currentPrice: asset.currentPrice || 0,
        accountType: asset.accountType,
        dateBought: asset.dateBought,
        purchases: getEffectivePurchases(asset),
        priceHistory: priceHistoryOverride
            ?? (asset.priceHistory || []).map((p: any) => ({ date: p.date, price: p.price })),
    };
}

export interface UsePastPortfolioHistoryResult extends PortfolioHistoryResult {
    isLoading: boolean;
}

export function usePastPortfolioHistory(): UsePastPortfolioHistoryResult {
    const assets = useFinanceStore((s) => s.assets);
    const fxRates = useFinanceStore((s) => s.fxRates);
    const finnhubKey = useFinanceStore((s) => s.apiKeys.finnhub);
    const isTestMode = useFinanceStore((s) => s.isTestMode);

    // priceHistory récupéré via Finnhub (mode réel), indexé par symbole.
    const [fetched, setFetched] = useState<Record<string, Array<{ date: string; price: number }>>>({});
    const [isLoading, setIsLoading] = useState(false);
    const requestedRef = useRef<string>('');

    // Reconstruction immédiate avec ce qu'on a (priceHistory du store en test,
    // + ce qui a déjà été récupéré en réel).
    const result = useMemo<PortfolioHistoryResult>(() => {
        if (!assets || assets.length === 0) return EMPTY_RESULT;
        const minimal = assets.map((a: any) => toMinimal(a, fetched[a.symbol]));
        return reconstructPortfolioHistory(minimal, fxRates as Record<string, number>);
    }, [assets, fxRates, fetched]);

    // Mode réel : compléter priceHistory via Finnhub pour les titres qui n'en ont pas.
    useEffect(() => {
        if (isTestMode || !finnhubKey || !assets || assets.length === 0) return;

        const missing = assets.filter((a: any) => {
            const hasLocal = (a.priceHistory && a.priceHistory.length > 0) || fetched[a.symbol];
            return !hasLocal && a.symbol && (a.quantity || 0) !== 0;
        });
        if (missing.length === 0) return;

        // Évite de relancer le même lot de symboles en boucle.
        const sig = missing.map((a: any) => a.symbol).sort().join('|');
        if (requestedRef.current === sig) return;
        requestedRef.current = sig;

        let cancelled = false;
        setIsLoading(true);
        configureMarketDataProvider({ finnhubKey });

        const today = new Date();
        (async () => {
            const next: Record<string, Array<{ date: string; price: number }>> = {};
            for (const a of missing) {
                const purchases = getEffectivePurchases(a);
                const firstDate = purchases.length ? purchases[0].date : a.dateBought;
                if (!firstDate) continue;
                try {
                    const hist = await getHistory(a.symbol, new Date(`${firstDate}T00:00:00Z`), today);
                    if (hist.length > 0) {
                        next[a.symbol] = hist.map((h) => ({ date: h.date, price: h.close }));
                    }
                } catch {
                    // titre introuvable / rate limit : on laisse l'estimation au prix actuel.
                }
            }
            if (!cancelled && Object.keys(next).length > 0) {
                setFetched((prev) => ({ ...prev, ...next }));
            }
            if (!cancelled) setIsLoading(false);
        })();

        return () => { cancelled = true; };
    }, [assets, finnhubKey, isTestMode, fetched]);

    return { ...result, isLoading };
}
