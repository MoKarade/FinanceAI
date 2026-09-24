// tests/hooks/detteVirementsPariteChemins.test.tsx
//
// [DETTE-VIREMENTS-REELS] Le chemin NAVIGATEUR et le chemin MCP remettent au moteur la MÊME dette.
//
// ⚠️ Pourquoi ce fichier existe : `transactions` est devenu un champ REQUIS des entrées du moteur,
// et il est rempli à DEUX endroits — `hooks/useSimulationParams.ts` (React) et
// `buildSimulationParamsFromState` (MCP, hors DOM). Deux réponses à une seule question : si l'un des
// deux passait une liste vide, la dette liée resterait au solde figé sur CETTE surface-là,
// silencieusement. Le lot précédent a payé exactement ça sur un SECOND constructeur de paramètres
// que je n'avais pas touché, et le test de parité d'alors ne pouvait pas le voir — aucun persona ne
// portait la donnée en cause. Ici la fixture la porte.
//
// ⚠️ La garde vise l'ÉGALITÉ des deux chemins **et** la valeur attendue : l'égalité seule serait
// satisfaite par deux chemins également faux (`DEUX-TESTS-COHERENTS-ENTRE-EUX-PEUVENT-ETRE-FAUX-ENSEMBLE`).

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSimulationParams } from '../../hooks/useSimulationParams';
import { buildSimulationParamsFromState } from '../../services/projection/buildSimulationParams';
import { useDerivedFinancials } from '../../utils/useDerivedFinancials';
import { TEST_PERSONAS } from '../../services/testPersonas';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { AppState } from '../../types';

const jour = (d: Date) => d.toISOString().slice(0, 10);

describe('[DETTE-VIREMENTS-REELS] parité navigateur / MCP sur une dette LIÉE à un marchand', () => {
    beforeEach(() => { act(() => { useFinanceStore.getState().resetState(); }); });

    it('les deux chemins rendent le MÊME solde corrigé', () => {
        const persona = TEST_PERSONAS.find(p => p.id === 'couple-confort')!;
        const fx = persona.build();
        const auj = new Date();
        const dep = new Date(auj.getTime() - 60 * 86400000);
        const tx: any[] = [];
        for (let k = 1; k <= 8; k++) {
            tx.push({ id: `bail${k}`, date: jour(new Date(dep.getTime() + k * 7 * 86400000)), payee: 'Credit-bail Auto Nord', amount: -161.54, category: 'Transport', type: 'expense' });
        }
        (fx as any).transactions = [...((fx as any).transactions ?? []), ...tx];
        (fx as any).debts = [{
            id: 'bail', name: 'Bail auto', category: 'Car', kind: 'auto-lease',
            balance: 30161.54, interestRate: 0, minimumPayment: 700,
            startDate: '2026-01-12', termEndDate: '2029-12-12', paymentFrequency: 'weekly',
            balanceAsOf: jour(dep), paymentPayee: 'Credit-bail Auto Nord',
        }];
        act(() => { useFinanceStore.getState().enableTestMode(fx, persona.id); });
        const state = useFinanceStore.getState() as unknown as AppState;
        const derived = renderHook(() => useDerivedFinancials(state));
        const { result } = renderHook(() => useSimulationParams(derived.result.current.calculatedMonthlySavings));
        const mcp = buildSimulationParamsFromState(state, { startYear: result.current.startYear, startMonth: result.current.startMonth });

        const soldeHook = (result.current.params.debts as any[])[0].balance;
        const soldeMcp = (mcp.debts as any[])[0].balance;
        expect(soldeHook).toBe(soldeMcp);
        // ⚠️ La VALEUR, pas seulement l'égalité : huit virements hebdomadaires déduits du solde
        // enregistré. Sans elle, deux chemins également figés au solde brut passeraient.
        expect(soldeHook).toBeCloseTo(30161.54 - 8 * 161.54, 2);
        // Anti-vacuité : la correction doit VRAIMENT avoir eu lieu (sinon les deux lignes
        // ci-dessus seraient vraies d'un monde où rien n'est lié).
        expect(soldeHook).toBeLessThan(30161.54);
        expect(result.current.params).toEqual(mcp);
    });
});
