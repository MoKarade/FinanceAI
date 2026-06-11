// [PH2-c-4] — parité DIRECTE du hook React `useSimulationParams` (l'assemblage RÉEL utilisé par
// ProjectionEngine et FutureProjection) avec la fonction état-pur `buildSimulationParamsFromState`.
// Jusqu'ici la parité n'était prouvée que TRANSITIVEMENT (buildSimulationParams.parity.test.ts
// verrouille la fonction pure vs la réplique de l'ancien assemblage ; ProjectionEngine.test couvre
// le moteur de bout en bout) — ce test monte le HOOK lui-même, par persona.
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSimulationParams } from '../../hooks/useSimulationParams';
import { buildSimulationParamsFromState } from '../../services/projection/buildSimulationParams';
import { computeMonthlySavings } from '../../services/projection/buildSimulationParams';
import { TEST_PERSONAS } from '../../services/testPersonas';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { AppState } from '../../types';

describe('[PH2-c-4] useSimulationParams — parité directe hook vs fonction état-pur', () => {
    beforeEach(() => {
        act(() => { useFinanceStore.getState().resetState(); });
    });

    for (const persona of TEST_PERSONAS) {
        it(`persona « ${persona.id} » : params du hook === buildSimulationParamsFromState`, () => {
            const fixtures = persona.build();
            act(() => { useFinanceStore.getState().enableTestMode(fixtures, persona.id); });

            const state = useFinanceStore.getState() as unknown as AppState;
            const savings = computeMonthlySavings(state.config, state.budgetItems ?? []);

            const { result } = renderHook(() => useSimulationParams(savings));
            // La référence utilise le MÊME point de départ temporel que le hook (date du jour).
            const expected = buildSimulationParamsFromState(state, {
                startYear: result.current.startYear,
                startMonth: result.current.startMonth,
            });

            expect(result.current.params).toEqual(expected);
        });
    }
});
