// components/future/panneauPas.ts
// [FUTUR-PANNEAU-FIXE] Se déplacer d'un jour à l'autre — fonctions PURES.
//
// ⚠️ POURQUOI UN PAS RÉGLABLE, et pourquoi c'est la réponse au téléphone. Sur PC, viser un jour à
// la souris marche parce qu'on peut zoomer à la molette. Au doigt, non : à l'horizon par défaut
// (40 ans), un mois vaut **≈ 0,7 px** (mesuré, `UN-RANG-CALCULE-AVANT-L-ECRETAGE…`) — aucune tape
// ne peut être précise, et ce n'est pas une question de soin, c'est une question de pixels.
// Trois options lui ont été proposées (tape + flèches, curseur sous le graphe, flèches seules) ;
// il les a toutes refusées et en a demandé d'autres. Sur les quatre suivantes, il a retenu les
// **flèches à pas réglable (jour / mois / année)**.
//
// Ce que ça répare : « flèches seules » était pénible pour remonter plusieurs mois — trois ans en
// arrière coûtait mille tapes. À pas réglable, ça en coûte trois. Et surtout, rien n'est à
// deviner : aucun geste caché, tout est écrit à l'écran.

/** Point minimal nécessaire pour se déplacer dans la série. */
export interface PointDeplacable {
    /** Abscisse du graphe. FRACTIONNAIRE sur un point quotidien (un jour = une fraction de mois). */
    monthIndex: number;
}

export type PasNavigation = 'jour' | 'mois' | 'annee';

export interface PasDef {
    id: PasNavigation;
    /** Libellé du bouton de réglage. */
    label: string;
    /** Ce que les flèches font, en toutes lettres — sert d'`aria-label` et de `title`. */
    aide: string;
    /** Combien de MOIS d'abscisse le pas vaut, ou `null` quand le pas est « un point de série ». */
    mois: number | null;
}

export const PAS_NAVIGATION: readonly PasDef[] = [
    { id: 'jour', label: 'Jour', aide: 'Les flèches avancent d’un jour', mois: null },
    { id: 'mois', label: 'Mois', aide: 'Les flèches avancent d’un mois', mois: 1 },
    { id: 'annee', label: 'Année', aide: 'Les flèches avancent d’un an', mois: 12 },
];

export const PAS_PAR_DEFAUT: PasNavigation = 'jour';

const defDuPas = (pas: PasNavigation): PasDef => PAS_NAVIGATION.find((p) => p.id === pas) ?? PAS_NAVIGATION[0];

/**
 * Index du point d'AUJOURD'HUI dans la série — ou du plus proche si la fenêtre ne le contient pas.
 *
 * `xAujourdhui` : abscisse du jour même. ⚠️ [FUTUR-ANCRE-AUJOURDHUI] Ce n'est PAS 0 sur la courbe
 * au jour : depuis [FUTUR-DAILY-ROLLOVER], l'abscisse 0 est le 1er du mois COURANT, et les jours
 * réels de ce mois avant aujourd'hui occupent [0, xAujourdhui). La règle « premier point ≥ 0 »
 * désignait donc le 1er du mois — le 25/09, le panneau « Aujourd'hui » montrait le 01/09, et la
 * valeur flottante de la courbe s'écartait de la tuile Patrimoine net de tous les mouvements du
 * mois. Défaut 0 : la courbe au mois (repli), où le mois 0 EST aujourd'hui.
 *
 * Fenêtre entièrement dans le PASSÉ → le dernier point, c'est-à-dire le plus proche d'aujourd'hui
 * par le bas ; entièrement dans le futur → le premier. C'est la même règle que le geste clavier du
 * graphe, extraite ici pour que les deux ne puissent plus diverger.
 */
export function indexAujourdhui(series: readonly PointDeplacable[], xAujourdhui = 0): number {
    if (!series || series.length === 0) return -1;
    // Tolérance d'arrondi : l'abscisse du jour et celle de son point sont calculées par deux
    // chemins (date ISO / jour du mois) qui peuvent différer au dernier bit.
    const seuil = xAujourdhui - 1e-9;
    const i = series.findIndex((p) => p.monthIndex >= seuil);
    return i === -1 ? series.length - 1 : i;
}

/**
 * Index du point atteint en partant de `idx` d'un pas dans la direction `dir`.
 *
 * @returns le nouvel index, ou `-1` quand le déplacement est impossible (bord de la série).
 *
 * ⚠️ LES CANDIDATS SONT CONTRAINTS AU BON CÔTÉ de `idx`, et c'est le cœur de la fonction. Chercher
 * simplement « le point dont l'abscisse est la plus proche de la cible » peut rendre `idx`
 * lui-même quand la cible dépasse la fin de la série — une flèche qui ne fait RIEN sans rien dire,
 * indiscernable d'un clic manqué. En bornant aux index strictement supérieurs (ou inférieurs), un
 * déplacement possible est toujours un déplacement VISIBLE, et un déplacement impossible rend
 * `-1`, ce qui désactive le bouton.
 *
 * ⚠️ Un pas d'un mois ou d'un an peut atterrir PLUS PRÈS que demandé quand la série s'arrête
 * avant : c'est assumé, et la date affichée dans le panneau dit la vérité. L'inverse — geler les
 * flèches près des bords — rendrait l'année inutilisable sur presque toute la fenêtre.
 */
export function indexApresPas(
    series: readonly PointDeplacable[],
    idx: number,
    dir: -1 | 1,
    pas: PasNavigation,
): number {
    if (!series || idx < 0 || idx >= series.length) return -1;
    const mois = defDuPas(pas).mois;
    // Pas « jour » = un POINT de la série sélectionnable, pas 24 h d'abscisse : la série est déjà
    // la liste des jours (ou des mois, en repli mensuel). Compter en abscisse y sauterait des
    // points, puisqu'un jour de février ne vaut pas un jour de mars (1/28 contre 1/31).
    if (mois === null) {
        const next = idx + dir;
        return next >= 0 && next < series.length ? next : -1;
    }
    const cible = series[idx].monthIndex + dir * mois;
    let meilleur = -1;
    let ecart = Infinity;
    // ⚠️ On parcourt EN PARTANT DE `idx` et en s'en éloignant — pas dans l'ordre du tableau.
    // Combiné au `<` strict ci-dessous, ça tranche les ex æquo en faveur du plus PETIT saut. Dans
    // l'ordre du tableau, un pas « veille » entre deux points à écart égal aurait sauté au plus
    // LOINTAIN des deux, ce qui est le contraire de ce qu'une flèche promet.
    for (let i = idx + dir; i >= 0 && i < series.length; i += dir) {
        const e = Math.abs(series[i].monthIndex - cible);
        if (e < ecart) {
            ecart = e;
            meilleur = i;
        }
    }
    return meilleur;
}
