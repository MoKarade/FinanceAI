// services/transactions/duplicateDetection.ts
//
// [TX-DUPLICATES] Détection de transactions en double — module PUR (aucun état, aucun effet de bord).
//
// Pourquoi ça existe (constat 2026-07-29) : le champ `Transaction.isDuplicate` était RESPECTÉ partout
// (exclu de `computeStartingCash`, du Budget, des revenus, du patrimoine) mais **rien ne le mettait
// jamais à `true`** — `parseBankCsv` l'initialise à `false` et aucun code ne le change ensuite. Le
// filtre « afficher les doublons » de l'onglet Transactions était du code mort (`_setShowDuplicates`
// jamais appelé). Autrement dit : la machinerie d'exclusion existait, sans personne pour l'alimenter.
//
// ⚠️ ON MARQUE, ON NE SUPPRIME PAS. Décision déjà prise dans l'ADR « Suppressions via MCP/IA » : le
// cash est DÉRIVÉ des transactions (`computeStartingCash`), donc une suppression déplacerait le solde
// ET le budget réel en silence. Marquer `isDuplicate` exclut la ligne de TOUS les calculs — c'est
// fonctionnellement l'effet recherché — sans détruire de donnée, et c'est réversible.
//
// ⚠️ AUCUN MARQUAGE AUTOMATIQUE. La détection PROPOSE, l'utilisateur DISPOSE. Deux cafés identiques
// le même jour sont un vrai faux positif, et marquer à tort retire de l'argent réel des calculs.

import type { Transaction } from '../../types';

export interface DuplicateMember {
    id: number;
    date: string;
    payee: string;
    amount: number;
    category: string;
    accountName?: string;
}

export interface DuplicateGroup {
    /** Clé stable du groupe (montant en cents + date de référence). */
    key: string;
    /** Montant partagé par tous les membres. */
    amount: number;
    /** Membres, triés par id croissant (donc par ordre d'import). */
    members: DuplicateMember[];
    /**
     * Celui qu'on suggère de GARDER : le plus petit id, c'est-à-dire le premier importé — celui qui
     * est dans l'app depuis le plus longtemps, donc le plus susceptible d'être déjà catégorisé et
     * vérifié. Pour un doublon né d'une nouvelle source (Fintable), c'est bien l'historique manuel
     * qui est conservé.
     */
    suggestedKeepId: number;
    /** Les autres — proposés au marquage, jamais marqués d'office. */
    suggestedMarkIds: number[];
    /**
     * `true` si les libellés diffèrent entre membres : signal fort que le doublon vient de DEUX
     * SOURCES différentes (relevé PDF vs API), le cas que la dédup par `payee` ne peut pas voir.
     */
    payeesDiffer: boolean;
    /** `true` si les dates ne sont pas toutes identiques (rapprochement à tolérance). */
    datesDiffer: boolean;
}

export interface DetectDuplicatesOptions {
    /**
     * Tolérance en JOURS sur l'écart de date (0 = date strictement identique). Utile car une même
     * dépense peut être datée du jour d'autorisation d'un côté et du jour de comptabilisation de
     * l'autre. Au-delà de ~3 jours le bruit dépasse le signal.
     */
    dayToleranceDays?: number;
}

const DAY_MS = 86_400_000;

/** Cents entiers — comparer des flottants à l'égalité manquerait des doublons évidents. */
function cents(amount: number): number {
    return Math.round(amount * 100);
}

function dayNumber(isoDate: string): number | null {
    const t = Date.parse(`${isoDate}T00:00:00Z`);
    return Number.isFinite(t) ? Math.round(t / DAY_MS) : null;
}

function normalizePayee(payee: string): string {
    return payee.trim().toLowerCase();
}

/**
 * Regroupe les transactions qui sont probablement la MÊME dépense réelle.
 *
 * Critère : **même montant exact** (au cent) et dates séparées d'au plus `dayToleranceDays`.
 * Le libellé n'entre PAS dans le critère — c'est délibéré : c'est précisément quand les libellés
 * diffèrent (deux sources d'import) que la déduplication existante (`txnKey`, qui inclut le payee)
 * laisse passer le doublon. Le libellé est en revanche RENDU, pour que l'humain juge.
 *
 * Sont ignorées : les transactions déjà marquées en doublon (rien à re-proposer) et celles dont le
 * montant ou la date sont inexploitables (on ne devine pas sur une donnée cassée).
 */
