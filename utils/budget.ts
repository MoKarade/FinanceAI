// utils/budget.ts
//
// [PH4-A] Parité Budget ↔ Transactions — RÈGLE UNIQUE de rapprochement.
//
// Avant : `Budget.tsx` matchait les transactions aux postes de deux façons
// DIVERGENTES (réels = nom exact + substring ; tendances = nom exact seul) → un
// même euro pouvait compter dans le réel mais pas dans la tendance. Cette source
// unique élimine la divergence et permet de SIGNALER les trous (catégories de
// transactions sans poste, postes sans dépense).

import type { BudgetCategory, Transaction } from '../types';

/**
 * Rapproche une catégorie de transaction d'un poste de budget. Règle (préservée
 * de l'existant pour ne pas changer les réels) : (1) nom EXACT, sinon (2) premier
 * poste dont le nom CONTIENT la catégorie ou inversement (substring, insensible à
 * la casse). Retourne `undefined` si rien ne matche (= catégorie orpheline).
 *
 * ⚠️ Limite connue : le fallback substring est FLOU (peut sur-matcher des noms
 * courts/génériques) et dépend de l'ordre des postes. Conservé tel quel ici ;
 * un rapprochement plus strict serait un chantier séparé.
 */
export function matchTransactionToCategory(
    category: string | undefined | null,
    items: readonly BudgetCategory[],
): BudgetCategory | undefined {
    if (!category) return undefined;
    const exact = items.find((b) => b.name === category);
    if (exact) return exact;
    const c = category.toLowerCase();
    return items.find((b) => {
        const n = b.name.toLowerCase();
        return n.includes(c) || c.includes(n);
    });
}

export interface OrphanCategory {
    /** La catégorie de transaction qui ne matche aucun poste. */
    category: string;
    /** Total dépensé (valeur absolue) sur cette catégorie dans la fenêtre. */
    total: number;
}

export interface BudgetParity {
    /** Total dépensé par poste (clé = `BudgetCategory.name`), sur la FENÊTRE. Exclut les orphelins. */
    actualsMap: Record<string, number>;
    /** Total dépensé sur la FENÊTRE, TOUTES dépenses (postes rapprochés + orphelins). Sert au KPI
     *  « Dépenses » : il doit refléter l'argent réellement sorti, qu'il y ait un poste ou non. */
    totalSpent: number;
    /** Catégories de transactions (de la FENÊTRE) sans poste, triées par total décroissant. */
    orphanCategories: OrphanCategory[];
    /** Postes (hors épargne) qu'AUCUNE dépense ne rapproche sur TOUT l'historique. */
    itemsWithoutTransactions: BudgetCategory[];
}

const NO_CATEGORY_LABEL = '(sans catégorie)';

// Un poste « épargne » est alimenté par des VIREMENTS (exclus des dépenses) → « 0
// dépense » y est normal. ⚠️ La nature est en pratique LIBRE ('Logement', 'Épargne'
// accentué…) et NON l'union typée → comparaison normalisée (sans accent, minuscule).
const isSavingsNature = (nature: string): boolean =>
    (nature ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase() === 'epargne';

/**
 * Calcule la parité. `spendTransactions` = dépenses de la FENÊTRE (montant < 0, hors
 * virements/doublons) → réels + orphelins. `allSpendTransactions` = dépenses sur TOUT
 * l'historique → « postes sans dépense » (un poste annuel rapproché une fois n'est PAS
 * sans dépense). Par défaut `allSpendTransactions = spendTransactions`.
 */
export function computeBudgetParity(
    spendTransactions: readonly Transaction[],
    items: readonly BudgetCategory[],
    allSpendTransactions: readonly Transaction[] = spendTransactions,
): BudgetParity {
    const actualsMap: Record<string, number> = {};
    const orphanTotals: Record<string, number> = {};
    let totalSpent = 0;

    for (const t of spendTransactions) {
        const amount = Math.abs(t.amount);
        totalSpent += amount; // total dépensé = TOUT (rapproché + orphelin), comme avant le refactor
        const match = matchTransactionToCategory(t.category, items);
        if (match) {
            actualsMap[match.name] = (actualsMap[match.name] ?? 0) + amount;
        } else {
            const label = t.category || NO_CATEGORY_LABEL;
            orphanTotals[label] = (orphanTotals[label] ?? 0) + amount;
        }
    }

    const orphanCategories = Object.entries(orphanTotals)
        .map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total);

    // Postes rapprochés par AU MOINS une dépense sur tout l'historique.
    const matchedNames = new Set<string>();
    for (const t of allSpendTransactions) {
        const m = matchTransactionToCategory(t.category, items);
        if (m) matchedNames.add(m.name);
    }
    const itemsWithoutTransactions = items.filter(
        (i) => !isSavingsNature(i.nature) && !matchedNames.has(i.name),
    );

    return { actualsMap, totalSpent, orphanCategories, itemsWithoutTransactions };
}
