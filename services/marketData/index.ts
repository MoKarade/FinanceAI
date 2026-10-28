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
import type { MarketDataErrorCode } from './types';
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
async function runLink<T>(fn: () => Promise<T | null>, onTransient: (e: MarketDataError) => void): Promise<T | null> {
    try {
        return await fn();
    } catch (e) {
        if (e instanceof MarketDataError) {
            // [AI-FINNHUB-CAUSE-COLLAPSE] L'ERREUR ELLE-MÊME remonte, plus seulement le fait qu'il y
            // en ait eu une : c'est elle qui porte `code`, la seule chose qui permette à un écran de
            // dire « clé refusée » plutôt que « ticker introuvable ». Avant, ce paramètre était un
            // `() => void` — la cause était classée ici puis jetée à la ligne suivante.
            if (e.code !== 'NOT_FOUND') onTransient(e);
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

/** [AI-FINNHUB-CAUSE-COLLAPSE] Échec NOMMÉ d'un maillon de la chaîne de cours. */
export interface EchecMarche {
    readonly cause: MarketDataErrorCode;
    readonly provider: string;
}

/**
 * [MARKETDATA-HISTORY-CAUSE-PERDUE] Résultat DISCRIMINÉ d'une demande d'historique.
 * `forme: 'ok'` porte le contrat HISTORIQUE inchangé — `[]` = vide valide, `null` = pas de chemin
 * (hors navigateur sans clé) — et `forme: 'echec'` n'apparaît que lorsqu'un maillon a VRAIMENT
 * échoué (AUTH / RATE_LIMIT / NETWORK / UNKNOWN).
 */
export type ResultatHistorique =
    | { readonly forme: 'ok'; readonly points: HistoryPoint[] | null }
    | { readonly forme: 'echec'; readonly echec: EchecMarche };

/** [MARKETDATA-SEARCH-CAUSE-COLLAPSE] Résultat DISCRIMINÉ d'une recherche : voir `searchSymbolsDetaille`. */
export type ResultatRecherche =
    | { readonly forme: 'ok'; readonly resultats: SymbolSearchResult[] }
    | { readonly forme: 'echec'; readonly echec: EchecMarche };

/** [AI-FINNHUB-CAUSE-COLLAPSE] Résultat DISCRIMINÉ d'une demande de cours : voir `getQuoteDetaille`. */
export type ResultatQuote =
    | { readonly forme: 'ok'; readonly quote: Quote }
    | { readonly forme: 'absent' }
    | { readonly forme: 'echec'; readonly echec: EchecMarche };

/**
 * Quote spot, avec CHAÎNE DE REPLI ([HIST-MULTI-PROVIDER], choix Marc « tout gratuit / plusieurs
 * providers pour tout avoir ») : crypto → CoinGecko ; actions/ETF → Finnhub (si clé — quotes
 * européennes 403 en tier gratuit) → repli Yahoo via proxy same-origin (meta du chart). `null` si
 * aucun maillon ne répond (jamais caché → retry au prochain appel).
 */
export async function getQuote(symbol: string): Promise<Quote | null> {
    const r = await getQuoteDetaille(symbol);
    return r.forme === 'ok' ? r.quote : null;
}

/**
 * [AI-FINNHUB-CAUSE-COLLAPSE] MÊME chaîne que `getQuote`, mais qui PUBLIE la cause de l'échec au
 * lieu de la réduire à `null`. Mesuré avant ce lot : 401 (clé refusée), 429 (quota), panne réseau et
 * symbole inconnu rendaient TOUS les quatre `null`, sans jamais lever — donc l'écran d'ajout de
 * titre affirmait « ticker introuvable, configure ta clé Finnhub » sur une coupure réseau, et le
 * `catch` censé traiter la panne n'était JAMAIS atteint (`PATRON-COPIE-AVEC-SON-CONTRAT-D-ERREUR`,
 * un cran plus haut : ici ce n'est pas le contrat qu'on avait copié, c'est la cause qu'on jetait).
 *
 * Trois formes, et la distinction est celle qui compte pour l'utilisateur :
 *  - `ok`     : cours obtenu ;
 *  - `absent` : ABSENCE confirmée (aucun maillon n'a échoué — titre non couvert, pas de clé…) ;
 *  - `echec`  : au moins un maillon a échoué de façon transitoire (AUTH/RATE_LIMIT/NETWORK/UNKNOWN).
 *
 * ⚠️ La cause retenue est celle du PREMIER maillon qui échoue, c'est-à-dire du provider que
 * l'utilisateur a CONFIGURÉ (Finnhub avant le repli Yahoo) : c'est la seule sur laquelle il peut
 * agir. Prendre la dernière ferait dire « réseau » à une clé refusée dont le repli est aussi tombé.
 */
export async function getQuoteDetaille(symbol: string): Promise<ResultatQuote> {
    const hadPath = hasQuoteProvider(symbol);
    // [QUOTE-NEGATIVE-CACHE] Le skip négatif vit DANS le fetcher (finding silent-failure #499,
    // prouvé par sonde) : placé AVANT withCache, il masquait une valeur ENCORE VALIDE du cache
    // positif (clé de casse divergente) — une réponse déjà connue et fraîche doit toujours servir.
    let skippedNegative = false;
    // [QUOTE-ERRKIND] + [AI-FINNHUB-CAUSE-COLLAPSE] : le PREMIER échec transitoire (429/réseau/401)
    // de la chaîne, gardé en entier — `transientError: boolean` ne disait que « il y en a eu un ».
    // (Tableau plutôt qu'un `let` : TypeScript rétrécit un `let` initialisé à `null` et affecté
    // UNIQUEMENT depuis une closure — il le voyait `never` à la lecture.)
    const echecs: MarketDataError[] = [];
    const markTransient = (e: MarketDataError) => { if (echecs.length === 0) echecs.push(e); };
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
    const echec = echecs[0] ?? null;
    if (value === null) {
        if (hadPath && !skippedNegative && !echec) recordNegative('quote', symbol);
        return echec ? { forme: 'echec', echec: { cause: echec.code, provider: echec.provider } } : { forme: 'absent' };
    }
    clearNegative('quote', symbol);
    return { forme: 'ok', quote: value };
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
    const r = await getHistoryDetaille(symbol, from, to);
    return r.forme === 'ok' ? r.points : null;
}

/**
 * [MARKETDATA-HISTORY-CAUSE-PERDUE] MÊME chaîne que `getHistory`, mais qui PUBLIE la cause de
 * l'échec. Avant, elle mourait DANS le provider (`FinnhubProvider.getHistory` attrapait et rendait
 * `null`), donc le diagnostic d'hydratation ne pouvait dire que « panne du fournisseur » — et
 * promettait un « nouvel essai automatique au prochain chargement » y compris sur une clé REFUSÉE,
 * où aucun rechargement ne réussira jamais. Un message est une AFFIRMATION.
 *
 * ⚠️ Le contrat de `getHistory` ne bouge PAS d'un pouce : `[]` = vide VALIDE (cacheable 24 h),
 * `null` = échec de toute la chaîne (jamais caché). `hydrateAssetHistories` fait reposer sa
 * résolution de variantes sur cette distinction, et un verrou de `marketDataQuoteFallback` exige
 * qu'un échec d'historique n'arme JAMAIS le cache négatif — les deux restent vrais.
 *
 * ⚠️ La cause retenue est celle du PREMIER maillon (le provider CONFIGURÉ), même règle que
 * `getQuoteDetaille` : c'est la seule sur laquelle l'utilisateur peut agir.
 */
export async function getHistoryDetaille(symbol: string, from: Date, to: Date): Promise<ResultatHistorique> {
    const key = `${symbol}::${from.toISOString().slice(0, 10)}::${to.toISOString().slice(0, 10)}`;
    // (Tableau plutôt qu'un `let` : TypeScript rétrécit un `let` affecté uniquement depuis une
    // closure — cf. `getQuoteDetaille`.)
    const echecs: MarketDataError[] = [];
    const markTransient = (e: MarketDataError) => { if (echecs.length === 0) echecs.push(e); };
    const points = await withCache('history', key, async () => {
        const isCrypto = Boolean(coinGeckoIdFor(symbol));
        if (isCrypto) return runLink(() => cryptoProvider.getHistory(symbol, from, to), markTransient); // pas de repli Yahoo (crypto)
        // 1. Finnhub si configuré. `[]`/`null` → tenter Yahoo (candles gratuits absents chez Finnhub).
        if (activeProvider) {
            const primary = await runLink(() => activeProvider!.getHistory(symbol, from, to), markTransient);
            if (primary && primary.length > 0) return primary;
        }
        // 2. Repli Yahoo (proxy same-origin, navigateur seulement).
        if (typeof window !== 'undefined') {
            return runLink(() => getYahooHistory(symbol, from, to), markTransient);
        }
        return null; // hors navigateur sans Finnhub : pas de chemin (non caché)
    });
    const echec = echecs[0] ?? null;
    if (points === null && echec) return { forme: 'echec', echec: { cause: echec.code, provider: echec.provider } };
    return { forme: 'ok', points };
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
    const r = await searchSymbolsDetaille(query);
    return r.forme === 'ok' ? r.resultats : [];
}

/**
 * [MARKETDATA-SEARCH-CAUSE-COLLAPSE] MÊME recherche, mais qui PUBLIE la cause d'un échec au lieu de
 * la confondre avec « aucun résultat ». Mesuré avant ce lot : 401 (clé refusée), 429 (quota) et
 * panne réseau rendaient tous `[]`, exactement comme une requête qui ne trouve rien — l'utilisateur
 * voyait donc une autocomplétion muette, sans jamais pouvoir distinguer « ce titre n'existe pas »
 * de « ta clé est refusée ». Même défaut que `[AI-FINNHUB-CAUSE-COLLAPSE]`, sur la voie voisine.
 *
 * ⚠️ Ce résultat ENCODE l'échec au lieu de LEVER, et c'est un choix, pas un réflexe : l'unique
 * appelant est un effet de frappe débouncé, sans `try/catch` — lever transformerait une coupure
 * réseau en rejet non capturé à chaque caractère tapé. Le contrat d'erreur se DÉCIDE d'après
 * l'appelant (`PATRON-COPIE-AVEC-SON-CONTRAT-D-ERREUR`). Une erreur NON typée est encodée elle
 * aussi, en `UNKNOWN` : `searchSymbols` avalait déjà TOUT, et son contrat ne bouge pas d'un pouce.
 *
 * `forme: 'ok'` avec une liste VIDE reste le cas nominal (requête trop courte, pas de provider
 * configuré, ou aucun titre trouvé) : une absence de résultat n'est pas un échec.
 */
export async function searchSymbolsDetaille(query: string): Promise<ResultatRecherche> {
    const q = query.trim();
    if (q.length < 1 || !activeProvider?.searchSymbol) return { forme: 'ok', resultats: [] };
    try {
        return { forme: 'ok', resultats: await activeProvider.searchSymbol(q) };
    } catch (e) {
        // Le provider journalise déjà ; ici on garde ce qu'il a CLASSÉ pour que l'écran puisse le dire.
        return e instanceof MarketDataError
            ? { forme: 'echec', echec: { cause: e.code, provider: e.provider } }
            : { forme: 'echec', echec: { cause: 'UNKNOWN', provider: getActiveProviderName() } };
    }
}

/** Diagnostic : retourne le nom du provider actif ou 'none'. */
export function getActiveProviderName(): string {
    return activeProvider?.name ?? 'none';
}
