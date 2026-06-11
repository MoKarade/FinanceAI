export interface Transaction {
  id: number;
  date: string;
  payee: string;
  amount: number;
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

// Phase E.8 — DCA multi-achat : un seul achat (dateBought + buyPrice) ne suffit
// plus pour calculer le gain réel sur plusieurs entrées étalées dans le temps.
// `purchases` capture chaque entrée individuellement.
export interface AssetPurchase {
  /** ISO date YYYY-MM-DD */
  date: string;
  /** quantité achetée à cette date */
  quantity: number;
  /** prix unitaire à l'achat (devise = Asset.currency) */
  price: number;
}

/**
 * CI-1000x B1 — propriétaire d'un actif/compte dans un couple. Les comptes
 * enregistrés (CELI/REER/CELIAPP/REEE) sont individuels par la loi ; le
 * non-enregistré, le cash et la crypto peuvent être conjoints. `owner` absent
 * ⇒ défaut heuristique appliqué par `services/couple/netWorthByOwner.ts`.
 */
export type AssetOwner = 'user1' | 'user2' | 'joint';

export interface Asset {
  symbol: string;
  quantity: number;
  currency: 'USD' | 'CAD' | 'EUR';
  currentPrice: number;
  name: string;
  performance: number;
  /** @deprecated Phase E.8 — utiliser purchases[]. Conservé pour rétrocompat. */
  dateBought: string;
  /** @deprecated Phase E.8 — utiliser purchases[]. Conservé pour rétrocompat. */
  buyPrice?: number;
  /** Phase E.8 — historique des achats (DCA support). */
  purchases?: AssetPurchase[];
  priceHistory?: Array<{ date: string; price: number; rawPrice?: number; fxRate?: number }>;
  lastHistorySync?: number;
  accountType?: RegisteredAccountType;
  /** CI-1000x B1 — propriétaire (user1 | user2 | joint). Absent ⇒ défaut heuristique. */
  owner?: AssetOwner;
  dividendYield?: number;
  dividendFreq?: 'Monthly' | 'Quarterly' | 'Yearly';
  nextDividendDate?: string;
  description?: string;
}

export interface InvestmentAccount {
  id: string;
  userId: number;
  name: string;
  type: RegisteredAccountType; // (cycle 3 TS agent: unifié sur le type partagé — exclut REEE qui n'est pas un compte d'investissement direct, mais le union l'inclut pour compat)
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

// Phase G.1 — onglet Documents global (PDF/Image avec IA extraction)
export type DocumentCategory =
  | 'PAYSLIP'        // fiche de paie
  | 'T4'             // relevé fiscal T4 / Relevé 1
  | 'BANK_STATEMENT' // relevé bancaire / brokerage
  | 'CONTRACT'       // contrat hypothécaire, bail, assurance
  | 'INVOICE'        // facture importante
  | 'OTHER';         // divers

export interface DocumentMeta {
  id: string;
  name: string;             // nom du fichier original
  category: DocumentCategory;
  uploadedAt: string;       // ISO date
  sizeBytes: number;
  mimeType: string;         // 'image/png', 'application/pdf', etc.
  /** Données extraites par IA (Vision Claude), si applicable */
  extractedData?: Record<string, unknown>;
  /** Notes utilisateur */
  notes?: string;
}

// PH3-c (2026-06-11) — types compagnons du « profil détaillé » W5.1 purgés avec leurs champs User
// (zéro consommateur) : HealthRating, Gender, EmploymentType, PensionPlan, MaritalStatus.
// CanadianProvince GARDÉ : consommé par ProjectionConfig.futureProvince (W2.7 geographic arbitrage).
export type CanadianProvince =
  | 'QC' | 'ON' | 'AB' | 'BC' | 'MB' | 'SK' | 'NS' | 'NB' | 'NL' | 'PE' | 'YT' | 'NT' | 'NU';
// Cycle 2 type-design: union pour Industry (élimine `string` permissif).
// Liste calibrée sur les top industries StatCan + tech moderne.
export type Industry =
    | 'tech' | 'finance' | 'health' | 'public-sector' | 'education'
    | 'construction' | 'retail' | 'manufacturing' | 'energy'
    | 'transportation' | 'agriculture' | 'media' | 'other';
// Union partagée pour les comptes enregistrés canadiens (élimine 3 unions divergentes
// dans Asset, InvestmentAccount, assetLocation).
export type RegisteredAccountType = 'CELI' | 'CELIAPP' | 'REER' | 'NON-ENREG' | 'CRYPTO' | 'REEE' | 'MARGE' | 'AUTRE';

// Note: DbPlanDetails était une interface orpheline (jamais consommée).
// Les champs DB sont centralisés dans RetirementGoal (dbPensionMonthly, etc.).
// Retiré par cycle 2 cleanup type-design agent.

export interface User {
  name: string;
  grossSalary: number;
  netSalary: number;
  salary?: number;
  color: string;
  age?: number;
  birthYear?: number;
  birthMonth?: number;                   // W5.1 (1-12)
  birthDay?: number;                     // W5.1 (1-31)
  canadaArrivalYear?: number;
  isImmigrant?: boolean;                 // immigré au Canada → droits CELI/REER + résidence PSV calculés depuis canadaArrivalYear (sinon depuis la naissance)
  hasOwnedPropertyLast4Years?: boolean;
  hasChildren?: boolean;
  childCount?: number;
  fhsaBalance?: number;
  celiContributed?: number;
  rrspContributed?: number;
  facteurEquivalence?: number;
  // ── PH3-c (2026-06-11) — champs « profil détaillé » historiques PURGÉS (contre-audit repo
  // complet : aucun consommateur) : gender, healthRating, isSmoker, bmiCategory, chronicConditions,
  // parentAgeAtDeath, activityLevel, yearsOfExperience, employmentType, promotionLikelihood5Y,
  // pensionPlan, province, citizenship, maritalStatus, bonusVolatilityPct, stockOptionsValue,
  // commissionPctOfGross, cryptoStakingAnnual, payFrequency.
  // Données résiduelles persistées (localStorage/IndexedDB) = INERTES, ignorées — ZÉRO migration.
  // W5.1 — Carrière
  industry?: Industry;                   // GARDÉ (décision audit PH3-c) — éditeur UserConfigFields seul, aucun consommateur services/
  // W5.2 — Rémunération variable (consommée par le moteur)
  bonusPctOfGross?: number;              // 0-100, bonus annuel attendu — services/projection/activeIncome.ts
  rsuVestingPerYear?: number;            // $ RSU vesting annuel attendu — services/projection/activeIncome.ts (lissé /12)
  rsuYearsRemaining?: number;            // années restantes de vesting — services/projection/activeIncome.ts (expiration RSU)
  // W5.2 — Side income
  sideIncomeAnnual?: number;             // freelance, royalties, etc. — services/projection/activeIncome.ts
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
  salaryGrowth?: number;
  theoreticalIncome?: number;
  theoreticalExpenses?: number;
  useTheoretical?: boolean;
  stressTestEnabled?: boolean;
  stressTestYear?: number;
  stressTestDrop?: number;
  stressTestRecoveryMonths?: number;
  stressTestInflationShock?: number;
  propertyGrowthRate?: number;
  useManualBalances?: boolean;
  manualCELI?: number;
  manualREER?: number;
  manualNonReg?: number;
  manualCash?: number;
  manualCrypto?: number;
  manualCELIRoom?: number;
  manualREERRoom?: number;
  vehicleReplacementEnabled?: boolean;
  useSmithManoeuvre?: boolean;
  optimizeSourceDeductions?: boolean;
  investmentTargetPcts?: Record<string, number>;
  // D2.5: Smile Curve — courbe en U des dépenses de retraite (étude CIBC).
  // Go-go (jusqu'à 74): +15% sur le besoin. Slow-go (75-84): base.
  // No-go (85+): -10% lifestyle, mais santé compense (déjà modélisé).
  useSmileCurve?: boolean;
  // D2.7: Withholding tax US 15% sur dividendes US détenus dans CELI/FHSA.
  // La convention fiscale Canada-US exempte le REER mais PAS le CELI.
  // - usEquityShareCeli: fraction CELI investie en actions US (0-100).
  // - usEquityDividendYield: rendement dividende moyen des actions US (1.5% par défaut).
  // Drag annuel sur CELI = share * yield * 15% (en points de pourcentage).
  usEquityShareCeli?: number;
  usEquityDividendYield?: number;
  // D2.8: Soins de longue durée (LTC) — coût mensuel ajouté en plus
  // des dépenses normales avec probabilité croissante après 80 ans.
  // - ltcMonthlyCost: coût mensuel quand l'événement se déclenche (5000$ par défaut).
  // - ltcEnabled: active la simulation.
  ltcEnabled?: boolean;
  ltcMonthlyCost?: number;
  // D2.8: Mortalité stochastique en Monte Carlo.
  // Active des tirages aléatoires de date de décès basés sur les tables
  // canadiennes 2020-2022. La simulation s'arrête à la mort de l'utilisateur
  // (l'estateNetWorth devient le patrimoine au décès et non en fin d'horizon).
  useStochasticMortality?: boolean;
  // D2.9: Inflation différenciée par poste (CPI panier composite).
  // Pondérations Statistique Canada (CPI-WEIGHTS 2023):
  //   Logement 30%, Alimentation 17%, Transport 15%, Santé 5%,
  //   Loisirs 6%, Autres 27%.
  // Chaque poste a son propre taux d'inflation moyen. Le multiplicateur
  // global devient une moyenne pondérée. Bonus santé après 75 ans appliqué
  // sur la part Santé uniquement.
  usePerCategoryInflation?: boolean;
  inflationHousing?: number;     // défaut 4.0
  inflationFood?: number;        // défaut 3.5
  inflationTransport?: number;   // défaut 2.5
  inflationHealth?: number;      // défaut 4.5
  inflationLeisure?: number;     // défaut 1.5
  inflationOther?: number;       // défaut 2.0
  // D2.10: Perte d'emploi stochastique. Probabilité annuelle ~3% (Stats Can).
  // Durée moyenne sans emploi: 6 mois (5-10 selon âge / industrie).
  // Pendant la période: salaire = 55% du brut (assurance-emploi), capé à 668$/sem 2026.
  jobLossEnabled?: boolean;
  jobLossAnnualProbability?: number; // défaut 0.03
  jobLossDurationMonths?: number;    // défaut 6

  // ────────────────────────────────────────────────────────────────────
  // W1.x — Précision avancée
  // ────────────────────────────────────────────────────────────────────
  // W1.1 — Perf: déléguer Monte Carlo au Web Worker
  useWebWorker?: boolean;
  monteCarloIterations?: number;      // défaut 100, max 2000

  // W1.2 — Bootstrap historique (rendements réels 1928-2024 S&P 500)
  // Au lieu de tirages gaussiens, on rééchantillonne des blocs de l'historique.
  useHistoricalBootstrap?: boolean;
  bootstrapBlockSize?: number;        // mois, défaut 24

  // W1.3 — RRQ et PSV séparés (corrige L1: governmentPension × 0.65/0.35)
  rrqMonthly?: number;                // estimation rente RRQ mensuelle individuelle
  psvMonthly?: number;                // estimation PSV mensuelle (max 2025: ~734$)
  rrqMonthlySpouse?: number;
  psvMonthlySpouse?: number;

  // W1.4 — Scénario survivant
  modelSurvivor?: boolean;            // active la simulation après décès conjoint
  spouseDbSurvivorPct?: number;       // % rente DB conservée par survivant (0-100)
  rrqSurvivorPct?: number;            // défaut 60%

  // W2.6 — Drawdown order optimizer (note: l'optimizer est appelé directement
  // depuis l'UI Retirement; pas de flag global nécessaire — laissé pour future
  // intégration dans la projection si besoin)

  // W4.1 — Tax bracket visualization
  showTaxBracketBreakdown?: boolean;

  // W3.1 — Divorce probabiliste
  divorceEnabled?: boolean;
  divorceAnnualProbability?: number;  // défaut 0.015 (1.5%/an pendant 30 ans → ~36%)
  divorceSplitPct?: number;           // % patrimoine perdu (défaut 50)
  divorceAlimonyMonthly?: number;     // pension alimentaire mensuelle versée

  // W3.2 — Invalidité longue durée
  ltdEnabled?: boolean;
  ltdAnnualProbability?: number;      // défaut 0.005
  ltdIncomeReplacementPct?: number;   // % salaire couvert par assurance (défaut 60)
  ltdDurationMonths?: number;         // défaut 24

  // W3.3 — Maladie grave
  criticalIllnessEnabled?: boolean;
  ciAnnualProbability?: number;       // défaut 0.003
  ciPayoutAmount?: number;            // forfait reçu (assurance maladies graves)
  ciExtraMonthlyExpense?: number;     // dépenses additionnelles

  // W3.4 — Héritage probabilisé
  inheritanceEnabled?: boolean;
  inheritanceExpectedAmount?: number;
  inheritanceExpectedAtAge?: number;
  inheritanceUncertaintyYears?: number; // étalement ±N ans
  inheritanceProbability?: number;      // 0-1

  // W3.5 — Boomerang kids / sandwich generation
  boomerangSupportMonthly?: number;
  boomerangStartAge?: number;
  boomerangDurationMonths?: number;
  caregivingMonthly?: number;
  caregivingStartAge?: number;
  caregivingDurationMonths?: number;

  // W3.7 — Severance / mise à pied avec prime
  severanceWeeksPerYear?: number;     // défaut 2 semaines / année d'ancienneté
  severanceCapWeeks?: number;         // plafond

  // W2.7 — Geographic arbitrage
  futureProvince?: CanadianProvince;
  futureProvinceMoveYear?: number;

  // W4.3 — Sensitivity analysis
  enableSensitivityAnalysis?: boolean;

  // W4.5 — Replay historique
  replayHistoricalYear?: number;      // 1929 | 1973 | 2000 | 2008 | 2020 | undefined

  // W4.6 — Semi-retraite
  phasedRetirementEnabled?: boolean;
  phasedRetirementStartAge?: number;
  phasedRetirementHoursPct?: number;  // ex: 50% = mi-temps

  // W4.7 — Snowbird (4-6 mois US/Mexique)
  snowbirdEnabled?: boolean;
  snowbirdMonthsPerYear?: number;     // défaut 5
  snowbirdExtraMonthlyCost?: number;  // surcoût mensuel

  // W2.1 — Roth-equivalent ladder (REER→CELI via brackets)
  enableRothLadder?: boolean;

  // G21 C5 — Leviers de stratégie « appliqués » depuis l'optimiseur. Ces leviers
  // sont orthogonaux à l'axe scénario (ordre de retrait / rentes) : ils s'appliquent
  // à TOUTES les simulations de calculateFutureProjection via EngineOverrides + un
  // bonus de rendement NonReg pour l'asset location. Absents ⇒ comportement
  // historique inchangé. (withdrawalOrder + delayPensions sont appliqués en
  // sélectionnant le scénario correspondant, pas ici.)
  appliedContributionOrder?: 'REER_FIRST' | 'CELI_FIRST';
  appliedDebtFirst?: boolean;
  appliedSkipRap?: boolean;
  appliedAssetLocation?: boolean;
  appliedGainHarvesting?: boolean;
  /** PH4-FUT-B — profil de rendement appliqué (levier). Absent / 'balanced' = taux returnRates
   *  inchangés (non-régression) ; 'conservative'/'aggressive' = preset (RETURN_RATE_PRESETS). */
  appliedReturnProfile?: 'conservative' | 'balanced' | 'aggressive';
  /** PH4-FUT-B — fractionnement de pension 65+ (levier). Absent / true = actif (comportement
   *  historique, non-régression) ; false = désactivé (saute la Phase 3 d'optimisation de décembre). */
  appliedPensionSplitting?: boolean;
  /** PH4-FUT-B — multiplicateur du taux d'épargne (levier). Absent / 1 = inchangé (non-régression) ;
   *  1.2 = épargner 20 % de plus (dépenses réduites d'autant). Mode réel + épargne positive seulement. */
  appliedSavingsMultiplier?: number;

  // [UI-SCEN] (2026-06-09, demande Marc « enlève les plans de base ») — la stratégie de
  // retrait/gestion est un PARAMÈTRE : le moteur ne calcule que CE scénario réaliste
  // (au lieu des 11 scénarios à chaque recalcul — ÷11 en déterministe ; en mode Monte
  // Carlo, le gain porte sur la part déterministe seulement). Les
  // stress-tests sont calculés À LA DEMANDE dans l'onglet Optimisation.
  // Union littérale = sous-ensemble d'AllocationStrategy ayant une ScenarioDefinition
  // (cf services/projection/scenarios.ts). Défaut : AUTO_MARGINAL (« Le Plan de Base »).
  withdrawalStrategy?: 'AUTO_MARGINAL' | 'PRIO_REER' | 'PRIO_CELI' | 'MELTDOWN_REER' | 'PRIO_CELI_NO_RAP';
}

// ────────────────────────────────────────────────────────────────────
// W5.3 — Dettes étendues (HELOC, cartes, étudiants, auto, perso, marge)
// ────────────────────────────────────────────────────────────────────
export type DebtKind = 'mortgage' | 'heloc' | 'auto' | 'student-federal' | 'student-quebec' | 'credit-card' | 'personal' | 'margin' | 'spouse-loan' | 'other';

// ────────────────────────────────────────────────────────────────────
// W5.4 — Assurances
// ────────────────────────────────────────────────────────────────────
export type InsuranceKind = 'life-term' | 'life-whole' | 'life-universal' | 'disability-st' | 'disability-lt' | 'critical-illness' | 'long-term-care' | 'travel' | 'auto' | 'home' | 'liability';

export interface InsurancePolicy {
  id: string;
  kind: InsuranceKind;
  insurer?: string;
  faceAmount?: number;          // capital décès / capital invalidité
  monthlyPremium: number;
  expiryDate?: string;          // pour temporaire (T10/T20/T30)
  cashValue?: number;           // pour vie entière / universelle
  beneficiary?: string;
  notes?: string;
}

// ────────────────────────────────────────────────────────────────────
// W5.6 — Immeuble locatif (cap rate, vacancy, NOI)
// ────────────────────────────────────────────────────────────────────
export interface RentalProperty {
  id: string;
  name: string;
  purchasePrice: number;
  currentValue: number;
  mortgageBalance: number;
  mortgageRate: number;
  monthlyRent: number;
  vacancyPct: number;           // 0-100
  monthlyExpenses: number;      // taxes, entretien, assurance, gestion
  capRate?: number;             // calculé: NOI / valeur
  acquisitionDate?: string;
  amortizationYears?: number;
  ccaTaken?: number;            // DPA cumulée (recapture à la vente)
}

// ────────────────────────────────────────────────────────────────────
// W5.7 — Entreprise privée (CCPC)
// ────────────────────────────────────────────────────────────────────
export interface PrivateBusiness {
  id: string;
  name: string;
  ownershipPct: number;          // % détenu
  estimatedValue: number;        // valeur juste marchande
  annualDividend?: number;       // dividende reçu
  retainedEarnings?: number;     // BNR
  ccpcSmallBizDeduction?: boolean; // accès DPE
  industry?: string;
}

// ────────────────────────────────────────────────────────────────────
// W5.x — Goals supplémentaires
// ────────────────────────────────────────────────────────────────────
export interface WeddingGoal {
  id: string;
  isActive: boolean;
  date: string;
  budget: number;
  contributionFromParents?: number;
}

export interface VehicleReplacement {
  id: string;
  cyclYears: number;             // ex: 8 ans
  costEstimate: number;
  isElectric?: boolean;
}

export interface MajorRenovation {
  id: string;
  date: string;
  cost: number;
  description?: string;
}

export interface CharitableGoal {
  id: string;
  annualAmount: number;
  donateAppreciatedSecurities?: boolean; // optimisation fiscale
  startYear?: number;
  endYear?: number;
}

export interface RealEstateGoal {
  id: string;
  name?: string;
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
  maxValue?: number;
  propertyGrowthRate?: number;
  rentalIncomeMonthly?: number;
  initialRenovations?: number;
  renewalRateProjection?: number;
  yearlyRenovations?: number;
  maintenanceYearly?: number;
  currentValue?: number;
  mortgageBalance?: number;
  taxesYearly?: number;
  heatingMonthly?: number;
  condoFees?: number;
  /** §6.8 SCHL — Premier acheteur : permet amortissement 30 ans même en assuré (depuis août 2024). */
  isFirstTimeBuyer?: boolean;
  /** §6.8 SCHL — Résidence neuve : idem, permet 30 ans en assuré. */
  isNewConstruction?: boolean;
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
  daycareType?: string;
  schoolType?: string;
  activitiesLevel?: string;
  universityType?: string;
  carGift?: string;
  respContribution?: number;
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
  // W5.3 — Champs étendus
  kind?: DebtKind;
  isVariableRate?: boolean;
  limit?: number;                  // pour HELOC, carte de crédit
  amortizationYears?: number;      // pour auto, hypothécaire
  termEndDate?: string;            // date fin terme (renouvellement hypo)
  rateProvider?: string;           // institution prêteuse
  isInterestDeductible?: boolean;  // intérêt sur prêt placement / Smith Manoeuvre
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
  icon?: string;
}

export interface RetirementGoal {
  targetAge: number;
  // Phase C.3 — paramètre migré du state local Retirement.tsx vers le store
  // pour que le Hub Configuration le centralise (refonte UI v3.0 §13).
  lifeExpectancy?: number; // défaut 90 ans, range typique 80-100
  targetMonthlyIncome: number;
  governmentPension: number;
  // D2.4: Rente mensuelle de régime à prestations déterminées (DB) cumulée
  // pour le couple (ex: RREGOP, fonction publique fédérale, certaines profs).
  // Optionnelle. Indexation gérée par `dbPensionIndexationPct` (défaut 100%).
  dbPensionMonthly?: number;
  dbPensionIndexationPct?: number; // 0-100, fraction de l'IPC répercutée
  dbPensionStartAge?: number;      // par défaut targetAge
  // W5.5 — Option de pension survivant (joint-life vs single-life)
  dbElectionType?: 'single' | 'joint60' | 'joint66' | 'joint100';
  dbSurvivorPct?: number;          // % rente au conjoint survivant (60/66/100)
  // W1.3 — Plages personnalisées RRQ/PSV (override de governmentPension)
  rrqEstimateMonthly?: number;     // rente RRQ projetée individuelle
  psvEstimateMonthly?: number;     // rente PSV projetée
  // Âge de DÉBUT des rentes — indépendant de l'âge d'arrêt de travail (targetAge).
  // Défaut : min(targetAge, 65). Bornes légales : RRQ 60-72 (report étendu à 72 depuis 2024),
  // PSV 65-70 (0 avant 65). Cf docs/FISCAL_REFERENCE.md §6.
  rrqStartAge?: number;            // 60-72, défaut min(targetAge, 65)
  psvStartAge?: number;            // 65-70, défaut min(targetAge, 65) (→ borné à 65)
  // W4.6 — Semi-retraite
  isPhasedRetirement?: boolean;
  phasedStartAge?: number;
  phasedIncomePct?: number;        // % de salaire conservé pendant phased
  // W2.3 — Spousal RRSP
  useSpousalRrsp?: boolean;
  // W2.1 — Roth ladder
  useReerToCeliLadder?: boolean;
  // Préférences décaissement
  // drawdownPreference retiré: orphelin (jamais consommé). Le moteur utilise
  // déjà AllocationStrategy en interne, et l'optimizer côté UI compare les 5 avenirs.
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
  DEBT = 'DEBT',
  INVESTMENTS = 'INVESTMENTS',
  FUTURE = 'FUTURE',
  // NBA-PAGE — « Prochaine action » (ex-widget sidebar) devient un onglet à part.
  ACTIONS = 'ACTIONS',
  REAL_ESTATE = 'REAL_ESTATE',
  CHILD = 'CHILD',
  TRAVEL = 'TRAVEL',
  LIFE_EVENTS = 'LIFE_EVENTS',
  // Phase F.12 — onglet unifié "Projets de vie" (fusion Travel + LifeEvents)
  LIFE_PROJECTS = 'LIFE_PROJECTS',
  RETIREMENT = 'RETIREMENT',
  TAX = 'TAX',
  SETTINGS = 'SETTINGS',
  // G22-N5 — SYSTEM retiré : fusionné dans Configuration (sous-onglet « Système & diagnostics »).
  // PH3 — onglet PROFIL unifié (regroupe tout le setup utilisateur, ex-« Profil de Configuration »).
  PROFILE = 'PROFILE',
  ASSISTANT = 'ASSISTANT',
}

export interface CategorizationRule {
  id: string;
  pattern: string;
  category: string;
  createdAt: string;
}

export interface AiMessage {
  role: 'user' | 'model';
  text: string;
  /** ISO 8601 string (sérialisable JSON, contrairement à Date qui devient string après reload) */
  timestamp: string;
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
  childGoal?: ChildGoal;
  childGoals: ChildGoal[];
  savingsGoals: SavingsGoal[];
  debts: Debt[];
  travelGoals: TravelGoal[];
  lifeEvents: LifeEvent[];
  retirementGoal: RetirementGoal;
  financialGoals: FinancialGoal[];
  // Setup-first : pages où l'utilisateur a explicitement choisi « pas concerné »
  // (ex. immobilier, enfant). Clé = id d'opt-out. Optionnel → migration-safe
  // (persisté via la denylist partialize ; défaut absent = non opté).
  setupOptOut?: Record<string, boolean>;
  initialBalances: Record<string, number>;
  apiKeys: {
    anthropic: string; // Phase 4 A5 — Claude API key (Anthropic) — remplace Gemini
    finnhub: string;   // §7.F.5 — marketData (quotes/history/profile) — optionnel
  };
  fxRates: {
    USD: number;
    EUR: number;
    CAD: number;
    lastFetched?: number;
  };
  lastUpdate: number;
  categorizationRules: CategorizationRule[];
  aiConversation: AiMessage[];
  // W5.x — Nouveaux containers
  insurancePolicies?: InsurancePolicy[];
  rentalProperties?: RentalProperty[];
  privateBusinesses?: PrivateBusiness[];
  weddingGoal?: WeddingGoal;
  vehicleReplacements?: VehicleReplacement[];
  majorRenovations?: MajorRenovation[];
  charitableGoals?: CharitableGoal[];
  // Phase G.1 — métadonnées des documents uploadés (blobs stockés séparément)
  documents?: DocumentMeta[];
}

export interface RecurringItem {
  payee: string;
  averageAmount: number;
  dayOfMonth: number;
  category: string;
  lastDate: string;
  yearlyCost: number;
}
