// services/testPersonas/leaFauchee.ts
//
// Persona « Léa, 24 ans » — seule, fauchée, début de carrière.
// Faible revenu, locataire, dette étudiante, quasi pas d'épargne. Cashflow
// tendu mais positif. Bas du spectre — teste les empty-states et le CELIAPP
// comme véhicule pour un premier achat lointain.

import type { AppState, BudgetConfig, User } from '../../types';
import { buildPersonaTransactions } from './transactions';
import { emptyCollections, genHistory } from './_shared';

const lea: User = {
    name: 'Léa (test)', grossSalary: 3200, netSalary: 2450, color: '#ec4899',
    age: 24, birthYear: 2002, canadaArrivalYear: 2002, hasOwnedPropertyLast4Years: false,
};

export function buildLeaFauchee(): Partial<AppState> {
    return {
        config: { users: [lea] as unknown as BudgetConfig['users'], splitMode: '50/50' },
        budgetItems: [
            { id: 'lea-b1', name: 'Loyer', target: 1100, nature: 'Logement', frequency: 'Monthly' },
            { id: 'lea-b2', name: 'Épicerie', target: 320, nature: 'Alimentation', frequency: 'Monthly' },
            { id: 'lea-b3', name: 'Restaurants', target: 110, nature: 'Alimentation', frequency: 'Monthly' },
            { id: 'lea-b4', name: 'Transport (STM)', target: 100, nature: 'Transport', frequency: 'Monthly' },
            { id: 'lea-b5', name: 'Loisirs', target: 70, nature: 'Loisirs', frequency: 'Monthly' },
            { id: 'lea-b6', name: 'Téléphone', target: 50, nature: 'Autre', frequency: 'Monthly' },
            { id: 'lea-b7', name: 'CELI', target: 150, nature: 'Épargne', frequency: 'Monthly' },
        ] as unknown as AppState['budgetItems'],
        // [R6] Micro-actif CELI symbolique (1 part) : ouvre les pages Investissements + Futur
        // (prérequis `assets`, non opt-outable) sans dénaturer le profil « fauchée ».
        assets: [
            { id: 'lea-a1', symbol: 'VFV.TO', name: 'Vanguard S&P 500 (CAD)', region: 'us-equity', sector: 'index', accountType: 'CELI', currency: 'CAD', performance: 0, currentPrice: 182.18, priceHistory: genHistory(170, 182.18), purchases: [{ date: '2026-01-15', price: 170, quantity: 1 }], dateBought: '2026-01-15', buyPrice: 170, quantity: 1 },
        ] as unknown as AppState['assets'],
        // Soldes = cash uniquement (LIQUIDITE) ; aucun placement. Convention
        // persona : les comptes investis (CELI/REER/NonReg/Crypto) sont portés
        // par `assets`, jamais doublés dans initialBalances (sinon le liquide
        // les recompte — cf calculatedStartingCash dans FutureProjection).
        initialBalances: { CELI: 0, REER: 0, 'NON-ENREG': 0, CRYPTO: 0, LIQUIDITE: 2700 },
        transactions: buildPersonaTransactions({
            incomes: [{ payee: 'Café Régal - Dépôt paie', netBiweekly: 1225 }],
            housing: { label: 'Loyer - Gestion Immobilière', monthly: 1100 },
            recurring: [
                { payee: 'Hydro-Québec - Facture', amount: 60, category: 'Logement', dayOfMonth: 6 },
                { payee: 'Fizz Mobile', amount: 35, category: 'Autre', dayOfMonth: 12 },
            ],
            transfers: [{ payee: 'Virement CELI - Wealthsimple', amount: 150 }],
            debtPayments: [{ payee: 'Prêt étudiant - Paiement', amount: 220 }],
            groceries: { merchants: ['Maxi', 'Super C', 'Dollarama'], perMonth: 6, avg: 52 },
            dining: { merchants: ['Tim Hortons', "McDonald's", 'Subway'], perMonth: 5, avg: 17 },
            transport: { perMonth: 1, avg: 97, label: 'STM - Passe mensuelle' },
        }, 101),
        debts: [
            { id: 'lea-d1', name: 'Prêt étudiant (test)', balance: 18000, interestRate: 5, minimumPayment: 220, category: 'Student', kind: 'student-quebec' },
        ],
        retirementGoal: { targetAge: 65, targetMonthlyIncome: 3200, governmentPension: 1600, dbPensionMonthly: 0, lifeExpectancy: 92 } as unknown as AppState['retirementGoal'],
        realEstateGoals: [],
        childGoals: [],
        travelGoals: [],
        lifeEvents: [],
        financialGoals: [
            { id: 'lea-fg1', name: 'Fonds urgence 3 mois', target: 6000, current: 1200, accountType: 'CELI', deadline: '2028-12-31' },
        ] as unknown as AppState['financialGoals'],
        // [R6] Locataire, sans enfant ni projet (a une dette étudiante) → opt-out immo/enfant/projets.
        setupOptOut: { realEstate: true, children: true, lifeProjects: true },
        ...emptyCollections(),
    };
}
