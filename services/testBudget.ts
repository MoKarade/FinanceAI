// services/testBudget.ts
//
// Budget, immobilier et dettes pour le mode test.
// Extrait de testFixtures.ts (DT4) — ne jamais charger au boot.

import type { BudgetCategory, Debt, RealEstateGoal } from '../types';

export const TEST_BUDGET_ITEMS: BudgetCategory[] = [
    { id: 'b1', name: 'Logement', target: 2100, nature: 'Logement', frequency: 'Monthly' },
    { id: 'b2', name: 'Épicerie', target: 850, nature: 'Alimentation', frequency: 'Monthly' },
    { id: 'b3', name: 'Restaurants', target: 250, nature: 'Alimentation', frequency: 'Monthly' },
    { id: 'b4', name: 'Transport', target: 350, nature: 'Transport', frequency: 'Monthly' },
    { id: 'b5', name: 'Loisirs', target: 200, nature: 'Loisirs', frequency: 'Monthly' },
    { id: 'b6', name: 'Santé', target: 100, nature: 'Santé', frequency: 'Monthly' },
    { id: 'b7', name: 'Abonnements', target: 80, nature: 'Autre', frequency: 'Monthly' },
    { id: 'b8', name: 'CELI', target: 800, nature: 'Épargne', frequency: 'Monthly' },
    { id: 'b9', name: 'REER', target: 600, nature: 'Épargne', frequency: 'Monthly' },
    { id: 'b10', name: 'Voyages annuels', target: 3600, nature: 'Loisirs', frequency: 'Yearly' },
] as unknown as BudgetCategory[];

export const TEST_REAL_ESTATE: RealEstateGoal[] = [
    {
        id: 're-1', name: 'Maison principale (test)', price: 450000, downPayment: 90000,
        rate: 4.5, mortgageRate: 4.5, amortization: 25, isActive: true,
        isPrimaryResidence: true, purchaseOffset: 0,
        // Fix bug Future : la projection lit `purchaseDate` via getMonthOffset
        // (services/projection.ts:170 + realEstateMonth.ts:111). Sans cette
        // date, .slice() crashe dans le Worker.
        purchaseDate: new Date().toISOString().split('T')[0],
        propertyGrowthRate: 3.0, monthlyTaxes: 280, monthlyInsurance: 95,
        monthlyMaintenance: 250, totalClosingCosts: 8000,
        monthlyPayment: 2000, isFirstTimeBuyer: false, isNewConstruction: false,
    } as unknown as RealEstateGoal,
];

export const TEST_DEBTS: Debt[] = [
    {
        id: 'd1', name: 'Carte Visa Desjardins (test)', balance: 2800,
        interestRate: 19.9, minimumPayment: 250,
        category: 'CreditCard', kind: 'credit-card',
    },
    {
        id: 'd2', name: 'Prêt auto (test)', balance: 18500,
        interestRate: 6.5, minimumPayment: 425,
        category: 'Car', kind: 'auto', amortizationYears: 5,
    },
];
