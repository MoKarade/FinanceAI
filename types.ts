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
  /** [PH4-E] Conjoint propriétaire de la dépense en mode couple : 0 = user[0], 1 = user[1].
   *  Optionnel (additif) — `undefined` = attribution AUTO par le type du poste budget (`Perso 1`→0,
   *  `Perso 2`→1, `Commun`→aucun). Une valeur explicite est un OVERRIDE manuel. Voir `resolveTransactionOwner`. */
  ownerId?: 0 | 1;
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
  /** [HIST-COVERAGE-TOTAL] Symbole RÉSOLU pour l'historique de cours quand le symbole saisi ne rend
   *  rien chez les providers (ex. ticker Euronext sans suffixe : « CW8 » → « CW8.PA »). Alimenté par
   *  hydrateAssetHistories (variante validée par plausibilité de prix). Champ ADDITIF optionnel. */
  historySymbol?: string;
  /** [INVEST-ALLOC-GEO-SECTOR] Secteur/région pour les répartitions (donuts Investissements).
   *  Priorité : ces champs (édités inline ou auto-remplis via le profil provider) > seed statique
   *  normalisé > déduction crypto > « Autre ». Champs ADDITIFS optionnels (zéro migration). */
  sector?: string;
  region?: string;
  /** [PRICE-REFRESH-LIVE] Epoch ms de la dernière mise à jour de `currentPrice` par un quote live.
   *  Absent = prix jamais rafraîchi (figé à l'ajout/saisie manuelle). Champ ADDITIF optionnel. */
  priceUpdatedAt?: number;
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
  /** [INCOME-PROVENANCE] Provenance du salaire (source UNIQUE = fiche de paie, demande Marc
   *  2026-07-15) : estampillé par TaxCenter (scan de paie) et par le MCP (apply_payslip).
   *  Absent = saisie manuelle/inconnue (l'onglet Impôt l'affiche). Champ additif optionnel. */
  salarySource?: {
    kind: 'payslip' | 'mcp' | 'manual';
    label?: string;
    appliedAt?: number;
  };
  // ── PH3-c (2026-06-11) — champs « profil détaillé » historiques PURGÉS (contre-audit repo
  // complet : aucun consommateur) : gender, healthRating, isSmoker, bmiCategory, chronicConditions,
  // parentAgeAtDeath, activityLevel, yearsOfExperience, employmentType, promotionLikelihood5Y,
  // pensionPlan, province, citizenship, maritalStatus, bonusVolatilityPct, stockOptionsValue,
  // commissionPctOfGross, cryptoStakingAnnual, payFrequency, industry (purgé 2026-06-19, décision Marc :
  // zéro consommateur services/, seul l'éditeur UserConfigFields le settait).
  // Données résiduelles persistées (localStorage/IndexedDB) = INERTES, ignorées — ZÉRO migration.
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
  /** [BUDGET-TX-CATEGORIES] true = cible AUTO-gérée (moyenne mensuelle de tout le passé,
   *  recalculée à chaque chargement) ; une édition MANUELLE de la cible décroche (false).
   *  Champ additif optionnel — aucun bump de version persist requis. */
  autoTarget?: boolean;
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
  monteCarloIterations?: number;      // défaut 100, borné 50-1000 (MC_ITERATIONS_MIN/MAX — source unique services/projection/monteCarlo.ts)

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
  /** PH4-FUT-B — downsizing immo à la retraite (levier). Absent / false = aucun (non-régression) ;
   *  true = à l'âge de retraite, vendre la résidence principale et racheter plus petit : libère une
   *  fraction de l'équité en placements (exemption gain résidence principale ARC). */
  appliedDownsize?: boolean;

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
/** ⚠️ `auto-lease` (BAIL) n'est PAS `auto` (prêt) : un bail ne s'amortit pas, c'est un loyer sur un
 *  terme fixe puis on rend le véhicule (ou on le rachète). Le distinguer permet de dire la vérité
 *  dans l'UI et de ne pas présenter un « solde » de bail comme une dette qui s'éteint toute seule
 *  (demande Marc 2026-08-19). */
