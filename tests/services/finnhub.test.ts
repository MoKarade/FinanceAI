// services/marketData/providers/finnhub.ts — premier filet de tests (le provider n'en avait AUCUN) :
// mapping des symboles, parsing des réponses (avec coercition D5 des champs de type inattendu) et
// gestion des erreurs HTTP (401/403/429 → null/[], pas de crash). fetch global mocké.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FinnhubProvider, toFinnhubSymbol } from '../../services/marketData/providers/finnhub';

vi.mock('../../services/errorLogger', () => ({ logError: vi.fn() }));

const res = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
}) as unknown as Response;
const mockFetch = (body: unknown, status = 200) => {
    globalThis.fetch = vi.fn(async () => res(body, status)) as unknown as typeof fetch;
};

afterEach(() => { vi.restoreAllMocks(); });

describe('toFinnhubSymbol — mapping des places', () => {
    it('mappe NASDAQ/NYSE/TSE/TSX/EPA et laisse un ticker brut', () => {
        expect(toFinnhubSymbol('NASDAQ:NVDA')).toBe('NVDA');
        expect(toFinnhubSymbol('NYSE:V')).toBe('V');
        expect(toFinnhubSymbol('TSE:XEQT.TO')).toBe('XEQT.TO');
        expect(toFinnhubSymbol('TSX:SHOP')).toBe('SHOP.TO');
        expect(toFinnhubSymbol('EPA:SAF')).toBe('SAF.PA');
        expect(toFinnhubSymbol('AAPL')).toBe('AAPL');
    });

    // [INVEST-COURS-EXACT-TOUTES-ACTIONS] Xetra/Milan absents de cette table : un titre `ETR:KLA`/
    // `BIT:GBS` tombait dans le fallback « ticker brut » (`KLA`, `GBS`), que Finnhub/Yahoo ne
    // résolvent pas (pas de suffixe de place) → cours jamais rafraîchi, silencieusement. Ce test
    // ÉCHOUE sur l'ancien code (rendait `KLA`/`GBS` au lieu de `KLA.DE`/`GBS.MI`).
    it('mappe ETR (Xetra) et BIT (Milan) vers leurs suffixes Finnhub/Yahoo', () => {
        expect(toFinnhubSymbol('ETR:KLA')).toBe('KLA.DE');
        expect(toFinnhubSymbol('BIT:GBS')).toBe('GBS.MI');
    });

    it('un préfixe INCONNU (ex. OTCMKTS, place non couverte) retombe sur le ticker brut, jamais un titre AU HASARD', () => {
        // Aucune place ajoutée sans convention de préfixe VÉRIFIÉE (cf commentaire de toFinnhubSymbol) :
        // deviner routerait potentiellement vers un AUTRE instrument — pire qu'un cours absent.
        expect(toFinnhubSymbol('OTCMKTS:ANDXF')).toBe('ANDXF');
    });
});

describe('FinnhubProvider — getQuote', () => {
    const p = new FinnhubProvider('test-key');

    it('réponse valide → Quote (prix + change + timestamp)', async () => {
        mockFetch({ c: 150, d: 2, dp: 1.5, t: 1_700_000_000 });
        const q = await p.getQuote('NASDAQ:AAPL');
        expect(q).not.toBeNull();
        expect(q!.price).toBe(150);
        expect(q!.change).toBe(2);
        expect(q!.changePercent).toBe(1.5);
        expect(q!.timestamp).toBe(1_700_000_000 * 1000);
    });

    it('D5 — champ secondaire de type inattendu (string/null) → coercé à 0, jamais propagé', async () => {
        mockFetch({ c: 150, d: 'oops', dp: null, t: 'nope' });
        const q = await p.getQuote('AAPL');
        expect(q!.price).toBe(150);
        expect(q!.change).toBe(0);
        expect(q!.changePercent).toBe(0);
        expect(Number.isFinite(q!.timestamp)).toBe(true); // pas de NaN (avant : 'nope' * 1000)
    });

    it('prix non-numérique → null', async () => {
        mockFetch({ c: 'NA', d: 1 });
        expect(await p.getQuote('AAPL')).toBeNull();
    });
    it('prix 0 (ticker introuvable) → null', async () => {
        mockFetch({ c: 0, d: 0, dp: 0 });
        expect(await p.getQuote('NADA')).toBeNull();
    });
    it('[QUOTE-ERRKIND] 401 (clé invalide) → throw MarketDataError AUTH (erreur propagée, pas aplatie)', async () => {
        mockFetch({}, 401);
        await expect(p.getQuote('AAPL')).rejects.toMatchObject({ code: 'AUTH' });
    });
    it('[QUOTE-ERRKIND] 429 (rate limit) → throw MarketDataError RATE_LIMIT (transitoire, non compté au skip)', async () => {
        mockFetch({}, 429);
        await expect(p.getQuote('AAPL')).rejects.toMatchObject({ code: 'RATE_LIMIT' });
    });
});

