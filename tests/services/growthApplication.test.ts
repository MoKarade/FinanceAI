/**
 * Lot 2 — growthApplication.applyMonthlyGrowth : applique la croissance mensuelle
 * sur les 7 classes d'actifs (delegue à applyMidMonthGrowth, déjà testé). On
 * verrouille l'ORCHESTRATION : totalGrowth = somme des 7, base de croissance
 * NonReg/REEE hors contributions du mois, aucun NaN.
 */
import { describe, it, expect } from 'vitest';
import { applyMonthlyGrowth, type GrowthInputs } from '../../services/projection/growthApplication';

const inputs = (o: Partial<GrowthInputs> = {}): GrowthInputs => ({
    prevCELI: 10000, celi: 10000, effectiveCeliRate: 7,
    celiapp: 5000, activeCeliRate: 7,
    prevREER: 20000, reer: 20000, effectiveReerRate: 6.5,
    nonReg: 15000, contribNonReg: 0, effectiveNonRegRate: 6.5,
    crypto: 3000, activeCryptoRate: 10,
    prevLiquid: 8000, liquid: 8000, activeCashRate: 3,
    reee: 4000, contribREEE: 0,
    ...o,
});

describe('applyMonthlyGrowth — orchestration', () => {
    it('totalGrowth = somme exacte des 7 croissances (aucun actif oublié)', () => {
        const r = applyMonthlyGrowth(inputs());
        const sum = r.celi.growth + r.celiapp.growth + r.reer.growth + r.nonReg.growth
            + r.crypto.growth + r.liquid.growth + r.reee.growth;
        expect(r.totalGrowth).toBeCloseTo(sum, 6);
    });

    it('les 7 actifs sont présents avec des valeurs finies (aucun NaN)', () => {
        const r = applyMonthlyGrowth(inputs());
        for (const k of ['celi', 'celiapp', 'reer', 'nonReg', 'crypto', 'liquid', 'reee'] as const) {
            expect(Number.isFinite(r[k].newVal)).toBe(true);
            expect(Number.isFinite(r[k].growth)).toBe(true);
            expect(Number.isFinite(r[k].pct)).toBe(true);
        }
        expect(Number.isFinite(r.totalGrowth)).toBe(true);
    });

    it('NonReg : les contributions du mois sont exclues de la base de croissance', () => {
        const withContrib = applyMonthlyGrowth(inputs({ nonReg: 15000, contribNonReg: 15000 }));
        const noContrib = applyMonthlyGrowth(inputs({ nonReg: 15000, contribNonReg: 0 }));
        // base exclut le dépôt du mois → croissance plus faible
        expect(withContrib.nonReg.growth).toBeLessThan(noContrib.nonReg.growth);
    });

    it('REEE : les contributions du mois sont aussi exclues de la base', () => {
        const withContrib = applyMonthlyGrowth(inputs({ reee: 4000, contribREEE: 4000 }));
        const noContrib = applyMonthlyGrowth(inputs({ reee: 4000, contribREEE: 0 }));
        expect(withContrib.reee.growth).toBeLessThan(noContrib.reee.growth);
    });
});
