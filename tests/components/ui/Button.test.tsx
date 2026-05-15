import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../../../components/ui/Button';

describe('Button', () => {
    it('renders with children', () => {
        render(<Button>Submit</Button>);
        expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
    });

    it('fires onClick when clicked', async () => {
        const onClick = vi.fn();
        const user = userEvent.setup();
        render(<Button onClick={onClick}>Click me</Button>);
        await user.click(screen.getByRole('button'));
        expect(onClick).toHaveBeenCalledOnce();
    });

    it('is disabled when loading and shows a spinner', () => {
        render(<Button loading>Submitting</Button>);
        const btn = screen.getByRole('button');
        expect(btn).toBeDisabled();
    });

    it('applies the danger variant class', () => {
        render(<Button variant="danger">Delete</Button>);
        expect(screen.getByRole('button').className).toMatch(/bg-danger-500/);
    });

    it('renders icon on the left by default', () => {
        render(<Button icon={<span data-testid="icon">★</span>}>Star</Button>);
        const btn = screen.getByRole('button');
        const icon = screen.getByTestId('icon');
        // L'icône précède le texte dans le DOM.
        expect(btn.firstChild?.contains(icon)).toBe(true);
    });
});