describe('FinnhubProvider — getHistory', () => {
    const p = new FinnhubProvider('k');
    it('status ok → points (close coercé)', async () => {
        mockFetch({ s: 'ok', t: [1_700_000_000, 1_700_086_400], c: [100, 'bad'], o: [99, 101] });
        const h = await p.getHistory('AAPL', new Date('2026-01-01'), new Date('2026-01-03'));
        expect(h).not.toBeNull();
        expect(h!.length).toBe(2);
        expect(h![0].close).toBe(100);
        expect(h![1].close).toBe(0); // 'bad' coercé (D5)
    });
    it('status no_data → [] (vide VALIDE, cacheable)', async () => {
        mockFetch({ s: 'no_data' });
        expect(await p.getHistory('AAPL', new Date(), new Date())).toEqual([]);
    });
    it('[PORTFOLIO-HISTORY] 403 (candles premium) → null (ERREUR, jamais cachée → repli possible)', async () => {
        mockFetch({}, 403);
        expect(await p.getHistory('AAPL', new Date(), new Date())).toBeNull();
    });
    it('[PORTFOLIO-HISTORY] forme inattendue (s manquant) → null', async () => {
        mockFetch({ bizarre: true });
        expect(await p.getHistory('AAPL', new Date(), new Date())).toBeNull();
    });
});

describe('FinnhubProvider — getProfile / getDividends', () => {
    const p = new FinnhubProvider('k');
    it('getProfile valide → profil mappé', async () => {
        mockFetch({ name: 'Apple Inc', finnhubIndustry: 'Technology', country: 'US', currency: 'USD' });
        const pr = await p.getProfile('AAPL');
        expect(pr!.name).toBe('Apple Inc');
        expect(pr!.sector).toBe('Technologie');
        expect(pr!.region).toBe('USA');
    });
    it('getProfile sans nom → null', async () => {
        mockFetch({ country: 'US' });
        expect(await p.getProfile('AAPL')).toBeNull();
    });
    it('getDividends non-array → []', async () => {
        mockFetch({ error: 'x' });
        expect(await p.getDividends('AAPL')).toEqual([]);
    });
    it('getDividends valide → liste (amount coercé)', async () => {
        mockFetch([{ amount: 0.25, exDate: '2026-02-01', payDate: '2026-02-15' }, { amount: 'bad', exDate: '2026-05-01' }]);
        const d = await p.getDividends('AAPL');
        expect(d.length).toBe(2);
        expect(d[0].amount).toBe(0.25);
        expect(d[1].amount).toBe(0); // coercé (D5)
    });
});

