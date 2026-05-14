// Agregats de patrimoine : fonctions pures sans dependance React.
// Reutilisable par le MCP server et testable unitairement.

import type {
  Transaction,
  Asset,
  BudgetCategory,
  BudgetConfig,
  Debt,
  User,
} from '../types';

export interface AssetBreakdown {
  reer: number;
  celi: number;
  reee: number;
  nonReg: number;
  crypto: number;
}

export interface MonthlyBudgetAggregates {
  income: number;
  expenses: number;
  savings: number;
}

const toCurrencyFactor = (fxRates: Record<string, number> | undefined, currency: string): number => {
  if (!fxRates) return currency === 'CAD' ? 1 : 1;
  return fxRates[currency] || 1;
};

/**
 * Ventilation des actifs par type de compte avec conversion FX vers CAD.
 * Les types reconnus : REER, CELI, REEE, CRYPTO. Le reste tombe dans nonReg.
 */
export const computeAssetBreakdown = (
  assets: Asset[],
  fxRates: Record<string, number>,
): AssetBreakdown => {
  const breakdown: AssetBreakdown = { reer: 0, celi: 0, reee: 0, nonReg: 0, crypto: 0 };

  for (const a of assets) {
    const factor = toCurrencyFactor(fxRates, a.currency);
    const valCad = (a.quantity || 0) * (a.currentPrice || 0) * factor;
    const type = (a.accountType || '').toUpperCase();
    if (type === 'REER') breakdown.reer += valCad;
    else if (type === 'CELI') breakdown.celi += valCad;
    else if (type === 'REEE') breakdown.reee += valCad;
    else if (type === 'CRYPTO') breakdown.crypto += valCad;
    else breakdown.nonReg += valCad;
  }
  return breakdown;
};

/**
 * Valeur totale des investissements en CAD (somme de tous les comptes).
 */
export const computeInvestmentsValue = (
  assets: Asset[],
  fxRates: Record<string, number>,
): number => {
  return assets.reduce((sum, a) => {
    const factor = toCurrencyFactor(fxRates, a.currency);
    return sum + ((a.quantity || 0) * (a.currentPrice || 0) * factor);
  }, 0);
};

/**
 * Liquidite courante = somme des soldes initiaux + somme des transactions
 * non-duplicate et non-transfer (gere les depots/retraits).
 */
export const computeCurrentLiquidity = (
  initialBalances: Record<string, number>,
  transactions: Transaction[],
): number => {
  let cash = 0;
  for (const v of Object.values(initialBalances)) cash += Number(v) || 0;
  for (const t of transactions) {
    if (!t.isDuplicate && !t.isTransfer) cash += Number(t.amount) || 0;
  }
  return cash;
};

/**
 * Patrimoine global = liquidite + investissements (CAD).
 */
export const computeGlobalNetWorth = (
  initialBalances: Record<string, number>,
  transactions: Transaction[],
  assets: Asset[],
  fxRates: Record<string, number>,
): number => {
  return computeCurrentLiquidity(initialBalances, transactions)
       + computeInvestmentsValue(assets, fxRates);
};

/**
 * Normalise un montant budgetaire en mensuel selon sa frequence.
 */
export const monthlyAmountFor = (item: BudgetCategory): number => {
  let amount = item.target || 0;
  switch (item.frequency) {
    case 'Yearly':    amount /= 12;   break;
    case 'Quarterly': amount /= 3;    break;
    case 'Weekly':    amount *= 4.33; break;
    // 'Monthly' (defaut) : pas de conversion
  }
  return amount;
};

/**
 * Agregats budgetaires mensuels :
 *  - income : somme des netSalary (fallback salary) du config.users
 *  - expenses : somme des budgetItems en mensuel, hors nature 'Epargne'
 *  - savings : max(0, income - expenses)
 */
export const computeMonthlyBudgetAggregates = (
  config: BudgetConfig,
  budgetItems: BudgetCategory[],
): MonthlyBudgetAggregates => {
  // On normalise via casts explicites pour eviter l'inference TS sur l'union
  // [User, User] | never[] qui produit un type 'never' surprenant avec `|| []`.
  const users: User[] = config.users ?? [];
  const items: BudgetCategory[] = budgetItems ?? [];
  const income = users.reduce(
    (acc, u) => acc + ((u.netSalary || u.salary || 0)),
    0,
  );
  const expenses = items.reduce(
    (acc, item) => item.nature === 'Epargne' ? acc : acc + monthlyAmountFor(item),
    0,
  );
  return {
    income,
    expenses,
    savings: Math.max(0, income - expenses),
  };
};

/**
 * Total des dettes (soldes positifs dus).
 */
export const computeTotalDebt = (debts: Debt[]): number => {
  return (debts || []).reduce((sum, d) => sum + (d.balance || 0), 0);
};
