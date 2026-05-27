// tests/utils/useDerivedFinancials.test.tsx
// Couverture de useDerivedFinancials : calcul du patrimoine global,
// revenu annuel brut, épargne mensuelle, ventilation par compte.

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDerivedFinancials } from '../../utils/useDerivedFinancials';
import type { AppState } from '../../types';

// ── Fixture de base ──────────────────────────────────────────────────────────

const makeState = (overrides: Partial<AppState> = {}): AppState => ({
    transactions: [],
    assets: [],
    investmentTransactions: [],
    investmentAccounts: [],
    budgetItems: [],
    config: {
        users: [
            { name: 'Marc', grossSalary: 6000, netSalary: 4200, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991 },
            { name: 'Anna', grossSalary: 5000, netSalary: 3500, color: '#3b82f6', age: 34, birthYear: 1992, canadaArrivalYear: 1992 },
        ],
        splitMode: '50/50',
    },
    projection: {
        years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual',
        manualContribution: 1000, usePortfolioRate: false,
        returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
    },
    realEstateGoals: [],
    childGoals: [],
    savingsGoals: [],
    debts: [],
    travelGoals: [],
    lifeEvents: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 4000, governmentPension: 1200 },
    financialGoals: [],
    initialBalances: {},
    apiKeys: { anthropic: '', finnhub: '' },
    fxRates: { USD: 1.40, EUR: 1.47, CAD: 1.00 },
    lastUpdate: 0,
    categorizationRules: [],
    aiConversation: [],
    ...overrides,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useDerivedFinancials', () => {
    it('calcule le revenu annuel brut combiné des deux utilisateurs', () => {
        // Arrange — Marc 6000/mois × 12 + Anna 5000/mois × 12 = 132000
        const state = makeState();

        // Act
        const { result } = renderHook(() => useDerivedFinancials(state));

        // Assert
        expect(result.current.baseGrossAnnual).toBe(132000);
    });

    it('globalNetWorth = soldes initiaux + transactions non-dupliquées + investissements', () => {
        // Arrange — solde initial 10000, transaction -1000, asset 5 × 200$ USD (×1.40 = 1400$)
        const state = makeState({
            initialBalances: { celi: 10000 },
            transactions: [
                { id: 1, date: '2026-01-10', payee: 'Loyer', amount: -1000, category: 'Logement', isTransfer: false, isDuplicate: false, status: 'processed', originalCategory: '' },
                { id: 2, date: '2026-01-11', payee: 'Transfer', amount: 500, category: '', isTransfer: true, isDuplicate: false, status: 'processed', originalCategory: '' },
            ],
            assets: [
                { symbol: 'AAPL', name: 'Apple', quantity: 5, currency: 'USD', currentPrice: 200, performance: 0, dateBought: '' },
            ],
        });

        // Act
        const { result } = renderHook(() => useDerivedFinancials(state));

        // Assert — 10000 + (-1000) + 5×200×1.40 = 9000 + 1400 = 10400
        expect(result.current.globalNetWorth).toBeCloseTo(10400, 2);
    });

    it('les transactions isTransfer sont exclues du globalNetWorth', () => {
        // Arrange
        const state = makeState({
            initialBalances: { celi: 5000 },
            transactions: [
                { id: 1, date: '2026-01-10', payee: 'Virement', amount: 3000, category: '', isTransfer: true, isDuplicate: false, status: 'processed', originalCategory: '' },
            ],
        });

        // Act
        const { result } = renderHook(() => useDerivedFinancials(state));

        // Assert — le virement n'est pas compté
        expect(result.current.globalNetWorth).toBe(5000);
    });

    it('calculatedMonthlySavings = revenu net - dépenses hors épargne', () => {
        // Arrange — revenus nets 4200+3500=7700, loyer 1500, épicerie 600 (non-Epargne)
        const state = makeState({
            budgetItems: [
                { id: 'b1', name: 'Loyer', target: 1500, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
                { id: 'b2', name: 'Épicerie', target: 600, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
                { id: 'b3', name: 'CELI', target: 500, frequency: 'Monthly', type: 'Commun', nature: 'Epargne' },
            ],
        });

        // Act
        const { result } = renderHook(() => useDerivedFinancials(state));

        // Assert — (4200+3500) - (1500+600) = 7700 - 2100 = 5600 (CELI/Epargne exclu)
        expect(result.current.calculatedMonthlySavings).toBe(5600);
    });

    it('ventile les actifs par type de compte', () => {
        // Arrange
        const state = makeState({
            assets: [
                { symbol: 'VFV', name: 'REER ETF', quantity: 100, currency: 'CAD', currentPrice: 50, performance: 0, dateBought: '', accountType: 'REER' },
                { symbol: 'XEQT', name: 'CELI ETF', quantity: 200, currency: 'CAD', currentPrice: 30, performance: 0, dateBought: '', accountType: 'CELI' },
                { symbol: 'BRK', name: 'Non-enreg', quantity: 10, currency: 'USD', currentPrice: 400, performance: 0, dateBought: '', accountType: 'NON-ENREG' },
            ],
        });

        // Act
        const { result } = renderHook(() => useDerivedFinancials(state));

        // Assert
        expect(result.current.assetBreakdown.reer).toBeCloseTo(5000, 0);   // 100×50×1
        expect(result.current.assetBreakdown.celi).toBeCloseTo(6000, 0);   // 200×30×1
        expect(result.current.assetBreakdown.nonReg).toBeCloseTo(5600, 0); // 10×400×1.40
        expect(result.current.assetBreakdown.reee).toBe(0);
    });

    it('currentLiquidity = soldes initiaux + transactions non-dupliquées (sans actifs)', () => {
        // Arrange
        const state = makeState({
            initialBalances: { celi: 20000, cash: 5000 },
            transactions: [
                { id: 1, date: '2026-02-01', payee: 'Dépense', amount: -3000, category: 'Loisirs', isTransfer: false, isDuplicate: false, status: 'processed', originalCategory: '' },
            ],
        });

        // Act
        const { result } = renderHook(() => useDerivedFinancials(state));

        // Assert — 25000 - 3000 = 22000
        expect(result.current.currentLiquidity).toBe(22000);
    });

    it('calculatedMonthlySavings vaut 0 quand les dépenses dépassent le revenu', () => {
        // Arrange — revenu net 1000, dépenses 5000
        const state = makeState({
            config: {
                users: [
                    { name: 'Test', grossSalary: 1200, netSalary: 1000, color: '#000', age: 30, birthYear: 1996, canadaArrivalYear: 1996 },
                    { name: 'Conjoint', grossSalary: 0, netSalary: 0, color: '#fff', age: 30, birthYear: 1996, canadaArrivalYear: 1996 },
                ],
                splitMode: '50/50' as const,
            },
            budgetItems: [
                { id: 'b1', name: 'Loyer cher', target: 5000, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
            ],
        });

        // Act
        const { result } = renderHook(() => useDerivedFinancials(state));

        // Assert — Math.max(0, ...) garantit ≥ 0
        expect(result.current.calculatedMonthlySavings).toBe(0);
    });
});
