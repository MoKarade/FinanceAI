// services/fintable/backfillDedup.ts
// [FINTABLE-RATTRAPAGE] Classement des transactions rapatriées lors d'un RATTRAPAGE d'historique.
//
// ⚠️ POURQUOI CE MODULE EXISTE, et pourquoi il ne pouvait pas être « juste `markDuplicates` ».
// La sync Fintable est STRICTEMENT EN AVANT : à chaque passe elle calcule une bascule (la date de la
// transaction la plus récente déjà connue), ne demande à l'API que ce qui suit, et le mapper jette
// tout ce qui est `<=` à cette bascule. C'est une protection anti-doublon assumée : « pas de
// recouvrement = pas de dépendance à la dédup ». Le prix, c'est qu'aucun historique ne peut être
// rapatrié — symptôme vécu par Marc : « 0 transactions en plus » alors qu'il venait d'élargir son
// historique côté Fintable (2026-08-18).
//
// Un rattrapage RENONCE à cette garantie : il recouvre volontairement une période déjà peuplée. Il
// faut donc quelque chose de plus fin que le drapeau binaire de `markDuplicates`.
//
// ⚠️ LA DÉCISION DE MARC (2026-08-18) : « repérer directement les doublons et les supprimer
// automatiquement et indiquer les incertains ». D'où TROIS classes, et pas deux :
//   • CERTAIN   — même JOUR EXACT, même montant, libellé similaire → neutralisé sans le déranger ;
//   • INCERTAIN — même montant à ±5 j mais libellé DIFFÉRENT → c'est LUI qui tranche ;
//   • NOUVEAU   — le reste, ajouté normalement.
//
// ⚠️ « NEUTRALISÉ », PAS « SUPPRIMÉ ». Marc a dit « supprimer automatiquement » ; le dépôt marque
// `isDuplicate`, et une transaction marquée est déjà exclue de la courbe, du budget et des totaux —
// l'effet à l'écran est identique. La différence est qu'une suppression est IRRÉVERSIBLE sur de la
// donnée d'argent, alors qu'un marquage se défait d'un clic si le classement s'est trompé. On livre
// donc l'effet demandé sans le risque que la formulation n'exigeait pas.
//
// ⚠️ CE QU'ON NE FAIT PAS, ET C'EST UN CHOIX DE MARC. Deux vraies transactions IDENTIQUES et
// rapprochées (deux cafés à 4,25 $ le même jour, un abonnement facturé deux fois) sont des dépenses
// LÉGITIMES et distinctes. `markDuplicates` les marque pourtant (fenêtre ±5 j sur montant+libellé) —
// un faux positif tolérable sur un import ponctuel, destructeur sur un rattrapage d'un an. On ne les
// touche pas, et on ne les met pas non plus dans les incertains : une liste pleine de faux doublons
// serait une liste que personne ne lit (`SILENCE-READS-AS-BROKEN` par saturation, plutôt que par
// silence).
/**
 * ⚠️ Forme MINIMALE volontairement, pas `Transaction`. Le mapper Fintable produit des transactions
 * partielles (sans `id`, assigné à l'application) : exiger `Transaction` obligerait à fabriquer des
 * champs juste pour satisfaire le type — et fabriquer une donnée pour passer un typage est
 * exactement la porte par laquelle entrent les faux champs crédibles.
 */
export interface TxComparable {
    date: string;
    payee: string;
    amount: number;
    isDuplicate?: boolean;
}

/** Fenêtre de rapprochement pour un doublon INCERTAIN, en jours. Même valeur que `markDuplicates`. */
export const FENETRE_INCERTAIN_JOURS = 5;
/** Écart de montant sous lequel deux transactions valent « le même montant » (arrondis de conversion). */
export const TOLERANCE_MONTANT = 0.02;

export interface PaireIncertaine<T extends TxComparable = TxComparable> {
    /** Transaction rapatriée, en attente de décision. */
    entrante: T;
    /** Transaction DÉJÀ dans FinanceAI qui lui ressemble. */
    existante: TxComparable;
    /** Écart en jours (0 = même jour) — l'information qui aide Marc à trancher. */
    ecartJours: number;
}

export interface ClassementRattrapage<T extends TxComparable = TxComparable> {
    /** À ajouter tel quel. */
    nouvelles: T[];
    /** À ajouter en `isDuplicate: true` — neutralisées, mais conservées et réversibles. */
    certaines: T[];
    /** À ajouter en `isDuplicate: true` AUSSI, mais listées pour arbitrage. */
    incertaines: PaireIncertaine<T>[];
}

const jour = (d: string): string => (typeof d === 'string' ? d.slice(0, 10) : '');

const ecartJours = (a: string, b: string): number => {
    const ta = Date.parse(`${jour(a)}T00:00:00Z`);
    const tb = Date.parse(`${jour(b)}T00:00:00Z`);
    if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.POSITIVE_INFINITY;
    return Math.abs(ta - tb) / 86_400_000;
};

/** Une date au JOUR (`YYYY-MM-DD`) — un mois seul (`2026-06`) ne prouve aucune coïncidence. */
const jourComplet = (d: string): boolean => /^\d{4}-\d{2}-\d{2}/.test(d || '');

const memeMontant = (a: number, b: number): boolean =>
    Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < TOLERANCE_MONTANT;

