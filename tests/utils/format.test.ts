import { describe, it, expect } from 'vitest';
import {
    formatCAD,
    formatNumber,
    formatPercent,
    formatSigned,
    formatDate,
    formatMonthYear,
    formatCompactCAD,
} from '../../utils/format';

// fr-CA Intl uses U+202F (NARROW NO-BREAK SPACE) for thousands separators
// in modern Node 22+ ICU. Tests normalize to regular space for readability.
const norm = (s: string) => s.replace(/[  ]/g, ' ');

describe('formatCAD', () => {
    it('formats integer with currency symbol', () => {
        expect(norm(formatCAD(1234))).toBe('1 234 $');
    });

    it('formats large amount with thousands separator', () => {
        expect(norm(formatCAD(1234567))).toBe('1 234 567 $');
    });

    it('formats with 2 decimals when requested', () => {
        expect(norm(formatCAD(1111.55, { decimals: 2 }))).toBe('1 111,55 $');
    });

    it('returns dash for non-finite values', () => {
        expect(formatCAD(NaN)).toBe('—');
        expect(formatCAD(Infinity)).toBe('—');
        expect(formatCAD(undefined)).toBe('—');
        expect(formatCAD(null)).toBe('—');
    });

    it('handles zero', () => {
        expect(norm(formatCAD(0))).toBe('0 $');
    });

    it('handles negative amounts', () => {
        expect(norm(formatCAD(-500))).toBe('-500 $');
    });
});

describe('formatNumber', () => {
    it('formats without currency', () => {
        expect(norm(formatNumber(1234))).toBe('1 234');
    });

    it('respects 2 decimals', () => {
        expect(norm(formatNumber(1111.555, { decimals: 2 }))).toBe('1 111,56');
    });

    it('returns dash for invalid', () => {
        expect(formatNumber('abc')).toBe('—');
    });
});

describe('formatPercent', () => {
    it('formats with default 2 decimals', () => {
        expect(norm(formatPercent(12.55))).toBe('12,55 %');
    });

    it('respects custom decimals', () => {
        expect(norm(formatPercent(7.5, 1))).toBe('7,5 %');
        expect(norm(formatPercent(7, 0))).toBe('7 %');
    });

    it('handles non-finite', () => {
        expect(formatPercent(NaN)).toBe('—');
    });
});

describe('formatSigned', () => {
    it('positive value gets + prefix', () => {
        expect(norm(formatSigned(150))).toBe('+150');
    });

    it('negative value gets minus prefix (unicode)', () => {
        expect(norm(formatSigned(-150))).toBe('−150');
    });

    it('zero has no sign', () => {
        expect(norm(formatSigned(0))).toBe('0');
    });

    it('with currency', () => {
        expect(norm(formatSigned(2500, { withCurrency: true }))).toBe('+2 500 $');
    });
});

describe('formatDate', () => {
    it('formats Date object', () => {
        // Use UTC to avoid timezone shifts (fr-CA in different TZ)
        const d = new Date('2026-05-20T12:00:00Z');
        const formatted = formatDate(d);
        expect(formatted).toMatch(/(19|20)\s+mai\s+2026/);
    });

    it('formats ISO string', () => {
        const formatted = formatDate('2026-01-15T12:00:00Z');
        expect(formatted).toMatch(/(14|15|16)\s+janvier\s+2026/);
    });

    it('returns dash for invalid', () => {
        expect(formatDate('not-a-date')).toBe('—');
        expect(formatDate(null)).toBe('—');
        expect(formatDate(undefined)).toBe('—');
    });
});

describe('formatMonthYear', () => {
    it('formats month and year', () => {
        const result = formatMonthYear('2026-05-20T12:00:00Z');
        expect(result).toMatch(/mai 2026/);
    });
});

describe('formatCompactCAD', () => {
    it('formats millions', () => {
        expect(norm(formatCompactCAD(1_500_000))).toBe('1,50 M$');
    });

    it('formats thousands', () => {
        expect(norm(formatCompactCAD(85_000))).toBe('85 k$');
    });

    it('falls back to standard for small amounts', () => {
        expect(norm(formatCompactCAD(500))).toBe('500 $');
    });
});
