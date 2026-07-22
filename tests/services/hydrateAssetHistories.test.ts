// tests/services/hydrateAssetHistories.test.ts
//
// [PORTFOLIO-HISTORY] Hydratation de priceHistory : sélection par fraîcheur, fenêtre depuis le 1er
// achat, pacing séquentiel injecté, anti-course (applyHistoryPatches sur liste fraîche), erreurs
// par-symbole non bloquantes.

import { describe, it, expect, vi } from 'vitest';
import {
    hydrateAssetHistories, applyHistoryPatches, needsHistorySync, mergePriceHistories,
} from '../../services/history/hydrateAssetHistories';
import type { Asset } from '../../types';

const NOW = 1_800_000_000_000;

const mk = (over: Partial<Asset>): Asset => ({
    symbol: 'XEQT.TO', quantity: 10, currency: 'CAD', currentPrice: 30, name: 'x',
    performance: 0, dateBought: '2026-01-10',
    purchases: [{ date: '2026-01-10', quantity: 10, price: 28 }],
    ...over,
} as Asset);

describe('needsHistorySync', () => {
    it('sans historique → true ; frais (< 24h) → false ; périmé (> 24h) → true', () => {
        expect(needsHistorySync(mk({}), NOW)).toBe(true);
        expect(needsHistorySync(mk({ priceHistory: [{ date: '2026-01-10', price: 28 }], lastHistorySync: NOW - 1000 }), NOW)).toBe(false);
        expect(needsHistorySync(mk({ priceHistory: [{ date: '2026-01-10', price: 28 }], lastHistorySync: NOW - 25 * 3600_000 }), NOW)).toBe(true);
    });
    it('quantité 0 SANS achats connus, ou sans symbole → false (rien à tracer)', () => {
        expect(needsHistorySync(mk({ quantity: 0, purchases: [], dateBought: undefined, buyPrice: undefined }), NOW)).toBe(false);
        expect(needsHistorySync(mk({ symbol: '' }), NOW)).toBe(false);
    });
    it('actif VENDU (qty=0 mais purchases présents) → true — sa courbe passée existe (alignement buildMarketData)', () => {
        // Avant fix panel 2026-07-22 : attendu par buildMarketData mais JAMAIS hydraté → exclu à vie.
        expect(needsHistorySync(mk({ quantity: 0 }), NOW)).toBe(true);
    });
});

