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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// [DETTE-LEVIER-EXPLICITE] La part de la dette qui est un LEVIER, tracée par-dessus.
//
// Marc, 2026-09-19 : « la dette augmente à 150k alors que j'ai juste une dette auto qui finit en
// 2030 », puis, une fois la cause nommée : « je veux que ce soit explicite et expliqué ». Il avait
// raison ET tort — sa dette ORDINAIRE s'éteint bien en 2030 ; ce qui monte ensuite est le HELOC de
// la Smith Manoeuvre, que le réglage « Optimisations fiscales avancées » active en UN clic.
//
// ⚠️ DEUX DETTES QUI NE VEULENT PAS DIRE LA MÊME CHOSE occupaient la même courbe : une dette qu'on
// REMBOURSE et une dette qu'une stratégie CRÉE exprès, pour investir. Les distinguer n'est pas
// cosmétique — leur trajectoire normale est opposée (l'une descend vers zéro, l'autre grossit par
// construction), donc une seule courbe rend l'une des deux illisible quoi qu'on fasse.
//
// ⚠️ C'est un SOUS-ENSEMBLE, pas un terme de plus : la courbe de levier se trace PAR-DESSUS l'aire
// de dette totale, et son nom le dit (« dont levier Smith »). L'empiler donnerait un total faux.
//
// ⚠️ Couleur ET forme, comme pour l'impôt latent plus haut : INDIGO POINTILLÉ. L'indigo est la
// couleur que le bouton du réglage porte déjà (`bg-indigo-500/20 border-indigo-500/50` dans
// `AdvancedProjectionParams`) — le lien entre le bouton et la courbe se voit sans être expliqué.
// N'ancrer que la couleur laisserait un lot futur les refondre par la forme, et l'inverse aussi.

/** Couleur de la courbe « dont levier Smith ». INDIGO-500 — la couleur du bouton qui l'active. */
export const COULEUR_LEVIER = '#6366f1';

/**
 * Le LIBELLÉ de cette part, source unique.
 *
 * ⚠️ Il apparaît sur CINQ surfaces (légende du graphe, `name` de la courbe, colonne de la table
 * `sr-only`, ligne du panneau du jour, explication du réglage avancé). Recopié, il divergerait —
 * et le mot qui porte tout le sens est « **dont** » : sans lui, un lecteur ajoute cette part à la
 * dette qui la CONTIENT et double son total. Garde : `tests/components/futureCourbeLevier.test.ts`.
 */
export const LIBELLE_LEVIER = 'dont levier Smith';

/**
 * La part de levier d'un point, en NÉGATIF (même convention que la dette qui la contient).
 *
 * ⚠️ `null` quand le champ manque — jamais `0`. Le levier n'existe pas dans le PASSÉ : le moteur
 * n'ouvre le HELOC qu'à partir du premier mois projeté où une résidence principale est détenue, et
 * l'app ne suit aucune marge réelle. Tracer `0` avant affirmerait « aucun levier », ce qui est une
 * affirmation ; l'absence ne dit que « cette grandeur n'existe pas encore ». Même choix que
 * `ImpotLatent`, qui ne commence lui aussi qu'au premier mois projeté.
 */
export function detteLevierSousZero(point: unknown): number | null {
    if (typeof point !== 'object' || point === null) return null;
    const v = (point as { DetteLevierSmith?: unknown }).DetteLevierSmith;
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    return v === 0 ? 0 : -v;
}

/**
 * La PHRASE qui explique pourquoi la dette monte — ou `null` quand il n'y a rien à expliquer.
 *
 * ⚠️ AUCUN MONTANT dedans, et c'est une contrainte, pas un style : un montant interpolé dans une
 * chaîne n'est plus un nœud, donc plus masquable en mode discret
 * (`UN-MONTANT-INTERPOLE-DANS-UNE-CHAINE-N-EST-PLUS-UN-NOEUD`). La phrase dit le SENS ; les
 * chiffres restent dans les lignes qui savent se masquer.
 *
 * ⚠️ Le FAIT se lit sur le champ que le MOTEUR publie, jamais sur une seconde lecture des réglages :
 * `DetteLevierSmith > 0` veut dire « à cette date, le levier porte une dette », ce qu'aucune
 * relecture de `useSmithManoeuvre` ne peut dire (le levier n'existe qu'une fois la maison achetée).
 */
export function phraseLevier(point: unknown): string | null {
    const v = detteLevierSousZero(point);
    if (v === null || v === 0) return null;
    return 'Cette dette monte parce que la Smith Manoeuvre ré-emprunte, chaque mois, le capital '
        + 'que tu viens de rembourser sur l’hypothèque pour l’investir — et capitalise les '
        + 'intérêts de la marge. Elle grossit par construction : ce n’est pas un découvert.';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
/**
 * [DETTE-LEVIER-EXPLICITE] Quel CHAMP lit chaque accesseur passé en `dataKey={…}` du graphe.
 *
 * ⚠️ Ce n'est pas de la documentation : c'est ce qui rend VÉRIFIABLE une série tracée par
 * FONCTION. La garde `[FUTUR-DAILY-NATIVE]` ne cherchait que `dataKey="…"` (une chaîne), donc
 * `dataKey={detteSousZero}` lui était invisible — une série par accesseur pouvait manquer à
 * `CURVE_FIELDS` et rester MUETTE sur la courbe au jour, sans que rien ne rougisse. La garde lit
 * désormais cette table, puis PROUVE qu'elle ne ment pas en relisant le corps de chaque accesseur
 * (`tests/components/futureCourbeLevier.test.ts`) : une entrée fausse est pire qu'aucune.
 */
export const CHAMP_PAR_ACCESSEUR: Readonly<Record<string, string>> = {
    detteSousZero: 'DettesNonImmo',
    detteLevierSousZero: 'DetteLevierSmith',
};
