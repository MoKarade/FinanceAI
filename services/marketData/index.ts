// §7.F.1 — Façade marketData : point d'entrée unique pour toutes les requêtes
// de données de marché. Le caller choisit pas le provider, on délègue.
//
// Stratégie active : Finnhub (free tier 60 req/min, supporte TSX/USA/EUR).
// Fallback : Google Sheet CSV historique (lecture seule, deprecated mais
// disponible).
//
// Toutes les requêtes passent par le cache TTL automatique.

import type { Quote, HistoryPoint, AssetProfile, DividendInfo, MarketDataProvider } from './types';
import { withCache, clearMarketDataCache } from './cache';
import { FinnhubProvider } from './providers/finnhub';

export * from './types';
export { clearMarketDataCache } from './cache';

// Singleton provider — instancié lazy à la première requête avec la clé API.
let activeProvider: MarketDataProvider | null = null;

/**
 * Configure le provider actif. Appelé par l'app quand la clé Finnhub change
 * (Settings ou Onboarding). Si key vide → provider null (mode dégradé).
 */
export function configureMarketDataProvider(opts: { finnhubKey?: string }): void {
    if (opts.finnhubKey && opts.finnhubKey.trim().length > 0) {
        activeProvider = new FinnhubProvider(opts.finnhubKey);
    } else {
        activeProvider = null;
    }
    // Vide le cache pour forcer un re-fetch avec le nouveau provider
    clearMarketDataCache();
}

/**
 * Quote spot. Retourne null si pas de provider configuré ou si le symbole
 * est inconnu / erreur réseau.
 */
export async function getQuote(symbol: string): Promise<Quote | null> {
    if (!activeProvider) return null;
    return withCache('quote', symbol, () => activeProvider!.getQuote(symbol));
}

/**
 * Historique journalier sur une période. Retourne [] si pas de provider
 * ou aucun point disponible.
 */
export async function getHistory(symbol: string, from: Date, to: Date): Promise<HistoryPoint[]> {
    if (!activeProvider) return [];
    const key = `${symbol}::${from.toISOString().slice(0, 10)}::${to.toISOString().slice(0, 10)}`;
    const result = await withCache('history', key, () => activeProvider!.getHistory(symbol, from, to));
    return result ?? [];
}

/**
 * Profil statique d'un actif. Recommandé pour auto-populate assetMeta
 * (sector/region/yield) au lieu de hardcoder dans services/assetMeta.ts.
 */
export async function getProfile(symbol: string): Promise<AssetProfile | null> {
    if (!activeProvider) return null;
    return withCache('profile', symbol, () => activeProvider!.getProfile(symbol));
}

/** Prochains dividendes connus. Optional — provider peut ne pas l'implémenter. */
export async function getDividends(symbol: string): Promise<DividendInfo[]> {
    if (!activeProvider || !activeProvider.getDividends) return [];
    const result = await withCache('dividends', symbol, () => activeProvider!.getDividends!(symbol));
    return result ?? [];
}

/** Diagnostic : retourne le nom du provider actif ou 'none'. */
export function getActiveProviderName(): string {
    return activeProvider?.name ?? 'none';
}