describe('FinnhubProvider — searchSymbol (PH4-INV-1 autocomplétion)', () => {
    const p = new FinnhubProvider('test-key');

    it('mappe result[] → SymbolSearchResult[] (symbol/description/displaySymbol/type)', async () => {
        mockFetch({ count: 2, result: [
            { symbol: 'AAPL', displaySymbol: 'AAPL', description: 'APPLE INC', type: 'Common Stock' },
            { symbol: 'AAPL.SW', displaySymbol: 'AAPL.SW', description: 'APPLE INC', type: 'Common Stock' },
        ] });
        const r = await p.searchSymbol('apple');
        expect(r).toHaveLength(2);
        expect(r[0]).toEqual({ symbol: 'AAPL', description: 'APPLE INC', displaySymbol: 'AAPL', type: 'Common Stock' });
    });

    it('filtre les entrées sans symbol OU sans description', async () => {
        mockFetch({ count: 3, result: [
            { symbol: 'AAPL', displaySymbol: 'AAPL', description: 'APPLE INC', type: 'Common Stock' },
            { symbol: '', description: 'vide' },
            { symbol: 'NODESC', displaySymbol: 'NODESC', description: '' },
        ] });
        const r = await p.searchSymbol('x');
        expect(r).toHaveLength(1);
        expect(r[0].symbol).toBe('AAPL');
    });

    it('displaySymbol absent → retombe sur symbol ; type absent → undefined', async () => {
        mockFetch({ count: 1, result: [{ symbol: 'XEQT.TO', description: 'ISHARES CORE EQUITY ETF' }] });
        const r = await p.searchSymbol('xeqt');
        expect(r[0].displaySymbol).toBe('XEQT.TO');
        expect(r[0].type).toBeUndefined();
    });

    it('requête vide/espaces → [] SANS appel réseau', async () => {
        const spy = vi.fn();
        globalThis.fetch = spy as unknown as typeof fetch;
        expect(await p.searchSymbol('   ')).toEqual([]);
        expect(spy).not.toHaveBeenCalled();
    });

    it('result absent ou non-tableau → []', async () => {
        mockFetch({ count: 0 });
        expect(await p.searchSymbol('zzz')).toEqual([]);
    });

    it('erreur HTTP (429 rate limit) → [] (pas de crash)', async () => {
        mockFetch({}, 429);
        expect(await p.searchSymbol('aapl')).toEqual([]);
    });
});

describe('FinnhubProvider — inferCurrency (via getQuote.currency)', () => {
    const p = new FinnhubProvider('test-key');
    const q = async (sym: string) => {
        mockFetch({ c: 100, d: 1, dp: 1, t: 1_700_000_000 });
        return (await p.getQuote(sym))!.currency;
    };

    it('[PRICE-REFRESH-LIVE] SUFFIXES Finnhub (format /search) : .PA/.TG/.DE → EUR, .TO/.V → CAD, .L → GBP', async () => {
        // Finding panel 2026-07-15 : sans les suffixes, `CW8.PA` était étiqueté USD → la garde de
        // devise du refresh skippait à tort TOUTE la poche EUR en « currency-mismatch » (les cours
        // EUR ne se rafraîchissaient JAMAIS). Ce test ÉCHOUE sur l'ancien code (rendait 'USD').
        expect(await q('CW8.PA')).toBe('EUR');
        expect(await q('SAF.PA')).toBe('EUR');
        expect(await q('KLA.TG')).toBe('EUR');
        expect(await q('SAP.DE')).toBe('EUR');
        expect(await q('VISA.TO')).toBe('CAD');
        expect(await q('XYZ.V')).toBe('CAD');
        expect(await q('HSBA.L')).toBe('GBP');
    });

    it('préfixes historiques et défaut USD inchangés', async () => {
        expect(await q('TSX:VFV')).toBe('CAD');
        expect(await q('EPA:SAF')).toBe('EUR');
        expect(await q('NVDA')).toBe('USD');
        expect(await q('BRK.B')).toBe('USD'); // suffixe de CLASSE d'action US, pas une place boursière
    });

    it('[INVEST-COURS-EXACT-TOUTES-ACTIONS] préfixes ETR/BIT → EUR (cohérent avec les suffixes .DE/.MI déjà reconnus)', async () => {
        expect(await q('ETR:KLA')).toBe('EUR');
        expect(await q('BIT:GBS')).toBe('EUR');
    });
});
