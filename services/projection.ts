// services/projection.ts — moteur de projection financière (migré depuis utils/useFutureSimulation.ts)
import { ProjectionConfig, RealEstateGoal, ChildGoal, TravelGoal, LifeEvent, Debt, RetirementGoal, BudgetConfig as Config, InsurancePolicy, VehicleReplacement, MajorRenovation, CharitableGoal, RentalProperty, PrivateBusiness, SavingsGoal, FinancialGoal } from '../types';
import { calculateFiscalReport, getMarginalRate, calculateDividendTax, calculateGrossWithholdingRRSP, FHSA_ANNUAL_LIMIT_PER_USER, FHSA_LIFETIME_LIMIT_PER_USER } from '../utils/tax';
import { RRIF_RATES, welcomeTax } from './projection/helpers';
import { runMonteCarlo } from './projection/monteCarlo';
import { SCENARIO_DEFINITIONS } from './projection/scenarios';
import { applyW5Effects, applyAgeBasedExpenses } from './projection/w5Effects';
import { tryCriticalIllness, tryInheritance, tryMortality, trySpouseMortality, tryLtcTrigger, ltcMonthlyCost, tryDivorce } from './projection/stochasticEvents';
import { processAprilSettlement } from './projection/taxApril';
import { computeOasClawback, processTaxLossHarvesting, processDecemberTaxFiling } from './projection/taxDecember';
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

export interface SimulationParams {
    projection: ProjectionConfig;
    calculatedStartingCash: number;
    liveCSVBalances: any;
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


const runScenario = (params: SimulationParams, strategy: AllocationStrategy, enableMonteCarlo = false, delayPensions = false, mcIterationIndex = 0, scenarioType: FutureScenarioType = 'BASE') => {
    const { projection, calculatedStartingCash, liveCSVBalances, realEstateGoals, debts, childGoals, travelGoals, lifeEvents, retirementGoal, config, baseGrossAnnual, baseNetAnnual, currentRentExpense, baseMonthlyExpenses, startYear = 2026, startMonth = 0, insurancePolicies = [], vehicleReplacements = [], majorRenovations = [], charitableGoals = [], rentalProperties = [], privateBusinesses = [], savingsGoals = [], financialGoals = [] } = params;
    
    // Cycle 22 split: RNG seedé déterministique → ./projection/setupSimulation
    const rng = buildSeededRng(scenarioType, strategy, mcIterationIndex);

    const getMonthOffset = (dateStr: string) => {
        const d = new Date(dateStr);
        return (d.getFullYear() - startYear) * 12 + (d.getMonth() - startMonth);
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
        const arrivalYear = u.canadaArrivalYear || (startYear - 5);
        const birthYear = u.birthYear || (startYear - (u.age || 30));
        psvResidencyYears[idx] = Math.max(0, startYear - Math.max(arrivalYear, birthYear + 18));
    });

    // Cycle 22 split: scenario overrides (inflation + rates) → ./projection/setupSimulation
    const { simInflation, baseRates } = computeScenarioOverrides(projection as any, scenarioType);

    let overrideRetirementAge = retirementGoal.targetAge || 65;
    if (scenarioType === 'LIBERTE_55') overrideRetirementAge = 55;
    const effectiveRetirementAge = delayPensions ? 70 : overrideRetirementAge;
    const retirementMonthIndex = (effectiveRetirementAge - currentAge) * 12;

    const effectiveBaseExpenses = projection.useTheoretical ? (projection.theoreticalExpenses || 4000) : baseMonthlyExpenses;
    const fireTargetAnnual = effectiveBaseExpenses * 12;
    const fireTargetNetWorth = fireTargetAnnual * 25;

    const RE_PURCHASE_MONTH_OFFSET = realEstateGoals.find(g => g.isActive && g.isPrimaryResidence)?.purchaseDate
        ? getMonthOffset(realEstateGoals.find(g => g.isActive && g.isPrimaryResidence)!.purchaseDate)
        : -1;

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

    let reeeTracker: Record<string, { scee: number, iqee: number }> = {};

    // Cycle 22 split: revenus net/brut baseline → ./projection/setupSimulation
    const { incomeMarcNetMonthly, incomeAnnaNetMonthly, grossMarcBaseAnnual, grossAnnaBaseAnnual } =
        computeIncomeBaseline(projection, config.users);

    const simSalaryGrowth = effProj.salaryGrowth ?? 2.5;
    const simEFMonths = effProj.emergencyFundMonths || 3;

    // Cycle 27 split: stressTest config construit une fois (évite re-création par itération)
    const stressTestConfig: StressTestConfig | null = effProj.stressTestEnabled ? {
        enabled: true,
        year: effProj.stressTestYear || 5,
        recoveryMonths: effProj.stressTestRecoveryMonths || 24,
        inflationShock: effProj.stressTestInflationShock || 0,
    } : null;

