import { z } from "zod";
import { Transaction } from "../types";

// Era Context REST API client.
// Platform: era.app — MCP-first personal finance, REST API for professional users.
const ERA_CONTEXT_BASE = 'https://api.era.app/v1';

// Audit 2026-05: timeouts + cap pagination + validation Zod.
const FETCH_TIMEOUT_MS = 30_000;
const MAX_PAGES = 1000;             // 1000 pages * 100/page = 100k tx max
const MAX_TRANSACTIONS = 100_000;

const EraContextTxSchema = z.object({
    id: z.union([z.number(), z.string()]),
    date: z.string(),
    merchant_name: z.string().nullable().optional(),
    payee: z.string().nullable().optional(),
    amount: z.union([z.string(), z.number()]),
    category: z.string().nullable().optional(),
    is_pending: z.boolean().optional(),
    account_name: z.string().nullable().optional(),
    account_group_key: z.string().nullable().optional(),
}).passthrough();

const EraContextResponseSchema = z.object({
    transactions: z.array(EraContextTxSchema).optional(),
    pagination: z.object({ has_more: z.boolean().optional() }).passthrough().optional(),
}).passthrough();

export const fetchTransactions = async (
    token: string,
    startDateInput?: string | number,
    signal?: AbortSignal,
): Promise<Transaction[]> => {
    if (!token) {
        console.warn("[EraContext] No token provided.");
        return [];
    }

    try {
        const endDate = new Date();
        let startStr = "2000-01-01";

        if (startDateInput) {
            if (typeof startDateInput === 'string') {
                startStr = startDateInput;
            } else {
                const d = new Date();
                d.setDate(d.getDate() - startDateInput);
                startStr = d.toISOString().split('T')[0];
            }
        }

        const endStr = endDate.toISOString().split('T')[0];
        console.log(`[EraContext] Fetching ${startStr} → ${endStr}`);

        let allRaw: z.infer<typeof EraContextTxSchema>[] = [];
        let page = 1;
        let hasMore = true;
        const pageSize = 100;

        while (hasMore && page <= MAX_PAGES && allRaw.length < MAX_TRANSACTIONS) {
            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            const params = new URLSearchParams({
                from_date: startStr,
                to_date: endStr,
                page: page.toString(),
                page_size: pageSize.toString(),
            });

            const timeoutCtrl = new AbortController();
            const timeoutId = setTimeout(() => timeoutCtrl.abort(), FETCH_TIMEOUT_MS);
            const combinedSignal = signal
                ? (AbortSignal.any ? AbortSignal.any([signal, timeoutCtrl.signal]) : signal)
                : timeoutCtrl.signal;

            let response: Response;
            try {
                response = await fetch(`${ERA_CONTEXT_BASE}/transactions?${params}`, {
                    signal: combinedSignal,
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                });
            } finally {
                clearTimeout(timeoutId);
            }

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Era Context API (${response.status}): ${text}`);
            }

            const rawData = await response.json();
            const data = EraContextResponseSchema.parse(rawData);
            const rows = data.transactions ?? [];
            allRaw = [...allRaw, ...rows];
            hasMore = rows.length === pageSize && (data.pagination?.has_more ?? false);
            page++;
        }

        if (page > MAX_PAGES || allRaw.length >= MAX_TRANSACTIONS) {
            console.warn(`[EraContext] Hit cap (${page} pages, ${allRaw.length} tx) — sortie anticipée.`);
        }

        return allRaw.map((t): Transaction => ({
            id: Number(t.id),
            date: t.date,
            payee: t.merchant_name || t.payee || 'Inconnu',
            amount: parseFloat(String(t.amount)) || 0,
            category: t.category || 'Uncategorized',
            originalCategory: t.category || undefined,
            status: t.is_pending ? 'pending' : 'processed',
            isTransfer: false,
            accountName: t.account_name || t.account_group_key || 'Unknown',
        }));
    } catch (e) {
        if ((e as Error)?.name === 'AbortError') throw e;
        console.error("[EraContext] Fetch failed:", e);
        throw e;
    }
};
