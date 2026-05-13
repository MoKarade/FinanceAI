
export interface Transaction {
  id: number;
  date: string;
  payee: string;
  amount: number; // Negative for expense, positive for income
  category: string;
  originalCategory?: string;
  accountId?: number;
  accountName?: string;
  status: 'pending' | 'processed' | 'manual' | 'error';
  isTransfer?: boolean;
  isDuplicate?: boolean;
  confidence?: number;
  isAiProcessed?: boolean;
  isVerified?: boolean;
}

export interface Asset {
  symbol: string;
  quantity: number;
  currency: 'USD' | 'CAD' | 'EUR';
  currentPrice: number;
  name: string;
  performance: number;
  dateBought: string;
  buyPrice?: number;
  priceHistory?: Array<{ date: string; price: number; rawPrice?: number; fxRate?: number }>;
  lastHistorySync?: number;
  accountType?: 'CELI' | 'REER' | 'NON-ENREG' | 'CRYPTO';
  dividendYield?: number;
  dividendFreq?: 'Monthly' | 'Quarterly' | 'Yearly';
  nextDividendDate?: string;
  description?: string;
}

export interface InvestmentAccount {
  id: string;
  userId: number;
  name: string;
  type: 'CELI' | 'CELIAPP' | 'REER' | 'MARGE' | 'NON-ENREG' | 'CRYPTO' | 'AUTRE';
}

export interface InvestmentTransaction {
  id: string;
  date: string;
  type: 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW';
  symbol?: string;
  name?: string;
  quantity?: number;
  price?: number;
  amount: number;
  currency: 'USD' | 'CAD' | 'EUR';
  accountId: string;
  fees?: number;
}

export interface BudgetConfig {
  users: [User, User];
  splitMode: '50/50' | 'prorata' | 'custom';
  customSplit?: number;
}

export interface User {
  name: string;
  grossSalary: number;
  netSalary: number;
  salary?: number;
  color: string;
  // Informations personnelles pour les calculs fiscaux
  age?: number;              // Âge actuel (pour simulation et plafond CELI)
  birthYear?: number;        // Année de naissance (Alternative à l'âge pour plus de précision)
  canadaArrivalYear?: number; // Année d'arrivée au Canada (pour calcul plafond CELI réel)
  hasOwnedPropertyLast4Years?: boolean; // Pour admissibilité CELIAPP (Premier acheteur)
  hasChildren?: boolean;     // Pour admissibilité REEE
  childCount?: number;       // Nombre d'enfants
  fhsaBalance?: number;      // Solde CELIAPP / FHSA
  celiContributed?: number;  // Total contribué au CELI (pour calculer plafond restant)
  rrspContributed?: number;  // Total contribué au REER
  facteurEquivalence?: number; // V44: Facteur d'équivalence (FE) qui réduit le plafond REER
}

export interface BudgetCategory {
  id?: string;
  name: string;
  target: number;
  frequency: 'Monthly' | 'Yearly' | 'Weekly' | 'Quarterly';
  type: 'Commun' | 'Perso 1' | 'Perso 2';
  nature: 'Besoin' | 'Envie' | 'Epargne';
}

export interface ProjectionConfig {
  years: number;
  returnRate: number;
  inflationRate: number;
  savingsMode: 'manual' | 'budget' | 'real';
  manualContribution: number;
  usePortfolioRate: boolean;
  returnRates?: {
    celi: number;
    reer: number;
    nonReg: number;
    crypto: number;
    cash: number;
  };
  emergencyFundMonths?: number;

  // NEW: Paramètres persistants pour le moteur Hybride et la macro-économie
  salaryGrowth?: number;
  theoreticalIncome?: number;
  theoreticalExpenses?: number;
  useTheoretical?: boolean;

  // V16: Stress Test (Séquence de Rendements)
  stressTestEnabled?: boolean;
  stressTestYear?: number;      // Année du krach depuis aujourd'hui (1-15)
  stressTestDrop?: number;      // Chute du portefeuille en % (10-60)
  stressTestRecoveryMonths?: number; // Durée de récupération en mois (6-60)
  stressTestInflationShock?: number; // NEW: Surtension inflationniste (+0-10%)

  // V16: Scénario B (pour comparaison A/B)
  scenarioB?: ProjectionConfig;
  scenarioBLabel?: string;

  // V18: Immobilier appreciation rate override
  propertyGrowthRate?: number;  // % annuel d'appréciation immobilière dans la simulation

  // V18: Manual account balance overrides (if CSV unavailable or overridden)
  useManualBalances?: boolean;
  manualCELI?: number;
  manualREER?: number;
  manualNonReg?: number;
  manualCash?: number;
  manualCrypto?: number;
  manualCELIRoom?: number;  // V28: Override plafond CELI
  manualREERRoom?: number;  // V28: Override plafond REER

  // V22: Mécaniques optionnelles
  vehicleReplacementEnabled?: boolean;  // Remplacement véhicule 35k tous les 10 ans
  useSmithManoeuvre?: boolean;          // Levier immobilier (capital remboursé → NonReg)

  // V49: Optimisation retenue à la source (T1213)
  optimizeSourceDeductions?: boolean;
}

