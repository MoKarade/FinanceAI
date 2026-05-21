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

// Convention "valeurs réelles ou rien" : currentPrice et buyPrice sont les
// VRAIES valeurs Yahoo Finance correspondant aux premier et dernier points
// du CSV `services/data/test-portfolio-history.csv` (snapshot 2024-05-20
// → 2026-05-21, hebdomadaire). AAPL est converti USD → CAD au taux fixe
// `USD_CAD_RATE` documenté ci-dessous.
//
// Si le CSV est régénéré (script scripts/build-test-portfolio-csv.cjs), les
// bornes doivent être mises à jour ici en cohérence. Voir aussi
// `parseTestMarketCsv()` plus bas.
const USD_CAD_RATE = 1.37;
const TEST_ASSETS: Asset[] = [
    {
        id: 'test-asset-1', symbol: 'VFV.TO', name: 'Vanguard S&P 500 (CAD)', region: 'us-equity',
        sector: 'index', accountType: 'CELI', currentPrice: 182.18,
        priceHistory: genHistory(128.78, 182.18),
        purchases: [{ date: '2024-05-20', price: 128.78, quantity: 50 }],
        dateBought: '2024-05-20', buyPrice: 128.78, quantity: 50,
    },
    {
        id: 'test-asset-2', symbol: 'VEQT.TO', name: 'Vanguard All-Equity', region: 'global',
        sector: 'index', accountType: 'REER', currentPrice: 59.19,
        priceHistory: genHistory(41.16, 59.19),
        purchases: [{ date: '2024-05-20', price: 41.16, quantity: 250 }],
        dateBought: '2024-05-20', buyPrice: 41.16, quantity: 250,
    },
    {
        id: 'test-asset-3', symbol: 'XEQT.TO', name: 'iShares All-Equity', region: 'global',
        sector: 'index', accountType: 'NON-ENREG', currentPrice: 43.82,
        priceHistory: genHistory(31.02, 43.82),
        purchases: [{ date: '2024-05-20', price: 31.02, quantity: 100 }],
        dateBought: '2024-05-20', buyPrice: 31.02, quantity: 100,
    },
    {
        id: 'test-asset-4', symbol: 'AAPL', name: 'Apple Inc.', region: 'us-equity',
        sector: 'tech', accountType: 'CELI', currentPrice: 304.99 * USD_CAD_RATE,
        priceHistory: genHistory(189.98 * USD_CAD_RATE, 304.99 * USD_CAD_RATE),
        purchases: [{ date: '2024-05-20', price: 189.98 * USD_CAD_RATE, quantity: 20 }],
        dateBought: '2024-05-20', buyPrice: 189.98 * USD_CAD_RATE, quantity: 20,
    },
    {
        id: 'test-asset-5', symbol: 'BTC-CAD', name: 'Bitcoin', region: 'crypto',
        sector: 'crypto', accountType: 'CRYPTO', currentPrice: 106951.52,
        priceHistory: genHistory(93665.95, 106951.52),
        purchases: [{ date: '2024-05-20', price: 93665.95, quantity: 0.15 }],
        dateBought: '2024-05-20', buyPrice: 93665.95, quantity: 0.15,
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
        interestRate: 19.9, minimumPayment: 250,
        category: 'CreditCard', kind: 'credit-card',
    },
    {
        id: 'd2', name: 'Prêt auto (test)', balance: 18500,
        interestRate: 6.5, minimumPayment: 425,
        category: 'Car', kind: 'auto', amortizationYears: 5,
    },
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
        universityType: 'uni_local', carGift: 'usagee',
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
// Import raw du CSV historique réel (Yahoo Finance v8, weekly close,
// 2024-05-20 → 2026-05-21 — 106 points hebdo). Bundlé via Vite `?raw`,
// pas de fetch réseau requis. Voir scripts/build-test-portfolio-csv.cjs
// pour reproduire (Yahoo Finance API, sans clé requise).
// eslint-disable-next-line import/no-unresolved
import testPortfolioCsv from './data/test-portfolio-history.csv?raw';

/**
 * Parse le CSV bundlé en un map `{ date: { SYMBOL: price } }`.
 * Convertit AAPL (USD source Yahoo) en CAD via taux fixe USD_CAD_RATE
 * (~1.37, moyenne 2024-2026). Cette conversion est une légère approximation
 * documentée — pas de fluctuation forex jour-à-jour. Les autres symboles
 * sont nativement en CAD (suffixe .TO ou paire -CAD).
 */
function parseTestMarketCsv(): { date: string; prices: Record<string, number> }[] {
    const lines = testPortfolioCsv.trim().split(/\r?\n/);
    const headers = lines[0].split(',').map(s => s.trim());
    // headers attendus : date,VFV.TO,AAPL,BTC-CAD,VEQT.TO,XEQT.TO
    const rows: { date: string; prices: Record<string, number> }[] = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(s => s.trim());
        if (cols.length < headers.length) continue;
        const row: { date: string; prices: Record<string, number> } = {
            date: cols[0],
            prices: {},
        };
        for (let j = 1; j < headers.length; j++) {
            const symbol = headers[j];
            const raw = parseFloat(cols[j]);
            if (!Number.isFinite(raw)) continue;
            row.prices[symbol] = symbol === 'AAPL' ? raw * USD_CAD_RATE : raw;
        }
        rows.push(row);
    }
    return rows;
}

