import { describe, it, expect } from 'vitest';
import {
  computeAssetBreakdown,
  computeInvestmentsValue,
  computeCurrentLiquidity,
  computeGrossAssets,
  computePresentNetWorth,
  computeMonthlyBudgetAggregates,
  computeTotalDebt,
  monthlyAmountFor,
  isFxRatesEstimated,
  hasForeignCurrencyAssets,
} from '../../services/portfolio';
import type {
  Asset,
  Transaction,
  BudgetCategory,
  BudgetConfig,
  Debt,
} from '../../types';

const FX = { CAD: 1, USD: 1.38, EUR: 1.50 };

const makeAsset = (overrides: Partial<Asset>): Asset => ({
  symbol: 'TEST',
  quantity: 1,
  currentPrice: 100,
  currency: 'CAD',
  accountType: 'NON-ENREG',
  performance: 0,
  priceHistory: [],
  ...overrides,
} as Asset);

describe('computeAssetBreakdown', () => {
  it('ventile par accountType et applique la conversion FX', () => {
    const assets: Asset[] = [
      makeAsset({ accountType: 'CELI', quantity: 10, currentPrice: 100, currency: 'CAD' }),
      makeAsset({ accountType: 'REER', quantity: 5, currentPrice: 200, currency: 'USD' }),
      makeAsset({ accountType: 'CRYPTO', quantity: 1, currentPrice: 50000, currency: 'USD' }),
      makeAsset({ accountType: 'NON-ENREG', quantity: 2, currentPrice: 100, currency: 'CAD' }),
    ];
    const b = computeAssetBreakdown(assets, FX);
    expect(b.celi).toBe(1000);                       // 10 * 100 * 1
    expect(b.reer).toBeCloseTo(1380, 1);             // 5 * 200 * 1.38
    expect(b.crypto).toBeCloseTo(69000, 1);          // 1 * 50000 * 1.38
    expect(b.nonReg).toBe(200);                      // 2 * 100 * 1
    expect(b.reee).toBe(0);
  });

  it('renvoie zero pour un tableau vide', () => {
    const b = computeAssetBreakdown([], FX);
    expect(b).toEqual({ reer: 0, celi: 0, reee: 0, nonReg: 0, crypto: 0 });
  });
});

describe('computeInvestmentsValue', () => {
  it('somme les valeurs converties en CAD', () => {
    const assets: Asset[] = [
      makeAsset({ quantity: 10, currentPrice: 100, currency: 'CAD' }), // 1000
      makeAsset({ quantity: 1, currentPrice: 100, currency: 'USD' }),  // 138
      makeAsset({ quantity: 1, currentPrice: 100, currency: 'EUR' }),  // 150
    ];
    expect(computeInvestmentsValue(assets, FX)).toBeCloseTo(1288, 1);
  });
});

describe('computeCurrentLiquidity', () => {
  it('somme balances initiales + transactions non-duplicate non-transfer', () => {
    const initial = { 'Compte A': 1000, 'Compte B': 500 };
    const txs: Transaction[] = [
      { id: 1, date: '2025-01-01', payee: 'Pay', amount: 100, category: 'Salary', accountName: 'A', status: 'cleared', isDuplicate: false, isTransfer: false } as unknown as Transaction,
      { id: 2, date: '2025-01-02', payee: 'Pay', amount: -50, category: 'Other', accountName: 'A', status: 'cleared', isDuplicate: false, isTransfer: false } as unknown as Transaction,
      { id: 3, date: '2025-01-03', payee: 'Dup', amount: 999, category: 'Other', accountName: 'A', status: 'cleared', isDuplicate: true, isTransfer: false } as unknown as Transaction,
      { id: 4, date: '2025-01-04', payee: 'Xfer', amount: 999, category: 'Other', accountName: 'A', status: 'cleared', isDuplicate: false, isTransfer: true } as unknown as Transaction,
    ];
    // 1500 + 100 - 50 = 1550
    expect(computeCurrentLiquidity(initial, txs)).toBe(1550);
  });

  it('renvoie 0 si tout est vide', () => {
    expect(computeCurrentLiquidity({}, [])).toBe(0);
  });
});

describe('computeGrossAssets', () => {
  it('combine liquidite et investissements (AVANT dettes)', () => {
    const initial = { 'A': 1000 };
    const txs: Transaction[] = [];
    const assets: Asset[] = [makeAsset({ quantity: 10, currentPrice: 100, currency: 'CAD' })];
    expect(computeGrossAssets(initial, txs, assets, FX)).toBe(2000);
  });
});

// Garde-fou keystone (audit 2026-06-17, H1 / AI-CTX-FX) : SOURCE UNIQUE du NW présent.
// Discrimine le bug d'omission des dettes (Dashboard `useDerivedFinancials` + `AiAssistant`
// recalculaient cash+investments SANS dettes). Toutes les surfaces routent désormais ici → parité.
describe('computePresentNetWorth (source unique du NW présent)', () => {
  const initial = { 'A': 1000 };
  const txs: Transaction[] = [];
  const assets: Asset[] = [makeAsset({ quantity: 10, currentPrice: 100, currency: 'CAD' })]; // 1000 cash + 1000 inv = 2000 brut

  it('sans dettes → = actifs bruts', () => {
    expect(computePresentNetWorth(initial, txs, assets, FX, [])).toBe(2000);
  });

  it('persona ENDETTÉ : NW = actifs bruts − dettes (le bug H1 était l\'omission des dettes)', () => {
    const debts: Debt[] = [{ balance: 500 } as Debt, { balance: 300 } as Debt];
    // Discriminant : 2000 (brut) − 800 (dettes) = 1200. Le code bogué donnait 2000.
    expect(computePresentNetWorth(initial, txs, assets, FX, debts)).toBe(1200);
    expect(computePresentNetWorth(initial, txs, assets, FX, debts))
      .toBeLessThan(computeGrossAssets(initial, txs, assets, FX));
  });

  it('applique les fxRates FOURNIS sur une devise étrangère (pas de taux en dur — AI-CTX-FX)', () => {
    const usdAssets: Asset[] = [makeAsset({ quantity: 10, currentPrice: 100, currency: 'USD' })]; // 1000 USD
    // 1000 cash + 1000 USD × 1.38 = 2380. Le NW SUIT le taux fourni → aucun 1.38/1.50 figé possible.
    expect(computePresentNetWorth(initial, txs, usdAssets, FX, [])).toBe(2380);
    expect(computePresentNetWorth(initial, txs, usdAssets, { CAD: 1, USD: 2 }, [])).toBe(3000);
  });
});

