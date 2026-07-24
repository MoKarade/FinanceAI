import { describe, it, expect } from 'vitest';
import { matchTransactionToCategory, matchCategoryToName, computeBudgetParity, computeGoldenSplit, GOLDEN_IDEAL, resolveTransactionOwner, computeActualByOwner } from '../../utils/budget';
import type { BudgetCategory, Transaction } from '../../types';

const cat = (name: string, nature: BudgetCategory['nature'] = 'Besoin'): BudgetCategory =>
    ({ id: name, name, target: 100, frequency: 'Monthly', nature } as unknown as BudgetCategory);

const tx = (over: Partial<Transaction>): Transaction =>
    ({ id: 1, date: '2026-06-01', payee: 'x', amount: -50, category: '', status: 'processed', ...over } as Transaction);

const ITEMS = [cat('Épicerie'), cat('Restaurants'), cat('Loyer', 'Besoin'), cat('CELI', 'Epargne')];

describe('matchTransactionToCategory — règle unique', () => {
    it('match exact par nom', () => {
        expect(matchTransactionToCategory('Restaurants', ITEMS)?.name).toBe('Restaurants');
    });
    it('match substring (catégorie incluse dans le poste, insensible casse)', () => {
        expect(matchTransactionToCategory('épicerie', ITEMS)?.name).toBe('Épicerie');
        expect(matchTransactionToCategory('resto', [cat('resto & bars')])?.name).toBe('resto & bars');
    });
    it('match substring (poste inclus dans la catégorie)', () => {
        expect(matchTransactionToCategory('Loyer appartement', ITEMS)?.name).toBe('Loyer');
    });
    it('aucun match → undefined (orphelin)', () => {
        expect(matchTransactionToCategory('Crypto', ITEMS)).toBeUndefined();
    });
    it('catégorie vide/nulle → undefined', () => {
        expect(matchTransactionToCategory('', ITEMS)).toBeUndefined();
        expect(matchTransactionToCategory(undefined, ITEMS)).toBeUndefined();
    });
    it('priorise le match EXACT sur le substring', () => {
        const items = [cat('Resto du coin'), cat('Resto')];
        expect(matchTransactionToCategory('Resto', items)?.name).toBe('Resto');
    });
});

// [BUDGET-MATCH-UNIFY] Variante noms-seuls : MÊME règle (exact d'abord, sinon premier substring
// bicase), consommée par le ledger pour rapprocher comme le réel.
describe('matchCategoryToName — même règle au niveau noms', () => {
    const NAMES = ['Épicerie', 'Restaurants', 'Loyer'];
    it('exact, substring bicase dans les deux sens, orphelin, vide', () => {
        expect(matchCategoryToName('Restaurants', NAMES)).toBe('Restaurants');
        expect(matchCategoryToName('Restaurant', NAMES)).toBe('Restaurants'); // catégorie ⊂ poste
        expect(matchCategoryToName('Loyer appartement', NAMES)).toBe('Loyer'); // poste ⊂ catégorie
        expect(matchCategoryToName('Crypto', NAMES)).toBeUndefined();
        expect(matchCategoryToName('', NAMES)).toBeUndefined();
        expect(matchCategoryToName(undefined, NAMES)).toBeUndefined();
    });
    it('priorise l\'EXACT sur le substring (parité avec matchTransactionToCategory)', () => {
        expect(matchCategoryToName('Resto', ['Resto du coin', 'Resto'])).toBe('Resto');
    });
});

