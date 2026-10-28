// components/projection/alerteObjectifsManques.ts
//
// [ENG-GOALSHORTFALLS-EXPOSE] (décision Marc 2026-09-04 : EXPOSER, pas supprimer)
// Le moteur publie `goalShortfalls { count, total }` depuis PV-11 (#247) — des objectifs
// financiers (`applyFinancialGoalDeadlines`) que la projection n'a PAS pu financer en entier,
// avec le manque cumulé en dollars. Personne ne le lisait ; le bandeau de l'onglet Futur le
// consomme désormais via cette dérivation PURE — la phrase vit ici, jamais recopiée dans le JSX,
// et le MONTANT reste une DONNÉE jusqu'au rendu (il finit masqué par le mode discret, donc il ne
// s'interpole pas dans le libellé — `UN-MONTANT-INTERPOLE-DANS-UNE-CHAINE-N-EST-PLUS-UN-NOEUD`).

interface AlerteObjectifsManques {
    /** Nombre d'objectifs touchés (≥ 1). */
    count: number;
    /** Manque cumulé en dollars (fini, ≥ 1 $ — le producteur arrondit au dollar). */
    montant: number;
    /** La phrase SANS le montant ; le rendu ajoute « — il a manqué <montant> au fil de la projection. » */
    libelle: string;
}

/**
 * Dérive le bandeau « objectif non financé » du champ publié par le moteur.
 * Rend `null` (rien à afficher) quand :
 *  - le champ est absent (projection gelée d'avant PV-11, ou scénario réduit) — no-fake-data ;
 *  - `count` ≤ 0 ou non fini — aucun objectif touché n'est PAS un état à afficher ;
 *  - `montant` < 1 $ ou non fini — un « il a manqué 0 $ » serait une alerte qui n'alerte de rien.
 */
export function construireAlerteObjectifsManques(
    goalShortfalls: { count: number; total: number } | null | undefined,
): AlerteObjectifsManques | null {
    if (!goalShortfalls) return null;
    const { count, total } = goalShortfalls;
    if (!Number.isFinite(count) || count <= 0) return null;
    if (!Number.isFinite(total) || total < 1) return null;
    const libelle = count === 1
        ? 'Un objectif n\'a pas pu être financé en entier'
        : `${count} objectifs n'ont pas pu être financés en entier`;
    return { count, montant: total, libelle };
}
