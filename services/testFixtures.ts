// services/testFixtures.ts
//
// Fixtures pour le "Mode Test" — permet de remplir l'app avec des données
// réalistes Québec/Canada 2026 pour tester rapidement les flows sans saisir.
// Activable via Settings → Outils dev → "Activer mode test". Un backup
// IndexedDB est créé automatiquement avant le switch (cf cloudBackup auto).
//
// Convention "no fake data" du CLAUDE.md : ces fixtures NE sont JAMAIS
// chargées au boot ni dans un état par défaut. Elles ne s'activent que
// sur action utilisateur explicite, et un banner permanent signale le mode.

import type { AppState, Asset, Transaction, BudgetCategory, Debt, ChildGoal, RealEstateGoal, TravelGoal, LifeEvent, FinancialGoal, RetirementGoal, BudgetConfig } from '../types';
import type { MarketDataPoint } from './finance';

const TEST_USERS: BudgetConfig['users'] = [
    { name: 'Alex (test)', grossSalary: 7500, netSalary: 5200, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991 },
    { name: 'Sam (test)', grossSalary: 6200, netSalary: 4400, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993 },
];

const TEST_CONFIG: BudgetConfig = {
    users: TEST_USERS,
    splitMode: '50/50',
};

// ─── Transactions (60 entrées sur 3 mois) ────────────────────────────────
function generateTestTransactions(): Transaction[] {
    const out: Transaction[] = [];
    const now = new Date();
    let idCounter = 1;
    const mk = (daysAgo: number, payee: string, amount: number, category: string): Transaction => {
        const d = new Date(now);
        d.setDate(d.getDate() - daysAgo);
        return {
            id: `test-tx-${idCounter++}`,
            date: d.toISOString().split('T')[0],
            payee,
            amount,
            category,
            isAiProcessed: true,
            confidence: 95,
            status: 'processed',
        } as unknown as Transaction;
    };

    // Salaires bi-mensuels
    for (let i = 0; i < 6; i++) {
        out.push(mk(15 * i + 1, 'EMPLOYEUR INC - Dépôt direct', 2600, 'Salaire'));
        out.push(mk(15 * i + 15, 'EMPLOYEUR INC - Dépôt direct', 2600, 'Salaire'));
        out.push(mk(15 * i + 1, 'STARTUP CO - Dépôt direct', 2200, 'Salaire'));
    }
    // Logement
    for (let i = 0; i < 3; i++) {
        out.push(mk(30 * i + 1, 'Hypothèque BMO - Paiement', -1850, 'Logement'));
        out.push(mk(30 * i + 5, 'Hydro-Québec - Facture', -145, 'Logement'));
        out.push(mk(30 * i + 12, 'Vidéotron - Internet', -89, 'Logement'));
    }
    // Épicerie (~5/mois)
    const epiceries = ['Provigo', 'IGA', 'Costco', 'Métro', 'Maxi'];
    for (let i = 0; i < 15; i++) {
        const days = Math.floor(Math.random() * 90);
        const merchant = epiceries[i % epiceries.length];
        out.push(mk(days, `${merchant} #${1000 + i}`, -(45 + Math.random() * 120), 'Épicerie'));
    }
    // Restaurants
    for (let i = 0; i < 10; i++) {
        out.push(mk(Math.floor(Math.random() * 90), `Restaurant ${['Tim Hortons', 'Subway', "St-Hubert", 'Pizza Salvatoré'][i % 4]}`, -(15 + Math.random() * 50), 'Restaurants'));
    }
    // Transport
    for (let i = 0; i < 6; i++) {
        out.push(mk(15 * i + 7, 'Station Esso', -(55 + Math.random() * 30), 'Transport'));
    }
    // Investissements (transferts)
    for (let i = 0; i < 3; i++) {
        out.push(mk(30 * i + 1, 'Transfert vers CELI - Wealthsimple', -800, 'Transfert'));
        out.push(mk(30 * i + 1, 'Transfert vers REER - Wealthsimple', -600, 'Transfert'));
    }
    // Divers
    out.push(mk(5, 'Pharmaprix #123', -32.50, 'Santé'));
    out.push(mk(18, 'SAQ - Vin', -38, 'Loisirs'));
    out.push(mk(22, 'Amazon.ca - Commande', -67.99, 'Autre'));
    out.push(mk(45, 'Cinema Cineplex', -28, 'Loisirs'));

    return out;
}

