import type { HealthWeights } from '../types';
import { logError } from '../services/errorLogger';

/**
 * @deprecated [PH4D-WEIGHTS-STORE] Clé localStorage HÉRITÉE — lue UNE SEULE FOIS par `loadLegacyHealthWeights` à l'init
 * du store, puis vestigiale (les poids vivent dans le store persisté). NE PAS réutiliser ailleurs.
 */
export const LEGACY_HEALTH_WEIGHTS_KEY = 'healthIndicator:weights:v1';

/** Pondérations par défaut des 6 ratios de santé (somme = 100, mais la somme est libre / normalisée à l'affichage).
 *  [PH4D-BUDGET-RATIOS] rebalancé pour intégrer `budgetParity` + `subscriptionLoad`. */
export const DEFAULT_HEALTH_WEIGHTS: HealthWeights = {
    savingsRate: 25,
    emergencyFund: 15,
    debtRatio: 15,
    fireProgress: 20,
    budgetParity: 15,
    subscriptionLoad: 10,
};

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * [PH4D-BUDGET-RATIOS] Complète un état de poids partiel (ex. 4 champs persistés avant l'ajout de `budgetParity`/
 * `subscriptionLoad`) en un `HealthWeights` complet : chaque champ manquant ou non-numérique prend le défaut.
 * Rétrocompat sans bump : un utilisateur existant garde ses 4 poids et reçoit les 2 nouveaux au défaut. Pur.
 */
export function normalizeHealthWeights(partial: Partial<HealthWeights> | null | undefined): HealthWeights {
    const p = partial ?? {};
    return {
        savingsRate: num(p.savingsRate, DEFAULT_HEALTH_WEIGHTS.savingsRate),
        emergencyFund: num(p.emergencyFund, DEFAULT_HEALTH_WEIGHTS.emergencyFund),
        debtRatio: num(p.debtRatio, DEFAULT_HEALTH_WEIGHTS.debtRatio),
        fireProgress: num(p.fireProgress, DEFAULT_HEALTH_WEIGHTS.fireProgress),
        budgetParity: num(p.budgetParity, DEFAULT_HEALTH_WEIGHTS.budgetParity),
        subscriptionLoad: num(p.subscriptionLoad, DEFAULT_HEALTH_WEIGHTS.subscriptionLoad),
    };
}

/**
 * [PH4D-WEIGHTS-STORE] Lit les poids de santé depuis l'ancienne clé localStorage (migration vers le store persisté).
 * TOLÉRANT : clé absente / JSON corrompu / champ manquant ou non-numérique → défaut PAR CHAMP. Ne jette jamais.
 * Pur (sauf lecture localStorage) → testable. Utilisé à l'init du store ; après la 1ʳᵉ sauvegarde, les poids vivent
 * dans l'état persisté (`financeai-storage`) et cette clé héritée devient vestigiale.
 */
export function loadLegacyHealthWeights(): HealthWeights {
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LEGACY_HEALTH_WEIGHTS_KEY) : null;
        if (!raw) return { ...DEFAULT_HEALTH_WEIGHTS };
        return normalizeHealthWeights(JSON.parse(raw) as Partial<HealthWeights>);
    } catch (e) {
        // JSON corrompu ou localStorage indisponible (mode privé) : repli sur les défauts, mais on TRACE
        // (corruption potentielle de localStorage) — sinon des poids revenus aux défauts seraient inexpliqués.
        logError({ source: 'storage', severity: 'warning', message: 'healthWeights : lecture héritée échouée, défauts appliqués', error: e });
        return { ...DEFAULT_HEALTH_WEIGHTS };
    }
}
