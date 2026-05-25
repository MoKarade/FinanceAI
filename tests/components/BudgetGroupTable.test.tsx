import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
