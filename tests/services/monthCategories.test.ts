/**
 * [FUTUR-DETAIL-CATEGORIES-MOIS] Les dépenses d'un mois PASSÉ, ventilées par catégorie.
 *
 * Demande de Marc, périmètre resserré par lui au PASSÉ. Un mois futur n'a pas de transactions —
 * le moteur applique des postes budgétaires — donc il n'y a pas de « catégorie de chaque dépense »
 * à montrer, et en fabriquer une présenterait du projeté comme du constaté.
 *
 * ⚠️ Ce que ces tests verrouillent, au-delà de l'addition : la MÊME base d'exclusion que la courbe
 * et que la liste du jour. Trois surfaces qui agrègent les mêmes transactions avec trois filtres
 * différents donneraient trois chiffres, et aucun ne serait vérifiable.
 */
import { describe, it, expect } from 'vitest';
import { monthCategories } from '../../services/history/monthCategories';
import type { Transaction } from '../../types';

const t = (o: Partial<Transaction>): Transaction =>
    ({ id: 1, date: '2026-07-05', payee: 'X', amount: -10, category: 'Épicerie', status: 'processed', ...o }) as Transaction;

describe('[FUTUR-DETAIL-CATEGORIES-MOIS] ventilation', () => {
    it('agrège par catégorie et trie du plus lourd au plus léger', () => {
        const r = monthCategories([
            t({ id: 1, amount: -100, category: 'Épicerie' }),
            t({ id: 2, amount: -50, category: 'Épicerie' }),
            t({ id: 3, amount: -400, category: 'Loyer' }),
        ], '2026-07');
        expect(r.depenses.map((d) => d.categorie)).toEqual(['Loyer', 'Épicerie']);
        expect(r.depenses[0]).toMatchObject({ montant: 400, nombre: 1 });
        expect(r.depenses[1]).toMatchObject({ montant: 150, nombre: 2 });
        expect(r.totalDepenses).toBe(550);
    });

    it('ne retient QUE le mois demandé', () => {
        const r = monthCategories([
            t({ id: 1, date: '2026-07-31', amount: -100 }),
            t({ id: 2, date: '2026-08-01', amount: -999 }),
        ], '2026-07');
        expect(r.totalDepenses).toBe(100);
    });

    // ⚠️ Même base d'exclusion que `dailyPastLedger` / `transactionsOnDay`. Sans ça, la ventilation
    // ne collerait ni à la courbe ni à la liste du jour.
    it.each([
        ['un doublon d’import', { isDuplicate: true }],
        ['un virement interne', { isTransfer: true }],
    ])('%s est exclu', (_nom, flag) => {
        const r = monthCategories([t({ id: 1, amount: -100, ...flag })], '2026-07');
        expect(r.totalDepenses).toBe(0);
        expect(r.depenses).toEqual([]);
    });

    // Une paie n'est pas une dépense : la mêler produirait des totaux qui s'annulent et
    // ferait passer un revenu pour une sortie.
    it('les ENTRÉES sont hors sujet', () => {
        const r = monthCategories([
            t({ id: 1, amount: 4_000, category: 'Salaire' }),
            t({ id: 2, amount: -100, category: 'Épicerie' }),
        ], '2026-07');
        expect(r.depenses.map((d) => d.categorie)).toEqual(['Épicerie']);
        expect(r.totalDepenses).toBe(100);
    });

    // ⚠️ Une dépense sans catégorie est COMPTÉE À PART, jamais rangée sous un nom inventé :
    // c'est un fait sur les données de Marc (import à classer), pas une catégorie. La fondre
    // dans un « Autre » la rendrait invisible EN TANT QUE problème.
    it('une dépense sans catégorie est comptée à part, pas inventée', () => {
        const r = monthCategories([
            t({ id: 1, amount: -80, category: '' }),
            t({ id: 2, amount: -20, category: '   ' }),
            t({ id: 3, amount: -100, category: 'Loyer' }),
        ], '2026-07');
        expect(r.sansCategorie).toBe(2);
        expect(r.depenses.map((d) => d.categorie)).toEqual(['Loyer']);
        // Elle reste dans le TOTAL : l'argent est bien sorti, seule sa catégorie manque.
        expect(r.totalDepenses).toBe(200);
    });

    it('un montant non fini n’entre nulle part', () => {
        const r = monthCategories([t({ id: 1, amount: Number.NaN })], '2026-07');
        expect(r.totalDepenses).toBe(0);
    });

    it('sans mois, ou avec un mois tronqué, on n’affirme rien', () => {
        expect(monthCategories([t({})], null)).toMatchObject({ depenses: [], totalDepenses: 0 });
        expect(monthCategories([t({})], '2026')).toMatchObject({ depenses: [], totalDepenses: 0 });
        expect(monthCategories([], '2026-07')).toMatchObject({ depenses: [], totalDepenses: 0 });
    });

    // L'ordre doit être STABLE à égalité de montant : sinon deux catégories s'échangent d'un
    // rendu à l'autre et Marc croit que ses données bougent.
    it('à montant égal, l’ordre est stable (par nom)', () => {
        const r = monthCategories([
            t({ id: 1, amount: -100, category: 'Transport' }),
            t({ id: 2, amount: -100, category: 'Épicerie' }),
        ], '2026-07');
        expect(r.depenses.map((d) => d.categorie)).toEqual(['Épicerie', 'Transport']);
    });
});
