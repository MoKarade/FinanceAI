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
        // ⚠️ Dates RELATIVES à aujourd'hui, jamais figées : le composant lit l'horloge
        // (`subscriptionAlerts` déclare l'abo « arrêté » quand le dernier débit date de plus de
        // deux cycles), donc une fixture à dates fixes devient une BOMBE — vécu le 2026-09-05,
        // 62 jours après le dernier débit figé, l'alerte « Plus débité depuis N jours » a rendu
        // un DEUXIÈME « Netflix » et `getByText` a rougi sur un dépôt inchangé.
        const transactions: Transaction[] = [65, 35, 5].map((jours, i) => {
            const d = new Date();
            d.setDate(d.getDate() - jours);
            return { id: i + 1, date: d.toISOString().slice(0, 10), payee: 'Netflix', amount: -18, category: 'Loisirs', status: 'processed' } as unknown as Transaction;
        });
        render(<Planning transactions={transactions} />);
        expect(screen.queryByText(/Aucun abonnement détecté/)).not.toBeInTheDocument();
        // La fixture décrit un abo ACTIF (dernier débit il y a 5 jours) : aucune alerte d'arrêt.
        // Si cette ligne rougit un jour, c'est la fixture qui a re-dérivé vers le cas « arrêté ».
        expect(screen.queryByText(/Plus débité depuis/)).not.toBeInTheDocument();
        expect(screen.getByText('Netflix')).toBeInTheDocument();
    });
});
