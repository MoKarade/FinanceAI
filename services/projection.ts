// services/projection.ts — moteur de projection financière (migré depuis utils/useFutureSimulation.ts)
import { ProjectionConfig, RealEstateGoal, ChildGoal, TravelGoal, LifeEvent, Debt, RetirementGoal, BudgetConfig as Config, InsurancePolicy, VehicleReplacement, MajorRenovation, CharitableGoal, RentalProperty, PrivateBusiness, SavingsGoal, FinancialGoal } from '../types';
import { calculateFiscalReport, getMarginalRate, calculateDividendTax, getDividendGrossUpRate, calculateGrossWithholdingRRSP, getResidencyStartYear, FHSA_ANNUAL_LIMIT_PER_USER, FHSA_LIFETIME_LIMIT_PER_USER } from '../utils/tax';
import { RRIF_RATES, welcomeTax } from './projection/helpers';
import { salaryShares, splitByShares, stepReerByUser, addByWeights } from './projection/perUserBalances';
import { logError } from './errorLogger';
import { runMonteCarlo, type MonteCarloResult } from './projection/monteCarlo';
import { rankStrategiesByRobustness, type RobustnessRanking, type RankRobustnessOptions } from './projection/strategyRobustness';
import type { EngineOverrides, StrategyConfig } from './projection/strategyConfig';
import { runStrategySearch, type StrategySearchResult, type RunStrategySearchOptions } from './projection/strategySearch';
import { ASSET_LOCATION_BONUS_PP } from './projection/strategySpace';
import { SCENARIO_DEFINITIONS, strategyDefFor } from './projection/scenarios';
import { applyW5Effects, applyAgeBasedExpenses } from './projection/w5Effects';
import { tryCriticalIllness, tryInheritance, tryMortality, trySpouseMortality, tryLtcTrigger, ltcMonthlyCost, tryDivorce } from './projection/stochasticEvents';
import { processAprilSettlement } from './projection/taxApril';
import { computeOasClawback, processTaxLossHarvesting, processGainHarvesting, processDecemberTaxFiling } from './projection/taxDecember';
import { processJanuaryReset } from './projection/taxJanuary';
import { processAutoVehicleReplacement } from './projection/vehicleCycle';
import { buildHistoricalSequence, buildReplaySequence, type YearReturn } from './projection/historicalReturns';
import { computeRetirementIncome } from './projection/retirementIncome';
import { processOneChild } from './projection/childrenReee';
import { computeActiveIncome } from './projection/activeIncome';
import { processReerMeltdown } from './projection/meltdownReer';
import { applyTravelExpenses, applyLifeEvents, computeStressTest, applySavingsGoalDeadlines, applyFinancialGoalDeadlines } from './projection/monthlyEvents';
import { computeLatentTax } from './projection/latentTax';
import { computeGlidepathRates } from './projection/glidepathRates';
import { processCashflowAllocation, type CashflowState } from './projection/cashflowAllocation';
import { processRealEstate, type RealEstateState } from './projection/realEstateMonth';
import { buildMonthlyDataPoint } from './projection/monthlyOutput';
import { applyMonthlyGrowth } from './projection/growthApplication';
import { buildSeededRng, computeHistoricalContributionRoom, computeRrqAdjustment, computeIncomeBaseline, computeScenarioOverrides, makeSmileLifestyleFactor } from './projection/setupSimulation';
import { handleNonRegSale as portfolioNonRegSale } from './projection/portfolioOps';
import { computeEstateNetWorth } from './projection/estateCalculation';
import { computeMonthlyMarketRates, type StressTestConfig } from './projection/marketShocks';
import { computeEffectiveExpenseInflation, computeMonthlyWithholding } from './projection/monthlyCalcs';
import { type AllocationStrategy, type FutureScenarioType, type ProjectionResult } from './projection/types';
export type { AllocationStrategy, FutureScenarioType, ProjectionChartPoint, ProjectionResult } from './projection/types';
export type { RobustnessRanking, StrategyRobustness, RankRobustnessOptions } from './projection/strategyRobustness';
export type { StrategySearchResult, ConfigResult, RunStrategySearchOptions } from './projection/strategySearch';
export type { StrategyConfig } from './projection/strategyConfig';
export {
    rankConfigResults,
    explainWinner,
    decisiveLevers,
    OBJECTIVE_LABELS,
    type ConfigRankingResult,
    type RankedConfig,
    type ScoreBreakdown,
    type OptimizeObjective,
    type DecisiveLever,
} from './projection/strategyConfigRanking';

/** Balances en direct lues depuis les comptes (CSV ou saisie manuelle). */
export interface LiveCSVBalances {
    CELI: number;
    CELIAPP: number;
    REER: number;
    NON_ENREG: number;
    CRYPTO: number;
    REEE: number;
    /** Champs supplémentaires éventuels — tolérance aux sources externes. */
    [key: string]: number;
}

export interface SimulationParams {
    projection: ProjectionConfig;
    calculatedStartingCash: number;
    liveCSVBalances: LiveCSVBalances;
    realEstateGoals: RealEstateGoal[];
    debts: Debt[];
    childGoals: ChildGoal[];
    travelGoals: TravelGoal[];
    lifeEvents: LifeEvent[];
    retirementGoal: RetirementGoal;
    config: Config;
    baseGrossAnnual: number;
    baseNetAnnual: number;
    currentRentExpense: number;
    baseMonthlyExpenses: number;
    startYear?: number;
    startMonth?: number;
    // W5.x — Conteneurs étendus (optionnels pour backward compat)
    insurancePolicies?: InsurancePolicy[];
    vehicleReplacements?: VehicleReplacement[];
    majorRenovations?: MajorRenovation[];
    charitableGoals?: CharitableGoal[];
    rentalProperties?: RentalProperty[];
    privateBusinesses?: PrivateBusiness[];
    // Wiring 2026-05: goals jusqu'ici inutilisés par le moteur.
    savingsGoals?: SavingsGoal[];
    financialGoals?: FinancialGoal[];
}

// Cycle 7 split: calculateGrossNeeded retiré (dead code, jamais appelé)

