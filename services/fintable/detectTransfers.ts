// services/fintable/detectTransfers.ts
//
// [FINTABLE-TRANSFERS] Reconnaît les VIREMENTS INTERNES entre deux comptes de l'utilisateur, pour
// les marquer `isTransfer` au lieu de les laisser passer pour des dépenses ou des revenus.
//
// Pourquoi c'est nécessaire (constaté sur l'aperçu réel du 2026-07-29) : quand on importe LES DEUX
// CÔTÉS d'une relation compte-chèque ↔ carte de crédit, le **paiement mensuel de la carte** apparaît
// deux fois — en sortie du compte chèque, et en entrée sur la carte. Ce n'est pas une dépense, c'est
// un déplacement d'argent entre deux poches.
//
// Effet si on ne fait rien (vérifié dans le code, pas supposé) :
//   - `budgetSync.ts:58` somme les montants NÉGATIFS hors transferts → le paiement de carte gonfle
//     les dépenses réelles du mois, EN PLUS des achats déjà comptés sur la carte ;
//   - `budgetSync.ts:37` somme les POSITIFS hors transferts → l'entrée sur la carte pourrait compter
//     comme une rentrée d'argent.
// Le patrimoine, lui, reste juste (les soldes sont recalés sur les vrais chiffres via `cash_balance`
// et `debt`) : c'est bien le BUDGET qui mentirait. D'où un correctif ciblé, pas un garde global.
//
// ⚠️ [TX-TRANSFERS 2026-07-31] L'ALGORITHME d'appariement vit désormais dans
// `services/transactions/detectTransfers.ts` (cœur générique, partagé avec l'import CSV/relevés de
// l'app — Marc déplace de l'argent entre 4 poches, pas seulement compte↔carte). Ce module ne garde
// que ce qui est SPÉCIFIQUE à Fintable : la contrainte de RÔLES (sortie d'un compte `cash`, entrée
// sur un compte `debt`), passée au cœur via sa garde `canPair`. Une seule copie de l'algorithme —
// deux copies auraient dérivé (cf. leçon « consolider au lieu de dupliquer le fix »).
//
// ⚠️ Ce module ne SUPPRIME rien et n'invente aucune transaction : il pose seulement `isTransfer` sur
// des lignes déjà destinées à l'import. Un faux positif exclut une vraie dépense du budget.

import {
    DEFAULT_TRANSFER_TOLERANCE_DAYS,
    detectInternalTransfers as detectGenericTransfers,
    type TransferCandidate,
} from '../transactions/detectTransfers';
import type { FintableAccountRole } from './mapSnapshot';
import type { FintableTransaction } from './types';

/** Fenêtre par défaut : un paiement de carte est débité et crédité à quelques jours d'intervalle. */
const DEFAULT_TOLERANCE_DAYS = DEFAULT_TRANSFER_TOLERANCE_DAYS;

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

/** Libellé utilisé pour l'exclusion Interac (même dérivation que `payeeOf` du mapper). */
function payeeOf(tx: FintableTransaction): string {
    const merchant = tx.merchant?.trim();
    if (merchant) return merchant;
    return tx.description.trim();
}

/**
 * Apparie les virements internes entre un compte `cash` et un compte `debt`.
 *
 * Critères communs (cœur générique) : montants exactement opposés au cent, dates séparées d'au plus
 * `toleranceDays`, comptes différents, aucun côté Interac, appariement un pour un sur la candidate
 * la plus proche en date. Critère SPÉCIFIQUE ici : la sortie vient d'un compte `cash` et l'entrée
 * d'un compte `debt` — c'est le sens d'un paiement de carte, et deux mouvements opposés sur des
 * comptes de même rôle relèvent d'un autre scénario que Fintable ne doit pas trancher seul.
 *
 * Les comptes Fintable sont TOUJOURS identifiés (`accountId`) : toutes les paires sortent donc
 * `confirmed` du cœur, et `transferIds` reste l'ensemble des ids à marquer — API inchangée.
 */
export function detectInternalTransfers(
    transactions: readonly FintableTransaction[],
    roles: Readonly<Record<string, FintableAccountRole>>,
    toleranceDays: number = DEFAULT_TOLERANCE_DAYS,
): DetectTransfersResult {
    const candidates: Array<TransferCandidate<string>> = transactions.map((tx) => ({
        id: tx.id,
        date: tx.date,
        amount: tx.amount,
        account: tx.accountId,
        payee: payeeOf(tx),
    }));

    const result = detectGenericTransfers(candidates, {
        toleranceDays,
        // Sortie DEPUIS les liquidités, entrée SUR la dette : le sens d'un paiement de carte.
        canPair: (out, incoming) =>
            roles[out.account ?? '']?.kind === 'cash' && roles[incoming.account ?? '']?.kind === 'debt',
    });

    return {
        transferIds: result.confirmedIds,
        pairs: result.pairs.map((p) => ({ outId: p.outId, inId: p.inId, amount: p.amount })),
    };
}
