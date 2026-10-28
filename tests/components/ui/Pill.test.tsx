import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pill } from '../../../components/ui/Pill';

const OPTIONS = [
    { value: 'one' as const, label: 'One' },
    { value: 'two' as const, label: 'Two' },
    { value: 'three' as const, label: 'Three' },
];

describe('Pill', () => {
    it('renders all options as radio buttons', () => {
        render(<Pill options={OPTIONS} value="one" onChange={() => {}} aria-label="Test" />);
        expect(screen.getAllByRole('radio')).toHaveLength(3);
    });

    it('marks the selected option with aria-checked=true', () => {
        render(<Pill options={OPTIONS} value="two" onChange={() => {}} aria-label="T" />);
        const two = screen.getByRole('radio', { name: /Two/i });
        expect(two).toHaveAttribute('aria-checked', 'true');
        const one = screen.getByRole('radio', { name: /One/i });
        expect(one).toHaveAttribute('aria-checked', 'false');
    });

    it('calls onChange with the new value when clicked', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(<Pill options={OPTIONS} value="one" onChange={onChange} aria-label="T" />);
        await user.click(screen.getByRole('radio', { name: /Three/i }));
        expect(onChange).toHaveBeenCalledWith('three');
    });

    // [A11Y-PILL-RADIOGROUP] Pattern APG radiogroup : roving tabindex + navigation aux flèches.
    it('roving tabindex : seule l\'option sélectionnée est tabbable (1 arrêt de Tab pour le groupe)', () => {
        render(<Pill options={OPTIONS} value="two" onChange={() => {}} aria-label="T" />);
        expect(screen.getByRole('radio', { name: /Two/i })).toHaveAttribute('tabindex', '0');
        expect(screen.getByRole('radio', { name: /One/i })).toHaveAttribute('tabindex', '-1');
        expect(screen.getByRole('radio', { name: /Three/i })).toHaveAttribute('tabindex', '-1');
    });

    it('valeur hors options : la 1re option reste tabbable (groupe jamais intabbable)', () => {
        render(<Pill options={OPTIONS} value={'zzz' as 'one'} onChange={() => {}} aria-label="T" />);
        expect(screen.getByRole('radio', { name: /One/i })).toHaveAttribute('tabindex', '0');
    });

    it('flèches : la sélection SUIT le focus (droite/bas avance, gauche/haut recule, avec wrap)', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(<Pill options={OPTIONS} value="one" onChange={onChange} aria-label="T" />);
        const one = screen.getByRole('radio', { name: /One/i });
        one.focus();
        await user.keyboard('{ArrowRight}');
        expect(onChange).toHaveBeenLastCalledWith('two');
        await user.keyboard('{ArrowDown}'); // depuis le focus courant (Two)
        expect(onChange).toHaveBeenLastCalledWith('three');
        await user.keyboard('{ArrowRight}'); // wrap Three → One
        expect(onChange).toHaveBeenLastCalledWith('one');
        await user.keyboard('{ArrowLeft}'); // wrap One → Three (recule)
        expect(onChange).toHaveBeenLastCalledWith('three');
    });

    it('Home / End : première / dernière option', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(<Pill options={OPTIONS} value="two" onChange={onChange} aria-label="T" />);
        screen.getByRole('radio', { name: /Two/i }).focus();
        await user.keyboard('{End}');
        expect(onChange).toHaveBeenLastCalledWith('three');
        await user.keyboard('{Home}');
        expect(onChange).toHaveBeenLastCalledWith('one');
    });
});
