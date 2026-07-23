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
    configureMarketDataProvider, hasQuoteProvider, canAttemptQuote, getQuote, getHistory, clearMarketDataCache,
} from '../../services/marketData';
import { __resetNegativeCacheForTests } from '../../services/marketData/negativeCache';

const yahooChartResponse = (price: number, currency: string) => new Response(JSON.stringify({
    chart: { result: [{ meta: { currency, regularMarketPrice: price, chartPreviousClose: price - 1 } }] },
}), { status: 200 });

/** Hostname PARSÉ d'une URL absolue ('' si relative) — jamais un substring d'URL (CodeQL :
 *  « finnhub.io » en substring matcherait evil.com/finnhub.io ; pattern hostOf de marketDataRouting). */
const hostOf = (u: string): string => {
    try {
        return new URL(u).hostname;
    } catch {
        return ''; // URL relative (proxy same-origin) → pas un host externe
    }
};

describe('[HIST-MULTI-PROVIDER] repli quote Yahoo (navigateur)', () => {
    beforeEach(() => {
        clearMarketDataCache();
        configureMarketDataProvider({});
        // [QUOTE-NEGATIVE-CACHE] Isolation : les nulls des tests précédents ne doivent pas
        // armer un skip négatif qui changerait le comportement des tests suivants.
        localStorage.clear();
        __resetNegativeCacheForTests();
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
            if (hostOf(s) === 'finnhub.io') return new Response('forbidden', { status: 403 });
            return yahooChartResponse(551, 'EUR');
        }));
        const q = await getQuote('CW8.PA');
        expect(calls.some((u) => hostOf(u) === 'finnhub.io')).toBe(true);          // le primaire a été tenté
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

    // [QUOTE-NEGATIVE-CACHE] Intégration façade : 3 nulls consécutifs → skip sans réseau ;
    // un succès efface l'entrée.
    it('après 3 échecs consécutifs, getQuote rend null SANS toucher au réseau (skip négatif)', async () => {
        const failMock = vi.fn(async () => new Response('down', { status: 502 }));
        vi.stubGlobal('fetch', failMock);
        for (let i = 0; i < 3; i++) expect(await getQuote('GICXYZ')).toBeNull();
        expect(canAttemptQuote('GICXYZ')).toBe(false); // les boucles pacées skippent d'emblée
        const countAfter3 = failMock.mock.calls.length;
        expect(await getQuote('GICXYZ')).toBeNull(); // 4e appel : skip
        expect(failMock.mock.calls.length).toBe(countAfter3); // AUCUN fetch de plus
    });

    it('PÉRIMÈTRE : les échecs d\'HISTORIQUE n\'arment JAMAIS le cache négatif (contrat []/null préservé)', async () => {
        // Verrou anti-régression (finding code-reviewer #499) : getHistory est VOLONTAIREMENT hors
        // du mécanisme — son contrat [] (vide confirmé) / null (erreur) pilote la résolution de
        // variantes de hydrateAssetHistories ; un skip négatif qui rendrait null la masquerait.
        vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 502 })));
        for (let i = 0; i < 4; i++) {
            expect(await getHistory('CW8.PA', new Date('2026-01-01'), new Date('2026-07-01'))).toBeNull();
        }
        expect(canAttemptQuote('CW8.PA')).toBe(true); // aucun skip quote armé par les échecs history
        const fetchMock = vi.fn(async () => yahooChartResponse(553, 'EUR'));
        vi.stubGlobal('fetch', fetchMock);
        expect((await getQuote('CW8.PA'))?.price).toBe(553); // la quote passe toujours au réseau
        expect(fetchMock).toHaveBeenCalled();
    });

    it('SKIP négatif : une valeur ENCORE VALIDE du cache positif sert malgré un skip armé', async () => {
        // Finding silent-failure #499 (sonde) : le check placé AVANT withCache masquait un cache
        // positif frais → déplacé DANS le fetcher (une réponse déjà connue sert toujours).
        vi.stubGlobal('fetch', vi.fn(async () => yahooChartResponse(560, 'EUR')));
        expect((await getQuote('CW8.PA'))?.price).toBe(560); // remplit le cache positif 5 min
        const { recordNegative } = await import('../../services/marketData/negativeCache');
        for (let i = 0; i < 3; i++) recordNegative('quote', 'CW8.PA'); // skip armé par ailleurs
        const fetchMock = vi.fn(async () => new Response('down', { status: 502 }));
        vi.stubGlobal('fetch', fetchMock);
        expect((await getQuote('CW8.PA'))?.price).toBe(560); // le cache positif sert, zéro réseau
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('un succès efface le compteur négatif (2 échecs puis succès → pas de skip)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 502 })));
        expect(await getQuote('CW8.PA')).toBeNull();
        expect(await getQuote('CW8.PA')).toBeNull();
        vi.stubGlobal('fetch', vi.fn(async () => yahooChartResponse(552, 'EUR')));
        expect((await getQuote('CW8.PA'))?.price).toBe(552); // succès → compteur effacé
        clearMarketDataCache(); // vide le cache positif 5 min pour forcer un vrai re-fetch
        vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 502 })));
        expect(await getQuote('CW8.PA')).toBeNull(); // 1er échec d'une NOUVELLE série
        expect(canAttemptQuote('CW8.PA')).toBe(true); // pas de skip (compteur reparti à 1)
    });
});
