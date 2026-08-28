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
        // [PH4D-BUDGET-RATIOS] 6 sliders (range inputs) : +adhérence budget +poids abos
        const sliders = screen.getAllByRole('slider');
        expect(sliders.length).toBe(6);
    });

    it('Réinitialiser remet les poids aux valeurs par défaut', () => {
        // [PH4D-WEIGHTS-STORE] poids dans le STORE (avant : localStorage local au composant). 6 champs (PH4D-BUDGET-RATIOS).
        useFinanceStore.setState({ healthWeights: { savingsRate: 80, emergencyFund: 5, debtRatio: 5, fireProgress: 5, budgetParity: 3, subscriptionLoad: 2 } });
        render(<HealthIndicator />);
        fireEvent.click(screen.getByLabelText('Paramétrer les pondérations'));
        const sliders = screen.getAllByRole('slider');
        expect((sliders[0] as HTMLInputElement).value).toBe('80'); // le composant LIT bien le poids non-défaut du STORE (savingsRate = 1er)
        fireEvent.click(screen.getByText('Réinitialiser'));
        // Après reset, le store porte les défauts à 6 champs (somme 100).
        expect(useFinanceStore.getState().healthWeights).toEqual({ savingsRate: 25, emergencyFund: 15, debtRatio: 15, fireProgress: 20, budgetParity: 15, subscriptionLoad: 10 });
    });

    it('score élevé avec finances saines (≥70)', () => {
        // État favorable : épargne élevée (80%), zéro dette, gros coussin.
        // Les clés de initialBalances sont arbitraires (comme en usage réel) :
        // computeCurrentLiquidity somme toutes les valeurs = 600 000 $ de cash.
        // Coussin = 600000/2000 = 300 mois → 100. Épargne (10000-2000)/10000 = 80% → 100. Dette 0 → 100.
        // [PH4D-BUDGET-RATIOS] FIRE indisponible (pas de projection) ET adhérence budget indisponible (transactions
        // vides) → EXCLUES du score. Poids des abos = 100 (aucun abo épinglé = aucun fardeau). Score = moyenne pondérée
        // des métriques DISPONIBLES (épargne/coussin/dette/abos, toutes à 100) = 100 ≥ 70.
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
        // Format coussin « X,XX mois » (espace), pas « $/mois » du poids des abos (PH4D-BUDGET-RATIOS).
        expect(screen.getByText(/\d+[.,]\d+\s+mois/)).toBeInTheDocument();
    });

    it('[HEALTH-CORRUPTION-INDISTINGUABLE-D-UNE-ABSENCE] le nom accessible porte la VRAIE cause, pas « donnée indisponible »', () => {
        // L'`aria-label` disait « <métrique> : donnée indisponible » pour TOUS les états
        // indisponibles — y compris, depuis le lot 31, « ta donnée est corrompue, va la corriger ».
        // Trois situations aux ACTIONS opposées annoncées d'une seule phrase, alors que le texte
        // visuel, lui, les distinguait déjà (audit a11y, panel PR #757).
        useFinanceStore.setState({
            config: {
                ...initialState.config,
                users: [
                    { ...initialState.config.users[0], name: 'Bob', netSalary: 5000, grossSalary: 6000 },
                    { ...initialState.config.users[1], name: '' },
                ],
            },
            budgetItems: [{ id: 'rent', name: 'Loyer', target: 2000, nature: 'Besoin', frequency: 'Monthly' } as never],
            debts: [], assets: [], transactions: [], subscriptions: [],
            initialBalances: { 'Compte chèque BMO': 24000 },
        });
        render(<HealthIndicator />);
        // Anti-vacuité : au moins une métrique est INDISPONIBLE ici (aucun abo épinglé, pas de
        // projection FIRE) — sinon l'assertion ci-dessous porterait sur un ensemble vide.
        const indispos = screen.getAllByText('—');
        expect(indispos.length).toBeGreaterThan(0);

        // Plus AUCUN nom accessible générique : chacun nomme sa raison.
        expect(screen.queryByLabelText(/donnée indisponible/i)).not.toBeInTheDocument();
        expect(screen.getByLabelText(/Poids des abonnements : Aucun abonnement épinglé/i)).toBeInTheDocument();

        // Et le score est ASSOCIÉ à sa ligne de détail : sans `aria-describedby`, un lecteur
        // d'écran qui navigue par éléments (et non au fil du texte) ne la rencontre jamais.
        const score = screen.getByLabelText(/Poids des abonnements : Aucun abonnement épinglé/i);
        const describedBy = score.getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();
        expect(document.getElementById(describedBy!)).toBeTruthy();

        // La JUSTIFICATION (`help`) ne dépend plus d'un survol : elle est dans le nom accessible.
        expect(document.getElementById(describedBy!)!.textContent).toContain('Épingle tes abos');
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
