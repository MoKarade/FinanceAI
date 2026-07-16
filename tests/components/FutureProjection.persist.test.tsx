// [PROJECTION-PERSIST 2026-07-16] — verrouille la demande Marc : « quand j'ai généré une projection,
// je ne veux pas avoir à la regénérer — elle reste peu importe si je reload ou si je change de page ;
// si mes paramètres changent, un indicateur "pas à jour" + un bouton (recharger / rechoisir) ».
//
// Discriminants (échouent sur l'ANCIEN code) :
//  1. revealedSig était un useState LOCAL → un remontage (reload/changement de page) re-affichait
//     l'écran d'amorçage. Désormais : signature PERSISTÉE (store) → la courbe reste.
//  2. entrées modifiées → l'ancien code re-affichait l'écran plein « Paramètres modifiés » (courbe
//     cachée). Désormais : la courbe FIGÉE reste affichée (titre STRAT-A, pas STRAT-B live) + badge
//     « Pas à jour » + 2 boutons.
//
// HORS mode test exprès : en mode test le gel est désactivé (le blob figé porte les VRAIES données).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { FutureProjection } from '../../components/FutureProjection';
import { useFinanceStore } from '../../store/useFinanceStore';
import { getPersonaOrDefault, DEFAULT_PERSONA_ID } from '../../services/testFixtures';
import type { ProjectionResult } from '../../services/projection/types';

// Recharts → stubs inertes (jsdom n'a pas de layout SVG).
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
vi.mock('../../services/errorLogger', () => ({ logError: vi.fn() }));
// Optimiseur/stress neutralisés (hors sujet ici — on teste le gating/gel, pas la recherche).
vi.mock('../../components/projection/StrategyOptimizerPanel', () => ({
    StrategyOptimizerPanel: () => <span>optimiseur (mock)</span>,
}));
vi.mock('../../components/projection/StressTestPanel', () => ({
    StressTestPanel: () => null,
}));

// Résultats moteur discriminables par le TITRE de la carte (« La Courbe de Vie - <strategyName> »).
const RESULT_A: ProjectionResult = { chartData: [], fireNumber: 500_000, allResults: [{ chartData: [], fireNumber: 500_000, allResults: [], strategyName: 'STRAT-A' } as unknown as ProjectionResult] };
const RESULT_B: ProjectionResult = { chartData: [], fireNumber: 500_000, allResults: [{ chartData: [], fireNumber: 500_000, allResults: [], strategyName: 'STRAT-B' } as unknown as ProjectionResult] };

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

const revealBtn = () => screen.getByText(/vois directement ta projection actuelle/i);

describe('FutureProjection — persistance de la révélation + gel « pas à jour » (PROJECTION-PERSIST)', () => {
    beforeEach(() => {
        const data = getPersonaOrDefault(DEFAULT_PERSONA_ID).build();
        act(() => {
            // Données réalistes SANS mode test (le gel est coupé en mode test, par design).
            useFinanceStore.setState({
                ...data,
                isTestMode: false, activeTestPersonaId: null, realDataSnapshot: null,
                projectionRunMC: false, lastProjection: RESULT_A, projectionStatus: 'idle',
                isProjectionLocked: false, lockedProjection: null,
                revealedProjectionSig: null,
            });
        });
    });
    afterEach(() => cleanup());

    it('la révélation SURVIT au remontage (reload / changement de page simulé)', async () => {
        render(<Harness />);
        expect(screen.getByText(/Compose tes leviers/i)).toBeInTheDocument(); // jamais calculé → gate

        fireEvent.click(revealBtn());
        await waitFor(() => expect(screen.getByText(/La Courbe de Vie - STRAT-A/i)).toBeInTheDocument());
        expect(useFinanceStore.getState().revealedProjectionSig).not.toBeNull(); // signature PERSISTÉE

        cleanup();
        render(<Harness />); // « reload » : nouveau montage, store persistant intact

        // Discriminant : sur l'ancien code (useState local), ce remontage ré-affichait le gate.
        expect(screen.getByText(/La Courbe de Vie - STRAT-A/i)).toBeInTheDocument();
        expect(screen.queryByText(/Compose tes leviers/i)).not.toBeInTheDocument();
    });

    it('entrées modifiées → courbe FIGÉE (STRAT-A) + badge « Pas à jour », PAS l\'écran d\'amorçage', async () => {
        render(<Harness />);
        fireEvent.click(revealBtn());
        await waitFor(() => expect(screen.getByText(/La Courbe de Vie - STRAT-A/i)).toBeInTheDocument());

        // Un paramètre change (horizon) ET le moteur publie un NOUVEAU résultat (STRAT-B).
        act(() => {
            const proj = useFinanceStore.getState().projection;
            useFinanceStore.setState({ projection: { ...proj, years: (proj.years || 30) + 7 }, lastProjection: RESULT_B });
        });

        // Discriminant : l'ancien code cachait la courbe (écran plein « Paramètres modifiés »).
        // Désormais : la courbe reste, FIGÉE au dernier calcul (STRAT-A, pas le STRAT-B live), badge + boutons.
        expect(screen.getByText(/Pas à jour/i)).toBeInTheDocument();
        expect(screen.getByText(/La Courbe de Vie - STRAT-A/i)).toBeInTheDocument();
        expect(screen.queryByText(/La Courbe de Vie - STRAT-B/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Compose tes leviers/i)).not.toBeInTheDocument();
    });

    it('« Recharger avec mes données » (badge) → courbe LIVE fraîche (STRAT-B), badge disparu', async () => {
        render(<Harness />);
        fireEvent.click(revealBtn());
        await waitFor(() => expect(screen.getByText(/La Courbe de Vie - STRAT-A/i)).toBeInTheDocument());
        act(() => {
            const proj = useFinanceStore.getState().projection;
            useFinanceStore.setState({ projection: { ...proj, years: (proj.years || 30) + 7 }, lastProjection: RESULT_B });
        });
        expect(screen.getByText(/Pas à jour/i)).toBeInTheDocument();

        fireEvent.click(screen.getByText(/Recharger avec mes données/i));

        await waitFor(() => expect(screen.getByText(/La Courbe de Vie - STRAT-B/i)).toBeInTheDocument());
        expect(screen.queryByText(/Pas à jour/i)).not.toBeInTheDocument();
    });

    it('« Rechoisir mes leviers » (badge) → retour à l\'écran d\'amorçage, signature effacée', async () => {
        render(<Harness />);
        fireEvent.click(revealBtn());
        await waitFor(() => expect(screen.getByText(/La Courbe de Vie - STRAT-A/i)).toBeInTheDocument());
        act(() => {
            const proj = useFinanceStore.getState().projection;
            useFinanceStore.setState({ projection: { ...proj, years: (proj.years || 30) + 7 }, lastProjection: RESULT_B });
        });

        fireEvent.click(screen.getByText(/Rechoisir mes leviers/i));

        await waitFor(() => expect(screen.getByText(/Compose tes leviers/i)).toBeInTheDocument());
        expect(useFinanceStore.getState().revealedProjectionSig).toBeNull();
    });
});
