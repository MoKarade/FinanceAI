// tests/services/history/diagnosticCourbe.test.ts
//
// [COURBE-DIAGNOSTIC] Données FICTIVES : un titre « GROS » (deux tiers de la valeur) à l'historique
// troué ou arrêté. Le diagnostic doit nommer ce titre, la plage et l'ampleur — pas « le marché a bougé ».

import { describe, it, expect } from 'vitest';
import { diagnostiquerCourbe } from '../../../services/history/diagnosticCourbe';
import type { Asset } from '../../../types';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const jour = (debut: string, n: number): string => new Date(Date.parse(`${debut}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const serie = (debut: string, nb: number, prix: number, trou?: [number, number]) =>
    Array.from({ length: nb }, (_, i) => i).filter((i) => !trou || i < trou[0] || i >= trou[1])
        .map((i) => ({ date: jour(debut, i), price: prix }));

const mk = (over: Partial<Asset>): Asset => ({
    symbol: 'X', name: 'x', quantity: 10, currency: 'CAD', currentPrice: 100, performance: 0,
    accountType: 'NON-ENREG', dateBought: '2026-01-01',
    purchases: [{ date: '2026-01-01', quantity: 10, price: 100 }],
    priceHistory: serie('2026-01-01', 300, 100),
    ...over,
} as Asset);

describe('diagnostiquerCourbe', () => {
    it('un trou INTÉRIEUR de 40 jours est comblé : aucun saut, mais la plage est nommée', () => {
        const gros = mk({ symbol: 'GROS', quantity: 20, purchases: [{ date: '2026-01-01', quantity: 20, price: 100 }],
            priceHistory: serie('2026-01-01', 300, 100, [200, 240]) });
        const d = diagnostiquerCourbe([gros, mk({ symbol: 'PETIT' })], undefined, { nowMs: NOW });

        expect(d.trous).toEqual([{ symbole: 'GROS', du: jour('2026-01-01', 199), au: jour('2026-01-01', 240), jours: 41 }]);
        expect(d.sauts).toEqual([]);
        expect(d.plagesComblees).toEqual([{ symbol: 'GROS', du: jour('2026-01-01', 207), au: jour('2026-01-01', 239) }]);
        expect(d.plagesAmputees).toEqual([]);
    });

    it('un titre dont l\'historique S\'ARRÊTE (queue) sort du total : saut « sorti » nommé', () => {
        const gros = mk({ symbol: 'GROS', quantity: 20, purchases: [{ date: '2026-01-01', quantity: 20, price: 100 }],
            priceHistory: serie('2026-01-01', 200, 100) });
        const d = diagnostiquerCourbe([gros, mk({ symbol: 'PETIT' })], undefined, { nowMs: NOW });
        const chute = d.sauts.find((s) => s.variationPct < 0)!;
        expect(chute.causes[0]).toMatchObject({ symbole: 'GROS', nature: 'sorti' });
        expect(chute.variationPct).toBeLessThan(-60);
        expect(d.plagesAmputees[0].symboles).toEqual(['GROS']);
        expect(d.queuesPerimees[0]).toMatchObject({ symbole: 'GROS' });
    });

    it('un portefeuille sain ne produit ni saut, ni trou, ni plage', () => {
        const d = diagnostiquerCourbe([mk({ symbol: 'A' }), mk({ symbol: 'B' })], undefined, { nowMs: NOW });
        expect(d.sauts).toEqual([]);
        expect(d.trous).toEqual([]);
        expect(d.plagesAmputees).toEqual([]);
    });

    it('un fractionnement non répercuté (cours ÷ 10 en un jour) ressort comme saut de prix', () => {
        const avant = serie('2026-01-01', 150, 500);
        const apres = serie(jour('2026-01-01', 150), 150, 50);
        const d = diagnostiquerCourbe([mk({ symbol: 'SPLIT', priceHistory: [...avant, ...apres] })], undefined, { nowMs: NOW });
        expect(d.sautsDePrix).toEqual([{ symbole: 'SPLIT', date: jour('2026-01-01', 150), variationPct: -90 }]);
    });

    it('une quantité de fiche qui ne rejoint pas les achats est signalée, sans montant', () => {
        const d = diagnostiquerCourbe([mk({ symbol: 'Q', quantity: 12 })], undefined, { nowMs: NOW });
        expect(d.quantitesIncoherentes).toEqual([{ symbole: 'Q', ecartQuantite: -2 }]);
    });

    it('une dernière clôture vieille de plus de 7 jours est une queue périmée', () => {
        const d = diagnostiquerCourbe([mk({ symbol: 'V', priceHistory: serie('2026-01-01', 200, 100) })], undefined, { nowMs: NOW });
        expect(d.queuesPerimees[0]).toMatchObject({ symbole: 'V', derniereCloture: jour('2026-01-01', 199) });
    });
});
