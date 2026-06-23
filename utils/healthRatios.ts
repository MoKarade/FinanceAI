import type { BudgetCategory, RecurringItem } from '../types';
import { isSavingsNature } from './budget';

// [PH4D-BUDGET-RATIOS] Deux ratios budgétaires PURS pour l'indicateur de santé financière.
// Score 0-100 (100 = idéal). `null` quand la donnée de base manque (rien à mesurer) → l'UI affiche
// un état « requis » plutôt qu'un 0 inventé. Pas de dépendance au store → testable unitairement.

const clamp01 = (n: number): number => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));

/** Cible MENSUELLE d'un poste budget (normalise la fréquence — mêmes facteurs que `Budget.tsx`). */
export function monthlyTargetOf(item: Pick<BudgetCategory, 'target' | 'frequency'>): number {
    const t = item.target || 0;
    switch (item.frequency) {
        case 'Yearly': return t / 12;
        case 'Weekly': return t * 4.33;
        case 'Quarterly': return t / 3;
        default: return t; // Monthly
    }
}

/**
 * Score d'ADHÉRENCE au budget (0-100). 100 = dépenses réelles ≤ cibles (poste par poste) ; baisse avec
 * le DÉPASSEMENT total. `100·(1 − Σ max(0, réel_i − cible_i) / Σ cible_i)`. `actualsMap` = dépense réelle
 * par poste (clé = nom) sur la MÊME fenêtre que les cibles mensuelles (≈ 1 mois complet).
 * Un sous-budget (réel < cible) ne BONIFIE pas au-delà de 100 (seul le dépassement pénalise).
 * Les postes de nature ÉPARGNE sont EXCLUS du dénominateur : ils sont alimentés par des VIREMENTS
 * (exclus des dépenses par `computeBudgetParity`), donc leur cible gonflerait `budgetTotal` sans jamais
 * générer de dépassement → biais directionnel optimiste (cohérent avec `Budget.tsx` qui les exclut aussi).
 * `null` si aucun poste de DÉPENSE défini (Σ cible non-épargne = 0 → rien à mesurer).
 */
export function computeBudgetParityScore(
    actualsMap: Record<string, number>,
    budgetItems: readonly BudgetCategory[],
): number | null {
    let budgetTotal = 0;
    let overspend = 0;
    for (const item of budgetItems) {
        if (isSavingsNature(item.nature)) continue; // épargne = virements, pas des dépenses comparables
        const target = monthlyTargetOf(item);
        if (target <= 0) continue;
        budgetTotal += target;
        const actual = actualsMap[item.name] ?? 0;
        overspend += Math.max(0, actual - target);
    }
    if (budgetTotal <= 0) return null;
    return clamp01(100 * (1 - overspend / budgetTotal));
}

/**
 * Coût MENSUEL des abonnements. Utilise `yearlyCost/12` → correct pour un abo MENSUEL comme ANNUEL
 * (évite le ×12 de `PLANNING-ANNUAL-SUB-12X` où `averageAmount` d'un abo annuel = le montant annuel complet).
 */
export function subscriptionsMonthlyCost(subscriptions: readonly RecurringItem[]): number {
    return subscriptions.reduce(
        (sum, s) => sum + (Number.isFinite(s.yearlyCost) ? s.yearlyCost : 0) / 12,
        0,
    );
}

/** Plafond du poids des abonnements : à `SUBSCRIPTION_LOAD_CEILING` × le revenu net mensuel, le score tombe à 0. */
export const SUBSCRIPTION_LOAD_CEILING = 0.15; // 15 % du revenu net

/**
 * Score du POIDS des abonnements (0-100). 100 = abos négligeables ; 0 = abos ≥ 15 % du revenu net mensuel.
 * Aucun abonnement → coût 0 → score 100 (pas de fardeau). `null` si revenu ≤ 0 (rien à rapporter). Pur.
 */
export function computeSubscriptionLoadScore(
    subscriptions: readonly RecurringItem[],
    monthlyIncome: number,
): number | null {
    if (!(monthlyIncome > 0)) return null;
    const load = subscriptionsMonthlyCost(subscriptions) / monthlyIncome;
    return clamp01(100 * (1 - load / SUBSCRIPTION_LOAD_CEILING));
}
