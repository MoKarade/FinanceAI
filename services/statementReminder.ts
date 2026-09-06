// services/statementReminder.ts
//
// [UX-STATEMENT-REMINDER] Rappel proactif « relevé de [mois] manquant ». Le rituel d'import mensuel
// des relevés n'avait AUCUN filet — c'est ce qui a laissé la fuite de données de persona invisible
// des semaines (incident 2026-07-15). On détecte que le dernier mois avec des transactions RÉELLES
// est antérieur au mois courant → l'utilisateur n'a probablement pas encore importé son relevé.
//
// Pur, testable (prend `now` en paramètre). Ne lit que des faits (transactions), n'invente rien.

import type { Transaction } from '../types';
import { logErrorThrottled } from './errorLogger';

/** Date ISO valide 'YYYY-MM-DD' avec mois 01-12 (évite qu'un mois invalide « 2026-13 » trie au-dessus
 *  du vrai dernier mois par comparaison lexicographique). */
const VALID_ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-\d{2}/;

/** On ne rappelle pas avant le 5 du mois (le relevé du mois précédent n'est pas toujours dispo avant). */
export const STATEMENT_REMIND_AFTER_DAY = 5;

interface StatementReminderStatus {
    /** Afficher le rappel ? */
    shouldShow: boolean;
    /** Dernier mois ('YYYY-MM') avec au moins une transaction réelle, ou null si aucune. */
    lastTxMonth: string | null;
    /** Mois courant ('YYYY-MM'). */
    currentMonth: string;
    /** Nombre de mois entre le dernier mois importé et le mois courant (0 = à jour). */
    monthsBehind: number;
}

const monthKey = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Écart en mois entre deux clés 'YYYY-MM' (b − a), ≥ 0. */
const monthsBetween = (a: string, b: string): number => {
    const [ay, am] = a.split('-').map(Number);
    const [by, bm] = b.split('-').map(Number);
    if (!ay || !am || !by || !bm) return 0;
    return Math.max(0, (by * 12 + bm) - (ay * 12 + am));
};

export function computeStatementReminderStatus(
    transactions: readonly Transaction[],
    now: Date,
): StatementReminderStatus {
    const currentMonth = monthKey(now);

    let lastTxMonth: string | null = null;
    for (const t of transactions) {
        if (t.isDuplicate || t.isTransfer) continue;
        if (typeof t.date !== 'string' || !VALID_ISO_DATE.test(t.date)) {
            // Une date malformée est un signal de bug d'import/parsing en amont — la remonter (throttlé
            // par valeur) au lieu de l'avaler : c'est exactement le genre d'anomalie que ce filet vise.
            logErrorThrottled(`statement-reminder-baddate:${String(t.date).slice(0, 20)}`, {
                source: 'ui',
                severity: 'warning',
                message: 'StatementReminder : date de transaction malformée ignorée',
                context: { txId: t.id, date: String(t.date).slice(0, 20) },
            });
            continue;
        }
        const m = t.date.slice(0, 7);
        if (!lastTxMonth || m > lastTxMonth) lastTxMonth = m;
    }

    if (!lastTxMonth) {
        return { shouldShow: false, lastTxMonth: null, currentMonth, monthsBehind: 0 };
    }

    const monthsBehind = monthsBetween(lastTxMonth, currentMonth);
    // Rappel si aucune transaction ce mois-ci (dernier mois importé < mois courant) ET qu'on est assez
    // avancé dans le mois pour que le relevé soit raisonnablement disponible.
    const shouldShow = monthsBehind >= 1 && now.getDate() >= STATEMENT_REMIND_AFTER_DAY;

    return { shouldShow, lastTxMonth, currentMonth, monthsBehind };
}
