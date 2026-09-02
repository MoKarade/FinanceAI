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
 * @returns le fragment à concaténer au bandeau, `''` quand il n'y a rien à dire (aucune dette).
 */
export function mentionDettesPasse(
    dettes: ReadonlyArray<DebtAmortissable> | null | undefined,
    moisAujourdhui: number,
    dettePubliee: number,
): string {
    if (!(dettePubliee > 0)) return '';
    const { amorties, total } = compterDettesAmorties(dettes, moisAujourdhui);
    if (amorties === 0) return 'dettes au niveau actuel';
    // Le cas MIXTE se nomme : un bail à côté d'un prêt auto est exactement la situation de Marc, et
    // annoncer « dettes amorties » y serait faux pour la moitié de la somme affichée.
    if (amorties < total) return 'dettes partiellement amorties';
    return 'dettes amorties depuis leur date de début';
}