/** [DEBT-MCP-PARITE] Source UNIQUE des valeurs de `DebtKind` (tableau `as const`, le type est
 *  DÉRIVÉ dessous) — un `kind` MCP/import re-codé en dur ailleurs dérive en silence (piège
 *  indexé au CLAUDE.md) ; ce tableau se réutilise tel quel côté runtime (Zod `z.enum`, garde
 *  `applyDebt`) au lieu d'être retapé. */
export const DEBT_KINDS = ['mortgage', 'heloc', 'auto', 'auto-lease', 'student-federal', 'student-quebec', 'credit-card', 'personal', 'margin', 'spouse-loan', 'other'] as const;
export type DebtKind = typeof DEBT_KINDS[number];

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

/** Municipalité pour la taxe de bienvenue (droits de mutation) : Montréal a sa propre surtaxe. */
export type Municipality = 'montreal' | 'reste_qc';

export interface RealEstateGoal {
  id: string;
  name?: string;
  isActive: boolean;
  /** [ENG-PAST-OWNED-VS-PLANNED] Décision Marc A6 (ADR 0014) : discrimine un bien DÉJÀ DÉTENU
   *  (true → le moteur initialise équité+dette passées) d'un objectif PLANIFIÉ dont la date est
   *  passée sans achat (false → RIEN n'est injecté au m0 — fin des +156 628 $ d'équité et
   *  +307 081 $ de dette fantômes du panel #552). undefined = legacy : comportement historique
   *  (traité comme détenu) + l'UI pose la question (popup « est-ce acheté ? »). Champ ADDITIF
   *  optionnel — aucun bump de version de store. */
  isOwned?: boolean;
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
  /** FISC-WELCOME-UNIFY — municipalité pour la taxe de bienvenue. Requis à la saisie (UI), pas de
   * défaut stocké ; non défini ⇒ repli conservateur Montréal côté moteur (état transitoire). */
  municipality?: Municipality;
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

/** [PH4D-WEIGHTS-STORE] Pondérations des ratios de l'indicateur de santé financière (`HealthIndicator`).
 *  [PH4D-BUDGET-RATIOS] étendu de 4 à 6 : ajout de `budgetParity` (adhérence au budget) et `subscriptionLoad`
 *  (poids des abonnements). Rétrocompat : un état persisté à 4 champs est complété par les défauts à la lecture. */
export interface HealthWeights {
  savingsRate: number;
  emergencyFund: number;
  debtRatio: number;
  fireProgress: number;
  budgetParity: number;
  subscriptionLoad: number;
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
  /** [DETTE-DATES] Début du prêt / du bail (YYYY-MM-DD). Avant cette date, le moteur ne sert PAS la
   *  dette : ni paiement, ni intérêt, ni présence au bilan. Absent ⇒ elle a toujours couru
   *  (rétrocompatible bit-à-bit). Champ ADDITIF optionnel : aucune migration de schéma. */
  startDate?: string;
  /** [DEBT-AMORTIZATION] Solde d'ORIGINE du prêt (montant emprunté), pour reconstruire la
   *  décroissance du passé — « chaque semaine je dois un peu moins » (Marc). Absent ⇒ la dette
   *  reste au niveau figé d'aujourd'hui, comportement d'avant. Champ ADDITIF optionnel : aucune
   *  migration de schéma, donc aucun bug de migration.
   *  ⚠️ Un `originalBalance` INFÉRIEUR au solde actuel décrit une dette qui a grossi : ce n'est pas
   *  un profil d'amortissement et `amortirDettePassee` le refuse plutôt que de tracer une courbe
   *  croissante présentée comme un remboursement. */
  originalBalance?: number;
  /** [DETTE-DATES] Fin du TERME : échéance d'un bail, fin d'un prêt, renouvellement hypothécaire
   *  (YYYY-MM-DD). Le mois de cette date est INCLUS (dernier paiement). Après, le moteur cesse de
   *  payer — et si le solde n'est pas nul, il le LAISSE au bilan avec une alerte plutôt que de
   *  l'effacer (décision Marc 2026-08-19). Absent ⇒ on paie jusqu'à extinction. */
  termEndDate?: string;
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
  /** DETTE-RE-SALE — pour un événement de VENTE immobilière (`name` contient « vente »), désigne le
   *  bien à vendre par son `RealEstateGoal.id`. Absent ⇒ fallback historique (premier bien à équité
   *  positive). Champ additif optionnel ⇒ aucun bump de schéma persist (v7 conservé). */
  propertyId?: string;
  /** [ENG-LIFEEVENT-VENTE-SUBSTRING] Sémantique EXPLICITE de l'événement, pour les producteurs
   *  PROGRAMMATIQUES (MCP/IA) : `'VENTE_IMMO'` déclenche la vente immobilière SANS dépendre du mot
   *  réservé « vente » dans le nom ; `'NONE'` désarme la détection par sous-chaîne (un GROS_ACHAT
   *  nommé « … après vente de l'ancienne » n'est PLUS avalé en vente). Absent ⇒ comportement
   *  historique exact (détection par sous-chaîne). Champ additif optionnel ⇒ zéro bump persist. */
  eventKind?: 'VENTE_IMMO' | 'NONE';
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
  // [ASSISTANT-HUB 2026-07-23] ACTIONS retiré : fusionné dans ASSISTANT (deep-link #ACTIONS redirigé, App.tsx).
  REAL_ESTATE = 'REAL_ESTATE',
  // [REFONTE-NAV-L3] Split immo : REAL_ESTATE = biens ACTUELS (Config), REAL_ESTATE_PROJECTS =
  // projets d'achat FUTURS (Vie). Même tranche de store `realEstateGoals`, partition UI pure.
  REAL_ESTATE_PROJECTS = 'REAL_ESTATE_PROJECTS',
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
  /** [AITOOLS-C] Identité STABLE du message — les mises à jour de stream ciblent CET id, jamais
   *  « le dernier de la liste » (finding panel : un Effacer/chevauchement corrompait la mauvaise
   *  bulle). ADDITIF optionnel (les anciens messages persistés n'en ont pas — jamais mis à jour). */
  id?: string;
  /** [AITOOLS-C] Libellés des tools consultés pour CE message (chips de transparence « a consulté :
   *  Situation fiscale »). ADDITIF optionnel (zéro migration) — libellés seulement, JAMAIS les
   *  payloads (ADR-4 : le transcript persisté/synchronisé reste léger). */
  toolsUsed?: string[];
  /** [AITOOLS-B1] MÉTADONNÉES des pièces jointes du message (nom/type/taille) — ADDITIF optionnel.
   *  ⚠️ JAMAIS les octets ici (ADR-4 : transcript léger, synchronisé Drive) : le contenu vit dans
   *  le cache mémoire de session (services/aiChat/attachments), B2 le déplacera en fichiers Drive
   *  appdata séparés. */
  attachments?: Array<{ name: string; kind: 'image' | 'pdf' | 'text'; mimeType: string; size: number }>;
  /** [B4-CHAT-COST] Coût API RÉEL de CETTE réponse en USD (tokens usage × tarif du modèle,
   *  services/aiChat/pricing). Messages modèle seulement ; ADDITIF optionnel (zéro migration).
   *  Jamais fabriqué : absent si l'usage n'a pas pu être mesuré (no-fake-data). */
  costUsd?: number;
}

/** [B3-CHAT-MODEL] Clés des modèles offerts dans le chat (mapping id complet : services/aiChat/models). */
export type AiChatModelKey = 'haiku' | 'sonnet' | 'opus';

/** [TX-REVIEW] État d'une revue d'échantillon en cours (persisté, device-agnostique). */
export interface CategoryReviewState {
  /** Graine du tirage — fige l'échantillon d'une session à l'autre. */
  seed: number;
  /** Taille demandée au moment du tirage. */
  size: number;
  /** Ids jugés CORRECTS ou mal classés (le dénominateur). */
  reviewedIds: number[];
  /** Ids jugés MAL CLASSÉS (le numérateur). Toujours inclus dans `reviewedIds`. */
  errorIds: number[];
  /** Epoch ms du début de la revue (traçabilité : un taux vieux de 6 mois ne dit plus rien). */
  startedAt: number;
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
  /** [PH4D-WEIGHTS-STORE] Pondérations de l'indicateur de santé financière (somme libre, normalisée à l'affichage).
   *  Migré de l'ancienne clé localStorage `healthIndicator:weights:v1` vers le store persisté. Optionnel (additif) :
   *  le store l'initialise toujours (`loadLegacyHealthWeights`), mais un vieil état persisté peut ne pas l'avoir → fallback. */
  healthWeights?: HealthWeights;
  /** [PH4-F] Abonnements / charges fixes ÉPINGLÉS (persistés). Avant : les abos n'étaient que DÉTECTÉS à la volée
   *  (IA/heuristique) et reperdus au reload. L'utilisateur en épingle un détecté → il rejoint cette liste persistée.
   *  Optionnel (additif, PAS de bump v7→v8 : rien à migrer, le store l'initialise à `[]`). Réutilise `RecurringItem`. */
  subscriptions?: RecurringItem[];
  /** [SUBS-TAB] Marchands normalisés explicitement écartés (« pas un abonnement »).
   *  Champ ADDITIF optionnel → aucun bump de schéma, aucun code de migration. */
  dismissedSubscriptions?: string[];
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
    /** [FINTABLE-7] Jeton Fintable LECTURE SEULE — sync bancaire depuis le navigateur. Optionnel
     *  (absent = la sync in-app est simplement inactive). Comme les autres clés : jamais persisté
     *  en clair, exclu des sauvegardes et du push Drive. */
    fintable?: string;
  };
  fxRates: {
    USD: number;
    EUR: number;
    CAD: number;
    lastFetched?: number;
  };
  /** [FX-FALLBACK-SILENCIEUX] `true` si AU MOINS un taux de `fxRates` vient du repli en dur
   *  (jamais récupéré, OU la BdC a répondu mais une série était absente/corrompue — un succès
   *  GLOBAL de fetch peut cacher un repli PAR TAUX que `fxRates.lastFetched > 0` seul ne voit
   *  pas). Champ SIBLING de `fxRates` (pas un champ dedans) : `fxRates` reste un
   *  `Record<string, number>` compatible avec ses ~13 consommateurs (`toCurrencyFactor`,
   *  `assetValueCad`…), qu'un champ booléen aurait cassés. ADDITIF optionnel, persisté via
   *  partialize allow-all — absent (état antérieur) → `isFxRatesEstimated` retombe sur
   *  `fxRates.lastFetched === 0`, rétrocompat bit-identique. */
  fxRatesEstimated?: boolean;
  lastUpdate: number;
  categorizationRules: CategorizationRule[];
  aiConversation: AiMessage[];
  // [B2-CHAT-HISTORY] Multi-conversations : `aiConversation` reste la conversation ACTIVE (source
  // unique — tous les consommateurs existants inchangés) ; les conversations ARCHIVÉES vivent ici.
  // ADDITIF optionnel (zéro migration) ; synchronisé Drive (texte + métadonnées de pièces jointes
  // seulement — jamais d'octets, ADR-4).
  aiConversations?: AiConversation[];
  /** Id de la conversation ACTIVE (celle d'`aiConversation`) — null tant qu'aucune n'a été archivée. */
  activeAiConversationId?: string | null;
  /** [B3-CHAT-MODEL] Modèle Claude de la conversation ACTIVE (choix par conversation — porté dans
   *  `AiConversation.model` à l'archivage/bascule). ADDITIF optionnel (absent = 'sonnet', le
   *  comportement historique). */
  aiChatModel?: AiChatModelKey;
  /** [B4-CHAT-COST] Coût API CUMULÉ À VIE du chat en USD (survit à la suppression des conversations —
   *  affiché en CAD via fxRates.USD au rendu). ADDITIF optionnel (absent = 0). */
  aiChatCostUsdTotal?: number;
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
  /** [TX-REVIEW] Revue d'échantillon de la catégorisation : mesure le taux réel de transactions mal
   *  classées (critère d'arrêt de Marc). ADDITIF optionnel (absent = jamais lancée). La GRAINE est
   *  persistée : rouvrir l'écran doit re-tirer le MÊME échantillon, sinon les jugements déjà faits ne
   *  portent plus sur le même dénominateur. */
  categoryReview?: CategoryReviewState;
  /** [FINTABLE-3] Rapport de la dernière passe de sync serveur (cron Cloud Run). ADDITIF optionnel
   *  (absent = jamais synchronisé). Écrit par le cron à CHAQUE passe (succès ou échec) pour que
   *  l'état de la sync soit visible dans l'app sans notification proactive (choix Marc). */
  fintableSyncReport?: FintableSyncReport;
  /** [FINTABLE-6] Soldes RÉELS des comptes de placement lus chez le courtier (via Fintable), qui font
   *  AUTORITÉ sur le total de chaque compte (choix Marc 2026-07-30). ADDITIF optionnel (absent = jamais
   *  synchronisé → l'app retombe sur la somme des titres saisis, comportement d'avant). */
  fintableBrokerBalances?: FintableBrokerBalance[];
  /** [FINTABLE-7] Rôle de chaque compte Fintable, assigné DANS L'APP (Réglages) — remplace le
   *  fichier `.fintable-roles.json` que Marc devait écrire à la main puis pousser en secret GCP.
   *  Clé = id de compte Fintable (stable). Un compte absent d'ici est SIGNALÉ, jamais deviné. */
  fintableRoles?: Record<string, FintableAccountRoleConfig>;
}

