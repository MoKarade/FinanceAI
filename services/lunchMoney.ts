import { Transaction } from "../types";

// Note: Client-side calls to Lunch Money often fail due to CORS restrictions on browsers.
// If this fails, the user will now see an error instead of fake data.

export const fetchTransactions = async (token: string, startDateInput?: string | number): Promise<Transaction[]> => {
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

        let allRawTransactions: any[] = [];
        let offset = 0;
        const limit = 1000; // Maximizing limit to reduce requests
        let keepFetching = true;

        while (keepFetching) {
            // Explicitly requesting pending transactions to be precise
            // Pagination is handled via offset/limit
            const params = new URLSearchParams({
                start_date: startStr,
                end_date: endStr,
                offset: offset.toString(),
                limit: limit.toString(),
                pending: 'true',
            });

            const url = `https://dev.lunchmoney.app/v1/transactions?${params.toString()}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Lunch Money API Error (${response.status}): ${errorText}`);
            }

            const data = await response.json();

            if (data.transactions && data.transactions.length > 0) {
                allRawTransactions = [...allRawTransactions, ...data.transactions];

                // If we got fewer than limit, we've reached the end of available data
                if (data.transactions.length < limit) {
                    keepFetching = false;
                } else {
                    offset += limit;
                }
            } else {
                keepFetching = false;
            }
        }

        // Map all transactions
        return allRawTransactions.map((t: any) => ({
            id: t.id,
            date: t.date,
            payee: t.payee,
            // LunchMoney amount * -1 : Dépenses négatives, Revenus positifs
            amount: parseFloat(t.amount) * -1,
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
        console.error("Lunch Money Fetch Failed:", e);
        throw e; // Re-throw to be caught by UI
    }
};