// services/testPersonas/autonomeMonoparentale.ts
//
// Persona « Nadia, 42 ans » — travailleuse autonome, monoparentale (1 enfant).
// Revenu variable, pas de REER d'employeur (cotise elle-même), frais pro,
// assurances payées de sa poche. Teste le revenu irrégulier, le REER
// auto-cotisé et la situation monoparentale (1 seul revenu + enfant).

import type { AppState, BudgetConfig, User } from '../../types';
import { buildPersonaTransactions } from './transactions';
import { emptyCollections, genHistory } from './_shared';

const nadia: User = {
    name: 'Nadia (test)', grossSalary: 6250, netSalary: 4200, color: '#f59e0b',
    age: 42, birthYear: 1984, canadaArrivalYear: 1984, hasOwnedPropertyLast4Years: false,
};

export function buildAutonomeMonoparentale(): Partial<AppState> {
    return {
        config: { users: [nadia] as unknown as BudgetConfig['users'], splitMode: '50/50' },
        budgetItems: [
            { id: 'na-b1', name: 'Loyer', target: 1500, nature: 'Logement', frequency: 'Monthly' },
            { id: 'na-b2', name: 'Épicerie', target: 600, nature: 'Alimentation', frequency: 'Monthly' },
            { id: 'na-b3', name: 'Restaurants', target: 200, nature: 'Alimentation', frequency: 'Monthly' },
            { id: 'na-b4', name: 'Transport', target: 300, nature: 'Transport', frequency: 'Monthly' },
            { id: 'na-b5', name: 'Loisirs + activités enfant', target: 250, nature: 'Loisirs', frequency: 'Monthly' },
            { id: 'na-b6', name: 'Frais professionnels', target: 400, nature: 'Autre', frequency: 'Monthly' },
            { id: 'na-b7', name: 'Assurances (santé + invalidité)', target: 250, nature: 'Santé', frequency: 'Monthly' },
            { id: 'na-b8', name: 'REER (auto-cotisé)', target: 500, nature: 'Épargne', frequency: 'Monthly' },
        ] as unknown as AppState['budgetItems'],
        assets: [
            {
                id: 'na-a1', symbol: 'VEQT.TO', name: 'Vanguard All-Equity', region: 'global',
                sector: 'index', accountType: 'REER', currentPrice: 59.19,
                priceHistory: genHistory(45.0, 59.19),
                purchases: [{ date: '2021-02-01', price: 45.0, quantity: 473 }],
                dateBought: '2021-02-01', buyPrice: 45.0, quantity: 473,
            },
            {
                id: 'na-a2', symbol: 'VFV.TO', name: 'Vanguard S&P 500 (CAD)', region: 'us-equity',
                sector: 'index', accountType: 'CELI', currentPrice: 182.18,
                priceHistory: genHistory(150.0, 182.18),
                purchases: [{ date: '2022-07-01', price: 150.0, quantity: 60 }],
                dateBought: '2022-07-01', buyPrice: 150.0, quantity: 60,
            },
        ] as unknown as AppState['assets'],
        // Cash uniquement ; CELI 11k + REER 28k portés par `assets`. Le NonReg
        // résiduel est regroupé dans le cash.
        initialBalances: { CELI: 0, REER: 0, 'NON-ENREG': 0, CRYPTO: 0, LIQUIDITE: 13000 },
        transactions: buildPersonaTransactions({
            incomes: [{ payee: 'Honoraires clients (virement)', netBiweekly: 2100 }],
            housing: { label: 'Loyer - Rosemont', monthly: 1500 },
            recurring: [
                { payee: 'Hydro-Québec - Facture', amount: 85, category: 'Logement', dayOfMonth: 6 },
                { payee: 'Assurance santé + invalidité', amount: 250, category: 'Santé', dayOfMonth: 9 },
                { payee: 'Comptable + logiciels pro', amount: 180, category: 'Autre', dayOfMonth: 13 },
            ],
            transfers: [{ payee: 'Virement REER - Questrade', amount: 500 }],
            debtPayments: [{ payee: 'Marge pro - Intérêts', amount: 120 }],
            groceries: { merchants: ['IGA', 'Maxi', 'Provigo'], perMonth: 8, avg: 78 },
            dining: { merchants: ['Café du coin', 'Tim Hortons', 'St-Hubert'], perMonth: 5, avg: 30 },
            transport: { perMonth: 3, avg: 70, label: 'Station Esso' },
        }, 606),
        debts: [
            { id: 'na-d1', name: 'Marge de crédit pro (test)', balance: 5000, interestRate: 9, minimumPayment: 120, category: 'Other', kind: 'personal' },
        ],
        retirementGoal: { targetAge: 64, targetMonthlyIncome: 4200, governmentPension: 1700, dbPensionMonthly: 0, lifeExpectancy: 92 } as unknown as AppState['retirementGoal'],
        realEstateGoals: [],
        childGoals: [
            {
                id: 'na-child1', name: 'Mila (test)', birthDate: '2014-09-10',
                daycareType: 'cpe', schoolType: 'publique', activitiesLevel: 'legeres',
                universityType: 'uni_local', carGift: 'usagee',
                monthlyDiapers: 0, monthlyFood: 300, monthlyClothing: 100,
                respContribution: 1500, governmentBenefits: 300, initialCost: 0,
            },
        ] as unknown as AppState['childGoals'],
        travelGoals: [
            { id: 'na-tr1', destination: 'Floride (Disney)', date: '2027-03-01', totalCost: 6000, image: '🎢' },
        ] as unknown as AppState['travelGoals'],
        lifeEvents: [],
        financialGoals: [
            { id: 'na-fg1', name: 'REER autonome 100 k$', target: 100000, current: 28000, accountType: 'REER', deadline: '2040-12-31' },
        ] as unknown as AppState['financialGoals'],
        ...emptyCollections(),
    };
}
