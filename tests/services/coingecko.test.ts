import { describe, it, expect, vi, afterEach } from 'vitest';
import { CoinGeckoProvider, coinGeckoIdFor } from '../../services/marketData/providers/coingecko';
import { logError } from '../../services/errorLogger';

// SF-2 — une vraie erreur de cours (réseau/AUTH/rate limit) ne doit plus être avalée
// en console.warn (invisible en prod) mais journalisée ; un NOT_FOUND (crypto inconnue)
// reste un cas légitime → PAS de log.
vi.mock('../../services/errorLogger', () => ({ logError: vi.fn() }));

const jsonRes = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
}) as unknown as Response;

afterEach(() => {
    vi.restoreAllMocks();
});

describe('coinGeckoIdFor — routage', () => {
    it('reconnaît les cryptos (avec/sans devise)', () => {
        expect(coinGeckoIdFor('BTC-CAD')).toBe('bitcoin');
        expect(coinGeckoIdFor('ETH')).toBe('ethereum');
        expect(coinGeckoIdFor('sol-usd')).toBe('solana');
    });
    it('retourne null pour les actions/ETF (→ resteront sur Finnhub)', () => {
        expect(coinGeckoIdFor('AAPL')).toBeNull();
        expect(coinGeckoIdFor('VFV.TO')).toBeNull();
        expect(coinGeckoIdFor('TSE:XEQT.TO')).toBeNull();
        expect(coinGeckoIdFor('')).toBeNull();
    });
});

describe('CoinGeckoProvider', () => {
    const cg = new CoinGeckoProvider();

    it('getQuote : prix + devise depuis le symbole', async () => {
        globalThis.fetch = vi.fn(async () =>
            jsonRes({ bitcoin: { cad: 107000, cad_24h_change: 2.5 } }),
        ) as unknown as typeof fetch;
        const q = await cg.getQuote('BTC-CAD');
        expect(q).not.toBeNull();
        expect(q!.price).toBe(107000);
        expect(q!.currency).toBe('CAD');
        expect(q!.changePercent).toBe(2.5);
    });

    it('getHistory : downsample à 1 point/jour, filtré sur [from, to]', async () => {
        const t = (iso: string) => new Date(iso).getTime();
        globalThis.fetch = vi.fn(async () =>
            jsonRes({
                prices: [
                    [t('2026-01-01T08:00:00Z'), 100],
                    [t('2026-01-01T20:00:00Z'), 110], // même jour, plus tard → gagne
                    [t('2026-01-02T12:00:00Z'), 120],
                    [t('2026-01-04T12:00:00Z'), 130], // hors borne → exclu
                ],
            }),
        ) as unknown as typeof fetch;
        const hist = await cg.getHistory('BTC-CAD', new Date('2026-01-01T00:00:00Z'), new Date('2026-01-03T23:59:59Z'));
        expect(hist).toEqual([
            { date: '2026-01-01', close: 110 },
            { date: '2026-01-02', close: 120 },
        ]);
    });

    it('getHistory : symbole non-crypto → [] sans fetch', async () => {
        const spy = vi.fn();
        globalThis.fetch = spy as unknown as typeof fetch;
        const hist = await cg.getHistory('AAPL', new Date(), new Date());
        expect(hist).toEqual([]);
        expect(spy).not.toHaveBeenCalled();
    });

    it('getProfile : secteur Crypto', async () => {
        const p = await cg.getProfile('ETH-CAD');
        expect(p).not.toBeNull();
        expect(p!.sector).toBe('Crypto');
        expect(p!.name).toBe('Ethereum');
        expect(p!.currency).toBe('CAD');
    });

    it('[QUOTE-ERRKIND] getQuote : erreur 500 → throw MarketDataError UNKNOWN (transitoire, non aplati)', async () => {
        globalThis.fetch = vi.fn(async () => jsonRes({}, 500)) as unknown as typeof fetch;
        await expect(cg.getQuote('BTC-CAD')).rejects.toMatchObject({ code: 'UNKNOWN' });
    });

    it('[QUOTE-ERRKIND] getQuote : erreur 500 → logError appelé (non silencieux) AVANT le throw', async () => {
        vi.mocked(logError).mockClear();
        globalThis.fetch = vi.fn(async () => jsonRes({}, 500)) as unknown as typeof fetch;
        await expect(cg.getQuote('BTC-CAD')).rejects.toMatchObject({ code: 'UNKNOWN' });
        expect(logError).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('getQuote') }),
        );
    });

    it('[QUOTE-ERRKIND] getQuote : 404 NOT_FOUND (crypto inconnue) → throw NOT_FOUND, PAS de logError (cas légitime)', async () => {
        vi.mocked(logError).mockClear();
        globalThis.fetch = vi.fn(async () => jsonRes({}, 404)) as unknown as typeof fetch;
        // La façade reclasse ce NOT_FOUND en absence CONFIRMÉE (comptée au skip) ; ici on vérifie le
        // contrat provider (propagation) + le silence légitime (pas de bruit sur une crypto inconnue).
        await expect(cg.getQuote('BTC-CAD')).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(logError).not.toHaveBeenCalled();
    });
});
