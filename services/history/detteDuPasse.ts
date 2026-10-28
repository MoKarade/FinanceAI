// services/history/detteDuPasse.ts
//
// [FUTUR-HISTORIQUE-DETTE-DU-JOUR] Dette hors hypothèque À UNE DATE PASSÉE — source UNIQUE.
//
// La formule vivait en ligne dans `dailyPastLedger` (courbe du Futur, au jour) pendant que
// l'Historique du Futur (`FutureHistorySection`) retranchait la dette d'AUJOURD'HUI à toutes ses
// dates : deux écrans du même onglet racontaient deux passés, et l'Historique affichait un solde
// jamais dû (un bail remboursé chaque semaine y restait plat à son niveau du jour, donc le passé
// était sous-évalué de tout ce qui a été versé depuis). Deux calculs du même solde divergent sans
// que rien ne rougisse : on extrait, on ne recopie pas.
//
// La formule (inchangée, déplacée) : dette du jour
//   − dettes pas encore commencées à cette date (palier MENSUEL, `sumNotYetStartedDebtsAtAbsoluteMonth`)
//   + ce qui a été remboursé ENTRE cette date et aujourd'hui (`prepareSupplementAmortiParJour` :
//     virements réels si la dette est liée, grille de la cadence déclarée, sinon palier mensuel).
// Planchée à 0 : une dette n'est jamais négative.

import { moisAbsolu, sumNotYetStartedDebtsAtAbsoluteMonth } from '../projection/debtSchedule';
import { prepareSupplementAmortiParJour, type DebtAmortissable, type MouvementDette } from '../projection/debtAmortization';

/**
 * Prépare UNE fois (la série d'amortissement d'un prêt long coûte cher) la fonction qui rend la
 * dette hors hypothèque à un jour donné (`AAAA-MM-JJ`). Au jour d'aujourd'hui elle rend
 * exactement `detteDuJour` : le passé se raccorde au présent sans marche.
 */
export function prepareDetteNonImmoAuJour(
    /** Dette hors hypothèque d'AUJOURD'HUI (déjà ramenée au jour — `computeTotalDebt` ou `DettesNonImmo` du moteur). */
    detteDuJour: number,
    dettes: ReadonlyArray<DebtAmortissable>,
    /** Le jour LOCAL d'aujourd'hui (ISO). */
    aujourdhuiIso: string,
    /** Transactions RÉELLES (une dette liée à un marchand descend sur ses virements). */
    transactions: ReadonlyArray<MouvementDette> | null | undefined,
): (jourIso: string) => number {
    // `?? +∞` : repli défensif (jamais atteint, `aujourdhuiIso` est garanti par l'appelant) qui
    // neutralise seulement l'exclusion des dettes futures, sans réintroduire le défaut d'origine.
    const moisAujourdhui = moisAbsolu(aujourdhuiIso) ?? Number.POSITIVE_INFINITY;
    const supplementAuJour = prepareSupplementAmortiParJour(dettes, moisAujourdhui, aujourdhuiIso, transactions);
    return (jourIso: string): number => {
        const moisDuJour = moisAbsolu(jourIso) ?? Number.POSITIVE_INFINITY;
        return Math.max(0, detteDuJour
            - sumNotYetStartedDebtsAtAbsoluteMonth(dettes, moisDuJour, moisAujourdhui)
            + supplementAuJour(jourIso));
    };
}