    // Cycle 22 split: RRQ adjustment + pensions baseline → ./projection/setupSimulation
    const { rrqAdjustmentFactor, rrqBasePension, psvBasePension } = computeRrqAdjustment(delayPensions, retirementGoal);

    // D2.2: RRIF_RATES et welcomeTax → ./projection/helpers

    let prevCELI = celi, prevREER = reer, prevLiquid = liquid, prevNW = (liquid + celi + reer + nonReg + crypto + reee);

    // D2.8: État LTC (Long-Term Care). Une fois déclenché, le coût mensuel
    // s'ajoute aux dépenses jusqu'à la fin de la simulation.
    let ltcActive = false;
    let nonRegACB = nonReg;

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

    // D2.8: Mortalité stochastique. En MC, à chaque début d'année on tire la
    // probabilité de décès du user principal. Le loop arrête à la mort.
    let isDead = false;

    // W1.4: Survivant. Si modelSurvivor=ON, lorsque le user1 décède,
    // on continue avec le user2 mais avec ajustements:
    // - RRQ user1 → 60% versés au conjoint survivant (max RRQ standard)
    // - PSV user1 → cesse
    // - DB user1 → continue selon dbElectionType / dbSurvivorPct
    // - REER user1 → roulé au conjoint sans imposition immédiate
    let spouseAlive = activeUsersCount > 1;
    let survivorMode = false;        // user1 mort, user2 vivant
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

