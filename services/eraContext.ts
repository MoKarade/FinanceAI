import { Transaction } from "../types";

// Era Context REST API client.
// Platform: era.app — MCP-first personal finance, REST API for professional users.
const ERA_CONTEXT_BASE = 'https://api.era.app/v1';

export const fetchTransactions = async (token: string, startDateInput?: string | number, signal?: AbortSignal): Promise<Transaction[]> => {
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

        let allRaw: any[] = [];
        let page = 1;
        let hasMore = true;
        const pageSize = 100;

        while (hasMore) {
            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            const params = new URLSearchParams({
                from_date: startStr,
                to_date: endStr,
                page: page.toString(),
                page_size: pageSize.toString(),
            });

            const response = await fetch(`${ERA_CONTEXT_BASE}/transactions?${params}`, {
                signal,
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Era Context API (${response.status}): ${text}`);
            }

            const data = await response.json();
            const rows: any[] = data.transactions || [];
            allRaw = [...allRaw, ...rows];
            hasMore = rows.length === pageSize && (data.pagination?.has_more ?? false);
            page++;
        }

        return allRaw.map((t: any): Transaction => ({
            id: t.id,
            date: t.date,
            payee: t.merchant_name || t.payee || 'Inconnu',
            amount: parseFloat(t.amount) || 0,
            category: t.category || 'Uncategorized',
            originalCategory: t.category || undefined,
            status: t.is_pending ? 'pending' : 'processed',
            isTransfer: false,
            accountName: t.account_name || t.account_group_key || 'Unknown',
        }));
    } catch (e) {
        if ((e as any)?.name === 'AbortError') throw e;
        console.error("[EraContext] Fetch failed:", e);
        throw e;
    }
};