describe('hydrateAssetHistories', () => {
    it('fenêtre = DEPUIS LE PREMIER ACHAT ; patch = clôtures natives + lastHistorySync', async () => {
        const getHistory = vi.fn(async () => [
            { date: '2026-01-10', close: 28 },
            { date: '2026-01-11', close: 28.5 },
        ]);
        const res = await hydrateAssetHistories([mk({})], { getHistory, now: () => NOW, sleep: async () => {} });
        expect(getHistory).toHaveBeenCalledTimes(1);
        const [sym, from] = getHistory.mock.calls[0] as unknown as [string, Date, Date];
        expect(sym).toBe('XEQT.TO');
        expect(from.toISOString().slice(0, 10)).toBe('2026-01-10'); // 1er achat
        const patch = res.patches.get('XEQT.TO')!;
        expect(patch.priceHistory).toEqual([
            { date: '2026-01-10', price: 28 },
            { date: '2026-01-11', price: 28.5 },
        ]);
        expect(patch.lastHistorySync).toBe(NOW);
    });

    it('pacing SÉQUENTIEL : sleep entre les appels (pas avant le premier)', async () => {
        const calls: string[] = [];
        const getHistory = vi.fn(async (s: string) => { calls.push(`fetch:${s}`); return [{ date: '2026-01-10', close: 1 }]; });
        const sleep = vi.fn(async () => { calls.push('sleep'); });
        await hydrateAssetHistories(
            [mk({ symbol: 'A1' }), mk({ symbol: 'A2' }), mk({ symbol: 'A3' })],
            { getHistory, sleep, now: () => NOW },
        );
        expect(calls).toEqual(['fetch:A1', 'sleep', 'fetch:A2', 'sleep', 'fetch:A3']);
    });

    it('actif frais → sauté SANS sleep ; sans provider → sauté', async () => {
        const getHistory = vi.fn(async () => [{ date: '2026-01-10', close: 1 }]);
        const sleep = vi.fn(async () => {});
        const res = await hydrateAssetHistories(
            [
                mk({ symbol: 'FRAIS', priceHistory: [{ date: '2026-01-10', price: 28 }], lastHistorySync: NOW - 1000 }),
                mk({ symbol: 'SANSPROV' }),
                mk({ symbol: 'OK' }),
            ],
            { getHistory, sleep, now: () => NOW, hasProvider: (s) => s !== 'SANSPROV' },
        );
        expect(getHistory).toHaveBeenCalledTimes(1); // seulement OK
        expect(sleep).not.toHaveBeenCalled();        // 1 seul appel réseau → aucun pacing gaspillé
        expect(res.skipped.map((s) => `${s.symbol}:${s.reason}`)).toEqual(['FRAIS:fresh', 'SANSPROV:no-provider']);
    });

    it('une ERREUR sur un symbole ne bloque pas les suivants (skip + logError)', async () => {
        const getHistory = vi.fn()
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValueOnce([{ date: '2026-01-10', close: 2 }]);
        const res = await hydrateAssetHistories(
            [mk({ symbol: 'KO' }), mk({ symbol: 'OK' })],
            { getHistory, sleep: async () => {}, now: () => NOW },
        );
        expect(res.patches.has('OK')).toBe(true);
        expect(res.skipped.find((s) => s.symbol === 'KO')?.reason).toBe('error');
    });

    it('résultat vide → skip « empty » (pas de patch, retry au prochain cycle)', async () => {
        const res = await hydrateAssetHistories([mk({})], {
            getHistory: async () => [], now: () => NOW, sleep: async () => {},
        });
        expect(res.patches.size).toBe(0);
        expect(res.skipped[0].reason).toBe('empty');
    });

    // ── Correctifs panel 2026-07-22 ────────────────────────────────────────────────────────────

    it('null (échec de TOUTE la chaîne, contrat façade) → skip « error », PAS « empty »', async () => {
        const res = await hydrateAssetHistories([mk({})], {
            getHistory: async () => null, now: () => NOW, sleep: async () => {},
        });
        expect(res.patches.size).toBe(0);
        expect(res.skipped[0].reason).toBe('error'); // avant fix : la façade aplatissait null en [] → « empty » menteur
    });

    it('réponse non-vide mais 100 % INVALIDE → skip « empty », l\'historique existant SURVIT (pas de patch [])', async () => {
        const existing = [{ date: '2026-01-10', price: 28 }];
        const res = await hydrateAssetHistories(
            [mk({ priceHistory: existing, lastHistorySync: NOW - 25 * 3600_000 })], // périmé → re-sync
            {
                getHistory: async () => [
                    { date: '', close: 10 }, { date: '2026-01-11', close: NaN }, { date: '2026-01-12', close: 0 },
                ],
                now: () => NOW, sleep: async () => {},
            },
        );
        // Avant fix : le filtre passait APRÈS le check vide → patch `priceHistory: []` écrasait l'existant.
        expect(res.patches.size).toBe(0);
        expect(res.skipped[0].reason).toBe('empty');
    });

    it('re-sync : le nouvel historique FUSIONNE avec l\'ancien (fenêtre provider bornée ne mange pas le passé)', async () => {
        const existing = [
            { date: '2025-01-10', price: 20 },  // hors de la nouvelle fenêtre (provider cappé)
            { date: '2026-01-10', price: 27 },  // sera écrasé par le nouveau close du même jour
        ];
        const res = await hydrateAssetHistories(
            [mk({ priceHistory: existing, lastHistorySync: NOW - 25 * 3600_000 })],
            {
                getHistory: async () => [
                    { date: '2026-01-10', close: 28 },
                    { date: '2026-01-11', close: 28.5 },
                ],
                now: () => NOW, sleep: async () => {},
            },
        );
        // Avant fix : patch = REMPLACEMENT → un crypto > 1 an (CoinGecko cap 365 j) perdait chaque
        // jour son point le plus ancien.
        expect(res.patches.get('XEQT.TO')!.priceHistory).toEqual([
            { date: '2025-01-10', price: 20 },   // survivant
            { date: '2026-01-10', price: 28 },   // nouveau close gagne à date égale
            { date: '2026-01-11', price: 28.5 },
        ]);
    });

    it('garde de DEVISE crypto : « BTC » nu (CoinGecko → USD) sur un actif déclaré CAD → skip « currency-mismatch »', async () => {
        const getHistory = vi.fn(async () => [{ date: '2026-01-10', close: 60_000 }]);
        const res = await hydrateAssetHistories(
            [mk({ symbol: 'BTC', currency: 'CAD', accountType: 'CRYPTO' })],
            { getHistory, now: () => NOW, sleep: async () => {} },
        );
        // Avant fix : closes USD stockés puis valorisés ×1 (facteur CAD) → graphe faux de −27,5 % mesuré.
        expect(getHistory).not.toHaveBeenCalled();
        expect(res.patches.size).toBe(0);
        expect(res.skipped[0].reason).toBe('currency-mismatch');
    });

    it('garde de DEVISE crypto : « BTC-CAD » sur un actif CAD, et « BTC » nu sur un actif USD → hydratés', async () => {
        const getHistory = vi.fn(async () => [{ date: '2026-01-10', close: 60_000 }]);
        const res = await hydrateAssetHistories(
            [
                mk({ symbol: 'BTC-CAD', currency: 'CAD', accountType: 'CRYPTO' }),
                mk({ symbol: 'BTC', currency: 'USD', accountType: 'CRYPTO' }),
            ],
            { getHistory, now: () => NOW, sleep: async () => {} },
        );
        expect(res.patches.has('BTC-CAD')).toBe(true);
        expect(res.patches.has('BTC')).toBe(true);
        expect(res.skipped).toEqual([]);
    });
});

