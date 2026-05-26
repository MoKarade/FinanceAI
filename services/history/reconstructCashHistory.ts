// services/history/reconstructCashHistory.ts
// G22-B1 — reconstruit le solde de CASH (compte chèque) passé, mois par mois, à
// partir du cash actuel et des transactions, en remontant le temps.
//
// Modèle (documenté, no-fake) : on suppose que les transactions importées
// représentent les mouvements du compte de liquidités (un relevé bancaire chèque).
// Chaque transaction est donc un vrai mouvement de cash — y compris les virements
// vers les placements (montants négatifs dans le chèque). On ne double compte donc
// PAS avec les courbes de placements (reconstruites séparément depuis les prix).
//
//   cash(fin du mois M) = cash_actuel − Σ(montants des transactions des mois > M)
//
// On ne remonte que jusqu'au mois de la 1re transaction connue : avant, le solde est
// inconnu (décision Marc : la VN passée démarre à la 1re transaction). PUR & testable.

export interface CashHistoryPoint {
    /** Clé de mois 'YYYY-MM' (solde à la fin de ce mois). */
    month: string;
    cash: number;
}

export interface CashHistoryResult {
    /** Du plus ancien (1re transaction) au plus récent mois passé. Vide si aucune transaction. */
    points: CashHistoryPoint[];
    /** Mois de la 1re transaction connue ('YYYY-MM'), ou null. */
    firstMonth: string | null;
}

const monthKey = (isoDate: string): string => isoDate.slice(0, 7); // 'YYYY-MM'

/** Ajoute n mois à une clé 'YYYY-MM'. */
function addMonth(key: string, n: number): string {
    const [y, m] = key.split('-').map(Number);
    const total = y * 12 + (m - 1) + n;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    return `${ny}-${String(nm).padStart(2, '0')}`;
}

/**
 * @param transactions  mouvements du compte de cash (date 'YYYY-MM-DD', amount signé).
 * @param currentCash   solde de cash AUJOURD'HUI (fin du mois courant).
 * @param nowMonth      mois courant 'YYYY-MM' (défaut : mois système). Le dernier point
 *                      produit est le mois PRÉCÉDENT (le présent vient de la projection).
 */
export function reconstructCashHistory(
    transactions: ReadonlyArray<{ date: string; amount: number }>,
    currentCash: number,
    nowMonth: string = new Date().toISOString().slice(0, 7),
): CashHistoryResult {
    if (!transactions || transactions.length === 0) return { points: [], firstMonth: null };

    // Flux net par mois + borne inférieure (1re transaction).
    const flowByMonth = new Map<string, number>();
    let firstMonth: string | null = null;
    for (const t of transactions) {
        if (!t.date || t.date.length < 7 || !Number.isFinite(t.amount)) continue;
        const mk = monthKey(t.date);
        flowByMonth.set(mk, (flowByMonth.get(mk) ?? 0) + t.amount);
        if (firstMonth === null || mk < firstMonth) firstMonth = mk;
    }
    if (firstMonth === null) return { points: [], firstMonth: null };

    // Remonte depuis le mois courant : cash(fin M) = cash(fin M+1) − flux(M+1).
    // On part du présent (currentCash) et on soustrait le flux du mois suivant.
    const points: CashHistoryPoint[] = [];
    let cash = currentCash;
    let m = nowMonth;
    // Recule jusqu'à firstMonth inclus, en n'enregistrant que les mois passés (< nowMonth).
    while (m >= firstMonth) {
        const prev = addMonth(m, -1);
        // cash à la fin du mois précédent = cash fin de m − flux DE m.
        cash -= flowByMonth.get(m) ?? 0;
        if (prev >= firstMonth) points.push({ month: prev, cash: Math.round(cash) });
        m = prev;
        if (m < firstMonth) break;
    }
    points.reverse(); // du plus ancien au plus récent
    return { points, firstMonth };
}
