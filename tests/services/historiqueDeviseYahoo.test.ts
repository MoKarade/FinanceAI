// tests/services/historiqueDeviseYahoo.test.ts
//
// [HISTORIQUE-YAHOO-DEVISE-NON-LUE] L'historique Yahoo ne lisait pas `meta.currency` : une ligne de
// Londres, cotée en PENCE (`GBp`), entrait dans `priceHistory` à ×100 sans rien dire, alors que le
// cours spot du même titre était refusé par la garde « currency-mismatch » de priceRefresh.
//
// Ce que ce fichier tient :
//  1. le parseur PUBLIE la devise sur chaque point, casse comprise (`GBp` ≠ `GBP`) ;
//  2. la règle (source unique) : inconnue ≠ incompatible, pence toujours refusés ;
//  3. l'hydratation refuse, garde l'historique existant, ne part pas à la pêche aux variantes ;
//  4. la CHAÎNE réelle parseur → hydratation (aucun maillon reconstruit dans le test).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseYahooChart } from '../../services/marketData/providers/yahooProxy';
import { verdictDeviseHistorique, messageDeviseIncompatible } from '../../services/history/deviseHistorique';
import { hydrateAssetHistories } from '../../services/history/hydrateAssetHistories';
import type { ResultatHistorique } from '../../services/marketData';
import type { HistoryPoint } from '../../services/marketData/types';
import type { Asset } from '../../types';

vi.mock('../../services/errorLogger', async (orig) => {
    const vrai = await orig<typeof import('../../services/errorLogger')>();
    return { ...vrai, logError: vi.fn(), logErrorThrottled: vi.fn() };
});
import { logError } from '../../services/errorLogger';

const NOW = Date.parse('2026-02-01T00:00:00Z');
const FROM = new Date('2026-01-01T00:00:00Z');
const TO = new Date('2026-01-31T00:00:00Z');
const T1 = Date.parse('2026-01-10T15:00:00Z') / 1000;
const T2 = Date.parse('2026-01-11T15:00:00Z') / 1000;

/** Réponse chart Yahoo de la FORME réelle (meta + timestamp + indicators). */
const chart = (currency: string | undefined, closes: number[]) => ({
    chart: {
        result: [{
            meta: currency === undefined ? {} : { currency },
            timestamp: [T1, T2].slice(0, closes.length),
            indicators: { quote: [{ close: closes }] },
        }],
        error: null,
    },
});

const ok = (points: HistoryPoint[] | null): ResultatHistorique => ({ forme: 'ok', points });

const mk = (over: Partial<Asset>): Asset => ({
    symbol: 'ISF', quantity: 10, currency: 'EUR', currentPrice: 9, name: 'x',
    performance: 0, dateBought: '2026-01-05',
    purchases: [{ date: '2026-01-05', quantity: 10, price: 8 }],
    ...over,
} as Asset);

beforeEach(() => { vi.mocked(logError).mockClear(); });

describe('parseYahooChart — devise publiée', () => {
    it('recopie meta.currency sur chaque point, CASSE GARDÉE (GBp = pence, pas des livres)', () => {
        const pts = parseYahooChart(chart('GBp', [850, 860]), FROM, TO)!;
        expect(pts).toHaveLength(2);
        expect(pts.map((p) => p.currency)).toEqual(['GBp', 'GBp']);
    });
    it('sans meta.currency → aucun champ (inconnue, jamais un défaut inventé)', () => {
        const pts = parseYahooChart(chart(undefined, [10]), FROM, TO)!;
        expect(pts).toHaveLength(1);
        expect('currency' in pts[0]).toBe(false);
    });
});

