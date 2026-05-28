import { describe, it, expect } from 'vitest';
import { TEST_PERSONAS } from '../../services/testPersonas';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionResult } from '../../services/projection/types';
import type { AppState, BudgetConfig, BudgetCategory } from '../../types';

// ---------------------------------------------------------------------------
// Mappe un persona (Partial<AppState>) vers des SimulationParams minimaux pour
// le faire passer dans le moteur (réplique l'essentiel de FutureProjection.tsx).
// ---------------------------------------------------------------------------

function monthlyExpensesFromBudget(items: BudgetCategory[] | undefined): number {
    if (!items) return 0;
    return items.reduce((sum, b) => {
        const t = Number(b.target) || 0;
        if (b.frequency === 'Yearly') return sum + t / 12;
        if (b.frequency === 'Weekly') return sum + (t * 52) / 12;
        if (b.frequency === 'Quarterly') return sum + t / 3;
        return sum + t; // Monthly
    }, 0);
}

function paramsFromPersona(state: Partial<AppState>): SimulationParams {
    const config = state.config as BudgetConfig;
    const users = (config?.users ?? []).filter(Boolean);
    const grossMonthly = users.reduce((s, u) => s + (Number(u?.grossSalary) || 0), 0);
    const netMonthly = users.reduce((s, u) => s + (Number(u?.netSalary) || 0), 0);
    const bal = (state.initialBalances ?? {}) as unknown as Record<string, number>;

    return {
        projection: {
            years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual',
            manualContribution: 1000, usePortfolioRate: false,
            returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
            emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
        },
        calculatedStartingCash: Number(bal.LIQUIDITE) || 0,
        liveCSVBalances: {
            CELI: Number(bal.CELI) || 0,
            CELIAPP: 0,
            REER: Number(bal.REER) || 0,
            NON_ENREG: Number(bal['NON-ENREG']) || 0,
            CRYPTO: Number(bal.CRYPTO) || 0,
            REEE: 0,
        },
        realEstateGoals: state.realEstateGoals ?? [],
        debts: state.debts ?? [],
        childGoals: state.childGoals ?? [],
        travelGoals: state.travelGoals ?? [],
        lifeEvents: state.lifeEvents ?? [],
        retirementGoal: state.retirementGoal!,
        config,
        baseGrossAnnual: grossMonthly * 12,
        baseNetAnnual: netMonthly * 12,
        currentRentExpense: 1500,
        baseMonthlyExpenses: monthlyExpensesFromBudget(state.budgetItems),
        startYear: 2026,
        startMonth: 0,
    } as SimulationParams;
}

describe('TEST_PERSONAS', () => {
    it('expose 7 personas avec des id uniques', () => {
        expect(TEST_PERSONAS.length).toBe(7);
        const ids = TEST_PERSONAS.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('chaque persona a label, emoji, tagline et description non vides', () => {
        for (const p of TEST_PERSONAS) {
            expect(p.emoji.length).toBeGreaterThan(0);
            expect(p.label.length).toBeGreaterThan(0);
            expect(p.tagline.length).toBeGreaterThan(0);
            expect(p.description.length).toBeGreaterThan(20);
        }
    });

    it('un persona à 1 seul utilisateur ne génère AUCUN revenu pour user 2 (IncomeAnna=0)', () => {
        for (const persona of TEST_PERSONAS) {
            const state = persona.build();
            const users = ((state.config as BudgetConfig)?.users ?? []).filter(Boolean);
            if (users.length !== 1) continue;
            const result = calculateFutureProjection(paramsFromPersona(state));
            const base = (result.allResults as ProjectionResult[]).find((r) => r.stratType === 'BASE')!;
            const maxIncomeAnna = Math.max(...base.chartData.map((d) => Number(d.IncomeAnna) || 0));
            expect(maxIncomeAnna, `${persona.label} ne devrait pas avoir de revenu user 2`).toBe(0);
        }
    });

    for (const persona of TEST_PERSONAS) {
        describe(`${persona.emoji} ${persona.label}`, () => {
            const state = persona.build();

            it('produit un AppState cohérent (users + budget + transactions)', () => {
                const config = state.config as BudgetConfig;
                const users = (config?.users ?? []).filter(Boolean);
                expect(users.length).toBeGreaterThanOrEqual(1);
                for (const u of users) {
                    expect(Number.isFinite(Number(u?.grossSalary))).toBe(true);
                    expect(Number.isFinite(Number(u?.netSalary))).toBe(true);
                }
                expect((state.budgetItems ?? []).length).toBeGreaterThan(0);
                expect((state.transactions ?? []).length).toBeGreaterThan(0);
            });

            it('chaque dette a une catégorie valide et un solde positif', () => {
                const valid = new Set(['CreditCard', 'Car', 'Student', 'Personal', 'Other']);
                for (const d of state.debts ?? []) {
                    expect(valid.has(d.category)).toBe(true);
                    expect(d.balance).toBeGreaterThanOrEqual(0);
                    expect(d.minimumPayment).toBeGreaterThan(0);
                }
            });

            it('passe dans le moteur de projection sans NaN (patrimoine fini)', () => {
                const result: ProjectionResult = calculateFutureProjection(paramsFromPersona(state));
                const scenarios = result.allResults as ProjectionResult[];
                const base = scenarios.find((r) => r.stratType === 'BASE');
                expect(base).toBeDefined();
                expect(Number.isFinite(base!.estateNetWorth)).toBe(true);
                for (const d of base!.chartData) {
                    expect(Number.isFinite(d.NetWorth)).toBe(true);
                }
            });
        });
    }
});
