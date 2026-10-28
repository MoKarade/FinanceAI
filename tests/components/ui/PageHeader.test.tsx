import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '../../../components/ui/PageHeader';

describe('PageHeader', () => {
    it('renders the title as h1', () => {
        render(<PageHeader title="Dashboard" />);
        expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    });

    it('renders subtitle when provided', () => {
        render(<PageHeader title="Dashboard" subtitle="Vue d'ensemble" />);
        expect(screen.getByText("Vue d'ensemble")).toBeInTheDocument();
    });

    it('renders actions and badge slots', () => {
        render(
            <PageHeader
                title="X"
                badge={<span data-testid="badge">B</span>}
                actions={<button>Action</button>}
            />
        );
        expect(screen.getByTestId('badge')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
    });
});
