// tests/services/buildMarketData.test.ts
//
// [PORTFOLIO-HISTORY] Builder PUR des lignes de graphe : détention DCA à la date t × clôture native
// × FX → valeur CAD par symbole + totaux par bucket. Money-critical (FX, sommes) → cas discriminants.

import { describe, it, expect } from 'vitest';
import { buildMarketData, historyKeyMatchesSymbol } from '../../services/history/buildMarketData';
import type { Asset } from '../../types';

const FX = { USD: 1.35, EUR: 1.45 };

const mk = (over: Partial<Asset>): Asset => ({
    symbol: 'XEQT.TO', quantity: 10, currency: 'CAD', currentPrice: 30, name: 'x',
    performance: 0, dateBought: '2026-01-10',
    purchases: [{ date: '2026-01-10', quantity: 10, price: 28 }],
    priceHistory: [
        { date: '2026-01-10', price: 28 },
        { date: '2026-02-10', price: 30 },
    ],
    accountType: 'CELI',
    ...over,
} as Asset);

describe('buildMarketData', () => {
    it('valeur = qty × close natif × FX (CAD) — conversion USD vérifiée', () => {
        const { rows } = buildMarketData([
            mk({ symbol: 'AAPL', currency: 'USD', accountType: 'NON-ENREG',
                 purchases: [{ date: '2026-01-10', quantity: 2, price: 100 }],
                 priceHistory: [{ date: '2026-01-10', price: 100 }, { date: '2026-02-10', price: 110 }] }),
        ], FX);
        expect(rows[0].AAPL).toBe(270);   // 2 × 100 × 1.35
        expect(rows[1].AAPL).toBe(297);   // 2 × 110 × 1.35
        expect(rows[1].TOTAL).toBe(297);
        expect(rows[1]['TOTAL_NON-ENREG']).toBe(297);
    });

    it('DCA : la quantité à la date t suit les achats datés (marches d\'escalier)', () => {
        const { rows } = buildMarketData([
            mk({ purchases: [
                { date: '2026-01-10', quantity: 10, price: 28 },
                { date: '2026-02-01', quantity: 5, price: 29 },
            ],
            priceHistory: [
                { date: '2026-01-10', price: 28 },
                { date: '2026-01-20', price: 29 },
                { date: '2026-02-10', price: 30 },
            ] }),
        ], FX);
        expect(rows[0]['XEQT.TO']).toBe(280); // 10 × 28
        expect(rows[1]['XEQT.TO']).toBe(290); // toujours 10 × 29 (achat #2 pas encore fait)
        expect(rows[2]['XEQT.TO']).toBe(450); // 15 × 30 (après le 2e achat)
    });

    it('« depuis que je les ai » : aucune ligne AVANT le premier achat global', () => {
        const { rows } = buildMarketData([
            mk({ priceHistory: [
                { date: '2025-12-01', price: 25 }, // avant le 1er achat (2026-01-10)
                { date: '2026-01-10', price: 28 },
            ] }),
        ], FX);
        expect(rows.length).toBe(1);
        expect(rows[0].date).toBe('2026-01-10');
    });

    it('no-fake-data : actif sans historique EXCLU des colonnes ET des totaux + signalé', () => {
        const { rows, excludedSymbols } = buildMarketData([
            mk({}),
            mk({ symbol: 'SANSHIST', priceHistory: [], accountType: 'REER' }),
        ], FX);
        expect(excludedSymbols).toEqual(['SANSHIST']);
        expect(rows.at(-1)!.TOTAL).toBe(300); // seulement XEQT (10 × 30)
        expect(rows.at(-1)!.SANSHIST).toBeUndefined();
        expect(rows.at(-1)!.TOTAL_REER).toBeUndefined(); // bucket vide non émis
    });

    it('un titre sans point ≤ t (acheté avant le début de SON historique) ne contribue pas ce jour-là', () => {
        const { rows } = buildMarketData([
            mk({}),
            mk({ symbol: 'TARD', accountType: 'CRYPTO',
                 purchases: [{ date: '2026-01-10', quantity: 1, price: 50 }],
                 priceHistory: [{ date: '2026-02-10', price: 60 }] }), // 1er point seulement en février
        ], FX);
        const jan = rows.find((r) => r.date === '2026-01-10')!;
        const fev = rows.find((r) => r.date === '2026-02-10')!;
        expect(jan.TARD).toBeUndefined();     // pas de prix connu → pas de valeur inventée
        expect(jan.TOTAL).toBe(280);          // XEQT seul
        expect(fev.TARD).toBe(60);            // 1 × 60 CAD
        expect(fev.TOTAL).toBe(360);          // 300 + 60
    });

    it('downsample : > maxPoints → sous-échantillonné en gardant les DEUX derniers points (« variation 24h » honnête)', () => {
        const hist = Array.from({ length: 1000 }, (_, i) => ({
            date: new Date(Date.UTC(2023, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
            price: 100 + i * 0.1,
        }));
        const { rows } = buildMarketData([
            mk({ purchases: [{ date: '2023-01-01', quantity: 1, price: 100 }], priceHistory: hist }),
        ], FX, { maxPoints: 200 });
        expect(rows.length).toBeLessThanOrEqual(202);
        expect(rows.at(-1)!.date).toBe(hist.at(-1)!.date);  // dernier point TOUJOURS conservé
        expect(rows.at(-2)!.date).toBe(hist.at(-2)!.date);  // avant-dernier AUSSI : le KPI « 24h »
        // compare les 2 dernières lignes — sans ce point, il porterait sur `step` jours (libellé menteur)
    });

    it('aucun actif détenu → rows vide', () => {
        const { rows } = buildMarketData([], FX);
        expect(rows).toEqual([]);
    });

    // ── Correctifs panel 2026-07-22 (findings CONFIRMÉS par sondes) ────────────────────────────

    it('même symbole dans DEUX comptes : colonne AGRÉGÉE (pas d\'écrasement last-write-wins) + buckets par compte', () => {
        const { rows } = buildMarketData([
            mk({ accountType: 'CELI',
                 purchases: [{ date: '2026-01-10', quantity: 100, price: 100 }],
                 priceHistory: [{ date: '2026-01-10', price: 100 }] }),
            mk({ accountType: 'REER',
                 purchases: [{ date: '2026-01-10', quantity: 50, price: 100 }],
                 priceHistory: [{ date: '2026-01-10', price: 100 }] }),
        ], FX);
        const row = rows[0];
        expect(row['XEQT.TO']).toBe(15_000);      // 10 000 + 5 000 (avant fix : 5 000 — la 2e écriture écrasait)
        expect(row.TOTAL_CELI).toBe(10_000);
        expect(row.TOTAL_REER).toBe(5_000);
        expect(row.TOTAL).toBe(15_000);           // reconstructibilité : TOTAL == Σ colonnes symboles
    });

    it('historique commençant NETTEMENT après le 1er achat (provider borné) → signalé dans partialHistorySymbols', () => {
        const { partialHistorySymbols } = buildMarketData([
            mk({}),
            mk({ symbol: 'BTC-CAD', accountType: 'CRYPTO',
                 purchases: [{ date: '2023-01-10', quantity: 1, price: 30_000 }],
                 priceHistory: [{ date: '2026-01-15', price: 60_000 }, { date: '2026-02-10', price: 62_000 }] }),
        ], FX);
        expect(partialHistorySymbols).toEqual([{ symbol: 'BTC-CAD', historyStart: '2026-01-15' }]);
    });

    it('historique aligné sur le 1er achat (± tolérance week-end) → PAS signalé partiel', () => {
        const { partialHistorySymbols } = buildMarketData([mk({})], FX);
        expect(partialHistorySymbols).toEqual([]);
    });

    it('prix PÉRIMÉ (> 7 j de retard sur la date t) : PAS de forward-fill — le titre sort de la courbe', () => {
        const daily = Array.from({ length: 60 }, (_, i) => ({
            date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
            price: 50,
        }));
        const { rows } = buildMarketData([
            mk({ symbol: 'VIVANT', purchases: [{ date: '2026-01-01', quantity: 1, price: 50 }], priceHistory: daily }),
            mk({ symbol: 'DELISTE', accountType: 'REER',
                 purchases: [{ date: '2026-01-01', quantity: 10, price: 40 }],
                 priceHistory: [{ date: '2026-01-01', price: 40 }, { date: '2026-01-05', price: 41 }] }),
        ], FX);
        const early = rows.find((r) => r.date === '2026-01-05')!;
        expect(early.DELISTE).toBe(410);          // close du jour → compté
        const last = rows.at(-1)!;                 // ~2026-03-01, close DELISTE vieux de ~55 j
        expect(last.DELISTE).toBeUndefined();      // avant fix : 410 affiché comme valeur « du jour »
        expect(last.TOTAL).toBe(50);               // VIVANT seul
    });
});

describe('historyKeyMatchesSymbol (matching exact, jamais includes)', () => {
    it('clé réelle = symbole exact', () => {
        expect(historyKeyMatchesSymbol('XEQT.TO', 'XEQT.TO')).toBe(true);
    });
    it('clé legacy préfixée place', () => {
        expect(historyKeyMatchesSymbol('NASDAQ:AAPL', 'AAPL')).toBe(true);
        expect(historyKeyMatchesSymbol('EPA:SAF', 'SAF')).toBe(true);
    });
    it('« V » (Visa) ne matche PAS « VFV.TO » (le bug sous-chaîne affichait la mauvaise courbe)', () => {
        expect(historyKeyMatchesSymbol('VFV.TO', 'V')).toBe(false);
        expect(historyKeyMatchesSymbol('V', 'VFV.TO')).toBe(false);
    });
});
