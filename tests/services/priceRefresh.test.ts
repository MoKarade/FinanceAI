// tests/services/priceRefresh.test.ts
// [PRICE-REFRESH-LIVE] — spec du rafraîchissement des cours : natif-only, devise protégée (au fetch
// ET revalidée à l'application), changement réel only (anti-churn Drive/conflits fantômes), couverture
// honnête (skips motivés + erreurs par itération), pacing provider-aware + mutex/intervalle inter-passes.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    refreshAssetPrices,
    applyPricePatches,
    asSupportedCurrency,
    marketTimestampOrNow,
    __resetPriceRefreshThrottle,
} from '../../services/priceRefresh';
import type { Asset } from '../../types';
import type { Quote } from '../../services/marketData';

const asset = (over: Partial<Asset>): Asset => ({
    id: 'a1', symbol: 'NVDA', name: 'NVIDIA', quantity: 10, currency: 'USD',
    currentPrice: 100, buyPrice: 80, performance: 25, dateBought: '2025-01-01',
    ...over,
} as Asset);

const quote = (over: Partial<Quote>): Quote => ({
    symbol: 'NVDA', price: 120, change: 1, changePercent: 1, currency: 'USD', timestamp: 0,
    ...over,
} as Quote);

const NOW = 1_752_500_000_000;
const deps = (getQuote: (s: string) => Promise<Quote | null>, sleep = vi.fn(async () => {})) =>
    ({ getQuote, sleep, delayMs: 2500, now: () => NOW });

beforeEach(() => __resetPriceRefreshThrottle()); // état module (mutex + intervalle) isolé par test

