// services/transactions/detectTransfers.ts
//
// [TX-TRANSFERS] Cœur GÉNÉRIQUE d'appariement des virements internes — partagé par toutes les
// sources de transactions (import CSV, relevés, Fintable). Pur, zéro dépendance, zéro réseau.
//
// Pourquoi générique (demande Marc 2026-07-31, « ça détecte mal mes transferts entre comptes ») :
// l'appariement n'existait QUE dans `services/fintable/detectTransfers.ts`, donc les transactions
// importées par CSV/relevé n'avaient AUCUNE détection — `utils/transactionParser.ts:198` se contente
// du mot « virement »/« transfert » dans la colonne catégorie de la banque. Marc déplace de l'argent
// entre 4 poches (compte courant, épargne, carte de crédit, placements) et les DEUX côtés sont
// toujours importés : un virement non marqué est donc compté deux fois par le Budget
// (`budgetSync.ts:58` somme les négatifs hors transferts, `:37` fait le symétrique sur les revenus).
//
// ⚠️ Un faux positif RETIRE une vraie dépense du budget. D'où des critères stricts et, surtout, une
// distinction explicite entre ce qui est PROUVÉ et ce qui est seulement PLAUSIBLE :
//   - `confirmed` : les deux transactions portent un compte CONNU et DIFFÉRENT → deux poches, prouvé.
//   - `suggested` : au moins un compte est inconnu → le montant opposé et la date proche ne prouvent
//     rien à eux seuls (un achat de 50 $ et un remboursement de 50 $ le même jour ont la même forme).
//     Ces paires ne sont JAMAIS marquées automatiquement : elles remontent à l'utilisateur.
// C'est la même direction de risque que `[[TX-DUPLICATES]]` : on marque, on ne supprime pas, et on
// ne marque automatiquement que ce qu'on peut prouver.
//
// ⚠️ INTERAC EXCLU (décision Marc 2026-07-31) : un virement Interac reste catégorisé « Remboursement »
// et n'est JAMAIS un transfert interne, même quand ses deux côtés s'apparient parfaitement — c'est
// une règle métier explicite, pas une limite technique.

/** Tolérance par défaut : Marc décrit un décalage de « quelques jours max » entre les deux côtés. */
export const DEFAULT_TRANSFER_TOLERANCE_DAYS = 3;
const DAY_MS = 86_400_000;

/** Entrée minimale de l'appariement — volontairement structurelle (aucun type d'app importé). */
export interface TransferCandidate<Id> {
    id: Id;
    /** Date ISO `YYYY-MM-DD`. */
    date: string;
    /** Montant SIGNÉ : négatif = argent sortant. */
    amount: number;
    /** Clé du compte porteur. `undefined`/vide = compte inconnu (dégrade la paire en `suggested`). */
    account?: string;
    /** Libellé — sert uniquement à l'exclusion Interac. */
    payee?: string;
}

export type TransferConfidence = 'confirmed' | 'suggested';

export interface TransferPair<Id> {
    /** Transaction sortante (montant négatif). */
    outId: Id;
    /** Transaction entrante (montant positif). */
    inId: Id;
    /** Montant absolu du virement. */
    amount: number;
    /** `confirmed` = comptes connus et différents ; `suggested` = au moins un compte inconnu. */
    confidence: TransferConfidence;
}

interface DetectTransfersResult<Id> {
    /** Ids à marquer `isTransfer` AUTOMATIQUEMENT (les deux côtés de chaque paire prouvée). */
    confirmedIds: Set<Id>;
    /** Ids de paires PLAUSIBLES à faire confirmer par l'utilisateur — jamais marqués d'office. */
    suggestedIds: Set<Id>;
    /** Toutes les paires, pour le rapport — jamais silencieuses. */
    pairs: Array<TransferPair<Id>>;
    /** Diagnostic : pourquoi certaines paires ne sont que suggérées, combien d'Interac écartés. */
    stats: {
        /** Transactions candidates sans compte connu (cause n°1 d'une paire seulement `suggested`). */
        withoutAccount: number;
        /** Transactions écartées d'office parce qu'Interac (règle métier). */
        interacExcluded: number;
    };
}

interface DetectTransfersOptions<Id> {
    toleranceDays?: number;
    /**
     * Garde SUPPLÉMENTAIRE appliquée à chaque paire candidate (après les critères communs).
     * `services/fintable` s'en sert pour conserver sa contrainte de rôles (cash → dette) sans
     * dupliquer l'algorithme d'appariement. Absente = seuls les critères communs s'appliquent.
     */
    canPair?: (out: TransferCandidate<Id>, incoming: TransferCandidate<Id>) => boolean;
}

/**
 * Un Interac n'est jamais un transfert interne (règle Marc). Testé sur le libellé NORMALISÉ
 * (accents strippés, majuscules) — les relevés écrivent « Virement Interac », « e-Transfer »,
 * « VIREMENT INTERAC DE … » selon la source.
 */
