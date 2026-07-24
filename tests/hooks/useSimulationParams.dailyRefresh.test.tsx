import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSimulationParams } from '../../hooks/useSimulationParams';

// [FUTUR-HIST-DAILY-REFRESH] « Aujourd'hui » (startYear/startMonth) doit AVANCER quand le mois calendaire
// change, même onglet resté ouvert (avant : figé au montage via useMemo([])). Le check horaire (setInterval)
// réévalue monthEpoch → au passage de mois, startMonth avance (et la projection re-seed).

describe('[FUTUR-HIST-DAILY-REFRESH] useSimulationParams', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('startMonth avance quand le mois change (check horaire), figé sinon', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-15T12:00:00'));
        const { result } = renderHook(() => useSimulationParams(0));
        expect(result.current.startMonth).toBe(0); // janvier
        expect(result.current.startYear).toBe(2026);

        // Encore janvier, 1h plus tard → le tick ne change RIEN (no-op, pas de re-render inutile).
        act(() => { vi.setSystemTime(new Date('2026-01-15T13:05:00')); vi.advanceTimersByTime(60 * 60 * 1000); });
        expect(result.current.startMonth).toBe(0);

        // On passe en février → au prochain tick horaire, startMonth avance à 1.
        act(() => { vi.setSystemTime(new Date('2026-02-01T00:30:00')); vi.advanceTimersByTime(60 * 60 * 1000); });
        expect(result.current.startMonth).toBe(1); // février
        expect(result.current.startYear).toBe(2026);

        // Passage d'année : décembre 2026 → janvier 2027.
        act(() => { vi.setSystemTime(new Date('2027-01-02T00:00:00')); vi.advanceTimersByTime(60 * 60 * 1000); });
        expect(result.current.startMonth).toBe(0);
        expect(result.current.startYear).toBe(2027);
    });
});
