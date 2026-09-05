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
import { isSpend, spendAmountOf, isHorsComparaisonBudget } from './spendRules';

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
    return items.find((b) => fuzzyNameMatch(c, b.name));
}

/**
 * [BUDGET-MATCH-UNIFY] Volet FLOU de la règle unique (substring bicase) — prédicat PARTAGÉ
 * entre `matchTransactionToCategory` (réel) et `matchCategoryToName` (ledger : moyenne +
 * grand livre) pour que la règle n'existe qu'UNE fois. Le squelette « exact d'abord » est
 * structurel dans chaque variante (verrouillé par les tests de parité des deux fonctions).
 * Pas de délégation par `items.map(name)` : appelée par transaction sans cache dans
 * `computeBudgetParity` — l'allocation par appel coûtait ~2,3× (finding code-reviewer PR #501).
 */
const fuzzyNameMatch = (categoryLower: string, name: string): boolean => {
    const n = name.toLowerCase();
    // [BUDGET-TRANSACTIONS-SYNC-AUDIT] Un nom de poste VIDE ne doit jamais matcher : `''.includes(x)`
    // est toujours faux mais `categoryLower.includes('')` est toujours VRAI — un poste au nom vidé
    // absorbait alors la PREMIÈRE catégorie rencontrée (mesuré : un poste vidé, resynchronisé,
    // héritait du nom et de la cible d'un autre poste sans rapport). `.trim()` : un nom fait
    // uniquement d'espaces a le même défaut (` `.includes(x)` faux, `x.includes(' ')` vrai dès
    // qu'une catégorie contient une espace) — aligné sur la garde jumelle de `Budget.tsx`
    // (`value.trim() === ''`), même si aucun producteur actuel n'atteint ce cas (finding
    // financial-integrity, non exploitable aujourd'hui mais moins fragile à durcir maintenant).
    if (!n.trim()) return false;
    return n.includes(categoryLower) || categoryLower.includes(n);
};

/**
 * Variante NOMS SEULS de la MÊME règle (exact d'abord, sinon premier substring bicase) —
 * consommée par le ledger (`utils/budgetSync.ts`). Finding financial-integrity PR #500 :
 * réel en fuzzy vs moyenne en exact → un poste « Restaurants » avec des tx « Restaurant »
 * affichait réel 600 $ · moy 0 $.
 * ⚠️ Hérite de la LIMITE CONNUE du fuzzy (cf. matchTransactionToCategory) : un nom court
 * sur-matche (« Sport » ⊂ « Tran-sport ») — atteignable via une catégorie LIBRE écrite par
 * le MCP (pas par l'UI, contrainte au select). Cohérent avec le réel PAR DESIGN (re-diverger
 * recréerait le bug fermé ici) ; le fix racine est l'allowlist de catégories à la frontière
 * d'écriture MCP → ticket `[MCP-CATEGORY-ALLOWLIST]`.
 */
export function matchCategoryToName(
    category: string | undefined | null,
    names: readonly string[],
): string | undefined {
    if (!category) return undefined;
    if (names.includes(category)) return category;
    const c = category.toLowerCase();
    return names.find((name) => fuzzyNameMatch(c, name));
}

export interface OrphanCategory {
    /** La catégorie de transaction qui ne matche aucun poste. */
    category: string;
    /**
     * Total NET dépensé sur cette catégorie dans la fenêtre (`spendAmountOf` : sorties positives,
     * crédits d'une catégorie à crédit en déduction — jamais une valeur absolue depuis
     * `[BUDGET-CATEGORY-INCOME-SIGN]`). Peut être négatif si les crédits dépassent les sorties.
     */
    total: number;
}

export interface BudgetParity {
    /** Total dépensé par poste (clé = `BudgetCategory.name`), sur la FENÊTRE. Exclut les orphelins. */
    actualsMap: Record<string, number>;
    /** Total dépensé sur la FENÊTRE, TOUTES dépenses (postes rapprochés + orphelins). Sert au KPI
     *  « Dépenses » : il doit refléter l'argent réellement sorti, qu'il y ait un poste ou non. */
    totalSpent: number;
    /** [BUDGET-IMPOTS-HORS-COMPARAISON] Somme des dépenses de la fenêtre EXCLUES de `totalSpent`
     *  (`HORS_COMPARAISON_BUDGET`, aujourd'hui « Impôts ») — publiée pour que l'écran nomme ce
     *  qu'il exclut. Ces lignes restent listées parmi les orphelins : la parité informe, elle ne
     *  compare pas. */
    totalHorsComparaison: number;
    /** Catégories de transactions (de la FENÊTRE) sans poste, triées par total décroissant. */
    orphanCategories: OrphanCategory[];
    /** Postes (hors épargne) qu'AUCUNE dépense ne rapproche sur TOUT l'historique. */
    itemsWithoutTransactions: BudgetCategory[];
}

const NO_CATEGORY_LABEL = '(sans catégorie)';