// Cœur du moteur de projection. Simule un scénario complet, mois par mois, sur
// l'horizon choisi. Chaque mois enchaîne dans l'ordre : croissance des
// placements (rendements ± aléa Monte Carlo), revenus (salaires/rentes),
// dépenses de vie + service des dettes, impôts, immobilier (hypothèque, valeur),
// puis agrégation de la valeur nette du mois. En mode Monte Carlo, runScenario
// est rappelée N fois avec un RNG seedé déterministe (reproductible).
// Retourne la série temporelle (chartData) + les agrégats de fin (estate, FIRE).
const runScenario = (params: SimulationParams, strategy: AllocationStrategy, enableMonteCarlo = false, delayPensions = false, mcIterationIndex = 0, scenarioType: FutureScenarioType = 'BASE', overrides: EngineOverrides = {}) => {
    const { projection, calculatedStartingCash, liveCSVBalances, realEstateGoals, debts, childGoals, travelGoals, lifeEvents, retirementGoal, config, baseGrossAnnual, baseNetAnnual: _baseNetAnnual, currentRentExpense, baseMonthlyExpenses, startYear = 2026, startMonth = 0, insurancePolicies = [], vehicleReplacements = [], majorRenovations = [], charitableGoals = [], rentalProperties = [], privateBusinesses = [], savingsGoals = [], financialGoals = [] } = params;
    
    // Cycle 22 split: RNG seedé déterministique → ./projection/setupSimulation
    const rng = buildSeededRng(scenarioType, strategy, mcIterationIndex);

    // Sprint 2 PH5 — Parse ISO directement (format YYYY-MM-DD) sans allouer
    // un objet Date. Appelé en boucle hot (chaque propriété immo × chaque mois
    // × chaque itération MC = jusqu'à 100 × 360 × N allocations Date évitées).
    // Gain : -5 à -15ms par scénario MC, élimine pression GC dans la boucle.
    // Defensive : retourne 0 si dateStr est null/undefined/vide (au lieu de crash
    // `.slice` sur undefined — vu en mode test avec fixture sans purchaseDate).
    const getMonthOffset = (dateStr: string | undefined | null): number => {
        if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 7) return 0;
        const year = parseInt(dateStr.slice(0, 4), 10);
        const month = parseInt(dateStr.slice(5, 7), 10) - 1;
        if (isNaN(year) || isNaN(month)) return 0;
        return (year - startYear) * 12 + (month - startMonth);
    };

    // Phase 4 #4: COMPOUND_STRESS force ltcEnabled (la facette "soins LD"
    // du cumul stress). Les autres paramètres (inflation, rates) sont
    // déjà overridés par computeScenarioOverrides.
    const effProj = scenarioType === 'COMPOUND_STRESS'
        ? { ...projection, ltcEnabled: true }
        : projection;
    const data = [];

    let liquid = Number(effProj.useManualBalances ? (effProj.manualCash ?? calculatedStartingCash) : calculatedStartingCash) || 0;
    let celi = Number(effProj.useManualBalances ? (effProj.manualCELI ?? liveCSVBalances.CELI) : liveCSVBalances.CELI) || 0;
    let celiapp = Number(liveCSVBalances.CELIAPP) || 0;
    let reer = Number(effProj.useManualBalances ? (effProj.manualREER ?? liveCSVBalances.REER) : liveCSVBalances.REER) || 0;
    let nonReg = Number(effProj.useManualBalances ? (effProj.manualNonReg ?? liveCSVBalances.NON_ENREG) : liveCSVBalances.NON_ENREG) || 0;
    let crypto = Number(effProj.useManualBalances ? (effProj.manualCrypto ?? liveCSVBalances.CRYPTO) : liveCSVBalances.CRYPTO) || 0;
    let reee = Number(liveCSVBalances.REEE) || 0;

    const activeRE = (realEstateGoals || []).filter(g => !!g);
    const activeChild = (childGoals || []).filter(g => !!g);

    let realEstateEquity = 0;
    let mortgageBalance = 0;
    let propertiesState = activeRE.map(g => ({
        id: g.id || 'anon',
        isBought: false,
        mortgage: (g.price || 0) - (g.downPayment || 0),
        currentValue: g.price || 0,
        calculatedPmt: 0
    }));

    let activeDebts = (debts || []).filter(d => !!d).map(d => ({ ...d }));
    let hasHitFire = false;

    const user1 = config.users[0];
    const currentAge = user1?.age || 30;
    // D2.3: suppression de `new Date().getFullYear()` (rendait la simulation
    // non déterministe — résultat dépendait de l'horloge système).
    // La variable n'était de toute façon jamais utilisée.

    // Cycle 22 split: droits CELI/REER historiques → ./projection/setupSimulation
    const { totalHistoricalCeliRoom, totalHistoricalRrspRoom, activeUsersCount } =
        computeHistoricalContributionRoom(config.users, baseGrossAnnual, startYear);

    // Cycle 22 split: Smile Curve factor → ./projection/setupSimulation
    const smileLifestyleFactor = makeSmileLifestyleFactor(effProj.useSmileCurve);

    let useManualBalances = effProj.useManualBalances ?? false;
    let manualCELIRoom = effProj.manualCELIRoom ?? 0;
    let manualRRSPRoom = effProj.manualREERRoom ?? 0;

    let celiRoom = useManualBalances ? manualCELIRoom : Math.max(0, totalHistoricalCeliRoom - celi);
    let rrspRoom = useManualBalances ? manualRRSPRoom : Math.max(0, totalHistoricalRrspRoom - reer);

    let fhsaEligibleUsersCount = config.users.filter(u => u && !u.hasOwnedPropertyLast4Years).length;
    if (celiapp > 0 && fhsaEligibleUsersCount === 0) fhsaEligibleUsersCount = 1;
    
    let fhsaRoom = 0;
    const celiappOpeningYear = celiapp > 0 ? (startYear - 1) : startYear;
    if (startYear === celiappOpeningYear) { 
        fhsaRoom = FHSA_ANNUAL_LIMIT_PER_USER * fhsaEligibleUsersCount;
    }

    let fhsaClosingYear: number | null = -1;
    let fhsaLifetimeContrib = Math.min(celiapp, FHSA_LIFETIME_LIMIT_PER_USER * fhsaEligibleUsersCount);
    let accFhsaYear = 0;
    
    let hasPurchasedPrimary = false;
    const hasFuturePurchase = realEstateGoals.some(g => g.isActive && g.isPrimaryResidence);
    let hasLoggedRetirement = false;

    let psvResidencyYears = [0, 0];
    config.users.filter(u => u).forEach((u, idx) => {
        const birthYear = u.birthYear || (startYear - (u.age || 30));
        const residencyStart = getResidencyStartYear(birthYear, u.isImmigrant, u.canadaArrivalYear);
        psvResidencyYears[idx] = Math.max(0, startYear - Math.max(residencyStart, birthYear + 18));
    });

    // Cycle 22 split: scenario overrides (inflation + rates) → ./projection/setupSimulation
    const { simInflation, baseRates } = computeScenarioOverrides(projection as unknown as { inflationRate?: number; returnRates?: { celi: number; reer: number; nonReg: number; crypto: number; cash: number } } & Record<string, unknown>, scenarioType);

    let overrideRetirementAge = retirementGoal.targetAge || 65;
    if (scenarioType === 'LIBERTE_55') overrideRetirementAge = 55;
    // C1-fix (audit 2026-06) : « reporter les rentes » (delayPensions) ne force PLUS
    // l'âge d'arrêt de travail. delayPensions ne pilote QUE le début RRQ/PSV (à 70,
    // cf retirementIncome). L'âge de retraite reste celui choisi → permet le cas clé
    // « arrêter à 60, vivre du REER/CELI, reporter RRQ/PSV à 70 » (le moteur ponte le
    // revenu via le décaissement des comptes entre l'arrêt et le début des rentes).
    const effectiveRetirementAge = overrideRetirementAge;
    const retirementMonthIndex = (effectiveRetirementAge - currentAge) * 12;

    const effectiveBaseExpenses = projection.useTheoretical ? (projection.theoreticalExpenses || 4000) : baseMonthlyExpenses;
    const fireTargetAnnual = effectiveBaseExpenses * 12;
    // Règle des 4% (Trinity Study, 1998) : on peut retirer 4%/an d'un
    // portefeuille sans l'épuiser → capital cible = dépenses annuelles × 25.
    const fireTargetNetWorth = fireTargetAnnual * 25;

    // FIX cycle 2 TS reviewer: type explicite pour éviter inférence `null` (cascade strict)
    let month1ActionPlan: { monthlyCashflow: number; strategy: AllocationStrategy } | null = null;
    let accGrossIncomeYear = 0;
    let accRrspYear = 0;

    let taxCurrentYear = { revenu: 0, gains: 0, reer: 0, divers: 0 };
    let taxPreviousYear = { revenu: 0, gains: 0, reer: 0, divers: 0 };

    let accRetraitsReerYear = 0;
    let accRentesYear = 0;
    let rapBorrowed = 0;
    let rapRepaymentDueTotal = 0;
    let rapRepaymentStartOffset = 0;
    let hasUsedRap = false;
    let celiWithdrawalsThisYear = 0; 

    let oasClawbackNextPeriod = 0;
    let monthlyOasReduction = 0;
    let monthsSinceLastVehicle = 0;
    let smithManoeuvreDebt = 0;
    let smithInterestDeductibleYear = 0;
    let capitalLossBank = 0;
    let accCapitalGainsYear = 0;
    let prevPortfolioNW = 0;
    let guytonKlinger_freezeInflation = false;
    let expenseMultiplier = 1;

    // V65: Advanced Metrics Tracking
    let totalTaxesPaid = 0;
    let totalGrowth = 0;
    let totalExpenses = 0;
    let minNetWorth = liquid + celi + celiapp + reer + nonReg + crypto + reee;
    let shortfallMonths = 0;

    let reeeTracker: Record<string, { scee: number; iqee: number; contribLifetime: number }> = {};

    // Cycle 22 split: revenus net/brut baseline → ./projection/setupSimulation
    const { incomeMarcNetMonthly, incomeAnnaNetMonthly, grossMarcBaseAnnual, grossAnnaBaseAnnual } =
        computeIncomeBaseline(projection, config.users);

    // Phase 1 refactor « REER par conjoint » (cf docs/REFACTOR_REER_PAR_CONJOINT.md) : registre
    // REER par conjoint maintenu EN PARALLÈLE du solde commun (qui reste la vérité). Clé = part
    // salariale. Invariant Σ(reerByUser) == reer garanti par stepReerByUser. Shadow en Phase 1
    // (non consommé par la fiscalité encore) → zéro changement de résultat.
    const reerShares = salaryShares(
        activeUsersCount > 1 ? [grossMarcBaseAnnual, grossAnnaBaseAnnual] : [grossMarcBaseAnnual + grossAnnaBaseAnnual],
    );
    let reerByUser = splitByShares(reer, reerShares);
    // Phase 2 : retraits REER de l'ANNÉE attribués par conjoint (au prorata des soldes au moment du
    // retrait). Invariant Σ == accRetraitsReerYear. Consommé par taxDecember (impôt par conjoint sur
    // les vrais retraits, au lieu du split 50/50). Reset chaque janvier comme l'accumulateur commun.
    let accRetraitsReerYearByUser: number[] = reerShares.map(() => 0);

    const simSalaryGrowth = effProj.salaryGrowth ?? 2.5;
    const simEFMonths = effProj.emergencyFundMonths || 3;

    // Cycle 27 split: stressTest config construit une fois (évite re-création par itération)
    const stressTestConfig: StressTestConfig | null = effProj.stressTestEnabled ? {
        enabled: true,
        year: effProj.stressTestYear || 5,
        recoveryMonths: effProj.stressTestRecoveryMonths || 24,
        inflationShock: effProj.stressTestInflationShock || 0,
    } : null;

    // Cycle 22 split: la baseline RRQ (facteur d'ajustement + pension de base) est
    // recalculée dans les sous-modules de retraite. Seul psvBasePension (PSV) est
    // consommé directement ici.
    const { psvBasePension } = computeRrqAdjustment(delayPensions, retirementGoal);

    // D2.2: RRIF_RATES et welcomeTax → ./projection/helpers

    let prevCELI = celi, prevREER = reer, prevLiquid = liquid, prevNW = (liquid + celi + reer + nonReg + crypto + reee);

    // D2.8: État LTC (Long-Term Care). Une fois déclenché, le coût mensuel
    // s'ajoute aux dépenses jusqu'à la fin de la simulation.
    let ltcActive = false;
    let nonRegACB = nonReg;
    // M-4 (2026-06) : coût de base crypto, convention identique à nonRegACB (= valeur de départ →
    // aucun gain latent sur les avoirs initiaux ; seule la croissance future est imposable). Sur une
    // vente, on ne taxe que le gain (produit − coût de base proportionnel), pas 100 % du produit.
    let cryptoACB = crypto;

    // Cycle 25 split: handleNonRegSale partagé → ./projection/portfolioOps
    // Closure-wrapper: synchronise les let locaux avec le state object.
    const handleNonRegSale = (amount: number, _label: string): number => {
        const ms = { nonReg, nonRegACB, capitalLossBank, accCapitalGainsYear };
        const sold = portfolioNonRegSale(ms, amount);
        nonReg = ms.nonReg;
        nonRegACB = ms.nonRegACB;
        capitalLossBank = ms.capitalLossBank;
        accCapitalGainsYear = ms.accCapitalGainsYear;
        return sold;
    };

    let incomeRetirement = 0; // Scoped outside for Estate NW calculation
    // A1 — revenu de retraite mensuel ATTRIBUABLE par conjoint (RRQ/PSV/DB), pour
    // l'impôt par conjoint en décembre. Total == incomeRetirement.
    let incomeRetirementPerUser: number[] = [];
    // Phase 3 (fractionnement 65+) : composante DB (rente viagère) mensuelle PAR CONJOINT — partie
    // ADMISSIBLE au fractionnement à tout âge (vs RRQ/PSV non fractionnables). Cf taxDecember.
    let incomeRetirementDbPerUser: number[] = [];
    // FA-3a — SRG mensuel familial (NON imposable) : exclu de l'assiette de décembre.
    let incomeRetirementGis = 0;
    // FA-3b — revenu imposable AUTRE de l'année PRÉCÉDENTE (retraits REER + loyers, nominal),
    // capturé au reset de janvier : assiette du test SRG (le vrai SRG regarde l'année passée).
    let prevYearOtherIncomeForGisNominal = 0;
    // Phase 3 Tier 3 — split par source (RRQ + PSV + privée) pour chartData
    let pensionRRQ = 0;
    let pensionPSV = 0;
    let pensionPrivee = 0;

    // D2.8: Mortalité stochastique. En MC, à chaque début d'année on tire la
    // probabilité de décès du user principal. Le loop arrête à la mort.
    let isDead = false;

    // W1.4: Survivant. Si modelSurvivor=ON, lorsque le CONJOINT (user2) décède
    // (trySpouseMortality), on continue avec user1 SURVIVANT, avec ajustements :
    // - RRQ du défunt → 60 % versés au survivant (max RRQ standard)
    // - PSV du défunt → cesse ; revenu actif user2 → 0 (activeIncome.ts)
    // - DB → continue selon dbElectionType / dbSurvivorPct
    // - REER du défunt → roulé au survivant sans imposition immédiate
    // (FA-10 : l'ancien commentaire disait l'INVERSE — « user1 mort, user2 vivant » —
    // alors que l'implémentation zéroïse user2 ; corrigé pour éviter les contresens.)
    let spouseAlive = activeUsersCount > 1;
    let survivorMode = false;        // user2 (conjoint) mort, user1 SURVIVANT
    let survivorTriggerLogged = false; // log à la prochaine itération (logEvent défini in-loop)
    const rrqSurvivorPct = (effProj.rrqSurvivorPct ?? 60) / 100;
    const dbSurvivorPct = (effProj.spouseDbSurvivorPct ?? retirementGoal.dbSurvivorPct ?? 60) / 100;

    // W1.2: Bootstrap historique - construit une séquence par scénario MC
    // W4.5: Replay historique - mode déterministe forcé à partir d'une année
    const replayYear = effProj.replayHistoricalYear;
    const useBootstrap = !!effProj.useHistoricalBootstrap && enableMonteCarlo;
    let historicalSequence: YearReturn[] | null = null;
    if (replayYear) {
        historicalSequence = buildReplaySequence(replayYear, projection.years + 1);
    } else if (useBootstrap) {
        historicalSequence = buildHistoricalSequence(rng, projection.years + 1, effProj.bootstrapBlockSize ?? 24);
    }

    // D2.10: Perte d'emploi stochastique. unemployedMonthsRemaining > 0
    // pendant la période sans emploi (revenu réduit à 55% capé AE).
    let unemployedMonthsRemaining = 0;

    // W3.x — États événements de vie stochastiques (résident hors loop)
    let divorced = false;                       // une fois divorcé, reste divorcé
    let divorceLogged = false;
    let ltdMonthsRemaining = 0;                 // invalidité longue durée
    let ltdLogged = false;
    let inheritanceReceived = false;
    let ciTriggered = false;                     // FIX agent: empêche re-déclenchement maladie grave

    // §7.A.3 — Pré-calcule les Date des 360+ mois en une passe.
    // Avant : 2 allocations Date + 1 setMonth par itération mois × 100 itér MC ×
    // 7 scénarios = 504k allocations par calculateFutureProjection().
    // Après : N allocations par runScenario (N = years*12+1), réutilisées.
    const totalMonths = projection.years * 12 + 1;
    const loopDates: Date[] = new Array(totalMonths);
    for (let i = 0; i < totalMonths; i++) {
        loopDates[i] = new Date(startYear, startMonth + i, 1);
    }

    for (let m = 0; m <= projection.years * 12; m++) {
        const currentLoopDate = loopDates[m];
        // Mois CALENDAIRE réel (0=jan … 11=déc), PAS le mois-dans-la-projection.
        // Indispensable quand la projection démarre ≠ janvier : les déclencheurs
        // annuels (reset janvier, règlement d'impôt d'avril, year-end décembre)
        // doivent tomber aux vrais mois civils. No-op quand startMonth=0 (=== m%12).
        const currentMonthIndex = currentLoopDate.getMonth();
        const loopYear = currentLoopDate.getFullYear();


        const age = currentAge + Math.floor(m / 12);
        const isRetired = age >= effectiveRetirementAge;

        // Cycle 9 split: mortalité user + conjoint → ./projection/stochasticEvents
        if (tryMortality({ m, currentMonthIndex, age, enableMonteCarlo, rng }, effProj, isDead)) {
            isDead = true;
        }
        const spouseAge = (config.users[1]?.age || 30) + Math.floor(m / 12);
        if (trySpouseMortality({ m, currentMonthIndex, enableMonteCarlo, rng }, effProj, spouseAge, spouseAlive, survivorMode)) {
            spouseAlive = false;
            survivorMode = true;
            survivorTriggerLogged = false;
        }

        if (isDead) break;

        // --- 1. GROWTH & MARKET SHOCKS ---
        // Cycle 27 split: chocs de marché + bootstrap historique + stress test inflation → ./projection/marketShocks
        const { mcCeliRate, mcReerRate, mcNonRegRate, mcCryptoRate, mcCashRate, currentInflation } =
            computeMonthlyMarketRates(m, enableMonteCarlo, baseRates, simInflation, historicalSequence, stressTestConfig, rng);

        // Cycle 29 split: inflation effective des dépenses → ./projection/monthlyCalcs
        const effectiveExpenseInflation = computeEffectiveExpenseInflation(age, isRetired, currentInflation, effProj);
        if (!guytonKlinger_freezeInflation) {
            expenseMultiplier *= Math.pow(1 + effectiveExpenseInflation / 100, 1 / 12);
        }

        prevCELI = celi;
        prevREER = reer;
        prevLiquid = liquid;
        // realEstateEquity est DÉJÀ net d'hypothèque (currentValue − mortgage, cf
        // realEstateMonth.ts:326). Ne PAS re-soustraire mortgageBalance (sinon
        // l'hypothèque est comptée 2×, ce qui faisait plonger le NW dès l'achat).
        prevNW = (liquid + celi + reer + nonReg + crypto + reee + realEstateEquity);

        let monthlyIncome = 0;
        let monthlyExpenses = 0;
        let incomeMarc = 0;
        let incomeAnna = 0;
        incomeRetirement = 0;
        incomeRetirementPerUser = [];
        incomeRetirementDbPerUser = [];
        pensionRRQ = 0;
        pensionPSV = 0;
        pensionPrivee = 0;
        let childGrossCost = 0;
        let childBenefits = 0;
        let childMonthlyCost = 0;
        let reeeContribMonthly = 0;
        let reeePayoutMonthly = 0;
        let immoHypo = 0;
        let immoCharges = 0;
        let immoInterest = 0;
        let immoPrincipal = 0;

        let lifeEventsLog: string[] = [];
        let flowEventsLog: string[] = [];
        // FIX silent-failure: les événements stochastiques de vie (divorce, LTC,
        // LTD, CI, héritage, perte emploi, décès conjoint, mortalité) ne se
        // déclenchent QUE quand enableMonteCarlo. Si on gate ici par !MC, on
        // perd tous les logs d'événements. lifeEventsLog est cappé à 50 entrées.
        const logEvent = (arr: string[], msg: string) => { if (arr.length < 50) arr.push(msg); };

        // W1.4: log différé du décès conjoint (déclenché plus haut avant l'init de logEvent)
        if (survivorMode && !survivorTriggerLogged) {
            const spouseAge = (config.users[1]?.age || 30) + Math.floor(m / 12);
            logEvent(lifeEventsLog, `🖤 Décès du conjoint à ${spouseAge} ans — bascule en mode survivant`);
            survivorTriggerLogged = true;
        }

        // V90: Windfall Injection (L'Héritage Inattendu)
        if (scenarioType === 'WINDFALL' && m === 60) {
            const windfallAmount = 250000;
            liquid += windfallAmount;
            logEvent(lifeEventsLog, `🎁 Héritage Inattendu: +250 000$`);
            logEvent(flowEventsLog, `💰 WINDFALL: Injection de surplus.`);
        }

        // Phase 4 #4 — Héritage tardif: même montant mais 20 ans plus tard.
        // Teste la capacité à tenir le pont financier longtemps avant l'apport.
        if (scenarioType === 'LATE_INHERITANCE' && m === 240) {
            const lateAmount = 250000;
            liquid += lateAmount;
            logEvent(lifeEventsLog, `⏳ Héritage Tardif (an 20): +250 000$`);
            logEvent(flowEventsLog, `💰 LATE_INHERITANCE: enfin libéré.`);
        }

        // Phase 2: Restitution du CELI en JANVIER (Mois 0)
        if (currentMonthIndex === 0 && m > 0) {
            celiRoom += celiWithdrawalsThisYear;
            celiWithdrawalsThisYear = 0;
            flowEventsLog.push(`🔄 CELI: Régénération de l'espace de cotisation`);
        }
        let fluxImpots = 0;
        let impotGainsMois = 0; // V29: Gains en capital (taxes payées ce mois ou différées)
        let impotDiversMois = 0; // V29: Taxes divers (FHSA, etc.)
        let retraitReerMois = 0;
        let retraitCeliMois = 0;
        let impotReerMois = 0; // V24: Impôt sur retraits REER, séparé de fluxImpots
        let impotSalaireMois = 0; // V36: Impôt sur salaire (retenues/provision)
        let taxOnRrif = 0; // V49: Impôt FERR retenu à la source

        // V27: Variables de suivi pour le mois en cours
        let contribCELI = 0, withdrawalCELI = 0;
        let contribREER = 0, withdrawalREER = 0;
        let contribNonReg = 0, withdrawalNonReg = 0;
        let contribCrypto = 0, withdrawalCrypto = 0;
        let contribLiquid = 0, withdrawalLiquid = 0;
        let contribCELIAPP = 0, withdrawalCELIAPP = 0;
        let contribREEE = 0, withdrawalREEE = 0;

        let growthCELI = 0, growthPctCELI = 0;
        let growthREER = 0, growthPctREER = 0;
        let growthNonReg = 0, growthPctNonReg = 0;
        let growthCrypto = 0, growthPctCrypto = 0;
        let growthLiquid = 0, growthPctLiquid = 0;
        let growthCELIAPP = 0, growthPctCELIAPP = 0;
        let growthREEE = 0, growthPctREEE = 0;


        // Le temps passe et on vit au Canada, retraité ou non (jusqu'à 65 ans max pour l'accumulation PSV)
        config.users.filter(u => u).forEach((u, idx) => {
            const birthYear = u.birthYear || (startYear - (u.age || 30));
            const currentAgeUser = loopYear - birthYear;
            if (currentAgeUser >= 18 && currentAgeUser < 65) {
                psvResidencyYears[idx] += 1 / 12;
            }
        });

        // ---- PHASE RETRAITE ----
        if (isRetired) {
            if (!hasLoggedRetirement) {
                lifeEventsLog.push('📍 Début Retraite');
                hasLoggedRetirement = true;
            }
            // Cycle 13 split: calcul RRQ/PSV/DB → ./projection/retirementIncome
            const retirementBreakdown = computeRetirementIncome(
                { m, age, simInflation, activeUsersCount, baseGrossAnnual, delayPensions,
                  survivorMode, monthlyOasReduction, dbSurvivorPct, rrqSurvivorPct, psvResidencyYears,
                  startYear,
                  // FA-3b — le test SRG regarde le revenu de l'ANNÉE PRÉCÉDENTE (retraits REER + loyers).
                  otherIncomeAnnualLaggedNominal: prevYearOtherIncomeForGisNominal },
                retirementGoal,
                config.users,
            );
            incomeRetirement = retirementBreakdown.total;
            incomeRetirementPerUser = retirementBreakdown.perUser.map(p => p.total);
            incomeRetirementDbPerUser = retirementBreakdown.perUser.map(p => p.privee);
            incomeRetirementGis = retirementBreakdown.gis;
            pensionRRQ = retirementBreakdown.rrq;
            pensionPSV = retirementBreakdown.psv;
            pensionPrivee = retirementBreakdown.privee;
            monthlyIncome = incomeRetirement;

            // D2.3: monthlyExpenses est défini de façon unique dans le bloc
            // EXPENSES & EVENTS plus bas (évite la double affectation).
        } else {
            // ---- PHASE ACTIVE ----
            // Cycle 15 split: salaire + job loss/LTD + bonus/RSU → ./projection/activeIncome
            const aiResult = computeActiveIncome(
                { m, currentMonthIndex, simSalaryGrowth, enableMonteCarlo, rng,
                  incomeMarcNetMonthly, incomeAnnaNetMonthly, survivorMode,
                  grossMarcBaseAnnual, grossAnnaBaseAnnual,
                  unemployedMonthsRemaining, ltdMonthsRemaining, ltdLogged },
                effProj,
                config.users,
            );
            incomeMarc = aiResult.incomeMarc;
            incomeAnna = aiResult.incomeAnna;
            monthlyIncome = aiResult.monthlyIncome;
            accGrossIncomeYear += aiResult.accGrossAdd;
            unemployedMonthsRemaining = aiResult.newUnemployedMonths;
            ltdMonthsRemaining = aiResult.newLtdMonths;
            ltdLogged = aiResult.ltdLogged;
            aiResult.lifeEventLogs.forEach(msg => logEvent(lifeEventsLog, msg));
        }

        // --- 3. MONTHLY EXPENSES & EVENTS ---
        if (isRetired) {
            // D2.5: Smile Curve appliquée au besoin de retraite (1 si flag off).
            monthlyExpenses = Math.abs(retirementGoal.targetMonthlyIncome) * expenseMultiplier * smileLifestyleFactor(age);
        } else {
            // Active phase income & expenses
            monthlyExpenses = effectiveBaseExpenses * expenseMultiplier;
        }

        // Cycle 9 split: LTC trigger + coût mensuel → ./projection/stochasticEvents
        if (tryLtcTrigger({ age, enableMonteCarlo, rng }, effProj, ltcActive)) {
            ltcActive = true;
            logEvent(lifeEventsLog, `🏥 Soins de longue durée déclenchés à ${age} ans`);
        }
        if (ltcActive) {
            monthlyExpenses += ltcMonthlyCost(effProj, expenseMultiplier);
        }

        // Cycle 10 split: divorce → ./projection/stochasticEvents (tryDivorce)
        // Le splitter callback mute toutes les locales en un point.
        if (tryDivorce({ m, currentMonthIndex, enableMonteCarlo, rng }, effProj, divorced, (keep) => {
            liquid *= keep;
            celi *= keep;
            celiapp *= keep;
            reer *= keep;
            nonReg *= keep;
            nonRegACB *= keep;
            crypto *= keep;
            reee *= keep;
            realEstateEquity *= keep;
            mortgageBalance *= keep;
            propertiesState = propertiesState.map(p => ({
                ...p,
                currentValue: p.currentValue * keep,
                mortgage: p.mortgage * keep,
            }));
        })) {
            divorced = true;
        }
        if (divorced && !divorceLogged) {
            logEvent(lifeEventsLog, `💔 Divorce (-${(effProj.divorceSplitPct ?? 50)}% patrimoine)`);
            divorceLogged = true;
        }
        if (divorced) {
            const alimony = effProj.divorceAlimonyMonthly || 0;
            monthlyExpenses += alimony * expenseMultiplier;
        }

        // Cycle 8 split: événements stochastiques one-shot (CI + héritage)
        // extraits dans ./projection/stochasticEvents.
        const stochCtx = { m, currentMonthIndex, age, currentAge, expenseMultiplier, enableMonteCarlo, rng };
        const stochMutator = {
            addLiquid: (amt: number) => { liquid += amt; },
            addExpense: (amt: number) => { monthlyExpenses += amt; },
            logLife: (msg: string) => logEvent(lifeEventsLog, msg),
        };
        if (tryCriticalIllness(stochCtx, effProj, ciTriggered, stochMutator)) ciTriggered = true;
        if (tryInheritance(stochCtx, effProj, inheritanceReceived, stochMutator)) inheritanceReceived = true;

        // Cycle 7 split: Sandwich generation (boomerang + caregiving) + Snowbird
        // extraits dans ./projection/w5Effects (applyAgeBasedExpenses).
        applyAgeBasedExpenses(
            { age, currentMonthIndex, isRetired, expenseMultiplier },
            effProj,
            { addExpense: (amt) => { monthlyExpenses += amt; } }
        );

        // Cycle 7 split: 6 effets W5.x extraits dans ./projection/w5Effects.ts
        // (insurance/véhicules cycliques/rénos majeures/dons charity/locatifs/CCPC).
        // Mutation via mutateur passé par référence — état partagé inchangé.
        applyW5Effects(
            { m, currentMonthIndex, currentLoopDate, startYear, startMonth, expenseMultiplier },
            { insurancePolicies, vehicleReplacements, majorRenovations, charitableGoals, rentalProperties, privateBusinesses },
            {
                addExpense: (amt) => { monthlyExpenses += amt; },
                addIncome: (amt) => { monthlyIncome += amt; },
                subtractLiquid: (amt) => { liquid -= amt; },
                addTaxRevenu: (amt) => { taxCurrentYear.revenu += amt; },
                addTaxGains: (amt) => { taxCurrentYear.gains += amt; },
                logFlow: (msg) => logEvent(flowEventsLog, msg),
                logLife: (msg) => logEvent(lifeEventsLog, msg),
            }
        );

        // --- 4. TAX WITHHOLDING & APRIL SETTLEMENT ---
        // Cycle 8 split: avril extrait dans ./projection/taxCycle (processAprilSettlement).
        const aprilResult = processAprilSettlement(currentMonthIndex, m, taxPreviousYear, {
            subtractLiquid: (amt) => { liquid -= amt; },
            addNonReg: (amt) => { nonReg += amt; },
            addNonRegACB: (amt) => { nonRegACB += amt; },
            logFlow: (msg) => logEvent(flowEventsLog, msg),
        });
        const taxPaidRevenu = aprilResult.taxPaidRevenu;
        const taxPaidGains = aprilResult.taxPaidGains;
        const taxPaidDivers = aprilResult.taxPaidDivers;
        const taxPaidREER = aprilResult.taxPaidREER;
        if (aprilResult.fluxImpots !== 0) {
            fluxImpots = aprilResult.fluxImpots;
            impotSalaireMois = taxPaidRevenu;
            impotReerMois = taxPaidREER;
            impotGainsMois = taxPaidGains;
            impotDiversMois = taxPaidDivers;
        }
        taxPreviousYear = aprilResult.newTaxPreviousYear;

        // Cycle 29 split: retenue salariale mensuelle → ./projection/monthlyCalcs
        if (!isRetired) {
            taxCurrentYear.revenu += computeMonthlyWithholding(
                // FA-10 (suivi silent-failure-hunter) : salaire du défunt à 0 — sinon la retenue
                // fantôme accrue survivait à une année de TRANSITION vers la retraite (la branche
                // retraité de décembre fait `+=`, pas une assignation) et était PAYÉE en avril.
                { m, loopYear, simInflation, simSalaryGrowth, grossMarcBaseAnnual,
                  grossAnnaBaseAnnual: survivorMode ? 0 : grossAnnaBaseAnnual,
                  contribREER, contribCELIAPP, smithInterestDeductibleYear,
                  enableMonteCarlo, optimizeSourceDeductions: effProj.optimizeSourceDeductions },
                calculateFiscalReport,
            );
            impotSalaireMois = 0;
        }

        // Cycle 11 split: December tax filing → ./projection/taxCycle.processDecemberTaxFiling
        if (currentMonthIndex === 11 && m > 0) {
            const yearsElapsed = Math.floor(m / 12);
            const inflationFactor = Math.pow(1 + simInflation / 100, yearsElapsed);
            // FA-10 — nombre de CONTRIBUABLES vivants (≠ activeUsersCount qui reste la taille du
            // ménage) : sert à la récolte de gains (palier ×1) ET au dépôt fiscal ci-dessous.
            const taxFilers = survivorMode ? 1 : activeUsersCount;

            // Levier « récolte de gains » (timing) : réalise des gains non-enreg latents dans une
            // année à faible revenu pour remplir le 1er palier (ACB relevé). À FAIRE AVANT le dépôt
            // fiscal de décembre → le gain réalisé entre dans accCapitalGainsYear et est imposé CETTE
            // année (au taux bas), sans fuite (l'ACB monte du montant imposé).
            // FA-10 : palier du SURVIVANT seul (×1) et sans le salaire fantôme du défunt — sinon le
            // levier récoltait avec une marge de palier doublée par un contribuable mort.
            const ghOtherNominal = isRetired
                ? (incomeRetirement * 12 + accRentesYear + accRetraitsReerYear)
                : (grossMarcBaseAnnual + (survivorMode ? 0 : grossAnnaBaseAnnual)) * Math.pow(1 + simSalaryGrowth / 100, yearsElapsed);
            const gh = processGainHarvesting({
                enabled: !!overrides.gainHarvesting,
                nonReg, nonRegACB, otherTaxableNominal: ghOtherNominal,
                existingGainsNominal: accCapitalGainsYear, activeUsersCount: taxFilers, loopYear,
            });
            if (gh.harvestedGain > 0) {
                accCapitalGainsYear += gh.harvestedGain;
                nonRegACB += gh.harvestedGain;
                if (gh.logMsg) logEvent(flowEventsLog, gh.logMsg);
            }

            // FA-10 — survivorMode : UN seul contribuable (user2 décédé, cf. activeIncome.ts:61 ;
            // le roulement REER fait que tout le revenu de retraite est celui du SURVIVANT user1).
            // Même traitement que le clawback FA-2 (oasBeneficiaries) : n=1, pas de décomposition
            // par conjoint, pas d'ageSpouse (⇒ pas de crédits d'âge du défunt, pas de fractionnement
            // avec lui, seuils RAMQ/ligne 361 célibataire, RAMQ/FSS ×1), salaire du défunt à 0 dans
            // la branche active. La DB par conjoint est AGRÉGÉE sur une tête (l'assiette du crédit
            // pension / fractionnable reste complète — la diviser perdait la moitié du crédit).
            // Avant : le revenu du survivant était réparti sur 2 têtes → barème progressif appliqué
            // 2× à demi-revenu + crédits du défunt + fractionnement fictif = sous-imposition.
            const decResult = processDecemberTaxFiling(
                currentMonthIndex,
                {
                    m, loopYear, isRetired, enableMonteCarlo,
                    yearsElapsed, inflationFactor,
                    activeUsersCount: taxFilers,
                    grossMarcBaseAnnual,
                    grossAnnaBaseAnnual: survivorMode ? 0 : grossAnnaBaseAnnual,
                    simSalaryGrowth,
                    optimizeSourceDeductions: effProj.optimizeSourceDeductions,
                    incomeRetirementMonthly: incomeRetirement,
                    // FA-3a — SRG mensuel familial : NON IMPOSABLE (Service Canada), soustrait
                    // de l'assiette imposable par taxDecember (revenu cash inchangé).
                    incomeRetirementGisMonthly: incomeRetirementGis,
                    // A1 — décomposition par conjoint pour imposer chacun sur SON revenu de
                    // retraite réel (split égal sinon, cf. taxDecember). Vide hors retraite.
                    incomeRetirementPerUserMonthly: survivorMode ? undefined : incomeRetirementPerUser,
                    // Phase 3 — composante DB mensuelle par conjoint (fractionnement 65+).
                    incomeRetirementDbPerUserMonthly: survivorMode
                        ? [incomeRetirementDbPerUser.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)]
                        : incomeRetirementDbPerUser,
                    nonReg, baseNonRegRate: baseRates.nonReg,
                    accRrspYear, accFhsaYear, smithInterestDeductibleYear,
                    accRentesYear, accRetraitsReerYear, accCapitalGainsYear,
                    accRetraitsReerYearByUser: survivorMode ? undefined : accRetraitsReerYearByUser,
                    age,
                    // B-AUDIT-3 — âge courant du conjoint (user[1]) pour les crédits d'âge/
                    // pension PAR conjoint dans l'impôt de décembre. undefined si pas de conjoint
                    // (ou conjoint décédé — FA-10).
                    ageSpouse: (!survivorMode && config.users[1]) ? (config.users[1].age || 30) + yearsElapsed : undefined,
                    // §6.4 RAMQ: nombre d'enfants à charge (relève le seuil d'exemption).
                    // Approximé via childGoals.length faute de champ dédié dans User.
                    // TODO: ajouter `User.dependentChildrenCount` pour précision.
                    childrenCount: activeChild.length,
                    // §6.4 RAMQ: exempt si couverture privée (employeur/association).
                    // TODO: flag `User.hasPrivateDrugInsurance` à ajouter. Par défaut
                    // false (paie au régime public) — conservateur pour FinanceAI.
                    ramqExempt: false,
                },
                { calculateFiscalReport, getMarginalRate, calculateDividendTax, getDividendGrossUpRate },
                taxCurrentYear,
            );
            taxCurrentYear = decResult.newTaxCurrentYear;
            decResult.logs.forEach(msg => logEvent(flowEventsLog, msg));

            accCapitalGainsYear = 0;
            smithInterestDeductibleYear = 0;
            accRrspYear = 0;
            accFhsaYear = 0;

            // V30: Transfer accumulated taxes to the 'previous year' bucket to be paid in April.
            taxPreviousYear = { ...taxCurrentYear };
            taxCurrentYear = { revenu: 0, gains: 0, reer: 0, divers: 0 };

            // V28 + Cycle 12: TFSA Room reset géré en Janvier — voir processJanuaryReset (./projection/taxJanuary)

            // V28: FHSA Room reset
            const yearsSinceOpening = loopYear - celiappOpeningYear;
            if (yearsSinceOpening < 15 && fhsaLifetimeContrib < FHSA_LIFETIME_LIMIT_PER_USER * activeUsersCount) {
                fhsaRoom = FHSA_ANNUAL_LIMIT_PER_USER * activeUsersCount;
            }

            // Cycle 10 split: TLH → ./projection/taxCycle (processTaxLossHarvesting)
            const currentNonRegRate = enableMonteCarlo ? mcNonRegRate : baseRates.nonReg;
            const tlhResult = processTaxLossHarvesting(currentMonthIndex, m, nonReg, nonRegACB, currentNonRegRate);
            if (tlhResult.harvestedLoss > 0) {
                capitalLossBank += tlhResult.harvestedLoss;
                nonRegACB += tlhResult.acbDelta;
                if (tlhResult.logMsg) logEvent(flowEventsLog, tlhResult.logMsg);
            }
        }

        // Cycle 10 split: OAS Clawback → ./projection/taxCycle (computeOasClawback)
        // FA-2 — décomposition par conjoint transmise : le seuil de récupération est PAR
        // PARTICULIER (revenu_i vs seuil), plus jamais l'agrégat familial vs seuil individuel.
        if (currentMonthIndex === 11 && m > 0 && isRetired && age >= 65) {
            // FA-3a — le SRG (non imposable, hors revenu net de récupération en pratique) est
            // exclu du revenu de clawback, total ET par conjoint (réparti également).
            // NB : pas de clamp sur (v − gisShare) — un négatif est fini, économiquement correct
            // (très loin du seuil → aucun clawback) et PRÉSERVE l'invariant Σ(perUser) == total
            // que computeOasClawback vérifie (garde de somme symétrique).
            // survivorMode (retour code-reviewer FA-2) : un seul bénéficiaire VIVANT — diviser le
            // revenu du survivant par activeUsersCount=2 sous-estimerait son clawback. n=1 et pas
            // de décomposition (repli = revenu complet vs seuil individuel, exact pour 1 personne).
            const oasBeneficiaries = survivorMode ? 1 : activeUsersCount;
            const gisShare = incomeRetirementGis / Math.max(1, oasBeneficiaries);
            const oasResult = computeOasClawback(
                currentMonthIndex, m, isRetired, age, expenseMultiplier,
                incomeRetirement - incomeRetirementGis, accRetraitsReerYear, accRentesYear,
                psvBasePension, simInflation,
                oasBeneficiaries,
                survivorMode ? undefined : incomeRetirementPerUser.map((v) => v - gisShare),
                survivorMode ? undefined : accRetraitsReerYearByUser,
            );
            oasClawbackNextPeriod = oasResult.clawbackAnnual;
            if (oasResult.logMsg) flowEventsLog.push(oasResult.logMsg);
        }

        // Cycle 12 split: January reset → ./projection/taxCycle.processJanuaryReset
        const janResult = processJanuaryReset(
            currentMonthIndex,
            {
                m, startYear, simInflation, age, isRetired, activeUsersCount,
                oasClawbackNextPeriod, hasPurchasedPrimary,
                celiappOpeningYear, fhsaEligibleUsersCount,
                users: config.users,
                celiapp, reer, liquid, nonReg, crypto, celi,
                accGrossIncomeYear, accRetraitsReerYearOld: accRetraitsReerYear,
                incomeRetirementMonthly: incomeRetirement,
                fhsaRoomCurrent: fhsaRoom, fhsaLifetimeContrib,
                celiRoomCurrent: celiRoom, rrspRoomCurrent: rrspRoom,
                taxCurrentYearGains: taxCurrentYear.gains,
                prevPortfolioNW, loopYear,
            },
            { RRIF_RATES, calculateFiscalReport },
        );
        if (janResult) {
            // FA-3b — capture du revenu imposable AUTRE de l'année qui se termine (retraits
            // REER/FERR + loyers, nominal) AVANT le reset : c'est l'assiette du test SRG de la
            // nouvelle année (le vrai SRG est établi sur la déclaration de l'année précédente).
            // Limites assumées (doc §6) : année 1 sans historique → assiette RRQ+DB seule (12 mois,
            // optimiste) ; le SALAIRE de l'année précédant la retraite n'est pas compté ; janvier de
            // l'année Y utilise l'assiette Y-2 (capture après le calcul de janvier — tolérance modèle,
            // le vrai cycle SRG court juillet→juin).
            prevYearOtherIncomeForGisNominal = accRetraitsReerYear + accRentesYear;
            accRetraitsReerYear = janResult.accRetraitsReerYearReset;
            accRetraitsReerYearByUser = accRetraitsReerYearByUser.map(() => 0);
            accRentesYear = janResult.accRentesYearReset;
            monthlyOasReduction = janResult.monthlyOasReduction;
            celiRoom += janResult.celiRoomDelta;
            fhsaRoom = janResult.fhsaRoomNew;
            if (janResult.celiappTransferToReer > 0) {
                reer += janResult.celiappTransferToReer;
                celiapp = 0;
            }
            if (janResult.rrspRoomReset) {
                rrspRoom = 0;
            } else {
                rrspRoom += janResult.rrspRoomDelta;
            }
            accGrossIncomeYear = janResult.accGrossIncomeYearReset;
            // FERR
            if (janResult.ferrMandatoryGross > 0) {
                taxOnRrif = janResult.ferrTaxOnRrif;
                reer -= janResult.ferrMandatoryGross;
                taxCurrentYear.reer += janResult.ferrTaxOnRrif;
                impotReerMois += janResult.ferrTaxOnRrif;
                accRetraitsReerYear += janResult.ferrMandatoryGross;
                accRetraitsReerYearByUser = addByWeights(accRetraitsReerYearByUser, janResult.ferrMandatoryGross, reerByUser);
                liquid += janResult.ferrMandatoryGross;
                if (janResult.ferrLogMsg) flowEventsLog.push(janResult.ferrLogMsg);
            }
            // Guyton-Klinger
            guytonKlinger_freezeInflation = janResult.guytonKlingerFreeze;
            prevPortfolioNW = janResult.newPrevPortfolioNW;
            // Logs
            janResult.logs.forEach(msg => flowEventsLog.push(msg));
        }

        // Cycle 10/23 split: Auto-vehicle → ./projection/vehicleCycle (processAutoVehicleReplacement)
        monthsSinceLastVehicle++;
        const vehResult = processAutoVehicleReplacement(m, monthsSinceLastVehicle, effProj.vehicleReplacementEnabled, simInflation);
        if (vehResult.cost > 0) {
            liquid -= vehResult.cost;
            if (vehResult.resetCounter) monthsSinceLastVehicle = 0;
            if (vehResult.logMsg) lifeEventsLog.push(vehResult.logMsg);
        }

        // ---- DETTES ----
        // Si minimumPayment ≤ intérêts mensuels, la dette ne s'éteint jamais
        // (négatif amortissement). Bug observable sur cartes de crédit à
        // forte balance avec paiement minimum dérisoire. Garde-fou : forcer
        // un paiement effectif suffisant pour amortir en 25 ans maximum
        // (balance/300 + intérêts), même si le minimumPayment est plus bas.
        let debtPayments = 0;
        activeDebts.forEach(d => {
            if (d.balance > 0) {
                const interest = (d.balance * (d.interestRate / 100)) / 12;
                const principalFloor = d.balance / 300; // 300 = 25 ans × 12 mois
                const effectiveMinimum = Math.max(d.minimumPayment, interest + principalFloor);
                const payment = Math.min(d.balance + interest, effectiveMinimum);
                d.balance = d.balance + interest - payment;
                debtPayments += payment;
            }
        });
        monthlyExpenses += debtPayments;

        // Cycle 20 split: tout l'immobilier mensuel → ./projection/realEstateMonth
        const reState: RealEstateState = {
            liquid, celi, celiapp, reer, nonReg, nonRegACB, capitalLossBank,
            monthlyIncome, monthlyExpenses, accRentesYear, accCapitalGainsYear,
            realEstateEquity, mortgageBalance, hasPurchasedPrimary,
            hasUsedRap, rapBorrowed, rapRepaymentDueTotal, rapRepaymentStartOffset,
            smithManoeuvreDebt, smithInterestDeductibleYear,
            fhsaClosingYear,
            taxCurrentYearReer: taxCurrentYear.reer, impotReerMois,
            withdrawalLiquid, withdrawalCELI, withdrawalNonReg, withdrawalREER, contribLiquid,
            celiWithdrawalsThisYear, retraitCeliMois,
            immoInterest, immoPrincipal, immoHypo, immoCharges,
            totalRentalIncome: 0,
            lifeEventLogs: [], flowEventLogs: [],
        };
        processRealEstate(
            reState,
            { m, loopYear, isRetired, activeUsersCount, simInflation, simSalaryGrowth,
              grossMarcBaseAnnual, grossAnnaBaseAnnual, incomeRetirement,
              useSmithManoeuvre: effProj.useSmithManoeuvre === true, currentRentExpense,
              skipRapForPurchase: overrides.skipRapForPurchase ?? (strategy === 'PRIO_CELI_NO_RAP') },
            activeRE,
            propertiesState,
            getMonthOffset,
            welcomeTax,
            getMarginalRate,
        );
        liquid = reState.liquid; celi = reState.celi; celiapp = reState.celiapp;
        reer = reState.reer; nonReg = reState.nonReg; nonRegACB = reState.nonRegACB;
        capitalLossBank = reState.capitalLossBank;
        monthlyIncome = reState.monthlyIncome; monthlyExpenses = reState.monthlyExpenses;
        accRentesYear = reState.accRentesYear; accCapitalGainsYear = reState.accCapitalGainsYear;
        realEstateEquity = reState.realEstateEquity; mortgageBalance = reState.mortgageBalance;
        hasPurchasedPrimary = reState.hasPurchasedPrimary;
        hasUsedRap = reState.hasUsedRap; rapBorrowed = reState.rapBorrowed;
        rapRepaymentDueTotal = reState.rapRepaymentDueTotal;
        rapRepaymentStartOffset = reState.rapRepaymentStartOffset;
        smithManoeuvreDebt = reState.smithManoeuvreDebt;
        smithInterestDeductibleYear = reState.smithInterestDeductibleYear;
        fhsaClosingYear = reState.fhsaClosingYear;
        taxCurrentYear.reer = reState.taxCurrentYearReer;
        impotReerMois = reState.impotReerMois;
        withdrawalLiquid = reState.withdrawalLiquid; withdrawalCELI = reState.withdrawalCELI;
        withdrawalNonReg = reState.withdrawalNonReg; withdrawalREER = reState.withdrawalREER;
        contribLiquid = reState.contribLiquid;
        celiWithdrawalsThisYear = reState.celiWithdrawalsThisYear;
        retraitCeliMois = reState.retraitCeliMois;
        immoInterest = reState.immoInterest; immoPrincipal = reState.immoPrincipal;
        immoHypo = reState.immoHypo; immoCharges = reState.immoCharges;
        const totalRentalIncome = reState.totalRentalIncome;
        reState.lifeEventLogs.forEach(msg => logEvent(lifeEventsLog, msg));
        reState.flowEventLogs.forEach(msg => logEvent(flowEventsLog, msg));

        // ---- ENFANTS & REEE ----
        // Cycle 14 split: processOneChild → ./projection/childrenReee.
        // Les variables liquid/reee/monthlyIncome/incomeAnna sont commitées après le forEach.
        let _childLiquid = liquid;
        let _childReee = reee;
        let _childMonthlyIncome = monthlyIncome;
        let _childIncomeAnna = incomeAnna;
        activeChild.forEach((child, idx) => {
            const birthOffset = getMonthOffset(child.birthDate);
            if (!child.isActive || m < Math.max(0, birthOffset)) return;
            // birthOffset < 0 = enfant né AVANT le début de projection : il a déjà
            // son âge réel (m − birthOffset, donc > m) et n'est PAS « nouveau-né »
            // au mois 0. Le « first month » (congé parental, 1ers frais…) ne se
            // déclenche QUE s'il naît pendant la projection. Avant ce fix, un enfant
            // déjà né était traité comme nouveau-né à m=0 (revenu de congé parental
            // fantôme, ex. 2e parent inexistant chez un parent seul). Exposé par le
            // démarrage « aujourd'hui » (tout enfant existant a birthOffset < 0).
            const childAgeMonths = m - birthOffset;
            const isFirstMonth = m === birthOffset;
            const childId = child.id || `enfant_${idx}`;
            const tracker = reeeTracker[childId] ?? { scee: 0, iqee: 0, contribLifetime: 0 };
            const result = processOneChild(
                child, idx, isFirstMonth, childAgeMonths,
                {
                    m, loopYear, simSalaryGrowth, simInflation, expenseMultiplier,
                    isRetired, grossMarcBaseAnnual, grossAnnaBaseAnnual,
                    incomeAnna: _childIncomeAnna,
                    liquid: _childLiquid,
                    reee: _childReee,
                    householdGross: grossMarcBaseAnnual + grossAnnaBaseAnnual,
                    trackerScee: tracker.scee, trackerIqee: tracker.iqee,
                    trackerReeeContribLifetime: tracker.contribLifetime ?? 0,
                    enableMonteCarlo,
                },
                calculateFiscalReport,
            );
            _childLiquid += result.liquidDelta;
            _childReee = result.reeeNewBalance;
            monthlyExpenses += result.monthlyExpenseDelta;
            _childMonthlyIncome += result.monthlyIncomeDelta;
            if (result.newIncomeAnna !== null) _childIncomeAnna = result.newIncomeAnna;
            accGrossIncomeYear += result.accGrossDelta;
            reeeTracker[result.childId] = {
                scee: result.newTrackerScee,
                iqee: result.newTrackerIqee,
                contribLifetime: result.newTrackerReeeContribLifetime,
            };
            childGrossCost += result.childGrossCostAdd;
            childBenefits += result.childBenefitsAdd;
            childMonthlyCost += result.childMonthlyCostAdd;
            reeeContribMonthly += result.reeeContribAdd;
            withdrawalLiquid += result.withdrawalLiquidAdd;
            withdrawalREEE += result.withdrawalREEEAdd;
            reeePayoutMonthly += result.reeePayoutAdd;
            contribREEE += result.contribREEEAdd;
            contribLiquid += result.contribLiquidAdd;
            taxCurrentYear.divers += result.taxDiversAdd;
            result.lifeEventLogs.forEach(msg => logEvent(lifeEventsLog, msg));
            result.flowEventLogs.forEach(msg => logEvent(flowEventsLog, msg));
        });
        liquid = _childLiquid;
        reee = _childReee;
        monthlyIncome = _childMonthlyIncome;
        incomeAnna = _childIncomeAnna;

        const currentIsoMonth = currentLoopDate.toISOString().split('T')[0].substring(0, 7);
        // Cycle 16 split: voyages + événements de vie + stress test → ./projection/monthlyEvents
        applyTravelExpenses(travelGoals, currentIsoMonth, expenseMultiplier, {
            addExpense: (n) => { monthlyExpenses += n; },
            logFlow: (s) => logEvent(flowEventsLog, s),
        });
        applyLifeEvents(lifeEvents, currentIsoMonth, expenseMultiplier, propertiesState, {
            shockPortfolio: (f) => { celi *= f; reer *= f; nonReg *= f; crypto *= f; },
            addLiquid: (n) => { liquid += n; },
            addExpense: (n) => { monthlyExpenses += n; },
            adjustRealEstate: (eq, mort) => { realEstateEquity += eq; mortgageBalance += mort; },
            logLife: (s) => logEvent(lifeEventsLog, s),
            logFlow: (s) => logEvent(flowEventsLog, s),
        });

        // Wiring 2026-05: SavingsGoal et FinancialGoal aux deadlines.
        const goalMutator = {
            withdrawFromAccount: (account: 'CELI' | 'REER' | 'NON-ENREG' | 'CRYPTO' | 'LIQUID', amount: number): number => {
                let remaining = amount;
                if (account === 'LIQUID' || account === 'NON-ENREG') {
                    const fromLiquid = Math.min(liquid, remaining);
                    liquid -= fromLiquid; remaining -= fromLiquid;
                    if (remaining > 0 && account === 'NON-ENREG' && nonReg > 0) {
                        const fromNR = Math.min(nonReg, remaining);
                        nonReg -= fromNR; nonRegACB = Math.max(0, nonRegACB - fromNR); remaining -= fromNR;
                    }
                } else if (account === 'CELI') {
                    const drawn = Math.min(celi, remaining);
                    celi -= drawn; celiWithdrawalsThisYear += drawn; remaining -= drawn;
                } else if (account === 'REER') {
                    const drawn = Math.min(reer, remaining);
                    reer -= drawn; accRetraitsReerYear += drawn; remaining -= drawn;
                    accRetraitsReerYearByUser = addByWeights(accRetraitsReerYearByUser, drawn, reerByUser);
                } else if (account === 'CRYPTO') {
                    const drawn = Math.min(crypto, remaining);
                    // M-4 : ne compter que le GAIN (produit − coût de base proportionnel), pas 100 %.
                    const cryptoCostBasis = crypto > 0 ? drawn * Math.min(1, cryptoACB / crypto) : 0;
                    crypto -= drawn; cryptoACB = Math.max(0, cryptoACB - cryptoCostBasis);
                    accCapitalGainsYear += Math.max(0, drawn - cryptoCostBasis); remaining -= drawn;
                }
                return amount - remaining;
            },
            addExpense: (_n: number) => { /* déjà soustrait du compte ciblé */ },
            logFlow: (s: string) => logEvent(flowEventsLog, s),
        };
        applySavingsGoalDeadlines(savingsGoals, currentIsoMonth, expenseMultiplier, goalMutator);
        applyFinancialGoalDeadlines(financialGoals, currentIsoMonth, expenseMultiplier, goalMutator);
        const stressResult = computeStressTest(effProj, m);
        if (stressResult.crashFactor !== 1) {
            celi *= stressResult.crashFactor; reer *= stressResult.crashFactor;
            nonReg *= stressResult.crashFactor; crypto *= stressResult.crashFactor;
            if (stressResult.log) logEvent(lifeEventsLog, stressResult.log);
        }
        if (stressResult.recoveryFactor !== 1) {
            celi *= stressResult.recoveryFactor; reer *= stressResult.recoveryFactor; nonReg *= stressResult.recoveryFactor;
        }

        let monthlyCashflow = monthlyIncome - monthlyExpenses;
        const targetEF = monthlyExpenses * simEFMonths;
        // V31: Coussin Passif — on laisse tomber l'EF à 50% avant de vendre des actifs
        const criticalThreshold = targetEF * 0.5;

        if (m === 1 && month1ActionPlan === null) month1ActionPlan = { monthlyCashflow, strategy };

        // Cycle 19 split: shortfall + excess allocation → ./projection/cashflowAllocation
        // [PV-1] build/apply factorisés en closures : le MÊME état (mêmes champs, même
        // recopie) sert à l'allocation régulière ET au sauvetage de découvert plus bas —
        // zéro risque de divergence de champs entre les deux appels.
        const buildCashState = (): CashflowState => ({
            liquid, celi, reer, celiapp, nonReg, nonRegACB, capitalLossBank, crypto, cryptoACB,
            celiRoom, rrspRoom, fhsaRoom,
            taxCurrentYearReer: taxCurrentYear.reer,
            accRetraitsReerYear, accCapitalGainsYear, accRrspYear, accFhsaYear,
            fhsaLifetimeContrib, celiWithdrawalsThisYear,
            retraitReerMois, retraitCeliMois,
            withdrawalREER, withdrawalCELI, withdrawalNonReg, withdrawalCrypto,
            contribCELI, contribREER, contribNonReg, contribCELIAPP,
            shortfallMonths,
            flowEventLogs: [],
        });
        const applyCashState = (cs: CashflowState): void => {
            liquid = cs.liquid; celi = cs.celi; reer = cs.reer;
            celiapp = cs.celiapp; nonReg = cs.nonReg; nonRegACB = cs.nonRegACB;
            capitalLossBank = cs.capitalLossBank; crypto = cs.crypto; cryptoACB = cs.cryptoACB;
            celiRoom = cs.celiRoom; rrspRoom = cs.rrspRoom; fhsaRoom = cs.fhsaRoom;
            taxCurrentYear.reer = cs.taxCurrentYearReer;
            accRetraitsReerYearByUser = addByWeights(accRetraitsReerYearByUser, cs.accRetraitsReerYear - accRetraitsReerYear, reerByUser);
            accRetraitsReerYear = cs.accRetraitsReerYear;
            accCapitalGainsYear = cs.accCapitalGainsYear;
            accRrspYear = cs.accRrspYear; accFhsaYear = cs.accFhsaYear;
            fhsaLifetimeContrib = cs.fhsaLifetimeContrib;
            celiWithdrawalsThisYear = cs.celiWithdrawalsThisYear;
            retraitReerMois = cs.retraitReerMois; retraitCeliMois = cs.retraitCeliMois;
            withdrawalREER = cs.withdrawalREER; withdrawalCELI = cs.withdrawalCELI;
            withdrawalNonReg = cs.withdrawalNonReg; withdrawalCrypto = cs.withdrawalCrypto;
            contribCELI = cs.contribCELI; contribREER = cs.contribREER;
            contribNonReg = cs.contribNonReg; contribCELIAPP = cs.contribCELIAPP;
            shortfallMonths = cs.shortfallMonths;
            cs.flowEventLogs.forEach(msg => logEvent(flowEventsLog, msg));
        };
        // ⚠️ ctx FIGÉ ici (capture par valeur) et réutilisé par le sauvetage [PV-1] plus bas :
        // ne pas y ajouter un champ muté entre les deux appels (le meltdown intermédiaire ne
        // touche que reer/nonReg/taxCurrentYear/accRetraitsReerYear — hors ctx, vérifié).
        const cashflowCtxBase = {
            targetEF, criticalThreshold, isRetired, strategy,
            m, loopYear, enableMonteCarlo, activeUsersCount,
            grossMarcBaseAnnual, grossAnnaBaseAnnual, simSalaryGrowth,
            incomeRetirement, accRentesYear, hasFuturePurchase, hasPurchasedPrimary,
            contributionOrder: overrides.contributionOrder, debtFirst: overrides.debtFirst,
        };
        // [PV-1] snapshot pour ne pas compter 2× le même mois en déficit (allocation + sauvetage).
        const shortfallMonthsAtMonthStart = shortfallMonths;

        const cashState = buildCashState();
        processCashflowAllocation(
            cashState,
            { monthlyCashflow, ...cashflowCtxBase },
            activeDebts,
            calculateFiscalReport,
            calculateGrossWithholdingRRSP,
        );
        applyCashState(cashState);

        // Cycle 15 split: REER Meltdown → ./projection/meltdownReer
        const meltResult = processReerMeltdown(
            { m, isRetired, simSalaryGrowth, activeUsersCount, incomeRetirement,
              accRetraitsReerYear, accRentesYear, grossMarcBaseAnnual, grossAnnaBaseAnnual,
              reer, nonReg, celi, realEstateEquity },
            strategy,
        );
        if (meltResult) {
            reer -= meltResult.reerDrawn;
            nonReg += meltResult.nonRegAdd;
            nonRegACB += meltResult.nonRegAdd;
            accRetraitsReerYear += meltResult.reerDrawn;
            // 5e source de retrait REER (audit fiscal-accuracy) : attribuer le meltdown par conjoint
            // comme FERR/goals/cashflow, sinon Σ(byUser) < accRetraitsReerYear → sous-imposition sous
            // le scénario MELTDOWN_REER (l'opposé du but de la Phase 2).
            accRetraitsReerYearByUser = addByWeights(accRetraitsReerYearByUser, meltResult.reerDrawn, reerByUser);
            taxCurrentYear.reer += meltResult.withholding;
            if (meltResult.log) logEvent(flowEventsLog, meltResult.log);
        }

        // Transfert NonReg → CELI/REER si espace
        if (nonReg > 0) {
            if (celiRoom > 0) { const a = Math.min(nonReg, celiRoom); const s = handleNonRegSale(a, 'Opti.CELI'); celi += s; celiRoom -= s; }
            if (rrspRoom > 0 && nonReg > 0 && !isRetired) { const a = Math.min(nonReg, rrspRoom); const s = handleNonRegSale(a, 'Opti.REER'); reer += s; rrspRoom -= s; accRrspYear += s; }
        }

        // [PV-1] Sauvetage du liquide négatif (choix Marc 2026-06-10 : cascade de vente).
        // Des débits DIRECTS du liquide (impôt d'avril taxApril.ts, véhicules/rénos W5,
        // échéances d'objectifs) peuvent le rendre négatif sans passer par le cashflow ;
        // applyMidMonthGrowth clampait ensuite à 0 (helpers.ts `Math.max`) → la dette était
        // EFFACÉE et le patrimoine surévalué (jusqu'à plusieurs centaines de k$ sur 30 ans).
        // Correctif : dernier point AVANT la croissance — si le liquide est négatif, on
        // couvre le découvert par la MÊME cascade que le shortfall régulier (stratégie de
        // retrait respectée, retenue REER comptée via taxCurrentYearReer, garde-fous PBMA/OAS).
        // Avec liquid=0 en entrée, la cascade ne puise pas sous zéro et son invariant CF-2
        // ramène le liquide à 0 en sortie : les ventes financent exactement le découvert.
        // Cas insolvable (comptes épuisés ou cap OAS) : résiduel JOURNALISÉ, puis absorbé par
        // le `liquid = 0` ci-dessous — même convention que les shortfalls réguliers non couverts
        // (CF-2), mais désormais VISIBLE (flowEvents + shortfallMonths). Modéliser ce résiduel
        // comme dette portée = chantier séparé (BACKLOG), pas ce fix.
        if (liquid < -0.5) {
            const overdraft = -liquid;
            liquid = 0;
            const rescueState = buildCashState();
            const assetsBeforeRescue = rescueState.celi + rescueState.reer + rescueState.nonReg + rescueState.crypto;
            const withholdingBeforeRescue = rescueState.taxCurrentYearReer;
            processCashflowAllocation(
                rescueState,
                { monthlyCashflow: -overdraft, ...cashflowCtxBase },
                activeDebts,
                calculateFiscalReport,
                calculateGrossWithholdingRRSP,
            );
            applyCashState(rescueState);
            // Couvert (net) = baisse brute des actifs − retenue REER comptabilisée à part.
            const grossDrawn = assetsBeforeRescue - (celi + reer + nonReg + crypto);
            const covered = grossDrawn - (taxCurrentYear.reer - withholdingBeforeRescue);
            const residual = overdraft - covered;
            logEvent(flowEventsLog, `🏦 Découvert de liquidités couvert par vente de placements : ${Math.round(Math.min(covered, overdraft)).toLocaleString('fr-CA')} $ sur ${Math.round(overdraft).toLocaleString('fr-CA')} $`);
            if (residual > 1) {
                logEvent(flowEventsLog, `⚠️ Découvert NON couvert (comptes insuffisants) : ${Math.round(residual).toLocaleString('fr-CA')} $`);
            }
            // Un seul incrément de shortfallMonths par mois, même si l'allocation régulière
            // ET le sauvetage ont chacun constaté un déficit.
            shortfallMonths = Math.min(shortfallMonths, shortfallMonthsAtMonthStart + 1);
        }

        // Cycle 18 split: glidepath + taux effectifs → ./projection/glidepathRates
        const gr = computeGlidepathRates({
            m, retirementMonthIndex, isRetired, simInflation, enableMonteCarlo,
            mcCeliRate, mcReerRate, mcNonRegRate, mcCryptoRate, mcCashRate, baseRates,
            usEquityShareCeli: effProj.usEquityShareCeli,
            usEquityDividendYield: effProj.usEquityDividendYield,
        });
        const { effectiveCeliRate, effectiveReerRate, effectiveNonRegRate, activeCeliRate, activeCryptoRate, activeCashRate } = gr;

        // Cycle 24 split: croissance mensuelle 7 actifs → ./projection/growthApplication
        const g = applyMonthlyGrowth({
            prevCELI, celi, effectiveCeliRate,
            celiapp, activeCeliRate,
            prevREER, reer, effectiveReerRate,
            nonReg, contribNonReg, effectiveNonRegRate,
            crypto, activeCryptoRate,
            prevLiquid, liquid, activeCashRate,
            reee, contribREEE,
        });
        celi = g.celi.newVal; growthCELI = g.celi.growth; growthPctCELI = g.celi.pct;
        celiapp = g.celiapp.newVal; growthCELIAPP = g.celiapp.growth; growthPctCELIAPP = g.celiapp.pct;
        reer = g.reer.newVal; growthREER = g.reer.growth; growthPctREER = g.reer.pct;
        // Registre REER par conjoint : retrait pro-rata, cotisation par part salariale, croissance
        // (et RAP/meltdown) absorbées pro-rata par la réconciliation au solde commun final `reer`.
        reerByUser = stepReerByUser(reerByUser, { withdrawal: withdrawalREER, contribution: contribREER, poolEnd: reer, shares: reerShares });
        nonReg = g.nonReg.newVal; growthNonReg = g.nonReg.growth; growthPctNonReg = g.nonReg.pct;
        crypto = g.crypto.newVal; growthCrypto = g.crypto.growth; growthPctCrypto = g.crypto.pct;
        liquid = g.liquid.newVal; growthLiquid = g.liquid.growth; growthPctLiquid = g.liquid.pct;
        reee = g.reee.newVal; growthREEE = g.reee.growth; growthPctREEE = g.reee.pct;
        totalGrowth += g.totalGrowth;
        // Retenue à la source ~15% sur les retraits REER de l'année courante,
        // pas encore régularisée par la déclaration de revenus (approx. mi-année).
        // 15% = tranche intermédiaire de retenue REER au QC (cf RRSP_WITHHOLDING_QC).
        totalTaxesPaid += fluxImpots + taxOnRrif + retraitReerMois * 0.15;
        totalExpenses += monthlyExpenses;

        // realEstateEquity DÉJÀ net d'hypothèque → pas de re-soustraction de
        // mortgageBalance (corrige le double-comptage de l'hypothèque).
        const rawNetWorth = liquid + celi + celiapp + reer + nonReg + crypto + reee + realEstateEquity;
        if (rawNetWorth < minNetWorth) minNetWorth = rawNetWorth;
        const activeDebtsTotal = activeDebts.reduce((s, d) => s + d.balance, 0);

        // V23 Fix 1: FIRE comparaison en dollars futurs (inflation-ajustée)
        const futureFireTarget = fireTargetNetWorth * Math.pow(1 + simInflation / 100, m / 12);
        if (!hasHitFire && rawNetWorth >= futureFireTarget) {
            logEvent(lifeEventsLog, 'Objectif FIRE Atteint 🔥');
            hasHitFire = true;
        }

        // Cycle 17 split: impôt latent → ./projection/latentTax
        const impotLatent = computeLatentTax(
            { m, loopYear, simInflation, simSalaryGrowth, isRetired, activeUsersCount,
              grossMarcBaseAnnual, grossAnnaBaseAnnual, accRentesYear, incomeRetirement,
              reer, nonReg, nonRegACB, crypto, cryptoACB, enableMonteCarlo },
            calculateFiscalReport,
        );

        // Centralisation Phase 3 Tier 2 — cumul REEE (somme sur tous les enfants)
        const reeeContribCum = Object.values(reeeTracker).reduce((s, t) => s + (t.contribLifetime ?? 0), 0);
        const reeeGrantsCum = Object.values(reeeTracker).reduce((s, t) => s + (t.scee ?? 0) + (t.iqee ?? 0), 0);

        // Centralisation Phase 3 Tier 3 — dividendes mensuels + revenus de
        // placement imposables (50% des gains capital + 100% des dividendes).
        // Approximation : rendement non-reg × 30% × balance, divisé par 12.
        const baseNonRegRateForDiv = baseRates.nonReg ?? 0;
        const dividendIncome = (nonReg * (baseNonRegRateForDiv / 100) * 0.30) / 12;
        const taxableInvIncome = dividendIncome + (accCapitalGainsYear * 0.5) / 12;

        // Phase 3 Tier 3 — taux d'imposition marginal et effectif (PAR ADULTE)
        // Source : calculateFiscalReport sur le revenu brut annuel courant.
        // En retraite : on combine pensions + retraits REER pour le calcul.
        const grossPerUserAnnual = isRetired
            ? (incomeRetirement * 12 + accRetraitsReerYear) / Math.max(1, activeUsersCount)
            : (grossMarcBaseAnnual + grossAnnaBaseAnnual) / Math.max(1, activeUsersCount);
        const fiscalReportTier3 = grossPerUserAnnual > 0
            ? calculateFiscalReport(grossPerUserAnnual, 0, 0, loopYear, true /* skip breakdown pour perf */)
            : null;
        const marginalTaxRate = fiscalReportTier3 ? fiscalReportTier3.marginalRate * 100 : 0;
        const effectiveTaxRate = fiscalReportTier3 ? fiscalReportTier3.averageRate : 0;

        // Cycle 21 split: assemblage data.push → ./projection/monthlyOutput
        data.push(buildMonthlyDataPoint({
            m, retirementMonthIndex, fireTargetNetWorth, futureFireTarget,
            simInflation, expenseMultiplier, effectiveBaseExpenses, enableMonteCarlo,
            rawNetWorth, currentLoopDate, loopYear, age, isRetired,
            incomeMarc, incomeAnna, incomeRetirement, monthlyIncome, monthlyExpenses,
            childMonthlyCost, childGrossCost, childBenefits,
            reeeContribMonthly, reeePayoutMonthly,
            reeeContribCum, reeeGrantsCum,
            dividendIncome, taxableInvIncome,
            marginalTaxRate, effectiveTaxRate,
            pensionRRQ, pensionPSV, pensionPrivee,
            immoHypo, immoCharges, immoInterest, immoPrincipal, totalRentalIncome,
            liquid, celi, celiapp, reer, reee, nonReg, crypto,
            retraitReerMois, retraitCeliMois, celiRoom, rrspRoom, fhsaRoom,
            rapRepaymentDueTotal, realEstateEquity, mortgageBalance, activeDebtsTotal,
            prevNW, prevCELI, prevREER, prevLiquid,
            impotLatent, fluxImpots, impotReerMois, impotSalaireMois, impotGainsMois, impotDiversMois,
            taxPaidRevenu, taxPaidGains, taxPaidDivers, taxPaidREER, taxOnRrif,
            contribCELI, withdrawalCELI, contribREER, withdrawalREER,
            contribNonReg, withdrawalNonReg, contribCrypto, withdrawalCrypto,
            contribLiquid, withdrawalLiquid, contribCELIAPP, withdrawalCELIAPP,
            contribREEE, withdrawalREEE,
            growthCELI, growthREER, growthNonReg, growthCrypto, growthLiquid, growthCELIAPP, growthREEE,
            growthPctCELI, growthPctREER, growthPctNonReg, growthPctCrypto, growthPctLiquid, growthPctCELIAPP, growthPctREEE,
            taxCurrentYear, taxPreviousYear,
            lifeEventsLog, flowEventsLog,
        }));
    }

    // Cycle 26 split: bilan successoral → ./projection/estateCalculation
    const estate = computeEstateNetWorth({
        liquid, celi, celiapp, reer, nonReg, nonRegACB, crypto, cryptoACB, reee,
        realEstateEquity, mortgageBalance, smithManoeuvreDebt,
        incomeRetirement, accRentesYear, accRetraitsReerYear,
        grossMarcBaseAnnual, grossAnnaBaseAnnual, simSalaryGrowth,
        simulationYears: projection.years,
        startYear, currentAge,
        retirementTargetAge: retirementGoal.targetAge,
        governmentPension: retirementGoal.governmentPension,
        activeUsersCount, simInflation, enableMonteCarlo,
        startingCash: calculatedStartingCash,
        startingCELI: liveCSVBalances.CELI || 0,
        startingCELIAPP: liveCSVBalances.CELIAPP || 0,
        startingREER: liveCSVBalances.REER || 0,
        startingNonReg: liveCSVBalances.NON_ENREG || 0,
        startingCrypto: liveCSVBalances.CRYPTO || 0,
        startingREEE: liveCSVBalances.REEE || 0,
    }, calculateFiscalReport);

    // Bug détecté en mode test : chartData parfois vide silencieusement
    // (lastProjection jamais set côté store). Trace explicite pour faciliter
    // le debug local quand on voit "Patrimoine projeté: 0.00M$" en UI.
    if (data.length === 0) {
        // Anomalie moteur (« Patrimoine projeté: 0.00M$ » en UI) : visible dans les diagnostics,
        // pas seulement en console. logError est worker-safe (no-op de persistance hors localStorage).
        logError({ source: 'projection', severity: 'warning', message: 'runScenario a retourné chartData=[] (early break mortalité ou boucle skippée ?)', context: { years: projection.years, isDead, estateNetWorth: estate.estateNetWorth } });
    }

    return {
        chartData: data,
        actionPlan: month1ActionPlan,
        fireNumber: fireTargetNetWorth || 0,
        finalNetWorth: estate.finalRawNetWorth,
        estateNetWorth: estate.estateNetWorth,
        reerByUserFinal: reerByUser,
        totalEstateTax: estate.totalEstateTax,
        totalTaxesPaid: totalTaxesPaid || 0,
        totalGrowth: totalGrowth || 0,
        totalExpenses,
        minNetWorth,
        // Borné à [0, 1] : la boucle peut tourner 1 mois de plus que years*12
        // (extension retraite/horizon) → un ratio brut > 1 était possible (vu
        // en audit : persona « couple endetté » à 100,2 %). Un taux de manque
        // est par définition une fraction.
        shortfallRate: Math.min(1, shortfallMonths / (projection.years * 12)),
        startNW: estate.startNW,
    };
};

