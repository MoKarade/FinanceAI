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

// ─────────────────────────────────────────────────────────────────────────────
// [ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] Le refus d'une entrée illisible.
//
// ⚠️ Ce bloc teste le comportement que la garde d'entrée EXISTE pour produire, et qu'aucun test de
// `verifierEntreesMoteur` ne peut prouver : le moteur ne calcule pas, ET la projection déjà publiée
// est EFFACÉE. Le second point est le plus important — sans lui, une courbe calculée avant que la
// donnée ne devienne illisible resterait la source unique de tous les écrans, sans rien pour dire
// qu'elle est périmée.
describe('ProjectionEngine — entrée illisible à la frontière (ENG-INFINITY)', () => {
    afterEach(() => cleanup());

    const monterAvecPersona = (corrompre?: (etat: Record<string, unknown>) => void) => {
        const persona = getPersonaOrDefault(DEFAULT_PERSONA_ID);
        const etat = persona.build() as Record<string, unknown>;
        corrompre?.(etat);
        act(() => {
            useFinanceStore.getState().enableTestMode(etat as never, persona.id);
            useFinanceStore.setState({ projectionRunMC: false, lastProjection: null, projectionStatus: 'idle' });
        });
        return render(<ProjectionEngine calculatedMonthlySavings={2000} />);
    };

    const corrompreLeNet = (valeur: number) => (etat: Record<string, unknown>) => {
        const config = etat.config as { users: Array<Record<string, unknown>> };
        config.users[0].netSalary = valeur;
    };

    it('ne publie AUCUNE projection quand le salaire net est NaN — le mode absorbé', async () => {
        // C'est le cas dangereux : sans garde, la projection se calcule sans erreur et publie une
        // courbe lisse où 62 400 $/an ont disparu. Ici elle ne doit pas exister du tout.
        monterAvecPersona(corrompreLeNet(Number.NaN));

        await waitFor(
            () => expect(useFinanceStore.getState().projectionStatus).toBe('error'),
            { timeout: 4000 },
        );
        expect(useFinanceStore.getState().lastProjection).toBeNull();
    });

    it('EFFACE une projection déjà publiée quand la donnée devient illisible', async () => {
        // Le vrai scénario : Marc a une projection valide à l'écran, puis une restauration Drive
        // ramène une valeur corrompue. La courbe d'avant ne doit pas survivre.
        monterAvecPersona();
        await waitFor(
            () => expect(useFinanceStore.getState().lastProjection).not.toBeNull(),
            { timeout: 4000 },
        );
        cleanup();

        monterAvecPersona(corrompreLeNet(Infinity));
        await waitFor(
            () => expect(useFinanceStore.getState().lastProjection).toBeNull(),
            { timeout: 4000 },
        );
        expect(useFinanceStore.getState().projectionStatus).toBe('error');
    });
});
