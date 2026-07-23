// services/marketData/providers/yahooProxy.ts
//
// [PORTFOLIO-HISTORY] Provider d'HISTORIQUE de REPLI (gratuit, sans clé) : l'API chart de Yahoo
// Finance, atteinte via le proxy SAME-ORIGIN `/api/history/yahoo/...` — jamais en direct :
//  - prod : rewrite Vercel (vercel.json) vers query1.finance.yahoo.com (proxy server-side) ;
//  - dev : `server.proxy` de vite.config.ts.
// Pourquoi un proxy : (1) la CSP `connect-src` n'autorise pas de nouveau domaine (le same-origin
// `/api/*` est couvert par 'self') ; (2) Yahoo n'envoie pas d'en-têtes CORS exploitables.
// Pourquoi Yahoo en repli : le endpoint candles de Finnhub est réservé au tier PAYANT (403 sur une
// clé gratuite) — sans repli, aucune courbe d'actions n'est possible en « tout gratuit » (règle Marc).
// Couverture : USA, TSX (.TO/.V), Europe (.PA/.DE/…) — les mêmes suffixes que nos symboles après
// `toFinnhubSymbol` (NASDAQ:X → X ; TSE:X → X.TO ; EPA:X → X.PA).
//
// HISTORIQUE + QUOTE DE REPLI ([HIST-MULTI-PROVIDER] 2026-07-23, demande Marc « plusieurs trucs
// comme yahoo et finnhub etc pour tout avoir ») : le tier gratuit Finnhub ne quote PAS les bourses
// européennes → `getYahooQuote` lit `meta.regularMarketPrice` du MÊME endpoint chart (aucun
// rewrite de plus) pour servir de dernier maillon de la chaîne de quotes (crypto → CoinGecko ;
// sinon Finnhub → repli Yahoo). Contrat getHistory : `[]` = réponse valide sans point (cacheable) ;
// `null` = erreur (proxy absent, 4xx/5xx, forme inattendue) — jamais caché, repli/retry possible.
// Contrat getQuote : `Quote` ou `null` (pas de « vide légitime » pour une quote).

import type { HistoryPoint, Quote } from '../types';
import { toFinnhubSymbol } from './finnhub';
import { logProviderError } from './providerError';

const PROXY_BASE = '/api/history/yahoo';
const FETCH_TIMEOUT_MS = 12_000;

