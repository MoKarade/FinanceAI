// tests/services/financialSnapshot.test.ts
//
// Lot 0/1 — helper pur buildFinancialSnapshot / buildFinancialOverview.

import { describe, it, expect } from 'vitest';
import { TEST_PERSONAS } from '../../services/testPersonas';
import { normalizeAppState } from '../../mcp/state/loadAppState';
import {
    buildFinancialSnapshot,
    buildFinancialOverview,
    type FinancialSnapshot,
} from '../../services/financialSnapshot';
import type { FinancialSnapshot as ClaudeFinancialSnapshot } from '../../services/claude';

function state(id: string) {
    return normalizeAppState(TEST_PERSONAS.find((p) => p.id === id)!.build());
}

describe('buildFinancialSnapshot', () => {
    it('Karim (aisé, solo) — patrimoine net > 0, CELI/REER reflètent les actifs', () => {
        const snap = buildFinancialSnapshot(state('karim-immigre'));
        expect(snap.netWorth).toBeGreaterThan(0);
        expect(snap.celiBalance).toBeGreaterThan(15000);
        expect(snap.reerBalance).toBeGreaterThan(12000);
        expect(snap.currentAge).toBe(34);
        expect(snap.retirementAge).toBe(50);
        expect(snap.coupleMode).toBe(false);
    });

    it('Couple confort — coupleMode=true (2e utilisateur nommé)', () => {
        const snap = buildFinancialSnapshot(state('couple-confort'));
        expect(snap.coupleMode).toBe(true);
    });

    it('projectedNetWorth20y est repris des options si fourni', () => {
        const snap = buildFinancialSnapshot(state('karim-immigre'), { projectedNetWorth20y: 123456 });
        expect(snap.projectedNetWorth20y).toBe(123456);
    });

    it('structurellement compatible avec FinancialSnapshot de claude.ts', () => {
        // Compat de FORME : l'objet pur est assignable au type attendu par
        // getNextBestActions (services/claude.ts). Échoue à la compilation sinon.
        const snap = buildFinancialSnapshot(state('couple-confort'));
        const asClaude: ClaudeFinancialSnapshot = snap;
        const roundTrip: FinancialSnapshot = asClaude;
        expect(roundTrip.netWorth).toBe(snap.netWorth);
    });
});

describe('buildFinancialOverview', () => {
    it('agrège liquidités + placements + comptes + cashflow + dette', () => {
        const o = buildFinancialOverview(state('couple-dettes'));
        expect(o.currency).toBe('CAD');
        expect(o.totalDebt).toBeGreaterThan(0); // persona endetté
        expect(o.netWorth).toBeCloseTo(o.investments + o.liquidity - o.totalDebt, 2);
        expect(o.accounts).toHaveProperty('celi');
        expect(o.monthlyCashflow).toBeGreaterThanOrEqual(0); // max(0, …)
        expect(o.userCount).toBeGreaterThanOrEqual(1);
    });
});
