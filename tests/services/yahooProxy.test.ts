// tests/services/yahooProxy.test.ts
//
// [PORTFOLIO-HISTORY] Provider de repli Yahoo (proxy same-origin) : parse pur du chart JSON,
// contrat null (erreur, jamais caché) vs [] (vide valide, cacheable), null intraday omis.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseYahooChart, getYahooHistory } from '../../services/marketData/providers/yahooProxy';

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
