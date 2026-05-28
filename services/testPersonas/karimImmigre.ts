// services/testPersonas/karimImmigre.ts
//
// Persona « Karim, 34 ans » — seul, aisé, immigré français récent (arrivé 2022).
// Haut revenu (tech), épargne agressive, vise l'indépendance financière à 50 ans.
// Teste la fiscalité d'un nouvel arrivant : droits CELI/REER limités depuis
// l'arrivée et PSV au prorata des années de résidence (flag isImmigrant).

import type { AppState, BudgetConfig, User } from '../../types';
import { buildPersonaTransactions } from './transactions';
import { emptyCollections, genHistory } from './_shared';

const karim: User = {
    name: 'Karim (test)', grossSalary: 9200, netSalary: 6400, color: '#06b6d4',
    age: 34, birthYear: 1992, canadaArrivalYear: 2022, isImmigrant: true,
    hasOwnedPropertyLast4Years: false,
};

export function buildKarimImmigre(): Partial<AppState> {
    return {
        config: { users: [karim] as unknown as BudgetConfig['users'], splitMode: '50/50' },
        budgetItems: [
            { id: 'kar-b1', name: 'Loyer (condo)', target: 1750, nature: 'Logement', frequency: 'Monthly' },
            { id: 'kar-b2', name: 'Épicerie', target: 500, nature: 'Alimentation', frequency: 'Monthly' },
            { id: 'kar-b3', name: 'Restaurants', target: 400, nature: 'Alimentation', frequency: 'Monthly' },
            { id: 'kar-b4', name: 'Transport', target: 200, nature: 'Transport', frequency: 'Monthly' },
            { id: 'kar-b5', name: 'Loisirs', target: 300, nature: 'Loisirs', frequency: 'Monthly' },
            { id: 'kar-b6', name: 'Abonnements', target: 120, nature: 'Autre', frequency: 'Monthly' },
            { id: 'kar-b7', name: 'Voyages annuels', target: 7000, nature: 'Loisirs', frequency: 'Yearly' },
            { id: 'kar-b8', name: 'CELI', target: 1000, nature: 'Épargne', frequency: 'Monthly' },
            { id: 'kar-b9', name: 'REER', target: 800, nature: 'Épargne', frequency: 'Monthly' },
        ] as unknown as AppState['budgetItems'],
        assets: [
            {
                id: 'kar-a1', symbol: 'VFV.TO', name: 'Vanguard S&P 500 (CAD)', region: 'us-equity',
                sector: 'index', accountType: 'CELI', currentPrice: 182.18,
                priceHistory: genHistory(160.0, 182.18),
                purchases: [{ date: '2023-01-15', price: 160.0, quantity: 110 }],
                dateBought: '2023-01-15', buyPrice: 160.0, quantity: 110,
            },
            {
                id: 'kar-a2', symbol: 'VEQT.TO', name: 'Vanguard All-Equity', region: 'global',
                sector: 'index', accountType: 'REER', currentPrice: 59.19,
                priceHistory: genHistory(50.0, 59.19),
                purchases: [{ date: '2023-03-01', price: 50.0, quantity: 253 }],
                dateBought: '2023-03-01', buyPrice: 50.0, quantity: 253,
            },
            {
                id: 'kar-a3', symbol: 'XEQT.TO', name: 'iShares All-Equity', region: 'global',
                sector: 'index', accountType: 'NON-ENREG', currentPrice: 43.82,
                priceHistory: genHistory(38.0, 43.82),
                purchases: [{ date: '2023-06-10', price: 38.0, quantity: 570 }],
                dateBought: '2023-06-10', buyPrice: 38.0, quantity: 570,
            },
            {
                id: 'kar-a4', symbol: 'BTC-CAD', name: 'Bitcoin', region: 'crypto',
                sector: 'crypto', accountType: 'CRYPTO', currentPrice: 106951.52,
                priceHistory: genHistory(95000.0, 106951.52),
                purchases: [{ date: '2024-02-01', price: 95000.0, quantity: 0.075 }],
                dateBought: '2024-02-01', buyPrice: 95000.0, quantity: 0.075,
            },
        ] as unknown as AppState['assets'],
        // Cash uniquement ; les comptes investis (CELI 20k, REER 15k, NonReg 25k,
        // Crypto 8k) sont portés par `assets` ci-dessus (pas de double-comptage).
        initialBalances: { CELI: 0, REER: 0, 'NON-ENREG': 0, CRYPTO: 0, LIQUIDITE: 14000 },
        transactions: buildPersonaTransactions({
            incomes: [{ payee: 'Shopify - Dépôt paie', netBiweekly: 3200 }],
            housing: { label: 'Loyer - Condo Griffintown', monthly: 1750 },
            recurring: [
                { payee: 'Hydro-Québec - Facture', amount: 75, category: 'Logement', dayOfMonth: 6 },
                { payee: 'Bell Internet Fibe', amount: 95, category: 'Logement', dayOfMonth: 10 },
                { payee: 'Abonnements (Spotify, gym, SaaS)', amount: 120, category: 'Autre', dayOfMonth: 14 },
            ],
            transfers: [
                { payee: 'Virement CELI - Wealthsimple', amount: 1000 },
                { payee: 'Virement REER - Wealthsimple', amount: 800 },
            ],
            groceries: { merchants: ['Metro', 'Provigo', 'Marché Jean-Talon'], perMonth: 7, avg: 70 },
            dining: { merchants: ['Resto Damas', 'Tim Hortons', 'Sushi Shop', 'Foodora'], perMonth: 9, avg: 42 },
            transport: { perMonth: 2, avg: 90, label: 'Communauto' },
        }, 202),
        debts: [],
        retirementGoal: { targetAge: 50, targetMonthlyIncome: 6000, governmentPension: 1200, dbPensionMonthly: 0, lifeExpectancy: 92 } as unknown as AppState['retirementGoal'],
        realEstateGoals: [],
        childGoals: [],
        travelGoals: [
            { id: 'kar-tr1', destination: 'Japon', date: '2027-10-01', totalCost: 9000, image: '🇯🇵' },
        ] as unknown as AppState['travelGoals'],
        lifeEvents: [],
        financialGoals: [
            { id: 'kar-fg1', name: 'Indépendance financière (1 M$)', target: 1000000, current: 68000, accountType: 'NON-ENREG', deadline: '2042-12-31' },
        ] as unknown as AppState['financialGoals'],
        ...emptyCollections(),
    };
}
