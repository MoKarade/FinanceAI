import { describe, it, expect } from 'vitest';
import { sampleEvenly } from '../../utils/sampleEvenly';

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('sampleEvenly — [FUTUR-ICON-DENSITY]', () => {
    it('len <= cap : rend TOUS les éléments (copie, pas la même référence)', () => {
        const arr = range(10);
        const out = sampleEvenly(arr, 24);
        expect(out).toEqual(arr);
        expect(out).not.toBe(arr); // copie défensive
    });

    it('len > cap : rend EXACTEMENT cap éléments distincts (le bug : l\'ancien pas entier sous-remplissait)', () => {
        // Discriminant du bug Marc : 25 événements, cap 24. L'ancien `ceil(25/24)=2` ne montrait que 13.
        for (const [len, cap] of [[25, 24], [30, 24], [49, 24], [60, 24], [100, 24], [17, 16], [33, 16]] as const) {
            const out = sampleEvenly(range(len), cap);
            expect(out).toHaveLength(cap);
            expect(new Set(out).size).toBe(cap); // aucun doublon
        }
    });

    it('inclut toujours le PREMIER et le DERNIER (les jalons extrêmes ne disparaissent pas)', () => {
        const out = sampleEvenly(range(25), 24);
        expect(out[0]).toBe(0);
        expect(out[out.length - 1]).toBe(24);
    });

    it('préserve l\'ordre croissant (indices strictement croissants)', () => {
        const out = sampleEvenly(range(100), 24);
        for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1]);
    });

    it('gardes : cap <= 0 → [] ; cap === 1 → [premier]', () => {
        expect(sampleEvenly(range(10), 0)).toEqual([]);
        expect(sampleEvenly(range(10), -3)).toEqual([]);
        expect(sampleEvenly(range(10), 1)).toEqual([0]);
    });

    it('tableau vide → []', () => {
        expect(sampleEvenly([], 24)).toEqual([]);
    });
});
