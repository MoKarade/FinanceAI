// [FUTUR-PAST-DEBT-FREEZE 2026-07-29] — demande Marc : « le passé doit être exactement ce que
// c'était à cette date », même quand le FUTUR affiché est gelé (PROJECTION-PERSIST, badge « Pas à
// jour »). Un audit lecture seule avait trouvé que la dette soustraite du segment PASSÉ était
// dérivée de `chartData[0]` — qui peut être le blob FIGÉ — au lieu de `liveResults` (toujours frais).
//
// ⚠️ [PASSE-REEL-DETTE-1, 2026-08-21] Ce mécanisme de repli (`chartData` vs `liveResults`) reste
// INCHANGÉ par ce lot : `currentDebtNonImmo` (le total « aujourd'hui ») vient toujours de
// `chartData[0].DettesNonImmo`/`liveResults`, jamais du store `debts` directement — les deux tests
// ci-dessous restent donc valides tels quels. ⚠️ Ce que `[PASSE-REEL-DETTE-1]` AJOUTE est un mécanisme
// SÉPARÉ : `buildPastPrefix`/`buildDailyPastLedger` retranchent de ce total le solde des dettes du
// store `debts` qui ne sont PAS ENCORE COMMENCÉES à un mois passé donné (`sumNotYetStartedDebtsAt
// Month`/`...AtAbsoluteMonth`, gaté par `startDate`) — jamais une resommation complète (qui
// diverge du total exact du moteur, cf `debtSchedule.ts`). Le 3e test ci-dessous prouve ce
// mécanisme de gating, distinct du mécanisme figé/frais des deux premiers.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { FutureProjection } from '../../components/FutureProjection';
import { useFinanceStore } from '../../store/useFinanceStore';
import { getPersonaOrDefault, DEFAULT_PERSONA_ID } from '../../services/testFixtures';
import type { ProjectionResult, ProjectionChartPoint } from '../../services/projection/types';
import type { LoadLockedResult } from '../../services/lockedProjectionStore';
import type { Transaction } from '../../types';

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
const idbMocks = vi.hoisted(() => ({
    loadRevealed: vi.fn<() => Promise<LoadLockedResult>>(async () => ({ status: 'empty' as const })),
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
vi.mock('../../components/projection/StrategyOptimizerPanel', () => ({
    StrategyOptimizerPanel: () => <span>optimiseur (mock)</span>,
}));
vi.mock('../../components/projection/StressTestPanel', () => ({ StressTestPanel: () => null }));

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

/** Une seule transaction connue, datée 2 mois avant AUJOURD'HUI → `pastPrefix` non-vide, déterministe
 *  (cash walk-back sans aucun actif/immo — CELI/REER/Immobilier restent à 0, seul cash±dette varie). */
function pastTransaction(): Transaction {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 2, 15);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
    return { id: 1, date: iso, payee: 'Dépôt initial', amount: 200_000, category: 'Revenus divers', status: 'processed' };
}

function resultWithDebt(strategyName: string, debtNonImmo: number): ProjectionResult {
    const chartData = [{ monthIndex: 0, DettesNonImmo: debtNonImmo } as unknown as ProjectionChartPoint];
    return { chartData, fireNumber: 500_000, allResults: [{ chartData, fireNumber: 500_000, allResults: [], strategyName } as unknown as ProjectionResult] };
}

describe('FutureProjection — segment PASSÉ reste réel même quand le FUTUR est gelé (FUTUR-PAST-DEBT-FREEZE)', () => {
    beforeEach(() => {
        const data = getPersonaOrDefault(DEFAULT_PERSONA_ID).build();
        act(() => {
            useFinanceStore.setState({
                ...data,
                // Isolation : SEULS cash + dette influencent le NetWorth passé mesuré ici.
                assets: [], realEstateGoals: [], transactions: [pastTransaction()], debts: [],
                isTestMode: false, activeTestPersonaId: null, realDataSnapshot: null,
                projectionRunMC: false, lastProjection: resultWithDebt('STRAT-A', 0), projectionStatus: 'idle',
                isProjectionLocked: false, lockedProjection: null,
                revealedProjectionSig: null,
            });
        });
    });
    afterEach(() => cleanup());

    it('gelé (badge « Pas à jour ») + dette LIVE augmentée → le NetWorth du passé BAISSE, pas figé à l\'ancienne dette', async () => {
        render(<Harness />);
        fireEvent.click(revealBtn());
        await waitFor(() => expect(screen.getByText(/La Courbe de Vie - STRAT-A/i)).toBeInTheDocument());

        const netWorthCell = () => {
            const table = document.querySelector('table.sr-only') as HTMLTableElement;
            const firstDataRow = within(table).getAllByRole('row')[1]; // ligne 0 = en-têtes
            // 1re colonne (Date) = <th scope="row"> → role rowheader ; les suivantes = <td> → role cell.
            return within(firstDataRow).getAllByRole('rowheader').concat(within(firstDataRow).getAllByRole('cell'));
        };
        // Colonnes : [Date(th), Valeur nette(td), Cash(td), CELI…]. On lit la cellule "Valeur nette".
        const netWorthBefore = netWorthCell()[1].textContent;
        expect(netWorthBefore).toBeTruthy();
        expect(netWorthBefore).not.toMatch(/^—$/); // hasNW=true dès la 1re transaction connue

        // Le futur devient PÉRIMÉ (paramètre changé) ET le moteur LIVE republie avec une dette
        // ÉNORME (+10 M$) — simule "Marc vient d'ajouter une grosse dette" pendant que le futur reste figé.
        act(() => {
            const proj = useFinanceStore.getState().projection;
            useFinanceStore.setState({
                projection: { ...proj, years: (proj.years || 30) + 7 },
                lastProjection: resultWithDebt('STRAT-B', 10_000_000),
            });
        });
        expect(screen.getByText(/Pas à jour/i)).toBeInTheDocument();          // futur bien gelé
        expect(screen.getByText(/La Courbe de Vie - STRAT-A/i)).toBeInTheDocument(); // courbe FUTURE figée (STRAT-A)

        // Discriminant : sur l'ANCIEN code, currentDebtNonImmo venait de `results` (figé sur STRAT-A,
        // dette=0) → le NetWorth du passé resterait IDENTIQUE à avant. Avec le FIX (lu depuis
        // `liveResults`, jamais figé), le NetWorth du passé DOIT chuter d'environ 10 M$.
        const netWorthAfter = netWorthCell()[1].textContent;
        expect(netWorthAfter).not.toBe(netWorthBefore);
        expect(netWorthAfter).toMatch(/-\s?\d/); // devenu franchement négatif (dette de 10 M$ >> cash de 200k$)
    });

    // [finding financial-integrity + projection-validator, PR #531, MESURÉ] Fenêtre boot/reload :
    // `lastProjection` est EXCLU de la persistance (partialize) → `null` tant que ProjectionEngine n'a
    // pas recalculé (~300 ms+), alors que le blob figé restauré depuis IDB affiche DÉJÀ une courbe
    // (`revealedProjectionSig` persisté, `loadRevealedProjection` résout typiquement plus vite). Sans
    // repli, `currentDebtNonImmo` retombait à 0 dans cette fenêtre → passé gonflé de TOUTE la dette
    // (régression MONEY-PHANTOM que ce fix ferme par ailleurs). Le repli doit utiliser la dette de la
    // courbe RÉELLEMENT affichée (le blob figé), jamais 0.
    it('remontage AVANT publication moteur (lastProjection null) + blob figé dispo → dette du blob figé soustraite, PAS 0', async () => {
        const frozen = resultWithDebt('STRAT-FROZEN', 50_000);
        idbMocks.loadRevealed.mockResolvedValueOnce({ status: 'ok' as const, result: frozen });

        // Signature PÉRIMÉE d'emblée (remontage avec des paramètres qui ont changé depuis la révélation)
        // ET aucun résultat LIVE encore publié par le moteur — exactement la fenêtre de course du boot.
        act(() => {
            useFinanceStore.setState({
                revealedProjectionSig: 'sig-perimee-depuis-remontage',
                lastProjection: null,
            });
        });

        render(<Harness />);
        // Le blob figé (restauré depuis l'IDB mocké) doit s'afficher — la garde `results !== null`
        // couvre cette branche (curveRestoring seulement si AUCUN résultat, ni live ni figé).
        await waitFor(() => expect(screen.getByText(/La Courbe de Vie - STRAT-FROZEN/i)).toBeInTheDocument());
        expect(screen.getByText(/Pas à jour/i)).toBeInTheDocument();

        const table = document.querySelector('table.sr-only') as HTMLTableElement;
        const firstDataRow = within(table).getAllByRole('row')[1];
        const netWorthCell = within(firstDataRow).getAllByRole('rowheader').concat(within(firstDataRow).getAllByRole('cell'))[1];
        // Discriminant : sans repli (ancien comportement de cette fenêtre précise), la dette serait 0 →
        // NetWorth = seulement le cash (271 k$, positif). Avec le repli sur le blob figé (50 000 $ de
        // dette), le NetWorth doit être ce cash MOINS cette dette — donc strictement plus bas.
        expect(netWorthCell.textContent).not.toMatch(/^271\s?k\$/);
    });

    it('[PASSE-REEL-DETTE-1] une dette PAS ENCORE COMMENCÉE au mois du 1er point passé n\'est PAS soustraite, malgré un total « aujourd\'hui » qui l\'inclut', async () => {
        // Une SEULE transaction connue (comme les 2 tests précédents), 2 mois avant aujourd'hui →
        // deux points passés reconstruits : mi=-2 et mi=-1 (cf `pastTransaction`, firstTxnMi=-2).
        const now = new Date();
        // Dette qui commence 1 mois avant aujourd'hui : le point à -2 mois est AVANT son début, le
        // point à -1 mois est APRÈS — mais `currentDebtNonImmo` (le total « aujourd'hui », comme le
        // publierait le VRAI moteur pour une dette déjà commencée) l'inclut déjà entièrement.
        const debut = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const isoDebut = `${debut.getFullYear()}-${String(debut.getMonth() + 1).padStart(2, '0')}-01`;
        const dateLabelMoins2 = (() => {
            const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        })();
        const dateLabelMoins1 = `${debut.getFullYear()}-${String(debut.getMonth() + 1).padStart(2, '0')}`;

        act(() => {
            useFinanceStore.setState({
                debts: [{ id: 'd1', name: 'Prêt récent', balance: 30_000, interestRate: 0, minimumPayment: 0, category: 'Other', startDate: isoDebut }],
                lastProjection: resultWithDebt('STRAT-GATING', 30_000), // le moteur inclut la dette (déjà active aujourd'hui)
            });
        });
        render(<Harness />);
        fireEvent.click(revealBtn());
        await waitFor(() => expect(screen.getByText(/La Courbe de Vie - STRAT-GATING/i)).toBeInTheDocument());

        const table = document.querySelector('table.sr-only') as HTMLTableElement;
        // Recherche par LIBELLÉ DE DATE (colonne "Date", `dateLabel` = `YYYY-MM`), jamais par position :
        // le nombre de lignes dépend de la reconstruction du cash, pas d'une position fixe supposée.
        const rowOf = (dateLabel: string): HTMLElement => {
            const header = within(table).getByRole('rowheader', { name: dateLabel });
            return header.closest('tr') as HTMLElement;
        };
        const netWorthOf = (row: HTMLElement) =>
            within(row).getAllByRole('rowheader').concat(within(row).getAllByRole('cell'))[1].textContent;

        const avantDebut = netWorthOf(rowOf(dateLabelMoins2));
        const apresDebut = netWorthOf(rowOf(dateLabelMoins1));
        // Discriminant : sur l'ANCIEN code (currentDebtNonImmo appliqué à TOUT le passé), les deux
        // points auraient soustrait 30 000 $ de la même façon (identiques, aucune transaction entre les
        // deux). Avec le gating, le point AVANT le début de la dette doit être ~30 000 $ PLUS HAUT.
        expect(avantDebut).not.toBe(apresDebut);
        expect(avantDebut).not.toMatch(/-\s?\d/); // positif : pas de dette avant son début
    });
});
