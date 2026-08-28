// PH4-FUT-TEST — verrouille l'invariant « leviers-d'abord » du flux applyAndReveal :
// cliquer « Appliquer la stratégie gagnante » RÉVÈLE la courbe SANS flash et SANS état périmé.
//
// Invariant protégé (commenté dans FutureProjection.tsx) : handleApplyConfig fait 2 setAppState
// (projection + retirementGoal) BATCHÉS en 1 render (React 19) ; le flag revealAfterApply déclenche
// setRevealedSig(currentSig) au render SUIVANT, quand `params` reflète DÉJÀ les 2 mutations →
// currentSig recalculé UNE fois, COMPLET → revealedSig === currentSig → isStale FAUX.
// Si un de ces setters devenait async (mutations sur 2 renders), la révélation capturerait une
// signature PARTIELLE puis currentSig divergerait → écran « Paramètres modifiés » (isStale) :
// ce test échouerait. C'est exactement la régression qu'il garde.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react';
import { FutureProjection } from '../../components/FutureProjection';
import { useFinanceStore } from '../../store/useFinanceStore';
import { getPersonaOrDefault, DEFAULT_PERSONA_ID } from '../../services/testFixtures';

// Recharts → stubs inertes (jsdom n'a pas de layout SVG ; le rendu de la courbe ne nous intéresse pas).
vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, PieChart: P, BarChart: P, LineChart: P, AreaChart: P, ComposedChart: P,
        Pie: () => null, Bar: () => null, Area: () => null, Line: () => null, Cell: () => null,
        Legend: () => null, ReferenceLine: () => null, ReferenceArea: () => null, ReferenceDot: () => null,
        XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
    };
});
vi.mock('../../services/errorLogger', () => ({ logError: vi.fn(), logErrorThrottled: vi.fn() }));

// Stratégie « gagnante » qui change À LA FOIS projection (emergencyFundMonths, useSmithManoeuvre,
// appliedReturnProfile…) ET retirementGoal (targetAge, targetMonthlyIncome, + rrqStartAge/psvStartAge
// via delayPensions) → exerce vraiment le batching des 2 setters. vi.hoisted : disponible dans le
// factory de vi.mock (hoisté en tête de fichier).
const { WINNER } = vi.hoisted(() => ({
    WINNER: {
        withdrawalOrder: 'PRIO_CELI', delayPensions: true, retirementAge: 67, skipRap: true,
        contributionOrder: 'CELI_FIRST', retirementSpending: 1.1, smithManoeuvre: true,
        emergencyFundMonths: 9, assetLocation: true, gainHarvesting: true,
        returnRateProfile: 'aggressive', pensionSplitting: false, savingsMultiplier: 1.2, downsize: true,
    },
}));

// Optimiseur mocké : un seul bouton « Appliquer » qui appelle onApply(WINNER) (= applyAndReveal côté
// FutureProjection). StressTestPanel neutralisé (hors sujet, évite son câblage moteur).
vi.mock('../../components/projection/StrategyOptimizerPanel', () => ({
    StrategyOptimizerPanel: ({ onApply }: { onApply?: (c: unknown) => void }) =>
        onApply
            ? <button type="button" onClick={() => onApply(WINNER)}>Appliquer la stratégie (mock)</button>
            : <span>optimiseur en lecture seule</span>,
}));
vi.mock('../../components/projection/StressTestPanel', () => ({
    StressTestPanel: () => null,
}));

// Harness = mime App : props relus du store + setters câblés sur le store (sinon `params`, dérivé du
// store par useSimulationParams, ne bougerait pas et currentSig resterait figé).
function Harness() {
    const projection = useFinanceStore((s) => s.projection);
    const config = useFinanceStore((s) => s.config);
    const retirementGoal = useFinanceStore((s) => s.retirementGoal);
    const realEstateGoals = useFinanceStore((s) => s.realEstateGoals ?? []);
    const transactions = useFinanceStore((s) => s.transactions ?? []);
    const budgetItems = useFinanceStore((s) => s.budgetItems ?? []);
    const initialBalances = useFinanceStore((s) => s.initialBalances ?? {});
    return (
        <FutureProjection
            initialBalances={initialBalances}
            transactions={transactions}
            budgetItems={budgetItems}
            config={config}
            realEstateGoals={realEstateGoals}
            retirementGoal={retirementGoal}
            setRetirementGoal={(g) => act(() => { useFinanceStore.setState({ retirementGoal: g }); })}
            calculatedMonthlySavings={2000}
            projection={projection}
            setProjection={(p) => act(() => { useFinanceStore.setState({ projection: p }); })}
        />
    );
}

