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
// [PERF-MARKETDATA-DYNIMPORT-INERTE] Ce hook est monté au niveau App (ProjectionEngine) → il est
// dans le chunk d'ENTRÉE : pas d'import statique de valeurs marketData (voir lazy.ts).
import { loadMarketData } from '../services/marketData/lazy';
import { logError } from '../services/errorLogger';
import {
    reconstructPortfolioHistory,
    type MinimalAsset,
    type PortfolioHistoryResult,
} from '../services/history/reconstructPortfolioHistory';
import type { Asset } from '../types';

/**
 * [HISTORY-OBJET-VIDE-PARTAGE] Une FABRIQUE, pas une constante — troisième site de la même classe,
 * celui que le ticket ne nommait pas. Le chemin « aucun actif » renvoyait une constante de MODULE,
 * partagée par toutes les instances du hook et tous les rendus : un tri posé sur `points` par
 * n'importe quel consommateur y restait pour la vie du processus.
 *
 * ⚠️ Ce que ça change vraiment pour les rendus — la première version de ce commentaire affirmait
 * « la référence ne change que là où elle changeait déjà », et c'était FAUX (finding code-reviewer).
 * Avant, une ré-exécution du `useMemo` qui retombait sur la branche vide rendait la MÊME constante,
 * donc l'aval ne bougeait pas ; désormais elle rend un `points` neuf. Les consommateurs qui
 * mémoïsent sur `pastHistory.points` (`useSimulationParams`, `FutureProjection`) recalculent donc à
 * chaque ré-exécution du memo sur cette branche — et ce recalcul n'est pas gratuit : `buildPastPrefix`
 * rejoue `reconstructCashHistory` sur toutes les transactions, un travail qui ne dépend pas des points.
 *
 * C'est assumé, et voici la borne exacte : ça ne concerne QUE le cas « aucun actif », et il faut pour
 * cela qu'une des quatre dépendances du memo (`assets`, `fxRates`, `fetched`, `isTestMode`) change de
 * référence — `fetched` ne bouge pas sans actif (le fetch sort tôt), donc en pratique le boot et la
 * bascule du mode test. Un recalcul ponctuel, jamais une boucle. Stabiliser la référence par instance
 * (un `useRef`) coûterait un mécanisme de plus pour un gain non mesuré ; si un jour ce hook apparaît
 * dans un profil, c'est ici qu'il faut regarder.
 */
const emptyResult = (): PortfolioHistoryResult => ({ points: [], coverage: 1, firstDate: null });

// ── [PH2-c-1] Cache de fetch au niveau MODULE (partagé entre instances) ──────
type FetchedMap = Record<string, Array<{ date: string; price: number }>>;
let _fetchedCache: FetchedMap = {};
let _loadingCount = 0;
/** Symboles déjà demandés (clé incluse : `finnhubKey::symbol`). Un symbole demandé SANS résultat
 *  est RETIRÉ en fin de lot → retry possible (rate-limit transitoire, clé corrigée). */
const _requestedSymbols = new Set<string>();
const _listeners = new Set<() => void>();
const _notify = () => { for (const l of _listeners) l(); };
const _subscribe = (cb: () => void) => { _listeners.add(cb); return () => { _listeners.delete(cb); }; };
// Snapshots STABLES entre notifications (réassignés uniquement avant _notify) — requis par
// useSyncExternalStore pour ne pas boucler.
const _getFetched = (): FetchedMap => _fetchedCache;
const _getLoading = (): boolean => _loadingCount > 0;

