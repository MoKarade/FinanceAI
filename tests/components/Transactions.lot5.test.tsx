/**
 * [REFONTE-NAV-L5] — Transactions : cohérence du flux « argent au quotidien ».
 *
 * Verrouille :
 *   - le deep-link Budget → Transactions (« Voir les transactions » d'un poste) : la page
 *     atterrit DÉJÀ filtrée sur la catégorie (`pendingFocus` section `category:<nom>`),
 *     et le focus est consommé (one-shot),
 *   - le cross-link inverse « Voir au budget » : visible SEULEMENT quand la catégorie
 *     filtrée a un poste budget du même nom, et navigue via navigateWithFocus,
 *   - l'empty state UNIQUE (desktop + mobile) avec CTA honnête : « importe un relevé »
 *     s'il n'y a AUCUNE transaction, « réinitialiser les filtres » si ce sont les filtres,
 *   - le compte « groupe(s) à classer » du header : réel SANS ouvrir l'assistant
 *     (avant : figé à 0 tant que le wizard n'avait pas été ouvert — faux chiffre).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Transactions } from '../../components/Transactions';
import { useFinanceStore } from '../../store/useFinanceStore';
import { Tab, type BudgetCategory, type Transaction } from '../../types';

vi.mock('../../services/claude', () => ({ categorizeBatch: vi.fn() }));
vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

const tx = (id: number, payee: string, category: string): Transaction => ({
    id, date: `2026-01-${String(id).padStart(2, '0')}`, payee, amount: -50 * id, category, status: 'processed',
});

const EPICERIE: BudgetCategory = { id: 'b1', name: 'Épicerie', target: 400, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' };

const originalNavigate = useFinanceStore.getState().navigateWithFocus;

beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
    useFinanceStore.setState({ pendingFocus: null, navigateWithFocus: originalNavigate });
});

describe('[REFONTE-NAV-L5] deep-link Budget → Transactions (arrivée filtrée)', () => {
    it('pendingFocus `category:<nom>` → le filtre catégorie est posé à l\'arrivée et le focus consommé', () => {
        useFinanceStore.setState({
            pendingFocus: { tab: Tab.TRANSACTIONS, section: 'category:Épicerie', expiresAt: Date.now() + 5000 },
        });
        const { container } = render(
            <Transactions
                transactions={[tx(1, 'IGA', 'Épicerie'), tx(2, 'Amazon', 'Autre')]}
                setTransactions={vi.fn()} apiKey="" budgetItems={[EPICERIE]}
            />,
        );
        const select = screen.getByLabelText('Filtre par categorie') as HTMLSelectElement;
        expect(select.value).toBe('Épicerie');
        // L'ancre du scroll suit la catégorie filtrée, et le focus est one-shot.
        expect(container.querySelector('[data-focus-section="category:Épicerie"]')).toBeTruthy();
        expect(useFinanceStore.getState().pendingFocus).toBeNull();
    });

    it('sans pendingFocus : filtre par défaut « All »', () => {
        render(<Transactions transactions={[tx(1, 'IGA', 'Épicerie')]} setTransactions={vi.fn()} apiKey="" budgetItems={[]} />);
        expect((screen.getByLabelText('Filtre par categorie') as HTMLSelectElement).value).toBe('All');
    });
});

describe('[REFONTE-NAV-L5] cross-link « Voir au budget »', () => {
    it('visible quand la catégorie filtrée a un poste budget du même nom, navigue vers `poste:<nom>`', () => {
        const navSpy = vi.fn();
        useFinanceStore.setState({ navigateWithFocus: navSpy as never });
        render(
            <Transactions
                transactions={[tx(1, 'IGA', 'Épicerie')]}
                setTransactions={vi.fn()} apiKey="" budgetItems={[EPICERIE]}
            />,
        );
        expect(screen.queryByText(/Voir au budget/)).toBeNull(); // pas de lien sur « All »
        fireEvent.change(screen.getByLabelText('Filtre par categorie'), { target: { value: 'Épicerie' } });
        const link = screen.getByText(/Voir au budget/);
        fireEvent.click(link);
        expect(navSpy).toHaveBeenCalledWith(Tab.BUDGET, 'poste:Épicerie');
    });

    it('PAS de lien quand la catégorie filtrée n\'a AUCUN poste budget (pas de lien vers un poste absent)', () => {
        render(
            <Transactions
                transactions={[tx(1, 'Amazon', 'Autre')]}
                setTransactions={vi.fn()} apiKey="" budgetItems={[EPICERIE]}
            />,
        );
        fireEvent.change(screen.getByLabelText('Filtre par categorie'), { target: { value: 'Autre' } });
        expect(screen.queryByText(/Voir au budget/)).toBeNull();
    });
});

describe('[REFONTE-NAV-L5] empty state unique et honnête', () => {
    it('aucune transaction + onImport : CTA d\'import (et AUCUN tableau d\'en-têtes vide)', () => {
        const { container } = render(
            <Transactions transactions={[]} setTransactions={vi.fn()} apiKey="" budgetItems={[]} onImport={vi.fn()} />,
        );
        expect(screen.getByText('Aucune transaction')).toBeInTheDocument();
        expect(screen.getByText(/importe un relevé bancaire/i)).toBeInTheDocument();
        // Avant : le desktop rendait un <table> avec seulement des en-têtes.
        expect(container.querySelector('table')).toBeNull();
        // Pas de bouton « réinitialiser » : aucun filtre n'est en cause.
        expect(screen.queryByText(/Réinitialiser les filtres/)).toBeNull();
    });

    it('filtres trop stricts : CTA « Réinitialiser les filtres » qui restaure la liste', () => {
        const { container } = render(
            <Transactions transactions={[tx(1, 'IGA', 'Épicerie')]} setTransactions={vi.fn()} apiKey="" budgetItems={[]} />,
        );
        fireEvent.change(screen.getByLabelText('Rechercher dans les transactions'), { target: { value: 'zzz-introuvable' } });
        expect(screen.getByText(/ne correspond aux filtres/i)).toBeInTheDocument();
        fireEvent.click(screen.getByText('Réinitialiser les filtres'));
        expect(screen.queryByText(/ne correspond aux filtres/i)).toBeNull();
        expect(container.querySelector('table')).toBeTruthy();
    });
});

describe('[REFONTE-NAV-L5] compte honnête des groupes à classer', () => {
    it('le header affiche le VRAI compte sans avoir ouvert l\'assistant (avant : 0 figé)', () => {
        render(
            <Transactions
                transactions={[tx(1, 'Amazon', 'Autre'), tx(2, 'Mystère', 'Inconnu')]}
                setTransactions={vi.fn()} apiKey="" budgetItems={[]}
            />,
        );
        // 2 marchands non classés → 2 groupes, visibles d'emblée dans le sous-titre du header.
        expect(screen.getByText(/2 groupe\(s\) à classer/)).toBeInTheDocument();
    });
});