export function findDuplicateGroups(
    transactions: readonly Transaction[],
    options: DetectDuplicatesOptions = {},
): DuplicateGroup[] {
    const tolerance = Math.max(0, Math.floor(options.dayToleranceDays ?? 0));

    // Regroupement par montant exact : deux transactions de montants différents ne peuvent pas être
    // la même dépense, et ce partitionnement garde le coût linéaire sur ~2000 transactions.
    const byAmount = new Map<number, Array<{ tx: Transaction; day: number }>>();
    for (const tx of transactions) {
        if (!tx || tx.isDuplicate) continue;
        if (typeof tx.amount !== 'number' || !Number.isFinite(tx.amount)) continue;
        const day = dayNumber(tx.date);
        if (day === null) continue;
        const bucket = byAmount.get(cents(tx.amount));
        if (bucket) bucket.push({ tx, day });
        else byAmount.set(cents(tx.amount), [{ tx, day }]);
    }

    const groups: DuplicateGroup[] = [];
    for (const [amountCents, bucket] of byAmount) {
        if (bucket.length < 2) continue;
        // Tri par date puis id : le regroupement glouton ci-dessous suppose un ordre chronologique.
        bucket.sort((a, b) => (a.day - b.day) || (a.tx.id - b.tx.id));

        let current: Array<{ tx: Transaction; day: number }> = [];
        let anchorDay = -Infinity;
        const flush = (): void => {
            if (current.length >= 2) groups.push(buildGroup(amountCents, current));
            current = [];
        };
        for (const entry of bucket) {
            if (current.length === 0 || entry.day - anchorDay <= tolerance) {
                if (current.length === 0) anchorDay = entry.day;
                current.push(entry);
            } else {
                flush();
                anchorDay = entry.day;
                current.push(entry);
            }
        }
        flush();
    }

    // Les plus gros montants d'abord : c'est là que le coût d'un doublon est le plus élevé.
    return groups.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

function buildGroup(amountCents: number, entries: Array<{ tx: Transaction; day: number }>): DuplicateGroup {
    const sorted = [...entries].sort((a, b) => a.tx.id - b.tx.id);
    const members: DuplicateMember[] = sorted.map(({ tx }) => ({
        id: tx.id,
        date: tx.date,
        payee: tx.payee ?? '',
        amount: tx.amount,
        category: tx.category ?? '',
        ...(tx.accountName ? { accountName: tx.accountName } : {}),
    }));
    const keepId = members[0].id;
    const payees = new Set(members.map((m) => normalizePayee(m.payee)));
    const dates = new Set(members.map((m) => m.date));
    return {
        key: `${amountCents}|${members[0].date}|${keepId}`,
        amount: sorted[0].tx.amount,
        members,
        suggestedKeepId: keepId,
        suggestedMarkIds: members.slice(1).map((m) => m.id),
        payeesDiffer: payees.size > 1,
        datesDiffer: dates.size > 1,
    };
}

/**
 * Marque les ids donnés comme doublons. PUR : rend un nouveau tableau, ne mute rien.
 * Un id inconnu est simplement sans effet (pas d'erreur : l'UI peut envoyer une sélection périmée).
 */
export function markTransactionsAsDuplicate(
    transactions: readonly Transaction[],
    idsToMark: readonly number[],
): Transaction[] {
    if (idsToMark.length === 0) return [...transactions];
    const targets = new Set(idsToMark);
    return transactions.map((tx) => (targets.has(tx.id) && !tx.isDuplicate ? { ...tx, isDuplicate: true } : tx));
}

/** Retire la marque de doublon (annulation d'un marquage à tort). PUR. */
export function unmarkTransactionsAsDuplicate(
    transactions: readonly Transaction[],
    idsToUnmark: readonly number[],
): Transaction[] {
    if (idsToUnmark.length === 0) return [...transactions];
    const targets = new Set(idsToUnmark);
    return transactions.map((tx) => (targets.has(tx.id) && tx.isDuplicate ? { ...tx, isDuplicate: false } : tx));
}

/** Résumé chiffré pour l'UI : combien de groupes, de lignes concernées, et quel montant en jeu. */
export function summarizeDuplicates(groups: readonly DuplicateGroup[]): {
    groupCount: number;
    redundantCount: number;
    redundantAmount: number;
} {
    let redundantCount = 0;
    let redundantAmount = 0;
    for (const g of groups) {
        redundantCount += g.suggestedMarkIds.length;
        redundantAmount += g.amount * g.suggestedMarkIds.length;
    }
    return { groupCount: groups.length, redundantCount, redundantAmount };
}
