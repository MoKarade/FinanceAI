// services/projection/fireMilestone.ts
//
// [FUTUR-FIRE-STRUCT] Jalon FIRE : sa condition STRUCTURELLE et son libellé d'événement, au MÊME
// endroit. Le moteur émet à CHAQUE point de `chartData` la cible du mois (`FireTarget`, déjà
// inflation-ajustée) et `NetWorth` ; le jalon est donc DÉRIVABLE de champs numériques.
//
// ⚠️ Ne JAMAIS re-dériver « FIRE atteint » par une regex sur `lifeEvents` dans un chemin qui
// AFFIRME (prompt IA, export, calcul) : `lifeEvents` mélange des messages du moteur et du TEXTE
// UTILISATEUR interpolé (nom d'enfant — services/projection/childrenReee.ts ; nom d'immeuble —
// services/projection/realEstateMonth.ts). Un immeuble nommé « Fire pit reno » suffit à faire
// matcher /\bfire\b/i et à fabriquer une année FIRE qui n'existe pas.
//
// La pastille de la courbe (components/FutureProjection.tsx ~l.440) utilise ENCORE cette regex
// souple pour choisir l'icône 🔥 : toléré (l'utilisateur voit la pastille ET son libellé, il peut
// la démentir à l'œil), mais à unifier — ticket BACKLOG [FUTUR-FIRE-REGEX-SHARED].

/** Libellé EXACT du lifeEvent FIRE journalisé par le moteur (services/projection.ts). Source unique
 *  du texte : un consommateur qui doit vraiment matcher le libellé compare à CETTE constante. */
export const FIRE_LIFE_EVENT = 'Objectif FIRE Atteint 🔥';

/** Sous-ensemble structurel d'un point de `chartData` nécessaire au jalon FIRE. */
export interface FireMilestonePoint {
    NetWorth?: number;
    FireTarget?: number;
}

/**
 * Le point atteint-il la cible FIRE du mois ? Même prédicat que le classement des stratégies
 * (services/projection/strategyRanking.ts) et que le moteur lui-même (`rawNetWorth >=
 * futureFireTarget`, projection.ts).
 *
 * ⚠️ Garde `FireTarget > 0` : sans objectif configuré (dépenses de référence à 0 → cible 0), le
 * moteur journalise le lifeEvent dès le mois 0 puisque tout patrimoine ≥ 0. Un jalon dérivé ici
 * serait alors un faux « FIRE atteint » — on n'en émet AUCUN (cohérent avec l'omission de
 * `fireNumber` ≤ 0 côté contexte IA : pas de chiffre plausible inventé).
 * `NetWorth` non fini (NaN) → false (une comparaison avec NaN est fausse) : jamais de jalon deviné.
 */
export function isFireReached(p: FireMilestonePoint): boolean {
    const target = p.FireTarget ?? 0;
    return target > 0 && (p.NetWorth ?? 0) >= target;
}

/** Premier point (dans l'ordre du tableau) où la cible FIRE est atteinte, sinon `undefined`. */
export function findFireReachedPoint<T extends FireMilestonePoint>(
    points: ReadonlyArray<T>,
): T | undefined {
    return points.find(isFireReached);
}
