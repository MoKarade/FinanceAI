// hooks/usePastPortfolioHistory.ts
// A1 + A2 — produit le PASSÉ réel de la valeur des comptes de placement pour le
// graphe Futur. Reconstruit (services/history) à partir des avoirs :
//   - mode test : les fixtures ont déjà `priceHistory[]` → reconstruction directe.
//   - mode réel : on va chercher l'historique quotidien Finnhub par titre
//     (getHistory) pour peupler `priceHistory[]`, puis on reconstruit.
// Toujours non bloquant : on rend d'abord la reconstruction avec ce qu'on a
// (couverture éventuellement partielle), puis on l'enrichit quand le réseau
// répond. No-fake : `coverage` < 1 signale la part estimée au prix actuel.
//
// [PH2-c-1] — le fetch Finnhub est DÉDUPLIQUÉ AU NIVEAU MODULE (cache + signatures de lot +
// notification partagés entre TOUTES les instances du hook, via useSyncExternalStore). Depuis
// PH2-c, le hook est monté 2× quand Futur est ouvert (ProjectionEngine app-level + FutureProjection) :
// avec l'état par-instance d'avant, chaque instance refaisait les MÊMES requêtes (double fetch,
// rate-limit) et pouvait diverger transitoirement (jonction passé↔futur flottante). Désormais :
// un lot de symboles n'est fetché qu'UNE fois, le résultat est poussé à toutes les instances,
// et un fetch en vol SURVIT au démontage d'une instance (l'autre en profite).

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useFinanceStore } from '../store/useFinanceStore';
import { getEffectivePurchases } from '../utils/assetPurchases';
import { getHistory, configureMarketDataProvider } from '../services/marketData';
import {
    reconstructPortfolioHistory,
    type MinimalAsset,
    type PortfolioHistoryResult,
} from '../services/history/reconstructPortfolioHistory';
import type { Asset } from '../types';

const EMPTY_RESULT: PortfolioHistoryResult = { points: [], coverage: 1, firstDate: null };

// ── [PH2-c-1] Cache de fetch au niveau MODULE (partagé entre instances) ──────
type FetchedMap = Record<string, Array<{ date: string; price: number }>>;
let _fetchedCache: FetchedMap = {};
let _loadingCount = 0;
/** Lots (signatures de symboles) déjà demandés — jamais re-fetchés (même sémantique que
 *  l'ancien `requestedRef` par-instance, mais global). */
const _requestedSigs = new Set<string>();
const _listeners = new Set<() => void>();
const _notify = () => { for (const l of _listeners) l(); };
const _subscribe = (cb: () => void) => { _listeners.add(cb); return () => { _listeners.delete(cb); }; };
// Snapshots STABLES entre notifications (réassignés uniquement avant _notify) — requis par
// useSyncExternalStore pour ne pas boucler.
const _getFetched = (): FetchedMap => _fetchedCache;
const _getLoading = (): boolean => _loadingCount > 0;

/** Reset (tests uniquement) : vide cache + signatures + compteur. */
export function _resetPastHistoryFetchCache(): void {
    _fetchedCache = {};
    _requestedSigs.clear();
    _loadingCount = 0;
    _notify();
}

// Convertit un Asset du store en entrée minimale pour la reconstruction, en
// utilisant getEffectivePurchases (gère le legacy dateBought/buyPrice).
function toMinimal(asset: Asset, priceHistoryOverride?: Array<{ date: string; price: number }>): MinimalAsset {
    return {
        symbol: asset.symbol,
        quantity: asset.quantity || 0,
        currency: asset.currency || 'CAD',
        currentPrice: asset.currentPrice || 0,
        accountType: asset.accountType,
        dateBought: asset.dateBought,
        purchases: getEffectivePurchases(asset),
        priceHistory: priceHistoryOverride
            ?? (asset.priceHistory || []).map((p) => ({ date: p.date, price: p.price })),
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

    // [PH2-c-1] priceHistory récupéré via Finnhub — lu depuis le cache MODULE partagé :
    // toutes les instances voient le même état, en même temps.
    const fetched = useSyncExternalStore(_subscribe, _getFetched);
    const isLoading = useSyncExternalStore(_subscribe, _getLoading);

    // Reconstruction immédiate avec ce qu'on a (priceHistory du store en test,
    // + ce qui a déjà été récupéré en réel).
    const result = useMemo<PortfolioHistoryResult>(() => {
        if (!assets || assets.length === 0) return EMPTY_RESULT;
        const minimal = assets.map((a) => toMinimal(a, fetched[a.symbol]));
        return reconstructPortfolioHistory(minimal, fxRates as Record<string, number>);
    }, [assets, fxRates, fetched]);

    // Mode réel : compléter priceHistory via Finnhub pour les titres qui n'en ont pas.
    useEffect(() => {
        if (isTestMode || !finnhubKey || !assets || assets.length === 0) return;

        const missing = assets.filter((a) => {
            const hasLocal = (a.priceHistory && a.priceHistory.length > 0) || fetched[a.symbol];
            return !hasLocal && a.symbol && (a.quantity || 0) !== 0;
        });
        if (missing.length === 0) return;

        // [PH2-c-1] Dédup GLOBALE : si une autre instance a déjà demandé ce lot (ou le demande
        // en ce moment), on ne relance rien — le résultat arrivera par la notification du cache.
        const sig = missing.map((a) => a.symbol).sort().join('|');
        if (_requestedSigs.has(sig)) return;
        _requestedSigs.add(sig);

        _loadingCount++;
        _notify();
        configureMarketDataProvider({ finnhubKey });

        const today = new Date();
        // PAS de flag `cancelled` : le fetch écrit le cache MODULE même si CETTE instance se
        // démonte (l'autre instance — ou un remount — en profite ; cf PH2-b worker chaud).
        (async () => {
            const next: FetchedMap = {};
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
            if (Object.keys(next).length > 0) {
                _fetchedCache = { ..._fetchedCache, ...next };
            }
            _loadingCount = Math.max(0, _loadingCount - 1);
            _notify();
        })();
    }, [assets, finnhubKey, isTestMode, fetched]);

    return { ...result, isLoading };
}
