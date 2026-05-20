import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useFinanceStore } from '../../../store/useFinanceStore';
import { PayslipUploadCard } from '../../../components/settings/PayslipUploadCard';

vi.mock('../../../services/claude', () => ({
    analyzePayslip: vi.fn(),
}));

vi.mock('../../../components/ui/Toast', () => ({
    showToast: vi.fn(),
}));

const initialState = useFinanceStore.getState();

beforeEach(() => {
    useFinanceStore.setState(initialState, true);
    vi.clearAllMocks();
});

describe('PayslipUploadCard', () => {
    it('affiche un message "configure la clé" quand pas de clé Anthropic', () => {
        useFinanceStore.setState({ apiKeys: { ...initialState.apiKeys, anthropic: '' } });
        render(<PayslipUploadCard />);
        expect(screen.getByText(/Configure la clé Anthropic/i)).toBeInTheDocument();
    });

    it('affiche "Cliquer ou glisser un fichier" quand clé présente', () => {
        useFinanceStore.setState({ apiKeys: { ...initialState.apiKeys, anthropic: 'sk-test' } });
        render(<PayslipUploadCard />);
        expect(screen.getByText(/Cliquer ou glisser/i)).toBeInTheDocument();
    });

    it('ne montre PAS de radio user1/user2 en mode individuel', () => {
        useFinanceStore.setState({
            apiKeys: { ...initialState.apiKeys, anthropic: 'sk-test' },
            config: {
                ...initialState.config,
                users: [
                    { ...initialState.config.users[0], name: 'Alice' },
                    { ...initialState.config.users[1], name: '' },
                ],
            },
        });
        render(<PayslipUploadCard />);
        expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    });

    it('montre les radios user1/user2 en mode couple', () => {
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
        render(<PayslipUploadCard />);
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('accepte image et PDF dans le file input', () => {
        useFinanceStore.setState({ apiKeys: { ...initialState.apiKeys, anthropic: 'sk-test' } });
        const { container } = render(<PayslipUploadCard />);
        const input = container.querySelector('input[type="file"]');
        expect(input?.getAttribute('accept')).toContain('image');
        expect(input?.getAttribute('accept')).toContain('pdf');
    });
});
