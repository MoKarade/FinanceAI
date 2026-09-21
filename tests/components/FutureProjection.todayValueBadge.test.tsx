/**
 * [FUTUR-AXE-Y-MINIMAL] Le badge flottant « Aujourd'hui » (TodayValueBadge, sur le graphe Futur)
 * n'était exercé par AUCUN test avant ce lot (revue panel code-reviewer, 2026-09-21) : tous les
 * fichiers qui montent `FutureProjection` mockent `ReferenceDot: () => null`, donc son garde
 * no-fake-data interne et son câblage n'étaient vérifiés par rien.
 *
 * ⚠️ `pointAncre` (la valeur affichée) vient de `displayData`, qui PRÉFIXE `chartData` avec
 * `pastPrefixPoints` — reconstruit par `buildPastPrefix` depuis les VRAIES transactions du
 * persona chargé (`enableTestMode`), pas depuis la prop `transactions` du Harness. Injecter un
 * `chartData` synthétique à `monthIndex: 0` ne contrôle donc PAS la valeur réellement affichée
 * (mesuré : la vraie reconstruction du persona l'emporte) — les deux premiers tests capturent
 * la valeur RÉELLE plutôt que d'en imposer une fausse, et vérifient sa cohérence/son masquage.
 * Le garde no-fake-data lui-même (entrée non finie → aucun rendu) est testé directement sur le
 * composant `TodayValueBadge`, isolé de ce pipeline.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react';
import { FutureProjection } from '../../components/FutureProjection';
import { TodayValueBadge } from '../../components/projection/ProjectionTooltip';
import { useFinanceStore } from '../../store/useFinanceStore';
import { getPersonaOrDefault, DEFAULT_PERSONA_ID } from '../../services/testFixtures';

/** Valeurs capturées à la frontière recharts, pour le SEUL ReferenceDot qui porte le badge (celui
 *  dont `shape.props.value` est défini — les pastilles d'événement portent `payload`/`kind`, pas
 *  `value`, donc les deux formes ne se confondent jamais). */
let badgeValues: Array<string | undefined>;

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, PieChart: P, BarChart: P, LineChart: P, AreaChart: P, ComposedChart: P,
        Pie: () => null, Bar: () => null, Area: () => null, Line: () => null, Cell: () => null,
        Legend: () => null, ReferenceLine: () => null, ReferenceArea: () => null,
        ReferenceDot: (props: { shape?: { props?: { value?: string } } }) => {
            const v = props.shape?.props?.value;
            if (v !== undefined) badgeValues.push(v);
            return null;
        },
        XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
    };
});
vi.mock('../../services/errorLogger', () => ({ logError: vi.fn(), logErrorThrottled: vi.fn() }));
vi.mock('../../components/projection/StrategyOptimizerPanel', () => ({
    StrategyOptimizerPanel: ({ onApply }: { onApply?: (c: unknown) => void }) =>
        onApply ? <button type="button" onClick={() => onApply({})}>Appliquer (mock)</button> : null,
}));
vi.mock('../../components/projection/StressTestPanel', () => ({ StressTestPanel: () => null }));

function chartDataMinimale() {
    return [
        { monthIndex: 0, year: 2026, age: 35, dateLabel: 'mois 0', NetWorth: 253_417, lifeEvents: [], flowEvents: [] },
        { monthIndex: 12, year: 2027, age: 36, dateLabel: 'mois 12', NetWorth: 300_000, lifeEvents: [], flowEvents: [] },
    ];
}

