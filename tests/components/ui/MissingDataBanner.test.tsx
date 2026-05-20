import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useFinanceStore } from '../../../store/useFinanceStore';
import { MissingDataBanner, MissingDataChecklist } from '../../../components/ui/MissingDataBanner';
import { Tab } from '../../../types';

const initialState = useFinanceStore.getState();

beforeEach(() => {
    useFinanceStore.setState(initialState, true);
});

describe('MissingDataBanner', () => {
    it('renders nothing when the field is filled', () => {
        useFinanceStore.setState({
            retirementGoal: { ...initialState.retirementGoal, lifeExpectancy: 92 },
        });
        const { container } = render(<MissingDataBanner field="lifeExpectancy" />);
        expect(container.firstChild).toBeNull();
    });

    it('renders a warning banner when the field is missing', () => {
        useFinanceStore.setState({
            retirementGoal: { ...initialState.retirementGoal, lifeExpectancy: undefined },
        });
        render(<MissingDataBanner field="lifeExpectancy" />);
        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(screen.getByText(/Espérance de vie/i)).toBeInTheDocument();
    });

    it('clicking the "Configurer" button triggers navigateWithFocus', () => {
        useFinanceStore.setState({
            retirementGoal: { ...initialState.retirementGoal, lifeExpectancy: undefined },
        });
        render(<MissingDataBanner field="lifeExpectancy" />);
        fireEvent.click(screen.getByText('Configurer →'));
        const focus = useFinanceStore.getState().pendingFocus;
        expect(focus?.tab).toBe(Tab.SETTINGS);
        expect(focus?.section).toBe('profile-lifeExpectancy');
    });

    it('supports inline layout', () => {
        useFinanceStore.setState({
            retirementGoal: { ...initialState.retirementGoal, lifeExpectancy: undefined },
        });
        render(<MissingDataBanner field="lifeExpectancy" layout="inline" />);
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('shows custom message when provided', () => {
        useFinanceStore.setState({
            apiKeys: { ...initialState.apiKeys, anthropic: '' },
        });
        render(<MissingDataBanner field="anthropicKey" message="Configure ta clé pour le diagnostic IA" />);
        expect(screen.getByText(/Configure ta clé pour le diagnostic IA/)).toBeInTheDocument();
    });
});

describe('MissingDataChecklist', () => {
    it('shows progress count + bar', () => {
        useFinanceStore.setState({
            apiKeys: { ...initialState.apiKeys, anthropic: '' },
            retirementGoal: { ...initialState.retirementGoal, lifeExpectancy: 90 },
        });
        const { container } = render(<MissingDataChecklist />);
        expect(screen.getByText(/État de la configuration/)).toBeInTheDocument();
        expect(container.textContent).toMatch(/\d+ \/ \d+/); // count format "x / y"
    });

    it('shows "Configuration complète" when nothing is missing', () => {
        useFinanceStore.setState({
            config: {
                ...initialState.config,
                users: [
                    { name: 'Alice', grossSalary: 80000, netSalary: 60000, age: 35, color: '#fff' } as never,
                    { name: 'Bob', grossSalary: 75000, netSalary: 55000, age: 33, color: '#fff' } as never,
                ],
            },
            retirementGoal: { targetAge: 65, lifeExpectancy: 92, targetMonthlyIncome: 5000, governmentPension: 1200 },
            apiKeys: { eraContext: 'tok', anthropic: 'sk-x', finnhub: '' },
        });
        render(<MissingDataChecklist />);
        expect(screen.getByText(/Configuration complète/)).toBeInTheDocument();
    });

    it('lists missing fields as inline banners', () => {
        useFinanceStore.setState({
            apiKeys: { eraContext: '', anthropic: '', finnhub: '' },
            retirementGoal: { ...initialState.retirementGoal, lifeExpectancy: undefined },
        });
        render(<MissingDataChecklist />);
        // au moins 3 champs manquants (anthropic, era, lifeExpectancy)
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThanOrEqual(3);
    });
});
