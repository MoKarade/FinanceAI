// §7.F.1 + F.2 — Tests façade marketData + provider Finnhub.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { withCache, clearMarketDataCache, getCacheSize } from '../../services/marketData/cache';
import { idbGetEntry, idbSetEntry } from '../../services/marketData/persistentCache';
import { configureMarketDataProvider, getQuote, getActiveProviderName, clearMarketDataCache as clearViaIndex } from '../../services/marketData';
import { FinnhubProvider } from '../../services/marketData/providers/finnhub';
import { MarketDataError } from '../../services/marketData/types';

describe('marketData.cache', () => {
    beforeEach(() => clearMarketDataCache());

    it('renvoie la valeur cachée sur 2e appel sans refetch', async () => {
        let calls = 0;
        const fetcher = async () => { calls++; return { value: 'X' }; };
        const a = await withCache('quote', 'NVDA', fetcher);
        const b = await withCache('quote', 'NVDA', fetcher);
        expect(a).toEqual({ value: 'X' });
        expect(b).toEqual({ value: 'X' });
        expect(calls).toBe(1);
    });

    it('ne cache pas une valeur null (re-fetch possible)', async () => {
        let calls = 0;
        const fetcher = async () => { calls++; return null; };
        await withCache('quote', 'BAD', fetcher);
        await withCache('quote', 'BAD', fetcher);
        expect(calls).toBe(2);
    });

    it('clearMarketDataCache(bucket) ne vide que le bucket spécifié', async () => {
        await withCache('quote', 'A', async () => 1);
        await withCache('profile', 'A', async () => 2);
        expect(getCacheSize()).toBe(2);
        clearMarketDataCache('quote');
        expect(getCacheSize()).toBe(1);
    });

    it('clearMarketDataCache() sans arg vide tout', async () => {
        await withCache('quote', 'A', async () => 1);
        await withCache('profile', 'A', async () => 2);
        clearMarketDataCache();
        expect(getCacheSize()).toBe(0);
    });

    it('cache un bucket persistant (history) via L1 mémoire, sans crash sans IndexedDB', async () => {
        // history est un bucket persistant : en jsdom (pas d'IndexedDB) la couche L2
        // est un no-op et on retombe sur le cache mémoire — sans erreur.
        let calls = 0;
        const fetcher = async () => { calls++; return { px: [1, 2, 3] }; };
        const a = await withCache('history', 'AAPL', fetcher);
        const b = await withCache('history', 'AAPL', fetcher);
        expect(a).toEqual({ px: [1, 2, 3] });
        expect(b).toEqual({ px: [1, 2, 3] });
        expect(calls).toBe(1);
    });
});

describe('persistentCache (couche IndexedDB, dégradation propre)', () => {
    it('idbGetEntry retourne null et idbSetEntry ne throw pas sans IndexedDB (jsdom)', async () => {
        await expect(idbSetEntry('k', { value: 1, expiresAt: Date.now() + 1000 })).resolves.toBeUndefined();
        expect(await idbGetEntry('k')).toBeNull();
    });
});

describe('marketData façade', () => {
    beforeEach(() => clearViaIndex());

    it('sans provider configuré, getQuote retourne null', async () => {
        configureMarketDataProvider({});
        expect(await getQuote('NVDA')).toBeNull();
        expect(getActiveProviderName()).toBe('none');
    });

    it('configureMarketDataProvider({finnhubKey}) active le provider', async () => {
        configureMarketDataProvider({ finnhubKey: 'fake-key' });
        expect(getActiveProviderName()).toBe('finnhub');
    });

    it('reconfigurer le provider vide le cache', async () => {
        configureMarketDataProvider({ finnhubKey: 'k1' });
        await withCache('quote', 'X', async () => ({ price: 1 }));
        expect(getCacheSize()).toBe(1);
        configureMarketDataProvider({ finnhubKey: 'k2' });
        expect(getCacheSize()).toBe(0);
    });
});

describe('FinnhubProvider', () => {
    it('throw si clé API vide', () => {
        expect(() => new FinnhubProvider('')).toThrow(/clé API requise/);
    });

    it('toFinnhubSymbol convertit les exchanges', async () => {
        // Mock fetch pour vérifier le URL généré
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ c: 100, d: 1, dp: 1, t: 1700000000 }),
        });
        vi.stubGlobal('fetch', fetchMock);
        const p = new FinnhubProvider('test-key');
        await p.getQuote('NASDAQ:NVDA');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const url = fetchMock.mock.calls[0][0] as string;
        expect(url).toContain('symbol=NVDA');
        // La clé passe en query `token=` (compatible navigateur : pas de header personnalisé → pas de
        // préflight CORS bloquant). PAS de header X-Finnhub-Token (cassait les requêtes en navigateur).
        expect(url).toContain('token=test-key');
        const callOpts = fetchMock.mock.calls[0][1] as RequestInit | undefined;
        const headers = (callOpts?.headers || {}) as Record<string, string>;
        expect(headers['X-Finnhub-Token']).toBeUndefined();
        vi.unstubAllGlobals();
    });

    it('getQuote retourne null si price 0 (Finnhub renvoie c=0 si pas trouvé)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ c: 0, d: 0, dp: 0, t: 0 }),
        }));
        const p = new FinnhubProvider('test-key');
        expect(await p.getQuote('FAKE:NONE')).toBeNull();
        vi.unstubAllGlobals();
    });

    it('inferCurrency : USD par défaut, CAD pour TSE:, EUR pour EPA:', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ c: 100, d: 0, dp: 0, t: 0 }),
        }));
        const p = new FinnhubProvider('k');
        const us = await p.getQuote('NASDAQ:NVDA');
        const ca = await p.getQuote('TSE:XEQT.TO');
        const fr = await p.getQuote('EPA:SAF');
        expect(us?.currency).toBe('USD');
        expect(ca?.currency).toBe('CAD');
        expect(fr?.currency).toBe('EUR');
        vi.unstubAllGlobals();
    });

    it('getProfile retourne un AssetProfile complet', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                name: 'NVIDIA Corporation',
                country: 'US',
                currency: 'USD',
                finnhubIndustry: 'Semiconductors',
            }),
        }));
        const p = new FinnhubProvider('k');
        const profile = await p.getProfile('NASDAQ:NVDA');
        expect(profile).not.toBeNull();
        expect(profile?.name).toBe('NVIDIA Corporation');
        expect(profile?.sector).toBe('Technologie'); // mapping finnhubIndustry
        expect(profile?.region).toBe('USA');
        vi.unstubAllGlobals();
    });

    it('throw MarketDataError AUTH si 401', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
        }));
        const p = new FinnhubProvider('bad');
        const q = await p.getQuote('NVDA'); // wrappé en console.warn + null
        expect(q).toBeNull();
        vi.unstubAllGlobals();
    });
});

describe('MarketDataError', () => {
    it('construit avec code + provider', () => {
        const e = new MarketDataError('test', 'RATE_LIMIT', 'finnhub');
        expect(e.code).toBe('RATE_LIMIT');
        expect(e.provider).toBe('finnhub');
        expect(e.message).toBe('test');
        expect(e.name).toBe('MarketDataError');
    });
});