/**
 * Normalisation de libellé — VOLONTAIREMENT identique à celle de `arePayeesSimilar`
 * (`utils/transactionParser.ts`), recopiée plutôt qu'importée parce qu'elle n'y est pas exportée.
 * ⚠️ Si l'une des deux bouge, l'autre doit suivre : `tests/services/fintable/backfillDedup.test.ts`
 * confronte les deux sur les mêmes cas pour que la divergence rougisse au lieu de dériver.
 */
const normaliser = (s: string): string =>
    (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

/** Même règle de similarité que la dédup historique : égalité, ou inclusion au-delà de 3 caractères. */
export const libellesSimilaires = (p1: string, p2: string): boolean => {
    if (!p1 || !p2) return p1 === p2;
    const n1 = normaliser(p1);
    const n2 = normaliser(p2);
    if (n1 === n2) return true;
    if (!n1 || !n2) return false;
    if (n1.length > 3 && n2.length > 3) return n1.includes(n2) || n2.includes(n1);
    return false;
};

/**
 * Classe les transactions rapatriées contre celles DÉJÀ présentes.
 *
 * ⚠️ Une entrante ne peut apparier qu'UNE existante, et une existante ne peut être consommée qu'une
 * fois (`dejaApparie`). Sans ça, trois vraies dépenses identiques face à une seule existante
 * seraient toutes neutralisées — on effacerait deux dépenses réelles pour un seul doublon.
 */
export function classerRattrapage<T extends TxComparable>(
    existantes: readonly TxComparable[],
    entrantes: readonly T[],
): ClassementRattrapage<T> {
    const nouvelles: T[] = [];
    const certaines: T[] = [];
    const incertaines: PaireIncertaine<T>[] = [];
    const dejaApparie = new Set<TxComparable>();

    /** Candidate appariable : même montant, dans la fenêtre, existante encore libre. */
    const candidates = (e: T) => existantes
        .filter((x) => !dejaApparie.has(x) && memeMontant(e.amount, x.amount))
        .map((x) => ({ x, d: ecartJours(e.date, x.date), similaire: libellesSimilaires(e.payee, x.payee) }))
        .filter((c) => c.d <= FENETRE_INCERTAIN_JOURS)
        // À égalité de force de preuve, la plus PROCHE en date : c'est la plus probable.
        .sort((a, b) => a.d - b.d);

    const valides = entrantes.filter((e) => e && typeof e.date === 'string');
    for (const e of entrantes) if (!e || typeof e.date !== 'string') nouvelles.push(e);

    // ── PASSE 1 — les CERTAINS d'abord ──────────────────────────────────────────────────────────
    // ⚠️ DEUX PASSES, et ce n'est pas de l'élégance. En une seule, l'ordre des ENTRANTES décidait :
    // une entrante douteuse traitée en premier « volait » l'existante d'un vrai doublon, produisant
    // DEUX erreurs d'un coup — un faux positif listé à Marc, et le vrai doublon reclassé NOUVELLE
    // (donc compté deux fois dans le budget). Mesuré par l'audit de la PR #649.
    // La preuve la plus FORTE se sert la première ; le douteux se contente du reliquat.
    const restantes: T[] = [];
    for (const e of valides) {
        // CERTAIN : même JOUR EXACT **et** libellé similaire. Les deux, pas l'un ou l'autre — un même
        // montant au même jour chez deux marchands différents est banal (deux achats).
        // ⚠️ `jourComplet` exigé : `Date.parse('2026-06T00:00:00Z')` est VALIDE, donc deux
        // transactions datées au MOIS seul donnaient `d === 0` et devenaient « certaines » sur une
        // granularité mensuelle. Le dépôt manipule bien des transactions datées au mois.
        const c = candidates(e).find((k) => k.d === 0 && k.similaire && jourComplet(e.date) && jourComplet(k.x.date));
        if (c) { dejaApparie.add(c.x); certaines.push({ ...e, isDuplicate: true }); continue; }
        restantes.push(e);
    }

    // ── PASSE 2 — les DOUTEUX sur le reliquat ───────────────────────────────────────────────────
    for (const e of restantes) {
        // Deux formes de doute, et la seconde manquait :
        //  • libellé DIFFÉRENT (la banque a renommé le marchand) — ce que la dédup historique laisse
        //    passer, puisqu'elle exige montant ET libellé ;
        //  • libellé IDENTIQUE mais date DÉCALÉE de 1 à 5 jours — c'est la forme la plus FRÉQUENTE
        //    du doublon bancaire réel (date de transaction vs date de comptabilisation, qui diffère
        //    systématiquement entre deux agrégateurs). Elle ne tombait dans AUCUNE branche et partait
        //    en NOUVELLE : ni neutralisée, ni listée, et invisible pour la dédup par clé (la date
        //    entre dans la clé). Double comptage silencieux — le pire des trois sorts.
        //    ⚠️ Mon commentaire d'origine justifiait l'exclusion par « deux cafés le même jour » :
        //    raisonnement valable entre deux ENTRANTES du même lot, PAS face à une transaction déjà
        //    connue. Ici on ne tranche pas, on LISTE.
        const c = candidates(e)[0];
        if (c) {
            dejaApparie.add(c.x);
            incertaines.push({ entrante: { ...e, isDuplicate: true }, existante: c.x, ecartJours: c.d });
            continue;
        }
        nouvelles.push(e);
    }

    return { nouvelles, certaines, incertaines };
}
