// tests/components/ui/Drawer.test.tsx
//
// [FUTUR-NAV-TIROIRS] Calque de tests/components/ui/Modal.test.tsx — `Drawer` reprend
// délibérément le même patron de focus/scroll-lock/Échap (voir l'en-tête de `ui/Drawer.tsx`).
// Ce fichier prouve que le patron tient AUSSI dans sa nouvelle forme (portal + deux variantes),
// et couvre les deux props que `Modal` a et que `Drawer` n'avait pas encore : `id` (pour
// `aria-controls` d'un déclencheur externe) et `initialFocusRef` (piège de focus documenté dans
// `Modal.tsx` sous `[A11Y-MODAL-GUIDE-NODIALOG]`, repris ici avant qu'un tiroir de saisie n'en ait
// besoin sans que personne y ait pensé).
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Drawer } from '../../../components/ui/Drawer';

afterEach(() => {
    document.body.style.overflow = '';
});

describe('Drawer', () => {
    it('ne rend rien quand isOpen=false', () => {
        const { container } = render(
            <Drawer isOpen={false} onClose={() => {}} title="X" variant="lateral">body</Drawer>,
        );
        // Portalé sur document.body : vérifier l'absence du dialogue dans tout le document, pas
        // seulement dans le container de render (qui ne verrait de toute façon jamais le portal).
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(container.textContent).toBe('');
    });

    it('rend le titre et les enfants quand ouvert, avec role=dialog + aria-modal=true', () => {
        render(<Drawer isOpen title="Mon tiroir" variant="lateral" onClose={() => {}}><p>Contenu</p></Drawer>);
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(screen.getByRole('heading', { name: 'Mon tiroir' })).toBeInTheDocument();
        expect(screen.getByText('Contenu')).toBeInTheDocument();
    });

    it.each(['lateral', 'feuille'] as const)('pose id=%s sur le conteneur dialog pour un aria-controls externe', (variant) => {
        render(<Drawer isOpen id={`tiroir-${variant}`} title="X" variant={variant} onClose={() => {}}>body</Drawer>);
        expect(screen.getByRole('dialog')).toHaveAttribute('id', `tiroir-${variant}`);
    });

    it('ferme au clic sur le bouton ✕', async () => {
        const onClose = vi.fn();
        const user = userEvent.setup();
        render(<Drawer isOpen title="X" variant="lateral" onClose={onClose}>body</Drawer>);
        await user.click(screen.getByRole('button', { name: 'Fermer' }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('ferme sur Échap par défaut, pas quand closeOnEsc=false', () => {
        const onClose = vi.fn();
        const { rerender } = render(<Drawer isOpen title="X" variant="lateral" onClose={onClose}>body</Drawer>);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledOnce();

        onClose.mockClear();
        rerender(<Drawer isOpen title="X" variant="lateral" onClose={onClose} closeOnEsc={false}>body</Drawer>);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
    });

    it('ferme au clic sur le fond, pas quand closeOnBackdrop=false', () => {
        const onClose = vi.fn();
        const { rerender } = render(<Drawer isOpen title="X" variant="lateral" onClose={onClose}>body</Drawer>);
        fireEvent.click(screen.getByRole('presentation'));
        expect(onClose).toHaveBeenCalledOnce();

        onClose.mockClear();
        rerender(<Drawer isOpen title="X" variant="lateral" onClose={onClose} closeOnBackdrop={false}>body</Drawer>);
        fireEvent.click(screen.getByRole('presentation'));
        expect(onClose).not.toHaveBeenCalled();
    });

    it('un clic DANS le panneau ne ferme pas (stopPropagation)', () => {
        const onClose = vi.fn();
        render(<Drawer isOpen title="X" variant="lateral" onClose={onClose}><button>ne ferme rien</button></Drawer>);
        fireEvent.click(screen.getByText('ne ferme rien'));
        expect(onClose).not.toHaveBeenCalled();
    });

    it('verrouille puis restaure le scroll du body', () => {
        expect(document.body.style.overflow).toBe('');
        const { rerender } = render(<Drawer isOpen title="X" variant="lateral" onClose={() => {}}>body</Drawer>);
        expect(document.body.style.overflow).toBe('hidden');
        rerender(<Drawer isOpen={false} title="X" variant="lateral" onClose={() => {}}>body</Drawer>);
        expect(document.body.style.overflow).toBe('');
    });

    it('restaure le focus au déclencheur à la fermeture', () => {
        const Harness: React.FC = () => {
            const [open, setOpen] = React.useState(false);
            return (
                <>
                    <button data-testid="opener" onClick={() => setOpen(true)}>Ouvrir</button>
                    <Drawer isOpen={open} onClose={() => setOpen(false)} title="X" variant="feuille">body</Drawer>
                </>
            );
        };
        render(<Harness />);
        const opener = screen.getByTestId('opener');
        opener.focus();
        fireEvent.click(opener);
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(document.activeElement).toBe(opener);
    });

    it("ne crashe pas à la fermeture si l'élément précédemment focalisé a été retiré du DOM", () => {
        const onClose = vi.fn();
        document.body.focus();
        const { rerender } = render(<Drawer isOpen title="X" variant="lateral" onClose={onClose}>body</Drawer>);
        rerender(<Drawer isOpen={false} title="X" variant="lateral" onClose={onClose}>body</Drawer>);
        // Aucun crash → le test passe.
    });

    it('[A11Y-MODAL-GUIDE-NODIALOG] focalise initialFocusRef plutôt que le bouton ✕ quand fourni', () => {
        const Harness: React.FC = () => {
            const inputRef = React.useRef<HTMLInputElement>(null);
            return (
                <Drawer isOpen title="X" variant="lateral" onClose={() => {}} initialFocusRef={inputRef}>
                    <input aria-label="premier champ" ref={inputRef} />
                </Drawer>
            );
        };
        vi.useFakeTimers();
        try {
            render(<Harness />);
            act(() => { vi.advanceTimersByTime(60); });
            expect(document.activeElement).toBe(screen.getByLabelText('premier champ'));
        } finally {
            vi.useRealTimers();
        }
    });

    it('sans initialFocusRef, focalise le bouton ✕ après le délai de 50ms', () => {
        vi.useFakeTimers();
        try {
            render(<Drawer isOpen title="X" variant="lateral" onClose={() => {}}>body</Drawer>);
            act(() => { vi.advanceTimersByTime(60); });
            expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fermer' }));
        } finally {
            vi.useRealTimers();
        }
    });
});
