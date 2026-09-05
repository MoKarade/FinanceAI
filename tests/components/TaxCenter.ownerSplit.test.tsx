// tests/components/TaxCenter.ownerSplit.test.tsx
//
// [FISC-SOLO-INVEST-SPLIT] L'onglet Impôt impose le revenu de placement chez son DÉTENTEUR
// (`Asset.owner`), plus « ÷ nombre de conjoints ». Le cas qui mordait : couple MONO-salarié —
// la moitié du placement tombait sous le BPA du conjoint sans salaire (impôt 0 sur cette moitié).
// Discriminant : sur l'ancien code, attribuer l'actif à Marc ne changeait pas l'« Impôt Total ».
import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TaxCenter } from '../../components/TaxCenter';
import type { Asset, AssetOwner, BudgetConfig, User } from '../../types';

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, BarChart: P, ComposedChart: P, PieChart: P, LineChart: P,
        Bar: () => null, Area: () => null, Line: () => null, Pie: () => null, Cell: () => null,
        Legend: () => null, ReferenceLine: () => null,
        XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
    };
});

const marc = { name: 'Marc', grossSalary: 5000, netSalary: 3800, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User;
const anna = { name: 'Anna', grossSalary: 0, netSalary: 0, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User;

const couple: BudgetConfig = { users: [marc, anna], splitMode: '50/50' };
const solo: BudgetConfig = { users: [marc] as unknown as BudgetConfig['users'], splitMode: '50/50' };

const nonReg200k = (owner?: AssetOwner): Asset => ({
    symbol: 'ZZZ', name: 'NonReg', quantity: 1, currentPrice: 200_000, buyPrice: 200_000, currency: 'CAD',
    accountType: 'NON-ENREG', ...(owner ? { owner } : {}),
} as Asset);

/** Lit le montant affiché sous l'étiquette « Impôt Total » (vue ménage par défaut). */
function impotTotalAffiche(config: BudgetConfig, assets: Asset[]): string {
    render(<TaxCenter config={config} assets={assets} />);
    const label = screen.getByText('Impôt Total');
    const montant = label.nextElementSibling?.textContent ?? '';
    cleanup();
    return montant;
}

describe('[FISC-SOLO-INVEST-SPLIT] TaxCenter — le placement est imposé chez son détenteur', () => {
    it('couple mono-salarié, actif attribué à Marc : même « Impôt Total » que Marc seul avec cet actif', () => {
        const attribue = impotTotalAffiche(couple, [nonReg200k('user1')]);
        const seul = impotTotalAffiche(solo, [nonReg200k()]);
        expect(attribue).toMatch(/\d/);
        expect(attribue).toBe(seul);
    });

    it('DISCRIMINANT : actif commun (défaut) → moins d\'impôt qu\'attribué à Marc (la moitié d\'Anna tombe sous son BPA) ; l\'ancien code rendait les deux identiques', () => {
        const attribue = impotTotalAffiche(couple, [nonReg200k('user1')]);
        const commun = impotTotalAffiche(couple, [nonReg200k()]);
        expect(commun).not.toBe(attribue);
        const num = (s: string) => Number(s.replace(/[^\d,-]/g, '').replace(',', '.'));
        expect(num(attribue) - num(commun)).toBeGreaterThan(1_000);
    });
});
