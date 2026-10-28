// services/history/dayTransactions.ts
// [PASSE-REEL-TXN-DU-JOUR] Les transactions d'UNE journée, telles qu'elles seront montrées dans le
// détail au clic. Demande de Marc (2026-08-14) : « je veux voir mes transactions à chaque date
// quand je clique sur détail », cadrage confirmé par lui — TOUTES les transactions, dans le
// panneau existant.
//
// ⚠️ POURQUOI UN FILTRE À LA DEMANDE, et pas une Map pré-construite par le registre journalier :
// `dailyPastLedger` couvre jusqu'à ~4 000 jours. Y retenir les transactions de chaque journée les
// garderait TOUTES en mémoire, en permanence, pour n'en afficher qu'une seule à la fois. Filtrer au
// clic coûte un balayage O(n) ponctuel sur une liste déjà en mémoire — et rien le reste du temps.
//
// ⚠️ « TOUTES » N'EST PAS « TOUTES CELLES QUI COMPTENT ». Le registre exclut du calcul de la courbe
// les doublons (`isDuplicate`, artefact d'import) et les virements internes (`isTransfer`, neutres :
// l'argent change de compte sans quitter le patrimoine) — MÊME base d'exclusion que l'ancre
// `computeStartingCash`, sans quoi les deux bouts de la courbe divergeraient (classe PH4D).
// Les MASQUER ici donnerait une liste qui ne correspond pas au relevé bancaire ; les COMPTER
// donnerait une somme qui ne correspond pas à la courbe. On les montre donc, en les marquant.
import type { Transaction } from '../../types';

interface DayTransactionsResult {
    /** Transactions qui MEUVENT la courbe ce jour-là (base d'exclusion du registre). */
    readonly counted: ReadonlyArray<Transaction>;
    /** Doublons et virements internes : affichés, mais hors du calcul — chacun avec sa raison. */
    readonly excluded: ReadonlyArray<{ txn: Transaction; reason: 'doublon' | 'virement interne' }>;
    /**
     * Σ des `counted` : le FLUX DE TRÉSORERIE net du jour (= `Income − Expenses` du registre).
     *
     * ⚠️ CE N'EST PAS la variation du patrimoine net du jour, et le commentaire d'origine le
     * prétendait. La courbe bouge AUSSI par le rendement de marché des placements et par l'équité
     * immobilière — deux sources sans aucune transaction correspondante. Une journée de forte
     * hausse boursière sans mouvement bancaire donne `netCounted = 0` pendant que la courbe monte.
     * `dailyPastLedger` distingue d'ailleurs explicitement « dépôts » et « rendement » pour cette
     * raison exacte. Promettre « le mouvement de la courbe » aurait envoyé la prochaine session
     * chercher une réconciliation avec `NetWorth[j] − NetWorth[j−1]` qui n'existe pas.
     */
    readonly netCounted: number;
}

/**
 * [HISTORY-OBJET-VIDE-PARTAGE] Une FABRIQUE, pas une constante. Le chemin des ENTRÉES INUTILISABLES
 * (liste absente, ou date trop courte pour être découpée — une liste VIDE, elle, est `truthy` et
 * traverse la boucle) renvoyait une constante de MODULE : deux appels rendaient le même objet, donc
 * un `push` sur un résultat vide se retrouvait dans TOUS les appels vides suivants du processus :
 * une journée sans aucune transaction affichait celles d'un autre appel, avec son total.
 *
 * Les deux moitiés du correctif visent des choses différentes et ne se remplacent pas : le type
 * `readonly` rend la faute impossible à ÉCRIRE (le typecheck refuse `.push`/`.sort` sur le
 * résultat), la fabrique la rend INOFFENSIVE si quelqu'un la contourne (`as`, JS non typé, un
 * consommateur futur qui reconstruit le type à la main).
 */
const vide = (): DayTransactionsResult => ({ counted: [], excluded: [], netCounted: 0 });

/**
 * Transactions datées de `dayIso` ('YYYY-MM-DD'), séparées entre celles qui comptent et celles qui
 * sont exclues du calcul. L'ordre d'entrée est préservé (pas de tri implicite qui ferait diverger
 * l'affichage de la liste source).
 *
 * ⚠️ Les mêmes rejets que le registre : date absente ou tronquée, montant non fini. Une transaction
 * au montant `NaN` ne doit apparaître NULLE PART — ni dans la liste, ni dans le total (`no-fake-data` :
 * un total silencieusement faux est pire qu'une ligne manquante, et ici les deux seraient faux).
 */
export function transactionsOnDay(
    transactions: ReadonlyArray<Transaction> | null | undefined,
    dayIso: string | null | undefined,
): DayTransactionsResult {
    if (!transactions || !dayIso || dayIso.length < 10) return vide();
    const jour = dayIso.slice(0, 10);

    const counted: Transaction[] = [];
    const excluded: Array<{ txn: Transaction; reason: 'doublon' | 'virement interne' }> = [];
    let netCounted = 0;

    for (const t of transactions) {
        if (!t?.date || t.date.length < 10 || !Number.isFinite(t.amount)) continue;
        if (t.date.slice(0, 10) !== jour) continue;
        // ⚠️ `isDuplicate` PRIME sur `isTransfer` : un doublon reste un artefact d'import même s'il
        // est aussi marqué virement. Afficher « virement interne » sur une ligne en double
        // expliquerait la mauvaise chose à l'utilisateur qui cherche pourquoi elle ne compte pas.
        if (t.isDuplicate) { excluded.push({ txn: t, reason: 'doublon' }); continue; }
        if (t.isTransfer) { excluded.push({ txn: t, reason: 'virement interne' }); continue; }
        counted.push(t);
        netCounted += t.amount;
    }

    return { counted, excluded, netCounted };
}
