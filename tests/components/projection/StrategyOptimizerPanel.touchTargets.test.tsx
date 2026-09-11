// [FUTUR-MOBILE-PR5] Amorçage mobile : les leviers en puces (22 px) et le CTA « Trouver la
// meilleure stratégie » (36-40 px) doivent atteindre 44/56 px SUR TÉLÉPHONE — desktop INCHANGÉ
// (mandat Marc #13, contrôle négatif).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StrategyOptimizerPanel } from '../../../components/projection/StrategyOptimizerPanel';
import { _resetViewportMqlForTests } from '../../../hooks/useViewportBelowSm';
import type { SimulationParams } from '../../../services/projection';

const stubViewport = (narrow: boolean) => {
    _resetViewportMqlForTests();
    vi.stubGlobal('matchMedia', (q: string) => ({
        media: q, matches: narrow,
        addEventListener: () => {}, removeEventListener: () => {},
    }));
};

afterEach(() => { vi.unstubAllGlobals(); _resetViewportMqlForTests(); });

// Minimal : seuls `realEstateGoals` et `config.users[0].age` sont lus AVANT tout lancement de
// recherche (le composeur de leviers se rend sans jamais appeler `run`).
const params = {
    realEstateGoals: [],
    config: { users: [{ age: 40 }] },
} as unknown as SimulationParams;

describe('[FUTUR-MOBILE-PR5] StrategyOptimizerPanel — cibles tactiles mobile', () => {
    it('desktop (défaut jsdom) : ni les leviers ni le CTA ne portent de min-h mobile', () => {
        render(<StrategyOptimizerPanel params={params} />);
        const lever = screen.getAllByRole('button', { pressed: false })[0];
        expect(lever.className).not.toContain('min-h-[44px]');
        const cta = screen.getByRole('button', { name: 'Trouver la meilleure stratégie' });
        expect(cta.className).not.toContain('min-h-[56px]');
    });

    it('mobile : un levier atteint min-h-[44px]', () => {
        stubViewport(true);
        render(<StrategyOptimizerPanel params={params} />);
        const lever = screen.getAllByRole('button', { pressed: false })[0];
        expect(lever.className).toContain('min-h-[44px]');
    });

    it('mobile : le CTA « Trouver la meilleure stratégie » atteint min-h-[56px]', () => {
        stubViewport(true);
        render(<StrategyOptimizerPanel params={params} />);
        const cta = screen.getByRole('button', { name: 'Trouver la meilleure stratégie' });
        expect(cta.className).toContain('min-h-[56px]');
    });
});
