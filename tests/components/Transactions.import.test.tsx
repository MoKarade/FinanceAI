/**
 * @vitest-environment jsdom
 *
 * D2 (activation) — l'écran Transactions affichait « importez un CSV » sans AUCUN
 * bouton d'import (l'import vivait seulement dans Réglages) → impasse n°1 pour un
 * nouvel utilisateur. Ces tests verrouillent le CTA d'import :
 *   - sans transaction : le panneau d'import s'affiche AUTOMATIQUEMENT (details ouvert),
 *   - avec transactions : une disclosure « Importer un relevé » REPLIÉE par défaut
 *     (FINTABLE-4 : déplacée hors des actions du header maintenant que Fintable
 *     synchronise automatiquement) révèle le panneau au clic,
 *   - sans prop onImport : aucun import (rétro-compat).
 *
 * ⚠️ jsdom n'applique PAS le display:none UA d'un `<details>` fermé (pas de règle UA)
 * → le contenu reste TROUVABLE dans le DOM même replié. Le discriminant de « replié par
 * défaut » est donc l'attribut `open` de l'élément `<details>`, jamais `queryByText`
 * (cf CLAUDE.md [[INVEST-CHART-CLEAN]] / tests HistorySyncDoctor, HistoryCoverageNote).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { Transactions } from '../../components/Transactions';
import type { Transaction } from '../../types';

vi.mock('../../services/claude', () => ({ categorizeBatch: vi.fn() }));
vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

const TX: Transaction = { id: 1, date: '2026-01-01', payee: 'Alpha', amount: -100, category: 'Autre', status: 'processed' };

// La description « CSV exporté de ta banque… » est unique au panneau ImportBankStatement
// (≠ libellé de la disclosure « Importer un relevé » et ≠ titre de la carte).
const PANEL = /CSV exporté de ta banque/i;
// Distinct de la carte ImportBankStatement (« Importer un relevé bancaire… ») — nom
// choisi pour ne PAS collisionner avec le titre du panneau (jsdom garde les DEUX dans
// le DOM même details fermé, donc un `getByText` non-discriminant matcherait les 2).
const IMPORT_SUMMARY = /Import manuel \(repli/i;

describe('Transactions — CTA d\'import (D2 activation + FINTABLE-4 repli masqué)', () => {
    it('sans transaction : le panneau d\'import est affiché automatiquement (details ouvert)', () => {
        const { container } = render(<Transactions transactions={[]} setTransactions={vi.fn()} apiKey="" budgetItems={[]} onImport={vi.fn()} />);
        expect(screen.getByText(PANEL)).toBeInTheDocument();
        expect(container.querySelector('details')?.open).toBe(true);
    });

    it('avec transactions : disclosure « Import manuel » REPLIÉE par défaut, révèle le panneau au clic', () => {
        const { container } = render(<Transactions transactions={[TX]} setTransactions={vi.fn()} apiKey="" budgetItems={[]} onImport={vi.fn()} />);
        const summary = screen.getByText(IMPORT_SUMMARY);
        expect(summary).toBeInTheDocument();
        const details = container.querySelector('details') as HTMLDetailsElement;
        expect(details).toBeInTheDocument();
        expect(details.open).toBe(false); // repliée par défaut — discriminant sur `open`, pas sur la présence du panneau
        fireEvent.click(summary);
        expect(details.open).toBe(true); // révélée au clic
        expect(screen.getByText(PANEL)).toBeInTheDocument();
    });

    it('sans prop onImport : aucune disclosure ni panneau d\'import (rétro-compat)', () => {
        const { container } = render(<Transactions transactions={[TX]} setTransactions={vi.fn()} apiKey="" budgetItems={[]} />);
        expect(screen.queryByText(IMPORT_SUMMARY)).toBeNull();
        expect(screen.queryByText(PANEL)).toBeNull();
        expect(container.querySelector('details')).toBeNull();
    });
});
