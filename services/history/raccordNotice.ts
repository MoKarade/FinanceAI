// services/history/raccordNotice.ts
//
// [PASSE-REEL-RACCORD-CHUTE] La phrase qui explique la MARCHE entre le dernier point du passé et
// aujourd'hui.
//
// ⚠️ Marc : « je vois une chute de 10k aujourd'hui jsp pourquoi ». Mesuré : ce n'est PAS un bug de
// calcul. La reconstruction du cash remonte le temps depuis le solde d'aujourd'hui en DÉFAISANT les
// flux, et son dernier point est la VEILLE — donc `veille = aujourd'hui − flux_du_jour`. Un
// paiement d'hypothèque de 10 000 $ daté d'aujourd'hui fait apparaître la veille 10 000 $ plus
// haute, et la courbe « chute » au raccord. Les deux points sont justes ; c'est leur LECTURE qui
// est fausse faute d'explication (`SILENCE-READS-AS-BROKEN`).
//
// ⚠️ Ne JAMAIS lisser la marche : ce serait fabriquer un solde que Marc n'a jamais eu. Le correctif
// est une PHRASE, pas un calcul.
//
// ⚠️ La phrase ne porte AUCUN montant, délibérément. Un montant interpolé dans une chaîne n'est plus
// un nœud, donc plus masquable en mode discret
// (`UN-MONTANT-INTERPOLE-DANS-UNE-CHAINE-N-EST-PLUS-UN-NOEUD`) — et le FAIT suffit à expliquer la
// marche, le montant est déjà lisible sur la courbe elle-même.

/**
 * @param fluxPeriodeAnnulee flux net de la période courante, celui que la reconstruction a défait.
 * @returns la mention à afficher, ou `''` quand il n'y a rien à expliquer (aucun mouvement du jour).
 */
export function mentionRaccord(fluxPeriodeAnnulee: number): string {
    if (!Number.isFinite(fluxPeriodeAnnulee) || fluxPeriodeAnnulee === 0) return '';
    // Le SENS compte : une sortie fait descendre la courbe au raccord, une entrée la fait monter.
    // Dire « chute » sur une entrée enverrait chercher un problème qui n'existe pas.
    return fluxPeriodeAnnulee < 0
        ? "la dernière journée du passé précède tes mouvements d'aujourd'hui — d'où la marche vers le bas au raccord"
        : "la dernière journée du passé précède tes mouvements d'aujourd'hui — d'où la marche vers le haut au raccord";
}
