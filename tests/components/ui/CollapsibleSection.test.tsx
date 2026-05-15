import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';

describe('CollapsibleSection', () => {
    it('is closed by default and hides content', () => {
        render(
            <CollapsibleSection title="Settings">
                <p>secret content</p>
            </CollapsibleSection>
        );
        expect(screen.queryByText('secret content')).not.toBeInTheDocument();
    });

    it('opens when defaultOpen is true', () => {
        render(
            <CollapsibleSection title="Settings" defaultOpen>
                <p>visible content</p>
            </CollapsibleSection>
        );
        expect(screen.getByText('visible content')).toBeInTheDocument();
    });

    it('toggles when header is clicked', async () => {
        const user = userEvent.setup();
        render(
            <CollapsibleSection title="Settings">
                <p>toggled content</p>
            </CollapsibleSection>
        );
        const header = screen.getByRole('button', { name: /Settings/ });
        await user.click(header);
        expect(screen.getByText('toggled content')).toBeInTheDocument();
        await user.click(header);
        expect(screen.queryByText('toggled content')).not.toBeInTheDocument();
    });

    it('calls onToggle with the new state', async () => {
        const onToggle = vi.fn();
        const user = userEvent.setup();
        render(
            <CollapsibleSection title="X" onToggle={onToggle}>
                <p>content</p>
            </CollapsibleSection>
        );
        await user.click(screen.getByRole('button'));
        expect(onToggle).toHaveBeenCalledWith(true);
    });

    it('respects controlled `open` prop', () => {
        const { rerender } = render(
            <CollapsibleSection title="X" open={false}>
                <p>controlled content</p>
            </CollapsibleSection>
        );
        expect(screen.queryByText('controlled content')).not.toBeInTheDocument();
        rerender(
            <CollapsibleSection title="X" open={true}>
                <p>controlled content</p>
            </CollapsibleSection>
        );
        expect(screen.getByText('controlled content')).toBeInTheDocument();
    });
});
