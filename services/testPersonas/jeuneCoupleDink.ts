// services/testPersonas/jeuneCoupleDink.ts
//
// Persona « Maya & Liam, ~29 ans » — jeune couple sans enfants (DINK).
// Deux revenus moyens-bons, locataires, épargnent fort pour un premier achat
// dans ~3 ans (achat FUTUR daté 2030). Teste le CELIAPP des deux conjoints,
// le RAP et l'accumulation pré-achat (FHSA visible jusqu'à l'achat).

import type { AppState, User } from '../../types';
import { buildPersonaTransactions } from './transactions';
import { emptyCollections, genHistory } from './_shared';

const maya: User = {
    name: 'Maya (test)', grossSalary: 5000, netSalary: 3600, color: '#14b8a6',
    age: 29, birthYear: 1997, canadaArrivalYear: 1997, hasOwnedPropertyLast4Years: false,
};
const liam: User = {
    name: 'Liam (test)', grossSalary: 5400, netSalary: 3850, color: '#a855f7',
    age: 30, birthYear: 1996, canadaArrivalYear: 1996, hasOwnedPropertyLast4Years: false,
};

export function buildJeuneCoupleDink(): Partial<AppState> {
    return {
        config: { users: [maya, liam], splitMode: '50/50' },
        budgetItems: [
            { id: 'jc-b1', name: 'Loyer', target: 1600, nature: 'Logement', frequency: 'Monthly' },
            { id: 'jc-b2', name: 'Épicerie', target: 600, nature: 'Alimentation', frequency: 'Monthly' },
            { id: 'jc-b3', name: 'Restaurants', target: 350, nature: 'Alimentation', frequency: 'Monthly' },
            { id: 'jc-b4', name: 'Transport', target: 250, nature: 'Transport', frequency: 'Monthly' },
            { id: 'jc-b5', name: 'Loisirs', target: 350, nature: 'Loisirs', frequency: 'Monthly' },
            { id: 'jc-b6', name: 'Abonnements', target: 120, nature: 'Autre', frequency: 'Monthly' },
            { id: 'jc-b7', name: 'Voyages annuels', target: 5000, nature: 'Loisirs', frequency: 'Yearly' },
            { id: 'jc-b8', name: 'Épargne achat (CELIAPP)', target: 1500, nature: 'Épargne', frequency: 'Monthly' },
        ] as unknown as AppState['budgetItems'],
        assets: [
            {
                id: 'jc-a1', symbol: 'VFV.TO', name: 'Vanguard S&P 500 (CAD)', region: 'us-equity',
                sector: 'index', accountType: 'CELI', currentPrice: 182.18,
                priceHistory: genHistory(155.0, 182.18),
                purchases: [{ date: '2023-04-01', price: 155.0, quantity: 70 }],
                dateBought: '2023-04-01', buyPrice: 155.0, quantity: 70,
            },
            {
                id: 'jc-a2', symbol: 'XEQT.TO', name: 'iShares All-Equity', region: 'global',
                sector: 'index', accountType: 'NON-ENREG', currentPrice: 43.82,
                priceHistory: genHistory(36.0, 43.82),
                purchases: [{ date: '2023-08-01', price: 36.0, quantity: 200 }],
                dateBought: '2023-08-01', buyPrice: 36.0, quantity: 200,
            },
        ] as unknown as AppState['assets'],
        initialBalances: { CELI: 14000, REER: 6000, 'NON-ENREG': 9000, CRYPTO: 1500, LIQUIDITE: 18000 },
        transactions: buildPersonaTransactions({
            incomes: [
                { payee: 'Agence Pub - Paie', netBiweekly: 1800 },
                { payee: 'Polytechnique - Paie', netBiweekly: 1925 },
            ],
            housing: { label: 'Loyer - Plateau Mont-Royal', monthly: 1600 },
            recurring: [
                { payee: 'Hydro-Québec - Facture', amount: 90, category: 'Logement', dayOfMonth: 6 },
                { payee: 'Fizz Internet', amount: 50, category: 'Logement', dayOfMonth: 10 },
                { payee: 'Abonnements (streaming, gym)', amount: 120, category: 'Autre', dayOfMonth: 14 },
            ],
            transfers: [{ payee: 'Virement CELIAPP - Wealthsimple', amount: 1500 }],
            debtPayments: [{ payee: 'Prêt auto - Paiement', amount: 220 }],
            groceries: { merchants: ['Provigo', 'Metro', 'Marché Atwater'], perMonth: 7, avg: 75 },
            dining: { merchants: ['Resto végé', 'Tim Hortons', 'Sushi Shop', 'Brasserie locale'], perMonth: 8, avg: 40 },
            transport: { perMonth: 2, avg: 85, label: 'Communauto + STM' },
        }, 505),
        debts: [
            { id: 'jc-d1', name: 'Prêt auto (test)', balance: 9000, interestRate: 5.5, minimumPayment: 220, category: 'Car', kind: 'auto', amortizationYears: 4 },
        ],
        retirementGoal: { targetAge: 60, targetMonthlyIncome: 5500, governmentPension: 2600, dbPensionMonthly: 0, lifeExpectancy: 92 } as unknown as AppState['retirementGoal'],
        realEstateGoals: [
            {
                id: 'jc-re1', name: 'Premier condo (test)', price: 480000, downPayment: 96000,
                rate: 4.5, mortgageRate: 4.5, amortization: 25, isActive: true,
                isPrimaryResidence: true,
                // Achat FUTUR (~4 ans après startYear 2026) → le CELIAPP s'accumule
                // jusqu'à l'achat puis sert à la mise de fonds (vrai rôle du FHSA).
                purchaseDate: '2030-06-01',
                propertyGrowthRate: 3.0, monthlyTaxes: 300, monthlyInsurance: 90,
                monthlyMaintenance: 220, totalClosingCosts: 9000,
                monthlyPayment: 2100, isFirstTimeBuyer: true, isNewConstruction: false,
            },
        ] as unknown as AppState['realEstateGoals'],
        childGoals: [],
        travelGoals: [
            { id: 'jc-tr1', destination: 'Thaïlande', date: '2027-02-01', totalCost: 7000, image: '🇹🇭' },
        ] as unknown as AppState['travelGoals'],
        lifeEvents: [],
        financialGoals: [
            { id: 'jc-fg1', name: 'Mise de fonds maison', target: 96000, current: 18000, accountType: 'CELIAPP', deadline: '2030-06-01' },
        ] as unknown as AppState['financialGoals'],
        ...emptyCollections(),
    };
}
