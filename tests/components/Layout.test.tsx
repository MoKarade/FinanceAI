import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Layout } from '../../components/Layout';
import { Tab } from '../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, d?: string) => d || k, i18n: { language: 'fr' } }),
}));
vi.mock('../../i18n', () => ({ default: {} }));

const baseProps = {
    activeTab: Tab.DASHBOARD,
    setActiveTab: vi.fn(),
    lastUpdate: Date.now(),
    onRefresh: vi.fn(),
    isLoading: false,
    isPrivacyMode: false,
    togglePrivacyMode: vi.fn(),
    netWorth: 100000,
    children: <main data-testid="content">child content</main>,
};

describe('Layout', () => {
    it('rend les children dans le main', () => {
        render(<Layout {...baseProps} />);
        expect(screen.getByTestId('content')).toBeInTheDocument();
    });

    it('a11y §7.A.1 — skip link "Aller au contenu principal" présent', () => {
        render(<Layout {...baseProps} />);
        const skip = screen.getByText('Aller au contenu principal');
        expect(skip).toBeInTheDocument();
        expect(skip.getAttribute('href')).toBe('#main');
    });

    it('a11y — <main id="main"> avec tabIndex pour cible du skip link', () => {
        const { container } = render(<Layout {...baseProps} />);
        const main = container.querySelector('main#main');
        expect(main).not.toBeNull();
        expect(main?.getAttribute('tabIndex')).toBe('-1');
    });

    it('a11y — le brand « FinanceAI » n\'est PAS un titre (le <h1> est réservé au titre de page)', () => {
        render(<Layout {...baseProps} />);
        // le texte du brand reste présent (sidebar + barre mobile)...
        expect(screen.getAllByText('FinanceAI').length).toBeGreaterThan(0);
        // ...mais ce n'est plus un heading → fin du double <h1> (brand + PageHeader) par page.
        expect(screen.queryByRole('heading', { name: 'FinanceAI' })).toBeNull();
    });

    it('§B.4 — bouton Synchroniser retiré (doc directives §1)', () => {
        render(<Layout {...baseProps} />);
        expect(screen.queryByLabelText('Synchroniser')).toBeNull();
    });

    it('§B.4 — bouton info ℹ️ retiré (doc directives §1)', () => {
        render(<Layout {...baseProps} />);
        expect(screen.queryByLabelText('Guide du Pilote')).toBeNull();
    });

    it('§B.4 — bouton Rapport PDF retiré de la sidebar', () => {
        render(<Layout {...baseProps} onGeneratePDF={vi.fn()} />);
        // Le bouton n'apparaît plus dans la sidebar (sera repensé dans une phase ultérieure).
        expect(screen.queryByText(/Rapport PDF/i)).toBeNull();
    });

    it('bouton privacy mode toggle expose aria-pressed (desktop + mobile)', () => {
        const toggle = vi.fn();
        const { rerender } = render(<Layout {...baseProps} togglePrivacyMode={toggle} isPrivacyMode={false} />);
        const offButtons = screen.getAllByLabelText('Activer le mode discret');
        expect(offButtons.length).toBeGreaterThanOrEqual(1);
        offButtons.forEach(b => expect(b.getAttribute('aria-pressed')).toBe('false'));
        fireEvent.click(offButtons[0]);
        expect(toggle).toHaveBeenCalled();
        rerender(<Layout {...baseProps} togglePrivacyMode={toggle} isPrivacyMode={true} />);
        const onButtons = screen.getAllByLabelText('Quitter le mode discret');
        onButtons.forEach(b => expect(b.getAttribute('aria-pressed')).toBe('true'));
    });

    it('sidebar items utilisent aria-current="page" pour le tab actif', () => {
        render(<Layout {...baseProps} activeTab={Tab.DASHBOARD} />);
        const buttons = screen.getAllByRole('button');
        const activeButtons = buttons.filter(b => b.getAttribute('aria-current') === 'page');
        // Au moins 1 bouton actif (le Dashboard tab)
        expect(activeButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('navigation mobile expose aria-label "Navigation mobile"', () => {
        render(<Layout {...baseProps} />);
        expect(screen.getByRole('navigation', { name: 'Navigation mobile' })).toBeInTheDocument();
    });

    it('§B.1 — sidebar desktop a aria-expanded=false par défaut (collapsed)', () => {
        const { container } = render(<Layout {...baseProps} />);
        const sidebar = container.querySelector('aside');
        expect(sidebar?.getAttribute('aria-expanded')).toBe('false');
    });

    it('§B.1 — sidebar expands au mouseEnter, collapses au mouseLeave', () => {
        const { container } = render(<Layout {...baseProps} />);
        const sidebar = container.querySelector('aside')!;
        expect(sidebar.getAttribute('aria-expanded')).toBe('false');
        fireEvent.mouseEnter(sidebar);
        expect(sidebar.getAttribute('aria-expanded')).toBe('true');
        fireEvent.mouseLeave(sidebar);
        expect(sidebar.getAttribute('aria-expanded')).toBe('false');
    });

    it('§B.2 — clic sur header de groupe (sidebar ouverte) toggle aria-expanded', () => {
        const { container } = render(<Layout {...baseProps} />);
        const sidebar = container.querySelector('aside')!;
        fireEvent.mouseEnter(sidebar); // ouvre la sidebar
        const argentHeader = within(sidebar).getAllByRole('button').find(
            b => b.textContent?.includes('Argent') && !b.hasAttribute('aria-current')
        );
        expect(argentHeader).toBeDefined();
        expect(argentHeader!.getAttribute('aria-expanded')).toBe('true'); // default open
        fireEvent.click(argentHeader!);
        expect(argentHeader!.getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(argentHeader!);
        expect(argentHeader!.getAttribute('aria-expanded')).toBe('true');
    });

    it('§B.2 — header de groupe disabled quand sidebar collapsed', () => {
        const { container } = render(<Layout {...baseProps} />);
        const sidebar = container.querySelector('aside')!;
        // sidebar collapsed par défaut → headers disabled
        const headers = within(sidebar).getAllByRole('button').filter(
            b => b.textContent?.includes('Argent') && !b.hasAttribute('aria-current')
        );
        expect(headers.length).toBeGreaterThan(0);
        // au moins un header doit être disabled quand sidebar est collapsée
        expect(headers.some(h => (h as HTMLButtonElement).disabled)).toBe(true);
    });
});
