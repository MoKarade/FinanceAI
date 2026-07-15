// tests/services/marketDataRouting.test.ts
//
// [DETTE-TESTGAP-MARKETDATA] — `pickProvider` (façade marketData) route chaque symbole vers le bon
// provider : crypto connu (BTC/ETH/…) → CoinGecko (GRATUIT, TOUJOURS disponible, même sans clé) ;
// tout le reste → Finnhub (seulement si la clé est configurée). Un bug de routage = prix jamais
// rafraîchi EN SILENCE (crypto qui tombe sur un Finnhub null, ou action qui frappe CoinGecko et
// revient vide). `pickProvider` est privé → on le teste par l'API publique (hasQuoteProvider/getQuote)
// et par l'URL RÉELLEMENT appelée (coingecko.com vs finnhub.io), seule preuve du provider retenu.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    configureMarketDataProvider,
    hasQuoteProvider,
    getQuote,
    clearMarketDataCache,
} from '../../services/marketData';

const CRYPTO = 'BTC-CAD';   // ticker BTC connu de CoinGecko
const STOCK = 'NASDAQ:NVDA'; // action → Finnhub

/** Mock fetch qui répond selon l'hôte appelé + mémorise les URLs pour prouver le routage. */
function stubFetchCapturingUrls(urls: string[]) {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
        const url = String(input);
        urls.push(url);
        if (url.includes('coingecko.com')) {
            return { ok: true, status: 200, json: async () => ({ bitcoin: { cad: 50_000, cad_24h_change: 1.5 } }) } as Response;
        }
        // finnhub.io
        return { ok: true, status: 200, json: async () => ({ c: 100, d: 1, dp: 1, t: 1_700_000_000 }) } as Response;
    }));
}

describe('[DETTE-TESTGAP-MARKETDATA] routage pickProvider', () => {
    beforeEach(() => {
        clearMarketDataCache();
        configureMarketDataProvider({}); // repart sans clé Finnhub
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        configureMarketDataProvider({});
        clearMarketDataCache();
    });

    it('SANS clé Finnhub : un crypto est routable (CoinGecko), une action ne l\'est pas', () => {
        expect(hasQuoteProvider(CRYPTO)).toBe(true);  // CoinGecko indépendant de la clé
        expect(hasQuoteProvider(STOCK)).toBe(false);  // pas de provider actions sans clé
    });

    it('AVEC clé Finnhub : l\'action devient routable, le crypto le reste', () => {
        configureMarketDataProvider({ finnhubKey: 'k' });
        expect(hasQuoteProvider(STOCK)).toBe(true);
        expect(hasQuoteProvider(CRYPTO)).toBe(true);
    });

    it('SANS clé : getQuote(crypto) frappe CoinGecko et renvoie un prix (ne tombe PAS sur un Finnhub null)', async () => {
        const urls: string[] = [];
        stubFetchCapturingUrls(urls);
        const q = await getQuote(CRYPTO);
        expect(q).not.toBeNull();
        expect(q?.price).toBe(50_000);
        expect(urls.some((u) => u.includes('coingecko.com'))).toBe(true);
        expect(urls.some((u) => u.includes('finnhub.io'))).toBe(false);
    });

    it('SANS clé : getQuote(action) renvoie null (aucun provider — pas de fetch)', async () => {
        const urls: string[] = [];
        stubFetchCapturingUrls(urls);
        const q = await getQuote(STOCK);
        expect(q).toBeNull();
        expect(urls).toHaveLength(0); // court-circuité avant tout réseau
    });

    it('AVEC clé : un crypto va TOUJOURS à CoinGecko, JAMAIS à Finnhub (le routage prime sur la clé)', async () => {
        configureMarketDataProvider({ finnhubKey: 'k' });
        const urls: string[] = [];
        stubFetchCapturingUrls(urls);
        const q = await getQuote(CRYPTO);
        expect(q?.price).toBe(50_000);
        expect(urls.some((u) => u.includes('coingecko.com'))).toBe(true);
        expect(urls.some((u) => u.includes('finnhub.io'))).toBe(false);
    });

    it('AVEC clé : une action va à Finnhub', async () => {
        configureMarketDataProvider({ finnhubKey: 'k' });
        const urls: string[] = [];
        stubFetchCapturingUrls(urls);
        const q = await getQuote(STOCK);
        expect(q).not.toBeNull();
        expect(urls.some((u) => u.includes('finnhub.io'))).toBe(true);
        expect(urls.some((u) => u.includes('coingecko.com'))).toBe(false);
    });
});
