// tests/utils/budgetSync.test.ts
// [BUDGET-TX-CATEGORIES] — le Budget = seulement et exactement les catégories des transactions
// (verbatim Marc 2026-07-15). Sync idempotente + historique mensuel par catégorie.

import { describe, it, expect } from 'vitest';
import { syncBudgetWithTransactionCategories, buildCategoryMonthlyHistory, lastMonths } from '../../utils/budgetSync';
import type { BudgetCategory, Transaction } from '../../types';

const REF = new Date(2026, 6, 15); // 15 juillet 2026 (mois 6 = juillet)

let seq = 1;
const tx = (over: Partial<Transaction>): Transaction => ({
    id: seq++, date: '2026-07-02', payee: 'X', amount: -50, category: 'Épicerie',
    status: 'processed', isTransfer: false, isDuplicate: false,
    ...over,
} as Transaction);

const item = (name: string, target = 100): BudgetCategory => ({
    id: `cat_${name}`, name, target, frequency: 'Monthly', type: 'Commun', nature: 'Besoin',
});

describe('syncBudgetWithTransactionCategories', () => {
    it('AJOUTE les catégories observées manquantes (cible = MOYENNE sur fenêtre 6 mois, zéros inclus) et RETIRE les postes sans transaction', () => {
        const transactions = [
            tx({ category: 'Épicerie', amount: -100, date: '2026-05-10' }),
            tx({ category: 'Épicerie', amount: -300, date: '2026-06-10' }),
            tx({ category: 'Épicerie', amount: -200, date: '2026-07-02' }),
            tx({ category: 'Restaurants', amount: -80, date: '2026-07-03' }),
        ];
        const existing = [item('Restaurants', 250), item('Loisirs', 400)]; // Loisirs : aucune tx
        const r = syncBudgetWithTransactionCategories(transactions, existing, REF);
        expect(r.changed).toBe(true);
        expect(r.added).toEqual(['Épicerie']);
        expect(r.removed).toEqual(['Loisirs']);
        const names = r.items.map(i => i.name).sort();
        expect(names).toEqual(['Restaurants', 'Épicerie'].sort());
        // Poste conservé INTACT (cible utilisateur préservée)
        expect(r.items.find(i => i.name === 'Restaurants')!.target).toBe(250);
        // Cible = run-rate : (100+300+200)/6 mois = 100 — PAS la médiane des mois actifs (200)
        const epicerie = r.items.find(i => i.name === 'Épicerie')!;
        expect(epicerie.target).toBe(100);
        expect(epicerie.nature).toBe('Besoin');
    });

    it('cible run-rate : un poste PONCTUEL (Voyages 2400 $ un seul mois) ne devient PAS 2400 $/mois (finding F1)', () => {
        const transactions = [tx({ category: 'Voyages', amount: -2400, date: '2026-06-05' })];
        const r = syncBudgetWithTransactionCategories(transactions, [], REF);
        expect(r.items[0].target).toBe(400); // 2400 / 6 mois — même total annualisé que la réalité
    });

    it('RENOMME (réglages préservés) un poste flou-rapprochable au lieu de le supprimer/recréer (finding F2)', () => {
        const transactions = [tx({ category: 'Restaurants', amount: -80, date: '2026-07-03' })];
        const existing = [{ ...item('Restaurant', 350), nature: 'Envie' as const, type: 'Perso 1' as const }];
        const r = syncBudgetWithTransactionCategories(transactions, existing, REF);
        expect(r.changed).toBe(true);
        expect(r.renamed).toEqual(['Restaurant → Restaurants']);
        expect(r.removed).toEqual([]);
        expect(r.added).toEqual([]);
        const it0 = r.items.find(i => i.name === 'Restaurants')!;
        expect(it0.target).toBe(350);      // cible UTILISATEUR préservée (pas la moyenne suggérée)
        expect(it0.nature).toBe('Envie');
        expect(it0.type).toBe('Perso 1');
    });

    it('Impôts n\'est JAMAIS un poste de budget (revenu net déjà après impôt — finding F3)', () => {
        const transactions = [tx({ category: 'Impôts', amount: -475.96, date: '2026-04-30' })];
        const r = syncBudgetWithTransactionCategories(transactions, [], REF);
        expect(r.changed).toBe(false);
        expect(r.items).toEqual([]);
    });

    it('IDEMPOTENTE : un 2e passage sur le résultat → zéro dérive (même référence)', () => {
        const transactions = [tx({ category: 'Épicerie' }), tx({ category: 'Transport' })];
        const first = syncBudgetWithTransactionCategories(transactions, [], REF);
        expect(first.changed).toBe(true);
        const second = syncBudgetWithTransactionCategories(transactions, first.items, REF);
        expect(second.changed).toBe(false);
        expect(second.items).toBe(first.items);
    });

    it('IGNORE revenus, transferts, doublons, statuts « à classer » — jamais des postes de budget', () => {
        const transactions = [
            tx({ category: 'Salaire', amount: 3000 }),               // revenu (positif)
            tx({ category: 'Salaire', amount: -10 }),                // même classé dépense : revenu exclu
            tx({ category: 'Transfert', amount: -500 }),
            tx({ category: 'Épicerie', amount: -50, isTransfer: true }),
            tx({ category: 'Épicerie', amount: -50, isDuplicate: true }),
            tx({ category: 'Uncategorized', amount: -50 }),
            tx({ category: 'Non catégorisé', amount: -50 }),
        ];
        const r = syncBudgetWithTransactionCategories(transactions, [], REF);
        expect(r.changed).toBe(false);
        expect(r.items).toEqual([]);
    });

    it('NO-OP sur transactions vides (ne vide JAMAIS le budget sur un état pas hydraté)', () => {
        const existing = [item('Épicerie')];
        const r = syncBudgetWithTransactionCategories([], existing, REF);
        expect(r.changed).toBe(false);
        expect(r.items).toBe(existing);
    });
});

describe('buildCategoryMonthlyHistory', () => {
    it('totaux mensuels par catégorie (12 mois), tri par total décroissant, moyenne sur mois ACTIFS', () => {
        const transactions = [
            tx({ category: 'Épicerie', amount: -100, date: '2026-07-02' }),
            tx({ category: 'Épicerie', amount: -50, date: '2026-07-20' }),
            tx({ category: 'Épicerie', amount: -200, date: '2026-06-05' }),
            tx({ category: 'Restaurants', amount: -30, date: '2026-07-01' }),
            tx({ category: 'Épicerie', amount: -999, date: '2025-06-05' }), // hors fenêtre 12 mois
        ];
        const h = buildCategoryMonthlyHistory(transactions, ['Épicerie', 'Restaurants'], 12, REF);
        expect(h.months).toHaveLength(12);
        expect(h.months[11]).toBe('2026-07');
        expect(h.months[0]).toBe('2025-08'); // 2025-06 exclu
        const epicerie = h.rows[0];
        expect(epicerie.category).toBe('Épicerie'); // plus gros total en premier
        expect(epicerie.byMonth[11]).toBe(150);     // juillet : 100 + 50
        expect(epicerie.byMonth[10]).toBe(200);     // juin
        expect(epicerie.total).toBe(350);
        expect(epicerie.monthlyAverage).toBe(175);  // moyenne sur 2 mois ACTIFS, pas 12
    });

    it('lastMonths rend N clés YYYY-MM, ancien → récent', () => {
        expect(lastMonths(3, REF)).toEqual(['2026-05', '2026-06', '2026-07']);
    });
});
