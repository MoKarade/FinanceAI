import { describe, it, expect } from 'vitest';
import { numOr, numOrUndef } from '../../utils/numericInput';

describe('numericInput — garde anti-NaN (PV-5)', () => {
    describe('numOr (champ requis)', () => {
        it('renvoie le nombre saisi quand il est fini', () => {
            expect(numOr('1500', 0)).toBe(1500);
            expect(numOr('0', 99)).toBe(0);
            expect(numOr('-5', 0)).toBe(-5);
            expect(numOr('1e3', 0)).toBe(1000);
            expect(numOr('72.5', 0)).toBe(72.5);
        });

        it('retombe sur le fallback (jamais NaN) sur saisie vide ou invalide', () => {
            expect(numOr('', 65)).toBe(65);
            expect(numOr('   ', 65)).toBe(65);
            expect(numOr('-', 65)).toBe(65);      // Number('-') = NaN
            expect(numOr('abc', 65)).toBe(65);
            expect(numOr('1e', 65)).toBe(65);      // mid-frappe « 1e5 »
        });

        it('rejette Infinity (non fini) au profit du fallback', () => {
            expect(numOr('Infinity', 100)).toBe(100);
            expect(numOr('-Infinity', 100)).toBe(100);
        });

        it('ne renvoie JAMAIS NaN', () => {
            for (const raw of ['', ' ', '-', '+', 'x', 'NaN', 'e', '.', '1.2.3']) {
                expect(Number.isNaN(numOr(raw, 42))).toBe(false);
                expect(numOr(raw, 42)).toBe(42);
            }
        });
    });

    describe('numOrUndef (champ optionnel : vide ⇒ undefined, jamais 0 ni NaN)', () => {
        it('renvoie undefined sur vide ou invalide', () => {
            expect(numOrUndef('')).toBeUndefined();
            expect(numOrUndef('   ')).toBeUndefined();
            expect(numOrUndef('-')).toBeUndefined();
            expect(numOrUndef('abc')).toBeUndefined();
            expect(numOrUndef('Infinity')).toBeUndefined();
        });

        it('renvoie le nombre fini sinon (y compris 0 explicite)', () => {
            expect(numOrUndef('1100')).toBe(1100);
            expect(numOrUndef('0')).toBe(0);
            expect(numOrUndef('-200')).toBe(-200);
        });

        it('distingue bien le 0 explicite (saisi) de undefined (vidé)', () => {
            // côté moteur, `!== undefined` est testé : 0 doit rester 0, '' doit devenir undefined.
            expect(numOrUndef('0')).toBe(0);
            expect(numOrUndef('')).toBeUndefined();
        });

        it('ne renvoie JAMAIS NaN', () => {
            for (const raw of ['', ' ', '-', '+', 'x', 'NaN', 'e']) {
                const v = numOrUndef(raw);
                expect(v === undefined || Number.isFinite(v)).toBe(true);
            }
        });
    });
});
