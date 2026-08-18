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
import type { Transaction } from '../../types';

/** Fenêtre de rapprochement pour un doublon INCERTAIN, en jours. Même valeur que `markDuplicates`. */
export const FENETRE_INCERTAIN_JOURS = 5;
/** Écart de montant sous lequel deux transactions valent « le même montant » (arrondis de conversion). */
export const TOLERANCE_MONTANT = 0.02;

export interface PaireIncertaine {
    /** Transaction rapatriée, en attente de décision. */
    entrante: Transaction;
    /** Transaction DÉJÀ dans FinanceAI qui lui ressemble. */
    existante: Transaction;
    /** Écart en jours (0 = même jour) — l'information qui aide Marc à trancher. */
    ecartJours: number;
}

export interface ClassementRattrapage {
    /** À ajouter tel quel. */
    nouvelles: Transaction[];
    /** À ajouter en `isDuplicate: true` — neutralisées, mais conservées et réversibles. */
    certaines: Transaction[];
    /** À ajouter en `isDuplicate: true` AUSSI, mais listées pour arbitrage. */
    incertaines: PaireIncertaine[];
}

const jour = (d: string): string => (typeof d === 'string' ? d.slice(0, 10) : '');

const ecartJours = (a: string, b: string): number => {
    const ta = Date.parse(`${jour(a)}T00:00:00Z`);
    const tb = Date.parse(`${jour(b)}T00:00:00Z`);
    if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.POSITIVE_INFINITY;
    return Math.abs(ta - tb) / 86_400_000;
};

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
export function classerRattrapage(
    existantes: readonly Transaction[],
    entrantes: readonly Transaction[],
): ClassementRattrapage {
    const nouvelles: Transaction[] = [];
    const certaines: Transaction[] = [];
    const incertaines: PaireIncertaine[] = [];
    const dejaApparie = new Set<Transaction>();

    for (const e of entrantes) {
        if (!e || typeof e.date !== 'string') { nouvelles.push(e); continue; }

        let certain: Transaction | null = null;
        let incertain: { t: Transaction; d: number } | null = null;

        for (const x of existantes) {
            if (dejaApparie.has(x)) continue;
            if (!memeMontant(e.amount, x.amount)) continue;
            const d = ecartJours(e.date, x.date);
            if (d > FENETRE_INCERTAIN_JOURS) continue;

            const similaire = libellesSimilaires(e.payee, x.payee);
            // CERTAIN : même jour EXACT **et** libellé similaire. Les deux, pas l'un ou l'autre —
            // un même montant au même jour chez deux marchands différents est banal (deux achats).
            if (d === 0 && similaire) { certain = x; break; }
            // INCERTAIN : montant identique, date proche, libellé qui NE correspond PAS. C'est le cas
            // que la dédup historique laisse passer (elle exige les deux critères) — donc exactement
            // ce contre quoi la bascule protégeait.
            if (!similaire && (incertain === null || d < incertain.d)) incertain = { t: x, d };
        }

        if (certain) { dejaApparie.add(certain); certaines.push({ ...e, isDuplicate: true }); continue; }
        if (incertain) {
            dejaApparie.add(incertain.t);
            incertaines.push({ entrante: { ...e, isDuplicate: true }, existante: incertain.t, ecartJours: incertain.d });
            continue;
        }
        nouvelles.push(e);
    }

    return { nouvelles, certaines, incertaines };
}
