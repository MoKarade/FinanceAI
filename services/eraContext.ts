import { z } from "zod";
import { Transaction } from "../types";

// Era Context REST API client.
// Platform: era.app — MCP-first personal finance, REST API for professional users.
const ERA_CONTEXT_BASE = 'https://api.era.app/v1';

// Audit 2026-05: timeouts + cap pagination + validation Zod.
const FETCH_TIMEOUT_MS = 30_000;
const MAX_PAGES = 1000;             // 1000 pages * 100/page = 100k tx max
const MAX_TRANSACTIONS = 100_000;

// Phase 4 B6 — TTL cache pour les insights (1h, in-memory).
// Évite de re-fetch les mêmes insights à chaque ouverture d'un onglet.
// Clé = path + token hash (4 chars).
const INSIGHT_TTL_MS = 60 * 60 * 1000;
const insightCache = new Map<string, { value: unknown; expiresAt: number }>();
const tokenHash = (token: string): string => token.slice(-4) || 'anon';
const cacheKey = (path: string, token: string, params?: Record<string, string>): string => {
    const p = params ? '?' + new URLSearchParams(params).toString() : '';
    return `${path}${p}#${tokenHash(token)}`;
};
const getCached = <T>(key: string): T | null => {
    const entry = insightCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        insightCache.delete(key);
        return null;
    }
    return entry.value as T;
};
const setCached = <T>(key: string, value: T): void => {
    insightCache.set(key, { value, expiresAt: Date.now() + INSIGHT_TTL_MS });
};

/**
 * Phase 4 B6 — helper générique pour les endpoints Era Context.
 * Gère: timeout, AbortSignal, Bearer token, validation Zod, cache TTL.
 *
 * Note: les paths exacts (/insights/cash-flow, etc.) peuvent évoluer côté
 * Era Context. Wrappers de haut niveau ci-dessous isolent ces détails.
 */
