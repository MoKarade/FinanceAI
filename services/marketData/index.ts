// §7.F.1 — Façade marketData : point d'entrée unique pour toutes les requêtes
// de données de marché. Le caller choisit pas le provider, on délègue.
//
// Stratégie active : Finnhub (free tier 60 req/min, supporte TSX/USA/EUR).
// Fallback : Google Sheet CSV historique (lecture seule, deprecated mais
// disponible).
//
// Toutes les requêtes passent par le cache TTL automatique.

import type { Quote, HistoryPoint, AssetProfile, SymbolSearchResult, MarketDataProvider } from './types';
import { MarketDataError } from './types';
import { withCache, clearMarketDataCache } from './cache';
import { FinnhubProvider } from './providers/finnhub';
import { CoinGeckoProvider, coinGeckoIdFor } from './providers/coingecko';
import { getYahooHistory, getYahooQuote } from './providers/yahooProxy';
import { shouldSkipNegative, recordNegative, clearNegative, clearNegativeCache } from './negativeCache';

export * from './types';
export { clearMarketDataCache } from './cache';
export { clearNegativeCache } from './negativeCache';

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
 * [QUOTE-ERRKIND] Exécute UN maillon de la chaîne de quotes/profils en distinguant le TYPE d'échec :
 *  - erreur TRANSITOIRE (`MarketDataError` code ≠ NOT_FOUND : RATE_LIMIT/NETWORK/AUTH/UNKNOWN) →
 *    avalée en `null` MAIS signalée via `onTransient` → la façade NE l'arme PAS au cache négatif
 *    (un 429/réseau ne doit pas geler un VRAI titre — finding ÉLEVÉ #499) ;
 *  - ABSENCE confirmée (`null` rendu par le provider, ou `MarketDataError` NOT_FOUND) → `null` NON
 *    signalé → comptée au skip (un titre manuel/GIC vraiment non coté l'atteint) ;
 *  - erreur NON typée (vrai bug) → propagée à l'appelant (inchangé).
 */
async function runLink<T>(fn: () => Promise<T | null>, onTransient: () => void): Promise<T | null> {
    try {
        return await fn();
    } catch (e) {
        if (e instanceof MarketDataError) {
            if (e.code !== 'NOT_FOUND') onTransient();
            return null;
        }
        throw e;
    }
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
    // [QUOTE-NEGATIVE-CACHE] Nouvelle clé = nouvelle COUVERTURE (un symbole « introuvable » sans
    // clé peut être couvert avec) → les skips négatifs ne tiennent plus.
    clearNegativeCache();
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
 * [QUOTE-NEGATIVE-CACHE] Un essai de quote vaut-il la peine MAINTENANT ? = provider existant ET
 * pas de skip négatif actif (3 nulls consécutifs → skip TTL 24 h, self-heal à l'expiration).
 * À passer comme `hasProvider` aux boucles pacées (priceRefresh) : un titre manuel/GIC ne paie
 * plus réseau + 2,5 s de pacing à chaque refresh.
 */
export function canAttemptQuote(symbol: string): boolean {
    return hasQuoteProvider(symbol) && !shouldSkipNegative('quote', symbol);
}

/**
 * Quote spot, avec CHAÎNE DE REPLI ([HIST-MULTI-PROVIDER], choix Marc « tout gratuit / plusieurs
 * providers pour tout avoir ») : crypto → CoinGecko ; actions/ETF → Finnhub (si clé — quotes
 * européennes 403 en tier gratuit) → repli Yahoo via proxy same-origin (meta du chart). `null` si
 * aucun maillon ne répond (jamais caché → retry au prochain appel).
 */
export async function getQuote(symbol: string): Promise<Quote | null> {
    const hadPath = hasQuoteProvider(symbol);
    // [QUOTE-NEGATIVE-CACHE] Le skip négatif vit DANS le fetcher (finding silent-failure #499,
    // prouvé par sonde) : placé AVANT withCache, il masquait une valeur ENCORE VALIDE du cache
    // positif (clé de casse divergente) — une réponse déjà connue et fraîche doit toujours servir.
    let skippedNegative = false;
    let transientError = false; // [QUOTE-ERRKIND] un maillon a échoué de façon TRANSITOIRE (429/réseau)
    const markTransient = () => { transientError = true; };
    let value: Quote | null;
    try {
        value = await withCache('quote', symbol, async () => {
            if (shouldSkipNegative('quote', symbol)) {
                skippedNegative = true;
                return null; // zéro réseau (self-heal par TTL) — non compté comme nouvel échec
            }
            const isCrypto = Boolean(coinGeckoIdFor(symbol));
            if (isCrypto) return runLink(() => cryptoProvider.getQuote(symbol), markTransient); // pas de repli Yahoo (crypto)
            if (activeProvider) {
                const primary = await runLink(() => activeProvider!.getQuote(symbol), markTransient);
                if (primary) return primary;
            }
            if (typeof window !== 'undefined') {
                return runLink(() => getYahooQuote(symbol), markTransient);
            }
            return null; // hors navigateur sans Finnhub : pas de chemin (non caché)
        });
    } catch (e) {
        // Une EXCEPTION NON typée (vrai bug) du fetcher = échec de chaîne ; relancée à l'appelant
        // (priceRefresh la convertit déjà en skip 'error' + logError). Les erreurs typées transitoires
        // sont désormais avalées par runLink (comptées via transientError, pas ici).
        if (hadPath) recordNegative('quote', symbol);
        throw e;
    }
    // [QUOTE-ERRKIND] Comptabilité négative : un null AVEC chemin = échec de toute la chaîne, MAIS on
    // n'arme le skip QUE sur une absence CONFIRMÉE (aucune erreur transitoire vue) — un null issu d'un
    // 429/réseau ne doit pas geler un vrai titre (staleness pire que le problème). « Sans chemin » /
    // skip / transitoire = rien compté. Succès → entrée effacée (no-op sans entrée).
    if (value === null) {
        if (hadPath && !skippedNegative && !transientError) recordNegative('quote', symbol);
    } else {
        clearNegative('quote', symbol);
    }
    return value;
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
 * [QUOTE-NEGATIVE-CACHE] Un essai de PROFIL vaut-il la peine maintenant ? = provider existant ET
 * pas de skip négatif (3 nulls consécutifs → skip TTL 7 j — un profil non couvert par Finnhub
 * était sinon retenté à CHAQUE boot avec 2,5 s de pacing, à vie ; finding silent-failure #496).
 */
export function canAttemptProfile(symbol: string): boolean {
    return hasProfileProvider(symbol) && !shouldSkipNegative('profile', symbol);
}

/**
 * Profil statique d'un actif. Utilisé par l'auto-populate des répartitions
 * (services/assetProfileSync.ts → Asset.sector/region).
 */
export async function getProfile(symbol: string): Promise<AssetProfile | null> {
    const provider = pickProvider(symbol);
    if (!provider) return null;
    // [QUOTE-NEGATIVE-CACHE] Skip DANS le fetcher (cache positif IDB 24 h consulté d'abord — un
    // profil déjà connu sert toujours) + exceptions comptées (mêmes findings que getQuote).
    let skippedNegative = false;
    let transientError = false; // [QUOTE-ERRKIND] échec transitoire (429/réseau) → non compté
    let value: AssetProfile | null;
    try {
        value = await withCache('profile', symbol, async () => {
            if (shouldSkipNegative('profile', symbol)) {
                skippedNegative = true;
                return null;
            }
            return runLink(() => provider.getProfile(symbol), () => { transientError = true; });
        });
    } catch (e) {
        recordNegative('profile', symbol);
        throw e;
    }
    // [QUOTE-ERRKIND] Compter seulement l'absence CONFIRMÉE (cf getQuote) — un 429/réseau transitoire
    // sur un profil non plus ne doit pas armer un skip 7 j sur un vrai titre.
    if (value === null) {
        if (!skippedNegative && !transientError) recordNegative('profile', symbol);
    } else {
        clearNegative('profile', symbol);
    }
    return value;
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
