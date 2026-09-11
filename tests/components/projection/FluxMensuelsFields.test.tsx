// [FUTUR-MOBILE-PR4] FluxMensuelsFields — extraction du bloc « Flux Mensuels » de ProjectionControls.
// ⚠️ Risque ÉLEVÉ #5 (architecte) : `useTheoretical` DOIT voyager en PROP explicite, jamais relu
// depuis un `projection` ambiant — sinon un futur site de montage sans le champ complet grisonnerait
// à tort. Ce test perturbe le nom du champ pour le prouver : si un jour quelqu'un revient à
// `projection.useTheoretical` en interne, ce test continue de passer À CONDITION que le composant
// reçoive toujours `projection` — donc la vraie garde est le TYPE (`useTheoretical: boolean` requis,
// pas optionnel) : `tsc` refuse un appel qui l'omet. Le test ci-dessous vérifie l'EFFET observable.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluxMensuelsFields } from '../../../components/projection/macroFields/FluxMensuelsFields';

const projection = { theoreticalIncome: 9000, theoreticalExpenses: 4500 };

describe('FluxMensuelsFields — useTheoretical en PROP explicite', () => {
    it('useTheoretical=false → les DEUX sliders sont grisés (opacity-50 pointer-events-none)', () => {
        render(<FluxMensuelsFields projection={projection} updateProj={vi.fn()} useTheoretical={false} isPrivacyMode={false} />);
        const revenus = screen.getByRole('slider', { name: 'Revenus (Net)' });
        const depenses = screen.getByRole('slider', { name: 'Dépenses' });
        expect(revenus.closest('div')?.className).toMatch(/opacity-50 pointer-events-none/);
        expect(depenses.closest('div')?.className).toMatch(/opacity-50 pointer-events-none/);
    });

    it('useTheoretical=true → les DEUX sliders sont actifs (pas de classe grisée)', () => {
        render(<FluxMensuelsFields projection={projection} updateProj={vi.fn()} useTheoretical={true} isPrivacyMode={false} />);
        const revenus = screen.getByRole('slider', { name: 'Revenus (Net)' });
        const depenses = screen.getByRole('slider', { name: 'Dépenses' });
        expect(revenus.closest('div')?.className).not.toMatch(/opacity-50/);
        expect(depenses.closest('div')?.className).not.toMatch(/opacity-50/);
    });

    it('rend les montants réels (pas une valeur en dur) — parité avec ProjectionControls', () => {
        render(<FluxMensuelsFields projection={projection} updateProj={vi.fn()} useTheoretical={true} isPrivacyMode={false} />);
        expect(screen.getByText('9000$')).toBeInTheDocument();
        expect(screen.getByText('4500$')).toBeInTheDocument();
    });
});
