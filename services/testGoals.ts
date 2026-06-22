// services/testGoals.ts
//
// Objectifs (retraite, enfant, voyage, vie, financier) pour le mode test.
// Extrait de testFixtures.ts (DT4) — ne jamais charger au boot.

import type { ChildGoal, FinancialGoal, LifeEvent, RetirementGoal, TravelGoal } from '../types';

export const TEST_RETIREMENT: RetirementGoal = {
    targetAge: 60,
    targetMonthlyIncome: 5500,
    governmentPension: 1850,
    dbPensionMonthly: 0,
    lifeExpectancy: 92,
} as unknown as RetirementGoal;

export const TEST_CHILD_GOALS: ChildGoal[] = [
    {
        id: 'child-1', name: 'Léa (test)', birthDate: '2022-06-15',
        daycareType: 'cpe', schoolType: 'publique', activitiesLevel: 'legeres',
        universityType: 'uni_local', carGift: 'usagee',
        monthlyDiapers: 120, monthlyFood: 200, monthlyClothing: 80,
        respContribution: 2500, governmentBenefits: 450, initialCost: 2800, isActive: true,
    } as unknown as ChildGoal,
];

export const TEST_TRAVEL: TravelGoal[] = [
    { id: 'tr-1', destination: 'Italie', date: '2027-06-15', totalCost: 8500, image: '🇮🇹' } as TravelGoal,
    { id: 'tr-2', destination: 'Japon', date: '2029-04-10', totalCost: 12000, image: '🇯🇵' } as TravelGoal,
];

export const TEST_LIFE_EVENTS: LifeEvent[] = [
    { id: 'le-1', name: 'Rénovation cuisine', type: 'RENOVATION', date: '2028-05-01', impactAmount: 25000 } as unknown as LifeEvent,
];

export const TEST_FINANCIAL_GOALS: FinancialGoal[] = [
    { id: 'fg-1', name: 'Fond urgence 6 mois', target: 30000, current: 8500, accountType: 'CELI', deadline: '2027-12-31' } as unknown as FinancialGoal,
];
