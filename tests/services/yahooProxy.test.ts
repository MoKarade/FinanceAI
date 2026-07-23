// tests/services/yahooProxy.test.ts
//
// [PORTFOLIO-HISTORY] Provider de repli Yahoo (proxy same-origin) : parse pur du chart JSON,
// contrat null (erreur, jamais caché) vs [] (vide valide, cacheable), null intraday omis.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    parseYahooChart, getYahooHistory, parseYahooQuote, getYahooQuote, parseYahooSearch, searchYahooSymbols,
} from '../../services/marketData/providers/yahooProxy';

const FROM = new Date('2026-01-01T00:00:00Z');
const TO = new Date('2026-01-31T00:00:00Z');

const ts = (iso: string): number => Math.floor(new Date(`${iso}T15:00:00Z`).getTime() / 1000);

afterEach(() => { vi.unstubAllGlobals(); });

describe('parseYahooChart (pur)', () => {
    it('happy path → HistoryPoints datés, triés, close > 0', () => {
        const out = parseYahooChart({
            chart: { result: [{ timestamp: [ts('2026-01-05'), ts('2026-01-06')], indicators: { quote: [{ close: [100.5, 101.2] }] } }] },
        }, FROM, TO);
        expect(out).toEqual([
            { date: '2026-01-05', close: 100.5 },
            { date: '2026-01-06', close: 101.2 },
        ]);
    });

    it('close null (jour sans clôture) → point OMIS, jamais un 0 fabriqué', () => {
        const out = parseYahooChart({
            chart: { result: [{ timestamp: [ts('2026-01-05'), ts('2026-01-06')], indicators: { quote: [{ close: [100, null] }] } }] },
        }, FROM, TO);
        expect(out).toEqual([{ date: '2026-01-05', close: 100 }]);
    });

    it('hors fenêtre [from, to] → filtré', () => {
        const out = parseYahooChart({
            chart: { result: [{ timestamp: [ts('2025-12-01'), ts('2026-01-10')], indicators: { quote: [{ close: [90, 100] }] } }] },
        }, FROM, TO);
        expect(out).toEqual([{ date: '2026-01-10', close: 100 }]);
    });

    it('deux points le MÊME jour (intraday + clôture) → dernier gardé', () => {
        const t1 = ts('2026-01-05');
        const out = parseYahooChart({
            chart: { result: [{ timestamp: [t1, t1 + 3600], indicators: { quote: [{ close: [100, 100.7] }] } }] },
        }, FROM, TO);
        expect(out).toEqual([{ date: '2026-01-05', close: 100.7 }]);
    });

    it('forme inattendue (pas de result) → null (erreur)', () => {
        expect(parseYahooChart({ chart: { result: [], error: { code: 'Not Found' } } }, FROM, TO)).toBeNull();
        expect(parseYahooChart({} as never, FROM, TO)).toBeNull();
    });

    it('result sans séries (période sans données) → [] (vide valide)', () => {
        expect(parseYahooChart({ chart: { result: [{}] } }, FROM, TO)).toEqual([]);
    });
});

describe('getYahooHistory (fetch via proxy)', () => {
    it('appelle le proxy SAME-ORIGIN /api/history/yahoo/ (jamais yahoo.com en direct — CSP)', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            chart: { result: [{ timestamp: [ts('2026-01-05')], indicators: { quote: [{ close: [100] }] } }] },
        }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const out = await getYahooHistory('TSE:XEQT', FROM, TO);
        const url = (fetchMock.mock.calls[0] as unknown as [string])[0];
        expect(url.startsWith('/api/history/yahoo/')).toBe(true);
        expect(url).toContain('XEQT.TO'); // mapping toFinnhubSymbol (mêmes suffixes que Yahoo)
        expect(out).toEqual([{ date: '2026-01-05', close: 100 }]);
    });

    it('404 (symbole inconnu) → [] (vide valide, cacheable)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('nf', { status: 404 })));
        expect(await getYahooHistory('INCONNU', FROM, TO)).toEqual([]);
    });

    it('5xx / proxy absent → null (erreur, jamais cachée)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 502 })));
        expect(await getYahooHistory('AAPL', FROM, TO)).toBeNull();
    });

    it('échec réseau (fetch rejette) → null, sans throw', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
        expect(await getYahooHistory('AAPL', FROM, TO)).toBeNull();
    });
});

// ── [HIST-MULTI-PROVIDER] Quote de repli (meta du chart) ────────────────────────────────────────