describe('computeBudgetParity', () => {
    it('agrège les réels par poste (exact + substring) en valeur absolue', () => {
        const { actualsMap, totalSpent } = computeBudgetParity([
            tx({ category: 'Épicerie', amount: -40 }),
            tx({ category: 'épicerie', amount: -10 }), // substring/casse → même poste
            tx({ category: 'Restaurants', amount: -25 }),
        ], ITEMS);
        expect(actualsMap['Épicerie']).toBe(50);
        expect(actualsMap['Restaurants']).toBe(25);
        expect(totalSpent).toBe(75); // tout rapproché
    });

    it('totalSpent inclut les orphelins (réel = tout l\'argent sorti), actualsMap non', () => {
        const { actualsMap, totalSpent } = computeBudgetParity([
            tx({ category: 'Restaurants', amount: -25 }),
            tx({ category: 'Crypto', amount: -30 }), // orphelin
        ], ITEMS);
        expect(actualsMap['Crypto']).toBeUndefined(); // pas dans les réels par poste
        expect(totalSpent).toBe(55);                  // mais compté dans le total dépensé
    });

    it('catégories orphelines : listées avec total, triées décroissant', () => {
        const { orphanCategories, actualsMap } = computeBudgetParity([
            tx({ category: 'Crypto', amount: -30 }),
            tx({ category: 'Cadeaux', amount: -80 }),
            tx({ category: 'Crypto', amount: -20 }),
        ], ITEMS);
        expect(actualsMap['Crypto']).toBeUndefined(); // pas un poste
        expect(orphanCategories).toEqual([
            { category: 'Cadeaux', total: 80 },
            { category: 'Crypto', total: 50 },
        ]);
    });

    it('catégorie vide → libellé « (sans catégorie) »', () => {
        const { orphanCategories } = computeBudgetParity([tx({ category: '', amount: -12 })], ITEMS);
        expect(orphanCategories).toEqual([{ category: '(sans catégorie)', total: 12 }]);
    });

    it('postes sans dépense : signalés, MAIS les postes Épargne exclus (alimentés par virements)', () => {
        const { itemsWithoutTransactions } = computeBudgetParity([
            tx({ category: 'Épicerie', amount: -40 }),
        ], ITEMS);
        const names = itemsWithoutTransactions.map((i) => i.name);
        expect(names).toContain('Restaurants'); // dépense, aucune tx → signalé
        expect(names).toContain('Loyer');
        expect(names).not.toContain('Épicerie'); // a une dépense
        expect(names).not.toContain('CELI');     // Épargne → jamais signalé
    });

    it('exclut l\'épargne même avec ACCENT (nature « Épargne » ≈ « Epargne »)', () => {
        const items = [cat('Épicerie'), cat('CELI', 'Épargne' as BudgetCategory['nature'])];
        const { itemsWithoutTransactions } = computeBudgetParity([], items);
        expect(itemsWithoutTransactions.map((i) => i.name)).toEqual(['Épicerie']); // CELI (épargne accentuée) exclu
    });

    it('« sans dépense » = sur TOUT l\'historique : un poste rapproché hors fenêtre n\'est PAS signalé', () => {
        const windowSpend: Transaction[] = []; // rien ce mois-ci
        const allSpend = [tx({ category: 'Voyages annuels', amount: -3000, date: '2026-01-15' })];
        const items = [cat('Voyages annuels', 'Loisirs' as BudgetCategory['nature']), cat('Restaurants')];
        const { itemsWithoutTransactions } = computeBudgetParity(windowSpend, items, allSpend);
        const names = itemsWithoutTransactions.map((i) => i.name);
        expect(names).not.toContain('Voyages annuels'); // rapproché dans l'historique
        expect(names).toContain('Restaurants');         // jamais rapproché
    });

    it('vide → réels vides, aucun orphelin, tous les postes dépense signalés', () => {
        const { actualsMap, orphanCategories, itemsWithoutTransactions } = computeBudgetParity([], ITEMS);
        expect(Object.keys(actualsMap)).toHaveLength(0);
        expect(orphanCategories).toHaveLength(0);
        expect(itemsWithoutTransactions.map((i) => i.name)).toEqual(['Épicerie', 'Restaurants', 'Loyer']);
    });
});

