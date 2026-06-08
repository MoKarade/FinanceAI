/**
 * Phase 1 — refactor « soldes REER par conjoint ». Module pur d'attribution + réconciliation.
 * On verrouille l'INVARIANT de sécurité Σ(byUser) == pool, les clés (salaire), et les replis.
 */
import { describe, it, expect } from 'vitest';
import {
    salaryShares,
    splitByShares,
    reconcileToPool,
    stepReerByUser,
} from '../../services/projection/perUserBalances';

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

describe('salaryShares', () => {
    it('proportionnel au brut, somme = 1', () => {
        const s = salaryShares([90000, 30000]);
        expect(s[0]).toBeCloseTo(0.75, 10);
        expect(s[1]).toBeCloseTo(0.25, 10);
        expect(sum(s)).toBeCloseTo(1, 10);
    });
    it('total nul → repli égal', () => {
        expect(salaryShares([0, 0])).toEqual([0.5, 0.5]);
    });
    it('valeurs négatives/NaN ramenées à 0', () => {
        const s = salaryShares([-5000, 50000]);
        expect(s[0]).toBe(0);
        expect(s[1]).toBe(1);
    });
    it('solo → [1]', () => {
        expect(salaryShares([70000])).toEqual([1]);
    });
});

describe('splitByShares', () => {
    it('répartit selon les parts', () => {
        expect(splitByShares(100000, [0.75, 0.25])).toEqual([75000, 25000]);
    });
    it('parts non normalisées renormalisées', () => {
        const r = splitByShares(100, [3, 1]);
        expect(r[0]).toBeCloseTo(75, 10);
        expect(sum(r)).toBeCloseTo(100, 10);
    });
    it('pool négatif → 0', () => {
        expect(splitByShares(-100, [0.5, 0.5])).toEqual([0, 0]);
    });
});

describe('reconcileToPool — INVARIANT Σ == pool', () => {
    it('met la somme à pool en gardant les ratios', () => {
        const r = reconcileToPool([30, 10], 100, [0.5, 0.5]);
        expect(sum(r)).toBeCloseTo(100, 10);
        expect(r[0] / r[1]).toBeCloseTo(3, 10); // ratio 30:10 préservé
    });
    it('somme courante nulle → répartition par shares', () => {
        const r = reconcileToPool([0, 0], 80, [0.75, 0.25]);
        expect(r).toEqual([60, 20]);
    });
    it('jamais de solde négatif', () => {
        const r = reconcileToPool([5, 5], 0, [0.5, 0.5]);
        expect(r.every(x => x >= 0)).toBe(true);
        expect(sum(r)).toBe(0);
    });
});

describe('stepReerByUser — flux mensuel + invariant', () => {
    it('retrait pro-rata, cotisation par parts, Σ == poolEnd', () => {
        // prev [60k, 20k] (Σ80k). Retrait 8k pro-rata (6k/2k), cotis 4k à 100% conjoint 0,
        // poolEnd commun = 80k - 8k + 4k + croissance(2k) = 78k... on impose poolEnd=78000.
        const next = stepReerByUser([60000, 20000], {
            withdrawal: 8000, contribution: 4000, poolEnd: 78000, shares: [1, 0],
        });
        expect(sum(next)).toBeCloseTo(78000, 6); // invariant
        // conjoint 0 reçoit toute la cotisation → sa part monte vs le simple pro-rata
        expect(next[0]).toBeGreaterThan(next[1]);
    });
    it('aucun flux : la croissance du pool est absorbée pro-rata', () => {
        const next = stepReerByUser([75000, 25000], {
            withdrawal: 0, contribution: 0, poolEnd: 110000, shares: [0.75, 0.25],
        });
        expect(sum(next)).toBeCloseTo(110000, 6);
        expect(next[0] / next[1]).toBeCloseTo(3, 6); // ratio 75:25 préservé par la croissance pro-rata
    });
    it('poolEnd nul → registre à zéro (REER épuisé)', () => {
        const next = stepReerByUser([1000, 500], {
            withdrawal: 1500, contribution: 0, poolEnd: 0, shares: [0.5, 0.5],
        });
        expect(sum(next)).toBe(0);
    });
});