describe('mergePriceHistories', () => {
    it('union par date, le nouveau gagne, points invalides de l\'ancien purgés, tri croissant', () => {
        expect(mergePriceHistories(
            [{ date: '2025-06-01', price: 10 }, { date: '2025-06-02', price: NaN }, { date: '2025-06-03', price: 12 }],
            [{ date: '2025-06-03', price: 13 }, { date: '2025-06-04', price: 14 }],
        )).toEqual([
            { date: '2025-06-01', price: 10 },
            { date: '2025-06-03', price: 13 },
            { date: '2025-06-04', price: 14 },
        ]);
    });
});

describe('applyHistoryPatches (anti-course)', () => {
    it('patch par SYMBOLE sur la liste FRAÎCHE : un actif ajouté pendant l\'hydratation survit', () => {
        const patches = new Map([['XEQT.TO', { priceHistory: [{ date: '2026-01-10', price: 28 }], lastHistorySync: NOW }]]);
        const fresh = [mk({}), mk({ symbol: 'NOUVEAU' })]; // NOUVEAU ajouté pendant l'hydratation
        const out = applyHistoryPatches(fresh, patches);
        expect(out.find((a) => a.symbol === 'XEQT.TO')!.priceHistory!.length).toBe(1);
        expect(out.find((a) => a.symbol === 'NOUVEAU')).toBeTruthy(); // pas écrasé
        expect(out.find((a) => a.symbol === 'NOUVEAU')!.priceHistory).toBeUndefined();
    });
});
