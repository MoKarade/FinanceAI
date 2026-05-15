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
});