// Cycle 7 split: runMonteCarlo extrait dans ./projection/monteCarlo


export const calculateFutureProjection = (params: SimulationParams, runMC: boolean = false, selectedIdx: number = 0, onlyStratTypes?: string[]): ProjectionResult => {
    // G21 C5 — leviers « appliqués » depuis l'optimiseur (orthogonaux à l'axe
    // scénario). EngineOverrides threadés à TOUS les scénarios + bonus de rendement
    // NonReg pour l'asset location (clone immutable, effet modulé par le solde réel).
    // Tous absents ⇒ comportement historique strictement inchangé.
    const proj = params.projection;
    const appliedOverrides: EngineOverrides = {
        contributionOrder: proj.appliedContributionOrder,
        debtFirst: proj.appliedDebtFirst,
        skipRapForPurchase: proj.appliedSkipRap,
        gainHarvesting: proj.appliedGainHarvesting,
    };
    const effectiveParams: SimulationParams = proj.appliedAssetLocation && proj.returnRates
        ? {
            ...params,
            projection: {
                ...proj,
                returnRates: {
                    ...proj.returnRates,
                    celi: proj.returnRates.celi + ASSET_LOCATION_BONUS_PP,
                    reer: proj.returnRates.reer + ASSET_LOCATION_BONUS_PP,
                    nonReg: proj.returnRates.nonReg + ASSET_LOCATION_BONUS_PP,
                },
            },
        }
        : params;

    // [UI-SCEN] (2026-06-09, demande Marc « enlève les plans de base ») — la stratégie de
    // gestion est un PARAMÈTRE (projection.withdrawalStrategy) : par défaut le moteur ne
    // calcule QUE ce scénario réaliste (1 simulation au lieu de 11 — ÷11 en déterministe ;
    // en Monte Carlo le gain porte sur la part déterministe). Les stress-tests sont demandés EXPLICITEMENT via `onlyStratTypes`
    // (panneau de l'onglet Optimisation). Parmi les façons de gérer (kind 'strategy',
    // toutes stratType BASE), seule la SÉLECTIONNÉE est calculée — y compris quand
    // onlyStratTypes contient 'BASE' (goalSeek : 1 sim au lieu de 5).
    const selectedDef = strategyDefFor(proj.withdrawalStrategy);
    let activeDefs: typeof SCENARIO_DEFINITIONS;
    if (onlyStratTypes) {
        const matching = SCENARIO_DEFINITIONS.filter(d => onlyStratTypes.includes(d.stratType))
            .filter(d => d.kind !== 'strategy' || d === selectedDef);
        activeDefs = matching.length > 0 ? matching : [selectedDef];
    } else {
        activeDefs = [selectedDef];
    }
    const results: ProjectionResult[] = activeDefs.map(def => ({
        // [UI-SCEN] — un stress « monde » (def.strategy AUTO_MARGINAL) tourne sous la stratégie
        // SÉLECTIONNÉE : le delta vs réaliste mesure l'effet du CHOC seul, pas un changement de
        // stratégie. LIBERTE_55 (PRIO_REER) garde sa stratégie voulue. Sélection par défaut =
        // AUTO_MARGINAL → strictement identique à l'historique (goldens stables).
        ...runScenario(
            effectiveParams,
            def.kind !== 'strategy' && def.strategy === 'AUTO_MARGINAL' ? selectedDef.strategy : def.strategy,
            false, def.delayPensions, 0, def.stratType, appliedOverrides,
        ),
        strategy: def.strategy,
        strategyName: def.strategyName,
        stratType: def.stratType,
        delayPensions: def.delayPensions,
        stratDescription: def.stratDescription,
        pros: def.pros,
        cons: def.cons,
        icon: def.icon,
        kind: def.kind,
    }));
    // [UI-SCEN] — référence du gainVsAuto = le scénario SÉLECTIONNÉ (results[0] par défaut ;
    // pour un run stress-only, le panneau compare lui-même à lastProjection — gainVsAuto y
    // est relatif au 1er stress, à ignorer côté UI).
    const resBase = results[0];

    // V50: Stable indexing for the UI (we don't sort the main results array anymore)
    const sortedByEstate = [...results].sort((a, b) => (b.estateNetWorth ?? 0) - (a.estateNetWorth ?? 0));
    const best = sortedByEstate[0];

    // Add gain info to each result relative to the standard 'Base' scenario (resBase)
    results.forEach(res => {
        res.gainVsAuto = (res.estateNetWorth ?? 0) - (resBase.estateNetWorth ?? 0);
    });

    // V42: Run MC on the targeted/selected strategy
    const target = results[selectedIdx] || best;
    let successRate: number | null = null;
    let fvi: number | null = null;
    let expertMetrics: MonteCarloResult['expertMetrics'] | null = null;

    if (runMC) {
        // Cycle 5 audit UI: monteCarloIterations désormais lu depuis ProjectionConfig
        // (panneau Paramètres Avancés). Bornes: 50-1000.
        const requested = params.projection.monteCarloIterations ?? 100;
        const MC_ITERATIONS = Math.max(50, Math.min(1000, requested));
        // Cycle 7 split: runScenario injecté pour éviter dépendance circulaire.
        // G21 C4 fix : utilise la stratégie réelle du scénario ciblé (avant,
        // 'AUTO_MARGINAL' était hardcodé → le MC ignorait le scénario sélectionné).
        const mcResult = runMonteCarlo(runScenario, effectiveParams, (target.strategy as AllocationStrategy) ?? 'AUTO_MARGINAL', target.delayPensions as boolean, MC_ITERATIONS, appliedOverrides);
        successRate = mcResult.successRate;
        fvi = mcResult.fvi;
        expertMetrics = mcResult.expertMetrics;

        target.chartData.forEach((d, i) => {
            d.P10 = mcResult.p10Data[i] ?? null;
            d.P50 = mcResult.p50Data[i] ?? null;
            d.P90 = mcResult.p90Data[i] ?? null;
        });

        const delayStr = target.delayPensions ? 'repousser vos rentes gouvernementales à 70 ans' : 'prendre vos rentes gouvernementales aux âges normaux';
        const stratStr = (target.strategyName as string ?? '').split(' / ')[0];
        const isBest = results.length > 1 && target === best; // [UI-SCEN] 1 résultat = aucune comparaison → pas de « optimale »
        target.aiNote = `${isBest ? 'Stratégie optimale : ' : ''}Simulation basée sur **${stratStr}** et **${delayStr}**. Indice de Vitalité : ${fvi}%.`;
    } else {
        target.chartData.forEach((d) => { d.P10 = null; d.P50 = null; d.P90 = null; });
        // [UI-SCEN] — le report des rentes passe par les âges rrqStartAge/psvStartAge (#210),
        // plus par delayPensions (toujours false dans STRATEGY_DEFS) : on lit les âges réels.
        const rrqStart = params.retirementGoal?.rrqStartAge;
        const delayStr = target.delayPensions || (rrqStart !== undefined && rrqStart > 65)
            ? `rentes reportées (RRQ ${rrqStart ?? 70} ans)` : 'rentes aux âges choisis';
        const stratStr = (target.strategyName as string ?? '').split(' / ')[0];
        target.aiNote = `Simulation déterministe (**${stratStr}** + **${delayStr}**).`;
    }

    return {
        ...target,
        successRate: fvi || successRate, // V65: Display FVI as health score
        fvi,
        expertMetrics: expertMetrics ?? undefined,
        allResults: results,
        bestStrategyIdx: results.indexOf(best)
    };
};

// G21 C4 — point d'entrée du classement par robustesse. Injecte le runScenario
// privé dans rankStrategiesByRobustness (qui ne peut pas l'importer sans créer
// une dépendance circulaire). Coûteux (5 × jusqu'à 1000 sims) → appeler via le
// Web Worker (runRobustnessRankingAsync), pas sur le thread de rendu.
export const calculateRobustnessRanking = (
    params: SimulationParams,
    opts: RankRobustnessOptions = {},
): RobustnessRanking => rankStrategiesByRobustness(runScenario, params, opts);

// G21 C5 commit 4 — évalue un sous-ensemble de StrategyConfig par Monte Carlo.
// Injecte le runScenario privé dans runStrategySearch. Très coûteux (N configs ×
// jusqu'à 1000 sims) → appeler via le pool multi-worker (runStrategySearchAsync),
// jamais sur le thread de rendu. Le sharding sur plusieurs cœurs se fait en amont :
// chaque worker reçoit sa part de `configs`.
export const calculateStrategySearch = (
    params: SimulationParams,
    configs: ReadonlyArray<StrategyConfig>,
    opts: RunStrategySearchOptions = {},
): StrategySearchResult => runStrategySearch(runScenario, params, configs, opts);