/** Reset (tests uniquement) : vide cache + symboles demandés + compteur. */
export function _resetPastHistoryFetchCache(): void {
    _fetchedCache = {};
    _requestedSymbols.clear();
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
    // + ce qui a déjà été récupéré en réel). ⚠️ Revue #245 (M3) : en mode TEST, on n'applique PAS
    // le cache Finnhub — un fetch réel résolu APRÈS la bascule en test polluerait sinon la fixture
    // d'un symbole partagé (XEQT réel vs XEQT persona) → fuite réel→test.
    const result = useMemo<PortfolioHistoryResult>(() => {
        if (!assets || assets.length === 0) return emptyResult();
        const minimal = assets.map((a) => toMinimal(a, isTestMode ? undefined : fetched[a.symbol]));
        return reconstructPortfolioHistory(minimal, fxRates as Record<string, number>);
    }, [assets, fxRates, fetched, isTestMode]);

    // Mode réel : compléter priceHistory via Finnhub pour les titres qui n'en ont pas.
    useEffect(() => {
        if (isTestMode || !finnhubKey || !assets || assets.length === 0) return;

        const missing = assets.filter((a) => {
            const hasLocal = (a.priceHistory && a.priceHistory.length > 0) || fetched[a.symbol];
            return !hasLocal && a.symbol && (a.quantity || 0) !== 0;
        });
        if (missing.length === 0) return;

        // [PH2-c-1, durci revue #245] Dédup GLOBALE par SYMBOLE (pas par lot) et par CLÉ :
        //  - par symbole : un actif ajouté pendant un fetch en vol ne re-déclenche QUE lui ;
        //  - clé incluse : corriger une clé Finnhub invalide ré-autorise le fetch ;
        //  - un symbole demandé SANS résultat est RETIRÉ du Set en fin de lot → retry possible au
        //    prochain changement de deps (rate-limit transitoire ≠ blocage de session).
        const toFetch = missing.filter((a) => !_requestedSymbols.has(`${finnhubKey}::${a.symbol}`));
        if (toFetch.length === 0) return;
        for (const a of toFetch) _requestedSymbols.add(`${finnhubKey}::${a.symbol}`);

        _loadingCount++;
        _notify();

        const today = new Date();
        // PAS de flag `cancelled` : le fetch écrit le cache MODULE même si CETTE instance se
        // démonte (l'autre instance — ou un remount — en profite ; cf PH2-b worker chaud).
        (async () => {
            const next: FetchedMap = {};
            try {
                const { configureMarketDataProvider, getHistory } = await loadMarketData();
                configureMarketDataProvider({ finnhubKey });
                for (const a of toFetch) {
                    const purchases = getEffectivePurchases(a);
                    const firstDate = purchases.length ? purchases[0].date : a.dateBought;
                    if (!firstDate) continue;
                    try {
                        // null = échec de toute la chaîne (contrat façade) → pas de cache, retry
                        // possible au prochain lot ; [] = vide légitime.
                        const hist = await getHistory(a.symbol, new Date(`${firstDate}T00:00:00Z`), today);
                        if (hist && hist.length > 0) {
                            next[a.symbol] = hist.map((h) => ({ date: h.date, price: h.close }));
                        }
                    } catch (e) {
                        // Les échecs provider « normaux » (introuvable, rate-limit) sont déjà
                        // journalisés en amont et reviennent en [] — ce catch n'attrape que
                        // l'EXOTIQUE (couche cache/transport) : on le journalise.
                        logError({ source: 'network', severity: 'warning', message: `Historique ${a.symbol} : échec inattendu (couche transport).`, error: e instanceof Error ? e : new Error(String(e)) });
                    }
                }
            } finally {
                // Revue #245 (M2) — décrément GARANTI (état module : un compteur coincé figerait
                // isLoading=true pour toutes les instances).
                if (Object.keys(next).length > 0) {
                    _fetchedCache = { ..._fetchedCache, ...next };
                }
                // Retry : les symboles demandés restés SANS données redeviennent demandables.
                for (const a of toFetch) {
                    if (!next[a.symbol]) _requestedSymbols.delete(`${finnhubKey}::${a.symbol}`);
                }
                _loadingCount = Math.max(0, _loadingCount - 1);
                _notify();
            }
        })().catch((e) => {
            // Filet final (un throw dans _notify/listeners) : jamais d'unhandled rejection muette.
            logError({ source: 'network', severity: 'warning', message: 'usePastPortfolioHistory: échec du lot de fetch.', error: e instanceof Error ? e : new Error(String(e)) });
        });
    }, [assets, finnhubKey, isTestMode, fetched]);

    return { ...result, isLoading };
}
