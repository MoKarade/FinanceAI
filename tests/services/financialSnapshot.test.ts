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

    it('[INCOME-3WAY-SPLIT] revenu = moyenne RÉELLE des transactions (même base que Budget), PAS le salaire d\'onboarding', () => {
        // Discriminant : l'ancien code rendait Σ netSalary (4000 ici) quel que soit le réel des
        // transactions. Désormais : mois pleins présents → moyenne des catégories de revenu
        // (2000 + 300 = 2300 sur 1 mois plein), provenance étiquetée 'transactions'.
        const base = state('karim-immigre');
        const now = new Date();
        const d = new Date(now.getFullYear(), now.getMonth() - 1, 10).toISOString().split('T')[0];
        base.config.users[0] = { ...base.config.users[0], netSalary: 4000 };
        base.transactions = [
            { id: -101, date: d, payee: 'ROBOVIC', amount: 2000, category: 'Salaire', accountName: 'Desjardins', status: 'processed', isTransfer: false, isDuplicate: false },
            { id: -102, date: d, payee: 'Interac', amount: 300, category: 'Revenus divers', accountName: 'Desjardins', status: 'processed', isTransfer: false, isDuplicate: false },
            // positif NON-revenu → exclu
            { id: -103, date: d, payee: 'Magasin', amount: 500, category: 'Remboursement', accountName: 'Desjardins', status: 'processed', isTransfer: false, isDuplicate: false },
        ];
        const snap = buildFinancialSnapshot(base);
        expect(snap.monthlyIncome).toBe(2300);           // réel, remboursement exclu — PAS 4000 ni 2800
        expect(snap.monthlyIncomeSource).toBe('transactions');
    });

    it('[INCOME-3WAY-SPLIT] sans mois plein de transactions → repli sur le salaire déclaré, ÉTIQUETÉ', () => {
        const base = state('karim-immigre');
        base.config.users[0] = { ...base.config.users[0], netSalary: 4000 };
        base.transactions = []; // aucun historique → le déclaré est le seul chiffre honnête
        const snap = buildFinancialSnapshot(base);
        expect(snap.monthlyIncome).toBe(4000);
        expect(snap.monthlyIncomeSource).toBe('declared'); // le prompt IA étiquette « (salaire déclaré) »
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
    it('[INCOME-3WAY-SPLIT suivi panel] monthlyCashflow partage la base de revenu de monthlyIncome (réelle)', () => {
        // Discriminant (finding financial-integrity, lot 2026-07-17) : l'ancien cashflow restait sur
        // budget.savings (Σ netSalary DÉCLARÉ) → avec réel 2300 / déclaré 4000 / budget vide, le payload
        // MCP livrait monthlyIncome:2300 + monthlyCashflow:4000, non reconstructible (2300 − 0 ≠ 4000).
        const base = state('karim-immigre');
        const now = new Date();
        const d = new Date(now.getFullYear(), now.getMonth() - 1, 10).toISOString().split('T')[0];
        base.config.users[0] = { ...base.config.users[0], netSalary: 4000 };
        base.transactions = [
            { id: -111, date: d, payee: 'ROBOVIC', amount: 2000, category: 'Salaire', accountName: 'Desjardins', status: 'processed', isTransfer: false, isDuplicate: false },
            { id: -112, date: d, payee: 'Interac', amount: 300, category: 'Revenus divers', accountName: 'Desjardins', status: 'processed', isTransfer: false, isDuplicate: false },
        ];
        base.budgetItems = [];
        const o = buildFinancialOverview(base);
        expect(o.monthlyIncome).toBe(2300);
        expect(o.monthlyExpenses).toBe(0);
        expect(o.monthlyCashflow).toBe(2300); // = max(0, monthlyIncome − monthlyExpenses), PAS 4000
    });

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
