// services/history/pastDebtNotice.ts
//
// [DEBT-AMORTIZATION-CABLAGE] La phrase que le bandeau du graphe Futur affiche à propos des dettes
// du PASSÉ reconstruit.
//
// ⚠️ Pourquoi un module à part plutôt qu'un ternaire dans le JSX. Cette phrase est une AFFIRMATION
// sur ce que la courbe montre : « dettes au niveau actuel » était exact tant que le passé les
// figeait, et est devenu FAUX le jour où le supplément d'amortissement a été branché. Sortie du
// composant, elle se teste directement — et elle se dérive du MÊME verdict que le calcul
// (`compterDettesAmorties` → `amortirDettePassee`), jamais d'une relecture des champs de la dette.
// Deux lectures indépendantes du même fait divergent toujours (`TEXT-HEURISTIC-OVER-USER-TEXT`).

import { compterDettesAmorties, type DebtAmortissable } from '../projection/debtAmortization';

/**
 * @param dettes           dettes hors hypothèque du store (tableau FRAIS).
 * @param moisAujourdhui   mois absolu du mois 0 de la projection (`startYear × 12 + startMonth`).
 * @param dettePubliee     total des dettes hors hypothèque publié par le moteur au mois 0.
 * @param aujourdhuiIso    le JOUR d'aujourd'hui — le verdict doit être rendu par le MÊME appel que
 *                         le calcul, sinon la phrase pourrait qualifier une autre courbe que celle
 *                         qui est tracée (`[DEBT-CADENCE-REELLE]`).
 * @returns le fragment à concaténer au bandeau, `''` quand il n'y a rien à dire (aucune dette).
 */
export function mentionDettesPasse(
    dettes: ReadonlyArray<DebtAmortissable> | null | undefined,
    moisAujourdhui: number,
    dettePubliee: number,
    aujourdhuiIso: string | null,
): string {
    if (!(dettePubliee > 0)) return '';
    const { amorties, total } = compterDettesAmorties(dettes, moisAujourdhui, aujourdhuiIso);
    if (amorties === 0) return 'dettes au niveau actuel';
    // Le cas MIXTE se nomme : annoncer « dettes amorties » serait faux pour la part de la somme
    // affichée qui reste figée (un révolvant à côté d'un prêt, une dette sans date de début).
    // ⚠️ L'exemple d'origine — « un bail à côté d'un prêt auto » — a été retiré le 2026-09-17 : un
    // bail S'AMORTIT désormais (forme LINÉAIRE, `KIND_VERSEMENTS_FIXES`), donc il n'illustrait plus
    // le cas mixte. Un exemple périmé dans un commentaire se lit comme un fait.
    if (amorties < total) return 'dettes partiellement amorties';
    return 'dettes amorties depuis leur date de début';
}
