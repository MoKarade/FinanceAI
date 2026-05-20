import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useFinanceStore } from '../../../store/useFinanceStore';
import { CoupleOptimizationCard } from '../../../components/tax/CoupleOptimizationCard';

vi.mock('../../../services/claude', () => ({
    getCoupleOptimizationStrategies: vi.fn(),
}));

const initialState = useFinanceStore.getState();

beforeEach(() => {
    useFinanceStore.setState(initialState, true);
    vi.clearAllMocks();
});

describe('CoupleOptimizationCard (Phase G.4)', () => {
    it('ne rend RIEN si pas de second user (mode individuel)', () => {
        useFinanceStore.setState({
            config: {
                ...initialState.config,
                users: [
                    { ...initialState.config.users[0], name: 'Alice' },
                    { ...initialState.config.users[1], name: '' },
                ],
            },
        });
        const { container } = render(<CoupleOptimizationCard />);
        expect(container.firstChild).toBeNull();
    });

    it('rend le bouton "Générer 3 stratégies IA" en mode couple avec clé', () => {
        useFinanceStore.setState({
            apiKeys: { ...initialState.apiKeys, anthropic: 'sk-test' },
            config: {
                ...initialState.config,
                users: [
                    { ...initialState.config.users[0], name: 'Alice' },
                    { ...initialState.config.users[1], name: 'Bob' },
                ],
            },
        });
        render(<CoupleOptimizationCard />);
        expect(screen.getByText(/Générer 3 stratégies IA/i)).toBeInTheDocument();
    });

    it('affiche message "configure clé" si pas de clé Anthropic', () => {
        useFinanceStore.setState({
            apiKeys: { ...initialState.apiKeys, anthropic: '' },
            config: {
                ...initialState.config,
                users: [
                    { ...initialState.config.users[0], name: 'Alice' },
                    { ...initialState.config.users[1], name: 'Bob' },
                ],
            },
        });
        render(<CoupleOptimizationCard />);
        expect(screen.getByText(/Configure ta clé Anthropic/i)).toBeInTheDocument();
    });
});
