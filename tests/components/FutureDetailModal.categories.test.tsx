/**
 * [FUTUR-DETAIL-CATEGORIES-MOIS] Le rendu de la ventilation par catégorie dans le panneau.
 *
 * ⚠️ Ce que ces tests protègent, et que les tests du service ne couvrent pas : la FRONTIÈRE
 * réel/projeté. Le service est juste ; ce qui peut mentir, c'est de l'afficher là où il ne faut
 * pas. Un mois FUTUR n'a aucune transaction — le moteur applique des postes budgétaires — donc y
 * rendre une ventilation présenterait du projeté comme du constaté.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { FutureDetailModal } from '../../components/projection/FutureDetailModal';
import type { ProjectionChartPoint } from '../../services/projection/types';
import type { Transaction } from '../../types';

vi.mock('recharts', async () => {
    const R = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => R.createElement('div', null, children);
    return {
        ResponsiveContainer: P, ComposedChart: P, Area: () => null, XAxis: () => null,
        YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null, ReferenceDot: () => null,
    };
});

const point = { monthIndex: 3, year: 2026, dateLabel: 'juil. 2026', NetWorth: 1_000 } as unknown as ProjectionChartPoint;

const txn = (o: Partial<Transaction>): Transaction =>
    ({ id: 1, date: '2026-07-05', payee: 'X', amount: -10, category: 'Épicerie', status: 'processed', ...o }) as Transaction;

const TXNS = [
    txn({ id: 1, amount: -400, category: 'Loyer' }),
    txn({ id: 2, amount: -100, category: 'Épicerie' }),
    txn({ id: 3, amount: -50, category: 'Épicerie' }),
];

const rendre = (monthIso: string | null, transactions: Transaction[] = TXNS) =>
    render(
        <FutureDetailModal
            point={point} chartData={[point]} transactions={transactions}
            monthIso={monthIso} onClose={vi.fn()}
        />,
    );

const texte = () => (document.body.textContent || '').replace(/\s+/g, '');

describe('[FUTUR-DETAIL-CATEGORIES-MOIS] rendu sur un mois PASSÉ', () => {
    it('liste les catégories, de la plus lourde à la plus légère', () => {
        rendre('2026-07');
        expect(texte()).toContain('Dépensesdumoisparcatégorie');
        const ordre = [...document.querySelectorAll('span')]
            .map((e) => e.textContent || '')
            .filter((t) => t.startsWith('Loyer') || t.startsWith('Épicerie'));
        expect(ordre[0]).toContain('Loyer');
    });

    it('affiche le NOMBRE de transactions par catégorie', () => {
        rendre('2026-07');
        // Une catégorie à 1 ligne ne se lit pas comme une à 40 : le compte fait partie de l'info.
        expect(texte()).toContain('2transactions');
        expect(texte()).toContain('1transaction');
    });

    // ⚠️ Une dépense sans catégorie est DITE, jamais fondue dans un « Autre » inventé.
    it('signale les dépenses sans catégorie, à classer', () => {
        rendre('2026-07', [...TXNS, txn({ id: 9, amount: -30, category: '' })]);
        expect(texte()).toContain('pasdecatégorie');
        expect(texte()).toContain('àclasserdansTransactions');
    });

    it('sans dépense sans catégorie, aucun avertissement (pas de bruit permanent)', () => {
        rendre('2026-07');
        // Anti-sur-correctif : sans cette garde, afficher l'avertissement en permanence resterait vert.
        expect(texte()).not.toContain('àclasserdansTransactions');
    });
});

describe('[FUTUR-DETAIL-CATEGORIES-MOIS] la frontière réel / projeté', () => {
    // LE test du lot. `monthIso` est null sur un mois futur : y rendre une ventilation
    // présenterait des postes budgétaires projetés comme des dépenses constatées.
    it('mois FUTUR (aucun `monthIso`) → AUCUNE section', () => {
        rendre(null);
        expect(screen.queryByText('Dépenses du mois par catégorie')).toBeNull();
    });

    it('mois passé SANS dépense → aucune section vide', () => {
        rendre('2026-07', []);
        expect(screen.queryByText('Dépenses du mois par catégorie')).toBeNull();
    });
});
