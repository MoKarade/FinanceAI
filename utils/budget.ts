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

// ---------------------------------------------------------------------------
// [PH4-B] Répartition 50/30/20 — théorique (cibles) vs réel (dépenses).
// ---------------------------------------------------------------------------

/** L'idéal « 50/30/20 » (besoins / envies / épargne), en POURCENTAGE du revenu net. */
export const GOLDEN_IDEAL = { besoins: 50, envies: 30, epargne: 20 } as const;

export interface GoldenSplit {
    /** Montants $ (clampés ≥ 0). */
    besoins: number;
    envies: number;
    epargne: number;
    /** Somme des trois postes — base du donut (100 %). 0 si rien. */
    total: number;
    /** Part de chaque poste dans le total, en POURCENTAGE (0 si total = 0 → pas de NaN). */
    pct: { besoins: number; envies: number; epargne: number };
}

/**
 * Construit une répartition 50/30/20 à partir de trois montants $ déjà agrégés
 * (besoins, envies, épargne). Pur et sans dépendance au store → utilisé à la fois
 * pour le THÉORIQUE (cibles budgétées) et le RÉEL (dépenses rapprochées + épargne
 * réelle). Clampe les négatifs à 0 (une épargne négative n'a pas de part de donut)
 * et garde `pct` à 0 quand `total` est nul (évite la division par zéro → NaN).
 */
export function computeGoldenSplit(besoins: number, envies: number, epargne: number): GoldenSplit {
    const b = Math.max(0, besoins || 0);
    const e = Math.max(0, envies || 0);
    const s = Math.max(0, epargne || 0);
    const total = b + e + s;
    const pct = total > 0
        ? { besoins: (b / total) * 100, envies: (e / total) * 100, epargne: (s / total) * 100 }
        : { besoins: 0, envies: 0, epargne: 0 };
    return { besoins: b, envies: e, epargne: s, total, pct };
}
