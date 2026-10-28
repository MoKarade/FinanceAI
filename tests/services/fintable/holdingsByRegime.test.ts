// tests/services/fintable/holdingsByRegime.test.ts
//
// [FINTABLE-6 Lot 2] Groupement des titres saisis par panier fiscal réconciliable.
// Ce qui est verrouillé : (a) la famille fiscale suit BUCKET_OF (la même table que les piles de
// l'Accueil — pas une copie parallèle) ; (b) la conversion FX passe par assetValueCad (source
// unique) ; (c) CRYPTO est hors réconciliation ; (d) un actif corrompu ne contamine pas le panier.

import { describe, it, expect } from 'vitest';
import { holdingsCadByRegime } from '../../../services/fintable/holdingsByRegime';
import type { Asset } from '../../../types';

const mkAsset = (over: Partial<Asset>): Asset => ({
    symbol: 'VFV.TO',
    name: 'Vanguard S&P 500',
    quantity: 10,
    currentPrice: 100,
    buyPrice: 90,
    currency: 'CAD',
    accountType: 'CELI',
    ...over,
} as Asset);

describe('holdingsCadByRegime', () => {
    it('groupe par régime avec conversion FX (assetValueCad, source unique)', () => {
        const out = holdingsCadByRegime([
            mkAsset({ accountType: 'CELI', quantity: 10, currentPrice: 100, currency: 'CAD' }),
            mkAsset({ symbol: 'SPY', accountType: 'REER', quantity: 2, currentPrice: 100, currency: 'USD' }),
        ], { USD: 1.35 });
        expect(out.CELI).toBeCloseTo(1000, 2);
        expect(out.REER).toBeCloseTo(270, 2); // 2 × 100 × 1,35 — sans FX ce serait 200 (bug ASSET-FX)
    });

    it('suit la FAMILLE fiscale de BUCKET_OF : CELIAPP→CELI, REEE→REER, MARGE/AUTRE/absent→NON-ENREG', () => {
        const out = holdingsCadByRegime([
            mkAsset({ accountType: 'CELIAPP', quantity: 1, currentPrice: 10 }),
            mkAsset({ accountType: 'REEE', quantity: 1, currentPrice: 20 }),
            mkAsset({ accountType: 'MARGE', quantity: 1, currentPrice: 30 }),
            mkAsset({ accountType: 'AUTRE', quantity: 1, currentPrice: 40 }),
            mkAsset({ accountType: undefined, quantity: 1, currentPrice: 50 }),
        ], {});
        expect(out.CELI).toBeCloseTo(10, 2);
        expect(out.REER).toBeCloseTo(20, 2);
        expect(out['NON-ENREG']).toBeCloseTo(120, 2);
    });

    it('exclut CRYPTO (pas chez le courtier — l\'inclure fabriquerait un faux écart)', () => {
        const out = holdingsCadByRegime([
            mkAsset({ accountType: 'CRYPTO', quantity: 1, currentPrice: 50_000 }),
            mkAsset({ accountType: 'NON-ENREG', quantity: 1, currentPrice: 100 }),
        ], {});
        expect(out['NON-ENREG']).toBeCloseTo(100, 2);
        expect(Object.values(out).reduce((s, v) => s + v, 0)).toBeCloseTo(100, 2);
    });

    it('[panel #543] une valeur NÉGATIVE (quantité négative) est écartée — sans fausser le panier', () => {
        // assetValueCad ne signale QUE NaN/devise : une valeur finie négative passerait muette et
        // fausserait l'écart « reconstructible ». Elle est écartée ET tracée (logErrorThrottled).
        const out = holdingsCadByRegime([
            mkAsset({ accountType: 'CELI', quantity: -5, currentPrice: 100 }),
            mkAsset({ accountType: 'CELI', quantity: 1, currentPrice: 100 }),
        ], {});
        expect(out.CELI).toBeCloseTo(100, 2); // le -500 n'a PAS réduit le panier
    });

    it('un actif à valeur corrompue (NaN) ne contamine pas le panier', () => {
        const out = holdingsCadByRegime([
            mkAsset({ accountType: 'CELI', quantity: Number.NaN, currentPrice: 100 }),
            mkAsset({ accountType: 'CELI', quantity: 1, currentPrice: 100 }),
        ], {});
        expect(out.CELI).toBeCloseTo(100, 2);
        expect(Number.isFinite(out.CELI!)).toBe(true);
    });

    it('sans actifs : objet vide (aucun régime fabriqué à 0)', () => {
        expect(holdingsCadByRegime([], {})).toEqual({});
        expect(holdingsCadByRegime(undefined, {})).toEqual({});
    });
});