describe('monthlyAmountFor', () => {
  it('convertit Yearly en mensuel', () => {
    expect(monthlyAmountFor({ target: 1200, frequency: 'Yearly' } as BudgetCategory)).toBe(100);
  });

  it('convertit Weekly en mensuel via *4.33', () => {
    expect(monthlyAmountFor({ target: 100, frequency: 'Weekly' } as BudgetCategory)).toBeCloseTo(433, 1);
  });

  it('garde Monthly tel quel', () => {
    expect(monthlyAmountFor({ target: 500, frequency: 'Monthly' } as BudgetCategory)).toBe(500);
  });
});

describe('computeMonthlyBudgetAggregates', () => {
  it('calcule income, expenses, savings (exclut Epargne)', () => {
    const config: BudgetConfig = {
      users: [
        { name: 'Marc', netSalary: 4000, grossSalary: 0, color: '#0f0', age: 34 },
        { name: 'Anna', netSalary: 3000, grossSalary: 0, color: '#3b4', age: 32 },
      ],
      splitMode: '50/50',
    };
    const budget: BudgetCategory[] = [
      { name: 'Loyer', target: 1600, frequency: 'Monthly', nature: 'Logement' } as unknown as BudgetCategory,
      { name: 'Epicerie', target: 800, frequency: 'Monthly', nature: 'Alimentation' } as unknown as BudgetCategory,
      { name: 'CELI', target: 500, frequency: 'Monthly', nature: 'Epargne' } as BudgetCategory, // exclu
    ];
    const r = computeMonthlyBudgetAggregates(config, budget);
    expect(r.income).toBe(7000);
    expect(r.expenses).toBe(2400);
    expect(r.savings).toBe(4600);
  });

  it('plafonne savings a 0 si les depenses depassent', () => {
    const config = { users: [{ name: '', netSalary: 1000, grossSalary: 0, color: '#0f0' }, { name: '', netSalary: 0, grossSalary: 0, color: '#f00' }], splitMode: '50/50' } as BudgetConfig;
    const budget: BudgetCategory[] = [
      { name: 'X', target: 2000, frequency: 'Monthly', nature: 'Autre' } as unknown as BudgetCategory,
    ];
    const r = computeMonthlyBudgetAggregates(config, budget);
    expect(r.savings).toBe(0);
  });
});

describe('computeTotalDebt', () => {
  it('somme les soldes', () => {
    const debts: Debt[] = [
      { name: 'Carte', balance: 2000 } as Debt,
      { name: 'Pret', balance: 15000 } as Debt,
    ];
    expect(computeTotalDebt(debts)).toBe(17000);
  });

  it('renvoie 0 pour un tableau vide ou indefini', () => {
    expect(computeTotalDebt([])).toBe(0);
    expect(computeTotalDebt(undefined as unknown as Debt[])).toBe(0);
  });
});

// [FX-FALLBACK-SILENCIEUX] — le repli FX en dur n'était visible que dans SystemView (page
// technique). Ces deux helpers pures alimentent le badge partagé (FxEstimateBadge) consommé par
// Investissements, le bandeau Patrimoine net et le PDF — le signal doit se déclencher SEULEMENT
// quand il compte (un taux estimé qui ne convertit RIEN n'est pas une information utile).
describe('isFxRatesEstimated', () => {
  it('lastFetched: 0 (jamais récupéré, ou repli en dur) → true', () => {
    expect(isFxRatesEstimated({ lastFetched: 0 })).toBe(true);
  });

  it('lastFetched absent → true (même repli, contrat DEFAULT_FX_RATES)', () => {
    expect(isFxRatesEstimated({})).toBe(true);
    expect(isFxRatesEstimated(undefined)).toBe(true);
  });

  it('lastFetched > 0 (taux réel, même périmé) → false', () => {
    expect(isFxRatesEstimated({ lastFetched: 1700000000 })).toBe(false);
  });
});

describe('hasForeignCurrencyAssets', () => {
  it('un seul actif CAD → false (rien à convertir, le badge ne doit PAS apparaître)', () => {
    expect(hasForeignCurrencyAssets([makeAsset({ currency: 'CAD' })])).toBe(false);
  });

  it('au moins un actif USD/EUR parmi des CAD → true', () => {
    expect(hasForeignCurrencyAssets([makeAsset({ currency: 'CAD' }), makeAsset({ currency: 'USD' })])).toBe(true);
  });

  it('liste vide ou currency absente → false', () => {
    expect(hasForeignCurrencyAssets([])).toBe(false);
    expect(hasForeignCurrencyAssets([{ } as Asset])).toBe(false);
  });
});
