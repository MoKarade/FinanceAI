import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CashFlowInsight, SpendingAnalysis } from '../../services/eraContext';

vi.mock('../../services/eraContext', () => ({
    getCashFlow: vi.fn(),
    analyzeSpending: vi.fn(),
    forecastSpending: vi.fn(),
    recallHistory: vi.fn(),
}));

import { buildEnrichedContext, renderEnrichedContext } from '../../services/aiOrchestrator';
import * as eraContext from '../../services/eraContext';

const mockCashFlow: CashFlowInsight = {
    period_start: '2026-01-01',
    period_end: '2026-03-31',
    income_total: 10000,
    expense_total: 7500,
    net_cash_flow: 2500,
    by_category: [
        { category: 'Logement', amount: 2000 },
        { category: 'Épicerie', amount: 800 },
    ],
};

const mockSpending: SpendingAnalysis = {
    period: { start: '2026-03-01', end: '2026-03-31' },
    total_spent: 2500,
    top_categories: [{ category: 'Logement', amount: 2000, pct: 80 }],
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('buildEnrichedContext', () => {
    it('returns hasEraContext=false and nulls when no token', async () => {
        const result = await buildEnrichedContext('');
        expect(result.hasEraContext).toBe(false);
        expect(result.cashFlow).toBeNull();
        expect(result.spending).toBeNull();
        expect(result.forecast).toBeNull();
        expect(result.memory).toHaveLength(0);
    });

    it('calls all Era Context endpoints in parallel with a valid token', async () => {
        vi.mocked(eraContext.getCashFlow).mockResolvedValue(mockCashFlow);
        vi.mocked(eraContext.analyzeSpending).mockResolvedValue(mockSpending);
        vi.mocked(eraContext.forecastSpending).mockResolvedValue(null);
        vi.mocked(eraContext.recallHistory).mockResolvedValue([]);

        const result = await buildEnrichedContext('token123');
        expect(result.hasEraContext).toBe(true);
        expect(result.cashFlow).toEqual(mockCashFlow);
        expect(result.spending).toEqual(mockSpending);
        expect(eraContext.getCashFlow).toHaveBeenCalledWith('token123', expect.any(Object));
        expect(eraContext.analyzeSpending).toHaveBeenCalledWith('token123', expect.any(Object));
    });

    it('returns null slots gracefully when an endpoint throws', async () => {
        vi.mocked(eraContext.getCashFlow).mockRejectedValue(new Error('network error'));
        vi.mocked(eraContext.analyzeSpending).mockResolvedValue(mockSpending);
        vi.mocked(eraContext.forecastSpending).mockResolvedValue(null);
        vi.mocked(eraContext.recallHistory).mockResolvedValue([]);

        const result = await buildEnrichedContext('token123');
        expect(result.cashFlow).toBeNull();
        expect(result.spending).toEqual(mockSpending);
        expect(result.hasEraContext).toBe(true);
    });

    it('passes AbortSignal to all sub-calls', async () => {
        vi.mocked(eraContext.getCashFlow).mockResolvedValue(null);
        vi.mocked(eraContext.analyzeSpending).mockResolvedValue(null);
        vi.mocked(eraContext.forecastSpending).mockResolvedValue(null);
        vi.mocked(eraContext.recallHistory).mockResolvedValue([]);

        const controller = new AbortController();
        await buildEnrichedContext('token123', { signal: controller.signal });
        expect(eraContext.getCashFlow).toHaveBeenCalledWith('token123', expect.objectContaining({ signal: controller.signal }));
    });
});

describe('renderEnrichedContext', () => {
    it('returns empty string when hasEraContext=false', () => {
        const ctx = { cashFlow: null, spending: null, forecast: null, memory: [], hasEraContext: false };
        expect(renderEnrichedContext(ctx)).toBe('');
    });

    it('includes cash-flow figures when present', () => {
        const ctx = {
            cashFlow: mockCashFlow,
            spending: null,
            forecast: null,
            memory: [],
            hasEraContext: true,
        };
        const output = renderEnrichedContext(ctx);
        expect(output).toContain('ERA CONTEXT');
        // Fix 2026-05-21 : formatNumber utilise fr-CA (espace insécable
        // séparateur de milliers). Le test générait avant un résultat
        // dépendant de la locale du runtime (en-US sur CI, fr-CA local).
        // On reconstruit la chaîne attendue via la même fonction de format.
        const fmt = (n: number) => (n).toLocaleString('fr-CA');
        expect(output).toContain(fmt(10000));
        expect(output).toContain(fmt(2500));
    });

    it('includes memory facts when present', () => {
        const ctx = {
            cashFlow: null,
            spending: null,
            forecast: null,
            memory: [{ id: '1', fact: 'risk_tolerance: moderate', stored_at: '2026-01-01' }],
            hasEraContext: true,
        };
        const output = renderEnrichedContext(ctx);
        expect(output).toContain('moderate');
    });
});
