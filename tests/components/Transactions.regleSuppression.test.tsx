/**
 * [REGLE-SUPPRESSION-CONFIRMATION] — supprimer une règle de classement demande d'abord confirmation,
 * puis un message « Règle supprimée » confirme le geste. Annuler ne supprime rien.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Transactions } from '../../components/Transactions';
import { showToast } from '../../components/ui/Toast';
import type { CategorizationRule } from '../../types';

vi.mock('../../services/claude', () => ({ categorizeBatch: vi.fn() }));
vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

const RULE: CategorizationRule = { id: 'r1', pattern: 'IGA', category: 'Épicerie', createdAt: '2026-01-01T00:00:00.000Z' };

const rendre = (setRules: (r: CategorizationRule[]) => void) => {
    render(
        <Transactions
            transactions={[]} setTransactions={vi.fn()} apiKey="" budgetItems={[]}
            categorizationRules={[RULE]} setCategorizationRules={setRules}
        />,
    );
    fireEvent.click(screen.getByText(/Règles automatiques/));
};

beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(showToast).mockClear();
});

describe('[REGLE-SUPPRESSION-CONFIRMATION]', () => {
    it('cliquer sur supprimer ne supprime pas tout de suite : une confirmation s\'ouvre', () => {
        const setRules = vi.fn();
        rendre(setRules);
        fireEvent.click(screen.getByLabelText('Supprimer la règle IGA'));
        expect(screen.getByText('Supprimer cette règle ?')).toBeInTheDocument();
        expect(setRules).not.toHaveBeenCalled();
    });

    it('Annuler ferme la confirmation sans rien supprimer', () => {
        const setRules = vi.fn();
        rendre(setRules);
        fireEvent.click(screen.getByLabelText('Supprimer la règle IGA'));
        fireEvent.click(screen.getByText('Annuler'));
        expect(setRules).not.toHaveBeenCalled();
        expect(screen.queryByText('Supprimer cette règle ?')).toBeNull();
    });

    it('Confirmer supprime la règle et affiche « Règle supprimée »', () => {
        const setRules = vi.fn();
        rendre(setRules);
        fireEvent.click(screen.getByLabelText('Supprimer la règle IGA'));
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        expect(setRules).toHaveBeenCalledWith([]);
        expect(showToast).toHaveBeenCalledWith('Règle supprimée', 'success');
    });
});
