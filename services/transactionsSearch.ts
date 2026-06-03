// services/transactionsSearch.ts
//
// Lot 1 — filtre PUR sur les transactions, réutilisable par le MCP
// (`search_transactions`) et testable unitairement. Aucune dépendance React.

import type { Transaction } from '../types';

export interface TransactionSearchFilters {
    /** Texte libre : casse-insensible, cherché dans payee + category. */
    query?: string;
    /** Catégorie exacte (casse-insensible). */
    category?: string;
    /** Montant minimum (signé : dépenses négatives, revenus positifs). */
    minAmount?: number;
    /** Montant maximum (signé). */
    maxAmount?: number;
    /** Date de début incluse (YYYY-MM-DD, comparaison lexicographique ISO). */
    fromDate?: string;
    /** Date de fin incluse (YYYY-MM-DD). */
    toDate?: string;
    /** Inclure les transferts (défaut: false — on les exclut du reporting). */
    includeTransfers?: boolean;
    /** Inclure les doublons marqués (défaut: false). */
    includeDuplicates?: boolean;
}

export interface TransactionSearchResult {
    matches: Transaction[];
    count: number;
    /** Somme signée des montants filtrés. */
    totalAmount: number;
    /** Somme des montants négatifs (dépenses), en valeur absolue. */
    totalSpent: number;
    /** Somme des montants positifs (revenus). */
    totalReceived: number;
}

/**
 * Filtre les transactions selon les critères fournis, puis agrège. Tri par date
 * décroissante (plus récentes d'abord). `limit` borne le nombre de `matches`
 * renvoyés (les agrégats portent sur TOUT l'ensemble filtré, pas seulement la
 * page).
 */
export function searchTransactions(
    transactions: readonly Transaction[],
    filters: TransactionSearchFilters = {},
    limit?: number,
): TransactionSearchResult {
    const q = filters.query?.trim().toLowerCase();
    const cat = filters.category?.trim().toLowerCase();

    const filtered = (transactions ?? []).filter((t) => {
        if (!filters.includeTransfers && t.isTransfer) return false;
        if (!filters.includeDuplicates && t.isDuplicate) return false;
        if (q) {
            const hay = `${t.payee ?? ''} ${t.category ?? ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        if (cat && (t.category ?? '').toLowerCase() !== cat) return false;
        if (filters.minAmount != null && t.amount < filters.minAmount) return false;
        if (filters.maxAmount != null && t.amount > filters.maxAmount) return false;
        if (filters.fromDate && (t.date ?? '') < filters.fromDate) return false;
        if (filters.toDate && (t.date ?? '') > filters.toDate) return false;
        return true;
    });

    const totalAmount = filtered.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const totalSpent = filtered.reduce((s, t) => (t.amount < 0 ? s - t.amount : s), 0);
    const totalReceived = filtered.reduce((s, t) => (t.amount > 0 ? s + t.amount : s), 0);

    const sorted = [...filtered].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    const matches = typeof limit === 'number' ? sorted.slice(0, limit) : sorted;

    return { matches, count: filtered.length, totalAmount, totalSpent, totalReceived };
}
