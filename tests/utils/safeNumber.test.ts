import { describe, it, expect } from 'vitest';
import { safeNumber } from '../../utils/safeNumber';

describe('safeNumber', () => {
    it('retourne le nombre pour une valeur numérique valide', () => {
        expect(safeNumber(42)).toBe(42);
        expect(safeNumber(0)).toBe(0);
        expect(safeNumber(-3.14)).toBeCloseTo(-3.14);
    });

    it('retourne le fallback pour NaN', () => {
        expect(safeNumber(NaN)).toBe(0);
        expect(safeNumber(NaN, 100)).toBe(100);
    });

    it('retourne le fallback pour Infinity et -Infinity', () => {
        expect(safeNumber(Infinity)).toBe(0);
        expect(safeNumber(-Infinity)).toBe(0);
        expect(safeNumber(Infinity, 999)).toBe(999);
    });

    it('retourne le fallback pour null et undefined', () => {
        expect(safeNumber(null)).toBe(0);
        expect(safeNumber(undefined)).toBe(0);
        expect(safeNumber(undefined, 42)).toBe(42);
    });

    it('retourne le fallback pour une string non numérique', () => {
        expect(safeNumber('abc')).toBe(0);
        expect(safeNumber('NaN')).toBe(0);
        expect(safeNumber('')).toBe(0); // String vide → 0 via Number('') = 0
    });

    it('parse les strings numériques valides', () => {
        expect(safeNumber('42')).toBe(42);
        expect(safeNumber('3.14')).toBeCloseTo(3.14);
        expect(safeNumber('-100')).toBe(-100);
    });

    it('utilise le fallback par défaut = 0 si non spécifié', () => {
        expect(safeNumber('invalid')).toBe(0);
    });

    it('clamp vers le haut si valeur < min', () => {
        expect(safeNumber(-5, 0, 0, 100)).toBe(0);
        expect(safeNumber(10, 0, 20)).toBe(20);
    });

    it('clamp vers le bas si valeur > max', () => {
        expect(safeNumber(150, 0, 0, 100)).toBe(100);
        expect(safeNumber(99, 0, undefined, 50)).toBe(50);
    });

    it('ne clamp pas si valeur dans [min, max]', () => {
        expect(safeNumber(50, 0, 0, 100)).toBe(50);
        expect(safeNumber(0, 0, 0, 100)).toBe(0); // bornes inclusives
        expect(safeNumber(100, 0, 0, 100)).toBe(100);
    });

    it('le fallback ne subit pas le clamp', () => {
        // NaN → fallback ; le fallback est retourné tel quel même s'il est hors bornes
        expect(safeNumber(NaN, -50, 0, 100)).toBe(-50);
    });

    it('booleans : true=1, false=0 (cohérent avec Number())', () => {
        expect(safeNumber(true)).toBe(1);
        expect(safeNumber(false)).toBe(0);
    });

    it('objet/array → fallback (Number({}) = NaN)', () => {
        expect(safeNumber({})).toBe(0);
        expect(safeNumber([1, 2, 3], 42)).toBe(42);
        expect(safeNumber([42])).toBe(42); // Number([42]) = 42 (coercion JS)
    });
});
