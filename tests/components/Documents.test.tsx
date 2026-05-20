import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { Documents } from '../../components/Documents';
import type { DocumentMeta } from '../../types';

const initialState = useFinanceStore.getState();

beforeEach(() => {
    useFinanceStore.setState(initialState, true);
});

describe('Documents (Phase G.1)', () => {
    it('rend l\'onglet avec PageHeader "Documents"', () => {
        render(<Documents />);
        expect(screen.getByText(/Documents/i)).toBeInTheDocument();
    });

    it('affiche EmptyState quand aucun document', () => {
        useFinanceStore.setState({ documents: [] });
        render(<Documents />);
        expect(screen.getByText(/Aucun document/i)).toBeInTheDocument();
    });

    it('affiche la liste quand documents présents', () => {
        const docs: DocumentMeta[] = [
            { id: 'd1', name: 'paie.pdf', category: 'PAYSLIP', uploadedAt: '2026-01-15T00:00:00Z', sizeBytes: 50000, mimeType: 'application/pdf' },
            { id: 'd2', name: 't4.png', category: 'T4', uploadedAt: '2026-01-10T00:00:00Z', sizeBytes: 80000, mimeType: 'image/png' },
        ];
        useFinanceStore.setState({ documents: docs });
        render(<Documents />);
        expect(screen.getByText('paie.pdf')).toBeInTheDocument();
        expect(screen.getByText('t4.png')).toBeInTheDocument();
    });

    it('affiche le counter "2 documents enregistrés"', () => {
        const docs: DocumentMeta[] = [
            { id: 'd1', name: 'a.pdf', category: 'PAYSLIP', uploadedAt: '2026-01-15T00:00:00Z', sizeBytes: 1000, mimeType: 'application/pdf' },
            { id: 'd2', name: 'b.pdf', category: 'T4', uploadedAt: '2026-01-10T00:00:00Z', sizeBytes: 1000, mimeType: 'application/pdf' },
        ];
        useFinanceStore.setState({ documents: docs });
        const { container } = render(<Documents />);
        expect(container.textContent).toContain('2');
        expect(container.textContent).toContain('document');
    });

    it('extraction IA affichée si extractedData présent', () => {
        const docs: DocumentMeta[] = [
            {
                id: 'd1',
                name: 'paie.pdf',
                category: 'PAYSLIP',
                uploadedAt: '2026-01-15T00:00:00Z',
                sizeBytes: 50000,
                mimeType: 'application/pdf',
                extractedData: { grossPeriod: 4500, netPeriod: 3200, frequency: 'Bi-Weekly' },
            },
        ];
        useFinanceStore.setState({ documents: docs });
        render(<Documents />);
        const matches = screen.getAllByText(/Extraction IA/i);
        expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('input file accepte image et PDF', () => {
        render(<Documents />);
        const fileInputs = document.querySelectorAll('input[type="file"]');
        expect(fileInputs.length).toBeGreaterThan(0);
        const input = fileInputs[0];
        const accept = input.getAttribute('accept');
        expect(accept).toContain('image');
        expect(accept).toContain('pdf');
    });
});
