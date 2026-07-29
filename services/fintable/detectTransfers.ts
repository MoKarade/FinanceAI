// services/fintable/detectTransfers.ts
//
// [FINTABLE-TRANSFERS] Reconnaît les VIREMENTS INTERNES entre deux comptes de l'utilisateur, pour
// les marquer `isTransfer` au lieu de les laisser passer pour des dépenses ou des revenus.
//
// Pourquoi c'est nécessaire (constaté sur l'aperçu réel du 2026-07-29) : quand on importe LES DEUX
// CÔTÉS d'une relation compte-chèque ↔ carte de crédit, le **paiement mensuel de la carte** apparaît
// deux fois — en sortie du compte chèque, et en entrée sur la carte. Ce n'est pas une dépense, c'est
// un déplacement d'argent entre deux poches de l'utilisateur.
//
// Effet si on ne fait rien (vérifié dans le code, pas supposé) :
//   - `budgetSync.ts:58` somme les montants NÉGATIFS hors transferts → le paiement de carte gonfle
//     les dépenses réelles du mois, EN PLUS des achats déjà comptés sur la carte ;
//   - `budgetSync.ts:37` somme les POSITIFS hors transferts → l'entrée sur la carte pourrait compter
//     comme une rentrée d'argent.
// Le patrimoine, lui, reste juste (les soldes sont recalés sur les vrais chiffres via `cash_balance`
// et `debt`) : c'est bien le BUDGET qui mentirait. D'où un correctif ciblé, pas un garde global.
//
// ⚠️ Ce module ne SUPPRIME rien et n'invente aucune transaction : il pose seulement `isTransfer` sur
// des lignes déjà destinées à l'import. Un faux positif exclut une vraie dépense du budget — d'où
// des critères stricts (montants exactement opposés, comptes de RÔLES différents, dates proches) et
// un appariement UN POUR UN.

import type { FintableAccountRole } from './mapSnapshot';
import type { FintableTransaction } from './types';

/** Fenêtre par défaut : un paiement de carte est débité et crédité à quelques jours d'intervalle. */
const DEFAULT_TOLERANCE_DAYS = 3;
const DAY_MS = 86_400_000;

export interface TransferPair {
    /** Transaction sortante (compte de liquidités). */
    outId: string;
    /** Transaction entrante (compte de dette). */
    inId: string;
    /** Montant absolu du virement. */
    amount: number;
}

export interface DetectTransfersResult {
    /** Ids de transactions à marquer `isTransfer` (les deux côtés de chaque paire). */
    transferIds: Set<string>;
    /** Paires reconnues — pour le rapport, jamais silencieuses. */
    pairs: TransferPair[];
}

function dayNumber(isoDate: string): number | null {
    const t = Date.parse(`${isoDate}T00:00:00Z`);
    return Number.isFinite(t) ? Math.round(t / DAY_MS) : null;
}

function cents(amount: number): number {
    return Math.round(amount * 100);
}

/**
 * Apparie les virements internes entre un compte `cash` et un compte `debt`.
 *
 * Critères, tous nécessaires :
 *   1. montants **exactement opposés** (au cent) ;
 *   2. la sortie vient d'un compte `cash`, l'entrée d'un compte `debt` — deux RÔLES différents.
 *      Deux mouvements opposés sur le MÊME compte ne sont pas un virement (achat puis remboursement) ;
 *   3. dates séparées d'au plus `toleranceDays`.
 *
 * L'appariement est **un pour un** : une même sortie ne peut pas légitimer deux entrées. Sans ça,
 * deux paiements du même montant dans le mois s'apparieraient en croix et on marquerait trop.
 */
export function detectInternalTransfers(
    transactions: readonly FintableTransaction[],
    roles: Readonly<Record<string, FintableAccountRole>>,
    toleranceDays: number = DEFAULT_TOLERANCE_DAYS,
): DetectTransfersResult {
    const tolerance = Math.max(0, Math.floor(toleranceDays));

    const outs: Array<{ tx: FintableTransaction; day: number }> = [];
    const ins: Array<{ tx: FintableTransaction; day: number }> = [];

    for (const tx of transactions) {
        if (!Number.isFinite(tx.amount) || tx.amount === 0) continue;
        const day = dayNumber(tx.date);
        if (day === null) continue;
        const kind = roles[tx.accountId]?.kind;
        // Sortie DEPUIS les liquidités, entrée SUR la dette : le sens d'un paiement de carte.
        if (kind === 'cash' && tx.amount < 0) outs.push({ tx, day });
        else if (kind === 'debt' && tx.amount > 0) ins.push({ tx, day });
    }

    const pairs: TransferPair[] = [];
    const transferIds = new Set<string>();
    const usedIns = new Set<string>();

    // Ordre déterministe : date puis id, pour que deux exécutions rendent le même appariement.
    outs.sort((a, b) => (a.day - b.day) || a.tx.id.localeCompare(b.tx.id));
    ins.sort((a, b) => (a.day - b.day) || a.tx.id.localeCompare(b.tx.id));

    for (const out of outs) {
        const wanted = -cents(out.tx.amount);
        // La PLUS PROCHE en date parmi les candidates encore libres — sinon un paiement de janvier
        // pourrait s'apparier à celui de mars au seul motif du montant.
        let best: { tx: FintableTransaction; day: number } | null = null;
        let bestGap = Infinity;
        for (const candidate of ins) {
            if (usedIns.has(candidate.tx.id)) continue;
            if (cents(candidate.tx.amount) !== wanted) continue;
            const gap = Math.abs(candidate.day - out.day);
            if (gap > tolerance) continue;
            if (gap < bestGap) { best = candidate; bestGap = gap; }
        }
        if (!best) continue;
        usedIns.add(best.tx.id);
        transferIds.add(out.tx.id);
        transferIds.add(best.tx.id);
        pairs.push({ outId: out.tx.id, inId: best.tx.id, amount: Math.abs(out.tx.amount) });
    }

    return { transferIds, pairs };
}
