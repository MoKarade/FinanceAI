// tests/utils/spendRules.test.ts
//
// [TX-INTERAC-BUDGET] « Remboursement » compte comme une VRAIE dépense (décision Marc 2026-07-31,
// réponse 2 du cadrage : un Interac à sa conjointe EST une dépense).
//
// Discriminant : sur le code d'avant, « Remboursement » était dans `NON_BUDGET_CATEGORIES` → ces
// montants n'apparaissaient NI en dépense NI en revenu. Remettre cette entrée dans le Set fait
// échouer les deux premiers tests.

import { describe, it, expect } from 'vitest';
import {
    isSpend,
    spendAmountOf,
    CREDIT_BACK_CATEGORIES,
} from '../../utils/spendRules';
import {
    historicalMonthlyAverage,
    computeMonthlyActualAverages,
} from '../../utils/budgetSync';
import type { Transaction } from '../../types';

const tx = (over: Partial<Transaction> & Pick<Transaction, 'id' | 'date' | 'amount' | 'category'>): Transaction => ({
    payee: 'Virement Interac a Julie',
    status: 'processed',
    ...over,
});

describe('isSpend — Remboursement est une dépense de budget', () => {
    it('compte un Interac SORTANT comme une dépense', () => {
        expect(isSpend(tx({ id: 1, date: '2026-05-10', amount: -250, category: 'Remboursement' }))).toBe(true);
    });

    it('compte un remboursement REÇU comme un CRÉDIT (pas un revenu, pas une ligne ignorée)', () => {
        const received = tx({ id: 2, date: '2026-05-12', amount: 250, category: 'Remboursement' });
        expect(isSpend(received)).toBe(true);
        expect(spendAmountOf(received)).toBe(-250); // vient EN DÉDUCTION du poste
        expect(CREDIT_BACK_CATEGORIES.has('Remboursement')).toBe(true);
    });

    it('ne crédite PAS une entrée d\'une autre catégorie (seul « Remboursement » a ce régime)', () => {
        expect(isSpend(tx({ id: 3, date: '2026-05-12', amount: 250, category: 'Épicerie' }))).toBe(false);
        expect(isSpend(tx({ id: 4, date: '2026-05-12', amount: 250, category: 'Salaire' }))).toBe(false);
    });

    it('laisse les mouvements internes et les doublons hors des dépenses', () => {
        expect(isSpend(tx({ id: 5, date: '2026-05-10', amount: -250, category: 'Transfert' }))).toBe(false);
        expect(isSpend(tx({ id: 6, date: '2026-05-10', amount: -250, category: 'Épicerie', isTransfer: true }))).toBe(false);
        expect(isSpend(tx({ id: 7, date: '2026-05-10', amount: -250, category: 'Épicerie', isDuplicate: true }))).toBe(false);
    });

    it('une sortie apporte un montant POSITIF au total, un crédit un montant NÉGATIF', () => {
        expect(spendAmountOf(tx({ id: 8, date: '2026-05-10', amount: -250, category: 'Remboursement' }))).toBe(250);
        expect(spendAmountOf(tx({ id: 9, date: '2026-05-12', amount: 250, category: 'Remboursement' }))).toBe(-250);
    });
});

describe('moyennes de budget — le net du poste est ce que ça a coûté', () => {
    const ref = new Date('2026-06-15T12:00:00Z');

    it('la moyenne du poste « Remboursement » est NETTE des remboursements reçus', () => {
        // Avril : 300 $ envoyés, 100 $ reçus → net 200 $. Mai : 200 $ envoyés → net 200 $.
        const rows: Transaction[] = [
            tx({ id: 1, date: '2026-04-05', amount: -300, category: 'Remboursement' }),
            tx({ id: 2, date: '2026-04-20', amount: 100, category: 'Remboursement' }),
            tx({ id: 3, date: '2026-05-05', amount: -200, category: 'Remboursement' }),
        ];
        // Fenêtre = mois pleins depuis avril → avril + mai = 2 mois. (300−100+200)/2 = 200.
        expect(historicalMonthlyAverage(rows, 'Remboursement', ref)).toBe(200);
    });

    it('ne rend JAMAIS une cible négative même si les crédits dépassent les sorties', () => {
        const rows: Transaction[] = [
            tx({ id: 1, date: '2026-04-05', amount: -50, category: 'Remboursement' }),
            tx({ id: 2, date: '2026-04-20', amount: 400, category: 'Remboursement' }),
        ];
        expect(historicalMonthlyAverage(rows, 'Remboursement', ref)).toBe(0);
    });

    it('le TOTAL global crédite sur la même base que le poste (pas deux calculs divergents)', () => {
        const rows: Transaction[] = [
            tx({ id: 1, date: '2026-04-05', amount: -300, category: 'Remboursement' }),
            tx({ id: 2, date: '2026-04-20', amount: 100, category: 'Remboursement' }),
            tx({ id: 3, date: '2026-05-05', amount: -200, category: 'Remboursement' }),
        ];
        const avgGlobal = computeMonthlyActualAverages(rows, ref).expenseAvg;
        const avgPoste = historicalMonthlyAverage(rows, 'Remboursement', ref);
        expect(avgGlobal).toBe(avgPoste);
    });

    it('un crédit ISOLÉ n\'érode PAS les dépenses des AUTRES postes (finding mesuré par dataAwareTools)', () => {
        // 500 $ reçus en remboursement, aucune sortie « Remboursement » dans la fenêtre : les
        // 400 $ de restaurants restent des dépenses bien réelles. Le crédit est borné à SON poste.
        const rows: Transaction[] = [
            tx({ id: 1, date: '2026-05-20', amount: 500, category: 'Remboursement' }),
            tx({ id: 2, date: '2026-05-05', amount: -400, category: 'Restaurants' }),
        ];
        expect(computeMonthlyActualAverages(rows, ref).expenseAvg).toBe(400);
    });

    it('un remboursement reçu n\'est JAMAIS compté comme un revenu', () => {
        const rows: Transaction[] = [
            tx({ id: 1, date: '2026-04-20', amount: 100, category: 'Remboursement' }),
        ];
        const r = computeMonthlyActualAverages(rows, ref);
        expect(r.incomeAvg).toBe(0);
        expect(r.salaryAvg).toBe(0);
        expect(r.otherAvg).toBe(0);
    });
});
