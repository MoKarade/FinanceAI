/**
 * [FUTUR-DAILY-STACK-X] Le rang d'empilement des pastilles décrit ce qui est À L'ÉCRAN.
 *
 * Ce test OBSERVE le vrai pipeline du composant (construction des événements → filtre de fenêtre →
 * écrêtage `sampleEvenly` → `ReferenceDot`) en capturant les `payload` que le graphe reçoit
 * réellement. Il ne reconstruit AUCUN de ces calculs : reproduire la chaîne testerait sa copie.
 *
 * Défaut gardé (MESURÉ avant correction) : le rang était attribué en amont, sur la liste COMPLÈTE,
 * donc AVANT l'écrêtage à 24 pastilles « vie ». Un mois portant plusieurs événements dont
 * l'échantillonnage ne garde pas le premier laissait une pastille au rang 1 ou 2 — dessinée à 44 ou
 * 68 px de la courbe, au bout d'une longue tige, avec un ou deux étages VIDES en dessous.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react';
import { FutureProjection } from '../../components/FutureProjection';
import { useFinanceStore } from '../../store/useFinanceStore';
import { getPersonaOrDefault, DEFAULT_PERSONA_ID } from '../../services/testFixtures';

/** Payloads capturés à la frontière recharts : c'est EXACTEMENT ce que le graphe dessine. */
const capturés: Array<{ monthIndex: number; subIdx: number; label: string }> = [];

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, PieChart: P, BarChart: P, LineChart: P, AreaChart: P, ComposedChart: P,
        Pie: () => null, Bar: () => null, Area: () => null, Line: () => null, Cell: () => null,
        Legend: () => null, ReferenceLine: () => null, ReferenceArea: () => null,
        ReferenceDot: (props: { shape?: { props?: { payload?: { monthIndex: number; subIdx: number; label: string }; kind?: string } } }) => {
            const p = props.shape?.props?.payload;
            if (p && props.shape?.props?.kind === 'life') capturés.push({ monthIndex: p.monthIndex, subIdx: p.subIdx, label: p.label });
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

/**
 * Fixture DIMENSIONNANTE : 60 mois, et surtout DES MOIS À PLUSIEURS ÉVÉNEMENTS. Sans dépassement du
 * cap (24 pastilles « vie »), l'écrêtage ne mord pas et le défaut est strictement invisible — la
 * fixture doit donc en produire nettement plus, ce que le test ASSERTE avant de conclure.
 */
const MOIS = 60;
function chartDataDense() {
    const pts = [];
    for (let m = 0; m < MOIS; m++) {
        // Un événement chaque mois, TROIS certains mois : c'est la multiplicité qui crée des rangs.
        const lifeEvents = [`Événement A ${m}`];
        if (m % 5 === 0) lifeEvents.push(`Événement B ${m}`, `Événement C ${m}`);
        // Un événement ÉPINGLÉ (jamais écrêté, cf. `pinned`) posé sur un mois qui en porte déjà :
        // c'est le seul cas où DEUX pastilles survivent au même mois — donc le seul qui puisse
        // exercer un rang > 0 après correction. Sans lui, « tous les rangs valent 0 » serait vrai
        // par construction et l'assertion de contiguïté ne garderait rien.
        if (m === 20) lifeEvents.push('Objectif FIRE Atteint 🔥');
        pts.push({
            monthIndex: m, year: 2026 + Math.floor(m / 12), age: 35 + Math.floor(m / 12),
            dateLabel: `mois ${m}`, NetWorth: 100_000 + m * 1_000,
            lifeEvents, flowEvents: [],
        });
    }
    return pts;
}

function Harness() {
    const projection = useFinanceStore((s) => s.projection);
    const config = useFinanceStore((s) => s.config);
    const retirementGoal = useFinanceStore((s) => s.retirementGoal);
    return (
        <FutureProjection
            initialBalances={useFinanceStore.getState().initialBalances ?? {}}
            transactions={[]} budgetItems={[]} config={config} realEstateGoals={[]}
            retirementGoal={retirementGoal}
            setRetirementGoal={(g) => act(() => { useFinanceStore.setState({ retirementGoal: g }); })}
            calculatedMonthlySavings={2000}
            projection={projection}
            setProjection={(p) => act(() => { useFinanceStore.setState({ projection: p }); })}
        />
    );
}

async function pastillesVieAffichées() {
    capturés.length = 0;
    render(<Harness />);
    fireEvent.click(screen.getByText(/Appliquer \(mock\)/i));
    await waitFor(() => expect(screen.getByText(/Ré-optimiser/i)).toBeInTheDocument());
    await waitFor(() => expect(capturés.length).toBeGreaterThan(0));
    return [...capturés];
}

describe('[FUTUR-DAILY-STACK-X] rang d\'empilement des pastilles', () => {
    beforeEach(() => {
        const persona = getPersonaOrDefault(DEFAULT_PERSONA_ID);
        act(() => {
            useFinanceStore.getState().enableTestMode(persona.build(), persona.id);
            useFinanceStore.setState({
                projectionRunMC: false, projectionStatus: 'idle',
                lastProjection: { chartData: chartDataDense(), fireNumber: 400_000, allResults: [] } as never,
                isProjectionLocked: false, lockedProjection: null,
            });
        });
    });
    afterEach(() => cleanup());

    it('l\'écrêtage MORD vraiment sur cette fixture (sinon le test ne prouve rien)', async () => {
        const vues = await pastillesVieAffichées();
        // Anti-vacuité : la fixture produit bien plus d'événements que le cap, donc `sampleEvenly`
        // en jette — c'est la condition SANS LAQUELLE le rang périmé ne peut pas exister.
        const produits = chartDataDense().reduce((n, p) => n + p.lifeEvents.length, 0);
        expect(produits).toBeGreaterThan(vues.length);
        expect(vues.length).toBeGreaterThan(5);
    });

    it('chaque mois montré commence au rang 0 et n\'a aucun étage vide', async () => {
        const vues = await pastillesVieAffichées();
        const parMois = new Map<number, number[]>();
        for (const v of vues) parMois.set(v.monthIndex, [...(parMois.get(v.monthIndex) ?? []), v.subIdx]);

        for (const [mois, rangs] of parMois) {
            const triés = [...rangs].sort((a, b) => a - b);
            // Rangs CONTIGUS depuis 0 : 0 · 0,1 · 0,1,2 — jamais « 2 » tout seul, jamais « 0,2 ».
            expect(triés, `mois ${mois}`).toEqual(triés.map((_, i) => i));
        }
        // Anti-vacuité de l'assertion elle-même : au moins un mois porte VRAIMENT deux pastilles,
        // sinon « tous les rangs valent 0 » serait trivialement vrai et ne garderait rien.
        expect(Math.max(...[...parMois.values()].map((r) => r.length))).toBeGreaterThan(1);
    });
});
