// CA-04 — smoke test : DebtManager (money-critical, aucun test direct jusqu'ici).
// Vérifie qu'il rend SANS CRASH (liste vide → EmptyState ; avec dette → affichée).
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DebtManager } from '../../components/DebtManager';
import type { Debt } from '../../types';

// recharts : jsdom n'a pas de dimensions SVG → passthrough.
vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, AreaChart: P, Area: () => null,
        XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
    };
});

describe('DebtManager — smoke (CA-04)', () => {
    it('rend sans crash avec une liste vide', () => {
        const { container } = render(<DebtManager debts={[]} setDebts={vi.fn()} />);
        expect(container).toBeTruthy();
    });

    it('affiche une dette fournie', () => {
        const debts: Debt[] = [
            { id: 'd1', name: 'Carte Visa', balance: 5000, interestRate: 19.99, minimumPayment: 150, category: 'CreditCard' },
        ];
        render(<DebtManager debts={debts} setDebts={vi.fn()} />);
        expect(screen.getByText(/Carte Visa/)).toBeTruthy();
        // [A11Y-SLIDERS] le slider de paiement supplémentaire porte un nom accessible.
        expect(screen.getByRole('slider', { name: 'Paiement Mensuel Supplémentaire' })).toBeInTheDocument();
    });

    // [FMT-CURRENCY-UNIFY] garde : aucun montant rendu en float brut « 1100$ » (sans
    // séparateur de milliers) — tout passe par formatCAD (fr-CA : « 1 100 $ »).
    it('formate les montants en fr-CA (pas de float brut collé au $)', () => {
        const debts: Debt[] = [
            { id: 'd1', name: 'Prêt auto', balance: 37000, interestRate: 6.5, minimumPayment: 1100, category: 'Car' },
        ];
        const { container } = render(<DebtManager debts={debts} setDebts={vi.fn()} />);
        const text = container.textContent ?? '';
        // 4 chiffres ou plus collés à « $ » = formatage manuel oublié (ex. « 1100$ », « 37000$ »).
        expect(text).not.toMatch(/\d{4,}\$/);
        // La devise est bien présente (montants formatés).
        expect(text).toContain('$');
    });
});
