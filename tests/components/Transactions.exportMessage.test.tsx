/**
 * [EXPORT-CSV-LIBELLE] — Transactions : le bouton d'export s'appelle « Exporter (CSV) » et un
 * message dit combien de transactions ont été téléchargées. Un refus (mode discret / données
 * fictives) n'affiche JAMAIS « Fichier téléchargé ».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Transactions } from '../../components/Transactions';
import { showToast } from '../../components/ui/Toast';
import type { Transaction } from '../../types';

vi.mock('../../services/claude', () => ({ categorizeBatch: vi.fn() }));
vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

const csv = vi.hoisted(() => ({
    exportTransactionsCSV: vi.fn(() => 'contenu'),
    downloadCSV: vi.fn(),
    dateForFilename: vi.fn(() => '2026-10-15'),
}));
vi.mock('../../utils/csvExport', () => csv);

const tx = (id: number, payee: string): Transaction => ({
    id, date: `2026-01-${String(id).padStart(2, '0')}`, payee, amount: -50 * id, category: 'Épicerie', status: 'processed',
});

beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(showToast).mockClear();
    csv.downloadCSV.mockReset();
    csv.exportTransactionsCSV.mockReset().mockReturnValue('contenu');
});

const cliquerExport = () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'Exporter (CSV)' })[0]);
};

describe('[EXPORT-CSV-LIBELLE] bouton et message d\'export', () => {
    it('le bouton s\'appelle « Exporter (CSV) » et le message donne le nombre (pluriel)', async () => {
        render(<Transactions transactions={[tx(1, 'IGA'), tx(2, 'Metro')]} setTransactions={vi.fn()} apiKey="" budgetItems={[]} />);
        cliquerExport();
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('Fichier téléchargé : 2 transactions', 'success'));
        expect(csv.downloadCSV).toHaveBeenCalledTimes(1);
    });

    it('une seule transaction : singulier', async () => {
        render(<Transactions transactions={[tx(1, 'IGA')]} setTransactions={vi.fn()} apiKey="" budgetItems={[]} />);
        cliquerExport();
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('Fichier téléchargé : 1 transaction', 'success'));
    });

    it('un export refusé ne dit jamais « Fichier téléchargé »', async () => {
        csv.exportTransactionsCSV.mockImplementation(() => {
            const e = new Error('refus'); e.name = 'CsvRefusedPrivacyError'; throw e;
        });
        render(<Transactions transactions={[tx(1, 'IGA')]} setTransactions={vi.fn()} apiKey="" budgetItems={[]} />);
        cliquerExport();
        await waitFor(() => expect(showToast).toHaveBeenCalled());
        expect(showToast).not.toHaveBeenCalledWith(expect.stringContaining('Fichier téléchargé'), expect.anything());
        expect(csv.downloadCSV).not.toHaveBeenCalled();
    });
});
