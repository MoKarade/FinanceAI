import type { HealthWeights } from '../types';
import { logError } from '../services/errorLogger';

/**
 * @deprecated [PH4D-WEIGHTS-STORE] Clé localStorage HÉRITÉE — lue UNE SEULE FOIS par `loadLegacyHealthWeights` à l'init
 * du store, puis vestigiale (les poids vivent dans le store persisté). NE PAS réutiliser ailleurs.
 */
export const LEGACY_HEALTH_WEIGHTS_KEY = 'healthIndicator:weights:v1';

/** Pondérations par défaut des 4 ratios de santé (somme = 100, mais la somme est libre / normalisée à l'affichage). */
export const DEFAULT_HEALTH_WEIGHTS: HealthWeights = {
    savingsRate: 30,
    emergencyFund: 20,
    debtRatio: 20,
    fireProgress: 30,
};

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

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
        const p = JSON.parse(raw) as Partial<HealthWeights>;
        return {
            savingsRate: num(p.savingsRate, DEFAULT_HEALTH_WEIGHTS.savingsRate),
            emergencyFund: num(p.emergencyFund, DEFAULT_HEALTH_WEIGHTS.emergencyFund),
            debtRatio: num(p.debtRatio, DEFAULT_HEALTH_WEIGHTS.debtRatio),
            fireProgress: num(p.fireProgress, DEFAULT_HEALTH_WEIGHTS.fireProgress),
        };
    } catch (e) {
        // JSON corrompu ou localStorage indisponible (mode privé) : repli sur les défauts, mais on TRACE
        // (corruption potentielle de localStorage) — sinon des poids revenus aux défauts seraient inexpliqués.
        logError({ source: 'storage', severity: 'warning', message: 'healthWeights : lecture héritée échouée, défauts appliqués', error: e });
        return { ...DEFAULT_HEALTH_WEIGHTS };
    }
}
