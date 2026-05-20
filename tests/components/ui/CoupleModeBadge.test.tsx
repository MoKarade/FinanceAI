import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CoupleModeBadge } from '../../../components/ui/CoupleModeBadge';
import { useFinanceStore } from '../../../store/useFinanceStore';

// Saved initial state so each test can reset.
const initialState = useFinanceStore.getState();

beforeEach(() => {
    useFinanceStore.setState(initialState, true);
});

describe('CoupleModeBadge', () => {
    it('renders "Individuel" when user2 has empty name', () => {
        useFinanceStore.setState({
            config: {
                ...initialState.config,
                users: [
                    { ...initialState.config.users[0], name: 'Alice' },
                    { ...initialState.config.users[1], name: '' },
                ],
            },
        });
        render(<CoupleModeBadge />);
        expect(screen.getByText('Individuel')).toBeInTheDocument();
    });

    it('renders "Couple" when user2 has a non-empty name', () => {
        useFinanceStore.setState({
            config: {
                ...initialState.config,
                users: [
                    { ...initialState.config.users[0], name: 'Alice' },
                    { ...initialState.config.users[1], name: 'Bob' },
                ],
            },
        });
        render(<CoupleModeBadge />);
        expect(screen.getByText('Couple')).toBeInTheDocument();
    });

    it('is read-only (not a button)', () => {
        render(<CoupleModeBadge />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('exposes an aria-label describing the mode', () => {
        render(<CoupleModeBadge />);
        const badge = screen.getByLabelText(/Mode (Couple|Individuel) actif/);
        expect(badge).toBeInTheDocument();
    });
});
