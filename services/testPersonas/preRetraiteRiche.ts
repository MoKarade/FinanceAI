// services/testPersonas/preRetraiteRiche.ts
//
// Persona « Diane & Robert, 58/60 ans » — couple riche, retraite imminente.
// Gros patrimoine enregistré (REER abondant, CELI plein), maison payée, pension
// à prestations déterminées (RREGOP) pour Diane. Teste le décaissement, le
// meltdown REER, la récupération de la PSV (clawback) et les rentes RRQ/PSV.

import type { AppState, User } from '../../types';
import { buildPersonaTransactions } from './transactions';
import { emptyCollections, genHistory } from './_shared';

const diane: User = {
    name: 'Diane (test)', grossSalary: 6500, netSalary: 4600, color: '#8b5cf6',
    age: 58, birthYear: 1968, canadaArrivalYear: 1968, hasOwnedPropertyLast4Years: true,
};
const robert: User = {
    name: 'Robert (test)', grossSalary: 5500, netSalary: 4000, color: '#0ea5e9',
    age: 60, birthYear: 1966, canadaArrivalYear: 1966, hasOwnedPropertyLast4Years: true,
};

export function buildPreRetraiteRiche(): Partial<AppState> {
    return {
        config: { users: [diane, robert], splitMode: '50/50' },
        budgetItems: [
            { id: 'pr-b1', name: 'Maison (taxes + entretien)', target: 900, nature: 'Logement', frequency: 'Monthly' },
            { id: 'pr-b2', name: 'Épicerie', target: 800, nature: 'Alimentation', frequency: 'Monthly' },
            { id: 'pr-b3', name: 'Restaurants', target: 450, nature: 'Alimentation', frequency: 'Monthly' },
            { id: 'pr-b4', name: 'Transport', target: 400, nature: 'Transport', frequency: 'Monthly' },
            { id: 'pr-b5', name: 'Loisirs', target: 600, nature: 'Loisirs', frequency: 'Monthly' },
            { id: 'pr-b6', name: 'Santé', target: 200, nature: 'Santé', frequency: 'Monthly' },
            { id: 'pr-b7', name: 'Voyages annuels', target: 12000, nature: 'Loisirs', frequency: 'Yearly' },
        ] as unknown as AppState['budgetItems'],
        assets: [
            {
                id: 'pr-a1', symbol: 'VFV.TO', name: 'Vanguard S&P 500 (CAD)', region: 'us-equity',
                sector: 'index', accountType: 'CELI', currentPrice: 182.18,
                priceHistory: genHistory(120.0, 182.18),
                purchases: [{ date: '2018-01-15', price: 120.0, quantity: 988 }],
                dateBought: '2018-01-15', buyPrice: 120.0, quantity: 988,
            },
            {
                id: 'pr-a2', symbol: 'VEQT.TO', name: 'Vanguard All-Equity', region: 'global',
                sector: 'index', accountType: 'REER', currentPrice: 59.19,
                priceHistory: genHistory(38.0, 59.19),
                purchases: [{ date: '2017-05-01', price: 38.0, quantity: 10474 }],
                dateBought: '2017-05-01', buyPrice: 38.0, quantity: 10474,
            },
            {
                id: 'pr-a3', symbol: 'XEQT.TO', name: 'iShares All-Equity', region: 'global',
                sector: 'index', accountType: 'NON-ENREG', currentPrice: 43.82,
                priceHistory: genHistory(30.0, 43.82),
                purchases: [{ date: '2019-09-10', price: 30.0, quantity: 2054 }],
                dateBought: '2019-09-10', buyPrice: 30.0, quantity: 2054,
            },
        ] as unknown as AppState['assets'],
        // Cash uniquement ; le gros patrimoine registered (CELI 180k, REER 620k,
        // NonReg 90k) est porté par `assets` ci-dessus (pas de double-comptage).
        initialBalances: { CELI: 0, REER: 0, 'NON-ENREG': 0, CRYPTO: 0, LIQUIDITE: 45000 },
        transactions: buildPersonaTransactions({
            incomes: [
                { payee: 'Commission scolaire - Paie', netBiweekly: 2300 },
                { payee: 'Hydro-Québec - Paie', netBiweekly: 2000 },
            ],
            housing: { label: 'Taxes municipales + entretien', monthly: 900 },
            recurring: [
                { payee: 'Hydro-Québec - Facture', amount: 160, category: 'Logement', dayOfMonth: 6 },
                { payee: 'Bell - Forfait', amount: 140, category: 'Autre', dayOfMonth: 10 },
                { payee: 'Assurance habitation + auto', amount: 220, category: 'Autre', dayOfMonth: 15 },
            ],
            transfers: [{ payee: 'Virement CELI - Desjardins', amount: 1000 }],
            groceries: { merchants: ['Metro', 'IGA', 'Costco'], perMonth: 8, avg: 100 },
            dining: { merchants: ['Restaurant Europea', 'St-Hubert', 'Café local'], perMonth: 8, avg: 56 },
            transport: { perMonth: 3, avg: 80, label: 'Station Shell' },
        }, 404),
        debts: [],
        retirementGoal: { targetAge: 62, targetMonthlyIncome: 7000, governmentPension: 2400, dbPensionMonthly: 2200, lifeExpectancy: 94 } as unknown as AppState['retirementGoal'],
        realEstateGoals: [],
        childGoals: [],
        travelGoals: [
            { id: 'pr-tr1', destination: 'Croisière Méditerranée', date: '2027-09-01', totalCost: 18000, image: '⛵' },
            { id: 'pr-tr2', destination: 'Portugal', date: '2029-05-01', totalCost: 11000, image: '🇵🇹' },
        ] as unknown as AppState['travelGoals'],
        lifeEvents: [],
        financialGoals: [
            { id: 'pr-fg1', name: 'Léguer 500 k$ aux enfants', target: 500000, current: 890000, accountType: 'NON-ENREG', deadline: '2055-12-31' },
        ] as unknown as AppState['financialGoals'],
        // [R6] Aucune dette / projet immo / enfant → opt-out explicite (pas de PageSetupGate sur ces pages).
        setupOptOut: { debts: true, realEstate: true, children: true },
        ...emptyCollections(),
    };
}
