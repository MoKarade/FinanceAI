// [HORIZON-ESPERANCE-DE-VIE] (2026-09-25, décisions de Marc) — la projection de l'app va TOUJOURS
// jusqu'à l'espérance de vie de la personne 1 ; le curseur « Horizon (Années) » disparaît.
//
// Avant : un horizon choisi au curseur (5 à 50 ans, 40 pour le persona « Couple à l'aise », donc
// jusqu'à 75 ans) pendant que Retraite annonçait « Succès jusqu'à 92 ans » et « Héritage (92 ans) » :
// rien n'était calculé entre 75 et 92 ans, et « l'héritage à 92 ans » était la valeur à 75 ans.
//
// Source unique, appliquée aux DEUX portes vers le moteur qui partent de l'état de l'app
// (`useSimulationParams` et `deriveSimulationInputsFromState`) : l'écran et le serveur MCP calculent
// sur la même durée. Un appelant qui fixe `years` APRÈS la dérivation (ex. `simulate_what_if`, qui
// reçoit l'horizon en paramètre) garde la main.
import type { BudgetConfig, ProjectionConfig, RetirementGoal } from '../../types';
import { DEFAULT_LIFE_EXPECTANCY } from './modelAssumptions';

/** Âge de repli quand la personne 1 n'a pas d'âge saisi — le même que le moteur (`user1?.age || 30`). */
const AGE_REPLI = 30;
/** Plancher : même une personne déjà à son espérance de vie garde une projection lisible (ancien minimum du curseur). */
export const HORIZON_MIN_ANNEES = 5;

export function horizonAnnees(agePersonne1: number | undefined, esperanceDeVie: number | undefined): number {
    const age = typeof agePersonne1 === 'number' && Number.isFinite(agePersonne1) && agePersonne1 > 0 ? agePersonne1 : AGE_REPLI;
    const esperance = typeof esperanceDeVie === 'number' && Number.isFinite(esperanceDeVie) && esperanceDeVie > 0
        ? esperanceDeVie
        : DEFAULT_LIFE_EXPECTANCY;
    return Math.max(HORIZON_MIN_ANNEES, Math.round(esperance - age));
}

/** Espérance de vie effective (valeur saisie, sinon le défaut du moteur) — pour les libellés. */
export function esperanceDeVieEffective(retirementGoal: Pick<RetirementGoal, 'lifeExpectancy'> | null | undefined): number {
    const v = retirementGoal?.lifeExpectancy;
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : DEFAULT_LIFE_EXPECTANCY;
}

export function avecHorizonEsperanceDeVie<P extends ProjectionConfig | null | undefined>(
    projection: P,
    config: Pick<BudgetConfig, 'users'> | null | undefined,
    retirementGoal: Pick<RetirementGoal, 'lifeExpectancy'> | null | undefined,
): P {
    // État dégradé (app neuve, restauration partielle) : rien à ajuster, la garde d'entrée du
    // moteur (`verifierEntreesMoteur`) garde la main sur ce qui manque.
    if (!projection) return projection;
    const years = horizonAnnees(config?.users?.[0]?.age, retirementGoal?.lifeExpectancy);
    return projection.years === years ? projection : { ...projection, years } as P;
}
