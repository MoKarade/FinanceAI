import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSimulationParams } from '../../hooks/useSimulationParams';
import { buildSimulationParamsFromState } from '../../services/projection/buildSimulationParams';
import { useDerivedFinancials } from '../../utils/useDerivedFinancials';
import { TEST_PERSONAS } from '../../services/testPersonas';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { AppState } from '../../types';

const jour = (d: Date) => d.toISOString().slice(0, 10);

describe('[AUDIT] parité navigateur / MCP sur une dette LIÉE à un marchand', () => {
    beforeEach(() => { act(() => { useFinanceStore.getState().resetState(); }); });

    it('les deux chemins rendent le MÊME solde corrigé', () => {
        const persona = TEST_PERSONAS.find(p => p.id === 'couple-confort')!;
        const fx = persona.build();
        const auj = new Date();
        const dep = new Date(auj.getTime() - 60 * 86400000);
        const tx: any[] = [];
        for (let k = 1; k <= 8; k++) {
            tx.push({ id: `toy${k}`, date: jour(new Date(dep.getTime() + k * 7 * 86400000)), payee: 'Toyota Financial', amount: -234.67, category: 'Transport', type: 'expense' });
        }
        (fx as any).transactions = [...((fx as any).transactions ?? []), ...tx];
        (fx as any).debts = [{
            id: 'bail', name: 'Bail Toyota', category: 'Car', kind: 'auto-lease',
            balance: 47168.67, interestRate: 0, minimumPayment: 1016.90,
            startDate: '2026-01-09', termEndDate: '2029-12-09', paymentFrequency: 'weekly',
            balanceAsOf: jour(dep), paymentPayee: 'Toyota Financial',
        }];
        act(() => { useFinanceStore.getState().enableTestMode(fx, persona.id); });
        const state = useFinanceStore.getState() as unknown as AppState;
        const derived = renderHook(() => useDerivedFinancials(state));
        const { result } = renderHook(() => useSimulationParams(derived.result.current.calculatedMonthlySavings));
        const mcp = buildSimulationParamsFromState(state, { startYear: result.current.startYear, startMonth: result.current.startMonth });

        const soldeHook = (result.current.params.debts as any[])[0].balance;
        const soldeMcp = (mcp.debts as any[])[0].balance;
        console.log('SOLDE HOOK =', soldeHook, ' SOLDE MCP =', soldeMcp, ' stocke =', 47168.67, ' attendu =', 47168.67 - 8 * 234.67);
        expect(soldeHook).toBe(soldeMcp);
        expect(soldeHook).toBeCloseTo(47168.67 - 8 * 234.67, 2);
        expect(result.current.params).toEqual(mcp);
    });
});