// ─── Actifs (CELI + REER + NonReg + Crypto) ────────────────────────────
// Helper pour générer un priceHistory plausible : 6 points sur 12 mois,
// interpolation linéaire entre buy price et current price.
function genHistory(buyPrice: number, currentPrice: number): Array<{ date: string; price: number }> {
    const out: Array<{ date: string; price: number }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - i * 2);
        const t = (6 - i) / 6;
        const price = buyPrice + (currentPrice - buyPrice) * t;
        out.push({ date: d.toISOString().split('T')[0], price: Math.round(price * 100) / 100 });
    }
    return out;
}

const TEST_ASSETS: Asset[] = [
    {
        id: 'test-asset-1', symbol: 'VFV.TO', name: 'Vanguard S&P 500 (CAD)', region: 'us-equity',
        sector: 'index', accountType: 'CELI', currentPrice: 145.50,
        priceHistory: genHistory(110.00, 145.50),
        purchases: [{ date: '2023-01-15', price: 110.00, quantity: 50 }],
        dateBought: '2023-01-15', buyPrice: 110.00, quantity: 50,
    },
    {
        id: 'test-asset-2', symbol: 'VEQT.TO', name: 'Vanguard All-Equity', region: 'global',
        sector: 'index', accountType: 'REER', currentPrice: 38.20,
        priceHistory: genHistory(32.10, 38.20),
        purchases: [{ date: '2022-08-10', price: 32.10, quantity: 250 }],
        dateBought: '2022-08-10', buyPrice: 32.10, quantity: 250,
    },
    {
        id: 'test-asset-3', symbol: 'XEQT.TO', name: 'iShares All-Equity', region: 'global',
        sector: 'index', accountType: 'NON-ENREG', currentPrice: 32.95,
        priceHistory: genHistory(29.00, 32.95),
        purchases: [{ date: '2023-05-22', price: 29.00, quantity: 100 }],
        dateBought: '2023-05-22', buyPrice: 29.00, quantity: 100,
    },
    {
        id: 'test-asset-4', symbol: 'AAPL', name: 'Apple Inc.', region: 'us-equity',
        sector: 'tech', accountType: 'CELI', currentPrice: 220.00,
        priceHistory: genHistory(130.00, 220.00),
        purchases: [{ date: '2021-03-15', price: 130.00, quantity: 20 }],
        dateBought: '2021-03-15', buyPrice: 130.00, quantity: 20,
    },
    {
        id: 'test-asset-5', symbol: 'BTC-CAD', name: 'Bitcoin', region: 'crypto',
        sector: 'crypto', accountType: 'CRYPTO', currentPrice: 95000,
        priceHistory: genHistory(60000, 95000),
        purchases: [{ date: '2024-01-10', price: 60000, quantity: 0.15 }],
        dateBought: '2024-01-10', buyPrice: 60000, quantity: 0.15,
    },
] as unknown as Asset[];

