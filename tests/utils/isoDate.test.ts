import { describe, it, expect } from 'vitest';
import { isValidIsoDate } from '../../utils/isoDate';

describe('isValidIsoDate', () => {
    it('accepte les dates calendairement valides dans la plage [1970, 2200]', () => {
        expect(isValidIsoDate('2026-02-28')).toBe(true);
        expect(isValidIsoDate('2024-02-29')).toBe(true);
        expect(isValidIsoDate('1970-01-01')).toBe(true);
        expect(isValidIsoDate('2200-12-31')).toBe(true);
    });

    it('rejette les dates invalides ou hors limites', () => {
        expect(isValidIsoDate('2026-02-29')).toBe(false);
        expect(isValidIsoDate('2026-02-30')).toBe(false);
        expect(isValidIsoDate('2026-04-31')).toBe(false);
        expect(isValidIsoDate('2026-13-01')).toBe(false);
        expect(isValidIsoDate('2026-00-10')).toBe(false);
        expect(isValidIsoDate('1969-12-31')).toBe(false);
        expect(isValidIsoDate('2201-01-01')).toBe(false);
        expect(isValidIsoDate('2026-1-1')).toBe(false);
        expect(isValidIsoDate('')).toBe(false);
    });
});