const PARSED_CSV = parseTestMarketCsv();

// U5 — Warning si le CSV bundlé manque un symbole utilisé par TEST_ASSETS.
// Détecte les régressions futures (ex: si on ajoute un actif test sans
// régénérer le CSV via scripts/build-test-portfolio-csv.cjs).
(function validateCsvSymbols() {
    if (PARSED_CSV.length === 0) return;
    const csvSymbols = new Set(Object.keys(PARSED_CSV[0].prices));
    const missing: string[] = [];
    for (const a of TEST_ASSETS) {
        if (!csvSymbols.has(a.symbol)) missing.push(a.symbol);
    }
    if (missing.length > 0) {
        console.warn(
            `[testFixtures] CSV bundlé manque ${missing.length} symbole(s) utilisé(s) ` +
            `par TEST_ASSETS : ${missing.join(', ')}. ` +
            `Régénérer via scripts/build-test-portfolio-csv.cjs.`
        );
    }
})();

/**
 * Historique de marché pour le mode test, basé sur des vraies données
 * Yahoo Finance hebdomadaires (close prices, 2024-05 → 2026-05).
 *
 * Convention "valeurs réelles ou rien" : aucune simulation, aucune
 * interpolation. Les valeurs viennent toutes du CSV bundlé. Si une
 * cellule est manquante (rare), le point est ignoré pour ce symbole.
 *
 * En production : ce hook n'est pas appelé — le vrai CSV
 * `/portfolio-history.csv` (vrai portefeuille Marc) prime.
 */
export function generateTestMarketData(): MarketDataPoint[] {
    const initialBalances = {
        CELI: 32000,
        REER: 12500,
        'NON-ENREG': 3500,
        CRYPTO: 14250,
        LIQUIDITE: 8500,
    };
    const cashTotal = Object.values(initialBalances).reduce((s, v) => s + v, 0);
    const out: MarketDataPoint[] = [];

    for (const row of PARSED_CSV) {
        const point: MarketDataPoint = { date: row.date };
        let celiTotal = 0;
        let reerTotal = 0;
        let nonRegTotal = 0;
        let cryptoTotal = 0;

        for (const a of TEST_ASSETS) {
            const price = row.prices[a.symbol];
            if (price == null) continue; // pas de fake — on saute si manquant
            const qty = a.quantity || a.purchases?.[0]?.quantity || 0;
            const value = Math.round(price * qty * 100) / 100;
            point[a.symbol] = value;
            if (a.accountType === 'CELI') celiTotal += value;
            else if (a.accountType === 'REER') reerTotal += value;
            else if (a.accountType === 'CRYPTO') cryptoTotal += value;
            else nonRegTotal += value;
        }
        point['TOTAL_CELI'] = celiTotal;
        point['TOTAL_REER'] = reerTotal;
        point['TOTAL_NON-ENREG'] = nonRegTotal;
        point['TOTAL_CRYPTO'] = cryptoTotal;
        point['TOTAL'] = celiTotal + reerTotal + nonRegTotal + cryptoTotal + cashTotal;
        out.push(point);
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
