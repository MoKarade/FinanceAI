import { describe, it, expect } from 'vitest';
import {
    mulberry32,
    gaussianRandom,
    applyShock,
    RRIF_RATES,
    RRIF_RATE_PLATEAU,
    RRIF_PLATEAU_AGE,
    RRIF_FIRST_WITHDRAWAL_AGE,
    rrifRateForAge,
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

        // Ce test est la CONDITION DE VALIDITÉ du dernier repli de `rrifRateForAge` : celui-ci rend
        // le plateau (20 %) quand l'âge manque à la table. C'est acceptable UNIQUEMENT parce que la
        // table réelle n'a aucun trou entre le 1er retrait obligatoire et le plateau — sinon un âge
        // ordinaire recevrait le facteur le plus punitif du barème. Le jour où quelqu'un retire une
        // ligne, c'est ici que ça casse, pas dans une projection à 30 ans.
        it('n’a AUCUN trou de 72 à 94 — ce qui rend le repli au plateau inatteignable', () => {
            const holes: number[] = [];
            for (let age = RRIF_FIRST_WITHDRAWAL_AGE; age < RRIF_PLATEAU_AGE; age++) {
                if (typeof RRIF_RATES[age] !== 'number') holes.push(age);
            }
            expect(holes).toEqual([]);
        });
    });

    /**
     * [FISC-RRIF-FRACTIONAL-AGE] Le repli attrape-tout `RRIF_RATES[age] || RRIF_RATE_PLATEAU`
     * distribuait le facteur le PLUS PUNITIF du barème sur toute entrée inattendue.
     *
     * DISCRIMINANTS (échouent sur le code d'avant) : l'âge fractionnaire et l'âge NaN.
     * Les autres cas pinnent la non-régression — la sortie doit rester bit-identique pour tout
     * âge entier, sans quoi ce durcissement changerait des chiffres.
     */
    describe('rrifRateForAge', () => {
        it('DISCRIMINANT — un âge fractionnaire prend le facteur de son âge entier, pas le plateau', () => {
            // Avant : RRIF_RATES[72.5] est `undefined` → repli 20 %, soit 3,7× le facteur réel.
            // Le retrait forcé sort de l'abri fiscal et devient imposable : l'écart coûte de l'argent.
            expect(rrifRateForAge(72.5)).toBe(0.0540);
            expect(rrifRateForAge(93.9)).toBe(0.1634);
        });

        it('DISCRIMINANT — un âge NaN ne déclenche AUCUN retrait forcé (0), pas 20 %', () => {
            // `NaN < 72` est FAUX : le garde d'âge de l'appelant laisse passer NaN jusqu'ici.
            // Inventer un retrait de 20 % sur un âge inconnu, c'est fabriquer de la donnée.
            expect(rrifRateForAge(Number.NaN)).toBe(0);
            expect(rrifRateForAge(Number.POSITIVE_INFINITY)).toBe(0);
        });

        it('rend le plateau à partir de 95 ans, explicitement', () => {
            expect(rrifRateForAge(RRIF_PLATEAU_AGE)).toBe(RRIF_RATE_PLATEAU);
            expect(rrifRateForAge(120)).toBe(RRIF_RATE_PLATEAU);
        });

        it('NON-RÉGRESSION — tout âge entier de 71 à 94 rend exactement la table', () => {
            for (let age = 71; age < RRIF_PLATEAU_AGE; age++) {
                expect(rrifRateForAge(age), `âge ${age}`).toBe(RRIF_RATES[age]);
            }
        });

        it('une table PARTIELLE injectée garde le repli au plateau (contrat des fixtures de test)', () => {
            // taxJanuary.test.ts injecte `{ 72: 0.054, 80: 0.0682 }` : le comportement d'avant est
            // préservé pour ces fixtures, sinon ce durcissement les ferait passer pour une autre raison.
            expect(rrifRateForAge(75, { 72: 0.054, 80: 0.0682 })).toBe(RRIF_RATE_PLATEAU);
        });

        it('-Infinity (conjoint sans âge ni année de naissance) ne déclenche aucun retrait', () => {
            expect(rrifRateForAge(Number.NEGATIVE_INFINITY)).toBe(0);
        });
    });

    // FISC-WELCOME-UNIFY — welcomeTax délègue à realEstate.calculateWelcomeTax (source unique).
    // Sans municipalité ⇒ repli Montréal (cumulatif par tranche, paliers 2026).
    // Paliers MTL: 0.5% / 1% / 1.5% / 2% / 2.5% / 3% / 3.5% / 4%
    // Seuils MTL: 53 700 / 269 300 / 538 500 / 1 077 000 / 2 154 000 / 3 231 000 / 5 385 000
    describe('welcomeTax (défaut Montréal 2026)', () => {
        it('returns 0 for price 0', () => {
            expect(welcomeTax(0)).toBe(0);
        });

        it('reste_qc : barème de base 2026 (500k → 5610.50$)', () => {
            // Seuils 2026 : 62900*0.005 + 252100*0.010 + 185000*0.015 = 314.50 + 2521 + 2775
            expect(welcomeTax(500000, 'reste_qc')).toBeCloseTo(5610.5, 2);
        });

        it('50k → 250$ (palier 1 seul)', () => {
            // 50000 * 0.005 = 250
            expect(welcomeTax(50000)).toBeCloseTo(250, 2);
        });

        it('300k → 2885$ (paliers 1-3 cumulés)', () => {
            // 53700*0.005 + 215600*0.010 + 30700*0.015 = 268.50 + 2156 + 460.50
            expect(welcomeTax(300000)).toBeCloseTo(2885, 2);
        });

        it('500k → 5885$ (paliers 1-3 cumulés)', () => {
            // 53700*0.005 + 215600*0.010 + 230700*0.015 = 268.50 + 2156 + 3460.50
            expect(welcomeTax(500000)).toBeCloseTo(5885, 2);
        });

        it('700k → 9692.50$ (paliers 1-4 cumulés)', () => {
            // 53700*0.005 + 215600*0.010 + 269200*0.015 + 161500*0.020
            expect(welcomeTax(700000)).toBeCloseTo(9692.5, 2);
        });

        it('1.5M → 27807.50$ (paliers 1-5 cumulés)', () => {
            // 53700*0.005 + 215600*0.010 + 269200*0.015 + 538500*0.020 + 423000*0.025
            // = 268.50 + 2156 + 4038 + 10770 + 10575 = 27807.50
            expect(welcomeTax(1500000)).toBeCloseTo(27807.5, 2);
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

    describe('canadianInflationFor (W bootstrap)', () => {
        it('1975-1976 reflète les contrôles de prix Trudeau (< 11%)', async () => {
            const { canadianInflationFor } = await import('../../services/projection/historicalReturns');
            expect(canadianInflationFor(1975, 99)).toBe(10.7);
            expect(canadianInflationFor(1976, 99)).toBe(7.5);
        });

        it('2022 reflète le choc post-COVID (~6.8%)', async () => {
            const { canadianInflationFor } = await import('../../services/projection/historicalReturns');
            expect(canadianInflationFor(2022, 99)).toBe(6.8);
        });

        it('année inconnue retourne le fallback US', async () => {
            const { canadianInflationFor } = await import('../../services/projection/historicalReturns');
            expect(canadianInflationFor(1700, 5.5)).toBe(5.5);
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
