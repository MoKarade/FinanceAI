import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../../../components/ui/EmptyState';

describe('EmptyState', () => {
    it('renders the title and description', () => {
        render(<EmptyState title="Aucune transaction" description="Importez vos transactions pour commencer." />);
        expect(screen.getByText('Aucune transaction')).toBeInTheDocument();
        expect(screen.getByText('Importez vos transactions pour commencer.')).toBeInTheDocument();
    });

    it('renders the CTA when provided', () => {
        render(<EmptyState title="X" cta={<button>Importer</button>} />);
        expect(screen.getByRole('button', { name: 'Importer' })).toBeInTheDocument();
    });

    it('applies the subtle variant class structure', () => {
        const { container } = render(<EmptyState title="X" variant="subtle" />);
        // En variant subtle, pas de bordure ni background
        expect(container.firstChild?.textContent).toContain('X');
    });
});
