import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Layout } from '../../components/Layout';
import { Tab } from '../../types';
import { TAB_LABELS } from '../../constants';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, d?: string) => d || k, i18n: { language: 'fr' } }),
}));
vi.mock('../../i18n', () => ({ default: {} }));

const baseProps = {
    activeTab: Tab.FUTURE,
    setActiveTab: vi.fn(),
    lastUpdate: Date.now(),
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

    it('[A11Y-ROUTE-FOCUS] changer d\'onglet déplace le focus vers le contenu ET l\'annonce', () => {
        // ⚠️ Le défaut : cliquer une destination ne produisait AUCUN signal non visuel. Le focus
        // restait sur le bouton de nav, donc atteindre le nouveau contenu demandait de re-tabuler
        // tout le rail — pour une navigation que l'utilisateur venait justement de demander.
        const { container, rerender } = render(<Layout {...baseProps} activeTab={Tab.FUTURE} />);
        const main = container.querySelector('main#main') as HTMLElement;
        const region = container.querySelector('[role="status"][aria-live="polite"]') as HTMLElement;

        // ⚠️ La région est montée AVANT d'avoir quoi que ce soit à dire : montée au moment de parler,
        // elle raterait la première transition — la seule qui compte.
        expect(region, 'région d\'annonce absente au repos : la 1re transition serait muette').toBeTruthy();
        expect(region.textContent, 'arriver sur l\'app n\'est pas un changement de destination').toBe('');
        expect(document.activeElement, 'le focus ne doit PAS être volé au premier rendu').not.toBe(main);

        rerender(<Layout {...baseProps} activeTab={Tab.BUDGET} />);
        expect(document.activeElement, 'le focus n\'a pas suivi le changement d\'onglet').toBe(main);
        expect(region.textContent, 'la destination n\'est pas annoncée').toBe(TAB_LABELS[Tab.BUDGET]);

        // ⚠️ Contrôle : un re-rendu SANS changement d'onglet ne doit rien refaire — sinon la région
        // répéterait la même annonce à chaque frappe, et le focus sauterait pendant une saisie.
        const boutonNav = screen.getAllByRole('button')[0];
        boutonNav.focus();
        rerender(<Layout {...baseProps} activeTab={Tab.BUDGET} />);
        expect(document.activeElement, 'le focus a été repris sans changement de destination').toBe(boutonNav);
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
        render(<Layout {...baseProps} activeTab={Tab.FUTURE} />);
        const buttons = screen.getAllByRole('button');
        const activeButtons = buttons.filter(b => b.getAttribute('aria-current') === 'page');
        // Au moins 1 bouton actif (Futur : sidebar + barre mobile)
        expect(activeButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('navigation mobile expose aria-label "Navigation mobile"', () => {
        render(<Layout {...baseProps} />);
        expect(screen.getByRole('navigation', { name: 'Navigation mobile' })).toBeInTheDocument();
    });

    it('§B.1 (révisé audit #598) — l’aside n’a PLUS aria-expanded (non conforme au rôle complementary)', () => {
        // aria-expanded n'est pas une propriété supportée du rôle implicite complementary
        // (axe aria-allowed-attr) — l'état est purement visuel, chaque groupe expose le sien.
        const { container } = render(<Layout {...baseProps} />);
        const sidebar = container.querySelector('aside');
        expect(sidebar?.hasAttribute('aria-expanded')).toBe(false);
    });

    it('[S5-REFONTE-R1] barre latérale TEXTE toujours dépliée : trois groupes, items dans l\'ordre des maquettes', () => {
        const { container } = render(<Layout {...baseProps} />);
        const aside = container.querySelector('aside')!;
        expect(aside.className, 'largeur fixe, plus de rail au survol').toContain('w-[232px]');
        const nav = within(aside).getByRole('navigation', { name: 'Navigation principale' });
        const textes = within(nav).getAllByRole('button').map((b) => b.textContent?.trim());
        expect(textes).toEqual(['Futur', 'Transactions', 'Budget', 'Dettes', 'Placements', 'Retraite', 'Immobilier', 'Enfants', 'Projets de vie', 'Impôts', 'Assistant', 'Réglages']);
        for (const titre of ['Vue', 'Planifier', 'Outils']) expect(within(nav).getByText(titre)).toBeInTheDocument();
        expect(within(nav).queryAllByRole('button').some((b) => b.hasAttribute('aria-expanded')), 'plus d\'accordéon').toBe(false);
    });

    it('[S5-REFONTE-R1] Immobilier réunit biens et projets : item courant sur les DEUX onglets', () => {
        const { container } = render(<Layout {...baseProps} activeTab={Tab.REAL_ESTATE_PROJECTS} />);
        const nav = within(container.querySelector('aside')!).getByRole('navigation', { name: 'Navigation principale' });
        expect(within(nav).getByText('Immobilier').getAttribute('aria-current')).toBe('page');
    });

    it('[S5-REFONTE-R1] la carte Profil (pied de barre) ouvre le Profil', () => {
        const setActiveTab = vi.fn();
        const { container } = render(<Layout {...baseProps} setActiveTab={setActiveTab} />);
        fireEvent.click(container.querySelector(`aside [data-tour-id="nav-${Tab.PROFILE}"]`)!);
        expect(setActiveTab).toHaveBeenCalledWith(Tab.PROFILE);
    });

    it('non-perte mobile : chaque onglet est atteignable via la barre OU le menu « Plus » — scoped AU menu', () => {
        // ⚠️ (finding code-reviewer #600) : interroger le DOCUMENT entier laisserait la barre latérale
        // (présente dans jsdom malgré `hidden lg:flex`) satisfaire l'assertion. On interroge LE menu.
        const setActiveTab = vi.fn();
        render(<Layout {...baseProps} setActiveTab={setActiveTab} />);
        const mobileNav = screen.getByRole('navigation', { name: 'Navigation mobile' });
        for (const label of ['Futur', 'Transactions', 'Assistant']) {
            expect(within(mobileNav).getByText(label)).toBeInTheDocument();
        }
        fireEvent.click(within(mobileNav).getByRole('button', { name: "Plus d'options" }));
        const menu = screen.getByRole('navigation', { name: 'Autres destinations' });
        for (const label of ['Budget', 'Dettes', 'Placements', 'Retraite', 'Immobilier', 'Enfants', 'Projets de vie', 'Impôts', 'Réglages']) {
            const btns = within(menu).getAllByRole('button').filter(b => b.textContent?.replace('›', '').trim() === label);
            expect(btns.length, `« ${label} » = un bouton du menu`).toBe(1);
        }
        fireEvent.click(within(menu).getByText('Budget'));
        expect(setActiveTab).toHaveBeenCalledWith(Tab.BUDGET);
    });

    it('[S5-REFONTE-R1] menu « Plus » : le Profil y est, Échap le referme', () => {
        const setActiveTab = vi.fn();
        render(<Layout {...baseProps} setActiveTab={setActiveTab} />);
        fireEvent.click(screen.getByRole('button', { name: "Plus d'options" }));
        expect(screen.getByRole('heading', { name: 'Plus' })).toBeInTheDocument();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('navigation', { name: 'Autres destinations' })).toBeNull();
    });

    it('[S5-REFONTE-R1] mobile : les pages hors barre du bas remontent vers « Plus »', () => {
        const { rerender } = render(<Layout {...baseProps} activeTab={Tab.FUTURE} />);
        expect(screen.queryByText('‹ Plus')).toBeNull();
        rerender(<Layout {...baseProps} activeTab={Tab.DEBT} />);
        fireEvent.click(screen.getByText('‹ Plus'));
        expect(screen.getByRole('navigation', { name: 'Autres destinations' })).toBeInTheDocument();
    });

    it('l\'Accueil n\'apparaît NULLE PART dans la nav (retiré, pas caché)', () => {
        const { container } = render(<Layout {...baseProps} />);
        expect(container.querySelector(`[data-tour-id="nav-${Tab.DASHBOARD}"]`)).toBeNull();
        expect(screen.queryByText('Accueil')).toBeNull();
    });
});
