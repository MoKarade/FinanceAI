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

export interface DayTransactionsResult {
    /** Transactions qui MEUVENT la courbe ce jour-là (base d'exclusion du registre). */
    counted: Transaction[];
    /** Doublons et virements internes : affichés, mais hors du calcul — chacun avec sa raison. */
    excluded: Array<{ txn: Transaction; reason: 'doublon' | 'virement interne' }>;
    /** Σ des `counted` — le montant qui explique le mouvement du jour sur la courbe. */
    netCounted: number;
}

const VIDE: DayTransactionsResult = { counted: [], excluded: [], netCounted: 0 };

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
    if (!transactions || !dayIso || dayIso.length < 10) return VIDE;
    const jour = dayIso.slice(0, 10);

    const counted: Transaction[] = [];
    const excluded: DayTransactionsResult['excluded'] = [];
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