describe('computeGoldenSplit — répartition 50/30/20 (PH4-B)', () => {
    it('calcule total + parts en % à partir de trois montants', () => {
        const g = computeGoldenSplit(5000, 3000, 2000);
        expect(g.total).toBe(10000);
        expect(g.pct.besoins).toBeCloseTo(50, 5);
        expect(g.pct.envies).toBeCloseTo(30, 5);
        expect(g.pct.epargne).toBeCloseTo(20, 5);
    });

    it('clampe les montants négatifs à 0 (épargne négative = aucune part)', () => {
        const g = computeGoldenSplit(5000, 2000, -1000);
        expect(g.epargne).toBe(0);
        expect(g.total).toBe(7000); // l'épargne négative ne compte pas
        expect(g.pct.epargne).toBe(0);
        expect(g.pct.besoins).toBeCloseTo((5000 / 7000) * 100, 5);
    });

    it('total = 0 → parts toutes à 0 (pas de division par zéro / NaN)', () => {
        const g = computeGoldenSplit(0, 0, 0);
        expect(g.total).toBe(0);
        expect(g.pct.besoins).toBe(0);
        expect(g.pct.envies).toBe(0);
        expect(g.pct.epargne).toBe(0);
        expect(Number.isNaN(g.pct.besoins)).toBe(false);
    });

    it('l\'idéal 50/30/20 somme bien à 100', () => {
        expect(GOLDEN_IDEAL.besoins + GOLDEN_IDEAL.envies + GOLDEN_IDEAL.epargne).toBe(100);
    });

    it('tolère NaN/undefined en entrée (→ 0, pas de propagation)', () => {
        const g = computeGoldenSplit(NaN, undefined as unknown as number, 500);
        expect(g.besoins).toBe(0);
        expect(g.envies).toBe(0);
        expect(g.epargne).toBe(500);
        expect(g.total).toBe(500);
    });
});

// ---------------------------------------------------------------------------
// [PH4-E] Attribution par conjoint
// ---------------------------------------------------------------------------

const catT = (name: string, type: BudgetCategory['type']): BudgetCategory =>
    ({ id: name, name, target: 100, frequency: 'Monthly', nature: 'Besoin', type } as unknown as BudgetCategory);

const OWNER_ITEMS = [catT('Resto Bob', 'Perso 1'), catT('Coiffeur Alice', 'Perso 2'), catT('Épicerie', 'Commun')];

describe('resolveTransactionOwner — [PH4-E]', () => {
    it('ownerId explicite (0|1) = OVERRIDE manuel, gagne sur le type du poste', () => {
        // catégorie Perso 1 (→0) mais override explicite à 1.
        expect(resolveTransactionOwner({ ownerId: 1, category: 'Resto Bob' }, OWNER_ITEMS)).toBe(1);
        expect(resolveTransactionOwner({ ownerId: 0, category: 'Coiffeur Alice' }, OWNER_ITEMS)).toBe(0);
    });

    it('AUTO : Perso 1 → 0, Perso 2 → 1', () => {
        expect(resolveTransactionOwner({ category: 'Resto Bob' }, OWNER_ITEMS)).toBe(0);
        expect(resolveTransactionOwner({ category: 'Coiffeur Alice' }, OWNER_ITEMS)).toBe(1);
    });

    it('Commun → null (dépense partagée, non imputée à un seul conjoint)', () => {
        expect(resolveTransactionOwner({ category: 'Épicerie' }, OWNER_ITEMS)).toBeNull();
    });

    it('catégorie orpheline (aucun poste) → null', () => {
        expect(resolveTransactionOwner({ category: 'Inconnu' }, OWNER_ITEMS)).toBeNull();
    });
});

describe('computeActualByOwner — [PH4-E]', () => {
    it('agrège le réel par conjoint (valeur absolue) ; Commun/orphelin → commun', () => {
        const txs = [
            tx({ amount: -40, category: 'Resto Bob' }),     // → owner0
            tx({ amount: -10, category: 'Resto Bob' }),     // → owner0
            tx({ amount: -30, category: 'Coiffeur Alice' }),// → owner1
            tx({ amount: -25, category: 'Épicerie' }),      // → commun
            tx({ amount: -15, category: 'Inconnu' }),       // → commun (orphelin)
        ];
        expect(computeActualByOwner(txs, OWNER_ITEMS)).toEqual({ owner0: 50, owner1: 30, commun: 40 });
    });

    it('un override ownerId déplace la dépense vers l\'autre conjoint', () => {
        const txs = [tx({ amount: -100, category: 'Resto Bob', ownerId: 1 })]; // Perso 1 (→0) mais override 1
        expect(computeActualByOwner(txs, OWNER_ITEMS)).toEqual({ owner0: 0, owner1: 100, commun: 0 });
    });

    it('lot vide → tout à zéro (pas de NaN)', () => {
        expect(computeActualByOwner([], OWNER_ITEMS)).toEqual({ owner0: 0, owner1: 0, commun: 0 });
    });
});
