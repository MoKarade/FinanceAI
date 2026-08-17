// utils/daySeriesIndex.ts
// [FUTUR-DETAIL-STEP-DAY] Position du jour AFFICHÉ dans la série sélectionnable — fonction PURE.
//
// ⚠️ POURQUOI CE MODULE EXISTE, et c'est un défaut mesuré sur ma propre livraison. La 1re version
// résolvait l'index depuis `detailPoint`, c'est-à-dire le point que `detailPointFor` a REBASÉ sur
// le mois hôte. Un point mensuel n'a pas de `dayIso` : la branche « par jour » était donc du CODE
// MORT et on retombait sur `monthIndex`. Or dans une série QUOTIDIENNE, seul le jour 1 porte
// l'abscisse entière du mois — l'index résolvait donc TOUJOURS au 1er du mois, quel que soit le
// jour ouvert. Conséquence : « Lendemain » depuis le 15 sautait au 2, et sur un jour futur (où le
// point rebasé ne change pas) les clics suivants ne faisaient RIEN de visible.
//
// ⚠️ Deux ancres, deux rôles, à ne jamais confondre :
//   • `detailDayIso` — gated sur `dayIsReal`, c'est ce qui autorise à AFFIRMER des transactions
//     mesurées. Un jour futur n'en a pas, et c'est voulu (no-fake-data).
//   • l'ancre de NAVIGATION ci-dessous — posée sur TOUT jour, projeté compris, parce que se
//     déplacer d'un jour à l'autre n'affirme rien sur les données.
// Les fusionner ferait soit mentir l'affichage, soit geler les flèches dans le futur.
//
// Extrait en fonction pure parce que le défaut vivait dans la COUCHE APPELANTE : le test du
// composant vérifiait le contrat des boutons (props reçues → callback appelé) et ne pouvait pas
// voir que l'index fourni était faux.

/** Point minimal nécessaire pour se repérer dans la série. */
export interface DaySeriesPoint {
    monthIndex: number;
    dayIso?: string;
}

/**
 * Index du point affiché dans `series`.
 *
 * @param anchorIso Jour d'ancrage (`YYYY-MM-DD`) lu sur le point d'ORIGINE, avant tout rebasage.
 * @param monthIndex Repli quand le panneau a été ouvert sur un point MENSUEL (pastille d'événement).
 * @returns l'index, ou `-1` si introuvable (les flèches se désactivent alors).
 */
export function resolveDaySeriesIndex(
    series: readonly DaySeriesPoint[],
    anchorIso: string | null | undefined,
    monthIndex: number | null | undefined,
): number {
    if (!series || series.length === 0) return -1;
    // ⚠️ L'ancre D'ABORD : c'est la seule information qui identifie un JOUR. Le repli mensuel ne
    // sert qu'aux ouvertures qui n'ont jamais eu de jour.
    if (anchorIso) {
        const i = series.findIndex((p) => p.dayIso === anchorIso);
        // ⚠️ Pas de repli silencieux vers le mois si l'ancre est absente de la série (fenêtre
        // rezoomée sur une autre plage) : renvoyer le 1er du mois ferait sauter l'utilisateur
        // ailleurs sans rien dire. `-1` désactive les flèches, ce qui est honnête.
        return i;
    }
    if (!Number.isFinite(monthIndex)) return -1;
    return series.findIndex((p) => p.monthIndex === monthIndex);
}