describe('refreshAssetPrices', () => {
    it('met à jour currentPrice (NATIF) + priceUpdatedAt quand le prix a CHANGÉ', async () => {
        const res = await refreshAssetPrices([asset({})], deps(async () => quote({ price: 120 })));
        expect(res.refreshed).toEqual(['NVDA']);
        const p = res.patches.get('NVDA')!;
        expect(p.currentPrice).toBe(120);
        expect(p.priceUpdatedAt).toBe(NOW); // timestamp 0 (fixture) = implausible → repli heure de fetch
        expect(p.forCurrency).toBe('USD');
    });

    // [QUOTE-MARKET-TIMESTAMP] priceUpdatedAt = heure du MARCHÉ quand elle est plausible — le
    // raccord quoteFresh (7 j) de buildMarketData mesure alors la fraîcheur du COURS, pas du fetch.
    it('MARKET-TIMESTAMP : un timestamp de marché plausible devient priceUpdatedAt', async () => {
        const marketTs = NOW - 3 * 24 * 60 * 60 * 1000; // clôture de vendredi, fetch le lundi
        const res = await refreshAssetPrices([asset({})], deps(async () => quote({ price: 120, timestamp: marketTs })));
        expect(res.patches.get('NVDA')!.priceUpdatedAt).toBe(marketTs);
    });

    it('MARKET-TIMESTAMP : priceUpdatedAt est MONOTONE — jamais plus ancien que celui déjà stocké', async () => {
        // Finding code-reviewer #499 (sonde) : bascule Finnhub↔Yahoo = horodatages incohérents
        // possibles pour le même titre → sans clamp, « Cours mis à jour »/quoteFresh régressaient.
        const oldMarketTs = NOW - 30 * 24 * 60 * 60 * 1000;
        const res = await refreshAssetPrices(
            [asset({ priceUpdatedAt: NOW - 1000 })],
            deps(async () => quote({ price: 120, timestamp: oldMarketTs })),
        );
        expect(res.patches.get('NVDA')!.priceUpdatedAt).toBe(NOW - 1000); // l'existant plus récent gagne
    });

    it('MARKET-TIMESTAMP : timestamps implausibles (0, futur, non fini) → repli heure de fetch', () => {
        expect(marketTimestampOrNow(0, NOW)).toBe(NOW);                    // sentinelle provider
        expect(marketTimestampOrNow(undefined, NOW)).toBe(NOW);
        expect(marketTimestampOrNow(NaN, NOW)).toBe(NOW);
        expect(marketTimestampOrNow(NOW + 60 * 60 * 1000, NOW)).toBe(NOW); // 1 h dans le futur = horloge cassée
        expect(marketTimestampOrNow(NOW / 1000, NOW)).toBe(NOW);           // secondes non converties (< 2000-01-01)
        expect(marketTimestampOrNow(NOW - 1000, NOW)).toBe(NOW - 1000);    // plausible → conservé
        expect(marketTimestampOrNow(NOW + 60 * 1000, NOW)).toBe(NOW + 60 * 1000); // skew ≤ 10 min toléré
    });

    it('ANTI-CHURN : prix IDENTIQUE au stocké → aucun patch (unchanged), aucun push/horodatage parasite', async () => {
        // Sans ça, priceUpdatedAt seul changerait le hash du payload → push Drive à chaque boot +
        // conflits FANTÔMES entre 2 appareils qui confirment les mêmes cours (finding panel).
        const res = await refreshAssetPrices([asset({ currentPrice: 120 })], deps(async () => quote({ price: 120 })));
        expect(res.patches.size).toBe(0);
        expect(res.unchanged).toEqual(['NVDA']);
        expect(res.refreshed).toEqual([]);
    });

    it('COUVERTURE HONNÊTE : quote null → skipped no-quote (prix existant conservé, jamais inventé)', async () => {
        const res = await refreshAssetPrices([asset({})], deps(async () => null));
        expect(res.patches.size).toBe(0);
        expect(res.skipped).toEqual([{ symbol: 'NVDA', reason: 'no-quote' }]);
    });

    it('DÉFENSE PAR ITÉRATION : getQuote qui LÈVE au 2e symbole → skip error, le patch du 1er SURVIT', async () => {
        const getQuote = async (s: string): Promise<Quote | null> => {
            if (s === 'BOOM') throw new Error('provider cassé');
            return quote({ symbol: s, price: 120 });
        };
        const res = await refreshAssetPrices(
            [asset({ symbol: 'OK1' }), asset({ symbol: 'BOOM' }), asset({ symbol: 'OK2' })],
            deps(getQuote),
        );
        expect(res.refreshed).toEqual(['OK1', 'OK2']); // le progrès n'est PAS jeté
        expect(res.skipped).toEqual([{ symbol: 'BOOM', reason: 'error' }]);
    });

    it('prix non fini ou ≤ 0 → skipped invalid-price', async () => {
        const bad = [Infinity, NaN, 0, -5];
        for (const price of bad) {
            __resetPriceRefreshThrottle();
            const res = await refreshAssetPrices([asset({})], deps(async () => quote({ price })));
            expect(res.skipped[0]?.reason).toBe('invalid-price');
        }
    });

    it('GARDE DE DEVISE : quote USD sur un actif EUR → skipped currency-mismatch (jamais corrompu)', async () => {
        const res = await refreshAssetPrices(
            [asset({ symbol: 'CW8.PA', currency: 'EUR' })],
            deps(async () => quote({ symbol: 'CW8.PA', currency: 'USD' })),
        );
        expect(res.patches.size).toBe(0);
        expect(res.skipped).toEqual([{ symbol: 'CW8.PA', reason: 'currency-mismatch' }]);
    });

    it('SELF-HEAL legacy : actif SANS devise → patch avec healCurrency (la devise du quote répare la donnée)', async () => {
        const res = await refreshAssetPrices(
            [asset({ currency: undefined as unknown as Asset['currency'], currentPrice: 120 })],
            deps(async () => quote({ price: 120, currency: 'USD' })),
        );
        // Même à prix identique : le heal de devise passe quand même (une seule fois).
        const p = res.patches.get('NVDA')!;
        expect(p.healCurrency).toBe('USD');
        expect(p.forCurrency).toBeUndefined();
    });

    it('PACING : sleep(delayMs) entre chaque APPEL RÉEL ; les symboles SANS provider skippés sans pacing', async () => {
        const sleep = vi.fn(async () => {});
        const order: string[] = [];
        const getQuote = async (s: string): Promise<Quote | null> => { order.push(s); return quote({ symbol: s, price: 120 }); };
        const hasProvider = (s: string): boolean => s !== 'MANUEL'; // ex. pas de clé Finnhub pour ce titre
        const assets = [asset({ symbol: 'A' }), asset({ symbol: 'MANUEL' }), asset({ symbol: 'B' }), asset({ symbol: 'C' })];
        const res = await refreshAssetPrices(assets, { getQuote, hasProvider, sleep, delayMs: 2500, now: () => NOW });
        expect(order).toEqual(['A', 'B', 'C']);         // séquentiel, MANUEL jamais appelé
        expect(sleep).toHaveBeenCalledTimes(2);         // 3 appels réels → 2 espacements (MANUEL n'en consomme pas)
        expect(sleep).toHaveBeenCalledWith(2500);
        expect(res.skipped).toContainEqual({ symbol: 'MANUEL', reason: 'no-quote' });
    });

    it('[HIST-MULTI-PROVIDER] historySymbol résolu → utilisé pour hasProvider ET getQuote (le patch reste keyé par symbol)', async () => {
        // Sans ça, un ticker nu résolu « CW8 → CW8.PA » gardait un prix figé à vie (la quote du
        // symbole nu rend null pendant que le symbole résolu, lui, cote).
        const getQuote = vi.fn(async (s: string) => (s === 'CW8.PA' ? quote({ symbol: 'CW8.PA', price: 550, currency: 'EUR' }) : null));
        const hasProvider = vi.fn((s: string) => s === 'CW8.PA');
        const res = await refreshAssetPrices(
            [asset({ symbol: 'CW8', currency: 'EUR', currentPrice: 500, historySymbol: 'CW8.PA' })],
            { ...deps(getQuote), hasProvider },
        );
        expect(hasProvider).toHaveBeenCalledWith('CW8.PA');
        expect(getQuote).toHaveBeenCalledWith('CW8.PA');
        expect(res.patches.get('CW8')?.currentPrice).toBe(550); // patch keyé par le symbole de l'ACTIF
    });

    it('[Finding sécurité #494] actif legacy SANS devise + quote en devise NON SUPPORTÉE (GBP) → skip complet, jamais de heal', async () => {
        // Depuis le repli Yahoo mondial, quote.currency peut porter GBP (voire « GBp » pence aplati
        // en GBP par toUpperCase, ~100×) — hors de l'union Asset.currency, ni le prix ni la devise
        // ne doivent s'écrire (toCurrencyFactor replierait 1:1 → valorisation fausse).
        const res = await refreshAssetPrices(
            [asset({ currency: undefined, currentPrice: 100 })],
            deps(async () => quote({ price: 250, currency: 'GBP' })),
        );
        expect(res.patches.size).toBe(0);
        expect(res.skipped[0].reason).toBe('currency-mismatch');
        expect(asSupportedCurrency('GBP')).toBeUndefined();
        expect(asSupportedCurrency('EUR')).toBe('EUR');
    });

    it('ignore les actifs sans symbole ou quantité ≤ 0 (aucun appel réseau)', async () => {
        const getQuote = vi.fn(async () => quote({ price: 120 }));
        await refreshAssetPrices(
            [asset({ quantity: 0 }), asset({ symbol: '' }), asset({ symbol: 'OK' })],
            deps(getQuote),
        );
        expect(getQuote).toHaveBeenCalledTimes(1);
        expect(getQuote).toHaveBeenCalledWith('OK');
    });

    it('GATE INTER-PASSES : une passe NON forcée < 5 min après la précédente est SAUTÉE (anti-spam boot/reload)', async () => {
        const getQuote = vi.fn(async () => quote({ price: 120 }));
        const d = { getQuote, sleep: vi.fn(async () => {}), delayMs: 2500, now: () => NOW };
        await refreshAssetPrices([asset({})], d);                       // 1re passe : tourne
        const res2 = await refreshAssetPrices([asset({})], d);          // 2e passe non forcée : sautée
        expect(getQuote).toHaveBeenCalledTimes(1);
        expect(res2.patches.size).toBe(0);
        const res3 = await refreshAssetPrices([asset({})], d, { force: true }); // bouton : force
        expect(getQuote).toHaveBeenCalledTimes(2);
        expect(res3.refreshed).toEqual(['NVDA']);
    });

    it('MUTEX : deux passes lancées en même temps se SÉRIALISENT (jamais d\'entrelacement du pacing)', async () => {
        let inFlight = 0; let maxInFlight = 0;
        const getQuote = async (): Promise<Quote | null> => {
            inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((r) => setTimeout(r, 5));
            inFlight--;
            return quote({ price: 120 });
        };
        const d = { getQuote, sleep: vi.fn(async () => {}), delayMs: 0, now: () => NOW };
        await Promise.all([
            refreshAssetPrices([asset({ symbol: 'A' }), asset({ symbol: 'B' })], d, { force: true }),
            refreshAssetPrices([asset({ symbol: 'C' }), asset({ symbol: 'D' })], d, { force: true }),
        ]);
        expect(maxInFlight).toBe(1); // une seule requête en vol à tout instant
    });
});

