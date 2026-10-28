// utils/spendRules.ts
//
// Règles PARTAGÉES « qu'est-ce qui compte comme une dépense de budget ». Module NEUTRE (types
// seulement) : `budgetSync.ts` et `budget.ts` l'importent tous les deux — les y laisser aurait créé
// un cycle d'import (budgetSync → budget → budgetSync), et les dupliquer aurait fait diverger deux
// définitions de la même règle money-critical.

import type { Transaction } from '../types';

/** Catégories de dépense JAMAIS transformées en poste de budget (statuts/mouvements). */
const NON_BUDGET_CATEGORIES = new Set([
    // Statuts « à classer » — même liste que STATUS_CATEGORIES (budgetSync) ; parité testée.
    'Uncategorized', 'Inconnu', 'Unknown', '', 'Non catégorisé',
    'Transfert', 'Investissement',
    'Salaire', 'Revenus divers', // revenus : jamais des postes de dépense
    // Impôts : un règlement d'impôt N'EST PAS de la consommation — le revenu projeté est déjà
    // NET (le compter en poste gonflerait baseMonthlyExpenses → double-comptage vs revenu net ;
    // finding financial-integrity F3 2026-07-15). Reste visible dans Transactions.
    'Impôts',
]);

/**
 * [TX-INTERAC-BUDGET] Catégories « à CRÉDIT » : une entrée d'argent y VIENT EN DÉDUCTION du poste au
 * lieu d'être ignorée. Décision Marc 2026-07-31 : un Interac envoyé à sa conjointe est une VRAIE
 * dépense (« Remboursement » était dans `NON_BUDGET_CATEGORIES`, donc invisible au Budget — ni
 * dépense ni revenu). Mais compter le SORTANT sans traiter l'ENTRANT (« on me rembourse »)
 * surévaluerait les dépenses : le net du poste est ce que ça a réellement coûté.
 *
 * ⚠️ L'entrant ne devient PAS un revenu : `INCOME_CATEGORIES` reste la seule source du revenu
 * affiché (leçon BUDGET-INCOME-REAL — ne jamais recompter un remboursement comme une rentrée).
 */
export const CREDIT_BACK_CATEGORIES = new Set<string>(['Remboursement']);

export const isCreditBack = (t: Transaction): boolean =>
    t.amount > 0 && CREDIT_BACK_CATEGORIES.has(t.category ?? '');

/**
 * [BUDGET-IMPOTS-HORS-COMPARAISON] (décision Marc 2026-09-05, réponse 3a) Catégories HORS de la
 * comparaison budget↔réel de l'écran Budget, des DEUX côtés. « Impôts » n'est jamais un poste
 * (`NON_BUDGET_CATEGORIES` : le revenu projeté est déjà net), donc aucune CIBLE ne le porte — mais
 * le RÉEL (`totalSpent`) et la moyenne passée (`expenseAvg`) comptaient TOUS les négatifs, impôts
 * inclus : deux assiettes différentes comparées, écart STRUCTUREL de 44 % mesuré, badge
 * « Excédentaire » faux. La catégorie sort des deux côtés ET l'écran le DIT (un chiffre qui exclut
 * quelque chose le dit) — jamais retirée en silence : le montant exclu est publié à côté.
 * Sans effet sur l'onglet Transactions ni sur le réel de `TaxCenter`, qui gardent l'assiette
 * complète et l'affirment.
 */
const HORS_COMPARAISON_BUDGET = new Set<string>(['Impôts']);

export const isHorsComparaisonBudget = (t: Transaction): boolean =>
    HORS_COMPARAISON_BUDGET.has(t.category ?? '');

/** Une ligne compte-t-elle dans les DÉPENSES d'un poste (sortie, ou crédit qui les réduit) ? */
export const isSpend = (t: Transaction): boolean =>
    !t.isTransfer && !t.isDuplicate && !NON_BUDGET_CATEGORIES.has(t.category ?? '')
    && (t.amount < 0 || isCreditBack(t));

/**
 * Contribution SIGNÉE d'une ligne au total de dépenses : `-amount`. Une sortie (−250) apporte +250,
 * un crédit (+250) apporte −250. Une seule expression pour les deux — d'où l'abandon de `Math.abs`,
 * qui aurait fait GONFLER le poste au lieu de le réduire.
 */
export const spendAmountOf = (t: Transaction): number => -t.amount;