    for (let m = 0; m <= projection.years * 12; m++) {
        const currentMonthIndex = m % 12;
        const simulationStartDate = new Date(startYear, startMonth, 1);
        const currentLoopDate = new Date(simulationStartDate);
        currentLoopDate.setMonth(simulationStartDate.getMonth() + m);
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
        prevNW = (liquid + celi + reer + nonReg + crypto + reee + realEstateEquity - mortgageBalance);

        let monthlyIncome = 0;
        let monthlyExpenses = 0;
        let incomeMarc = 0;
        let incomeAnna = 0;
        incomeRetirement = 0;
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
            incomeRetirement = computeRetirementIncome(
                { m, age, simInflation, activeUsersCount, baseGrossAnnual, delayPensions,
                  survivorMode, monthlyOasReduction, dbSurvivorPct, rrqSurvivorPct, psvResidencyYears,
                  startYear },
                retirementGoal,
                config.users,
            );
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
                { m, loopYear, simInflation, simSalaryGrowth, grossMarcBaseAnnual, grossAnnaBaseAnnual,
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
            const decResult = processDecemberTaxFiling(
                currentMonthIndex,
                {
                    m, loopYear, isRetired, enableMonteCarlo,
                    yearsElapsed, inflationFactor, activeUsersCount,
                    grossMarcBaseAnnual, grossAnnaBaseAnnual, simSalaryGrowth,
                    optimizeSourceDeductions: effProj.optimizeSourceDeductions,
                    incomeRetirementMonthly: incomeRetirement,
                    nonReg, baseNonRegRate: baseRates.nonReg,
                    accRrspYear, accFhsaYear, smithInterestDeductibleYear,
                    accRentesYear, accRetraitsReerYear, accCapitalGainsYear,
                },
                { calculateFiscalReport, getMarginalRate, calculateDividendTax },
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
        if (currentMonthIndex === 11 && m > 0 && isRetired && age >= 65) {
            const oasResult = computeOasClawback(
                currentMonthIndex, m, isRetired, age, expenseMultiplier,
                incomeRetirement, accRetraitsReerYear, accRentesYear,
                psvBasePension, simInflation,
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
            accRetraitsReerYear = janResult.accRetraitsReerYearReset;
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
        let debtPayments = 0;
        activeDebts.forEach(d => {
            if (d.balance > 0) {
                const interest = (d.balance * (d.interestRate / 100)) / 12;
                const payment = Math.min(d.balance + interest, d.minimumPayment);
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
              useSmithManoeuvre: effProj.useSmithManoeuvre === true, currentRentExpense },
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
            const childAgeMonths = m - Math.max(0, birthOffset);
            const isFirstMonth = m === Math.max(0, birthOffset);
            const childId = child.id || `enfant_${idx}`;
            const tracker = reeeTracker[childId] ?? { scee: 0, iqee: 0 };
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
            reeeTracker[result.childId] = { scee: result.newTrackerScee, iqee: result.newTrackerIqee };
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
                } else if (account === 'CRYPTO') {
                    const drawn = Math.min(crypto, remaining);
                    crypto -= drawn; accCapitalGainsYear += drawn; remaining -= drawn;
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
        const cashState: CashflowState = {
            liquid, celi, reer, celiapp, nonReg, nonRegACB, capitalLossBank, crypto,
            celiRoom, rrspRoom, fhsaRoom,
            taxCurrentYearReer: taxCurrentYear.reer,
            accRetraitsReerYear, accCapitalGainsYear, accRrspYear, accFhsaYear,
            fhsaLifetimeContrib, celiWithdrawalsThisYear,
            retraitReerMois, retraitCeliMois,
            withdrawalREER, withdrawalCELI, withdrawalNonReg, withdrawalCrypto,
            contribCELI, contribREER, contribNonReg, contribCELIAPP,
            shortfallMonths,
            flowEventLogs: [],
        };
        processCashflowAllocation(
            cashState,
            { monthlyCashflow, targetEF, criticalThreshold, isRetired, strategy,
              m, loopYear, enableMonteCarlo, activeUsersCount,
              grossMarcBaseAnnual, grossAnnaBaseAnnual, simSalaryGrowth,
              incomeRetirement, accRentesYear, hasFuturePurchase, hasPurchasedPrimary },
            activeDebts,
            calculateFiscalReport,
            calculateGrossWithholdingRRSP,
        );
        liquid = cashState.liquid; celi = cashState.celi; reer = cashState.reer;
        celiapp = cashState.celiapp; nonReg = cashState.nonReg; nonRegACB = cashState.nonRegACB;
        capitalLossBank = cashState.capitalLossBank; crypto = cashState.crypto;
        celiRoom = cashState.celiRoom; rrspRoom = cashState.rrspRoom; fhsaRoom = cashState.fhsaRoom;
        taxCurrentYear.reer = cashState.taxCurrentYearReer;
        accRetraitsReerYear = cashState.accRetraitsReerYear;
        accCapitalGainsYear = cashState.accCapitalGainsYear;
        accRrspYear = cashState.accRrspYear; accFhsaYear = cashState.accFhsaYear;
        fhsaLifetimeContrib = cashState.fhsaLifetimeContrib;
        celiWithdrawalsThisYear = cashState.celiWithdrawalsThisYear;
        retraitReerMois = cashState.retraitReerMois; retraitCeliMois = cashState.retraitCeliMois;
        withdrawalREER = cashState.withdrawalREER; withdrawalCELI = cashState.withdrawalCELI;
        withdrawalNonReg = cashState.withdrawalNonReg; withdrawalCrypto = cashState.withdrawalCrypto;
        contribCELI = cashState.contribCELI; contribREER = cashState.contribREER;
        contribNonReg = cashState.contribNonReg; contribCELIAPP = cashState.contribCELIAPP;
        shortfallMonths = cashState.shortfallMonths;
        cashState.flowEventLogs.forEach(msg => logEvent(flowEventsLog, msg));

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
            taxCurrentYear.reer += meltResult.withholding;
            if (meltResult.log) logEvent(flowEventsLog, meltResult.log);
        }

        // Transfert NonReg → CELI/REER si espace
        if (nonReg > 0) {
            if (celiRoom > 0) { const a = Math.min(nonReg, celiRoom); const s = handleNonRegSale(a, 'Opti.CELI'); celi += s; celiRoom -= s; }
            if (rrspRoom > 0 && nonReg > 0 && !isRetired) { const a = Math.min(nonReg, rrspRoom); const s = handleNonRegSale(a, 'Opti.REER'); reer += s; rrspRoom -= s; accRrspYear += s; }
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
        nonReg = g.nonReg.newVal; growthNonReg = g.nonReg.growth; growthPctNonReg = g.nonReg.pct;
        crypto = g.crypto.newVal; growthCrypto = g.crypto.growth; growthPctCrypto = g.crypto.pct;
        liquid = g.liquid.newVal; growthLiquid = g.liquid.growth; growthPctLiquid = g.liquid.pct;
        reee = g.reee.newVal; growthREEE = g.reee.growth; growthPctREEE = g.reee.pct;
        totalGrowth += g.totalGrowth;
        totalTaxesPaid += fluxImpots + taxOnRrif + retraitReerMois * (0.15); // approximation for mid-year witholdings not yet filed
        totalExpenses += monthlyExpenses;

        const rawNetWorth = liquid + celi + celiapp + reer + nonReg + crypto + reee + realEstateEquity - mortgageBalance;
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
              reer, nonReg, nonRegACB, crypto, enableMonteCarlo },
            calculateFiscalReport,
        );

        // Cycle 21 split: assemblage data.push → ./projection/monthlyOutput
        data.push(buildMonthlyDataPoint({
            m, retirementMonthIndex, fireTargetNetWorth, futureFireTarget,
            simInflation, expenseMultiplier, effectiveBaseExpenses, enableMonteCarlo,
            rawNetWorth, currentLoopDate, loopYear, age, isRetired,
            incomeMarc, incomeAnna, incomeRetirement, monthlyIncome, monthlyExpenses,
            childMonthlyCost, childGrossCost, childBenefits,
            reeeContribMonthly, reeePayoutMonthly,
            immoHypo, immoCharges, immoInterest, immoPrincipal, totalRentalIncome,
            liquid, celi, celiapp, reer, reee, nonReg, crypto,
            retraitReerMois, retraitCeliMois, celiRoom, rrspRoom,
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
        liquid, celi, celiapp, reer, nonReg, nonRegACB, crypto, reee,
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

    return {
        chartData: data,
        actionPlan: month1ActionPlan,
        fireNumber: fireTargetNetWorth || 0,
        finalNetWorth: estate.finalRawNetWorth,
        estateNetWorth: estate.estateNetWorth,
        totalEstateTax: estate.totalEstateTax,
        totalTaxesPaid: totalTaxesPaid || 0,
        totalGrowth: totalGrowth || 0,
        totalExpenses,
        minNetWorth,
        shortfallRate: shortfallMonths / (projection.years * 12),
        startNW: estate.startNW,
    };
};

// Cycle 7 split: runMonteCarlo extrait dans ./projection/monteCarlo


export const calculateFutureProjection = (params: SimulationParams, runMC: boolean = false, selectedIdx: number = 0): ProjectionResult => {
    // V90 + Cycle 7 split: Avenirs de Vie (5 Distinct Futures)
    // Metadata extraite dans ./projection/scenarios. Itère sur SCENARIO_DEFINITIONS
    // (7 scénarios depuis Phase 4 #4) au lieu de blocs hardcodés ~10 lignes chacun.
    const results = SCENARIO_DEFINITIONS.map(def => ({
        ...runScenario(params, def.strategy, false, def.delayPensions, 0, def.stratType),
        strategyName: def.strategyName,
        stratType: def.stratType,
        delayPensions: def.delayPensions,
        stratDescription: def.stratDescription,
        pros: def.pros,
        cons: def.cons,
        icon: def.icon,
    }));
    const resBase = results[0]; // BASE est la référence pour gainVsAuto

    // V50: Stable indexing for the UI (we don't sort the main results array anymore)
    const sortedByEstate = [...results].sort((a, b) => b.estateNetWorth - a.estateNetWorth);
    const best = sortedByEstate[0];
    const pire = sortedByEstate[results.length - 1];
    const diffSaves = best.estateNetWorth - pire.estateNetWorth;

    // Add gain info to each result relative to the standard 'Base' scenario (resBase)
    results.forEach(res => {
        (res as any).gainVsAuto = res.estateNetWorth - resBase.estateNetWorth;
    });

    // V42: Run MC on the targeted/selected strategy
    const target = results[selectedIdx] || best;
    let successRate: number | null = null;
    let fvi: number | null = null;
    let expertMetrics: any = null;

    if (runMC) {
        // Cycle 5 audit UI: monteCarloIterations désormais lu depuis ProjectionConfig
        // (panneau Paramètres Avancés). Bornes: 50-1000.
        const requested = params.projection.monteCarloIterations ?? 100;
        const MC_ITERATIONS = Math.max(50, Math.min(1000, requested));
        // Cycle 7 split: runScenario injecté pour éviter dépendance circulaire
        const mcResult = runMonteCarlo(runScenario, params, 'AUTO_MARGINAL', target.delayPensions, MC_ITERATIONS);
        successRate = mcResult.successRate;
        fvi = mcResult.fvi;
        expertMetrics = mcResult.expertMetrics;
        
        (target.chartData as any[]).forEach((d, i) => {
            d.P10 = mcResult.p10Data[i] ?? null;
            d.P50 = mcResult.p50Data[i] ?? null;
            d.P90 = mcResult.p90Data[i] ?? null;
        });

        const delayStr = target.delayPensions ? 'repousser vos rentes gouvernementales à 70 ans' : 'prendre vos rentes gouvernementales aux âges normaux';
        const stratStr = target.strategyName.split(' / ')[0];
        const isBest = target === best;
        (target as any).aiNote = `${isBest ? '🌟 Stratégie Optimale : ' : ''}Simulation basée sur **${stratStr}** et **${delayStr}**. Indice de Vitalité : ${fvi}%.`;
    } else {
        (target.chartData as any[]).forEach((d) => { d.P10 = null; d.P50 = null; d.P90 = null; });
        const delayStr = target.delayPensions ? 'repousser les rentes (70 ans)' : 'prendre les rentes normalement';
        const stratStr = target.strategyName.split(' / ')[0];
        (target as any).aiNote = `Simulation déterministe (**${stratStr}** + **${delayStr}**).`;
    }

    return {
        ...target,
        successRate: fvi || successRate, // V65: Display FVI as health score
        fvi,
        expertMetrics,
        allResults: results,
        bestStrategyIdx: results.indexOf(best)
    };
};