describe('verdictDeviseHistorique (source unique)', () => {
    const p = (currency?: string): HistoryPoint => ({ date: '2026-01-10', close: 10, ...(currency ? { currency } : {}) });

    it('aucune devise déclarée (Finnhub, cache antérieur) → inconnue', () => {
        expect(verdictDeviseHistorique([p(), p()], 'EUR').etat).toBe('inconnue');
    });
    it('même devise que l\'actif → compatible', () => {
        expect(verdictDeviseHistorique([p('EUR')], 'EUR').etat).toBe('compatible');
    });
    it('autre devise gérée → incompatible, et les deux devises sont nommées', () => {
        expect(verdictDeviseHistorique([p('USD')], 'CAD')).toEqual({ etat: 'incompatible', devise: 'USD', attendue: 'CAD' });
    });
    it('pence (GBp) → incompatible QUELLE QUE SOIT la devise de l\'actif, avec le ×100 nommé', () => {
        for (const d of ['USD', 'CAD', 'EUR', undefined]) {
            const v = verdictDeviseHistorique([p('GBp')], d);
            expect(v.etat).toBe('incompatible');
            if (v.etat === 'incompatible') expect(v.precision).toMatch(/×100/);
        }
    });
    it('devise non gérée (GBP, CHF) → incompatible', () => {
        expect(verdictDeviseHistorique([p('GBP')], 'EUR').etat).toBe('incompatible');
        expect(verdictDeviseHistorique([p('CHF')], undefined).etat).toBe('incompatible');
    });
    it('actif SANS devise (legacy) + devise gérée → compatible (le cours spot la guérit, même règle)', () => {
        expect(verdictDeviseHistorique([p('USD')], undefined).etat).toBe('compatible');
    });
    it('devises DIFFÉRENTES dans la même série → incompatible', () => {
        expect(verdictDeviseHistorique([p('EUR'), p('USD')], 'EUR').etat).toBe('incompatible');
    });
    it('le message nomme le symbole, les deux devises, et ne porte aucun montant', () => {
        const v = verdictDeviseHistorique([p('GBp')], 'EUR');
        if (v.etat !== 'incompatible') throw new Error('attendu incompatible');
        const m = messageDeviseIncompatible('ISF', v);
        expect(m).toContain('ISF');
        expect(m).toContain('GBp');
        expect(m).toContain('EUR');
        // Aucun cours recopié : le seul nombre admis est le facteur « ×100 » qui nomme le piège.
        expect(m.replace('×100', '')).not.toMatch(/\d/);
    });
});

describe('hydrateAssetHistories — garde de devise', () => {
    it('clôtures en pence sur un actif EUR → AUCUN patch, skip « currency-mismatch », journalisé', async () => {
        const getHistory = vi.fn(async () => ok(parseYahooChart(chart('GBp', [850, 860]), FROM, TO)));
        const res = await hydrateAssetHistories([mk({})], { getHistory, now: () => NOW, sleep: async () => {} });
        expect(res.patches.size).toBe(0);
        expect(res.skipped).toEqual([{ symbol: 'ISF', reason: 'currency-mismatch', triedSymbols: ['ISF'] }]);
        expect(vi.mocked(logError).mock.calls.some(([e]) => /GBp/.test(e.message))).toBe(true);
    });

    it('CONTRÔLE : la même réponse en EUR → patch écrit, clôtures intactes', async () => {
        const getHistory = vi.fn(async () => ok(parseYahooChart(chart('EUR', [8.5, 8.6]), FROM, TO)));
        const res = await hydrateAssetHistories([mk({})], { getHistory, now: () => NOW, sleep: async () => {} });
        expect(res.patches.get('ISF')!.priceHistory.map((q) => q.price)).toEqual([8.5, 8.6]);
    });

    it('devise inconnue (Finnhub) → patch écrit, comme avant ce lot', async () => {
        const getHistory = vi.fn(async () => ok([{ date: '2026-01-10', close: 8.5 }]));
        const res = await hydrateAssetHistories([mk({})], { getHistory, now: () => NOW, sleep: async () => {} });
        expect(res.patches.size).toBe(1);
    });

    it('refus → l\'historique EXISTANT n\'est pas écrasé, et aucune variante n\'est tentée', async () => {
        // Actif nu en EUR : sur un vide il aurait essayé .PA/.DE/.AS/.MI. Une réponse en autre
        // devise n'est PAS un vide : partir à la pêche pourrait persister un autre titre.
        const getHistory = vi.fn(async () => ok(parseYahooChart(chart('USD', [9.1]), FROM, TO)));
        const existant = [{ date: '2025-12-01', price: 8 }];
        const res = await hydrateAssetHistories(
            [mk({ priceHistory: existant, lastHistorySync: 0 })],
            { getHistory, now: () => NOW, sleep: async () => {} },
        );
        expect(getHistory).toHaveBeenCalledTimes(1);
        expect(res.patches.has('ISF')).toBe(false);
    });

    it('variante de suffixe dans une autre devise → écartée ; la suivante, dans la bonne, est retenue', async () => {
        const getHistory = vi.fn(async (s: string) => {
            if (s === 'ISF') return ok([]);                                          // vide confirmé → variantes
            if (s === 'ISF.PA') return ok(parseYahooChart(chart('USD', [9]), FROM, TO)); // cotation USD : écartée
            if (s === 'ISF.DE') return ok(parseYahooChart(chart('EUR', [9]), FROM, TO)); // la bonne
            return ok([]);
        });
        const res = await hydrateAssetHistories([mk({})], { getHistory, now: () => NOW, sleep: async () => {} });
        expect(getHistory.mock.calls.map((c) => c[0])).toEqual(['ISF', 'ISF.PA', 'ISF.DE']);
        expect(res.patches.get('ISF')!.historySymbol).toBe('ISF.DE');
    });
});
