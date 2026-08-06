// services/history/reconstructCashHistory.ts
// G22-B1 — reconstruit le solde de CASH (compte chèque) passé, mois par mois, à
// partir du cash actuel et des transactions, en remontant le temps.
//
// Modèle (documenté, no-fake) : on remonte depuis le cash ACTUEL en retirant, mois par
// mois, les flux qui l'ont réellement fait varier. La base des flux DOIT être IDENTIQUE
// à celle de l'ancre `computeStartingCash` (= cash présent du moteur) sinon les deux bouts
// de la MÊME courbe divergent (finding financial-integrity 2026-07-24, classe PH4D « calculs
// voisins, même base ») : `computeStartingCash` EXCLUT `isDuplicate` (artefacts, pas de vrai
// mouvement) ET `isTransfer` (virements neutres dans son modèle) → on EXCLUT les mêmes ici.
//
//   cash(fin du mois M) = cash_actuel − Σ(montants des transactions NON dup/transfert des mois > M)
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
    transactions: ReadonlyArray<{ date: string; amount: number; isDuplicate?: boolean; isTransfer?: boolean }>,
    currentCash: number,
    nowMonth: string = new Date().toISOString().slice(0, 7),
): CashHistoryResult {
    if (!transactions || transactions.length === 0) return { points: [], firstMonth: null };

    // Flux net par mois + borne inférieure (1re transaction). ⚠️ Exclure dup/transfert EXACTEMENT comme
    // `computeStartingCash` (cohérence de base ancre↔walk-back). `firstMonth` inclut TOUTE transaction
    // datée (la VN passée démarre à la 1re transaction connue, dup/transfert compris comme repère de date).
    const flowByMonth = new Map<string, number>();
    let firstMonth: string | null = null;
    for (const t of transactions) {
        if (!t.date || t.date.length < 7 || !Number.isFinite(t.amount)) continue;
        const mk = monthKey(t.date);
        if (firstMonth === null || mk < firstMonth) firstMonth = mk;
        if (t.isDuplicate || t.isTransfer) continue; // n'affecte PAS le solde de cash (comme computeStartingCash)
        flowByMonth.set(mk, (flowByMonth.get(mk) ?? 0) + t.amount);
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

// ── [FUTUR-DAILY] Variante QUOTIDIENNE ───────────────────────────────────────────────────────
//
// Demande Marc 2026-08-06 : « pour l'historique aussi je veux pour chaque jour ».
//
// ⚠️ L'information du JOUR était déjà là et on la JETAIT : les transactions entrent datées
// `YYYY-MM-DD`, et c'est le `monthKey` ci-dessus (`slice(0, 7)`) qui l'écrase. Le quotidien du passé
// n'est donc pas une reconstruction nouvelle — c'est le même walk-back à un pas plus fin.
//
// ⚠️ FONCTION SÉPARÉE, la mensuelle est INTOUCHÉE. `buildPastPrefix` consomme `points[].month` sur
// une chaîne money-critical (raccord EXACT au présent, Option A) ; changer sa forme pour ajouter une
// granularité aurait mis en jeu un calcul qui marche, pour un besoin d'AFFICHAGE. Les deux partagent
// la règle d'exclusion — c'est ELLE qui doit rester unique, pas le pas de temps.
//
// ⚠️ MÊME BASE DE FLUX que `computeStartingCash` (dup/transfert exclus). Si les deux bouts de la
// même courbe ne partagent pas leur base, ils divergent — finding financial-integrity 2026-07-24,
// classe PH4D « calculs voisins, même base ». C'est la contrainte la plus importante de ce module.

export interface CashHistoryDailyPoint {
    /** Date 'YYYY-MM-DD' — solde à la FIN de ce jour. */
    date: string;
    cash: number;
    /** `true` si au moins une transaction affectant le solde tombe ce jour-là. Permet à l'écran de
     *  distinguer un vrai mouvement d'un plateau — sans ça, une série quotidienne plate ressemble à
     *  une donnée manquante alors que c'est une information (« rien n'a bougé »). */
    isDated: boolean;
}

export interface CashHistoryDailyResult {
    /** Du plus ancien au plus récent jour passé. Vide si aucune transaction. */
    points: CashHistoryDailyPoint[];
    /** Date de la 1re transaction connue, ou null. */
    firstDate: string | null;
}

const DAY_MS = 86_400_000;

/** Décale une date ISO de n jours (UTC — aucune dérive de fuseau sur une clé de date pure). */
function addDay(iso: string, n: number): string {
    return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Solde de cash passé JOUR PAR JOUR, même modèle que la version mensuelle :
 * `cash(fin du jour D) = cash(fin du jour D+1) − flux(D+1)`, en remontant depuis le solde actuel.
 *
 * @param nowDate  jour courant 'YYYY-MM-DD'. Le dernier point produit est la VEILLE (le présent vient
 *                 de la projection, exactement comme la version mensuelle rend le mois précédent).
 *
 * ⚠️ Le résultat RÉCONCILIE avec `reconstructCashHistory` : le point du dernier jour d'un mois vaut
 * le point mensuel de ce mois. C'est l'invariant testé — deux granularités qui divergeraient
 * donneraient deux soldes différents pour la même date selon le niveau de zoom.
 */
export function reconstructCashHistoryDaily(
    transactions: ReadonlyArray<{ date: string; amount: number; isDuplicate?: boolean; isTransfer?: boolean }>,
    currentCash: number,
    nowDate: string = new Date().toISOString().slice(0, 10),
): CashHistoryDailyResult {
    if (!transactions || transactions.length === 0) return { points: [], firstDate: null };

    const flowByDay = new Map<string, number>();
    const movedOn = new Set<string>();
    let firstDate: string | null = null;
    for (const t of transactions) {
        // `length < 10` et non `< 7` : ici on exige une date COMPLÈTE. Une transaction datée au mois
        // seul ne peut pas être placée dans la journée — l'inventer la ferait apparaître un jour
        // arbitraire, ce qui est pire qu'honnêtement absente de la série quotidienne.
        if (!t.date || t.date.length < 10 || !Number.isFinite(t.amount)) continue;
        const d = t.date.slice(0, 10);
        if (firstDate === null || d < firstDate) firstDate = d;
        if (t.isDuplicate || t.isTransfer) continue; // MÊME exclusion que computeStartingCash
        flowByDay.set(d, (flowByDay.get(d) ?? 0) + t.amount);
        movedOn.add(d);
    }
    if (firstDate === null) return { points: [], firstDate: null };

    const points: CashHistoryDailyPoint[] = [];
    let cash = currentCash;
    let d = nowDate;
    while (d >= firstDate) {
        const prev = addDay(d, -1);
        cash -= flowByDay.get(d) ?? 0;
        if (prev >= firstDate) points.push({ date: prev, cash: Math.round(cash), isDated: movedOn.has(prev) });
        d = prev;
    }
    points.reverse();
    return { points, firstDate };
}
