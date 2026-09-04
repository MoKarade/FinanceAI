// [DETTE-UI-PRIMITIVES] (lot 156) — les trois primitives de formulaire. La migration est une
// PRÉSERVATION visuelle : chaque variant reproduit l'ENSEMBLE de classes que l'écran migré
// peignait déjà (l'ordre des classes dans l'attribut est indifférent au CSS — on compare des
// ensembles, pas des chaînes).
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Field } from '../../../components/ui/Field';

const classes = (el: Element | null) => new Set((el?.className ?? '').split(/\s+/).filter(Boolean));

describe('[DETTE-UI-PRIMITIVES] Input', () => {
    it('variant compact + accent = exactement les classes historiques d\'AdvancedProjectionParams', () => {
        const { container } = render(<Input accent="warning" type="number" aria-label="x" />);
        expect(classes(container.querySelector('input'))).toEqual(new Set(
            'w-full bg-dark border border-warning-500/20 rounded px-2 py-1 text-meta text-white'.split(' '),
        ));
    });

    it('variant large + extras = exactement les classes historiques d\'Onboarding', () => {
        const { container } = render(<Input variant="large" className="mt-1 font-mono" aria-label="x" />);
        expect(classes(container.querySelector('input'))).toEqual(new Set(
            'w-full bg-dark border border-white/10 rounded-card px-3 py-2 text-ink-50 text-body mt-1 font-mono focus-ring'.split(' '),
        ));
    });

    it('les props HTML traversent telles quelles (type, min, inputMode)', () => {
        const { container } = render(<Input type="number" min={18} inputMode="numeric" aria-label="x" />);
        const el = container.querySelector('input') as HTMLInputElement;
        expect(el.type).toBe('number');
        expect(el.min).toBe('18');
        expect(el.inputMode).toBe('numeric');
    });
});

describe('[DETTE-UI-PRIMITIVES] Select', () => {
    it('reproduit les classes historiques du select de ProjectionControls', () => {
        const { container } = render(<Select aria-label="x"><option value="a">A</option></Select>);
        expect(classes(container.querySelector('select'))).toEqual(new Set(
            'bg-dark border border-border rounded px-2 py-1 text-meta text-ink-100'.split(' '),
        ));
        expect(container.querySelectorAll('option')).toHaveLength(1);
    });
});

describe('[DETTE-UI-PRIMITIVES] Field', () => {
    it('écrit la paire label↔id UNE fois : le contrôle reçoit l\'id et son NOM ACCESSIBLE', () => {
        render(
            <Field id="mon-champ" label="Salaire brut annuel ($)">
                <Input variant="large" type="number" />
            </Field>,
        );
        // Le nom ACCESSIBLE (pas l'attribut) : c'est la propriété que la paire garantit
        // (UN-ATTRIBUT-PRESENT-NE-PROUVE-PAS-QU-IL-DESIGNE-LA-BONNE-CHOSE).
        const champ = screen.getByLabelText('Salaire brut annuel ($)') as HTMLInputElement;
        expect(champ.id).toBe('mon-champ');
        expect(champ.type).toBe('number');
    });

    it('le libellé par défaut porte la forme la plus courante des formulaires du dépôt', () => {
        const { container } = render(
            <Field id="f2" label="Prénom"><Input /></Field>,
        );
        const label = container.querySelector('label') as HTMLLabelElement;
        expect(label.htmlFor).toBe('f2');
        expect(classes(label)).toEqual(new Set(['text-meta', 'text-ink-400']));
    });
});
