// components/future/jourAffiche.ts
// [FUTUR-PANNEAU-FIXE] QUEL jour le panneau fixe montre — fonction PURE.
//
// ⚠️ CE QUE CE MODULE CHANGE PAR RAPPORT À L'INFOBULLE FLOTTANTE. L'infobulle n'existait que
// pendant un survol ou un gel : hors de ces deux états, il n'y avait RIEN à montrer, et c'était
// cohérent — un objet qui suit le curseur n'a pas de raison d'être quand le curseur est ailleurs.
// Un panneau FIXE, lui, est toujours là. Il lui faut donc un TROISIÈME état, qui n'existait pas :
// ce qu'il montre quand personne ne survole et que rien n'est épinglé. Marc a tranché en clic —
// « Aujourd'hui ». C'est l'ANCRE.
//
// Priorité, et elle n'est pas arbitraire :
//   1. ÉPINGLÉ — un clic est une intention explicite ; le survol ne doit plus rien pouvoir changer
//      (c'est déjà ce que garantit la machine d'état, qui ignore le survol en mode `frozen`).
//      C'est la moitié qui règle l'irritant n°1 de Marc : « elle disparaît / bouge quand je veux
//      la lire ». Épinglé, on peut descendre la souris DANS le panneau sans qu'il change.
//   2. SURVOL — l'aperçu, tant que rien n'est épinglé.
//   3. ANCRE — aujourd'hui, au repos.
//
// ⚠️ L'ORIGINE EST PUBLIÉE, et ce n'est pas décoratif : trois états qui se ressemblent à l'écran
// et ne veulent pas dire la même chose, c'est `UNE-VALEUR-NON-VERIFIEE-NE-PORTE-PAS-L-HABILLAGE-
// D-UNE-VALEUR-VERIFIEE` appliqué à une sélection. Sans elle, un utilisateur qui a épinglé le
// 12 août et qui revient cinq minutes plus tard ne peut pas savoir s'il regarde son épingle ou
// la date du jour.

/** Mode de la machine d'état de sélection (identique à celui du hook). */
export type ModeSelection = 'idle' | 'hovering' | 'frozen';

export type OrigineJour = 'epingle' | 'survol' | 'ancre';

export interface JourAffiche<P> {
    point: P;
    origine: OrigineJour;
}

/**
 * Le jour que le panneau doit montrer.
 *
 * @param mode            État de la machine de sélection.
 * @param pointInteraction Point survolé ou épinglé (la machine n'en garde qu'un seul à la fois).
 * @param pointAncre      Le point d'AUJOURD'HUI, ou le plus proche que la fenêtre contienne.
 * @returns le point et d'où il vient, ou `null` quand il n'y a rien d'honnête à montrer.
 *
 * ⚠️ `null` plutôt qu'un repli : sans ancre ET sans interaction, le panneau n'a aucun jour à
 * décrire. Inventer le premier point de la série afficherait des montants d'une date que
 * personne n'a demandée — un chiffre juste au mauvais endroit reste un chiffre faux.
 */
export function choisirJourAffiche<P>(
    mode: ModeSelection,
    pointInteraction: P | null | undefined,
    pointAncre: P | null | undefined,
): JourAffiche<P> | null {
    if (mode === 'frozen' && pointInteraction != null) return { point: pointInteraction, origine: 'epingle' };
    if (mode === 'hovering' && pointInteraction != null) return { point: pointInteraction, origine: 'survol' };
    if (pointAncre != null) return { point: pointAncre, origine: 'ancre' };
    return null;
}

/**
 * Ce que le panneau AFFIRME sur l'origine de ce qu'il montre.
 *
 * ⚠️ Le texte vit ici et pas dans le JSX pour qu'une garde puisse l'affirmer sans monter le
 * graphe entier, et pour qu'il n'existe qu'une seule formulation par état.
 */
// ⚠️ TROIS LIBELLÉS COURTS, et la brièveté n'est pas un goût : la garde
// `[FUTUR-INFOBULLE-EPUREE]` refuse tout nœud de texte de plus de 45 caractères dans ce panneau.
// Elle existe parce que « moins de texte » se réalise trivialement en SUPPRIMANT de
// l'information — elle borne donc la PROSE sans jamais autoriser à retirer un fait. Mes trois
// premiers jets la violaient tous les trois : le geste juste est de DIRE l'état, pas de
// l'expliquer. Mesuré : 34 / 39 / 31 caractères.
export const LIBELLE_ORIGINE: Record<OrigineJour, string> = {
    epingle: 'Jour épinglé — Échap pour relâcher',
    survol: 'Aperçu — clique la courbe pour épingler',
    ancre: 'Aujourd’hui — survole la courbe',
};
