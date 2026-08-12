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

    it('§B.1 (révisé audit #598) — l’aside n’a PLUS aria-expanded (non conforme au rôle complementary)', () => {
        // aria-expanded n'est pas une propriété supportée du rôle implicite complementary
        // (axe aria-allowed-attr) — l'état est purement visuel, chaque groupe expose le sien.
        const { container } = render(<Layout {...baseProps} />);
        const sidebar = container.querySelector('aside');
        expect(sidebar?.hasAttribute('aria-expanded')).toBe(false);
    });

    it('§B.1 — sidebar expands au mouseEnter, collapses au mouseLeave (observable = largeur)', () => {
        const { container } = render(<Layout {...baseProps} />);
        const sidebar = container.querySelector('aside')!;
        expect(sidebar.className).toContain('w-16');
        fireEvent.mouseEnter(sidebar);
        expect(sidebar.className).toContain('w-72');
        fireEvent.mouseLeave(sidebar);
        expect(sidebar.className).toContain('w-16');
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

    it('§B.2 (inversé par D6-KBD) — header de groupe JAMAIS disabled, même sidebar collapsée', () => {
        // L'ancien contrat (« disabled quand collapsed ») rendait l'accordéon inatteignable au
        // clavier en marche avant : Tab SAUTE un bouton désactivé, et au moment où Tab le
        // considère la sidebar est encore repliée. Nouveau contrat : atteint = opérable (le
        // focus ouvre la sidebar via l'onFocus de l'aside).
        const { container } = render(<Layout {...baseProps} />);
        const sidebar = container.querySelector('aside')!;
        const headers = within(sidebar).getAllByRole('button').filter(
            b => b.textContent?.includes('Argent') && !b.hasAttribute('aria-current')
        );
        expect(headers.length).toBeGreaterThan(0);
        expect(headers.every(h => !(h as HTMLButtonElement).disabled)).toBe(true);
    });
});

// [D6-KBD] Sidebar pilotable au CLAVIER (V10 a11y, 2026-08-12). Deux pièges verrouillés :
// 1. `disabled={!isSidebarOpen}` sautait l'accordéon au Tab (au moment où Tab le considère, le
//    focus n'est pas encore DANS l'aside, donc la sidebar est repliée et le bouton désactivé) ;
// 2. les items d'un groupe REPLIÉ restaient dans l'ordre de tabulation (max-h-0 + overflow-hidden
//    cache visuellement mais ne retire PAS du tab-order) → focus posé sur un élément invisible.
describe('Layout — sidebar au clavier (D6-KBD)', () => {
    it('les boutons d’accordéon ne sont JAMAIS disabled et exposent toujours aria-expanded', () => {
        const { container } = render(<Layout {...baseProps} />);
        const accordions = Array.from(container.querySelectorAll('aside button[aria-expanded]'))
            // exclut l'aside lui-même (aria-expanded aussi) et tout bouton hors groupes
            .filter((b) => b.tagName === 'BUTTON');
        expect(accordions.length).toBeGreaterThan(0);
        for (const b of accordions) {
            expect(b).not.toBeDisabled();
            expect(['true', 'false']).toContain(b.getAttribute('aria-expanded'));
        }
    });

    it('un groupe REPLIÉ est visibility:hidden (hors tab-order), un groupe déplié est visible', () => {
        // ⚠️ Version corrigée (audit #598) : la première mouture assertait sur les groupes repliés
        // DU RENDU PAR DÉFAUT — or tous les groupes sont OUVERTS par défaut, la boucle ne
        // s'exécutait jamais (test vacueux, classe CONVENTIONS). On REPLIE d'abord.
        const { container } = render(<Layout {...baseProps} />);
        expect(container.querySelectorAll('aside .max-h-0').length).toBe(0); // tout ouvert par défaut
        const btn = container.querySelector('aside button[aria-expanded="true"]') as HTMLButtonElement;
        fireEvent.click(btn); // replie le premier groupe
        const collapsed = container.querySelectorAll('aside .max-h-0');
        expect(collapsed.length).toBe(1);
        expect(collapsed[0].className).toContain('invisible');
        const expanded = container.querySelectorAll('aside .max-h-\\[600px\\]');
        expect(expanded.length).toBeGreaterThan(0);
        for (const e of Array.from(expanded)) expect(e.className).toContain('visible');
    });

    it('cliquer un accordéon bascule son état, sidebar repliée ou non (plus de garde isSidebarOpen)', () => {
        // Groupes dépliés par défaut → on replie PUIS on redéplie, sidebar restée « repliée »
        // (aucun focus/hover simulé) : l'ancien onClick gardé par isSidebarOpen ne faisait RIEN ici.
        const { container } = render(<Layout {...baseProps} />);
        const btn = Array.from(container.querySelectorAll('aside button[aria-expanded]'))[0] as HTMLButtonElement;
        expect(btn).toBeTruthy();
        const before = btn.getAttribute('aria-expanded');
        fireEvent.click(btn);
        expect(btn.getAttribute('aria-expanded')).not.toBe(before);
        fireEvent.click(btn);
        expect(btn.getAttribute('aria-expanded')).toBe(before);
    });
});