function Harness() {
    const projection = useFinanceStore((s) => s.projection);
    const config = useFinanceStore((s) => s.config);
    const retirementGoal = useFinanceStore((s) => s.retirementGoal);
    // ⚠️ `isPrivacyMode` est un PROP de `FutureProjection` (défaut `false`), PAS lu directement du
    // store à l'intérieur du composant — l'oublier ici aurait rendu le 2e test vacueux (toujours
    // en clair, quel que soit le store).
    const isPrivacyMode = useFinanceStore((s) => s.isPrivacyMode);
    return (
        <FutureProjection
            initialBalances={useFinanceStore.getState().initialBalances ?? {}}
            transactions={[]} budgetItems={[]} config={config} realEstateGoals={[]}
            retirementGoal={retirementGoal}
            setRetirementGoal={(g) => act(() => { useFinanceStore.setState({ retirementGoal: g }); })}
            calculatedMonthlySavings={2000}
            projection={projection}
            setProjection={(p) => act(() => { useFinanceStore.setState({ projection: p }); })}
            isPrivacyMode={isPrivacyMode}
        />
    );
}

async function afficherEtCapturer(isPrivacyMode: boolean) {
    badgeValues = [];
    const persona = getPersonaOrDefault(DEFAULT_PERSONA_ID);
    act(() => {
        useFinanceStore.getState().enableTestMode(persona.build(), persona.id);
        useFinanceStore.setState({
            projectionRunMC: false, projectionStatus: 'idle',
            lastProjection: { chartData: chartDataMinimale(), fireNumber: 400_000, allResults: [] } as never,
            isProjectionLocked: false, lockedProjection: null,
            isPrivacyMode,
        });
    });
    render(<Harness />);
    fireEvent.click(screen.getByText(/Appliquer \(mock\)/i));
    await waitFor(() => expect(screen.getByText(/Ré-optimiser/i)).toBeInTheDocument());
    return badgeValues;
}

describe('[FUTUR-AXE-Y-MINIMAL] badge flottant « Aujourd\'hui »', () => {
    afterEach(() => cleanup());

    it('affiche une valeur RÉELLE (jamais "NaN", jamais un tiret « — » qui flotterait sans repère)', async () => {
        const valeurs = await afficherEtCapturer(false);
        // Anti-vacuité : le badge est bien apparu (le mock ne l'a pas raté en silence).
        expect(valeurs.length).toBeGreaterThan(0);
        for (const v of valeurs) {
            expect(v).not.toMatch(/NaN|undefined/);
            expect(v).not.toBe('—');
            // Format compact attendu : un nombre suivi de « k$ » ou « M$ » (formatCompactCAD).
            expect(v).toMatch(/^\d[\d\s]*\s?(k\$|M\$)$/);
        }
    });

    it('masque la valeur en mode discret (source unique maskedTick, jamais un « *** » recopié)', async () => {
        const valeurs = await afficherEtCapturer(true);
        expect(valeurs.length).toBeGreaterThan(0);
        expect(valeurs).toContain('***');
        // Aucune valeur en clair ne doit fuiter à côté du masquage.
        for (const v of valeurs) expect(v).toBe('***');
    });
});

describe('[FUTUR-AXE-Y-MINIMAL] TodayValueBadge — no-fake-data en isolation', () => {
    afterEach(() => cleanup());

    it('ne rend RIEN quand cx/cy ne sont pas finis (NaN, undefined) ou value est vide', () => {
        const cas: Array<{ cx?: number; cy?: number; value?: string }> = [
            { cx: NaN, cy: 100, value: '127 k$' },
            { cx: 50, cy: NaN, value: '127 k$' },
            { cx: 50, cy: 100, value: undefined },
            { cx: 50, cy: 100, value: '' },
            { cx: undefined, cy: 100, value: '127 k$' },
        ];
        for (const props of cas) {
            const { container, unmount } = render(<svg><TodayValueBadge {...props} /></svg>);
            expect(container.querySelector('text'), JSON.stringify(props)).toBeNull();
            unmount();
        }
    });

    it('rend la pastille avec le texte exact quand cx/cy/value sont valides', () => {
        const { container } = render(<svg><TodayValueBadge cx={50} cy={100} value="127 k$" /></svg>);
        expect(container.querySelector('text')?.textContent).toBe('127 k$');
    });
});