async function eraRequest<S extends z.ZodTypeAny>(
    path: string,
    token: string,
    schema: S,
    options: { params?: Record<string, string>; useCache?: boolean; signal?: AbortSignal } = {},
): Promise<z.infer<S> | null> {
    if (!token) {
        console.warn(`[EraContext] ${path}: no token, skip.`);
        return null;
    }

    const { params, useCache = true, signal } = options;
    const key = cacheKey(path, token, params);

    if (useCache) {
        const cached = getCached<z.infer<S>>(key);
        if (cached !== null) return cached;
    }

    const url = `${ERA_CONTEXT_BASE}${path}${params ? '?' + new URLSearchParams(params).toString() : ''}`;
    const timeoutCtrl = new AbortController();
    const timeoutId = setTimeout(() => timeoutCtrl.abort(), FETCH_TIMEOUT_MS);
    const combinedSignal = signal
        ? (AbortSignal.any ? AbortSignal.any([signal, timeoutCtrl.signal]) : signal)
        : timeoutCtrl.signal;

    try {
        const response = await fetch(url, {
            signal: combinedSignal,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
        if (!response.ok) {
            console.warn(`[EraContext] ${path} HTTP ${response.status}`);
            return null;
        }
        const raw = await response.json();
        // P1.2 — safeParse au lieu de parse : Era peut envoyer un payload
        // malformé (breaking change, edge case), on log via errorLogger
        // mais l'app ne crash pas — retourne null comme pour HTTP error.
        const validated = schema.safeParse(raw);
        if (!validated.success) {
            const { logError } = await import('./errorLogger');
            logError({
                source: 'era',
                severity: 'warning',
                message: `${path} Zod validation failed`,
                context: { issues: validated.error.issues.slice(0, 3) },
            });
            return null;
        }
        if (useCache) setCached(key, validated.data);
        return validated.data;
    } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        console.warn(`[EraContext] ${path} failed:`, (e as Error).message);
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}

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
                // Sécurité (audit MEDIUM) : on logge le corps brut pour le debug
                // local mais on ne le propage PAS dans le message d'erreur — il
                // peut contenir des détails internes de l'API. L'UI ne voit que
                // le code de statut.
                const text = await response.text();
                console.warn(`[eraContext] Era API ${response.status}:`, text);
                throw new Error(`Era Context API a répondu ${response.status}`);
            }

            const rawData = await response.json();
            // P1.2 — safeParse pour ne pas crash si Era envoie payload malformé
            const parsed = EraContextResponseSchema.safeParse(rawData);
            if (!parsed.success) {
                const { logError } = await import('./errorLogger');
                logError({
                    source: 'era',
                    severity: 'warning',
                    message: 'fetchTransactions Zod validation failed',
                    context: { page, issues: parsed.error.issues.slice(0, 3) },
                });
                break; // arrête la pagination
            }
            const rows = parsed.data.transactions ?? [];
            allRaw = [...allRaw, ...rows];
            hasMore = rows.length === pageSize && (parsed.data.pagination?.has_more ?? false);
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

// ═══════════════════════════════════════════════════════════════════════════
// Phase 4 B6 — Insights API (cf docs/PLAN_PHASE_4.md §2 B6)
// ═══════════════════════════════════════════════════════════════════════════

// ─── Cash-flow ───────────────────────────────────────────────────────────────

const CashFlowSchema = z.object({
    period_start: z.string(),
    period_end: z.string(),
    income_total: z.number(),
    expense_total: z.number(),
    net_cash_flow: z.number(),
    by_category: z.array(z.object({
        category: z.string(),
        amount: z.number(),
        pct_of_expenses: z.number().optional(),
    })).optional(),
}).passthrough();

export type CashFlowInsight = z.infer<typeof CashFlowSchema>;

export const getCashFlow = async (
    token: string,
    options: { days?: number; signal?: AbortSignal } = {},
): Promise<CashFlowInsight | null> => {
    const days = options.days ?? 90;
    return eraRequest('/insights/cash-flow', token, CashFlowSchema, {
        params: { days: String(days) },
        signal: options.signal,
    });
};

// ─── Analyse de dépenses (catégorie × période) ──────────────────────────────

const SpendingAnalysisSchema = z.object({
    period: z.object({ start: z.string(), end: z.string() }),
    total_spent: z.number(),
    top_categories: z.array(z.object({
        category: z.string(),
        amount: z.number(),
        pct: z.number(),
        count: z.number().optional(),
    })),
    anomalies: z.array(z.object({
        category: z.string(),
        description: z.string(),
        severity: z.enum(['info', 'warning', 'critical']).optional(),
    })).optional(),
}).passthrough();

export type SpendingAnalysis = z.infer<typeof SpendingAnalysisSchema>;

export const analyzeSpending = async (
    token: string,
    options: { days?: number; signal?: AbortSignal } = {},
): Promise<SpendingAnalysis | null> => {
    const days = options.days ?? 30;
    return eraRequest('/insights/spending', token, SpendingAnalysisSchema, {
        params: { days: String(days) },
        signal: options.signal,
    });
};

// ─── Prévision de dépenses (forecast) ────────────────────────────────────────

const ForecastSchema = z.object({
    months_ahead: z.number(),
    forecast: z.array(z.object({
        month: z.string(),
        projected_expenses: z.number(),
        projected_income: z.number().optional(),
        confidence: z.enum(['low', 'medium', 'high']).optional(),
    })),
    methodology: z.string().optional(),
}).passthrough();

export type SpendingForecast = z.infer<typeof ForecastSchema>;

export const forecastSpending = async (
    token: string,
    options: { months?: number; signal?: AbortSignal } = {},
): Promise<SpendingForecast | null> => {
    const months = options.months ?? 3;
    return eraRequest('/insights/forecast', token, ForecastSchema, {
        params: { months: String(months) },
        signal: options.signal,
    });
};

// ─── Résumé quotidien ────────────────────────────────────────────────────────

const DailySummarySchema = z.object({
    date: z.string(),
    new_transactions_count: z.number(),
    notable_events: z.array(z.string()).optional(),
    spending_vs_average: z.object({
        today: z.number(),
        avg_30d: z.number(),
        ratio: z.number(),
    }).optional(),
}).passthrough();

export type DailySummary = z.infer<typeof DailySummarySchema>;

export const getDailyFinancialSummary = async (
    token: string,
    options: { signal?: AbortSignal } = {},
): Promise<DailySummary | null> => {
    return eraRequest('/insights/daily-summary', token, DailySummarySchema, {
        signal: options.signal,
        useCache: false, // change tous les jours, on n'utilise pas le cache
    });
};

// ─── Knowledge / mémoire (Era Context conserve les préférences) ─────────────

const RememberAckSchema = z.object({
    id: z.string(),
    fact: z.string(),
    stored_at: z.string(),
}).passthrough();

/**
 * Persiste un fait dans la mémoire Era Context (préférences, objectifs casual).
 * Utilisé par l'AI orchestrator (PR B7) quand l'utilisateur mentionne quelque
 * chose à retenir entre sessions ("je préfère épargner via CELI", "je veux
 * voyager en Italie en 2027", etc.).
 */
export const rememberFact = async (
    token: string,
    fact: string,
    options: { signal?: AbortSignal } = {},
): Promise<{ id: string } | null> => {
    if (!token || !fact.trim()) return null;
    try {
        const response = await fetch(`${ERA_CONTEXT_BASE}/knowledge/remember`, {
            method: 'POST',
            signal: options.signal,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ fact }),
        });
        if (!response.ok) {
            console.warn(`[EraContext] rememberFact HTTP ${response.status}`);
            return null;
        }
        // P1.2 — safeParse pour cohérence avec eraRequest
        const parsed = RememberAckSchema.safeParse(await response.json());
        if (!parsed.success) {
            const { logError } = await import('./errorLogger');
            logError({ source: 'era', severity: 'warning', message: 'rememberFact ack invalid', context: { issues: parsed.error.issues.slice(0, 2) } });
            return null;
        }
        return { id: parsed.data.id };
    } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        console.warn('[EraContext] rememberFact failed:', (e as Error).message);
        return null;
    }
};

