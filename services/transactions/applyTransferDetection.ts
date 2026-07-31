// services/transactions/applyTransferDetection.ts
//
// [TX-TRANSFERS] Applique l'appariement des virements internes aux transactions de l'app.
// Fonction PURE (aucun store, aucun réseau) : entrée `Transaction[]` → sortie `Transaction[]` +
// rapport. Le cœur d'appariement vit dans `./detectTransfers` (partagé avec Fintable).
//
// Décisions de Marc (2026-07-31) encodées ici, volontairement explicites :
//   - marquage AUTOMATIQUE des paires PROUVÉES (deux comptes connus et différents) ;
//   - une correction MANUELLE ne doit jamais être écrasée (`status === 'manual'` est un verrou) —
//     c'est la seule exception au « écraser aussi » qu'il a demandé pour tout le reste ;
//   - les Interac ne sont jamais des transferts (géré en amont, dans le cœur).
//
// Ce que la fonction NE fait PAS : marquer les paires seulement plausibles (compte inconnu d'un
// côté). Elles sont RENDUES à l'appelant pour confirmation humaine — un faux positif retirerait une
// vraie dépense du budget (`budgetSync.ts:58`), et « montants opposés à 2 jours d'écart » est aussi
// la signature d'un achat suivi d'un remboursement.

import type { Transaction } from '../../types';
import { detectInternalTransfers, type TransferPair } from './detectTransfers';

export interface TransferSuggestion {
    /** Les deux transactions de la paire plausible (sortante puis entrante). */
    out: Transaction;
    incoming: Transaction;
    amount: number;
}

export interface TransferDetectionReport {
    /** Transactions nouvellement marquées `isTransfer` (paires prouvées). */
    markedCount: number;
    /** Paires prouvées dont les deux côtés étaient DÉJÀ marqués — rien à faire (idempotence). */
    alreadyMarkedCount: number;
    /** Paires plausibles à confirmer par l'utilisateur : jamais écrites. */
    suggestions: TransferSuggestion[];
    /** Transactions ignorées parce que verrouillées par une correction manuelle. */
    skippedManualCount: number;
    /** Transactions sans compte connu — cause n°1 d'une paire seulement suggérée. */
    withoutAccountCount: number;
    /** Transactions écartées d'office parce qu'Interac (règle métier, jamais un transfert). */
    interacExcludedCount: number;
}

export interface ApplyTransferDetectionResult {
    /** Nouveau tableau (référence inchangée si rien n'a bougé — évite un re-render inutile). */
    transactions: Transaction[];
    report: TransferDetectionReport;
}

/**
 * Détecte les virements internes et marque AUTOMATIQUEMENT les paires prouvées.
 *
 * @param toleranceDays écart maximal entre les deux côtés (défaut : 3 jours).
 */
export function applyTransferDetection(
    transactions: readonly Transaction[],
    toleranceDays?: number,
): ApplyTransferDetectionResult {
    // Les doublons marqués sont hors jeu : ils sont déjà exclus de tous les calculs, les apparier
    // consommerait une contrepartie légitime (l'appariement est un pour un).
    const eligible = transactions.filter((t) => !t.isDuplicate);

    const result = detectInternalTransfers(
        eligible.map((t) => ({
            id: t.id,
            date: t.date,
            amount: t.amount,
            account: t.accountName,
            payee: t.payee,
        })),
        { toleranceDays },
    );

    const byId = new Map(transactions.map((t) => [t.id, t]));
    const isLocked = (id: number): boolean => byId.get(id)?.status === 'manual';

    // Une paire dont UN côté est verrouillé manuellement n'est pas appliquée du tout : marquer un
    // seul côté déséquilibrerait le budget (une sortie neutralisée, l'entrée toujours comptée).
    const applicable: Array<TransferPair<number>> = [];
    let skippedManualCount = 0;
    let alreadyMarkedCount = 0;
    for (const pair of result.pairs) {
        if (pair.confidence !== 'confirmed') continue;
        if (isLocked(pair.outId) || isLocked(pair.inId)) { skippedManualCount++; continue; }
        if (byId.get(pair.outId)?.isTransfer && byId.get(pair.inId)?.isTransfer) {
            alreadyMarkedCount++;
            continue;
        }
        applicable.push(pair);
    }

    const toMark = new Set<number>();
    for (const pair of applicable) { toMark.add(pair.outId); toMark.add(pair.inId); }

    const suggestions: TransferSuggestion[] = [];
    for (const pair of result.pairs) {
        if (pair.confidence !== 'suggested') continue;
        const out = byId.get(pair.outId);
        const incoming = byId.get(pair.inId);
        if (!out || !incoming) continue;
        if (out.isTransfer && incoming.isTransfer) continue; // déjà réglé (à la main ou plus tôt)
        suggestions.push({ out, incoming, amount: pair.amount });
    }

    const report: TransferDetectionReport = {
        markedCount: toMark.size,
        alreadyMarkedCount,
        suggestions,
        skippedManualCount,
        withoutAccountCount: result.stats.withoutAccount,
        interacExcludedCount: result.stats.interacExcluded,
    };

    if (toMark.size === 0) return { transactions: transactions as Transaction[], report };

    const next = transactions.map((t) =>
        toMark.has(t.id)
            ? {
                ...t,
                isTransfer: true,
                // `originalCategory` préserve la catégorie d'origine : c'est ce que `toggleTransfer`
                // (components/Transactions.tsx) restaure si Marc défait le marquage.
                originalCategory: t.originalCategory ?? t.category,
                category: 'Transfert',
                status: 'processed' as const,
                confidence: 100,
            }
            : t,
    );
    return { transactions: next, report };
}
