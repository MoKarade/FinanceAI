// tests/components/Planning.smoke.test.tsx
// [NAV-REMOVE-OBJECTIFS-TAB] Filet de sécurité minimal : `Planning.tsx` n'avait plus AUCUN test de
// rendu après le retrait de `PlanningGoals.test.tsx` (qui ne ciblait que la section Objectifs
// retirée) — la logique pure sous-jacente reste testée séparément
// (`tests/utils/subscriptions.test.ts`, `tests/services/transactions/subscriptionAlerts.test.ts`),
// mais pas le CÂBLAGE JSX. Baseline de non-régression avant la refonte `[BUDGET-CHARGES-FIXES-REFONTE]`.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Planning } from '../../components/Planning';
import type { Transaction } from '../../types';

vi.mock('../../services/claude', () => ({ detectSubscriptionsAI: vi.fn() }));
vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

describe('Planning — rendu de base (Charges fixes & Abonnements)', () => {
    it('se rend sans crash, sans transactions', () => {
        const { container } = render(<Planning transactions={[]} />);
        expect(container.firstChild).toBeTruthy();
        expect(screen.getByText('Charges Fixes & Abonnements')).toBeInTheDocument();
        expect(screen.getByText(/Abonnements & Récurrents/)).toBeInTheDocument();
        expect(screen.getByText(/Calendrier des Factures/)).toBeInTheDocument();
        expect(screen.getByText(/Aucun abonnement détecté/)).toBeInTheDocument();
    });

    it('détecte un abonnement récurrent depuis les transactions (heuristique)', () => {
        // 3 débits mensuels stables au même montant/marchand → détecté comme récurrent.
        const transactions: Transaction[] = [
            { id: 1, date: '2026-05-05', payee: 'Netflix', amount: -18, category: 'Loisirs', status: 'processed' } as unknown as Transaction,
            { id: 2, date: '2026-06-05', payee: 'Netflix', amount: -18, category: 'Loisirs', status: 'processed' } as unknown as Transaction,
            { id: 3, date: '2026-07-05', payee: 'Netflix', amount: -18, category: 'Loisirs', status: 'processed' } as unknown as Transaction,
        ];
        render(<Planning transactions={transactions} />);
        expect(screen.queryByText(/Aucun abonnement détecté/)).not.toBeInTheDocument();
        expect(screen.getByText('Netflix')).toBeInTheDocument();
    });
});
