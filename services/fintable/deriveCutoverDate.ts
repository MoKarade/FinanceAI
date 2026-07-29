// services/fintable/deriveCutoverDate.ts
//
// [FINTABLE-3] Date de bascule DÉRIVÉE, pas maintenue à la main.
//
// Un paramètre manuel (`--after` du dry-run) est acceptable pour un aperçu ponctuel, mais un cron
// quotidien ne doit dépendre d'AUCUNE valeur que Marc devrait mettre à jour lui-même — une date
// figée qui prend du retard recrée exactement le risque de recouvrement/doublon qu'elle est censée
// prévenir. La bascule est donc calculée à CHAQUE passe : la date de la transaction la plus
// RÉCENTE déjà connue dans FinanceAI, tous comptes confondus (imports manuels et sync Fintable
// mêlés — chaque jour, la borne avance toute seule).
//
// `null` = état vierge (aucune transaction) → le mapper avertit alors qu'aucun recouvrement n'est
// possible à vérifier, comme documenté dans mapSnapshot.ts.

import type { Transaction } from '../../types';

export function deriveCutoverDate(transactions: readonly Transaction[]): string | null {
    let max: string | null = null;
    for (const t of transactions) {
        if (!t || typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(t.date)) continue;
        const day = t.date.slice(0, 10);
        if (max === null || day > max) max = day;
    }
    return max;
}
