// §7.F.3 — Wrapper CoinGecko (crypto). GRATUIT, SANS CLÉ, CORS-friendly.
//
// Vérifié 2026-05-25 : api.coingecko.com répond `access-control-allow-origin: *`
// sur /ping, /simple/price et /coins/{id}/market_chart, sans clé API. Supporte
// vs_currency=cad nativement. Tier public ~10–30 req/min (large pour un
// particulier). Doc : https://docs.coingecko.com/reference
//
// Symboles : l'app stocke le crypto en `BTC-CAD`, `ETH-CAD`, etc. CoinGecko
// utilise des IDs (`bitcoin`, `ethereum`) → on mappe via CRYPTO_IDS et on parse
// la devise depuis le suffixe (-CAD/-USD/-EUR), défaut USD.

import type { Quote, HistoryPoint, AssetProfile, MarketDataProvider } from '../types';
import { MarketDataError } from '../types';

const BASE_URL = 'https://api.coingecko.com/api/v3';
const FETCH_TIMEOUT_MS = 12_000;

/** Ticker (majuscule) → ID CoinGecko. Top cryptos ; extensible. */
const CRYPTO_IDS: Record<string, string> = {
    BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', ADA: 'cardano', XRP: 'ripple',
    DOGE: 'dogecoin', DOT: 'polkadot', MATIC: 'matic-network', AVAX: 'avalanche-2',
    LINK: 'chainlink', LTC: 'litecoin', BCH: 'bitcoin-cash', ATOM: 'cosmos',
    UNI: 'uniswap', BNB: 'binancecoin', SHIB: 'shiba-inu', TRX: 'tron', XLM: 'stellar',
    USDT: 'tether', USDC: 'usd-coin', DAI: 'dai', ALGO: 'algorand', XMR: 'monero',
};

const NICE_NAME: Record<string, string> = {
    BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', ADA: 'Cardano', XRP: 'XRP',
    DOGE: 'Dogecoin', DOT: 'Polkadot', AVAX: 'Avalanche', LINK: 'Chainlink',
    LTC: 'Litecoin', BCH: 'Bitcoin Cash', BNB: 'BNB', USDT: 'Tether', USDC: 'USD Coin',
};

const SUPPORTED_VS = new Set(['CAD', 'USD', 'EUR', 'GBP']);

/** Sépare un symbole crypto en { ticker, currency }. `BTC-CAD` → BTC + CAD. */
const parseSymbol = (symbol: string): { ticker: string; currency: string } => {
    const m = symbol.trim().toUpperCase().match(/^([A-Z0-9]{2,6})[-/ ]?([A-Z]{3})?$/);
    if (m && m[2] && SUPPORTED_VS.has(m[2])) return { ticker: m[1], currency: m[2] };
    if (m) return { ticker: m[1], currency: 'USD' };
    return { ticker: symbol.trim().toUpperCase(), currency: 'USD' };
};

/**
 * Retourne l'ID CoinGecko d'un symbole crypto, ou null si ce n'est pas un
 * crypto connu. Sert AUSSI au routage dans la façade (null → action → Finnhub).
 */
export const coinGeckoIdFor = (symbol: string): string | null => {
    if (!symbol) return null;
    return CRYPTO_IDS[parseSymbol(symbol).ticker] ?? null;
};

async function cgFetch(path: string): Promise<unknown> {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(`${BASE_URL}${path}`, { signal: ctrl.signal });
        if (res.status === 429) {
            throw new MarketDataError('Rate limit CoinGecko atteint.', 'RATE_LIMIT', 'coingecko');
        }
        if (res.status === 404) {
            throw new MarketDataError('Crypto inconnue (CoinGecko).', 'NOT_FOUND', 'coingecko');
        }
        if (!res.ok) {
            throw new MarketDataError(`CoinGecko erreur ${res.status}`, 'UNKNOWN', 'coingecko');
        }
        return await res.json();
    } catch (e) {
        if (e instanceof MarketDataError) throw e;
        if (e instanceof DOMException && e.name === 'AbortError') {
            throw new MarketDataError('Timeout CoinGecko.', 'NETWORK', 'coingecko');
        }
        throw new MarketDataError(String(e), 'NETWORK', 'coingecko');
    } finally {
        clearTimeout(timeout);
    }
}

/** Garde un point par jour (le dernier prix de chaque journée). */
const toDailyPoints = (prices: Array<[number, number]>, from: Date, to: Date): HistoryPoint[] => {
    const fromMs = from.getTime();
    const toMs = to.getTime();
    const byDay = new Map<string, number>();
    for (const [ms, price] of prices) {
        if (typeof ms !== 'number' || typeof price !== 'number') continue;
        if (ms < fromMs || ms > toMs) continue;
        byDay.set(new Date(ms).toISOString().slice(0, 10), price); // dernier l'emporte (prices triés)
    }
    return [...byDay.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([date, close]) => ({ date, close }));
};

export class CoinGeckoProvider implements MarketDataProvider {
    readonly name = 'coingecko';

    async getQuote(symbol: string): Promise<Quote | null> {
        const id = coinGeckoIdFor(symbol);
        if (!id) return null;
        const { currency } = parseSymbol(symbol);
        const vs = currency.toLowerCase();
        try {
            const data = await cgFetch(
                `/simple/price?ids=${id}&vs_currencies=${vs}&include_24hr_change=true`,
            ) as Record<string, Record<string, number>>;
            const row = data?.[id];
            const price = row?.[vs];
            if (typeof price !== 'number') return null;
            const pct = row?.[`${vs}_24h_change`] ?? 0;
            return {
                symbol,
                price,
                change: (price * pct) / 100,
                changePercent: pct,
                currency,
                timestamp: Date.now(),
            };
        } catch (e) {
            console.warn(`[CoinGecko] getQuote(${symbol}) failed:`, (e as Error).message);
            return null;
        }
    }

    async getHistory(symbol: string, from: Date, to: Date): Promise<HistoryPoint[]> {
        const id = coinGeckoIdFor(symbol);
        if (!id) return [];
        const { currency } = parseSymbol(symbol);
        const vs = currency.toLowerCase();
        // CoinGecko prend `days` (pas from/to). Cap à 365 (tier public en quotidien
        // au-delà de 90j). On NE met PAS interval=daily (réservé Enterprise) : on
        // downsample nous-mêmes pour être robuste quel que soit le tier.
        const dayMs = 86_400_000;
        const days = Math.min(365, Math.max(1, Math.ceil((to.getTime() - from.getTime()) / dayMs)));
        try {
            const data = await cgFetch(
                `/coins/${id}/market_chart?vs_currency=${vs}&days=${days}`,
            ) as { prices?: Array<[number, number]> };
            if (!data || !Array.isArray(data.prices)) return [];
            return toDailyPoints(data.prices, from, to);
        } catch (e) {
            console.warn(`[CoinGecko] getHistory(${symbol}) failed:`, (e as Error).message);
            return [];
        }
    }

    async getProfile(symbol: string): Promise<AssetProfile | null> {
        const id = coinGeckoIdFor(symbol);
        if (!id) return null;
        const { ticker, currency } = parseSymbol(symbol);
        return {
            symbol,
            name: NICE_NAME[ticker] ?? ticker,
            sector: 'Crypto',
            region: 'Global',
            dividendYield: 0,
            currency,
        };
    }
}
