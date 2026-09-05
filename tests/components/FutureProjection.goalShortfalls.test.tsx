// tests/components/FutureProjection.goalShortfalls.test.tsx
// [ENG-GOALSHORTFALLS-EXPOSE] (décision Marc 2026-09-04) Le bandeau « objectif non financé »
// consomme enfin `goalShortfalls` — le champ que le moteur publiait depuis PV-11 sans lecteur.
// Harnais repris de FutureProjection.applyReveal.test.tsx (révélation par l'optimiseur mocké).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react';
import { FutureProjection } from '../../components/FutureProjection';
import { useFinanceStore } from '../../store/useFinanceStore';
import { getPersonaOrDefault, DEFAULT_PERSONA_ID } from '../../services/testFixtures';
import { formatCAD } from '../../utils/format';
import type { ProjectionResult } from '../../services/projection/types';

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

const { WINNER } = vi.hoisted(() => ({
    WINNER: {
        withdrawalOrder: 'PRIO_CELI', delayPensions: false, retirementAge: 65, skipRap: false,
        contributionOrder: 'CELI_FIRST', retirementSpending: 1, smithManoeuvre: false,
        emergencyFundMonths: 6, assetLocation: false, gainHarvesting: false,
        returnRateProfile: 'balanced', pensionSplitting: false, savingsMultiplier: 1, downsize: false,
    },
}));
vi.mock('../../components/projection/StrategyOptimizerPanel', () => ({
    StrategyOptimizerPanel: ({ onApply }: { onApply?: (c: unknown) => void }) =>
        onApply
            ? <button type="button" onClick={() => onApply(WINNER)}>Appliquer la stratégie (mock)</button>
            : <span>optimiseur en lecture seule</span>,
}));
vi.mock('../../components/projection/StressTestPanel', () => ({ StressTestPanel: () => null }));

function Harness() {
    const projection = useFinanceStore((s) => s.projection);
    const config = useFinanceStore((s) => s.config);
    const retirementGoal = useFinanceStore((s) => s.retirementGoal);
    return (
        <FutureProjection
            initialBalances={{}}
            transactions={[]}
            budgetItems={[]}
            config={config}
            realEstateGoals={[]}
            retirementGoal={retirementGoal}
            setRetirementGoal={(g) => act(() => { useFinanceStore.setState({ retirementGoal: g }); })}
            calculatedMonthlySavings={2000}
            projection={projection}
            setProjection={(p) => act(() => { useFinanceStore.setState({ projection: p }); })}
        />
    );
}

const scenarioAvec = (goalShortfalls: { count: number; total: number } | undefined) =>
    ({ strategyName: 'AUTO_MARGINAL', chartData: [], goalShortfalls } as unknown as ProjectionResult);

const monterAvecReveal = async (goalShortfalls: { count: number; total: number } | undefined) => {
    const persona = getPersonaOrDefault(DEFAULT_PERSONA_ID);
    act(() => {
        useFinanceStore.getState().enableTestMode(persona.build(), persona.id);
        useFinanceStore.setState({
            projectionRunMC: false, projectionStatus: 'idle',
            lastProjection: { chartData: [], fireNumber: 400_000, allResults: [scenarioAvec(goalShortfalls)] },
            isProjectionLocked: false, lockedProjection: null,
        });
    });
    render(<Harness />);
    fireEvent.click(screen.getByText(/Appliquer la stratégie \(mock\)/i));
    await waitFor(() => expect(screen.getByText(/Ré-optimiser/i)).toBeInTheDocument());
};

// `formatCAD` sépare par une insécable ; le normaliseur de testing-library transforme le DOM,
// jamais l'ATTENDU → on compose avec le formateur PUIS on normalise les espaces.
const montantAffiche = (n: number): string => formatCAD(n).replace(/\s/g, ' ');

describe('[ENG-GOALSHORTFALLS-EXPOSE] le bandeau des objectifs non financés', () => {
    beforeEach(() => { /* état posé par monterAvecReveal */ });
    afterEach(() => {
        act(() => { useFinanceStore.getState().setPrivacyMode(false); });
        cleanup();
    });

    it('objectifs manqués → le bandeau dit le fait ET le manque en dollars', async () => {
        await monterAvecReveal({ count: 2, total: 15_000 });
        expect(screen.getByText(/2 objectifs n'ont pas pu être financés en entier/)).toBeInTheDocument();
        expect(screen.getByText(montantAffiche(15_000))).toBeInTheDocument();
    });

    it('mode discret : le montant disparaît, le FAIT reste lisible', async () => {
        await monterAvecReveal({ count: 1, total: 9_000 });
        expect(screen.getByText(montantAffiche(9_000))).toBeInTheDocument();
        act(() => { useFinanceStore.getState().setPrivacyMode(true); });
        expect(screen.queryByText(montantAffiche(9_000))).not.toBeInTheDocument();
        expect(screen.getByText(/Un objectif n'a pas pu être financé en entier/)).toBeInTheDocument();
    });

    it('aucun manque (ou champ absent d\'un gel d\'avant PV-11) → AUCUN bandeau', async () => {
        await monterAvecReveal({ count: 0, total: 0 });
        expect(screen.queryByText(/pas pu être financé/)).not.toBeInTheDocument();
        cleanup();
        await monterAvecReveal(undefined);
        expect(screen.queryByText(/pas pu être financé/)).not.toBeInTheDocument();
    });
});
