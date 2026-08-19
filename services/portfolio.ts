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
import { isSavingsNature } from '../utils/budget';
import { logErrorThrottled } from './errorLogger';
import { computeCashLedger } from './startingCash';

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

export const toCurrencyFactor = (fxRates: Record<string, number> | undefined, currency: string): number => {
  // CAD (devise de base) ou devise absente → 1:1 légitime (l'absence de devise sur un ACTIF est
  // signalée par assetValueCad, qui a le contexte). Devise ÉTRANGÈRE sans taux valide → repli 1:1
  // MAIS JAMAIS silencieux (finding panel 2026-07-14 : le repli muet « {} → facteur 1 » est
  // exactement le bug ASSET-FX-DISPLAY qui a sous-affiché ~70 k$ — s'il se reproduit via un fxRates
  // vide/corrompu, on veut le voir dans les diagnostics). Throttlé 1×/devise (hot-path UI).
  if (!currency || currency === 'CAD') return 1;
  const r = fxRates?.[currency];
  if (Number.isFinite(r) && (r as number) > 0) return r as number;
  logErrorThrottled(`fx-fallback:${currency}`, {
    source: 'network',
    severity: 'warning',
    message: `Taux ${currency}→CAD absent ou corrompu — repli 1:1 (valeurs en ${currency} SOUS-évaluées à l'affichage)`,
    context: { currency, rate: r ?? null },
  });
  return 1;
};

/**
 * [ASSET-FX-DISPLAY] Valeur CAD d'UN actif — LA source unique pour tout affichage/somme de placements.
 * `currentPrice` est stocké en devise NATIVE du titre (AddStockForm : prix Finnhub USD/EUR/CAD + champ
 * `currency`) → toute somme SANS `toCurrencyFactor` mélange les devises (incident Marc 2026-07-14 :
 * l'app affichait 160 352 « $ » = 69 k USD + 84 k EUR + 7 k CAD additionnés bruts, vs ~230 k$ CAD réels
 * — le patrimoine était SOUS-affiché de ~70 k$). Garde NaN/Infinity incluse (NAN-INPUT-HARDENING).
 * Un test-garde (assetFxGuard) interdit toute nouvelle somme quantity×currentPrice hors de ce helper.
 */
export const assetValueCad = (
  a: Pick<Asset, 'quantity' | 'currentPrice' | 'currency'> & { symbol?: string },
  fxRates: Record<string, number> | undefined,
): number => {
  const raw = (a.quantity || 0) * (a.currentPrice || 0);
  // Actif VALORISÉ sans devise (donnée legacy d'avant le champ `currency`) : traité 1:1 comme du
  // CAD — correct pour du CAD legacy, SOUS-évalué pour un USD/EUR legacy → signalé (jamais muet),
  // throttlé 1×/symbole. Le backfill propre est suivi au BACKLOG ([ASSET-FX-DISPLAY] note legacy).
  if (!a.currency && raw !== 0) {
    logErrorThrottled(`asset-no-currency:${a.symbol ?? '?'}`, {
      source: 'storage',
      severity: 'warning',
      message: `Actif « ${a.symbol ?? '?'} » sans devise — traité comme CAD (sous-évalué si USD/EUR)`,
      context: { symbol: a.symbol ?? null },
    });
  }
  const v = raw * toCurrencyFactor(fxRates, a.currency);
  if (Number.isFinite(v)) return v;
  // Valeur corrompue (NaN/Infinity : import cassé, saisie manuelle) → 0$, mais JAMAIS en silence :
  // l'actif disparaîtrait de TOUTES les surfaces sans trace (patron HARDEN-NETWORTH-NAN).
  logErrorThrottled(`asset-value-nonfinite:${a.symbol ?? '?'}`, {
    source: 'storage',
    severity: 'warning',
    message: `Valeur non finie pour l'actif « ${a.symbol ?? '?'} » — ignoré (0 $) dans les totaux`,
    context: { symbol: a.symbol ?? null, quantity: a.quantity ?? null, currentPrice: a.currentPrice ?? null },
  });
  return 0;
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
    const valCad = assetValueCad(a, fxRates); // source unique (FX + garde NaN/Infinity)
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
  return assets.reduce((sum, a) => sum + assetValueCad(a, fxRates), 0);
};

/**
 * Liquidite courante = somme des soldes initiaux + somme des transactions
 * non-duplicate et non-transfer (gere les depots/retraits).
 *
 * [CASH-NAN-SILENT] Délègue à la SOURCE UNIQUE `computeCashLedger` (`services/startingCash.ts`).
 * Cette fonction portait sa propre copie de la formule avec des `Number(v) || 0` MUETS — juste
 * en dessous d'`assetValueCad`, qui applique pourtant le patron `HARDEN-*-NAN` depuis l'incident
 * « −193 k$ ». Deux poids, deux mesures dans le même fichier.
 */
export const computeCurrentLiquidity = (
  initialBalances: Record<string, number>,
  transactions: Transaction[],
): number => computeCashLedger(initialBalances, transactions);

/**
 * Actifs BRUTS = liquidité + investissements (CAD), AVANT dettes.
 * ⚠️ Ce n'est PAS le patrimoine net (renommé de `computeGlobalNetWorth`, audit 2026-06-17 :
 * le nom « NetWorth » invitait à OMETTRE les dettes — bug H1/AI-CTX-FX). Pour le NW présent,
 * utiliser `computePresentNetWorth` (qui soustrait les dettes).
 */
export const computeGrossAssets = (
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
    // [HEALTH-SAVINGS-CONSISTENCY] `isSavingsNature` (NFD) au lieu de `=== 'Epargne'` strict : la nature
    // persistée est LIBRE (« Épargne » accentué possible) → l'épargne doit être exclue des dépenses partout.
    (acc, item) => isSavingsNature(item.nature) ? acc : acc + monthlyAmountFor(item),
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
  // [NAN-INPUT-HARDENING] `|| 0` rattrape déjà NaN (falsy) ; `Number.isFinite` couvre EN PLUS Infinity.
  return (debts || []).reduce((sum, d) => sum + (Number.isFinite(d.balance) ? d.balance : 0), 0);
};

/**
 * Patrimoine net PRÉSENT = actifs bruts − dettes (CAD). SOURCE UNIQUE du NW présent pour
 * TOUTES les surfaces (Dashboard `useDerivedFinancials`, snapshot IA `financialSnapshot`,
 * `AiAssistant`) — pendant du `computeRawNetWorth` (futur/moteur). Audit 2026-06-17 (H1,
 * AI-CTX-FX) : les surfaces qui recalculaient inline OMETTAIENT les dettes → NW présent
 * gonflé vs moteur. Garde de parité : `tests/services/portfolio.test.ts` (persona endetté).
 */
export const computePresentNetWorth = (
  initialBalances: Record<string, number>,
  transactions: Transaction[],
  assets: Asset[],
  fxRates: Record<string, number>,
  debts: Debt[],
): number => {
  return computeGrossAssets(initialBalances, transactions, assets, fxRates)
       - computeTotalDebt(debts);
};
