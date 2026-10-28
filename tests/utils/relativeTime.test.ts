import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelative } from '../../utils/relativeTime';

describe('formatRelative', () => {
    const NOW = 1_700_000_000_000; // Horodatage fixe de référence

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('retourne "jamais" pour une valeur absente ou 0', () => {
        expect(formatRelative(undefined)).toBe('jamais');
        expect(formatRelative(0)).toBe('jamais');
    });

    it('retourne "futur" pour une date à venir', () => {
        expect(formatRelative(NOW + 60_000)).toBe('futur');
    });

    it('formate le temps écoulé en secondes, minutes, heures et jours', () => {
        expect(formatRelative(NOW - 30_000)).toBe('il y a 30s');
        expect(formatRelative(NOW - 5 * 60_000)).toBe('il y a 5 min');
        expect(formatRelative(NOW - 3 * 3_600_000)).toBe('il y a 3h');
        expect(formatRelative(NOW - 2 * 86_400_000)).toBe('il y a 2 j');
    });
});
