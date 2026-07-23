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
import { getYahooHistory, getYahooQuote } from './providers/yahooProxy';

export * from './types';
export { clearMarketDataCache } from './cache';

// Provider actions (Finnhub) — instancié quand la clé API est fournie.
let activeProvider: MarketDataProvider | null = null;
let activeFinnhubKey = '';

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
 *
 * ⚠️ IDEMPOTENT sur la MÊME clé (panel 2026-07-22) : App.tsx (boot) et usePastPortfolioHistory
 * appellent cette fonction avec la clé COURANTE — un clear inconditionnel vidait le cache IDB
 * « persistant » (historique 24 h) à CHAQUE reload, annulant sa raison d'être (rate-limit,
 * vitesse). On ne vide que sur un VRAI changement de clé.
 */
export function configureMarketDataProvider(opts: { finnhubKey?: string }): void {
    const key = (opts.finnhubKey || '').trim();
    if (key === activeFinnhubKey) return; // même clé (ou toujours sans clé) → provider et cache intacts
    activeFinnhubKey = key;
    activeProvider = key.length > 0 ? new FinnhubProvider(key) : null;
    // Vide le cache pour forcer un re-fetch avec le nouveau provider
    clearMarketDataCache();
}

/**
 * [PRICE-REFRESH-LIVE] Un provider peut-il quoter ce symbole ? Crypto → CoinGecko toujours ;
 * autres → Finnhub (si clé) OU le repli quote Yahoo via proxy same-origin ([HIST-MULTI-PROVIDER] —
 * navigateur seulement, comme le repli d'historique). Permet aux appelants de SAUTER d'emblée
 * les symboles sans provider au lieu de consommer du pacing (sleep) pour des null instantanés.
 */
export function hasQuoteProvider(symbol: string): boolean {
    if (pickProvider(symbol) != null) return true;
    return !coinGeckoIdFor(symbol) && typeof window !== 'undefined'; // repli Yahoo (non-crypto)
}

/**
 * Quote spot, avec CHAÎNE DE REPLI ([HIST-MULTI-PROVIDER], choix Marc « tout gratuit / plusieurs
 * providers pour tout avoir ») : crypto → CoinGecko ; actions/ETF → Finnhub (si clé — quotes
 * européennes 403 en tier gratuit) → repli Yahoo via proxy same-origin (meta du chart). `null` si
 * aucun maillon ne répond (jamais caché → retry au prochain appel).
 */
export async function getQuote(symbol: string): Promise<Quote | null> {
    return withCache('quote', symbol, async () => {
        const isCrypto = Boolean(coinGeckoIdFor(symbol));
        if (isCrypto) return cryptoProvider.getQuote(symbol); // pas de repli Yahoo (crypto)
        if (activeProvider) {
            const primary = await activeProvider.getQuote(symbol);
            if (primary) return primary;
        }
        if (typeof window !== 'undefined') {
            return getYahooQuote(symbol);
        }
        return null; // hors navigateur sans Finnhub : pas de chemin (non caché)
    });
}

/**
 * [PORTFOLIO-HISTORY] Y a-t-il un chemin d'HISTORIQUE pour ce symbole ? Crypto → CoinGecko
 * (toujours) ; sinon Finnhub (si clé) OU le repli Yahoo via proxy same-origin (navigateur
 * seulement — hors DOM, ex. Node/MCP, le proxy `/api/...` n'existe pas).
 */
export function hasHistoryProvider(symbol: string): boolean {
    if (coinGeckoIdFor(symbol)) return true;
    if (activeProvider) return true;
    return typeof window !== 'undefined'; // repli Yahoo = proxy same-origin, navigateur uniquement
}

/**
 * Historique journalier sur une période, avec CHAÎNE DE REPLI (choix Marc « tout gratuit ») :
 *   crypto → CoinGecko ; actions/ETF → Finnhub (clé Marc — candles souvent 403 en tier gratuit)
 *   → repli Yahoo via proxy same-origin. Contrat provider PROPAGÉ à l'appelant : `[]` = vide
 *   VALIDE (cacheable 24h), `null` = erreur (JAMAIS cachée → retry/repli au prochain appel).
 *   ⚠️ Ne PAS aplatir null en [] ici (panel 2026-07-22) : l'hydratation distingue « échec de la
 *   chaîne » (logError + retry, historique existant préservé) d'un « vide légitime » (skip).
 */
export async function getHistory(symbol: string, from: Date, to: Date): Promise<HistoryPoint[] | null> {
    const key = `${symbol}::${from.toISOString().slice(0, 10)}::${to.toISOString().slice(0, 10)}`;
    return withCache('history', key, async () => {
        const isCrypto = Boolean(coinGeckoIdFor(symbol));
        if (isCrypto) return cryptoProvider.getHistory(symbol, from, to); // pas de repli Yahoo (crypto)
        // 1. Finnhub si configuré. `[]`/`null` → tenter Yahoo (candles gratuits absents chez Finnhub).
        if (activeProvider) {
            const primary = await activeProvider.getHistory(symbol, from, to);
            if (primary && primary.length > 0) return primary;
        }
        // 2. Repli Yahoo (proxy same-origin, navigateur seulement).
        if (typeof window !== 'undefined') {
            return getYahooHistory(symbol, from, to);
        }
        return null; // hors navigateur sans Finnhub : pas de chemin (non caché)
    });
}

/** [INVEST-ALLOC-GEO-SECTOR] Un provider de PROFIL existe-t-il ? (pas de repli Yahoo pour les
 *  profils — Finnhub/CoinGecko seulement) : évite de payer pacing + no-op quand il n'y a pas de clé. */
export function hasProfileProvider(symbol: string): boolean {
    return pickProvider(symbol) != null;
}

/**
 * Profil statique d'un actif. Utilisé par l'auto-populate des répartitions
 * (services/assetProfileSync.ts → Asset.sector/region).
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
