// §7.F.1 — Façade marketData : point d'entrée unique pour toutes les requêtes
// de données de marché. Le caller choisit pas le provider, on délègue.
//
// Stratégie active : Finnhub (free tier 60 req/min, supporte TSX/USA/EUR).
// Fallback : Google Sheet CSV historique (lecture seule, deprecated mais
// disponible).
//
// Toutes les requêtes passent par le cache TTL automatique.

import type { Quote, HistoryPoint, AssetProfile, SymbolSearchResult, MarketDataProvider } from './types';
import { withCache, clearMarketDataCache } from './cache';
import { FinnhubProvider } from './providers/finnhub';
import { CoinGeckoProvider, coinGeckoIdFor } from './providers/coingecko';

export * from './types';
export { clearMarketDataCache } from './cache';

// Provider actions (Finnhub) — instancié quand la clé API est fournie.
let activeProvider: MarketDataProvider | null = null;

// Provider crypto (CoinGecko) — GRATUIT, sans clé, TOUJOURS disponible.
// Indépendant de la clé Finnhub : le crypto marche même sans rien configurer.
const cryptoProvider = new CoinGeckoProvider();

/** Route par symbole : crypto connu → CoinGecko, sinon Finnhub (si configuré). */
function pickProvider(symbol: string): MarketDataProvider | null {
    return coinGeckoIdFor(symbol) ? cryptoProvider : activeProvider;
}

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
 * [PRICE-REFRESH-LIVE] Un provider peut-il quoter ce symbole ? (crypto → CoinGecko toujours ;
 * autres → Finnhub seulement si la clé est configurée). Permet aux appelants de SAUTER d'emblée
 * les symboles sans provider au lieu de consommer du pacing (sleep) pour des null instantanés.
 */
export function hasQuoteProvider(symbol: string): boolean {
    return pickProvider(symbol) != null;
}

/**
 * Quote spot. Retourne null si pas de provider configuré ou si le symbole
 * est inconnu / erreur réseau.
 */
export async function getQuote(symbol: string): Promise<Quote | null> {
    const provider = pickProvider(symbol);
    if (!provider) return null;
    return withCache('quote', symbol, () => provider.getQuote(symbol));
}

/**
 * Historique journalier sur une période. Retourne [] si pas de provider
 * ou aucun point disponible.
 */
export async function getHistory(symbol: string, from: Date, to: Date): Promise<HistoryPoint[]> {
    const provider = pickProvider(symbol);
    if (!provider) return [];
    const key = `${symbol}::${from.toISOString().slice(0, 10)}::${to.toISOString().slice(0, 10)}`;
    const result = await withCache('history', key, () => provider.getHistory(symbol, from, to));
    return result ?? [];
}

/**
 * Profil statique d'un actif. Recommandé pour auto-populate assetMeta
 * (sector/region/yield) au lieu de hardcoder dans services/assetMeta.ts.
 */
export async function getProfile(symbol: string): Promise<AssetProfile | null> {
    const provider = pickProvider(symbol);
    if (!provider) return null;
    return withCache('profile', symbol, () => provider.getProfile(symbol));
}

/**
 * Recherche de symbole (autocomplétion à la frappe). Retourne [] si pas de provider configuré
 * (mode dégradé sans clé Finnhub) ou requête vide. PAS de cache : requête dynamique éphémère ; le
 * débounce côté UI borne le débit (free tier Finnhub 60 req/min).
 */
export async function searchSymbols(query: string): Promise<SymbolSearchResult[]> {
    const q = query.trim();
    if (q.length < 1 || !activeProvider?.searchSymbol) return [];
    try {
        return await activeProvider.searchSymbol(q);
    } catch {
        return []; // le provider journalise déjà ; pas de remontée bloquante pour une autocomplétion
    }
}

/** Diagnostic : retourne le nom du provider actif ou 'none'. */
export function getActiveProviderName(): string {
    return activeProvider?.name ?? 'none';
}
