import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Badge } from '../../../components/ui/Badge';

describe('Badge', () => {
    it('renders as a span by default (non-clickable)', () => {
        render(<Badge>Status</Badge>);
        const el = screen.getByText('Status');
        expect(el.tagName).toBe('SPAN');
    });

    it('renders as a button when onClick is provided', () => {
        render(<Badge onClick={() => {}}>Go</Badge>);
        expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
    });

    it('fires onClick when clicked', async () => {
        const onClick = vi.fn();
        const user = userEvent.setup();
        render(<Badge onClick={onClick}>Click</Badge>);
        await user.click(screen.getByRole('button'));
        expect(onClick).toHaveBeenCalledOnce();
    });

    it('applies the success variant', () => {
        render(<Badge variant="success">OK</Badge>);
        expect(screen.getByText('OK').className).toMatch(/text-success-400/);
    });
});
