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

const COINGECKO_HOST = 'api.coingecko.com';
const FINNHUB_HOST = 'finnhub.io';

/** Hostname EXACT de l'URL (parsé) — jamais un substring d'URL (anti-pattern CodeQL/sanitization). */
function hostOf(input: string | URL): string {
    return new URL(String(input)).hostname;
}

/** Mock fetch qui répond selon l'HÔTE PARSÉ + mémorise les hostnames appelés pour prouver le routage. */
function stubFetchCapturingHosts(hosts: string[]) {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
        const host = hostOf(input);
        hosts.push(host);
        if (host === COINGECKO_HOST) {
            return { ok: true, status: 200, json: async () => ({ bitcoin: { cad: 50_000, cad_24h_change: 1.5 } }) } as Response;
        }
        // FINNHUB_HOST
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

    it('SANS clé Finnhub : un crypto est routable (CoinGecko), une action AUSSI ([HIST-MULTI-PROVIDER] repli Yahoo navigateur)', () => {
        expect(hasQuoteProvider(CRYPTO)).toBe(true);  // CoinGecko indépendant de la clé
        // Avant : false (les actions étaient inquotables sans clé → prix figés à vie). Depuis le
        // repli quote Yahoo (proxy same-origin), toute action/ETF est quotable dans le navigateur
        // (jsdom = env navigateur ; la branche hors-navigateur rend toujours false).
        expect(hasQuoteProvider(STOCK)).toBe(true);
    });

    it('AVEC clé Finnhub : l\'action devient routable, le crypto le reste', () => {
        configureMarketDataProvider({ finnhubKey: 'k' });
        expect(hasQuoteProvider(STOCK)).toBe(true);
        expect(hasQuoteProvider(CRYPTO)).toBe(true);
    });

    it('SANS clé : getQuote(crypto) frappe CoinGecko et renvoie un prix (ne tombe PAS sur un Finnhub null)', async () => {
        const hosts: string[] = [];
        stubFetchCapturingHosts(hosts);
        const q = await getQuote(CRYPTO);
        expect(q).not.toBeNull();
        expect(q?.price).toBe(50_000);
        expect(hosts).toContain(COINGECKO_HOST);
        expect(hosts).not.toContain(FINNHUB_HOST);
    });

    it('SANS clé : getQuote(action) va au REPLI Yahoo (proxy same-origin), jamais à Finnhub', async () => {
        // [HIST-MULTI-PROVIDER] Avant : null sans réseau (action inquotable sans clé). Désormais le
        // repli Yahoo répond — URLs RELATIVES `/api/...` (le mock par hostname ne les voit pas).
        const relativeUrls: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
            const s = String(input);
            if (s.startsWith('/')) {
                relativeUrls.push(s);
                return new Response(JSON.stringify({
                    chart: { result: [{ meta: { currency: 'USD', regularMarketPrice: 101 } }] },
                }), { status: 200 });
            }
            throw new Error(`appel direct inattendu : ${s}`); // ni finnhub.io ni yahoo.com en direct
        }));
        const q = await getQuote(STOCK);
        expect(q?.price).toBe(101);
        expect(relativeUrls.some((u) => u.startsWith('/api/history/yahoo/'))).toBe(true);
    });

    it('AVEC clé : un crypto va TOUJOURS à CoinGecko, JAMAIS à Finnhub (le routage prime sur la clé)', async () => {
        configureMarketDataProvider({ finnhubKey: 'k' });
        const hosts: string[] = [];
        stubFetchCapturingHosts(hosts);
        const q = await getQuote(CRYPTO);
        expect(q?.price).toBe(50_000);
        expect(hosts).toContain(COINGECKO_HOST);
        expect(hosts).not.toContain(FINNHUB_HOST);
    });

    it('AVEC clé : une action va à Finnhub', async () => {
        configureMarketDataProvider({ finnhubKey: 'k' });
        const hosts: string[] = [];
        stubFetchCapturingHosts(hosts);
        const q = await getQuote(STOCK);
        expect(q).not.toBeNull();
        expect(hosts).toContain(FINNHUB_HOST);
        expect(hosts).not.toContain(COINGECKO_HOST);
    });
});
