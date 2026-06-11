// [PH2-c-4] — parité DIRECTE du hook React `useSimulationParams` (l'assemblage RÉEL utilisé par
// ProjectionEngine et FutureProjection) avec la fonction état-pur `buildSimulationParamsFromState`.
// Jusqu'ici la parité n'était prouvée que TRANSITIVEMENT (buildSimulationParams.parity.test.ts
// verrouille la fonction pure vs la réplique de l'ancien assemblage ; ProjectionEngine.test couvre
// le moteur de bout en bout) — ce test monte le HOOK lui-même, par persona.
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSimulationParams } from '../../hooks/useSimulationParams';
import { buildSimulationParamsFromState } from '../../services/projection/buildSimulationParams';
import { useDerivedFinancials } from '../../utils/useDerivedFinancials';
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
            // Revue #246 — `savings` vient du VRAI chemin prod (useDerivedFinancials, comme App.tsx),
            // pas de computeMonthlySavings : si la réplique app↔fonction pure dérive, CE test casse.
            const derived = renderHook(() => useDerivedFinancials(state));
            const savings = derived.result.current.calculatedMonthlySavings;

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
