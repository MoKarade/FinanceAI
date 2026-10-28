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

// [S5-REFONTE-TRANSACTIONS] La disclosure `<details>` devient le bouton « Importer CSV / PDF » de
// l'en-tête (maquettes) : le panneau est RENDU quand il est ouvert, absent sinon — la présence du
// panneau redevient donc un discriminant fiable (plus de `<details>` que jsdom laisse visible).
const BOUTON = { name: /Importer CSV \/ PDF/ };

describe('Transactions — CTA d\'import (D2 activation + FINTABLE-4 repli masqué)', () => {
    it('sans transaction : le panneau d\'import est affiché automatiquement', () => {
        render(<Transactions transactions={[]} setTransactions={vi.fn()} apiKey="" budgetItems={[]} onImport={vi.fn()} />);
        expect(screen.getByText(PANEL)).toBeInTheDocument();
        expect(screen.getByText(IMPORT_SUMMARY)).toBeInTheDocument();
        expect(screen.getByRole('button', BOUTON)).toHaveAttribute('aria-expanded', 'true');
    });

    it('avec transactions : import REPLIÉ par défaut, le bouton de l\'en-tête le révèle', () => {
        render(<Transactions transactions={[TX]} setTransactions={vi.fn()} apiKey="" budgetItems={[]} onImport={vi.fn()} />);
        const bouton = screen.getByRole('button', BOUTON);
        expect(bouton).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText(PANEL)).toBeNull(); // replié par défaut
        fireEvent.click(bouton);
        expect(bouton).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText(PANEL)).toBeInTheDocument(); // révélé au clic
    });

    it('sans prop onImport : aucun bouton ni panneau d\'import (rétro-compat)', () => {
        render(<Transactions transactions={[TX]} setTransactions={vi.fn()} apiKey="" budgetItems={[]} />);
        expect(screen.queryByRole('button', BOUTON)).toBeNull();
        expect(screen.queryByText(IMPORT_SUMMARY)).toBeNull();
        expect(screen.queryByText(PANEL)).toBeNull();
    });
});
