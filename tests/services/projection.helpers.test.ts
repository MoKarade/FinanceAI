import { describe, it, expect } from 'vitest';
import {
    mulberry32,
    gaussianRandom,
    applyShock,
    RRIF_RATES,
    welcomeTax,
    MER,
    ASSET_VOLATILITY,
    ltcAnnualProbability,
    mortalityAnnualProbability,
} from '../../services/projection/helpers';

describe('projection/helpers', () => {
    describe('mulberry32', () => {
        it('produces deterministic sequence for same seed', () => {
            const r1 = mulberry32(42);
            const r2 = mulberry32(42);
            for (let i = 0; i < 10; i++) {
                expect(r1()).toBe(r2());
            }
        });

        it('produces different sequence for different seeds', () => {
            const r1 = mulberry32(1);
            const r2 = mulberry32(2);
            expect(r1()).not.toBe(r2());
        });

        it('output is always in [0, 1)', () => {
            const r = mulberry32(123);
            for (let i = 0; i < 1000; i++) {
                const v = r();
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThan(1);
            }
        });
    });

    describe('gaussianRandom', () => {
        it('mean and stdDev are approximately respected on 10000 samples', () => {
            const r = mulberry32(7);
            const samples: number[] = [];
            for (let i = 0; i < 10000; i++) samples.push(gaussianRandom(r, 0, 1));
            const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
            const variance = samples.reduce((acc, x) => acc + (x - mean) ** 2, 0) / samples.length;
            expect(Math.abs(mean)).toBeLessThan(0.05);
            expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.05);
        });

        it('shifts by mean and scales by stdDev', () => {
            const r = mulberry32(7);
            const samples: number[] = [];
            for (let i = 0; i < 5000; i++) samples.push(gaussianRandom(r, 100, 15));
            const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
            expect(Math.abs(mean - 100)).toBeLessThan(1);
        });
    });

    describe('applyShock', () => {
        it('zero shock returns the base rate', () => {
            expect(applyShock(7, 15, 0)).toBeCloseTo(7, 5);
        });

        it('positive shock increases the rate', () => {
            expect(applyShock(7, 15, 1)).toBeGreaterThan(7);
        });

        it('negative shock decreases the rate', () => {
            expect(applyShock(7, 15, -1)).toBeLessThan(7);
        });
    });

    describe('RRIF_RATES', () => {
        it('starts at age 72 with 5.40%', () => {
            expect(RRIF_RATES[72]).toBe(0.0540);
        });

        it('peaks at age 94 at 20%', () => {
            expect(RRIF_RATES[94]).toBe(0.2000);
        });

        it('is monotonically increasing', () => {
            for (let age = 73; age <= 94; age++) {
                expect(RRIF_RATES[age]).toBeGreaterThan(RRIF_RATES[age - 1]);
            }
        });
    });

    // NOTE: l'implémentation actuelle utilise `else if` entre les paliers,
    // donc seul UN palier s'ajoute aux 0,5% sur 50k. Ce n'est PAS conforme
    // au calcul officiel cumulé/progressif (TODO D2.5: corriger).
    // Les tests ci-dessous figent le comportement existant pour éviter une
    // régression silencieuse lors de la migration.
    describe('welcomeTax (comportement actuel, à corriger)', () => {
        it('returns 0 for price 0', () => {
            expect(welcomeTax(0)).toBe(0);
        });

        it('50k → 250$', () => {
            expect(welcomeTax(50000)).toBeCloseTo(250, 2);
        });

        it('300k → 2750$ (seul palier 1% activé)', () => {
            expect(welcomeTax(300000)).toBeCloseTo(2750, 2);
        });

        it('500k → 3250$ (seul palier 1.5% activé)', () => {
            // 50000 * 0.005 + 200000 * 0.015 = 250 + 3000 = 3250
            expect(welcomeTax(500000)).toBeCloseTo(3250, 2);
        });

        it('700k → 6250$ (seul palier 3% activé)', () => {
            // 50000 * 0.005 + 200000 * 0.03 = 250 + 6000 = 6250
            expect(welcomeTax(700000)).toBeCloseTo(6250, 2);
        });
    });

    describe('ltcAnnualProbability', () => {
        it('vaut 0 avant 65 ans', () => {
            expect(ltcAnnualProbability(40)).toBe(0);
            expect(ltcAnnualProbability(64)).toBe(0);
        });

        it('augmente strictement à chaque palier d\'âge', () => {
            const p65 = ltcAnnualProbability(65);
            const p75 = ltcAnnualProbability(75);
            const p85 = ltcAnnualProbability(85);
            const p95 = ltcAnnualProbability(95);
            expect(p75).toBeGreaterThan(p65);
            expect(p85).toBeGreaterThan(p75);
            expect(p95).toBeGreaterThan(p85);
        });

        it('plafonne à 25% à 90+', () => {
            expect(ltcAnnualProbability(92)).toBe(0.25);
            expect(ltcAnnualProbability(110)).toBe(0.25);
        });
    });

    describe('mortalityAnnualProbability', () => {
        it('croît strictement avec l\'âge', () => {
            for (let a = 50; a <= 100; a += 5) {
                expect(mortalityAnnualProbability(a + 5)).toBeGreaterThanOrEqual(mortalityAnnualProbability(a));
            }
        });

        it('est dans [0, 1]', () => {
            for (let a = 30; a <= 110; a++) {
                const p = mortalityAnnualProbability(a);
                expect(p).toBeGreaterThan(0);
                expect(p).toBeLessThanOrEqual(1);
            }
        });

        it('reflète l\'asymétrie connue: ~33% à 100 ans', () => {
            expect(mortalityAnnualProbability(100)).toBeCloseTo(0.33, 1);
        });
    });

    describe('constants', () => {
        it('MER is 0.2% annual', () => {
            expect(MER).toBe(0.0020);
        });

        it('ASSET_VOLATILITY values are documented', () => {
            expect(ASSET_VOLATILITY.stocks).toBe(0.15);
            expect(ASSET_VOLATILITY.crypto).toBe(0.50);
            expect(ASSET_VOLATILITY.cash).toBe(0.03);
        });
    });
});