// ─── Budget catégories ─────────────────────────────────────────────────
const TEST_BUDGET_ITEMS: BudgetCategory[] = [
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

// ─── Real estate ────────────────────────────────────────────────────────
const TEST_REAL_ESTATE: RealEstateGoal[] = [
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

// ─── Dettes ────────────────────────────────────────────────────────────
const TEST_DEBTS: Debt[] = [
    {
        id: 'd1', name: 'Carte Visa Desjardins (test)', balance: 2800,
        rate: 19.9, monthlyPayment: 250, kind: 'credit-card',
    } as unknown as Debt,
    {
        id: 'd2', name: 'Prêt auto (test)', balance: 18500,
        rate: 6.5, monthlyPayment: 425, kind: 'loan',
    } as unknown as Debt,
];

// ─── Goals ─────────────────────────────────────────────────────────────
const TEST_RETIREMENT: RetirementGoal = {
    targetAge: 60,
    targetMonthlyIncome: 5500,
    governmentPension: 1850,
    dbPensionMonthly: 0,
    lifeExpectancy: 92,
} as unknown as RetirementGoal;

const TEST_CHILD_GOALS: ChildGoal[] = [
    {
        id: 'child-1', name: 'Léa (test)', birthDate: '2022-06-15',
        daycareType: 'cpe', schoolType: 'publique', activitiesLevel: 'legeres',
        universityType: 'uni_local', carGift: 'usagee_5k',
        monthlyDiapers: 120, monthlyFood: 200, monthlyClothing: 80,
        respContribution: 2500, governmentBenefits: 450, initialCost: 2800,
    } as unknown as ChildGoal,
];

const TEST_TRAVEL: TravelGoal[] = [
    { id: 'tr-1', destination: 'Italie', date: '2027-06-15', totalCost: 8500, image: '🇮🇹' } as TravelGoal,
    { id: 'tr-2', destination: 'Japon', date: '2029-04-10', totalCost: 12000, image: '🇯🇵' } as TravelGoal,
];

const TEST_LIFE_EVENTS: LifeEvent[] = [
    { id: 'le-1', name: 'Rénovation cuisine', type: 'RENOVATION', date: '2028-05-01', impactAmount: 25000 } as unknown as LifeEvent,
];

const TEST_FINANCIAL_GOALS: FinancialGoal[] = [
    { id: 'fg-1', name: 'Fond urgence 6 mois', target: 30000, current: 8500, accountType: 'CELI', deadline: '2027-12-31' } as unknown as FinancialGoal,
];

/**
 * Génère 24 mois de marketData synthétique pour que Dashboard + Investments
 * puissent afficher l'évolution détaillée, les actifs individuels, et calculer
 * la performance / dividendes. Sans cette fonction, le mode test affiche
 * « Aucun actif trouvé » dans les vues qui dépendent du CSV historique.
 *
 * Convention des colonnes (compat code existant) :
 *   - 'date' : YYYY-MM-DD
 *   - '<SYMBOL>' : valeur totale = quantity × price interpolé (ex: 'VFV.TO')
 *   - 'TOTAL_CELI' / 'TOTAL_REER' / 'TOTAL_NON-ENREG' / 'TOTAL_CRYPTO' : agrégats
 *   - 'TOTAL' : somme totale incluant initialBalances cash
 */
export function generateTestMarketData(): MarketDataPoint[] {
    const out: MarketDataPoint[] = [];
    const now = new Date();
    const MONTHS = 24;

    const initialBalances = {
        CELI: 32000,
        REER: 12500,
        'NON-ENREG': 3500,
        CRYPTO: 14250,
        LIQUIDITE: 8500,
    };
    const cashTotal = Object.values(initialBalances).reduce((s, v) => s + v, 0);

    for (let i = MONTHS - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - i);
        const date = d.toISOString().split('T')[0];
        const t = (MONTHS - 1 - i) / (MONTHS - 1); // 0 (oldest) → 1 (newest)

        // Pour chaque asset, interpole entre buyPrice et currentPrice
        const row: MarketDataPoint = { date };
        let celiTotal = 0;
        let reerTotal = 0;
        let nonRegTotal = 0;
        let cryptoTotal = 0;

        for (const a of TEST_ASSETS) {
            const buy = a.purchases?.[0]?.price ?? a.currentPrice;
            const price = buy + (a.currentPrice - buy) * t;
            const qty = a.quantity || a.purchases?.[0]?.quantity || 0;
            const value = Math.round(price * qty * 100) / 100;
            row[a.symbol] = value;
            if (a.accountType === 'CELI') celiTotal += value;
            else if (a.accountType === 'REER') reerTotal += value;
            else if (a.accountType === 'CRYPTO') cryptoTotal += value;
            else nonRegTotal += value;
        }
        row['TOTAL_CELI'] = celiTotal;
        row['TOTAL_REER'] = reerTotal;
        row['TOTAL_NON-ENREG'] = nonRegTotal;
        row['TOTAL_CRYPTO'] = cryptoTotal;
        row['TOTAL'] = celiTotal + reerTotal + nonRegTotal + cryptoTotal + cashTotal;
        out.push(row);
    }

    return out;
}

/**
 * Retourne un état complet de test. Les balances et soldes sont cohérents
 * (CELI ~30k, REER ~12k, NonReg ~3.5k, Crypto ~14k = total ~60k).
 */
export function buildTestFixtures(): Partial<AppState> {
    return {
        config: TEST_CONFIG,
        budgetItems: TEST_BUDGET_ITEMS,
        assets: TEST_ASSETS,
        initialBalances: {
            CELI: 32000,
            REER: 12500,
            'NON-ENREG': 3500,
            CRYPTO: 14250,
            LIQUIDITE: 8500,
        },
        transactions: generateTestTransactions(),
        debts: TEST_DEBTS,
        retirementGoal: TEST_RETIREMENT,
        realEstateGoals: TEST_REAL_ESTATE,
        childGoals: TEST_CHILD_GOALS,
        travelGoals: TEST_TRAVEL,
        lifeEvents: TEST_LIFE_EVENTS,
        financialGoals: TEST_FINANCIAL_GOALS,
        savingsGoals: [],
        investmentAccounts: [],
        investmentTransactions: [],
        insurancePolicies: [],
        rentalProperties: [],
        privateBusinesses: [],
        vehicleReplacements: [],
        majorRenovations: [],
        charitableGoals: [],
    };
}
