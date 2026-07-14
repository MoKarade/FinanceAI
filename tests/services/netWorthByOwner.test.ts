import { describe, it, expect } from 'vitest';
import {
    defaultOwner,
    netWorthByOwner,
    assetsToHoldings,
    computeNetWorthByOwner,
    type OwnableHolding,
} from '../../services/couple/netWorthByOwner';
import type { Asset } from '../../types';

describe('defaultOwner', () => {
    it('attribue les comptes enregistrés à user1 (individuels par la loi)', () => {
        expect(defaultOwner('CELI')).toBe('user1');
        expect(defaultOwner('REER')).toBe('user1');
        expect(defaultOwner('CELIAPP')).toBe('user1');
        expect(defaultOwner('REEE')).toBe('user1');
    });
    it('attribue le reste (non-enreg/crypto/marge/indéfini) à joint', () => {
        expect(defaultOwner('NON-ENREG')).toBe('joint');
        expect(defaultOwner('CRYPTO')).toBe('joint');
        expect(defaultOwner('MARGE')).toBe('joint');
        expect(defaultOwner(undefined)).toBe('joint');
    });
});

describe('netWorthByOwner', () => {
    const holdings: OwnableHolding[] = [
        { value: 20000, accountType: 'CELI', owner: 'user1' },
        { value: 15000, accountType: 'REER', owner: 'user2' },
        { value: 10000, accountType: 'NON-ENREG' }, // owner absent → joint
        { value: 5000, accountType: 'CELI' },        // owner absent → user1 (registered)
    ];

    it('agrège par propriétaire en respectant owner explicite + défauts', () => {
        const r = netWorthByOwner(holdings, true);
        expect(r.user1).toBe(25000); // 20k explicite + 5k défaut registered
        expect(r.user2).toBe(15000);
        expect(r.joint).toBe(10000);
        expect(r.total).toBe(50000);
    });

    it('mode individuel : tout va à user1, rien en commun', () => {
        const r = netWorthByOwner(holdings, false);
        expect(r.user1).toBe(50000);
        expect(r.user2).toBe(0);
        expect(r.joint).toBe(0);
        expect(r.total).toBe(50000);
    });

    it('ignore les valeurs nulles et NaN, total = somme des parts', () => {
        const r = netWorthByOwner([
            { value: 1000, owner: 'user1' },
            { value: 0, owner: 'user2' },
            { value: NaN, owner: 'joint' },
            { value: 500, owner: 'joint' },
        ], true);
        expect(r.user1).toBe(1000);
        expect(r.user2).toBe(0);
        expect(r.joint).toBe(500);
        expect(r.total).toBe(1500);
        expect(r.user1 + r.user2 + r.joint).toBe(r.total);
    });

    it('liste vide → tout à zéro', () => {
        expect(netWorthByOwner([], true)).toEqual({ user1: 0, user2: 0, joint: 0, total: 0 });
    });
});

describe('assetsToHoldings', () => {
    const FX = { CAD: 1, USD: 1.4, EUR: 1.5 };

    it('valorise prix courant × quantité (CAD, fx=1) et reporte owner + accountType', () => {
        const assets = [
            { symbol: 'VFV.TO', currency: 'CAD', currentPrice: 100, quantity: 10, accountType: 'CELI', owner: 'user2' },
            { symbol: 'BTC', currency: 'CAD', currentPrice: 50000, quantity: 0.5, accountType: 'CRYPTO' },
        ] as unknown as Asset[];
        const h = assetsToHoldings(assets, FX);
        expect(h[0]).toEqual({ value: 1000, accountType: 'CELI', owner: 'user2' });
        expect(h[1]).toEqual({ value: 25000, accountType: 'CRYPTO', owner: undefined });
    });

    it('[ASSET-FX-DISPLAY] DISCRIMINANT : convertit les prix NATIFS en CAD (USD×1.4, EUR×1.5) — échoue sur l\'ancien code sans FX', () => {
        // Le bug de l'incident 2026-07-14 : NVDA (USD) + CW8.PA (EUR) sommés bruts comme des CAD →
        // portefeuille SOUS-affiché (~70 k$ chez Marc). L'ancien code rendait 100 et 200 ici.
        const assets = [
            { symbol: 'NVDA', currency: 'USD', currentPrice: 10, quantity: 10, accountType: 'NON-ENREG' },
            { symbol: 'CW8.PA', currency: 'EUR', currentPrice: 20, quantity: 10, accountType: 'NON-ENREG' },
        ] as unknown as Asset[];
        const h = assetsToHoldings(assets, FX);
        expect(h[0].value).toBe(140); // 100 USD × 1.4
        expect(h[1].value).toBe(300); // 200 EUR × 1.5
    });
});

describe('computeNetWorthByOwner', () => {
    const FX = { CAD: 1, USD: 1.4, EUR: 1.5 };

    it('combine placements (convertis CAD) + cash conjoint (déjà CAD)', () => {
        const assets = [
            { symbol: 'VFV.TO', currency: 'CAD', currentPrice: 100, quantity: 200, accountType: 'CELI', owner: 'user1' },
            { symbol: 'XEQT.TO', currency: 'CAD', currentPrice: 40, quantity: 100, accountType: 'NON-ENREG' },
        ] as unknown as Asset[];
        const r = computeNetWorthByOwner(assets, FX, 8000, true);
        expect(r.user1).toBe(20000);       // VFV CELI user1
        expect(r.joint).toBe(4000 + 8000); // XEQT nonreg (joint défaut) + cash
        expect(r.total).toBe(32000);
    });

    it('[ASSET-FX-DISPLAY] le total par personne reflète les devises (mix USD/EUR/CAD)', () => {
        const assets = [
            { symbol: 'NVDA', currency: 'USD', currentPrice: 100, quantity: 5, accountType: 'CELI', owner: 'user1' },   // 500 USD → 700 CAD
            { symbol: 'SAF.PA', currency: 'EUR', currentPrice: 200, quantity: 2, accountType: 'NON-ENREG' },            // 400 EUR → 600 CAD (joint)
        ] as unknown as Asset[];
        const r = computeNetWorthByOwner(assets, FX, 0, true);
        expect(r.user1).toBe(700);
        expect(r.joint).toBe(600);
        expect(r.total).toBe(1300); // et PAS 900 (somme brute sans FX de l'ancien code)
    });
});