describe('FutureProjection — applyAndReveal (PH4-FUT-TEST)', () => {
    beforeEach(() => {
        const persona = getPersonaOrDefault(DEFAULT_PERSONA_ID);
        act(() => {
            useFinanceStore.getState().enableTestMode(persona.build(), persona.id);
            // runMC=false (déterministe) ; pas de courbe pré-révélée ni verrouillée → écran d'amorçage.
            // [PROJECTION-PERSIST] un résultat moteur DOIT être publié : depuis la garde no-fake-data
            // (`curveVisible` exige `results !== null`), une révélation SANS résultat n'affiche plus la
            // courbe (c'était le flash « Objectif FIRE 0k$ » corrigé) — ces tests vérifient le FLUX de
            // révélation, pas l'attente moteur → on publie un résultat minimal.
            useFinanceStore.setState({
                projectionRunMC: false, projectionStatus: 'idle',
                lastProjection: { chartData: [], fireNumber: 400_000, allResults: [] },
                isProjectionLocked: false, lockedProjection: null,
            });
        });
    });
    afterEach(() => cleanup());

    it('clic « Appliquer » → courbe révélée SANS flash ni état périmé (isStale faux)', async () => {
        render(<Harness />);

        // Départ : écran d'amorçage « leviers-d'abord » (jamais calculé → revealedSig null).
        expect(screen.getByText(/Compose tes leviers/i)).toBeInTheDocument();
        expect(screen.queryByText(/Ré-optimiser/i)).not.toBeInTheDocument();

        fireEvent.click(screen.getByText(/Appliquer la stratégie \(mock\)/i));

        // Après application : la courbe est RÉVÉLÉE (bouton « Ré-optimiser » présent, strip KPI affiché)
        // et l'amorçage a disparu. Surtout : AUCUN écran « Paramètres modifiés » (= isStale resté faux,
        // preuve que les 2 setAppState ont été vus dans la même signature).
        await waitFor(() => expect(screen.getByText(/Ré-optimiser/i)).toBeInTheDocument());
        expect(screen.queryByText(/Compose tes leviers/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Paramètres modifiés/i)).not.toBeInTheDocument();
        // Le strip KPI révélé (caché tant que la courbe n'est pas calculée).
        expect(screen.getAllByText(/Objectif FIRE/i).length).toBeGreaterThan(0);

        // Le geste a bien été propagé au store (preuve que setProjection/setRetirementGoal ont coulé) :
        const st = useFinanceStore.getState();
        expect(st.projection.emergencyFundMonths).toBe(9);
        expect(st.projection.appliedReturnProfile).toBe('aggressive');
        expect(st.retirementGoal.targetAge).toBe(67);
        // delayPensions=true → âges de rentes reportés (cohérent avec le levier delayPensions moteur).
        expect(st.retirementGoal.rrqStartAge).toBe(72);
        expect(st.retirementGoal.psvStartAge).toBe(70);
    });

    it('ré-optimiser ramène à l\'écran d\'amorçage (la courbe se re-cache sur demande)', async () => {
        render(<Harness />);
        fireEvent.click(screen.getByText(/Appliquer la stratégie \(mock\)/i));
        await waitFor(() => expect(screen.getByText(/Ré-optimiser/i)).toBeInTheDocument());

        fireEvent.click(screen.getByText(/Ré-optimiser/i));

        await waitFor(() => expect(screen.getByText(/Compose tes leviers/i)).toBeInTheDocument());
        expect(screen.queryByText(/Ré-optimiser/i)).not.toBeInTheDocument();
    });
});
