import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { ProjectionEngine, FUTURE_REQ_IDS } from '../../components/ProjectionEngine';
import { PAGE_SETUP } from '../../components/setup/PageSetupGate';
import { useFinanceStore } from '../../store/useFinanceStore';
import { getPersonaOrDefault, DEFAULT_PERSONA_ID } from '../../services/testFixtures';
import { Tab } from '../../types';

// Le moteur est headless (rend null) et lit/écrit le store : pas de provider requis.
// errorLogger n'est sollicité qu'en cas de crash — muet ici (persona valide).
vi.mock('../../services/errorLogger', () => ({ logError: vi.fn() }));

describe('ProjectionEngine (PH2-c) — moteur app-level, source unique', () => {
    afterEach(() => cleanup());

    beforeEach(() => {
        // Base INCOMPLÈTE (prérequis Futur non remplis) : pas de salaire, pas de placement,
        // pas de profil retraite. projectionRunMC=false → chemin déterministe (synchrone).
        act(() => {
            useFinanceStore.setState({
                lastProjection: null,
                projectionStatus: 'idle',
                projectionRunMC: false,
                assets: [],
            });
        });
    });

    it("FUTURE_REQ_IDS reste EN PHASE avec PAGE_SETUP[Tab.FUTURE] (garde anti-drift de la duplication)", () => {
        expect(FUTURE_REQ_IDS).toEqual(PAGE_SETUP[Tab.FUTURE]!.requirementIds);
    });

    it('publie store.lastProjection quand les prérequis Futur sont remplis', async () => {
        const persona = getPersonaOrDefault(DEFAULT_PERSONA_ID);
        act(() => {
            // Données complètes et valides → prérequis (salaire + placements + profil retraite) remplis.
            useFinanceStore.getState().enableTestMode(persona.build(), persona.id);
            useFinanceStore.setState({ projectionRunMC: false, lastProjection: null, projectionStatus: 'idle' });
        });

        render(<ProjectionEngine calculatedMonthlySavings={2000} />);

        await waitFor(
            () => expect(useFinanceStore.getState().lastProjection).not.toBeNull(),
            { timeout: 4000 },
        );
        const lp = useFinanceStore.getState().lastProjection!;
        expect(Array.isArray(lp.chartData)).toBe(true);
        expect(lp.chartData.length).toBeGreaterThan(0);
        expect(useFinanceStore.getState().projectionStatus).toBe('idle');
    });

    it('ne publie PAS de projection quand le setup est incomplet (garde no-fake-data → lastProjection null)', async () => {
        // beforeEach a posé une base incomplète. On vérifie que le moteur N'ÉCRIT PAS une courbe.
        render(<ProjectionEngine calculatedMonthlySavings={0} />);

        // Laisse passer le debounce (300 ms) + quelques ticks : aucun calcul ne doit être publié.
        await new Promise((r) => setTimeout(r, 450));

        expect(useFinanceStore.getState().lastProjection).toBeNull();
        expect(useFinanceStore.getState().projectionStatus).toBe('idle');
    });

    it('EFFACE lastProjection si les prérequis redeviennent non remplis (ex. salaire supprimé)', async () => {
        const persona = getPersonaOrDefault(DEFAULT_PERSONA_ID);
        act(() => {
            useFinanceStore.getState().enableTestMode(persona.build(), persona.id);
            useFinanceStore.setState({ projectionRunMC: false, lastProjection: null, projectionStatus: 'idle' });
        });
        const { rerender } = render(<ProjectionEngine calculatedMonthlySavings={2000} />);
        await waitFor(() => expect(useFinanceStore.getState().lastProjection).not.toBeNull(), { timeout: 4000 });

        // On casse un prérequis (placements vidés) → le moteur doit remettre la source à null.
        act(() => { useFinanceStore.setState({ assets: [] }); });
        rerender(<ProjectionEngine calculatedMonthlySavings={2000} />);

        await waitFor(
            () => expect(useFinanceStore.getState().lastProjection).toBeNull(),
            { timeout: 2000 },
        );
    });
});
