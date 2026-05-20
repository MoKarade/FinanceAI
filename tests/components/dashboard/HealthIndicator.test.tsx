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
        // Préremplir un poids non-default dans localStorage
        localStorage.setItem('healthIndicator:weights:v1', JSON.stringify({
            savingsRate: 80, emergencyFund: 5, debtRatio: 5, fireProgress: 10,
        }));
        render(<HealthIndicator />);
        fireEvent.click(screen.getByLabelText('Paramétrer les pondérations'));
        // Le total devrait être 100 (80+5+5+10)
        expect(screen.getByText(/Total : 100%/i)).toBeInTheDocument();
        fireEvent.click(screen.getByText('Réinitialiser'));
        // Après reset, total devrait être 100% (30+20+20+30)
        expect(screen.getByText(/Total : 100%/i)).toBeInTheDocument();
    });

    it('score élevé avec finances saines (≥70)', () => {
        // État favorable : épargne élevée, dettes nulles, FIRE bien avancé.
        // FireTarget = expenses × 12 × 25. On met expenses=2000 et assets=600000 →
        // fireProgressPct = 600000 / (2000×12×25) = 100% → fireScore = 100.
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
            initialBalances: { celi: 300000, reer: 200000, liquidity: 100000 },
        });
        const { container } = render(<HealthIndicator />);
        // Le score principal est le seul `.text-2xl.font-black` à côté de "/ 100"
        const scoreEl = container.querySelector('.text-2xl.font-black') as HTMLElement | null;
        expect(scoreEl).toBeTruthy();
        const score = parseInt(scoreEl!.textContent || '0', 10);
        expect(score).toBeGreaterThanOrEqual(70);
    });

    it('changement de slider sauvegarde dans localStorage', () => {
        render(<HealthIndicator />);
        fireEvent.click(screen.getByLabelText('Paramétrer les pondérations'));
        const sliders = screen.getAllByRole('slider');
        fireEvent.change(sliders[0], { target: { value: 50 } });
        const saved = localStorage.getItem('healthIndicator:weights:v1');
        expect(saved).toBeTruthy();
        const parsed = JSON.parse(saved!);
        expect(parsed.savingsRate).toBe(50);
    });
});
