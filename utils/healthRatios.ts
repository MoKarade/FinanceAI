import type { BudgetCategory, RecurringItem } from '../types';
import { isSavingsNature } from './budget';
import { totalMonthlyCost, totalYearlyCostAudit } from './subscriptions';
import { logErrorThrottled } from '../services/errorLogger';

// [PH4D-BUDGET-RATIOS] Deux ratios budgétaires PURS pour l'indicateur de santé financière.
// Score 0-100 (100 = idéal). `null` quand la donnée de base manque (rien à mesurer) → l'UI affiche
// un état « requis » plutôt qu'un 0 inventé. Pas de dépendance au store → testable unitairement.

/**
 * [HEALTH-RATIOS-NAN-ABSORBE-EN-AMONT] Le repli `: 0` est le DERNIER filet, plus la garde. Il
 * absorbait un `NaN` en `0` — un score FINI et donc CRÉDIBLE (« 100 % de dépassement ») que la
 * garde de sortie `sanitizeNonFinite` (`utils/healthScore.ts`) ne peut structurellement pas voir.
 * Les vraies gardes sont désormais à l'ENTRÉE des deux fonctions ci-dessous ; ce filet ne devrait
 * plus jamais tirer, donc il le DIT quand il tire (sinon un chemin futur se rétablirait en silence).
 */
const clamp01 = (n: number): number => {
    if (!Number.isFinite(n)) {
        logErrorThrottled('health-ratios-clamp-non-fini', {
            source: 'storage', severity: 'warning',
            message: 'Ratios de santé : score intermédiaire non fini rabattu à 0 — une garde d\'entrée a été contournée',
        });
        return 0;
    }
    return Math.max(0, Math.min(100, n));
};

/** Refus TRACÉ d'un score : `null` (l'UI rend « — ») + une ligne de diagnostic. Jamais un nombre. */
function nonFiniteRefusal(quoi: string): null {
    logErrorThrottled(`health-ratios-entree-non-finie:${quoi}`, {
        source: 'storage', severity: 'warning',
        message: `Ratios de santé : ${quoi} — valeur non exploitable, score non calculé`,
    });
    return null;
}

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
 * [HEALTH-SAVINGS-RATE] Dépenses MENSUELLES de CONSOMMATION : Σ des cibles mensuelles, postes de nature
 * ÉPARGNE EXCLUS (alimentés par des VIREMENTS, pas des dépenses). Dénominateur du taux d'épargne ET du
 * coussin d'urgence. Sans l'exclusion, l'épargne budgétée compte à tort comme dépense → taux d'épargne
 * sous-estimé (≈ 0 % pour un épargnant) et coussin sous-estimé. Cohérent avec `computeBudgetParityScore`
 * et `Budget.tsx`. Pur.
 */
export function monthlyConsumptionExpenses(budgetItems: readonly BudgetCategory[]): number {
    return budgetItems.reduce(
        (sum, b) => (isSavingsNature(b.nature) ? sum : sum + monthlyTargetOf(b)),
        0,
    );
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
        // [HEALTH-RATIOS-NAN-ABSORBE-EN-AMONT] Garde d'ENTRÉE : une cible ou une dépense non finie
        // ne se rabat pas, elle REFUSE. Les deux sens ont été mesurés et chacun fabrique un score
        // parfaitement plausible : `target: Infinity` rendait 100 (`overspend/∞ = 0` — score
        // PARFAIT à partir d'un poste corrompu), et une dépense réelle `NaN`/`Infinity` rendait
        // 0 via le clamp (« 100 % de dépassement »). Aucun n'était visible d'une garde de sortie.
        if (!Number.isFinite(target)) return nonFiniteRefusal('cible de poste budget');
        if (target <= 0) continue;
        budgetTotal += target;
        const actual = actualsMap[item.name] ?? 0;
        if (!Number.isFinite(actual)) return nonFiniteRefusal('dépense réelle rapprochée');
        overspend += Math.max(0, actual - target);
    }
    if (budgetTotal <= 0) return null;
    return clamp01(100 * (1 - overspend / budgetTotal));
}

/**
 * [HEALTH-SUB-DRY] Coût MENSUEL des abonnements. Délègue au helper CANONIQUE `totalMonthlyCost`
 * (`utils/subscriptions.ts`, `Σ yearlyCost /12`) — source unique de l'annualisation (évite le ×12 d'un
 * abo ANNUEL, cf `PLANNING-ANNUAL-SUB-12X`). La garde `Number.isFinite` vit désormais dans `totalYearlyCost`
 * → si elle change, les deux surfaces (santé + Planning) restent alignées.
 */
export function subscriptionsMonthlyCost(subscriptions: readonly RecurringItem[]): number {
    return totalMonthlyCost(subscriptions);
}

/** Plafond du poids des abonnements : à `SUBSCRIPTION_LOAD_CEILING` × le revenu net mensuel, le score tombe à 0. */
export const SUBSCRIPTION_LOAD_CEILING = 0.15; // 15 % du revenu net

/**
 * Score du POIDS des abonnements (0-100). 100 = abos négligeables ; 0 = abos ≥ 15 % du revenu net mensuel.
 * Aucun abonnement → coût 0 → score 100 (pas de fardeau). `null` si le revenu n'est pas un nombre
 * exploitable (≤ 0, ou non fini) — rien à rapporter. Pur.
 *
 * ⚠️ `Number.isFinite` en plus de `> 0` (finding financial-integrity MESURÉ, panel PR #756) :
 * `Infinity > 0` est VRAI, donc un revenu `Infinity` — que `JSON.parse` produit à partir d'un blob
 * Drive/backup contenant `1e999` — donnait `load = 95 / Infinity = 0`, donc le score PARFAIT de
 * **100** au lieu de 87, avec le libellé « 0,0 % du revenu net » qui affirme un fait faux. Mesuré :
 * +8 points sur le total pondéré (67 au lieu de 75 après correction, contre 75 sur le cas sain).
 * `sanitizeNonFinite` (`utils/healthScore.ts`) ne peut structurellement PAS l'attraper : 100 est un
 * nombre fini. C'est la garde d'ENTRÉE qui doit refuser, pas la garde de sortie.
 */
export function computeSubscriptionLoadScore(
    subscriptions: readonly RecurringItem[],
    monthlyIncome: number,
): number | null {
    if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) return null;
    // [HEALTH-RATIOS-NAN-ABSORBE-EN-AMONT] Porte d'ÉCRITURE : un coût annuel illisible était JETÉ
    // du total, donc le fardeau paraissait plus LÉGER et le score MEILLEUR (mesuré : 95 $/mois →
    // 20 $/mois, score 87,3 → 97,3, sans une ligne de trace). Un calcul qui publie un score doit
    // refuser ; l'écran de Planning, lui, garde le droit d'afficher la somme des abos lisibles.
    const { discarded } = totalYearlyCostAudit(subscriptions);
    if (discarded > 0) return nonFiniteRefusal(`${discarded} abonnement(s) au coût annuel illisible`);
    const load = subscriptionsMonthlyCost(subscriptions) / monthlyIncome;
    return clamp01(100 * (1 - load / SUBSCRIPTION_LOAD_CEILING));
}
