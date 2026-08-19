import type { HealthWeights } from '../types';
import { logError, logErrorThrottled } from '../services/errorLogger';

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
    const cles = Object.keys(DEFAULT_HEALTH_WEIGHTS) as Array<keyof HealthWeights>;

    // [SILENT-HEALTHWEIGHTS-FIELD] Distinguer ABSENT de CORROMPU.
    // Un champ ABSENT est normal et voulu : c'est la rétrocompat (un utilisateur d'avant l'ajout de
    // `budgetParity`/`subscriptionLoad` n'a que 4 poids, et reçoit les 2 nouveaux au défaut). Le
    // repli est alors la bonne réponse, silencieusement.
    // Un champ PRÉSENT mais non fini (`NaN`, `null`, une chaîne, `Infinity`) est tout autre chose :
    // quelque chose a écrit une valeur invalide. Retomber sur le défaut SANS TRACE fait qu'un poids
    // revenu à sa valeur d'usine paraît inexpliqué — l'utilisateur voit son réglage « oublié » et
    // n'a rien à quoi le rattacher. On trace donc ce cas-là, et lui seul.
    // ⚠️ `k in p` seul classerait `{ savingsRate: undefined }` comme PRÉSENT (l'opérateur `in` teste
    // la clé, pas la valeur) — or un `undefined` explicite, que `Partial<HealthWeights>` autorise,
    // est conceptuellement un champ ABSENT. Latent aujourd'hui (aucun appelant n'en produit, et
    // JSON n'a pas d'`undefined`), mais la fonction est exportée et pure : la clause coûte un `&&`.
    const corrompus = cles.filter(
        (k) => k in p && p[k] !== undefined && !(typeof p[k] === 'number' && Number.isFinite(p[k])),
    );
    if (corrompus.length > 0) {
        // Agrégé en UN seul appel (throttle par signature de champs) : six champs corrompus ne
        // doivent pas produire six lignes de diagnostic.
        logErrorThrottled(`health-weights-corrompus:${corrompus.join(',')}`, {
            source: 'storage', severity: 'warning',
            message: `Pondérations de santé : ${corrompus.length} champ(s) invalide(s) remis au défaut`,
            context: { champs: corrompus, valeurs: corrompus.map((k) => String(p[k])) },
        });
    }

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
