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
// HISTORIQUE SEULEMENT : getQuote/getProfile ne sont pas implémentés ici (les quotes restent
// Finnhub/CoinGecko). Contrat getHistory : `[]` = réponse valide sans point (cacheable) ;
// `null` = erreur (proxy absent, 4xx/5xx, forme inattendue) — jamais caché, repli/retry possible.

import type { HistoryPoint } from '../types';
import { toFinnhubSymbol } from './finnhub';
import { logProviderError } from './providerError';

const PROXY_BASE = '/api/history/yahoo';
const FETCH_TIMEOUT_MS = 12_000;

interface YahooChartResponse {
    chart?: {
        result?: Array<{
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
