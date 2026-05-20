import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../../../components/ui/Modal';

describe('Modal', () => {
    it('does not render anything when isOpen=false', () => {
        const { container } = render(<Modal isOpen={false} onClose={() => {}}>body</Modal>);
        expect(container.textContent).toBe('');
    });

    it('renders title and children when open', () => {
        render(<Modal isOpen={true} onClose={() => {}} title="Hello"><p>Content</p></Modal>);
        expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
        expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('uses role=dialog and aria-modal=true', () => {
        render(<Modal isOpen={true} onClose={() => {}} title="X">body</Modal>);
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('fires onClose when clicking the close button', async () => {
        const onClose = vi.fn();
        const user = userEvent.setup();
        render(<Modal isOpen={true} onClose={onClose} title="X">body</Modal>);
        await user.click(screen.getByRole('button', { name: 'Fermer' }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('fires onClose when pressing Escape (closeOnEsc=true by default)', () => {
        const onClose = vi.fn();
        render(<Modal isOpen={true} onClose={onClose} title="X">body</Modal>);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('does NOT fire onClose on Escape when closeOnEsc=false', () => {
        const onClose = vi.fn();
        render(<Modal isOpen={true} onClose={onClose} closeOnEsc={false} title="X">body</Modal>);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
    });

    it('renders footer slot when provided', () => {
        render(<Modal isOpen={true} onClose={() => {}} title="X" footer={<button>OK</button>}>body</Modal>);
        expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
    });

    // P2.3 — bouton close doit faire ≥44×44 (WCAG AA touch target)
    it('close button has 44×44 hit area (Tailwind w-11 h-11)', () => {
        render(<Modal isOpen={true} onClose={() => {}} title="X">body</Modal>);
        const closeBtn = screen.getByRole('button', { name: 'Fermer' });
        // w-11 h-11 = 44px (2.75rem × 16px base)
        expect(closeBtn.className).toMatch(/\bw-11\b/);
        expect(closeBtn.className).toMatch(/\bh-11\b/);
    });

    // P2.2 — focus restore : on doit revenir sur l'opener à la fermeture
    it('restores focus to the previously focused element on close', () => {
        const Harness: React.FC = () => {
            const [open, setOpen] = React.useState(false);
            return (
                <>
                    <button data-testid="opener" onClick={() => setOpen(true)}>Open</button>
                    <Modal isOpen={open} onClose={() => setOpen(false)} title="X">body</Modal>
                </>
            );
        };
        render(<Harness />);
        const opener = screen.getByTestId('opener');
        opener.focus();
        expect(document.activeElement).toBe(opener);

        fireEvent.click(opener);
        // Modal ouvert — focus n'est plus sur l'opener
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        // Fermer par Escape
        fireEvent.keyDown(document, { key: 'Escape' });
        // Le focus doit être revenu sur l'opener
        expect(document.activeElement).toBe(opener);
    });

    it('does not crash on close if previous focus element was removed', () => {
        const onClose = vi.fn();
        // Render avec un focus sur body (cas normal après remove d'un élément)
        document.body.focus();
        const { rerender } = render(<Modal isOpen={true} onClose={onClose} title="X">body</Modal>);
        // Fermer doit pas crasher
        rerender(<Modal isOpen={false} onClose={onClose} title="X">body</Modal>);
        // Aucun crash → test pass
    });
});