const RecallSchema = z.array(z.object({
    id: z.string(),
    fact: z.string(),
    stored_at: z.string(),
}).passthrough());

export type RecalledFact = z.infer<typeof RecallSchema>[number];

export const recallHistory = async (
    token: string,
    options: { limit?: number; signal?: AbortSignal } = {},
): Promise<RecalledFact[]> => {
    const limit = options.limit ?? 20;
    const result = await eraRequest('/knowledge/recall', token, RecallSchema, {
        params: { limit: String(limit) },
        signal: options.signal,
    });
    return result ?? [];
};

// ─── Phase 4 B8 — Abonnements récurrents ────────────────────────────────────

const RecurringChargeSchema = z.object({
    merchant_name: z.string(),
    average_amount: z.number(),
    frequency: z.string(),
    next_expected_date: z.string().optional(),
    category: z.string().optional(),
}).passthrough();

const RecurringChargesResponseSchema = z.object({
    recurring_charges: z.array(RecurringChargeSchema),
}).passthrough();

export type RecurringCharge = z.infer<typeof RecurringChargeSchema>;

/**
 * Liste les abonnements récurrents détectés par Era Context.
 * Plus rapide et précis que detectSubscriptionsAI (qui invoque Claude).
 * À utiliser en priorité quand Era Context est configuré.
 */
export const listRecurringCharges = async (
    token: string,
    options: { signal?: AbortSignal } = {},
): Promise<RecurringCharge[]> => {
    const result = await eraRequest('/transactions/recurring', token, RecurringChargesResponseSchema, {
        signal: options.signal,
    });
    return result?.recurring_charges ?? [];
};