/**
 * [FINTABLE-7] Forme PERSISTÉE d'un rôle de compte. Structurellement identique à
 * `FintableAccountRole` (`services/fintable/mapSnapshot.ts`) mais redéclarée ici pour que le mapper
 * reste SANS dépendance (fonction pure) et que `types.ts` ne dépende pas de `services/`. La parité
 * des deux formes est verrouillée par test (assignation croisée) — pas laissée à la vigilance.
 */
export type FintableAccountRoleConfig =
  | { kind: 'cash' }
  | { kind: 'debt'; debtName: string }
  | { kind: 'investment'; taxRegime?: Extract<RegisteredAccountType, 'CELI' | 'REER' | 'NON-ENREG'> }
  | { kind: 'ignore' };

/**
 * [FINTABLE-6] Solde d'UN compte de placement tel que le courtier le voit. C'est la « vérité terrain »
 * de l'incident [[ASSET-FX-DISPLAY]] (« l'arbitre est le COURTIER »), désormais lue automatiquement.
 *
 * ⚠️ Fintable ne rend JAMAIS les positions de ce compte (FINTABLE-POSITIONS : Disnat hors SnapTrade,
 * limite produit mesurée) — donc ce solde est un TOTAL sans ventilation. L'écart avec la somme des
 * titres saisis est matérialisé en ligne explicite plutôt que laissé inexpliqué (choix Marc : le
 * patrimoine doit rester reconstructible, cf. checklist VALIDATION FINANCIÈRE).
 */
