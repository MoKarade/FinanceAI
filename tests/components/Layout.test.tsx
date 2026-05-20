import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Layout } from '../../components/Layout';
import { Tab } from '../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, d?: string) => d || k, i18n: { language: 'fr' } }),
}));
// Évite l'init côté i18n.ts (LanguageDetector) qui requiert un DOM complet.
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

    it('expose un bouton refresh accessible avec aria-label', () => {
        const onRefresh = vi.fn();
        render(<Layout {...baseProps} onRefresh={onRefresh} />);
        const btn = screen.getByLabelText('Synchroniser');
        fireEvent.click(btn);
        expect(onRefresh).toHaveBeenCalled();
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
});
