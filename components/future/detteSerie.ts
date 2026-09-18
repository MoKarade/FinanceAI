// components/future/detteSerie.ts
//
// [FUTUR-COURBE-DETTE] La dette, tracée SOUS ZÉRO sur le graphe Futur.
//
// Marc, 2026-09-18 : « je veux voir la courbe de la dette même dans le passé ». Mesuré avant de
// coder : le graphe portait DOUZE séries (Cash, CELI, CELIAPP, REER, REEE, Non-Enreg, Crypto,
// Immobilier, Entreprise, Valeur nette, Impôt latent, Paiement d'impôts) et **aucune n'était la
// dette** — alors que `DettesNonImmo` est calculé sur CHAQUE point, passé comme futur, et figure
// déjà dans `CURVE_FIELDS` (il y est entré pour que le patrimoine au jour se RECOMPOSE). La donnée
// était là ; il manquait la courbe.
//
// ⚠️⚠️ **CE QUE MARC PRENAIT POUR SA DETTE.** Sa réponse disait : « je vois pourtant bien qu'il y a
// une courbe rouge en dessous de zéro donc je veux que ce soit celle-ci qui continue SI c'est bien
// celle de la dette ». Ce n'en est pas une : la rouge pointillée sous zéro est l'**impôt latent**
// (`computeLatentTax` rend `-(impôt de liquidation − impôt de base)`, donc négatif par construction),
// et elle ne commence qu'au premier mois PROJETÉ faute d'historique des prix de revient. Deux
// grandeurs radicalement différentes — une dette RÉELLE qu'il rembourse chaque semaine contre un
// impôt HYPOTHÉTIQUE qu'il ne paiera peut-être jamais — occupaient la même case visuelle.
// D'où le choix, tranché par lui : la dette est une aire **ORANGE PLEINE**, l'impôt latent reste
// **ROUGE POINTILLÉ**. Deux couleurs ET deux formes : la confusion n'est plus possible à l'œil.
// ⚠️ Ne PAS fusionner les deux en une courbe « tout ce que je dois » : additionner un dû certain et
// un impôt conditionnel donne un nombre que rien ne décrit.

/** Couleur de l'aire de dette. ORANGE-600 — choisi pour ne se confondre ni avec `NonReg`
 *  (`#f59e0b`, ambre) ni avec l'objectif FIRE (`#f97316`, orange-500 POINTILLÉ), les deux autres
 *  oranges du graphe. C'est la seule aire PLEINE sous zéro : sa position suffit déjà à la désigner. */
export const COULEUR_DETTE = '#ea580c';

/**
 * La valeur à tracer pour un point de la courbe : la dette, en NÉGATIF.
 *
 * ⚠️ `null` quand le champ est absent ou non fini — jamais `0`. Un zéro tracé dirait « aucune dette
 * à cette date », ce qui est une AFFIRMATION ; l'absence du champ ne dit que « je ne sais pas ».
 * Recharts saute les points nuls, donc la courbe s'interrompt au lieu de mentir (no-fake-data).
 * Une dette réellement éteinte, elle, vaut `0` fini et se trace à zéro : c'est un fait.
 */
export function detteSousZero(point: unknown): number | null {
    if (typeof point !== 'object' || point === null) return null;
    const v = (point as { DettesNonImmo?: unknown }).DettesNonImmo;
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    // ⚠️ `v === 0` rendu tel quel, jamais `-0` : `-0` s'affiche « 0 » partout mais n'est PAS `0` au
    // sens d'`Object.is`, donc il pourrit toute comparaison stricte chez un consommateur futur
    // (mémoïsation, test d'égalité, clé). Le normaliser coûte une ligne ; le débusquer, une heure.
    return v === 0 ? 0 : -v;
}