// Un poste « épargne » est alimenté par des VIREMENTS (exclus des dépenses) → « 0
// dépense » y est normal. ⚠️ La nature est en pratique LIBRE ('Logement', 'Épargne'
// accentué…) et NON l'union typée → comparaison normalisée (sans accent, minuscule).
export const isSavingsNature = (nature: string): boolean =>
    (nature ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase() === 'epargne';

/**
 * Calcule la parité. `spendTransactions` = dépenses de la FENÊTRE (typiquement montant < 0, hors
 * virements/doublons — mais un appelant PEUT inclure des lignes à CRÉDIT via `isSpend` : voir
 * `spendAmountOf`) → réels + orphelins. `allSpendTransactions` =
 * dépenses sur TOUT l'historique → « postes sans dépense » (un poste annuel rapproché une fois
 * n'est PAS sans dépense). Par défaut `allSpendTransactions = spendTransactions`.
 * ⚠️ Agrégation par `spendAmountOf` (net signé), jamais `Math.abs` : un crédit d'une catégorie à
 * crédit (`isCreditBack`) DÉDUIT du poste plutôt que de s'y additionner — `actualsMap`/`totalSpent`
 * peuvent donc être négatifs si les crédits dépassent les sorties (`[BUDGET-CATEGORY-INCOME-SIGN]`).
 */
export function computeBudgetParity(
    spendTransactions: readonly Transaction[],
    items: readonly BudgetCategory[],
    allSpendTransactions: readonly Transaction[] = spendTransactions,
): BudgetParity {
    const actualsMap: Record<string, number> = {};
    const orphanTotals: Record<string, number> = {};
    let totalSpent = 0;
    let totalHorsComparaison = 0;

    for (const t of spendTransactions) {
        // [BUDGET-CATEGORY-INCOME-SIGN] `spendAmountOf` (= `-t.amount`), jamais `Math.abs` : pour
        // une ligne à CRÉDIT (`isCreditBack`, ex. « Remboursement »), `Math.abs` additionnait le
        // crédit au lieu de le DÉDUIRE — un remboursement de 250 $ DOUBLAIT l'erreur au lieu de la
        // réduire. Sans effet sur un appelant qui pré-filtre déjà `amount < 0` (spendAmountOf et
        // Math.abs sont identiques pour un montant négatif).
        // ⚠️ [NAV-REMOVE-OBJECTIFS-TAB] L'appelant qui MOTIVAIT ce correctif (`monthlyActualsMap`,
        // seul à passer des lignes à crédit via `isSpend`) est parti avec l'onglet Objectifs. La
        // règle RESTE : elle est correcte pour tout futur appelant qui inclurait des crédits, et
        // `spendAmountOf` est la source unique du signe. Ne pas la « simplifier » en `Math.abs`
        // sous prétexte qu'aucun appelant n'exerce ce chemin aujourd'hui.
        const amount = spendAmountOf(t);
        // [BUDGET-IMPOTS-HORS-COMPARAISON] Hors du total COMPARÉ, mais nommé (décision Marc 3a).
        if (isHorsComparaisonBudget(t)) totalHorsComparaison += amount;
        else totalSpent += amount; // total dépensé = TOUT le reste (rapproché + orphelin), comme avant le refactor
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

    return { actualsMap, totalSpent, totalHorsComparaison, orphanCategories, itemsWithoutTransactions };
}

// [NAV-REMOVE-OBJECTIFS-TAB] `monthlyActualsMap` retiré avec la feature qu'elle servait : son
// unique consommateur de production était le « versé ce mois » des objectifs d'épargne liés à une
// catégorie budget. Orpheline dès le retrait de l'onglet — même classe que `computeGoldenSplit`
// (`[UTIL-GOLDENSPLIT-ORPHELIN]`, retiré dans ce même lot), et invisible à `knip` tant que son
// propre test la référençait encore.

// ---------------------------------------------------------------------------
// [PH4-E] Attribution des dépenses par conjoint (mode couple).
// ---------------------------------------------------------------------------

/**
 * Résout le conjoint propriétaire d'une dépense. Règle :
 *  1. `tx.ownerId` explicite (0|1) = OVERRIDE manuel → gagne toujours.
 *  2. sinon AUTO par le type du poste budget rapproché : `Perso 1`→0, `Perso 2`→1.
 *  3. `Commun` ou poste introuvable → `null` (dépense partagée, non imputée à un seul conjoint).
 * Pur, réutilise la règle de rapprochement unique (`matchTransactionToCategory`) → cohérent avec la parité.
 */
export function resolveTransactionOwner(
    tx: Pick<Transaction, 'ownerId' | 'category'>,
    items: readonly BudgetCategory[],
): 0 | 1 | null {
    if (tx.ownerId === 0 || tx.ownerId === 1) return tx.ownerId;
    const cat = matchTransactionToCategory(tx.category, items);
    if (cat?.type === 'Perso 1') return 0;
    if (cat?.type === 'Perso 2') return 1;
    return null;
}

export interface ActualByOwner {
    /** Dépense réelle NETTE (`spendAmountOf`, pas une valeur absolue) imputée au conjoint 0. */
    owner0: number;
    /** Dépense réelle NETTE imputée au conjoint 1. */
    owner1: number;
    /** Dépense réelle NETTE commune / non imputée à un seul conjoint (`Commun` ou orpheline). */
    commun: number;
}

/**
 * Agrège les dépenses RÉELLES par conjoint sur un lot de transactions de dépense
 * (montant < 0 déjà filtré côté appelant — voir note ci-dessous si un futur appelant
 * inclut des lignes à crédit). Pur, testable.
 */
export function computeActualByOwner(
    spendTransactions: readonly Transaction[],
    items: readonly BudgetCategory[],
): ActualByOwner {
    let owner0 = 0;
    let owner1 = 0;
    let commun = 0;
    for (const t of spendTransactions) {
        // [BUDGET-CATEGORY-INCOME-SIGN] Même correctif que `computeBudgetParity` : `spendAmountOf`
        // plutôt que `Math.abs`, pour ne pas dupliquer le même bug de signe si un futur appelant
        // passe des lignes à crédit (`isSpend`) au lieu du filtre `amount < 0` actuel. Sans effet
        // aujourd'hui — le seul appelant (`Budget.tsx`) pré-filtre déjà `amount < 0`.
        const amount = spendAmountOf(t);
        const owner = resolveTransactionOwner(t, items);
        if (owner === 0) owner0 += amount;
        else if (owner === 1) owner1 += amount;
        else commun += amount;
    }
    return { owner0, owner1, commun };
}