interface YahooChartResponse {
    chart?: {
        result?: Array<{
            meta?: {
                currency?: string;
                regularMarketPrice?: number;
                chartPreviousClose?: number;
                regularMarketTime?: number; // secondes Unix
            };
            timestamp?: number[];
            indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
        error?: { code?: string; description?: string } | null;
    };
}

/** Parse PUR de la réponse chart Yahoo → HistoryPoints (exporté pour test). */
export function parseYahooChart(data: YahooChartResponse, from: Date, to: Date): HistoryPoint[] | null {
    const result = data?.chart?.result?.[0];
    if (!result) return null; // forme inattendue (ou chart.error) = erreur
    const ts = result.timestamp;
    const closes = result.indicators?.quote?.[0]?.close;
    if (!Array.isArray(ts) || !Array.isArray(closes)) {
        // Symbole valide mais aucune donnée sur la période (réponse sans séries) = vide légitime.
        return [];
    }
    const fromMs = from.getTime();
    const toMs = to.getTime() + 86_400_000; // inclut la journée `to`
    const points: HistoryPoint[] = [];
    for (let i = 0; i < ts.length; i++) {
        const close = closes[i];
        const ms = ts[i] * 1000;
        // Yahoo met `null` sur les jours sans clôture (marché fermé au moment de la requête) —
        // on OMET ces points (jamais un 0 fabriqué, no-fake-data).
        if (typeof close !== 'number' || !Number.isFinite(close) || close <= 0) continue;
        if (ms < fromMs || ms > toMs) continue;
        points.push({ date: new Date(ms).toISOString().slice(0, 10), close });
    }
    // Dédoublonne par date (Yahoo peut émettre le point intraday du jour EN PLUS de la clôture) :
    // on garde le DERNIER point de chaque date.
    const byDate = new Map<string, HistoryPoint>();
    for (const p of points) byDate.set(p.date, p);
    return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Historique journalier via le proxy Yahoo. Le symbole est converti au format suffixe
 * (`toFinnhubSymbol` — même convention que Yahoo). Voir contrat null/[] en tête de fichier.
 */
/**
 * Parse PUR du meta chart Yahoo → Quote (exporté pour test). `null` si le prix manque/invalide.
 * La DEVISE vient de Yahoo (vraie devise de cotation du titre) → la garde currency-mismatch de
 * priceRefresh protège contre une collision de ticker cross-devise.
 */
export function parseYahooQuote(data: YahooChartResponse, symbol: string): Quote | null {
    const meta = data?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;
    const prev = meta?.chartPreviousClose;
    const hasPrev = typeof prev === 'number' && Number.isFinite(prev) && prev > 0;
    return {
        symbol,
        price,
        change: hasPrev ? price - (prev as number) : 0,
        changePercent: hasPrev ? ((price - (prev as number)) / (prev as number)) * 100 : 0,
        currency: (meta?.currency || '').toUpperCase(),
        timestamp: typeof meta?.regularMarketTime === 'number' ? meta.regularMarketTime * 1000 : Date.now(),
    };
}

/**
 * Quote de REPLI via le proxy chart (fenêtre courte 1d — on ne lit que `meta`). `null` en échec
 * (404 inclus : pour une quote, « symbole inconnu » = pas de quote, retry/repli possibles).
 */
export async function getYahooQuote(symbol: string): Promise<Quote | null> {
    const ySymbol = toFinnhubSymbol(symbol);
    const url = `${PROXY_BASE}/${encodeURIComponent(ySymbol)}?range=1d&interval=1d`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return null;
        const data = (await res.json()) as YahooChartResponse;
        return parseYahooQuote(data, symbol);
    } catch (e) {
        logProviderError('YahooProxy', 'getQuote', symbol, e);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// ── [HIST-MULTI-PROVIDER] Recherche de titre par NOM/ticker (proxy /api/search/yahoo) ──────────
// Sert le diagnostic « Cours non synchronisés » : proposer les BONS tickers cliquables (« Amundi
// MSCI Em Asia » → AASI.PA) au lieu de demander à l'utilisateur de les deviner.

export interface YahooSearchResult {
    symbol: string;
    name: string;
    exchange: string;
}

interface YahooSearchResponse {
    quotes?: Array<{
        symbol?: string;
        shortname?: string;
        longname?: string;
        exchDisp?: string;
        quoteType?: string;
    }>;
}

/** Parse PUR de la réponse search Yahoo (exporté pour test). Actions/ETF/fonds seulement. */
export function parseYahooSearch(data: YahooSearchResponse): YahooSearchResult[] {
    const KEEP = new Set(['EQUITY', 'ETF', 'MUTUALFUND']);
    return (data?.quotes || [])
        .filter((q) => typeof q.symbol === 'string' && q.symbol.length > 0
            && KEEP.has((q.quoteType || '').toUpperCase()))
        .slice(0, 6)
        .map((q) => ({
            symbol: q.symbol as string,
            name: q.longname || q.shortname || (q.symbol as string),
            exchange: q.exchDisp || '',
        }));
}

/** Recherche de symbole via le proxy same-origin. `null` = erreur (jamais cachée) ; `[]` = aucun résultat. */
export async function searchYahooSymbols(query: string): Promise<YahooSearchResult[] | null> {
    const q = query.trim();
    if (!q) return [];
    const url = `/api/search/yahoo?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return null;
        const data = (await res.json()) as YahooSearchResponse;
        return parseYahooSearch(data);
    } catch (e) {
        logProviderError('YahooProxy', 'search', q, e);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export async function getYahooHistory(symbol: string, from: Date, to: Date): Promise<HistoryPoint[] | null> {
    const ySymbol = toFinnhubSymbol(symbol);
    const period1 = Math.floor(from.getTime() / 1000);
    const period2 = Math.floor(to.getTime() / 1000) + 86_400; // inclusif
    const url = `${PROXY_BASE}/${encodeURIComponent(ySymbol)}?period1=${period1}&period2=${period2}&interval=1d`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (res.status === 404) return []; // symbole inconnu chez Yahoo = vide légitime (cacheable)
        if (!res.ok) return null;          // proxy absent / 5xx / 429 = erreur (pas de cache)
        const data = (await res.json()) as YahooChartResponse;
        return parseYahooChart(data, from, to);
    } catch (e) {
        logProviderError('YahooProxy', 'getHistory', symbol, e);
        return null;
    } finally {
        clearTimeout(timer);
    }
}
