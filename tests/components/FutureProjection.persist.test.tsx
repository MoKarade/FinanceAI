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
vi.mock('../../services/errorLogger', () => ({ logError: vi.fn(), logErrorThrottled: vi.fn() }));
// Store IDB mocké et OBSERVABLE (jsdom n'a pas d'indexedDB ; le round-trip IDB réel est prouvé à part
// dans tests/services/lockedProjectionStore.test.ts avec fake-indexeddb). Permet d'asserter les APPELS
// (ex. garde mode-test sur clearRevealedProjection). load → 'empty' = comportement jsdom d'origine.
const idbMocks = vi.hoisted(() => ({
    loadRevealed: vi.fn(async () => ({ status: 'empty' as const })),
    saveRevealed: vi.fn(async () => true),
    clearRevealed: vi.fn(async () => undefined),
}));
vi.mock('../../services/lockedProjectionStore', () => ({
    loadRevealedProjection: idbMocks.loadRevealed,
    saveRevealedProjection: idbMocks.saveRevealed,
    clearRevealedProjection: idbMocks.clearRevealed,
    saveLockedProjection: vi.fn(async () => true),
    loadLockedProjection: vi.fn(async () => ({ status: 'empty' as const })),
    clearLockedProjection: vi.fn(async () => undefined),
}));
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
        // Hors mode test : le gel IDB est bien purgé (voir aussi le test mode-test plus bas).
        expect(idbMocks.clearRevealed).toHaveBeenCalled();
    });

    it('[no-fake-data] reload AVANT publication moteur → « se recharge » (spinner), JAMAIS de KPIs à 0 $ ni d\'amorçage', async () => {
        // 1. Révèle (sig persistée).
        render(<Harness />);
        fireEvent.click(revealBtn());
        await waitFor(() => expect(screen.getByText(/La Courbe de Vie - STRAT-A/i)).toBeInTheDocument());
        cleanup();

        // 2. « Reload » : sig persistée MAIS le moteur n'a encore RIEN publié (lastProjection est hors
        // persist → null au boot ; ProjectionEngine mettra ~300 ms + calcul avant de publier).
        act(() => { useFinanceStore.setState({ lastProjection: null }); });
        render(<Harness />);

        // Discriminant (finding silent-failure BLOQUANT) : sans la garde `results !== null`, l'ancienne
        // version affichait le strip KPI avec « Objectif FIRE 0k $ » (fausse donnée) et un graphe vide.
        expect(screen.getByText(/Ta projection se recharge/i)).toBeInTheDocument();
        expect(screen.queryByText(/Objectif FIRE/i)).not.toBeInTheDocument();      // pas de KPIs à 0 $
        expect(screen.queryByText(/Compose tes leviers/i)).not.toBeInTheDocument(); // pas d'amorçage trompeur

        // 3. Le moteur publie → la courbe remplace le spinner, sans geste utilisateur.
        act(() => { useFinanceStore.setState({ lastProjection: RESULT_A }); });
        await waitFor(() => expect(screen.getByText(/La Courbe de Vie - STRAT-A/i)).toBeInTheDocument());
        expect(screen.queryByText(/se recharge/i)).not.toBeInTheDocument();
    });

    it('[a11y] montage déjà-révélé (reload) → le focus n\'est PAS volé ; révélation par CLIC → focus sur la courbe', async () => {
        // Montage avec sig persistée (posée par un cycle précédent) : pas de vol de focus.
        render(<Harness />);
        fireEvent.click(revealBtn());
        await waitFor(() => expect(screen.getByText(/La Courbe de Vie - STRAT-A/i)).toBeInTheDocument());
        cleanup();
        render(<Harness />); // remontage révélé d'emblée
        const region = () => screen.getByRole('region', { name: /Projection affichée/i });
        expect(region()).toBeInTheDocument();
        expect(document.activeElement).not.toBe(region()); // focus resté où il était (body)

        // Transition explicite (clic) : re-gate puis re-révèle → le focus DOIT aller sur la courbe.
        fireEvent.click(screen.getByText(/Ré-optimiser/i));
        await waitFor(() => expect(screen.getByText(/Compose tes leviers/i)).toBeInTheDocument());
        fireEvent.click(revealBtn());
        await waitFor(() => expect(document.activeElement).toBe(region()));
    });

    it('[mode test] « Rechoisir mes leviers » en persona NE supprime PAS le blob réel (garde clearRevealedProjection)', async () => {
        // Passe en mode test avec les mêmes données (persona) : révèle, puis re-gate.
        const data = getPersonaOrDefault(DEFAULT_PERSONA_ID);
        act(() => {
            useFinanceStore.getState().enableTestMode(data.build(), data.id);
            useFinanceStore.setState({ lastProjection: RESULT_A, projectionRunMC: false });
        });
        idbMocks.clearRevealed.mockClear();
        render(<Harness />);
        fireEvent.click(revealBtn());
        await waitFor(() => expect(screen.getByText(/Ré-optimiser/i)).toBeInTheDocument());

        fireEvent.click(screen.getByText(/Ré-optimiser/i)); // = regateToLevers

        await waitFor(() => expect(screen.getByText(/Compose tes leviers/i)).toBeInTheDocument());
        // Discriminant (finding silent-failure ÉLEVÉ) : sans la garde, le blob RÉEL était supprimé
        // silencieusement depuis une démo persona (record IDB partagé réel/test).
        expect(idbMocks.clearRevealed).not.toHaveBeenCalled();
        act(() => { useFinanceStore.getState().disableTestMode(); });
    });
});