describe('parseYahooQuote (pur)', () => {
    it('happy path → Quote avec prix/devise Yahoo + variation depuis chartPreviousClose', () => {
        const q = parseYahooQuote({
            chart: { result: [{ meta: { currency: 'EUR', regularMarketPrice: 550.25, chartPreviousClose: 545, regularMarketTime: 1_753_000_000 } }] },
        }, 'CW8.PA');
        expect(q).toEqual({
            symbol: 'CW8.PA', price: 550.25, change: 5.25,
            changePercent: (5.25 / 545) * 100, currency: 'EUR', timestamp: 1_753_000_000_000,
        });
    });

    it('prix manquant / non fini / ≤ 0 → null (jamais un 0 fabriqué)', () => {
        expect(parseYahooQuote({ chart: { result: [{ meta: { currency: 'EUR' } }] } }, 'X')).toBeNull();
        expect(parseYahooQuote({ chart: { result: [{ meta: { regularMarketPrice: NaN } }] } }, 'X')).toBeNull();
        expect(parseYahooQuote({ chart: { result: [{ meta: { regularMarketPrice: 0 } }] } }, 'X')).toBeNull();
        expect(parseYahooQuote({} as never, 'X')).toBeNull();
    });

    it('sans previousClose → change/changePercent 0 honnêtes (pas de NaN)', () => {
        const q = parseYahooQuote({ chart: { result: [{ meta: { regularMarketPrice: 100, currency: 'USD' } }] } }, 'X')!;
        expect(q.change).toBe(0);
        expect(q.changePercent).toBe(0);
    });
});

describe('getYahooQuote (fetch via proxy)', () => {
    it('appelle le proxy same-origin avec le symbole mappé ; 404/erreur → null', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            chart: { result: [{ meta: { currency: 'CAD', regularMarketPrice: 30.5 } }] },
        }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const q = await getYahooQuote('TSE:XEQT');
        const url = (fetchMock.mock.calls[0] as unknown as [string])[0];
        expect(url.startsWith('/api/history/yahoo/')).toBe(true);
        expect(url).toContain('XEQT.TO');
        expect(q?.price).toBe(30.5);
        expect(q?.currency).toBe('CAD');

        vi.stubGlobal('fetch', vi.fn(async () => new Response('nf', { status: 404 })));
        expect(await getYahooQuote('INCONNU')).toBeNull(); // une quote n'a pas de « vide valide »
    });
});

// ── [HIST-MULTI-PROVIDER] Recherche de titre par nom ────────────────────────────────────────────

describe('parseYahooSearch (pur)', () => {
    it('garde actions/ETF/fonds, rejette indices/news/sans symbole, cap à 6', () => {
        const out = parseYahooSearch({
            quotes: [
                { symbol: 'AASI.PA', longname: 'Amundi MSCI Em Asia UCITS ETF', exchDisp: 'Paris', quoteType: 'ETF' },
                { symbol: '^GSPC', shortname: 'S&P 500', quoteType: 'INDEX' },
                { symbol: 'AAPL', shortname: 'Apple Inc.', exchDisp: 'NASDAQ', quoteType: 'EQUITY' },
                { shortname: 'sans symbole', quoteType: 'EQUITY' },
                ...Array.from({ length: 8 }, (_, i) => ({ symbol: `E${i}`, shortname: `E${i}`, quoteType: 'ETF' })),
            ],
        });
        expect(out[0]).toEqual({ symbol: 'AASI.PA', name: 'Amundi MSCI Em Asia UCITS ETF', exchange: 'Paris' });
        expect(out.some((r) => r.symbol === '^GSPC')).toBe(false);
        expect(out.length).toBe(6);
    });

    it('réponse vide/inattendue → []', () => {
        expect(parseYahooSearch({})).toEqual([]);
        expect(parseYahooSearch({ quotes: [] })).toEqual([]);
    });
});

describe('searchYahooSymbols (fetch via proxy)', () => {
    it('proxy same-origin /api/search/yahoo ; erreur → null ; requête vide → [] sans réseau', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            quotes: [{ symbol: 'AASI.PA', shortname: 'Amundi EM Asia', exchDisp: 'Paris', quoteType: 'ETF' }],
        }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const out = await searchYahooSymbols('Amundi EM Asia');
        const url = (fetchMock.mock.calls[0] as unknown as [string])[0];
        expect(url.startsWith('/api/search/yahoo?q=')).toBe(true);
        expect(out).toEqual([{ symbol: 'AASI.PA', name: 'Amundi EM Asia', exchange: 'Paris' }]);

        vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 502 })));
        expect(await searchYahooSymbols('X')).toBeNull();

        const noCall = vi.fn();
        vi.stubGlobal('fetch', noCall);
        expect(await searchYahooSymbols('   ')).toEqual([]);
        expect(noCall).not.toHaveBeenCalled();
    });
});
