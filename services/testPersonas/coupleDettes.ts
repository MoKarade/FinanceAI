// services/testPersonas/coupleDettes.ts
//
// Persona « Sophie & Marc-A., 35 ans » — couple étranglé par les dettes.
// Revenus moyens, locataires, grosses dettes toxiques (carte 22 %, prêt auto,
// marge de crédit), quasi aucune épargne. Teste le cashflow tendu/négatif, la
// stratégie debt-first et les mois de manque (shortfall).

import type { AppState, User } from '../../types';
import { buildPersonaTransactions } from './transactions';
import { emptyCollections, genHistory } from './_shared';

const sophie: User = {
    name: 'Sophie (test)', grossSalary: 3400, netSalary: 2600, color: '#f97316',
    age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false,
};
const marcA: User = {
    name: 'Marc-A. (test)', grossSalary: 4100, netSalary: 3050, color: '#ef4444',
    age: 36, birthYear: 1990, canadaArrivalYear: 1990, hasOwnedPropertyLast4Years: false,
};

export function buildCoupleDettes(): Partial<AppState> {
    return {
        // [TEST-PERSONA-FIXTURE-PARTAGEE] Les `User` sont des constantes de MODULE : les mettre
        // telles quelles dans la config faisait partager `config.users[0]` entre deux `build()`
        // — mesuré sur les SIX personas non-`couple-confort`. Le test d'identité de premier
        // niveau ne le voyait pas (le littéral `config` est neuf à chaque appel) ; seul le
        // contrôle de PROFONDEUR l'attrape (finding financial-integrity, panel PR #759).
        config: { users: structuredClone([sophie, marcA]), splitMode: '50/50' },
        budgetItems: [
            { id: 'cd-b1', name: 'Loyer', target: 1850, nature: 'Besoin', frequency: 'Monthly' },
            { id: 'cd-b2', name: 'Épicerie', target: 750, nature: 'Besoin', frequency: 'Monthly' },
            { id: 'cd-b3', name: 'Restaurants', target: 300, nature: 'Envie', frequency: 'Monthly' },
            { id: 'cd-b4', name: 'Transport (2 autos)', target: 450, nature: 'Besoin', frequency: 'Monthly' },
            { id: 'cd-b5', name: 'Loisirs', target: 200, nature: 'Envie', frequency: 'Monthly' },
            { id: 'cd-b6', name: 'Télécom + abonnements', target: 180, nature: 'Envie', frequency: 'Monthly' },
            { id: 'cd-b7', name: 'Santé', target: 90, nature: 'Besoin', frequency: 'Monthly' },
        ] as unknown as AppState['budgetItems'],
        // [R6] Micro-actif CELI symbolique (1 part) : ouvre Investissements + Futur (prérequis `assets`,
        // non opt-outable) sans dénaturer le profil « étranglé par les dettes ».
        assets: [
            { id: 'cd-a1', symbol: 'VFV.TO', name: 'Vanguard S&P 500 (CAD)', region: 'us-equity', sector: 'index', accountType: 'CELI', currency: 'CAD', performance: 0, currentPrice: 182.18, priceHistory: genHistory(175, 182.18), purchases: [{ date: '2026-01-15', price: 175, quantity: 1 }], dateBought: '2026-01-15', buyPrice: 175, quantity: 1 },
        ] as unknown as AppState['assets'],
        // Soldes = cash uniquement (LIQUIDITE). Couple endetté sans placements :
        // leurs maigres soldes registered (CELI/REER) sont du cash, regroupés ici.
        initialBalances: { CELI: 0, REER: 0, 'NON-ENREG': 0, CRYPTO: 0, LIQUIDITE: 3900 },
        transactions: buildPersonaTransactions({
            incomes: [
                { payee: 'Centre Hospitalier - Paie', netBiweekly: 1300 },
                { payee: 'Construction BL - Paie', netBiweekly: 1525 },
            ],
            housing: { label: 'Loyer - Les Habitations XYZ', monthly: 1850 },
            recurring: [
                { payee: 'Hydro-Québec - Facture', amount: 130, category: 'Logement', dayOfMonth: 6 },
                { payee: 'Vidéotron - Forfait', amount: 180, category: 'Autre', dayOfMonth: 11 },
            ],
            debtPayments: [
                { payee: 'Visa Desjardins - Paiement min.', amount: 270 },
                { payee: 'Prêt auto Scotia - Paiement', amount: 480 },
                { payee: 'Marge de crédit - Intérêts', amount: 150 },
            ],
            groceries: { merchants: ['Maxi', 'Super C', 'Costco', 'IGA'], perMonth: 9, avg: 95 },
            dining: { merchants: ['St-Hubert', 'Tim Hortons', 'Pizza Salvatoré', 'A&W'], perMonth: 7, avg: 38 },
            transport: { perMonth: 4, avg: 75, label: 'Station Esso' },
        }, 303),
        debts: [
            { id: 'cd-d1', name: 'Visa Desjardins (test)', balance: 9000, interestRate: 22.9, minimumPayment: 270, category: 'CreditCard', kind: 'credit-card' },
            { id: 'cd-d2', name: 'Prêt auto Scotia (test)', balance: 22000, interestRate: 7.5, minimumPayment: 480, category: 'Car', kind: 'auto', amortizationYears: 6 },
            { id: 'cd-d3', name: 'Marge de crédit (test)', balance: 6000, interestRate: 10.5, minimumPayment: 150, category: 'Other', kind: 'margin' },
        ],
        retirementGoal: { targetAge: 65, targetMonthlyIncome: 4500, governmentPension: 2800, dbPensionMonthly: 0, lifeExpectancy: 90 } as unknown as AppState['retirementGoal'],
        realEstateGoals: [],
        childGoals: [],
        travelGoals: [],
        lifeEvents: [],
        financialGoals: [
            { id: 'cd-fg1', name: 'Éteindre la carte de crédit', target: 9000, current: 0, accountType: 'LIQUIDITE', deadline: '2027-12-31' },
        ] as unknown as AppState['financialGoals'],
        // [R6] Locataire, sans enfant ni projet (a des dettes) → opt-out immo/enfant/projets.
        setupOptOut: { realEstate: true, children: true, lifeProjects: true },
        ...emptyCollections(),
    };
}