export function isInteracPayee(payee: string | undefined): boolean {
    if (!payee) return false;
    const p = payee.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
    return p.includes('INTERAC') || p.includes('E-TRANSFER') || p.includes('ETRANSFER');
}

/** Clé de compte normalisée. Rend `null` quand le compte est inconnu (absent, vide, « Unknown »). */
function accountKey(account: string | undefined): string | null {
    const a = (account ?? '').trim();
    if (!a) return null;
    // `utils/transactionParser.ts:210` écrit littéralement « Unknown » quand le CSV n'a pas de
    // colonne compte — c'est une ABSENCE, pas un nom de poche. La traiter comme un vrai compte
    // ferait apparier deux « Unknown » entre eux et marquerait des dépenses réelles.
    const upper = a.toUpperCase();
    if (upper === 'UNKNOWN' || upper === 'INCONNU' || upper === 'N/A') return null;
    return upper;
}

function dayNumber(isoDate: string): number | null {
    const t = Date.parse(`${isoDate}T00:00:00Z`);
    return Number.isFinite(t) ? Math.round(t / DAY_MS) : null;
}

function cents(amount: number): number {
    return Math.round(amount * 100);
}

/**
 * Apparie les virements internes d'un ensemble de transactions.
 *
 * Critères, tous nécessaires :
 *   1. montants **exactement opposés** (au cent) ;
 *   2. dates séparées d'au plus `toleranceDays` ;
 *   3. comptes **différents** quand ils sont connus des deux côtés — deux mouvements opposés sur le
 *      MÊME compte ne sont pas un virement (achat puis remboursement) ;
 *   4. aucun des deux côtés n'est un Interac ;
 *   5. la garde `canPair` de l'appelant, si fournie.
 *
 * L'appariement est **un pour un** et l'entrante retenue est la plus PROCHE en date : sans ça, deux
 * paiements du même montant dans le mois s'apparieraient en croix et on marquerait trop.
 * Déterministe : même entrée, même sortie (tri explicite avant appariement).
 */
export function detectInternalTransfers<Id>(
    transactions: ReadonlyArray<TransferCandidate<Id>>,
    options: DetectTransfersOptions<Id> = {},
): DetectTransfersResult<Id> {
    const tolerance = Math.max(0, Math.floor(options.toleranceDays ?? DEFAULT_TRANSFER_TOLERANCE_DAYS));
    const canPair = options.canPair;

    const outs: Array<{ tx: TransferCandidate<Id>; day: number; account: string | null }> = [];
    const ins: Array<{ tx: TransferCandidate<Id>; day: number; account: string | null }> = [];
    let withoutAccount = 0;
    let interacExcluded = 0;

    for (const tx of transactions) {
        if (!Number.isFinite(tx.amount) || tx.amount === 0) continue;
        if (isInteracPayee(tx.payee)) { interacExcluded++; continue; }
        const day = dayNumber(tx.date);
        if (day === null) continue;
        const account = accountKey(tx.account);
        if (account === null) withoutAccount++;
        const entry = { tx, day, account };
        if (tx.amount < 0) outs.push(entry);
        else ins.push(entry);
    }

    // Ordre déterministe : date puis id, pour que deux exécutions rendent le même appariement.
    const byDayThenId = (
        a: { tx: TransferCandidate<Id>; day: number },
        b: { tx: TransferCandidate<Id>; day: number },
    ): number => (a.day - b.day) || String(a.tx.id).localeCompare(String(b.tx.id));
    outs.sort(byDayThenId);
    ins.sort(byDayThenId);

    const pairs: Array<TransferPair<Id>> = [];
    const confirmedIds = new Set<Id>();
    const suggestedIds = new Set<Id>();
    const usedIns = new Set<Id>();

    for (const out of outs) {
        const wanted = -cents(out.tx.amount);
        let best: typeof ins[number] | null = null;
        let bestGap = Infinity;
        for (const candidate of ins) {
            if (usedIns.has(candidate.tx.id)) continue;
            if (cents(candidate.tx.amount) !== wanted) continue;
            const gap = Math.abs(candidate.day - out.day);
            if (gap > tolerance) continue;
            // Comptes connus des deux côtés ET identiques → même poche, ce n'est pas un virement.
            if (out.account !== null && candidate.account !== null && out.account === candidate.account) continue;
            if (canPair && !canPair(out.tx, candidate.tx)) continue;
            if (gap < bestGap) { best = candidate; bestGap = gap; }
        }
        if (!best) continue;

        usedIns.add(best.tx.id);
        const proven = out.account !== null && best.account !== null;
        const confidence: TransferConfidence = proven ? 'confirmed' : 'suggested';
        const target = proven ? confirmedIds : suggestedIds;
        target.add(out.tx.id);
        target.add(best.tx.id);
        pairs.push({
            outId: out.tx.id,
            inId: best.tx.id,
            amount: Math.abs(out.tx.amount),
            confidence,
        });
    }

    return { confirmedIds, suggestedIds, pairs, stats: { withoutAccount, interacExcluded } };
}
