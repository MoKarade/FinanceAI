import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useFinanceStore } from '../../../store/useFinanceStore';

vi.mock('../../../services/claude', () => ({
    getNextBestActions: vi.fn(),
}));


// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetNextBestActions: any = (await import('../../../services/claude')).getNextBestActions;

import { NextBestAction } from '../../../components/sidebar/NextBestAction';

const initialState = useFinanceStore.getState();

beforeEach(() => {
    useFinanceStore.setState(initialState, true);
    vi.clearAllMocks();
    localStorage.clear();
    // P1 gating — useHasUserData requires user1 to have name + salary > 0
    // pour que les tests existants vérifient la logique apiKey/fetch (et pas
    // le gate "no data"). Activé via setState pour TOUS les tests par défaut.
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

describe('NextBestAction', () => {
    it('affiche un message "configurer clé API" si pas de clé Anthropic (et hasData=true)', () => {
        useFinanceStore.setState({ apiKeys: { ...initialState.apiKeys, anthropic: '' } });
        render(<NextBestAction isSidebarOpen={true} />);
        expect(screen.getByText(/clé API Anthropic/i)).toBeInTheDocument();
    });

    it('P1 gating — affiche "Renseigne ton profil" si pas de données utilisateur', () => {
        // Reset users à vide pour ce test spécifique
        useFinanceStore.setState({
            config: {
                ...initialState.config,
                users: [
                    { ...initialState.config.users[0], name: '', grossSalary: 0, netSalary: 0 },
                    { ...initialState.config.users[1], name: '' },
                ],
            },
            apiKeys: { ...initialState.apiKeys, anthropic: 'sk-test' },
            assets: [],
            transactions: [],
            financialGoals: [],
        });
        render(<NextBestAction isSidebarOpen={true} />);
        expect(screen.getByText(/Renseigne ton profil/i)).toBeInTheDocument();
    });

    it('appelle getNextBestActions au mount si clé présente', async () => {
        useFinanceStore.setState({ apiKeys: { ...initialState.apiKeys, anthropic: 'sk-test' } });
        mockGetNextBestActions.mockResolvedValue([
            { title: 'Cotiser REER', reason: 'Avant 1er mars', urgency: 'high', impact_estimate: '−2 000 $ impôt' },
        ]);
        render(<NextBestAction isSidebarOpen={true} />);
        await waitFor(() => expect(mockGetNextBestActions).toHaveBeenCalled());
    });

    it('affiche le titre et la raison de la première action', async () => {
        useFinanceStore.setState({ apiKeys: { ...initialState.apiKeys, anthropic: 'sk-test' } });
        mockGetNextBestActions.mockResolvedValue([
            { title: 'Vendre TSLA', reason: 'Trop concentré', urgency: 'medium' },
        ]);
        render(<NextBestAction isSidebarOpen={true} />);
        await screen.findByText('Vendre TSLA');
        expect(screen.getByText('Trop concentré')).toBeInTheDocument();
    });

    it('affiche pastille (compact) quand sidebar collapsed', async () => {
        useFinanceStore.setState({ apiKeys: { ...initialState.apiKeys, anthropic: 'sk-test' } });
        mockGetNextBestActions.mockResolvedValue([
            { title: 'X', reason: 'Y', urgency: 'high' },
        ]);
        const { container } = render(<NextBestAction isSidebarOpen={false} />);
        await waitFor(() => expect(mockGetNextBestActions).toHaveBeenCalled());
        // En compact, on n'affiche pas le titre/raison sous forme de texte
        expect(screen.queryByText('Y')).not.toBeInTheDocument();
        // Mais un container présent avec l'icône (lucide SVG line, remplace l'emoji ⚡)
        expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('utilise le cache localStorage si disponible (< 1h)', async () => {
        useFinanceStore.setState({ apiKeys: { ...initialState.apiKeys, anthropic: 'sk-test' } });
        localStorage.setItem(
            'nba:cache:v1',
            JSON.stringify({
                timestamp: Date.now(),
                actions: [{ title: 'Cached', reason: 'Cached reason', urgency: 'low' }],
            }),
        );
        render(<NextBestAction isSidebarOpen={true} />);
        await screen.findByText('Cached');
        // L'appel API ne doit pas être déclenché si cache valide
        expect(mockGetNextBestActions).not.toHaveBeenCalled();
    });
});
