import { describe, it, expect } from 'vitest';
import { monthlyActualsMap } from '../../utils/budget';
import type { BudgetCategory, Transaction } from '../../types';

const cat = (name: string): BudgetCategory =>
    ({ id: name, name, target: 100, frequency: 'Monthly', nature: 'Besoin' } as unknown as BudgetCategory);
const tx = (over: Partial<Transaction>): Transaction =>
    ({ id: 1, date: '2026-06-01', payee: 'x', amount: -50, category: '', status: 'processed', ...over } as Transaction);

const ITEMS = [cat('Épicerie'), cat('Restaurants'), cat('Loyer')];

describe('monthlyActualsMap — [PH4-C] dépense réelle du mois courant par catégorie', () => {
    it('ne garde que les transactions du mois demandé', () => {
        const txs = [
            tx({ category: 'Épicerie', amount: -40, date: '2026-06-10' }),
            tx({ category: 'Épicerie', amount: -100, date: '2026-05-15' }), // mois précédent → exclu
            tx({ category: 'Restaurants', amount: -30, date: '2026-06-20' }),
        ];
        const m = monthlyActualsMap(txs, ITEMS, '2026-06');
        expect(m['Épicerie']).toBe(40); // pas les 100 de mai
        expect(m['Restaurants']).toBe(30);
    });

    it('exclut revenus / transferts / doublons (même règle que la parité budget)', () => {
        const txs = [
            tx({ category: 'Épicerie', amount: -50, date: '2026-06-01' }),
            tx({ category: 'Épicerie', amount: 200, date: '2026-06-02' }),                  // revenu
            tx({ category: 'Épicerie', amount: -50, date: '2026-06-03', isTransfer: true }), // transfert
            tx({ category: 'Épicerie', amount: -50, date: '2026-06-04', isDuplicate: true }),// doublon
        ];
        expect(monthlyActualsMap(txs, ITEMS, '2026-06')['Épicerie']).toBe(50);
    });

    it('rapproche par substring (poste inclus dans la catégorie)', () => {
        const m = monthlyActualsMap([tx({ category: 'Loyer appartement', amount: -900, date: '2026-06-01' })], ITEMS, '2026-06');
        expect(m['Loyer']).toBe(900);
    });

    it('catégorie orpheline (sans poste budget) → absente de la map', () => {
        const m = monthlyActualsMap([tx({ category: 'Crypto', amount: -99, date: '2026-06-01' })], ITEMS, '2026-06');
        expect(m['Crypto']).toBeUndefined();
    });

    it('aucune transaction du mois → map vide', () => {
        const m = monthlyActualsMap([tx({ category: 'Épicerie', amount: -50, date: '2026-05-01' })], ITEMS, '2026-06');
        expect(Object.keys(m)).toHaveLength(0);
    });

    it('liste vide → map vide', () => {
        expect(monthlyActualsMap([], ITEMS, '2026-06')).toEqual({});
    });
});
