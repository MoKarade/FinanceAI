// services/testPersonas/gillesActifDecaisse.ts
//
// Persona « Gilles, 71 ans » — seul, travaille encore à temps partiel, DÉCAISSE.
// Maison payée, gros REER (les retraits FERR obligatoires commencent à 72 ans, PENDANT
// qu'il travaille), un compte non-enregistré, et un budget que son salaire réduit ne
// couvre plus → retraits d'appoint chaque mois.
//
// [PERSONA-ACTIF-QUI-DECAISSE] Ce persona existe pour COUVRIR un chemin du moteur qu'aucun
// des sept autres n'exerçait : l'impôt de décembre d'un ménage ACTIF qui retire du REER ET
// détient du non-enregistré (salaire + FERR + dividendes empilés dans la même assiette).
// Mesuré au lot 87 : 0 occurrence sur 7 personas × 40 ans — c'est pour ça que deux défauts
// money-critical y ont vécu sans qu'aucun golden ne bouge. La garde qui le prouve :
// tests/services/personaActifQuiDecaisse.test.ts.

import type { AppState, BudgetConfig, User } from '../../types';
import { buildPersonaTransactions } from './transactions';
import { emptyCollections, genHistory } from './_shared';

const gilles: User = {
    name: 'Gilles (test)', grossSalary: 3000, netSalary: 2400, color: '#f59e0b',
    age: 71, birthYear: 1955, canadaArrivalYear: 1955, hasOwnedPropertyLast4Years: true,
};

export function buildGillesActifDecaisse(): Partial<AppState> {
    return {
        // [TEST-PERSONA-FIXTURE-PARTAGEE] `User` est une constante de MODULE : cloné à chaque
        // build(), sinon deux builds partagent `config.users[0]` (cf. les autres personas).
        config: { users: structuredClone([gilles]) as unknown as BudgetConfig['users'], splitMode: '50/50' },
        // Dépenses ≈ 3 100 $/mois contre 2 400 $ de net : le DÉFICIT est voulu, c'est lui qui
        // force les retraits d'appoint (en plus du minimum FERR dès 72 ans).
        budgetItems: [
            { id: 'gi-b1', name: 'Maison (taxes + entretien)', target: 700, nature: 'Besoin', frequency: 'Monthly' },
            { id: 'gi-b2', name: 'Épicerie', target: 550, nature: 'Besoin', frequency: 'Monthly' },
            { id: 'gi-b3', name: 'Restaurants', target: 250, nature: 'Envie', frequency: 'Monthly' },
            { id: 'gi-b4', name: 'Transport', target: 300, nature: 'Besoin', frequency: 'Monthly' },
            { id: 'gi-b5', name: 'Loisirs', target: 400, nature: 'Envie', frequency: 'Monthly' },
            { id: 'gi-b6', name: 'Santé', target: 250, nature: 'Besoin', frequency: 'Monthly' },
            { id: 'gi-b7', name: 'Voyages annuels', target: 8000, nature: 'Envie', frequency: 'Yearly' },
        ] as unknown as AppState['budgetItems'],
        assets: [
            {
                id: 'gi-a1', symbol: 'VFV.TO', name: 'Vanguard S&P 500 (CAD)', region: 'us-equity',
                sector: 'index', accountType: 'CELI', currentPrice: 182.18,
                priceHistory: genHistory(120.0, 182.18),
                purchases: [{ date: '2016-03-01', price: 120.0, quantity: 600 }],
                dateBought: '2016-03-01', buyPrice: 120.0, quantity: 600,
            },
            {
                id: 'gi-a2', symbol: 'VEQT.TO', name: 'Vanguard All-Equity', region: 'global',
                sector: 'index', accountType: 'REER', currentPrice: 59.19,
                priceHistory: genHistory(38.0, 59.19),
                purchases: [{ date: '2015-05-01', price: 38.0, quantity: 11800 }],
                dateBought: '2015-05-01', buyPrice: 38.0, quantity: 11800,
            },
            {
                id: 'gi-a3', symbol: 'XEQT.TO', name: 'iShares All-Equity', region: 'global',
                sector: 'index', accountType: 'NON-ENREG', currentPrice: 43.82,
                priceHistory: genHistory(30.0, 43.82),
                purchases: [{ date: '2019-09-10', price: 30.0, quantity: 4500 }],
                dateBought: '2019-09-10', buyPrice: 30.0, quantity: 4500,
            },
        ] as unknown as AppState['assets'],
        // Cash uniquement ; le patrimoine investi (CELI ~109 k$, REER ~698 k$, NonReg ~197 k$) est
        // porté par `assets` ci-dessus (pas de double-comptage, convention persona).
        initialBalances: { CELI: 0, REER: 0, 'NON-ENREG': 0, CRYPTO: 0, LIQUIDITE: 30000 },
        transactions: buildPersonaTransactions({
            incomes: [{ payee: 'Gilles Consultation inc. - Dépôt', netBiweekly: 1200 }],
            housing: { label: 'Taxes municipales + entretien', monthly: 700 },
            recurring: [
                { payee: 'Hydro-Québec - Facture', amount: 120, category: 'Logement', dayOfMonth: 6 },
                { payee: 'Vidéotron - Forfait', amount: 90, category: 'Autre', dayOfMonth: 10 },
                { payee: 'Assurance habitation + auto', amount: 180, category: 'Autre', dayOfMonth: 15 },
            ],
            // Aucun virement d'épargne : le déficit mensuel devient un « Retrait épargne
            // (équilibre) » généré — le décaissement, vu du compte chèque.
            groceries: { merchants: ['IGA', 'Metro', 'Costco'], perMonth: 6, avg: 90 },
            dining: { merchants: ['St-Hubert', 'Café local', 'Pizzeria du coin'], perMonth: 4, avg: 45 },
            transport: { perMonth: 2, avg: 70, label: 'Station Esso' },
        }, 505),
        debts: [],
        // targetAge 76 > 71 : cinq années ACTIVES, dont quatre (72 à 75) avec un minimum FERR
        // obligatoire — le chemin visé. Aucune rente DB.
        retirementGoal: { targetAge: 76, targetMonthlyIncome: 4500, governmentPension: 2100, dbPensionMonthly: 0, lifeExpectancy: 92 } as unknown as AppState['retirementGoal'],
        realEstateGoals: [],
        childGoals: [],
        travelGoals: [
            { id: 'gi-tr1', destination: 'Floride (hiver)', date: '2027-01-15', totalCost: 6000, image: '🌴' },
        ] as unknown as AppState['travelGoals'],
        lifeEvents: [],
        financialGoals: [
            { id: 'gi-fg1', name: 'Coussin santé', target: 40000, current: 25000, accountType: 'NON-ENREG', deadline: '2030-12-31' },
        ] as unknown as AppState['financialGoals'],
        // [R6] Aucune dette / projet immo / enfant → opt-out explicite (pas de PageSetupGate sur ces pages).
        setupOptOut: { debts: true, realEstate: true, children: true },
        ...emptyCollections(),
    };
}
