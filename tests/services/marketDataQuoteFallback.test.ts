/**
 * @vitest-environment jsdom
 */
// tests/services/marketDataQuoteFallback.test.ts
//
// [HIST-MULTI-PROVIDER] Chaîne de REPLI des quotes (façade marketData) : Finnhub (si clé) →
// Yahoo proxy same-origin (navigateur). Le tier gratuit Finnhub ne quote pas les bourses
// européennes → sans ce maillon, un ETF Euronext gardait un prix figé à vie (TOTAL faux ~40 k$,
// retour Marc post-#493). jsdom = environnement navigateur (le repli est gated sur `window`).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    configureMarketDataProvider, hasQuoteProvider, getQuote, clearMarketDataCache,
} from '../../services/marketData';

const yahooChartResponse = (price: number, currency: string) => new Response(JSON.stringify({
    chart: { result: [{ meta: { currency, regularMarketPrice: price, chartPreviousClose: price - 1 } }] },
}), { status: 200 });

describe('[HIST-MULTI-PROVIDER] repli quote Yahoo (navigateur)', () => {
    beforeEach(() => {
        clearMarketDataCache();
        configureMarketDataProvider({});
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        configureMarketDataProvider({});
        clearMarketDataCache();
    });

    it('SANS clé Finnhub : une action/ETF est quotable via Yahoo (avant : null à vie)', async () => {
        expect(hasQuoteProvider('CW8.PA')).toBe(true); // navigateur → repli disponible
        const fetchMock = vi.fn(async () => yahooChartResponse(550, 'EUR'));
        vi.stubGlobal('fetch', fetchMock);
        const q = await getQuote('CW8.PA');
        expect(q?.price).toBe(550);
        expect(q?.currency).toBe('EUR');
        const url = String((fetchMock.mock.calls[0] as unknown as [string])[0]);
        expect(url.startsWith('/api/history/yahoo/')).toBe(true); // proxy same-origin, jamais yahoo.com direct
    });

    it('AVEC clé Finnhub : Finnhub d\'abord ; s\'il rend null (403 Europe) → repli Yahoo', async () => {
        configureMarketDataProvider({ finnhubKey: 'k' });
        const calls: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
            const s = String(input);
            calls.push(s);
            if (s.includes('finnhub.io')) return new Response('forbidden', { status: 403 });
            return yahooChartResponse(551, 'EUR');
        }));
        const q = await getQuote('CW8.PA');
        expect(calls.some((u) => u.includes('finnhub.io'))).toBe(true);       // le primaire a été tenté
        expect(calls.some((u) => u.startsWith('/api/history/yahoo/'))).toBe(true); // puis le repli
        expect(q?.price).toBe(551);
    });

    it('crypto : JAMAIS de repli Yahoo (CoinGecko fait foi)', async () => {
        const fetchMock = vi.fn(async () => new Response('down', { status: 500 }));
        vi.stubGlobal('fetch', fetchMock);
        const q = await getQuote('BTC-CAD');
        expect(q).toBeNull();
        expect(fetchMock.mock.calls.every((c) => !String((c as unknown as [string])[0]).startsWith('/api/'))).toBe(true);
    });

    it('tous les maillons en échec → null (jamais caché : le prochain appel retente)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 502 })));
        expect(await getQuote('CW8.PA')).toBeNull();
        // 2e appel : re-fetch (null non caché) — discriminant du contrat « erreur jamais cachée ».
        const fetchMock2 = vi.fn(async () => yahooChartResponse(550, 'EUR'));
        vi.stubGlobal('fetch', fetchMock2);
        expect((await getQuote('CW8.PA'))?.price).toBe(550);
    });
});
