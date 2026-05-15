import { z } from "zod";
import { Transaction } from "../types";

// Note: Client-side calls to Lunch Money often fail due to CORS restrictions on browsers.
// If this fails, the user will now see an error instead of fake data.

// Audit 2026-05: limites de protection + validation Zod.
const FETCH_TIMEOUT_MS = 30_000;
const MAX_PAGES = 100;              // Cap pagination: 100 pages * 1000/page = 100k tx max
const MAX_TRANSACTIONS = 100_000;

// Schéma de validation runtime de la réponse LunchMoney.
const LunchMoneyTxSchema = z.object({
    id: z.union([z.number(), z.string()]),
    date: z.string(),
    payee: z.string().nullable().optional(),
    amount: z.union([z.string(), z.number()]),
    category_name: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    account_display_name: z.string().nullable().optional(),
    plaid_account_id: z.string().nullable().optional(),
}).passthrough();

const LunchMoneyResponseSchema = z.object({
    transactions: z.array(LunchMoneyTxSchema).optional(),
}).passthrough();

export const fetchTransactions = async (
    token: string,
    startDateInput?: string | number,
    signal?: AbortSignal,
): Promise<Transaction[]> => {
    if (!token) {
        console.warn("No Lunch Money token provided.");
        return [];
    }

    try {
        const endDate = new Date();
        let startStr = "";

        if (startDateInput) {
            // If a specific date string (YYYY-MM-DD) or number (days back) is provided
            if (typeof startDateInput === 'string') {
                startStr = startDateInput;
            } else {
                const d = new Date();
                d.setDate(d.getDate() - startDateInput);
                startStr = d.toISOString().split('T')[0];
            }
        } else {
            // CHANGE: Default to "All Time" (Start from year 2000) instead of 30 days
            startStr = "2000-01-01";
        }

        const endStr = endDate.toISOString().split('T')[0];

        console.log(`Fetching LunchMoney from ${startStr} to ${endStr}`);

        let allRawTransactions: z.infer<typeof LunchMoneyTxSchema>[] = [];
        let offset = 0;
        const limit = 1000;
        let keepFetching = true;
        let pageCount = 0;

        while (keepFetching && pageCount < MAX_PAGES && allRawTransactions.length < MAX_TRANSACTIONS) {
            pageCount++;
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

            const params = new URLSearchParams({
                start_date: startStr,
                end_date: endStr,
                offset: offset.toString(),
                limit: limit.toString(),
                pending: 'true',
            });

            const url = `https://dev.lunchmoney.app/v1/transactions?${params.toString()}`;

            // Timeout par requête (combiné avec signal externe via AbortSignal.any si dispo)
            const timeoutCtrl = new AbortController();
            const timeoutId = setTimeout(() => timeoutCtrl.abort(), FETCH_TIMEOUT_MS);
            const combinedSignal = signal
                ? (AbortSignal.any ? AbortSignal.any([signal, timeoutCtrl.signal]) : timeoutCtrl.signal)
                : timeoutCtrl.signal;

            let response: Response;
            try {
                response = await fetch(url, {
                    method: 'GET',
                    signal: combinedSignal,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
            } finally {
                clearTimeout(timeoutId);
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Lunch Money API Error (${response.status}): ${errorText}`);
            }

            const rawData = await response.json();
            const data = LunchMoneyResponseSchema.parse(rawData);
            const rows = data.transactions ?? [];

            if (rows.length > 0) {
                allRawTransactions = [...allRawTransactions, ...rows];

                if (rows.length < limit) {
                    keepFetching = false;
                } else {
                    offset += limit;
                }
            } else {
                keepFetching = false;
            }
        }

        if (pageCount >= MAX_PAGES || allRawTransactions.length >= MAX_TRANSACTIONS) {
            console.warn(`[LunchMoney] Hit cap (${pageCount} pages, ${allRawTransactions.length} tx) — sortie anticipée.`);
        }

        // Map all transactions
        return allRawTransactions.map((t): Transaction => ({
            id: Number(t.id),
            date: t.date,
            payee: t.payee ?? "Inconnu",
            // LunchMoney amount * -1 : Dépenses négatives, Revenus positifs
            amount: (parseFloat(String(t.amount)) || 0) * -1,
            category: t.category_name || "Uncategorized",
            originalCategory: t.category_name || undefined,
            // ✅ ERR-15 fix : Utilise le vrai status LunchMoney (cleared/uncleared/pending)
            status: (t.status === 'cleared' || t.status === 'recurring' || t.status === 'recurring_suggested')
                ? 'processed'
                : (t.status === 'pending' || t.status === 'uncleared')
                    ? 'pending'
                    : 'pending',
            isTransfer: false, // Géré par l'IA
            accountName: t.account_display_name || t.plaid_account_id || "Unknown"
        }));

    } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        console.error("Lunch Money Fetch Failed:", e);
        throw e; // Re-throw to be caught by UI
    }
};