describe('applyPricePatches — fusion anti-course sur l\'état COURANT', () => {
    it('applique le patch par symbole en PRÉSERVANT les modifications concurrentes des autres champs', async () => {
        const res = await refreshAssetPrices([asset({})], deps(async () => quote({ price: 120 })));
        const currentAfterConcurrentEdit = [asset({ quantity: 42 })];
        const merged = applyPricePatches(currentAfterConcurrentEdit, res.patches);
        expect(merged[0].quantity).toBe(42);        // l'édition concurrente survit
        expect(merged[0].currentPrice).toBe(120);   // le prix frais est appliqué
    });

    it('PERFORMANCE recalculée avec le buyPrice AU MOMENT de l\'application (édition concurrente respectée)', async () => {
        const res = await refreshAssetPrices([asset({ buyPrice: 80 })], deps(async () => quote({ price: 120 })));
        // Pendant le refresh, l'utilisateur corrige son prix d'achat 80 → 60.
        const merged = applyPricePatches([asset({ buyPrice: 60 })], res.patches);
        expect(merged[0].performance).toBeCloseTo(100); // (120−60)/60, PAS (120−80)/80
    });

    it('REVALIDATION DE DEVISE : devise changée pendant la fenêtre → patch ABANDONNÉ (pas de prix mal dénominé)', async () => {
        const res = await refreshAssetPrices([asset({ currency: 'USD' })], deps(async () => quote({ price: 120, currency: 'USD' })));
        // Pendant le refresh, l'utilisateur/un pull Drive passe l'actif en EUR.
        const merged = applyPricePatches([asset({ currency: 'EUR' as Asset['currency'] })], res.patches);
        expect(merged[0].currentPrice).toBe(100); // patch USD refusé sur un actif devenu EUR
        expect(merged[0].priceUpdatedAt).toBeUndefined();
    });

    it('SELF-HEAL : la devise du quote est écrite sur un actif legacy qui n\'en avait pas', async () => {
        const legacy = asset({ currency: undefined as unknown as Asset['currency'] });
        const res = await refreshAssetPrices([legacy], deps(async () => quote({ price: 120, currency: 'EUR' })));
        const merged = applyPricePatches([legacy], res.patches);
        expect(merged[0].currency).toBe('EUR');
        expect(merged[0].currentPrice).toBe(120);
    });

    it('un actif SUPPRIMÉ pendant le refresh est simplement ignoré (pas ressuscité)', async () => {
        const res = await refreshAssetPrices([asset({})], deps(async () => quote({ price: 120 })));
        const merged = applyPricePatches([asset({ symbol: 'AUTRE' })], res.patches);
        expect(merged).toHaveLength(1);
        expect(merged[0].symbol).toBe('AUTRE');
        expect(merged[0].currentPrice).toBe(100);
    });

    it('patches vides → copie inchangée', () => {
        const out = applyPricePatches([asset({})], new Map());
        expect(out[0].currentPrice).toBe(100);
    });
});
