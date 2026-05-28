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
        isPrimaryResidence: true,
        // Date d'achat FIXE et FUTURE (la sim démarre en 2026, cf.
        // FutureProjection.tsx:218 `startYear = 2026`). Trois raisons :
        //  1. Achat « planifié » = forcément dans le futur. Avec une date au jour
        //     même (ancien `new Date()`), `realEstateMonth.ts:115` (`m < purchaseOffset`)
        //     ne protégeait jamais le bloc immo : dès le mois 1 la ligne 147 vidait
        //     tout le CELIAPP vers les liquidités pour l'achat « imminent ». Le solde
        //     CELIAPP restait donc ~1 mois de cotisation → invisible sur la courbe,
        //     alors que la reco (flux cumulé) s'affichait quand même. Avec une date
        //     en 2030, le CELIAPP s'accumule ~4 ans puis sert à l'achat (vrai rôle
        //     du FHSA : croissance à l'abri de l'impôt, retrait non imposable).
        //  2. Déterminisme (cf. projection.ts D2.3) : plus de dépendance à l'horloge.
        //  3. `getMonthOffset` lit `purchaseDate` ; une string valide évite le crash
        //     `.slice` sur undefined vu en mode test.
        purchaseDate: '2030-06-01',
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
