// services/projection/pensionCredit.ts
// [FISC-LATENT-PENSION-CREDIT] Source UNIQUE de l'assiette du crédit pour revenu de retraite
// (ARC ligne 31400 · Revenu Québec ligne 361).
//
// Elle vivait jusqu'ici en CLOSURE dans `taxDecember` (`eligiblePensionFor`), donc inatteignable
// depuis tout autre module — c'est exactement ce qui a fait ROUTER la part « pension » du lot 84
// au lieu de la livrer (`HELPER-INAPPELABLE-PAR-SON-CONSOMMATEUR`). Extraite ici à entrées
// EXPLICITES, elle devient consommable par l'impôt de décembre ET par l'impôt latent.

import { AGE_AMOUNT_FED_MIN_AGE } from '../../utils/tax';
import { RRIF_FIRST_WITHDRAWAL_AGE } from './helpers';

/**
 * Revenu de pension ADMISSIBLE d'un déclarant, en dollars RÉELS annuels.
 *
 * ⚠️ Ce que l'assiette NE contient PAS, et pourquoi : les rentes PUBLIQUES (RRQ/PSV) ne sont pas
 * admissibles. Les y mettre est un SUR-crédit que ce moteur a déjà connu et corrigé
 * (~250-680 $/an/personne) — d'où des paramètres qui nomment leur contenu plutôt qu'un « revenu de
 * retraite » fourre-tout.
 *
 * ⚠️ `RRIF_FIRST_WITHDRAWAL_AGE` est DÉRIVÉ, pas coïncident : un retrait REER n'entre dans
 * l'assiette qu'à partir du moment où le moteur le considère comme du FERR — le gate de
 * `taxJanuary`. Découpler les deux accorderait le crédit un an trop tôt (mesuré +6 508 $ sur
 * 22 personas / 56). La règle stricte serait `max(65 ARC ; âge FERR du modèle)` ; le `max` est lié
 * par 72 aujourd'hui et ne se dénouerait que si la conversion volontaire 65-71 était modélisée
 * (limite consignée `FISCAL_REFERENCE` §4).
 *
 * @param age              âge du déclarant, `undefined` ⇒ pas de déclarant, donc pas d'assiette.
 * @param dbAnnualReal     rente de retraite PRIVÉE (DB/RPA) annualisée, en dollars réels.
 * @param rrifAnnualReal   retraits FERR annualisés, en dollars réels.
 */
export const eligiblePensionRealFor = (
    age: number | undefined,
    dbAnnualReal: number,
    rrifAnnualReal: number,
): number => {
    if (age === undefined) return 0;
    return (age >= AGE_AMOUNT_FED_MIN_AGE ? Math.max(0, dbAnnualReal) : 0)
        + (age >= RRIF_FIRST_WITHDRAWAL_AGE ? Math.max(0, rrifAnnualReal) : 0);
};