export interface RealEstateGoal {
  id: string;
  name?: string;              // Custom property label (e.g. "Rive-Sud" or "Chalet")
  isActive: boolean;
  purchaseDate: string;
  price: number;
  downPayment: number;
  mortgageRate: number;
  amortization: number;
  totalClosingCosts: number;
  monthlyPayment: number;
  unrecoverableMonthly: number;
  isPrimaryResidence: boolean;
  isRented?: boolean;
  maxValue?: number;          // Price appreciation cap (e.g. 2x purchase price)
  // Enriched parameters
  propertyGrowthRate?: number;
  rentalIncomeMonthly?: number;
  initialRenovations?: number;
  renewalRateProjection?: number;
  yearlyRenovations?: number;  // Annual renovation / maintenance budget
  maintenanceYearly?: number;  // Property taxes (overrides auto-calc)
}

export interface ChildGoal {
  id: string;
  name: string;
  isActive: boolean;
  birthDate: string;
  initialCost: number;
  monthlyDiapers: number;
  monthlyFood: number;
  monthlyClothing: number;
  monthlyDaycare: number;
  governmentBenefits: number;
  parentalLeaveIncomeDrop: number;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  icon: string;
}

export interface Debt {
  id: string;
  name: string;
  balance: number;
  interestRate: number;
  minimumPayment: number;
  category: 'CreditCard' | 'Car' | 'Student' | 'Personal' | 'Other';
}

export interface TravelGoal {
  id: string;
  destination: string;
  date: string;
  totalCost: number;
  image?: string;
  notes?: string;
}

export type LifeEventType =
  'KRACH' | 'ACCIDENT' | 'GROS_ACHAT' | 'HERITAGE' | 'PERTE_EMPLOI' |
  'MARIAGE' | 'RENOVATION' | 'AUTO' | 'SABBATIQUE' | 'BUSINESS';

export interface LifeEvent {
  id: string;
  type: LifeEventType;
  name: string;
  date: string;
  impactAmount?: number;
  impactPercent?: number;
  durationMonths?: number;
  incomeLossPercent?: number;
}

export interface RetirementGoal {
  targetAge: number;
  targetMonthlyIncome: number;
  governmentPension: number;
}

export type GoalType = 'NET_WORTH' | 'CELI' | 'REER' | 'LIQUIDITY' | 'CUSTOM' | 'EXPENSE_OPTIMIZATION' | 'REBALANCING';

export interface FinancialGoal {
  id: string;
  name: string;
  type: GoalType;
  targetAmount: number;
  deadline: string;
  manualCurrentAmount?: number;
  completed?: boolean;
  status?: 'active' | 'suggestion' | 'archived';
  rationale?: string;
  actionPlan?: string[];
  monthlyContributionReq?: number;
  targetAccount?: 'CELI' | 'REER' | 'NON-ENREG' | 'CRYPTO';
  estimatedYield?: number;
  complexityScore?: number;
}

export enum Tab {
  DASHBOARD = 'DASHBOARD',
  TRANSACTIONS = 'TRANSACTIONS',
  BUDGET = 'BUDGET',
  GOALS = 'GOALS',
  PLANNING = 'PLANNING',
  DEBT = 'DEBT',
  INVESTMENTS = 'INVESTMENTS',
  FUTURE = 'FUTURE',
  REAL_ESTATE = 'REAL_ESTATE',
  CHILD = 'CHILD',
  TRAVEL = 'TRAVEL',
  LIFE_EVENTS = 'LIFE_EVENTS',
  RETIREMENT = 'RETIREMENT',
  TAX = 'TAX',
  DATA = 'DATA',
  SETTINGS = 'SETTINGS',
  SYSTEM = 'SYSTEM',
  ASSISTANT = 'ASSISTANT',
}

// V18: Règles de catégorisation automatique des transactions
export interface CategorizationRule {
  id: string;
  pattern: string;         // Substring to match in payee name (case-insensitive)
  category: string;        // Target category to assign
  createdAt: string;       // ISO date
}

export interface AppState {
  transactions: Transaction[];
  assets: Asset[];
  investmentTransactions: InvestmentTransaction[];
  investmentAccounts: InvestmentAccount[];
  budgetItems: BudgetCategory[];
  config: BudgetConfig;
  projection: ProjectionConfig;
  realEstateGoals: RealEstateGoal[];
  childGoal?: ChildGoal; // Legacy
  childGoals: ChildGoal[];
  savingsGoals: SavingsGoal[];
  debts: Debt[];
  travelGoals: TravelGoal[];
  lifeEvents: LifeEvent[];
  retirementGoal: RetirementGoal;
  financialGoals: FinancialGoal[];
  initialBalances: Record<string, number>;
  apiKeys: {
    lunchMoney: string;
    gemini: string;
  };
  // Taux de change mis à jour automatiquement (source: Banque du Canada)
  fxRates: {
    USD: number;
    EUR: number;
    CAD: number;
    lastFetched?: number; // Timestamp du dernier fetch
  };
  lastUpdate: number;
  categorizationRules: CategorizationRule[];
}

export interface RecurringItem {
  payee: string;
  averageAmount: number;
  dayOfMonth: number;
  category: string;
  lastDate: string;
  yearlyCost: number;
}
