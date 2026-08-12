import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { BudgetGroupTable } from '../../components/budget/BudgetGroupTable';
import type { BudgetCategory } from '../../types';

// Régression : un groupe VIDE doit toujours afficher le bouton « + Ajouter »,
// sinon impossible de créer la 1re catégorie (INITIAL_BUDGET=[] → blocant pour
// tout nouvel utilisateur).
const baseProps = {
    allItems: [] as BudgetCategory[],
    actualsMap: {},
    trendMap: {},
    monthlyDataMap: {},
    totalBudgetDisplay: 0,
    monthProgress: 0,
    expandedId: null,
    onExpandToggle: vi.fn(),
    getDisplayTarget: () => 0,
    getDisplayAvg: () => null as number | null,
    isSolo: true,
    splitRatio1: 1,
    userNames: ['Moi', ''] as [string, string],
    timeView: 'MONTH' as const,
    onUpdateItem: vi.fn(),
    onDeleteItem: vi.fn(),
};

describe('BudgetGroupTable — groupe vide', () => {
    it('affiche le bouton « + Ajouter » même sans aucune catégorie', () => {
        const onAddItem = vi.fn();
        render(<BudgetGroupTable {...baseProps} nature="Besoin" items={[]} onAddItem={onAddItem} />);
        const btn = screen.getByText(/Ajouter une ligne dans Besoin/i);
        expect(btn).toBeInTheDocument();
        fireEvent.click(btn);
        expect(onAddItem).toHaveBeenCalledWith('Besoin');
    });

    it('affiche un empty state explicite quand le groupe est vide', () => {
        render(<BudgetGroupTable {...baseProps} nature="Envie" items={[]} onAddItem={vi.fn()} />);
        expect(screen.getByText(/Aucune catégorie dans/i)).toBeInTheDocument();
    });

    it('rend les catégories existantes + garde le bouton « + Ajouter »', () => {
        const item: BudgetCategory = {
            id: 'c1', name: 'Épicerie', target: 100, frequency: 'Monthly', type: 'Commun', nature: 'Besoin',
        };
        render(
            <BudgetGroupTable
                {...baseProps}
                nature="Besoin"
                items={[item]}
                allItems={[item]}
                getDisplayTarget={() => 100}
                onAddItem={vi.fn()}
            />
        );
        expect(screen.getByDisplayValue('Épicerie')).toBeInTheDocument();
        expect(screen.getByText(/Ajouter une ligne dans Besoin/i)).toBeInTheDocument();
    });
});

// [BUDGET-3-VUES] — colonne « Moy. 12m » par poste (réel · moyenne · prévu, demande Marc).
describe('BudgetGroupTable — colonne moyenne 12 mois', () => {
    const item: BudgetCategory = {
        id: 'c1', name: 'Épicerie', target: 400, frequency: 'Monthly', type: 'Commun', nature: 'Besoin',
    };

    it('affiche la moyenne formatée quand elle est disponible (poste + bandeau de groupe)', () => {
        render(
            <BudgetGroupTable
                {...baseProps}
                nature="Besoin"
                items={[item]}
                allItems={[item]}
                actualsMap={{ 'Épicerie': 350 }}
                getDisplayTarget={() => 400}
                getDisplayAvg={() => 372}
                onAddItem={vi.fn()}
            />
        );
        expect(screen.getByText('Moy. 12m')).toBeInTheDocument();
        // Assertions SCOPÉES (finding panel : un regex global sur la page est fragile) :
        // la cellule de la LIGNE du poste, puis le total du bandeau de groupe.
        const row = screen.getByDisplayValue('Épicerie').closest('tr')!;
        expect(within(row as HTMLElement).getByText(/372/)).toBeInTheDocument();
        const header = screen.getByTitle('Réel · moyenne 12 mois · cible');
        expect(within(header).getByText(/372/)).toBeInTheDocument();
    });

    it('affiche « — » (jamais un faux 0) quand aucun historique révolu', () => {
        render(
            <BudgetGroupTable
                {...baseProps}
                nature="Besoin"
                items={[item]}
                allItems={[item]}
                getDisplayTarget={() => 400}
                getDisplayAvg={() => null}
                onAddItem={vi.fn()}
            />
        );
        // Cellule du poste + total du bandeau : les deux rendent « — », aucun « 0 $ » de moyenne
        expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
        expect(screen.getByTitle(/moyenne indisponible/i)).toBeInTheDocument();
        // A11y (finding panel) : le « — » porte un texte accessible sr-only aux DEUX endroits
        // (title seul n'est pas fiable pour lecteur d'écran).
        expect(screen.getByText('Moyenne indisponible (aucun mois plein d\'historique)')).toBeInTheDocument();
        expect(screen.getByText('Moyenne du groupe indisponible (aucun mois plein d\'historique)')).toBeInTheDocument();
    });
});

// [REFONTE-NAV-L5] — cross-link « Voir les transactions » (poste → Transactions filtrées).
describe('BudgetGroupTable — cross-link Voir les transactions', () => {
    const item: BudgetCategory = {
        id: 'c1', name: 'Épicerie', target: 400, frequency: 'Monthly', type: 'Commun', nature: 'Besoin',
    };

    it('la ligne dépliée offre « Voir les transactions » et remonte le NOM du poste', () => {
        const onViewTransactions = vi.fn();
        render(
            <BudgetGroupTable
                {...baseProps}
                nature="Besoin"
                items={[item]}
                allItems={[item]}
                expandedId="c1"
                getDisplayTarget={() => 400}
                onAddItem={vi.fn()}
                onViewTransactions={onViewTransactions}
            />
        );
        const btn = screen.getByRole('button', { name: /Voir les transactions de la catégorie Épicerie/i });
        fireEvent.click(btn);
        expect(onViewTransactions).toHaveBeenCalledWith('Épicerie');
    });

    it('sans callback (rétro-compat) : aucun lien rendu', () => {
        render(
            <BudgetGroupTable
                {...baseProps}
                nature="Besoin"
                items={[item]}
                allItems={[item]}
                expandedId="c1"
                getDisplayTarget={() => 400}
                onAddItem={vi.fn()}
            />
        );
        expect(screen.queryByText(/Voir les transactions/i)).toBeNull();
    });

    it('chaque ligne porte l\'ancre de deep-link data-focus-section="poste:<nom>"', () => {
        const { container } = render(
            <BudgetGroupTable
                {...baseProps}
                nature="Besoin"
                items={[item]}
                allItems={[item]}
                getDisplayTarget={() => 400}
                onAddItem={vi.fn()}
            />
        );
        expect(container.querySelector('[data-focus-section="poste:Épicerie"]')).toBeTruthy();
    });
});
