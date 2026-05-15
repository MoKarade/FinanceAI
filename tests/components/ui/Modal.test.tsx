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
});
