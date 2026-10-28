/**
 * [FUTUR-DAILY-STACK-X] Empilement vertical des pastilles d'événement du graphe Futur.
 *
 * Le rang (`subIdx`) décale la pastille au-dessus (vie) ou en dessous (flux) de la courbe :
 * `dy = ±(20 + subIdx × 24)` dans `ClickableEventIcon`. Il n'a de sens que s'il est calculé sur
 * les événements RÉELLEMENT montrés.
 *
 * ⚠️ Pourquoi cette fonction existe, mesuré : le rang était attribué en amont, sur la liste
 * COMPLÈTE des événements, avant le filtre de fenêtre et avant l'écrêtage de densité
 * (`sampleEvenly`, 24 pastilles « vie » / 16 « flux »). Un mois portant trois événements dont
 * l'échantillonnage ne garde que le troisième laissait donc une pastille au rang 2 — dessinée à
 * 68 px de la courbe, au bout d'une longue tige, avec DEUX étages vides en dessous. Le rang
 * survivait à ses voisins.
 *
 * Le rang se calcule donc APRÈS écrêtage. Conséquence voulue : la numérotation lue par un lecteur
 * d'écran (« (2) », « (3) » dans l'`aria-label`) désigne enfin des pastilles qui existent.
 */
export function assignStackIndex<T extends { monthIndex: number; subIdx: number }>(events: readonly T[]): T[] {
    const parMois: Record<number, number> = {};
    return events.map((e) => {
        const rang = parMois[e.monthIndex] ?? 0;
        parMois[e.monthIndex] = rang + 1;
        return { ...e, subIdx: rang };
    });
}