export interface FintableBrokerBalance {
  /** Id de compte Fintable — clé STABLE d'appariement. Ne JAMAIS apparier sur `label` (renommable). */
  accountId: string;
  /** Libellé lisible, AFFICHAGE seulement (peut changer côté banque sans rien casser). */
  label: string;
  /** Solde en CAD. Toujours fini : un compte au solde illisible ou en devise ≠ CAD n'est pas émis. */
  balanceCad: number;
  /** Régime fiscal DÉCLARÉ par Marc. Absent = écart non ventilable → affiché mais hors projection.
   *  Valeurs = sous-ensemble EXACT de `RegisteredAccountType` (aucune graphie parallèle). */
  taxRegime?: Extract<RegisteredAccountType, 'CELI' | 'REER' | 'NON-ENREG'>;
  /** Epoch ms de la lecture — permet d'afficher honnêtement la fraîcheur (« vu il y a 3 jours »). */
  at: number;
}

/** [FINTABLE-3] Résultat d'une passe de synchronisation Fintable, PERSISTÉ dans l'état pour
 *  affichage (Réglages → Système). `error` non-null = la passe a échoué ; les compteurs restent
 *  alors à 0 (aucune donnée fabriquée sur un échec). */
export interface FintableSyncReport {
  /** Epoch ms de la fin de la passe. */
  at: number;
  /**
   * [FINTABLE-RATTRAPAGE] Transactions ÉCARTÉES parce qu'antérieures ou égales à la bascule.
   *
   * ⚠️ Ce compteur EXISTAIT déjà dans le rapport du mapper, mais n'était affiché QUE dans le script
   * de dry-run — jamais dans l'app. Marc voyait donc « 0 transactions en plus » sans savoir que la
   * passe venait d'en ignorer des centaines : il en a conclu, à raison, que l'import était cassé
   * (2026-08-18). C'est `SILENCE-READS-AS-BROKEN` — l'écran se tait au moment où il doit parler.
   * ADDITIF optionnel : absent = rapport d'avant, aucune migration.
   */
  skippedBeforeCutover?: number;
  /** [FINTABLE-RATTRAPAGE] Vrai si la passe était un RATTRAPAGE (bascule volontairement ignorée). */
  wasBackfill?: boolean;
  /** Date de bascule (dérivée automatiquement) utilisée pour cette passe, ou `null` si vierge. */
  cutoverDateUsed: string | null;
  accountsSeen: number;
  accountsWithoutRole: number;
  transactionsAdded: number;
  transfersDetected: number;
  cashUpdated: boolean;
  /** [FINTABLE-ANCRE-LIQUIDITE-GONFLEE] Déplacement de l'ancre `initialBalances.LIQUIDITE` pendant la
   *  passe ($). Champ ADDITIF : absent des rapports d'avant ce lot — l'UI doit donc traiter
   *  `undefined` comme « inconnu », jamais comme 0 (no-fake-data). */
  cashAnchorDelta?: number;
  debtsUpdated: string[];
  investmentReferenceCount: number;
  warnings: string[];
  /** Raison de l'échec, ou `null` si la passe a réussi. */
  error: string | null;
}

/** [B2-CHAT-HISTORY] Une conversation ARCHIVÉE du chat Assistant (l'active vit dans `aiConversation`). */
export interface AiConversation {
  id: string;
  /** Titre auto (première question tronquée) — peut porter un montant → zone masquée en mode discret. */
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AiMessage[];
  /** [B3-CHAT-MODEL] Modèle de CETTE conversation (restauré à la bascule). ADDITIF optionnel :
   *  une archive pré-B3 n'en a pas → 'sonnet' (le seul modèle qui existait alors). */
  model?: AiChatModelKey;
}

export interface RecurringItem {
  payee: string;
  averageAmount: number;
  dayOfMonth: number;
  category: string;
  lastDate: string;
  yearlyCost: number;
}
