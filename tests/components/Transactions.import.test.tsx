/**
 * @vitest-environment jsdom
 *
 * D2 (activation) — l'écran Transactions affichait « importez un CSV » sans AUCUN
 * bouton d'import (l'import vivait seulement dans Réglages) → impasse n°1 pour un
 * nouvel utilisateur. Ces tests verrouillent le CTA d'import :
 *   - sans transaction : le panneau d'import s'affiche AUTOMATIQUEMENT,
 *   - avec transactions : un bouton « Importer un relevé » apparaît et révèle le panneau,
 *   - sans prop onImport : aucun import (rétro-compat).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { Transactions } from '../../components/Transactions';
import type { Transaction } from '../../types';

vi.mock('../../services/claude', () => ({ categorizeBatch: vi.fn() }));
vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

const TX: Transaction = { id: 1, date: '2026-01-01', payee: 'Alpha', amount: -100, category: 'Autre', status: 'processed' };

// « Choisir un fichier… » est unique au panneau ImportBankStatement (≠ libellé du bouton d'en-tête).
const PANEL = /Choisir un fichier/i;
const IMPORT_BTN = /Importer un relevé/i;

describe('Transactions — CTA d\'import (D2 activation)', () => {
    it('sans transaction : le panneau d\'import est affiché automatiquement', () => {
        render(<Transactions transactions={[]} setTransactions={vi.fn()} apiKey="" budgetItems={[]} onImport={vi.fn()} />);
        expect(screen.getByText(PANEL)).toBeInTheDocument();
    });

    it('avec transactions : bouton « Importer un relevé » présent, panneau masqué jusqu\'au clic', () => {
        render(<Transactions transactions={[TX]} setTransactions={vi.fn()} apiKey="" budgetItems={[]} onImport={vi.fn()} />);
        const btn = screen.getByRole('button', { name: IMPORT_BTN });
        expect(btn).toBeInTheDocument();
        expect(screen.queryByText(PANEL)).toBeNull(); // pas encore ouvert
        fireEvent.click(btn);
        expect(screen.getByText(PANEL)).toBeInTheDocument(); // révélé au clic
    });

    it('sans prop onImport : aucun bouton ni panneau d\'import (rétro-compat)', () => {
        render(<Transactions transactions={[TX]} setTransactions={vi.fn()} apiKey="" budgetItems={[]} />);
        expect(screen.queryByRole('button', { name: IMPORT_BTN })).toBeNull();
        expect(screen.queryByText(PANEL)).toBeNull();
    });
});
