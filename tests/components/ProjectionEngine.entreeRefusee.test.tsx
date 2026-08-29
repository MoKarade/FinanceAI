// [ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] Le moteur ne LANCE PAS de calcul sur une entrée illisible.
//
// ⚠️ Pourquoi ce fichier existe à part. Les tests d'effacement du fichier voisin passent AUSSI quand
// on retire le blocage du calcul (mesuré : perturbation muette) — parce que l'effacement suffit à
// produire l'état observable. Ils ne prouvent donc rien sur le blocage lui-même. Pour vérifier
// qu'un appel n'a PAS lieu, il faut l'OBSERVER, pas en déduire l'absence depuis un effet de bord.
//
// Ce que le blocage apporte en propre : ne pas engager le worker sur des paramètres corrompus.
// `Infinity` et `NaN` traversent tout le moteur ; le calcul serait au mieux jeté, au pire un crash
// journalisé en « CRITICAL SIMULATION ERROR » à chaque frappe.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

vi.mock('../../services/errorLogger', () => ({ logError: vi.fn() }));
vi.mock('../../services/projection/runAsync', async (importOriginal) => {
    const reel = await importOriginal<typeof import('../../services/projection/runAsync')>();
    return { ...reel, runProjectionAsync: vi.fn(reel.runProjectionAsync) };
});

import { ProjectionEngine } from '../../components/ProjectionEngine';
import { runProjectionAsync } from '../../services/projection/runAsync';
import { useFinanceStore } from '../../store/useFinanceStore';
import { getPersonaOrDefault, DEFAULT_PERSONA_ID } from '../../services/testFixtures';

const monter = (corrompre?: (etat: Record<string, unknown>) => void) => {
    const persona = getPersonaOrDefault(DEFAULT_PERSONA_ID);
    const etat = persona.build() as Record<string, unknown>;
    corrompre?.(etat);
    act(() => {
        useFinanceStore.getState().enableTestMode(etat as never, persona.id);
        useFinanceStore.setState({ projectionRunMC: false, lastProjection: null, projectionStatus: 'idle' });
    });
    return render(<ProjectionEngine calculatedMonthlySavings={2000} />);
};

describe('[ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] aucun calcul lancé sur une entrée illisible', () => {
    beforeEach(() => { vi.mocked(runProjectionAsync).mockClear(); });
    afterEach(() => cleanup());

    it('n\'appelle PAS le moteur quand une entrée est refusée', async () => {
        // ⚠️ Le lancement du calcul est DEBOUNCÉ (300 ms). Une première version de ce test attendait
        // seulement que le statut passe à `error` — ce qui arrive AVANT le debounce, donc l'espion
        // était vide même sans blocage : perturbation MUETTE, le test mesurait la latence et pas la
        // garde. Pour « l'appel n'a PAS eu lieu », la lecture doit se faire APRÈS le budget de temps
        // (`UN-TEST-QUI-PASSE-PAR-DETACHEMENT-PASSE-PAR-ACCIDENT`) — d'où les faux timers, qui le
        // franchissent de façon déterministe plutôt qu'en dormant.
        vi.useFakeTimers();
        try {
            monter((etat) => {
                const config = etat.config as { users: Array<Record<string, unknown>> };
                config.users[0].netSalary = Number.NaN;
            });
            await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
            expect(useFinanceStore.getState().projectionStatus).toBe('error');
            expect(runProjectionAsync).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('l\'appelle bien sur un état SAIN — sans quoi l\'assertion ci-dessus serait vacueuse', async () => {
        // ⚠️ Le contrôle qui rend le test précédent lisible : prouver que ce MÊME espion voit un
        // appel quand il doit en voir un, DANS LE MÊME budget de temps. Sans lui, un espion jamais
        // câblé — ou un debounce jamais franchi — donnerait exactement le même vert.
        vi.useFakeTimers();
        try {
            monter();
            await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
            expect(runProjectionAsync).toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });
});
