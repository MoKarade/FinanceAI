/**
 * [GOAL-DEADLINE-UI] + [PH4C-SAVINGS-NATURE] — la carte d'objectif d'épargne.
 *
 * Les deux correctifs relèvent de la MÊME famille : une UI qui propose quelque chose qu'elle ne
 * peut pas honorer. L'un CACHAIT une valeur qui agit (l'échéance pilote un décaissement réel, et
 * l'assistant peut l'écrire) ; l'autre OFFRAIT un choix qui ne peut produire que du faux (un poste
 * de nature Épargne n'affichera jamais qu'un « Versé ce mois : 0 »).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Planning } from '../../components/Planning';
import type { SavingsGoal, BudgetCategory, BudgetConfig } from '../../types';

const goal = (over: Partial<SavingsGoal> = {}): SavingsGoal => ({
    id: 'g1', name: 'Voyage', targetAmount: 5000, currentAmount: 1000,
    deadline: '', icon: '💰', ...over,
} as SavingsGoal);

const cat = (name: string, nature: BudgetCategory['nature']): BudgetCategory =>
    ({ id: name, name, nature, target: 100 } as unknown as BudgetCategory);

function renderGoals(over: {
    savingsGoals?: SavingsGoal[];
    budgetItems?: BudgetCategory[];
    setSavingsGoals?: (g: SavingsGoal[]) => void;
} = {}) {
    const setSavingsGoals = over.setSavingsGoals ?? vi.fn();
    render(
        <Planning
            transactions={[]}
            savingsGoals={over.savingsGoals ?? [goal()]}
            setSavingsGoals={setSavingsGoals}
            budgetItems={over.budgetItems ?? []}
            setBudgetItems={vi.fn()}
            config={{} as BudgetConfig}
            section="goals"
        />,
    );
    return { setSavingsGoals };
}

describe('[GOAL-DEADLINE-UI] l’échéance est visible et éditable', () => {
    it('affiche un champ d’échéance sur un objectif EXISTANT', () => {
        // DISCRIMINANT : avant, la carte n'exposait que le nom, la progression et le lien budget.
        renderGoals({ savingsGoals: [goal({ deadline: '2030-06-01' })] });
        const input = screen.getByLabelText('Échéance') as HTMLInputElement;
        expect(input.value).toBe('2030-06-01');
    });

    it('éditer l’échéance remonte au store — une écriture de l’assistant devient RÉVERSIBLE', () => {
        const { setSavingsGoals } = renderGoals({ savingsGoals: [goal({ deadline: '2030-06-01' })] });
        fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '2031-01-15' } });
        expect(setSavingsGoals).toHaveBeenCalledTimes(1);
        expect((setSavingsGoals as ReturnType<typeof vi.fn>).mock.calls[0][0][0].deadline).toBe('2031-01-15');
    });

    it('effacer l’échéance écrit la CHAÎNE VIDE, pas `undefined`', () => {
        // `deadline` est un `string` requis, et le formulaire de création utilise déjà '' pour
        // « pas d'échéance ». Deux encodages du même sens finiraient par diverger.
        const { setSavingsGoals } = renderGoals({ savingsGoals: [goal({ deadline: '2030-06-01' })] });
        fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '' } });
        expect((setSavingsGoals as ReturnType<typeof vi.fn>).mock.calls[0][0][0].deadline).toBe('');
    });

    it('sans échéance → le DIT explicitement au lieu d’un champ vide ambigu', () => {
        renderGoals({ savingsGoals: [goal({ deadline: '' })] });
        expect(screen.getByText('aucune')).toBeInTheDocument();
    });
});

describe('[PH4C-SAVINGS-NATURE] le menu n’offre pas de poste qui ne peut afficher que 0', () => {
    it('exclut les catégories de nature Epargne, garde Besoin et Envie', () => {
        // DISCRIMINANT : avant, `budgetItems.map` listait TOUT. Lier « Fonds d'urgence » (Epargne)
        // condamnait l'objectif à « Versé ce mois : 0 » à perpétuité, parce que le réel vient
        // d'actualsMap qui EXCLUT les virements — justement le moyen d'alimenter un poste épargne.
        renderGoals({
            budgetItems: [
                cat('Épicerie', 'Besoin'),
                cat('Restaurants', 'Envie'),
                cat('Fonds d\'urgence', 'Epargne'),
            ],
        });
        const select = screen.getByLabelText(/Lier l'objectif Voyage/) as HTMLSelectElement;
        const options = [...select.options].map((o) => o.value);
        expect(options).toContain('Épicerie');
        expect(options).toContain('Restaurants');
        expect(options).not.toContain('Fonds d\'urgence');
    });

    it('une liaison DÉJÀ posée sur un poste épargne reste visible pour être défaite', () => {
        // Retirer l'option ne doit pas rendre une liaison existante INVISIBLE : Marc doit pouvoir
        // la défaire. La branche « lien invalide » s'en charge — on vérifie qu'elle s'allume.
        renderGoals({
            savingsGoals: [goal({ linkedBudgetCategoryName: 'Fonds d\'urgence' })],
            budgetItems: [cat('Épicerie', 'Besoin'), cat('Fonds d\'urgence', 'Epargne')],
        });
        const select = screen.getByLabelText(/Lier l'objectif Voyage/) as HTMLSelectElement;
        expect([...select.options].map((o) => o.value)).toContain('Fonds d\'urgence');
    });
});
