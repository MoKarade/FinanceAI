// [FUTUR-DAILY-ROLLOVER] « Aujourd'hui » (jour) RÉACTIF — demande Marc 2026-08-12 : « ça doit se
// mettre à jour à chaque jour pour le passé ». Le hook partage l'horloge module-level du mois :
// on prouve ici que (1) la valeur suit l'horloge système, (2) un retour d'onglet APRÈS minuit
// rafraîchit la valeur sans re-monter — le scénario exact « app laissée ouverte ».
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTodayIsoLocal } from '../../hooks/useSimulationParams';

afterEach(() => { vi.useRealTimers(); });

describe('useTodayIsoLocal — le jour courant suit le calendrier, app ouverte', () => {
    it('rend la date LOCALE du jour au format YYYY-MM-DD', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 7, 12, 10, 0, 0)); // 12 août 2026, 10 h locale
        const { result, unmount } = renderHook(() => useTodayIsoLocal());
        expect(result.current).toBe('2026-08-12');
        unmount();
    });

    it('retour d’onglet APRÈS minuit ⇒ la valeur avance au nouveau jour (sans re-montage)', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 7, 12, 23, 30, 0));
        const { result, unmount } = renderHook(() => useTodayIsoLocal());
        expect(result.current).toBe('2026-08-12');

        // Minuit passe pendant que l'onglet est resté ouvert…
        vi.setSystemTime(new Date(2026, 7, 13, 0, 10, 0));
        // …et l'utilisateur revient sur l'onglet : l'horloge partagée notifie sur visibilitychange.
        act(() => { document.dispatchEvent(new Event('visibilitychange')); });
        expect(result.current).toBe('2026-08-13');
        unmount();
    });

    it('le tick HORAIRE partagé rattrape aussi minuit (onglet visible mais inactif)', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 7, 12, 23, 30, 0));
        const { result, unmount } = renderHook(() => useTodayIsoLocal());
        expect(result.current).toBe('2026-08-12');
        act(() => { vi.advanceTimersByTime(61 * 60 * 1000); }); // > 1 h : le timer horaire a tiré
        expect(result.current).toBe('2026-08-13');
        unmount();
    });
});
