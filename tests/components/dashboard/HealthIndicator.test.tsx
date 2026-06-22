import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useFinanceStore } from '../../../store/useFinanceStore';
import { HealthIndicator } from '../../../components/dashboard/HealthIndicator';

const initialState = useFinanceStore.getState();

beforeEach(() => {
    useFinanceStore.setState(initialState, true);
    localStorage.clear();
    // P1 gating — HealthIndicator masque tout sans données utilisateur.
    // On configure un user avec données pour que les tests vérifient
    // le score, pas l'empty state.
    useFinanceStore.setState({
        config: {
            ...initialState.config,
            users: [
                { ...initialState.config.users[0], name: 'TestUser', grossSalary: 5000, netSalary: 3500 },
                { ...initialState.config.users[1], name: '' },
            ],
        },
    });
});

describe('HealthIndicator', () => {
    it('P1 gating — affiche EmptyDataPrompt si pas de données utilisateur', () => {
        // Reset users à vide
        useFinanceStore.setState({
            config: {
                ...initialState.config,
                users: [
                    { ...initialState.config.users[0], name: '', grossSalary: 0, netSalary: 0 },
                    { ...initialState.config.users[1], name: '' },
                ],
            },
            assets: [],
            transactions: [],
            financialGoals: [],
        });
        render(<HealthIndicator />);
        expect(screen.getByText(/Score de santé financière indisponible/i)).toBeInTheDocument();
    });

    it('renders un score 0-100 par défaut', () => {
        render(<HealthIndicator />);
        expect(screen.getByText('/ 100')).toBeInTheDocument();
        expect(screen.getByText(/Santé financière/i)).toBeInTheDocument();
    });

    it("affiche les 4 métriques (épargne, coussin, dette, FIRE)", () => {
        render(<HealthIndicator />);
        expect(screen.getByText("Taux d'épargne")).toBeInTheDocument();
        expect(screen.getByText("Coussin d'urgence")).toBeInTheDocument();
        expect(screen.getByText('Ratio dette/actif')).toBeInTheDocument();
        expect(screen.getByText('Progression FIRE')).toBeInTheDocument();
    });

    it('toggle "Paramétrer" affiche les sliders de pondération', () => {
        render(<HealthIndicator />);
        expect(screen.queryByText(/Pondérations/i)).not.toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('Paramétrer les pondérations'));
        expect(screen.getByText(/Pondérations/i)).toBeInTheDocument();
        // 4 sliders (range inputs)
        const sliders = screen.getAllByRole('slider');
        expect(sliders.length).toBe(4);
    });

    it('Réinitialiser remet les poids aux valeurs par défaut', () => {
        // [PH4D-WEIGHTS-STORE] poids dans le STORE (avant : localStorage local au composant).
        useFinanceStore.setState({ healthWeights: { savingsRate: 80, emergencyFund: 5, debtRatio: 5, fireProgress: 10 } });
        render(<HealthIndicator />);
        fireEvent.click(screen.getByLabelText('Paramétrer les pondérations'));
        const sliders = screen.getAllByRole('slider');
        expect((sliders[0] as HTMLInputElement).value).toBe('80'); // le composant LIT bien le poids non-défaut du STORE
        fireEvent.click(screen.getByText('Réinitialiser'));
        // Après reset, le store porte les défauts (30/20/20/30).
        expect(useFinanceStore.getState().healthWeights).toEqual({ savingsRate: 30, emergencyFund: 20, debtRatio: 20, fireProgress: 30 });
    });

    it('score élevé avec finances saines (≥70)', () => {
        // État favorable : épargne élevée (80%), zéro dette, gros coussin.
        // Les clés de initialBalances sont arbitraires (comme en usage réel) :
        // computeCurrentLiquidity somme toutes les valeurs = 600 000 $ de cash.
        // Coussin = 600000/2000 = 300 mois → 100. Épargne (10000-2000)/10000 =
        // 80% → 100. Dette 0 → 100. FIRE = 0 (mode strict : pas de projection).
        // Score = (100×30 + 100×20 + 100×20 + 0×30) / 100 = 70.
        useFinanceStore.setState({
            config: {
                ...initialState.config,
                users: [
                    { ...initialState.config.users[0], name: 'Alice', netSalary: 10000, grossSalary: 12000 },
                    { ...initialState.config.users[1], name: '', netSalary: 0, grossSalary: 0 },
                ],
            },
            budgetItems: [{ id: 'food', name: 'Food', target: 2000, nature: 'Besoin', frequency: 'Monthly' } as never],
            debts: [],
            assets: [],
            transactions: [],
            initialBalances: { CELI: 300000, REER: 200000, 'Compte courant': 100000 },
        });
        const { container } = render(<HealthIndicator />);
        // Le score principal est le seul `.text-2xl.font-black` à côté de "/ 100"
        const scoreEl = container.querySelector('.text-2xl.font-black') as HTMLElement | null;
        expect(scoreEl).toBeTruthy();
        const score = parseInt(scoreEl!.textContent || '0', 10);
        expect(score).toBeGreaterThanOrEqual(70);
    });

    it("coussin d'urgence reflète la vraie liquidité, clés de compte dynamiques (régression)", () => {
        // Régression : avant, le code lisait initialBalances.liquidity/.checking/
        // .savings (clés fixes qui n'existent jamais dans les vraies données) →
        // coussin toujours « 0,00 mois ». Les vraies clés sont des noms de comptes
        // dynamiques. On vérifie qu'un solde sur une clé arbitraire est bien pris
        // en compte via computeCurrentLiquidity.
        useFinanceStore.setState({
            config: {
                ...initialState.config,
                users: [
                    { ...initialState.config.users[0], name: 'Bob', netSalary: 5000, grossSalary: 6000 },
                    { ...initialState.config.users[1], name: '' },
                ],
            },
            budgetItems: [{ id: 'rent', name: 'Loyer', target: 2000, nature: 'Besoin', frequency: 'Monthly' } as never],
            debts: [],
            assets: [],
            transactions: [],
            initialBalances: { 'Compte chèque BMO': 24000 }, // 24000 / 2000 = 12 mois
        });
        render(<HealthIndicator />);
        // Le coussin affiche un nombre de mois > 0, surtout PAS « 0,00 mois ».
        expect(screen.queryByText(/^0[.,]00\s+mois$/)).not.toBeInTheDocument();
        expect(screen.getByText(/\bmois\b/)).toBeInTheDocument();
    });

    it('changement de slider sauvegarde dans le store', () => {
        // [PH4D-WEIGHTS-STORE] la sauvegarde va dans le store persisté (avant : localStorage).
        render(<HealthIndicator />);
        fireEvent.click(screen.getByLabelText('Paramétrer les pondérations'));
        const sliders = screen.getAllByRole('slider');
        fireEvent.change(sliders[0], { target: { value: 50 } });
        expect(useFinanceStore.getState().healthWeights?.savingsRate).toBe(50);
    });
});
