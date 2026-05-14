// services/projection.ts — moteur de projection financière (migré depuis utils/useFutureSimulation.ts)
import { ProjectionConfig, RealEstateGoal, ChildGoal, TravelGoal, LifeEvent, Debt, RetirementGoal, BudgetConfig as Config } from '../types';
import { calculateFiscalReport, CELI_ANNUAL_LIMITS, calculateCeliRoom, calculateGrossFromNet, getMarginalRate, calculateDividendTax, RRSP_ANNUAL_LIMITS, calculateGrossWithholdingRRSP } from '../utils/tax';
import { mulberry32, gaussianRandom, applyShock, MER, RRIF_RATES, welcomeTax, ltcAnnualProbability, mortalityAnnualProbability } from './projection/helpers';

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
}

export type AllocationStrategy = 'AUTO_MARGINAL' | 'PRIO_REER' | 'PRIO_CELI' | 'MELTDOWN_REER' | 'DEBT_FIRST';

export type FutureScenarioType = 'BASE' | 'LIBERTE_55' | 'HYPER_INFLATION' | 'WINDFALL' | 'ECONOMIC_WINTER';

// D2.2: mulberry32, gaussianRandom, applyShock, ASSET_VOLATILITY, MER,
// RRIF_RATES et welcomeTax sont désormais dans ./projection/helpers.

// Helper to calculate gross amount needed for a specific net withdrawal
// Uses the April settlement logic where tax is calculated but paid later.
const calculateGrossNeeded = (netNeeded: number, currentGrossOther: number, activeUsersCount: number, year: number): number => {
    if (netNeeded <= 0) return 0;

    // Binary search for gross amount
    let low = netNeeded;
    let high = netNeeded * 3;
    let iterations = 0;

    while (iterations < 15) {
        const mid = (low + high) / 2;
        const netBaseReport = calculateFiscalReport(currentGrossOther / activeUsersCount, 0, 0, year);
        const netBase = netBaseReport.netIncome * activeUsersCount;

        const netTotalReport = calculateFiscalReport((currentGrossOther + mid) / activeUsersCount, 0, 0, year);
        const netTotal = netTotalReport.netIncome * activeUsersCount;

        const netFromMid = netTotal - netBase;

        if (Math.abs(netFromMid - netNeeded) < 1) return mid;

        if (netFromMid < netNeeded) {
            low = mid;
        } else {
            high = mid;
        }
        iterations++;
    }
    return (low + high) / 2;
};

const runScenario = (params: SimulationParams, strategy: AllocationStrategy, enableMonteCarlo = false, delayPensions = false, mcIterationIndex = 0, scenarioType: FutureScenarioType = 'BASE') => {
    const { projection, calculatedStartingCash, liveCSVBalances, realEstateGoals, debts, childGoals, travelGoals, lifeEvents, retirementGoal, config, baseGrossAnnual, baseNetAnnual, currentRentExpense, baseMonthlyExpenses, startYear = 2026, startMonth = 0 } = params;
    
    // Deterministic Seed Generation
    // We use a base seed from initial assets + inflation to ensure same inputs = same base trace
    // D2.3: la graine MC ne dépend QUE de l'index d'itération + scénario,
    // pas du capital initial (sinon impossible de comparer 100k$ vs 100.001$
    // sur des trajectoires aléatoires identiques).
    const baseSeedStr = `${scenarioType}-${strategy}-${mcIterationIndex}`;
    let baseSeedNum = 0;
    for (let i = 0; i < baseSeedStr.length; i++) {
        baseSeedNum = (baseSeedNum << 5) - baseSeedNum + baseSeedStr.charCodeAt(i);
        baseSeedNum |= 0;
    }
    const rng = mulberry32(Math.abs(baseSeedNum) || 42);

    const getMonthOffset = (dateStr: string) => {
        const d = new Date(dateStr);
        return (d.getFullYear() - startYear) * 12 + (d.getMonth() - startMonth);
    };

    const effProj = projection;
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

    let totalHistoricalCeliRoom = 0;
    let totalHistoricalRrspRoom = 0;
    let activeUsersCount = 0;

    // V38: Calcul STRICT des droits selon la résidence et l'âge
    config.users.filter(u => u).forEach(u => {
        activeUsersCount++;
        const birthYear = u.birthYear || (startYear - (u.age || 30));
        const arrivalYear = u.canadaArrivalYear || (startYear - 5);
        totalHistoricalCeliRoom += calculateCeliRoom(birthYear, arrivalYear, startYear);
        const yearsInCanadaBeforeStart = Math.max(0, startYear - arrivalYear);
        if (yearsInCanadaBeforeStart > 0) {
            const individualSalaryPortion = baseGrossAnnual / (config.users.filter(u => u).length || 1);
            const totalFE = config.users.reduce((acc, user) => acc + (user?.facteurEquivalence || 0), 0);
            for (let y = 1; y <= yearsInCanadaBeforeStart; y++) {
                const histYear = startYear - y;
                const pastSalary = individualSalaryPortion / Math.pow(1.02, y);
                const annualCap = RRSP_ANNUAL_LIMITS[histYear] || 32490;
                totalHistoricalRrspRoom += Math.max(0, Math.min(pastSalary * 0.18, annualCap) - (totalFE / (config.users.filter(u => u).length || 1)));
            }
        }
    });

    if (activeUsersCount === 0) activeUsersCount = 1;

    // D2.5: Smile Curve — facteur de style de vie par âge retraite.
    // Référence: étude CIBC "Spending in Retirement". Activable via flag.
    const smileLifestyleFactor = (ageAtMonth: number): number => {
        if (!(effProj as any).useSmileCurve) return 1;
        if (ageAtMonth < 75) return 1.15;   // Go-go years
        if (ageAtMonth < 85) return 1.00;   // Slow-go
        return 0.90;                          // No-go (loisirs ↓, santé ↑ déjà géré)
    };

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
        fhsaRoom = 8000 * fhsaEligibleUsersCount; 
    }

    let fhsaClosingYear = -1;
    let fhsaLifetimeContrib = Math.min(celiapp, 40000 * fhsaEligibleUsersCount);
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

    // V90: Scenario Overrides
    let simInflation = projection.inflationRate || 2.0;
    if (scenarioType === 'HYPER_INFLATION') simInflation = 5.5;

    let overrideRetirementAge = retirementGoal.targetAge || 65;
    if (scenarioType === 'LIBERTE_55') overrideRetirementAge = 55;
    const effectiveRetirementAge = delayPensions ? 70 : overrideRetirementAge;
    const retirementMonthIndex = (effectiveRetirementAge - currentAge) * 12;

    const baseRates = (scenarioType === 'ECONOMIC_WINTER') 
        ? { celi: 3.0, reer: 3.0, nonReg: 2.0, crypto: 5.0, cash: 1.0 }
        : ((projection as any).rates || { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 });

    const effectiveBaseExpenses = projection.useTheoretical ? (projection.theoreticalExpenses || 4000) : baseMonthlyExpenses;
    const fireTargetAnnual = effectiveBaseExpenses * 12;
    const fireTargetNetWorth = fireTargetAnnual * 25;

    const RE_PURCHASE_MONTH_OFFSET = realEstateGoals.find(g => g.isActive && g.isPrimaryResidence)?.purchaseDate
        ? getMonthOffset(realEstateGoals.find(g => g.isActive && g.isPrimaryResidence)!.purchaseDate)
        : -1;

    let month1ActionPlan = null;
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

    const incomeMarcNetMonthly = projection.useTheoretical ? ((projection.theoreticalIncome || 8000) * 0.55) : (config.users[0]?.netSalary || 0);
    const incomeAnnaNetMonthly = projection.useTheoretical ? ((projection.theoreticalIncome || 8000) * 0.45) : (config.users[1]?.netSalary || 0);
    const grossMarcBaseAnnual = projection.useTheoretical ? (incomeMarcNetMonthly * 12 * 1.35) : (config.users[0]?.grossSalary || (incomeMarcNetMonthly * 12 * 1.35));
    const grossAnnaBaseAnnual = projection.useTheoretical ? (incomeAnnaNetMonthly * 12 * 1.35) : (config.users[1]?.grossSalary || (incomeAnnaNetMonthly * 12 * 1.35));

    const simSalaryGrowth = effProj.salaryGrowth ?? 2.5;
    const simEFMonths = effProj.emergencyFundMonths || 3;

    let mcCeliRate = baseRates.celi;
    let mcReerRate = baseRates.reer;
    let mcNonRegRate = baseRates.nonReg;
    let mcCryptoRate = baseRates.crypto;
    let mcCashRate = baseRates.cash;

    const effectivePensionStartAge = delayPensions ? 70 : 65;
    const rrqMonthsFromRef = (effectivePensionStartAge - 65) * 12;
    let rrqAdjustmentFactor = 1.0;
    if (rrqMonthsFromRef < 0) {
        rrqAdjustmentFactor = 1 + Math.max(rrqMonthsFromRef, -60) * 0.006;
    } else if (rrqMonthsFromRef > 0) {
        rrqAdjustmentFactor = 1 + Math.min(rrqMonthsFromRef, 60) * 0.007; 
    }
    const rrqBasePension = retirementGoal.governmentPension * 0.65 * rrqAdjustmentFactor;
    const psvBasePension = retirementGoal.governmentPension * 0.35;

    // D2.2: RRIF_RATES et welcomeTax → ./projection/helpers

    let prevCELI = celi, prevREER = reer, prevLiquid = liquid, prevNW = (liquid + celi + reer + nonReg + crypto + reee);

    // D2.8: État LTC (Long-Term Care). Une fois déclenché, le coût mensuel
    // s'ajoute aux dépenses jusqu'à la fin de la simulation.
    let ltcActive = false;
    let nonRegACB = nonReg;

    const handleNonRegSale = (amount: number, _label: string): number => {
        const sold = Math.min(nonReg, amount);
        if (sold > 0) {
            const proportion = nonRegACB > 0 && nonReg > 0 ? Math.min(1, nonRegACB / nonReg) : 0;
            const costBasis = sold * proportion;
            nonReg -= sold;
            nonRegACB = Math.max(0, nonRegACB - costBasis);
            // V25-6: Track capital gains/losses
            const rawGain = sold - costBasis;
            if (rawGain < 0) {
                capitalLossBank += Math.abs(rawGain); // crystallise loss
            } else {
                // Apply bank if any
                const usableLoss = Math.min(rawGain, capitalLossBank);
                const taxableGain = rawGain - usableLoss;
                capitalLossBank -= usableLoss;
                accCapitalGainsYear += taxableGain;
            }
        }
        return sold;
    };

    let incomeRetirement = 0; // Scoped outside for Estate NW calculation

    // D2.8: Mortalité stochastique. En MC, à chaque début d'année on tire la
    // probabilité de décès du user principal. Le loop arrête à la mort.
    let isDead = false;

    // D2.10: Perte d'emploi stochastique. unemployedMonthsRemaining > 0
    // pendant la période sans emploi (revenu réduit à 55% capé AE).
    let unemployedMonthsRemaining = 0;

    for (let m = 0; m <= projection.years * 12; m++) {
        const currentMonthIndex = m % 12;
        const simulationStartDate = new Date(startYear, startMonth, 1);
        const currentLoopDate = new Date(simulationStartDate);
        currentLoopDate.setMonth(simulationStartDate.getMonth() + m);
        const loopYear = currentLoopDate.getFullYear();


        const age = currentAge + Math.floor(m / 12);
        const isRetired = age >= effectiveRetirementAge;

        // D2.8: tirage mortalité (annuel, au début de chaque année)
        if ((effProj as any).useStochasticMortality && enableMonteCarlo && !isDead && currentMonthIndex === 0 && m > 0) {
            const pYear = mortalityAnnualProbability(age);
            if (rng() < pYear) {
                isDead = true;
            }
        }
        if (isDead) break;

        // --- 1. GROWTH & MARKET SHOCKS ---
        let currentInflation = simInflation;



        if (enableMonteCarlo) {
            // Correlated monthly shocks using our seeded PRNG
            const Z_market = gaussianRandom(rng, 0, 1);
            const Z_macro = gaussianRandom(rng, 0, 1);

            const Z_stocks = (Z_market * 0.8 + gaussianRandom(rng, 0, 1) * 0.6);
            const Z_crypto = (Z_market * 1.2 + gaussianRandom(rng, 0, 1) * 0.8);
            const Z_inflation_shock = (-Z_market * 0.4 + Z_macro * 0.6 + gaussianRandom(rng, 0, 1) * 0.5);
            const Z_cash = (Z_inflation_shock * 0.5 + gaussianRandom(rng, 0, 1) * 0.5);

            mcCeliRate = applyShock(baseRates.celi, 15, Z_stocks);
            mcReerRate = applyShock(baseRates.reer, 15, Z_stocks);
            mcNonRegRate = applyShock(baseRates.nonReg, 15, Z_stocks);
            mcCryptoRate = applyShock(baseRates.crypto, 45, Z_crypto);
            mcCashRate = applyShock(baseRates.cash, 2, Z_cash);
            currentInflation = applyShock(simInflation, 1.5, Z_inflation_shock);
        }

        // V36: Crisis Dashboard 2.0 — Inflation Shock
        if (effProj.stressTestEnabled) {
            const crashStartMonth = (effProj.stressTestYear || 5) * 12;
            const recoveryMonths = effProj.stressTestRecoveryMonths || 24;
            if (m >= crashStartMonth && m <= crashStartMonth + recoveryMonths) {
                currentInflation += (effProj.stressTestInflationShock || 0);
            }
        }

        // V31: Calcul de l'Inflation Cumulative des Dépenses (avec GK)
        const healthInflationBonus = (isRetired && age >= 75) ? Math.min(2.5, (age - 75) * 0.25) : 0;

        // D2.9: Inflation différenciée par poste (panier CPI Stats Canada).
        let effectiveExpenseInflation: number;
        if ((effProj as any).usePerCategoryInflation) {
            // Pondérations CPI 2023: Logement 30, Alim 17, Transport 15, Santé 5, Loisirs 6, Autres 27.
            const wHousing = 0.30, wFood = 0.17, wTransport = 0.15, wHealth = 0.05, wLeisure = 0.06, wOther = 0.27;
            const iHousing  = (effProj as any).inflationHousing  ?? 4.0;
            const iFood     = (effProj as any).inflationFood     ?? 3.5;
            const iTransp   = (effProj as any).inflationTransport?? 2.5;
            const iHealthB  = ((effProj as any).inflationHealth  ?? 4.5) + healthInflationBonus; // bonus santé seulement sur la part santé
            const iLeisure  = (effProj as any).inflationLeisure  ?? 1.5;
            const iOther    = (effProj as any).inflationOther    ?? 2.0;
            effectiveExpenseInflation = wHousing*iHousing + wFood*iFood + wTransport*iTransp + wHealth*iHealthB + wLeisure*iLeisure + wOther*iOther;
        } else {
            effectiveExpenseInflation = currentInflation + healthInflationBonus;
        }

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
        const logEvent = (arr: string[], msg: string) => { if (!enableMonteCarlo) arr.push(msg); };

        // V90: Windfall Injection (L'Héritage Inattendu)
        if (scenarioType === 'WINDFALL' && m === 60) {
            const windfallAmount = 250000;
            liquid += windfallAmount;
            logEvent(lifeEventsLog, `🎁 Héritage Inattendu: +250 000$`);
            logEvent(flowEventsLog, `💰 WINDFALL: Injection de surplus.`);
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
            // V22 A: RRQ dès 60 ans (65%), PSV dès 65 ans (35%)
            // Phase 2: Arbitrage de Longévité (Délai des rentes à 70 ans)

            // PSV Prorata (40 ans de résidence pour 100%) - Tracker dynamique
            let totalPsvProrata = 0;
            let totalRrqMpeRatio = 0;
            const yearsElapsed = Math.floor(m / 12);
            // Phase 2: MGA dynamique (73200 + indexation salariale)
            const RRQ_MPE_ESTIMATE = 73200 * Math.pow(1 + (simInflation + 0.5) / 100, yearsElapsed);

            config.users.filter(u => u).forEach((u, idx) => {
                const currentGrossUser = (u.grossSalary || (baseGrossAnnual / activeUsersCount));
                // Ratio de cotisation MGA basé sur le salaire simulé actuel vs MGA courant
                totalRrqMpeRatio += Math.min(1.0, currentGrossUser / RRQ_MPE_ESTIMATE);

                // Prorata PSV basé sur le compteur dynamique arrêtté à la retraite
                totalPsvProrata += Math.min(1.0, psvResidencyYears[idx] / 40);
            });
            const psvProrata = totalPsvProrata / activeUsersCount;
            const rrqMpeRatio = totalRrqMpeRatio / activeUsersCount;

            // Le ratio est figé selon l'âge cible de retraite, pas l'âge courant
            const workedYearsAtRetirement = Math.max(0, retirementGoal.targetAge - Math.max(18, config.users[0]?.canadaArrivalYear || 18));
            const rrqProrata = Math.min(1, workedYearsAtRetirement / 39) * rrqMpeRatio;

            let rrqFactor = 1.0;
            let psvFactor = 1.0;
            let rrqStartAge = Math.max(60, retirementGoal.targetAge);
            let psvStartAge = Math.max(65, retirementGoal.targetAge);

            if (delayPensions) {
                rrqStartAge = 70;
                psvStartAge = 70;
                rrqFactor = 1.42; // Bonus max (60 months * 0.7%)
                psvFactor = 1.36; // Bonus max (60 months * 0.6%)
            } else {
                const monthsFrom65 = (rrqStartAge - 65) * 12;
                if (monthsFrom65 < 0) rrqFactor = 1 + Math.max(monthsFrom65, -60) * 0.006;
                else rrqFactor = 1 + Math.min(monthsFrom65, 60) * 0.007;

                const monthsPsvFrom65 = (psvStartAge - 65) * 12;
                if (monthsPsvFrom65 > 0) psvFactor = 1 + Math.min(monthsPsvFrom65, 60) * 0.006;
            }

            const rrqMonthly = age >= rrqStartAge ? (retirementGoal.governmentPension * 0.65 * rrqProrata * rrqFactor) : 0;
            const psvMonthly = age >= psvStartAge ? (retirementGoal.governmentPension * 0.35 * psvProrata * psvFactor) : 0;

            const inflFactor = Math.pow(1 + simInflation / 100, m / 12);

            // D2.4: Rente DB (prestations déterminées). Indexée partiellement
            // selon dbPensionIndexationPct (défaut 100% = pleinement indexée).
            const dbStartAge = retirementGoal.dbPensionStartAge ?? retirementGoal.targetAge;
            const dbBaseMonthly = retirementGoal.dbPensionMonthly || 0;
            const dbIndexationFraction = Math.min(1, Math.max(0, (retirementGoal.dbPensionIndexationPct ?? 100) / 100));
            const dbInflFactor = 1 + (inflFactor - 1) * dbIndexationFraction;
            const dbMonthly = age >= dbStartAge ? dbBaseMonthly * dbInflFactor : 0;

            incomeRetirement = Math.max(0, (rrqMonthly + psvMonthly) * inflFactor + dbMonthly - monthlyOasReduction);
            monthlyIncome = incomeRetirement;

            // D2.3: monthlyExpenses est défini de façon unique dans le bloc
            // EXPENSES & EVENTS plus bas (évite la double affectation).
        } else {
            // ---- PHASE ACTIVE ----
            const yearsElapsed = Math.floor(m / 12);
            incomeMarc = incomeMarcNetMonthly * Math.pow(1 + simSalaryGrowth / 100, yearsElapsed);
            incomeAnna = incomeAnnaNetMonthly * Math.pow(1 + simSalaryGrowth / 100, yearsElapsed);

            // D2.10: Perte d'emploi stochastique (MC uniquement).
            // Probabilité annuelle, tirée en janvier. Si déclenchée, le revenu
            // du user principal tombe à 55% (assurance-emploi) durant N mois.
            const jobLossEnabled = (effProj as any).jobLossEnabled && enableMonteCarlo;
            if (jobLossEnabled && unemployedMonthsRemaining === 0 && currentMonthIndex === 0 && m > 0) {
                const pAnnual = (effProj as any).jobLossAnnualProbability ?? 0.03;
                if (rng() < pAnnual) {
                    unemployedMonthsRemaining = (effProj as any).jobLossDurationMonths || 6;
                    logEvent(lifeEventsLog, `💼 Perte d'emploi (durée prévue ${unemployedMonthsRemaining} mois)`);
                }
            }
            if (unemployedMonthsRemaining > 0) {
                incomeMarc *= 0.55; // assurance-emploi
                unemployedMonthsRemaining--;
            }

            monthlyIncome = incomeMarc + incomeAnna;
            const currentGrossMarcAnnual = grossMarcBaseAnnual * Math.pow(1 + simSalaryGrowth / 100, yearsElapsed);
            const currentGrossAnnaAnnual = grossAnnaBaseAnnual * Math.pow(1 + simSalaryGrowth / 100, yearsElapsed);
            accGrossIncomeYear += (currentGrossMarcAnnual + currentGrossAnnaAnnual) / 12;


        }

        // --- 3. MONTHLY EXPENSES & EVENTS ---
        if (isRetired) {
            // D2.5: Smile Curve appliquée au besoin de retraite (1 si flag off).
            monthlyExpenses = Math.abs(retirementGoal.targetMonthlyIncome) * expenseMultiplier * smileLifestyleFactor(age);
        } else {
            // Active phase income & expenses
            monthlyExpenses = effectiveBaseExpenses * expenseMultiplier;
        }

        // D2.8: Long-Term Care — tirage stochastique en début d'année.
        // Probabilité convertie en probabilité mensuelle via 1 - (1-p)^(1/12).
        if ((effProj as any).ltcEnabled && enableMonteCarlo && !ltcActive && age >= 65) {
            const annualP = ltcAnnualProbability(age);
            const monthlyP = 1 - Math.pow(1 - annualP, 1 / 12);
            if (rng() < monthlyP) {
                ltcActive = true;
                logEvent(lifeEventsLog, `🏥 Soins de longue durée déclenchés à ${age} ans`);
            }
        }
        if (ltcActive) {
            const ltcCost = ((effProj as any).ltcMonthlyCost || 5000) * expenseMultiplier;
            monthlyExpenses += ltcCost;
        }

        // --- 4. TAX WITHHOLDING & APRIL SETTLEMENT ---
        let taxPaidRevenu = 0, taxPaidGains = 0, taxPaidDivers = 0, taxPaidREER = 0;
        if (currentMonthIndex === 3 && m > 0) {
            // April tax filing
            taxPaidRevenu = taxPreviousYear.revenu;
            taxPaidGains = taxPreviousYear.gains;
            taxPaidDivers = taxPreviousYear.divers;
            taxPaidREER = taxPreviousYear.reer;
            fluxImpots = taxPaidRevenu + taxPaidGains + taxPaidDivers + taxPaidREER;
            if (fluxImpots !== 0) {
                liquid -= fluxImpots;
                impotSalaireMois = taxPaidRevenu; impotReerMois = taxPaidREER;
                impotGainsMois = taxPaidGains; impotDiversMois = taxPaidDivers;
                if (fluxImpots < 0) {
                    logEvent(flowEventsLog, `💸 Remboursement d'impôt: +${Math.round(Math.abs(fluxImpots)).toLocaleString('fr-CA')}$`);
                    if (taxPaidRevenu < 0) { nonReg += Math.abs(taxPaidRevenu); nonRegACB += Math.abs(taxPaidRevenu); }
                } else {
                    logEvent(flowEventsLog, `🏛️ Fisc: Régularisation de ${Math.round(fluxImpots).toLocaleString()}$ payée.`);
                }
            }
            taxPreviousYear = { revenu: 0, gains: 0, divers: 0, reer: 0 };
        }

        // V49: Monthly salary withholding approximation (T1213 Optimization)
        if (!isRetired) {
            const yearsElapsed = Math.floor(m / 12);
            const inflationFactor = Math.pow(1 + simInflation / 100, yearsElapsed);
            const grossMarcReal = (grossMarcBaseAnnual * Math.pow(1 + simSalaryGrowth / 100, yearsElapsed)) / inflationFactor;
            const grossAnnaReal = (grossAnnaBaseAnnual * Math.pow(1 + simSalaryGrowth / 100, yearsElapsed)) / inflationFactor;

            let monthlyDeductionsMarc = 0;
            let monthlyDeductionsAnna = 0;
            
            // Si T1213 activé, l'employeur réduit la retenue selon les REER/CELIAPP du mois courant
            if (effProj.optimizeSourceDeductions) {
                const totalMonthlyDeduct = (contribREER + contribCELIAPP + (smithInterestDeductibleYear/12)) / inflationFactor;
                if (grossMarcReal > grossAnnaReal) monthlyDeductionsMarc = totalMonthlyDeduct;
                else monthlyDeductionsAnna = totalMonthlyDeduct;
            }

            const taxMarcReal = grossMarcReal > 0 ? calculateFiscalReport(grossMarcReal, monthlyDeductionsMarc, 0, loopYear, enableMonteCarlo).totalTax : 0;
            const taxAnnaReal = grossAnnaReal > 0 ? calculateFiscalReport(grossAnnaReal, monthlyDeductionsAnna, 0, loopYear, enableMonteCarlo).totalTax : 0;
            
            const totalAnnualTax = (taxMarcReal + taxAnnaReal) * inflationFactor;
            const estimatedWithholding = totalAnnualTax * 0.92;
            const approxAnnualDeficit = Math.max(-5000, totalAnnualTax - estimatedWithholding);
            
            taxCurrentYear.revenu += approxAnnualDeficit / 12;
            impotSalaireMois = 0;
        }

        // ---- DÉCEMBRE: Calcul impôts finaux et transfert pour Avril ----
        if (currentMonthIndex === 11 && m > 0) {
            const yearsElapsed = Math.floor(m / 12);
            const inflationFactor = Math.pow(1 + simInflation / 100, yearsElapsed);

            if (!isRetired) {
                const grossMarc = grossMarcBaseAnnual * Math.pow(1 + simSalaryGrowth / 100, yearsElapsed);
                const grossAnna = grossAnnaBaseAnnual * Math.pow(1 + simSalaryGrowth / 100, yearsElapsed);
                const totalDeductions = accRrspYear + accFhsaYear + smithInterestDeductibleYear;

                const grossMarcReal = grossMarc / inflationFactor;
                const grossAnnaReal = grossAnna / inflationFactor;
                const deductionsReal = totalDeductions / inflationFactor;

                // V31: Optimisation Fiscale — Déductions attribuées au salaire le plus élevé
                let deductionsMarc = 0;
                let deductionsAnna = 0;
                if (grossMarcReal > grossAnnaReal) {
                    deductionsMarc = deductionsReal;
                } else {
                    deductionsAnna = deductionsReal;
                }

                const taxMarcReal = grossMarcReal > 0 ? calculateFiscalReport(grossMarcReal, deductionsMarc, 0, loopYear, enableMonteCarlo).totalTax : 0;
                const taxAnnaReal = grossAnnaReal > 0 ? calculateFiscalReport(grossAnnaReal, deductionsAnna, 0, loopYear, enableMonteCarlo).totalTax : 0;
                const totalAnnualTax = (taxMarcReal + taxAnnaReal) * inflationFactor;

                // V49: L'employeur a retenu de l'impôt toute l'année selon s'il connaissait tes déductions ou non
                let taxMarcEmployer = taxMarcReal;
                let taxAnnaEmployer = taxAnnaReal;
                if (!effProj.optimizeSourceDeductions) {
                    taxMarcEmployer = grossMarcReal > 0 ? calculateFiscalReport(grossMarcReal, 0, 0, loopYear, enableMonteCarlo).totalTax : 0;
                    taxAnnaEmployer = grossAnnaReal > 0 ? calculateFiscalReport(grossAnnaReal, 0, 0, loopYear, enableMonteCarlo).totalTax : 0;
                }
                const totalEmployerTax = (taxMarcEmployer + taxAnnaEmployer) * inflationFactor;

                const estimatedWithholding = totalEmployerTax * 0.92;
                // V30: Overwrite the 12-month approximation with the exact verified amount (Tax Due - Tax Withheld)
                // Si optimizeSourceDeductions=false, totalAnnualTax sera beaucoup plus bas que estimatedWithholding, générant un gros remboursement!
                taxCurrentYear.revenu = Math.max(-100000, totalAnnualTax - estimatedWithholding);
            } else {
                const basePensionAnnual = (incomeRetirement * 12) + accRentesYear;
                if (basePensionAnnual > 0) {
                    const basePensionReal = basePensionAnnual / inflationFactor;
                    const taxReal = calculateFiscalReport(basePensionReal / activeUsersCount, 0, 0, loopYear).totalTax * activeUsersCount;
                    const totalTax = taxReal * inflationFactor;
                    const diff = totalTax * 0.05;
                    if (diff > 100) taxCurrentYear.revenu += diff;
                }
            }

            // V45: Ex-Glidepath logic removed.
            // La vente forcée de 5% du Non-Enreg créait une bombe fiscale inutile au sommet salarial.
            // Le ratio cible est déjà ajusté par le rebalancement virtuel des rendements effectifs.

            if (accCapitalGainsYear > 0) {
                const incomeForGains = isRetired
                    ? (incomeRetirement * 12 + accRentesYear + accRetraitsReerYear)
                    : (grossMarcBaseAnnual + grossAnnaBaseAnnual) * Math.pow(1 + simSalaryGrowth / 100, yearsElapsed);

                const currentMargForGains = getMarginalRate(incomeForGains / activeUsersCount, loopYear);

                // V31 Fix 1: Loi du Gain en Capital (Palier 250k) pour l'impôt courant
                const thresholdGains = 250000 * activeUsersCount;
                let taxableCapGains = 0;
                if (accCapitalGainsYear <= thresholdGains) {
                    taxableCapGains = accCapitalGainsYear * 0.50;
                } else {
                    taxableCapGains = (thresholdGains * 0.50) + ((accCapitalGainsYear - thresholdGains) * 0.6667);
                }

                const tax = taxableCapGains * currentMargForGains;
                taxCurrentYear.gains += tax;
                if (tax > 100) logEvent(flowEventsLog, `↳ Impôt Gains Cap Accumulés: +${Math.round(tax).toLocaleString('fr-CA')}$`);
            }
            accCapitalGainsYear = 0;

            if (nonReg > 0) {
                // On assume que 30% du rendement Non-Reg est sous forme de dividendes déterminés
                const annualDiv = nonReg * (baseRates.nonReg / 100) * 0.30;
                const incomeForDiv = (isRetired ? (incomeRetirement * 12 + accRentesYear) : (grossMarcBaseAnnual + grossAnnaBaseAnnual) * Math.pow(1 + simSalaryGrowth / 100, yearsElapsed)) / activeUsersCount;

                const currentMarginal = getMarginalRate(incomeForDiv, loopYear);
                const divTax = calculateDividendTax(annualDiv, currentMarginal);

                if (divTax > 1) {
                    taxCurrentYear.gains += divTax;
                }
            }

            smithInterestDeductibleYear = 0;
            // accGrossIncomeYear = 0; // V38: MOVED TO JANUARY to allow RRSP room calculation based on previous year
            accRrspYear = 0;
            accFhsaYear = 0;

            // V30: Transfer accumulated taxes to the 'previous year' bucket to be paid in April.
            taxPreviousYear = { ...taxCurrentYear };
            taxCurrentYear = { revenu: 0, gains: 0, reer: 0, divers: 0 };

            // V28: TFSA Room reset is now handled in January (Month 0) see line ~350

            // V28: FHSA Room reset
            const yearsSinceOpening = loopYear - celiappOpeningYear;
            if (yearsSinceOpening < 15 && fhsaLifetimeContrib < 40000 * activeUsersCount) {
                fhsaRoom = 8000 * activeUsersCount;
            }

            // V31: Tax-Loss Harvesting Actif (Récolte de pertes si marché négatif)
            const currentNonRegRate = enableMonteCarlo ? mcNonRegRate : baseRates.nonReg;
            if (currentNonRegRate < 0 && nonReg > 0) {
                const fakeSell = nonReg * 0.50; // On vend 50% du portefeuille pour cristalliser la perte
                const dropRate = Math.abs(currentNonRegRate) / 100;
                const harvestedLoss = fakeSell * dropRate;
                capitalLossBank += harvestedLoss;

                // V48: Réinvestissement fictif immédiat à la nouvelle valeur basse pour ajuster le PBR
                const proportion = nonRegACB > 0 && nonReg > 0 ? Math.min(1, nonRegACB / nonReg) : 0;
                nonRegACB -= (fakeSell * proportion); // On purge l'ancien coût
                nonRegACB += (fakeSell * (1 - dropRate)); // On rajoute le nouveau coût plus bas

                logEvent(flowEventsLog, `🛡️ Perte Cristallisée (TLH): +${Math.round(harvestedLoss).toLocaleString('fr-CA')}$ (Banque) | ACB ajusté à la baisse`);
            }
        }

        // V21 — OAS Clawback
        if (currentMonthIndex === 11 && m > 0 && isRetired && age >= 65) {
            // V31: Indexation OAS Clawback
            const OAS_THRESHOLD = 90997 * expenseMultiplier;
            const annualPensionIncome = (incomeRetirement * 12) + accRetraitsReerYear + accRentesYear;
            const psvAnnualBase = psvBasePension * 12 * Math.pow(1 + simInflation / 100, m / 12);
            if (annualPensionIncome > OAS_THRESHOLD) {
                const excess = annualPensionIncome - OAS_THRESHOLD;
                oasClawbackNextPeriod = Math.min(psvAnnualBase, excess * 0.15);
                if (oasClawbackNextPeriod > 1) flowEventsLog.push(`⚠️ PSV Clawback prévu: -${Math.round(oasClawbackNextPeriod).toLocaleString('fr-CA')}$/an`);
            } else {
                oasClawbackNextPeriod = 0;
            }
        }

        // ---- JANVIER: Réinitialisation + FERR + CELI dynamique ----
        if (currentMonthIndex === 0 && m > 0) {
            accRetraitsReerYear = 0;
            accRentesYear = 0;
            monthlyOasReduction = oasClawbackNextPeriod / 12;

            const nextLoopYear = startYear + Math.floor(m / 12);

            // V38: Plafond CELI indexé à l'inflation avec règle d'arrondi ARC (500$)
            // Formule: P_brut = 7000 * (1 + i_inf)^(Y - 2026)
            const celiLimitBrut = 7000 * Math.pow(1 + simInflation / 100, nextLoopYear - 2026);
            const celiLimitThisYear = nextLoopYear >= 2026
                ? Math.round(celiLimitBrut / 500) * 500
                : 7000;

            // V38: Seuls les résidants de 18+ ans accumulent du CELI
            let totalCeliLimitThisYear = 0;
            config.users.filter(u => u).forEach(u => {
                const birthYear = u.birthYear || (startYear - (u.age || 30));
                const arrivalYear = u.canadaArrivalYear || (startYear - 5);
                const ageThisYear = nextLoopYear - birthYear;
                if (ageThisYear >= 18 && nextLoopYear >= arrivalYear) {
                    totalCeliLimitThisYear += celiLimitThisYear;
                }
            });

            celiRoom += totalCeliLimitThisYear;

            // V38: CELIAPP Logic - Plafonds figés à 8k et 40k, limités à 15 ans
            // V66: Admissibilité dynamique - S'arrête après l'achat d'une résidence principale
            const anyUserEligibleFhsa = !hasPurchasedPrimary && config.users.some(u => {
                const birthYear = u.birthYear || (startYear - (u.age || 30));
                const arrivalYear = u.canadaArrivalYear || (startYear - 5);
                const ageThisYear = nextLoopYear - birthYear;
                const isFirstBuyer = !u.hasOwnedPropertyLast4Years;
                return ageThisYear >= 18 && nextLoopYear >= arrivalYear && isFirstBuyer;
            });

            const yearsSinceOpening = nextLoopYear - celiappOpeningYear;
            const remainingLifetimeRoom = Math.max(0, (40000 * fhsaEligibleUsersCount) - fhsaLifetimeContrib);
            
            if (anyUserEligibleFhsa && yearsSinceOpening < 15 && remainingLifetimeRoom > 0) {
                const fhsaYearlyFixed = 8000 * fhsaEligibleUsersCount;
                const unusedPrevious = fhsaRoom;
                const allowedCarryForward = Math.min(fhsaYearlyFixed, unusedPrevious);
                const newRoom = Math.min(remainingLifetimeRoom, fhsaYearlyFixed + allowedCarryForward);
                fhsaRoom = newRoom;
            } else if (yearsSinceOpening >= 15 && celiapp > 0) {
                // V38: Fermeture obligatoire après 15 ans -> Transfert vers REER (sans impact sur plafond)
                flowEventsLog.push(`🏛️ CELIAPP: Fin des 15 ans. Transfert vers REER.`);
                reer += celiapp;
                celiapp = 0;
                fhsaRoom = 0;
            } else {
                fhsaRoom = 0;
            }

            // V38: REER - Droit de cotisation de 18% du revenu brut CANADIEN de l'année précédente
            // Formule: Max_ARC = 32490 * (1 + i_plafond)^(Y - 2026)
            // V46: Indexation réaliste du plafond REER basée sur l'inflation + 0.5% (Non liée aux promotions salariales de l'utilisateur)
            let rrspYearlyCap = 33330; // 2026 cap
            if (nextLoopYear === 2025) rrspYearlyCap = 32490;
            else if (nextLoopYear > 2026) {
                const assumedRrspGrowth = (simInflation + 0.5) / 100;
                rrspYearlyCap = 33330 * Math.pow(1 + assumedRrspGrowth, nextLoopYear - 2026);
            }

            const totalFE = config.users.reduce((acc, u) => acc + (u?.facteurEquivalence || 0), 0);

            // On calcule le nouveau droit basé sur ce qui a été accumulé l'année précédente (accGrossIncomeYear)
            // V44: Subtrai le Facteur d'Équivalence (FE)
            const newRrspRoom = Math.max(0, Math.min(rrspYearlyCap * activeUsersCount, accGrossIncomeYear * 0.18) - totalFE);
            if (age <= 71) {
                rrspRoom += newRrspRoom;
            } else {
                rrspRoom = 0; // V38: Les droits s'arrêtent après 71 ans
            }
            // V38: Reset pour capturer le revenu de la nouvelle année
            accGrossIncomeYear = 0;

            if (age >= 72) { // Le statut isRetired n'a aucune importance légale ici
                const rrifRate = RRIF_RATES[age] || 0.20;
                const mandatoryGross = reer * rrifRate;

                // V47: RRIF Marginal Rate Fix - Include previous year capital gains/dividends for realistic bracket
                const priorYearGainsProxy = (taxCurrentYear.gains / 0.25) || 0; // rough proxy based on tax
                const deflatedIncomeForMargRate = ((accRetraitsReerYear + priorYearGainsProxy + (isRetired ? incomeRetirement * 12 : 0)) / activeUsersCount) / Math.pow(1 + simInflation / 100, m / 12);

                const rrifMarginalRate = calculateFiscalReport(deflatedIncomeForMargRate, 0, 0, loopYear).marginalRate;

                taxOnRrif = mandatoryGross * (rrifMarginalRate / 100);
                const netRrif = mandatoryGross - taxOnRrif;
                reer -= mandatoryGross;
                taxCurrentYear.reer += taxOnRrif;
                impotReerMois += taxOnRrif;
                accRetraitsReerYear += mandatoryGross;
                liquid += mandatoryGross;
                flowEventsLog.push(`🏦 FERR (${(rrifRate * 100).toFixed(1)}%): Brut ${mandatoryGross.toFixed(2)}$ → Net ${netRrif.toFixed(2)}$ → Liquidités`);
            }

            // V25-7: Check Guyton-Klinger (compare to portfolio NW a year ago)
            if (isRetired && m > 12) {
                const currentPortfolio = liquid + celi + reer + nonReg + crypto;
                guytonKlinger_freezeInflation = currentPortfolio < prevPortfolioNW * 0.95;
                if (guytonKlinger_freezeInflation) flowEventsLog.push('❄️ Guyton-Klinger: Gel de l’indexation des dépenses');
                prevPortfolioNW = currentPortfolio;
            }
        }

        // V31: Expiration CELIAPP (15 ans) - Transfert forcé vers REER
        // V31: Expiration CELIAPP (15 ans) gérée en Janvier seulement

        // V22: Remplacement véhicule (conditionnel)
        monthsSinceLastVehicle++;
        if (m > 0 && monthsSinceLastVehicle >= 120 && effProj.vehicleReplacementEnabled === true) {
            const vehicleCost = 35000 * Math.pow(1 + simInflation / 100, m / 12);
            liquid -= vehicleCost;
            monthsSinceLastVehicle = 0;
            lifeEventsLog.push(`🚗 Remplacement véhicule: -${Math.round(vehicleCost).toLocaleString('fr-CA')}$`);
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

        // ---- IMMOBILIER ----
        let totalImmoHypo = 0;
        let totalImmoCharges = 0;
        let totalImmoEquity = 0;
        let totalImmoDebt = 0;
        let totalRentalIncome = 0;
        // ---- IMMOBILIER (SCENARIOS) ----
        activeRE.forEach((goal, i) => {
            const pState = propertiesState[i];
            if (!pState) return;

            const purchaseOffset = getMonthOffset(goal.purchaseDate);
            if (goal.isActive && m >= purchaseOffset) {
                if (!pState.isBought) {
                    const welcomeFees = welcomeTax(goal.price);
                    const totalCashNeeded = goal.downPayment + goal.totalClosingCosts + welcomeFees;
                    if (celiapp > 0) {
                        liquid += celiapp;
                        logEvent(flowEventsLog, `Vente CELIAPP (${goal.id}): +${celiapp.toFixed(0)}$`);
                        celiapp = 0;
                        fhsaClosingYear = loopYear; // V28: Compte fermé après retrait pour achat
                    }
                    // V30: Home Buyers' Plan (RAP) logic
                    if (liquid < totalCashNeeded && reer > 0) {
                        const totalShortfall = totalCashNeeded - liquid;
                        let remainingShortfall = totalShortfall;

                        // Phase 1: Try RAP (Tax-Free Withdrawal) if eligible
                        if (goal.isPrimaryResidence && (!hasUsedRap || rapRepaymentDueTotal === 0)) {
                            const rapLimit = 60000 * activeUsersCount;
                            const rapAvailable = Math.max(0, rapLimit - rapBorrowed);
                            if (rapAvailable > 0) {
                                const rapAmount = Math.min(reer, rapAvailable, remainingShortfall);
                                if (rapAmount > 0) {
                                    reer -= rapAmount;
                                    liquid += rapAmount;
                                    rapBorrowed += rapAmount;
                                    rapRepaymentDueTotal += rapAmount;
                                    hasUsedRap = true;
                                    const graceYears = (loopYear >= 2022 && loopYear <= 2025) ? 5 : 2;
                                    rapRepaymentStartOffset = m + (graceYears * 12);
                                    withdrawalREER += rapAmount;
                                    contribLiquid += rapAmount;
                                    remainingShortfall -= rapAmount;
                                    logEvent(flowEventsLog, `↳ Retrait RAP (Non-imposable): +${Math.round(rapAmount).toLocaleString('fr-CA')}$`);
                                }
                            }
                        }

                        // Phase 2: Tax-Free CELI withdrawal
                        if (remainingShortfall > 0 && celi > 0) {
                            const celiAmount = Math.min(celi, remainingShortfall);
                            celi -= celiAmount;
                            liquid += celiAmount;
                            withdrawalCELI += celiAmount;
                            celiWithdrawalsThisYear += celiAmount;
                            retraitCeliMois += celiAmount;
                            contribLiquid += celiAmount;
                            remainingShortfall -= celiAmount;
                            logEvent(flowEventsLog, `↳ Retrait CELI (Achat Immo): +${Math.round(celiAmount).toLocaleString('fr-CA')}$`);
                        }

                        // Phase 3: Tax-Deferred Non-Reg withdrawal
                        if (remainingShortfall > 0 && nonReg > 0) {
                            const nonRegAmount = handleNonRegSale(remainingShortfall, 'Achat Immo');
                            liquid += nonRegAmount;
                            withdrawalNonReg += nonRegAmount;
                            contribLiquid += nonRegAmount;
                            remainingShortfall -= nonRegAmount;
                            logEvent(flowEventsLog, `↳ Retrait Non-Enreg (Achat Immo): +${Math.round(nonRegAmount).toLocaleString('fr-CA')}$`);
                        }

                        // Phase 4: Taxable REER Withdrawal for any remaining shortfall (Last Resort)
                        if (remainingShortfall > 0 && reer > 0) {
                            const currentAnnualGross = (isRetired ? incomeRetirement * 12 : (grossMarcBaseAnnual + grossAnnaBaseAnnual) * Math.pow(1 + simSalaryGrowth / 100, Math.floor(m / 12))) / activeUsersCount;
                            const margRate = getMarginalRate(currentAnnualGross);
                            const grossNeeded = remainingShortfall / Math.max(0.1, (1 - margRate));
                            const drawn = Math.min(reer, grossNeeded);
                            const tax = drawn * margRate;
                            const net = drawn - tax;
                            reer -= drawn; liquid += drawn; // V36: Gross
                            withdrawalREER += drawn;
                            contribLiquid += drawn;
                            taxCurrentYear.reer += tax;
                            impotReerMois += tax; // Visibility V36
                            logEvent(flowEventsLog, `🚨 Retrait REER Imposable (Achat Immo @${(margRate * 100).toFixed(0)}%): -${Math.round(drawn).toLocaleString('fr-CA')}$`);
                        }
                    }

                    if (liquid >= totalCashNeeded) {
                        liquid -= totalCashNeeded;
                        withdrawalLiquid += totalCashNeeded;
                        pState.isBought = true;
                        const r = (goal.mortgageRate / 100) / 12;
                        const n = goal.amortization * 12;
                        const p = pState.mortgage;
                        pState.calculatedPmt = r > 0 ? p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) : p / n;
                        logEvent(lifeEventsLog, `🏠 Achat (${goal.id}): -${Math.round(totalCashNeeded).toLocaleString('fr-CA')}$`);
                        logEvent(flowEventsLog, `MBP: -${goal.downPayment.toLocaleString('fr-CA')}$ | Frais+TBienv.: -${Math.round(goal.totalClosingCosts + welcomeFees).toLocaleString('fr-CA')}$`);
                        if (goal.isPrimaryResidence) hasPurchasedPrimary = true;
                    } else {
                        // Still can't afford — flag it so user knows
                        if (m === purchaseOffset) logEvent(flowEventsLog, `⚠️ Achat (${goal.id}) reporté: liquidités insuffisantes`);
                    }
                }

                if (pState.isBought && !((pState as any).isSold)) {
                    const monthsSincePurchase = m - purchaseOffset;
                    // V21 Mec 6: Renouvellement hypo (sécurisé div/0)
                    if (monthsSincePurchase > 0 && monthsSincePurchase % 60 === 0) {
                        const remainingMonths = goal.amortization * 12 - monthsSincePurchase;
                        if (remainingMonths > 60 && pState.mortgage > 0) {
                            const rateShock = ((pState.id.charCodeAt(0) % 3) - 1) * 0.015;
                            const newRate = Math.max(0.01, goal.mortgageRate / 100 + rateShock);
                            const nr = newRate / 12;
                            pState.calculatedPmt = pState.mortgage * nr * Math.pow(1 + nr, remainingMonths) / (Math.pow(1 + nr, remainingMonths) - 1);
                            logEvent(lifeEventsLog, `🏦 Renouvellement ${goal.id}: ${(newRate * 100).toFixed(2)}%`);
                        }
                    }
                    pState.currentValue *= Math.pow(1 + (goal.propertyGrowthRate || 3) / 100, 1 / 12);
                    // V25-3: Plafond maxValue
                    if (goal.maxValue && pState.currentValue > goal.maxValue) pState.currentValue = goal.maxValue;
                    const monthlyRate = (goal.mortgageRate / 100) / 12;
                    const interestPaid = pState.mortgage * monthlyRate;
                    const principalPaid = Math.max(0, pState.calculatedPmt - interestPaid);
                    const prevMortgage = pState.mortgage;
                    pState.mortgage = Math.max(0, pState.mortgage - principalPaid);
                    // V25-3: Détection payoff
                    if (prevMortgage > 0 && pState.mortgage <= 0 && !(pState as any).isPaidOff) {
                        (pState as any).isPaidOff = true;
                        pState.calculatedPmt = 0;
                        logEvent(lifeEventsLog, `🏠 Propriété payée à 100 % ! (${goal.id})`);
                    }
                    totalImmoHypo += pState.calculatedPmt;
                    totalImmoEquity += pState.currentValue - pState.mortgage;
                    totalImmoDebt += pState.mortgage;
                    immoInterest += interestPaid;
                    immoPrincipal += principalPaid;

                    // V22 G: Manoeuvre Smith — V23 Fix 3: intérêts capitalisés, hors monthlyExpenses
                    if (effProj.useSmithManoeuvre === true && goal.isPrimaryResidence && principalPaid > 0) {
                        smithManoeuvreDebt += principalPaid;
                        nonReg += principalPaid;
                        nonRegACB += principalPaid;
                        const smithInterest = smithManoeuvreDebt * (0.05 / 12);
                        // V23 Fix 3: capitalisé dans la dette (pas de sortie de cash)
                        smithManoeuvreDebt += smithInterest;
                        smithInterestDeductibleYear += smithInterest;
                    }

                    // V31: Limit LTV to 65% for Smith Manoeuvre
                    if (smithManoeuvreDebt + pState.mortgage > pState.currentValue * 0.65) {
                        const surplusMarginCall = (smithManoeuvreDebt + pState.mortgage) - (pState.currentValue * 0.65);
                        if (surplusMarginCall > 0 && nonReg > 0) {
                            const call = handleNonRegSale(surplusMarginCall, 'Margin Call LTV');
                            smithManoeuvreDebt -= call;
                            logEvent(flowEventsLog, `🚨 Appell de marge (HELOC): Vente ${Math.round(call).toLocaleString('fr-CA')}$ NonReg`);
                        }
                    }

                    if (!goal.isPrimaryResidence && goal.rentalIncomeMonthly) {
                        const rentalIncome = goal.rentalIncomeMonthly * Math.pow(1 + simInflation / 100, m / 12);
                        totalRentalIncome += rentalIncome;
                        monthlyIncome += rentalIncome;
                        accRentesYear += rentalIncome;
                    }

                    const monthlyCharges = goal.unrecoverableMonthly || 0;
                    totalImmoCharges += monthlyCharges;
                    monthlyExpenses += pState.calculatedPmt + monthlyCharges;
                    immoHypo += pState.calculatedPmt;
                    immoCharges += monthlyCharges;
                }
            }
        });

        // V27: Si une propriété est achetée et que c'est une résidence principale, l'utilisateur ne paie plus de loyer
        if (hasPurchasedPrimary) {
            monthlyExpenses -= currentRentExpense * Math.pow(1 + simInflation / 100, m / 12);
        }

        // RAP
        if (hasUsedRap && rapRepaymentDueTotal > 0 && m >= rapRepaymentStartOffset) {
            const monthlyRepayment = (rapBorrowed / 15) / 12;
            const amnt = Math.min(rapRepaymentDueTotal, monthlyRepayment);
            if (liquid >= amnt) { liquid -= amnt; reer += amnt; rapRepaymentDueTotal -= amnt; }
        }

        realEstateEquity = totalImmoEquity;
        mortgageBalance = totalImmoDebt;
        immoHypo = totalImmoHypo;

        // ---- ENFANTS & REEE ----
        activeChild.forEach((child, idx) => {
            const birthOffset = getMonthOffset(child.birthDate);
            if (child.isActive && m >= Math.max(0, birthOffset)) {
                if (m === Math.max(0, birthOffset)) {
                    liquid -= (child.initialCost ?? 0);
                    logEvent(lifeEventsLog, `Naissance 👶 (${child.name || 'Enfant'})`);
                }
                const childAgeMonths = m - Math.max(0, birthOffset);

                if (childAgeMonths < 18 * 12) {
                    let cMonthly = (child.monthlyDiapers ?? 0) + (child.monthlyFood ?? 0) + (child.monthlyClothing ?? 0);

                    // V31: RQAP Net Cashflow Fix (Remplace salaire Anna par RQAP au lieu d'ajouter un déficit)
                    let annaIsOnMatLeave = false;
                    if (childAgeMonths < 12) {
                        annaIsOnMatLeave = true;
                        const yearsElapsed = Math.floor(m / 12);
                        const annaGrossAnnual = grossAnnaBaseAnnual * Math.pow(1 + simSalaryGrowth / 100, yearsElapsed);
                        const rqapCap = 98000 * expenseMultiplier;
                        const eligibleSalary = Math.min(annaGrossAnnual, rqapCap);

                        // RQAP remplace environ 60% du net pendant 1 an
                        const rqapNetInfo = calculateFiscalReport(eligibleSalary * 0.55, 0, 0, loopYear, enableMonteCarlo);
                        const rqapNetMonthly = rqapNetInfo.netIncome / 12;

                        // Replace Anna's regular income in the general pool with RQAP
                        monthlyIncome = monthlyIncome - incomeAnna + rqapNetMonthly;
                        incomeAnna = rqapNetMonthly; // update tracking

                        // V47 RQAP Limit: Deduct Anna's missing gross salary from RRSP accumulation room
                        const annaGrossMonthly = (grossAnnaBaseAnnual * Math.pow(1 + simSalaryGrowth / 100, yearsElapsed)) / 12;
                        accGrossIncomeYear -= annaGrossMonthly; // Ne génère pas d'espace REER

                        // Offset: Anna saves ~$350/mo on commuting/lunches while home
                        const commutingSavings = 350 * expenseMultiplier;
                        monthlyExpenses -= commutingSavings;
                    }

                    if (childAgeMonths < 60 && !annaIsOnMatLeave) {
                        // V22 C: Crédit garderie QC — privée (> 400$/m) → 30% du coût
                        const daycareGross = (child.monthlyDaycare ?? 0) * expenseMultiplier;
                        const daycareCostNet = daycareGross > 400 ? daycareGross * 0.30 : daycareGross;
                        cMonthly += daycareCostNet;
                    }

                    const currentChildGrossCost = cMonthly * expenseMultiplier;
                    monthlyExpenses += currentChildGrossCost;

                    // V31: CCB Dégressif au-dessus de 150k de revenus familiaux
                    let adjustedBenefits = child.governmentBenefits ?? 0;
                    const householdGross = grossMarcBaseAnnual + grossAnnaBaseAnnual;
                    if (householdGross > 150000) {
                        const clawbackRatio = Math.max(0, 1 - ((householdGross - 150000) / 100000));
                        adjustedBenefits *= clawbackRatio;
                    }

                    monthlyIncome += adjustedBenefits;
                    childGrossCost += currentChildGrossCost;
                    childBenefits += adjustedBenefits;
                    childMonthlyCost += currentChildGrossCost;

                    // V31 + REEE Catch-up Fix
                    const childAgeYears = Math.floor(childAgeMonths / 12) + 1;
                    const maxTheoreticalScee = Math.min(7200, childAgeYears * 500);

                    let optimalReeeMonthly = 2500 / 12;
                    let sceeYearlyLimit = 500;
                    let iqeeYearlyLimit = 250;

                    // V44: Suivi isolé des subventions REEE par ID d'enfant
                    const childId = child.id || `enfant_${idx}`; // fallback
                    if (!reeeTracker[childId]) reeeTracker[childId] = { scee: 0, iqee: 0 };
                    const tracker = reeeTracker[childId];

                    // Si on a du retard sur les subventions, la cible et les plafonds doublent (Rattrapage d'une année passée)
                    if (tracker.scee < maxTheoreticalScee) {
                        optimalReeeMonthly = 5000 / 12;
                        sceeYearlyLimit = 1000;
                        iqeeYearlyLimit = 500;
                    }

                    if (liquid >= optimalReeeMonthly && !isRetired) {
                        liquid -= optimalReeeMonthly;
                        withdrawalLiquid += optimalReeeMonthly;
                        reeeContribMonthly += Math.round(optimalReeeMonthly);

                        // SCEE Rattrapage
                        const sceeGrant = Math.min(optimalReeeMonthly * 0.20, sceeYearlyLimit / 12, 7200 - tracker.scee);
                        tracker.scee += Math.max(0, sceeGrant);

                        // IQEE Rattrapage
                        const iqeeGrant = Math.min(optimalReeeMonthly * 0.10, iqeeYearlyLimit / 12, 3600 - tracker.iqee);
                        tracker.iqee += Math.max(0, iqeeGrant);

                        const totalGrant = Math.max(0, sceeGrant) + Math.max(0, iqeeGrant);
                        reee += optimalReeeMonthly + totalGrant;
                        contribREEE += optimalReeeMonthly + totalGrant;
                    }
                }

                if (childAgeMonths >= 18 * 12 && childAgeMonths < 25 * 12) {
                    const studiesMonthly = (20000 / 12) * expenseMultiplier;
                    monthlyExpenses += studiesMonthly;
                    childGrossCost += studiesMonthly;
                    childMonthlyCost += studiesMonthly;
                    if (reee >= studiesMonthly) {
                        reee -= studiesMonthly;
                        withdrawalREEE += studiesMonthly;
                        monthlyIncome += studiesMonthly;
                        reeePayoutMonthly += studiesMonthly;
                        contribLiquid += studiesMonthly;
                    } else if (reee > 0) {
                        monthlyIncome += reee;
                        reeePayoutMonthly += reee;
                        withdrawalREEE += reee;
                        contribLiquid += reee;
                        reee = 0;
                    }
                }

                // V31: Fermeture REEE à 25 ans
                if (childAgeMonths === 25 * 12 && reee > 0) {
                    liquid += reee;
                    taxCurrentYear.divers += reee * 0.20; // V31 Fix 3: Pénalité/Impôt sur retrait résiduel REEE
                    logEvent(flowEventsLog, `🎓 Fermeture REEE (${child.name || 'Enfant 25 ans'}): +${Math.round(reee).toLocaleString('fr-CA')}$ → Liquidités`);
                    reee = 0;
                }
            }
        });

        const currentIsoMonth = currentLoopDate.toISOString().split('T')[0].substring(0, 7);
        travelGoals.forEach(t => { 
            if (t.date.startsWith(currentIsoMonth)) {
                const effectiveCost = (t.totalCost ?? 0) * expenseMultiplier;
                monthlyExpenses += effectiveCost;
                logEvent(flowEventsLog, `✈️ Voyage (${t.destination}): -${Math.round(effectiveCost).toLocaleString('fr-CA')}$`);
            }
        });

        lifeEvents.forEach(e => {
            if (e.date.startsWith(currentIsoMonth)) {
                if (e.type === 'KRACH') {
                    const drop = (1 - ((e.impactPercent || 30) / 100));
                    celi *= drop; reer *= drop; nonReg *= drop; crypto *= drop;
                    logEvent(lifeEventsLog, `Krach (-${e.impactPercent}%) 📉`);
                } else {
                    // V22 D: Frais vente immobilière
                    const isVente = e.name && e.name.toLowerCase().includes('vente');
                    if (isVente) {
                        const soldProp = propertiesState.find(p => p.isBought && p.mortgage < p.currentValue);
                        if (soldProp) {
                            const saleNet = soldProp.currentValue * 0.95 - soldProp.mortgage;
                            liquid += Math.max(0, saleNet);
                            realEstateEquity -= soldProp.currentValue - soldProp.mortgage;
                            mortgageBalance -= soldProp.mortgage;
                            soldProp.isBought = false; soldProp.mortgage = 0;
                            (soldProp as any).isSold = true;
                            logEvent(lifeEventsLog, `🏠 Vente (net 95%): +${Math.round(Math.max(0, saleNet)).toLocaleString('fr-CA')}$`);
                        }
                    } else {
                        const effectiveImpact = (e.impactAmount ?? 0) * expenseMultiplier;
                        monthlyExpenses += effectiveImpact;
                        logEvent(lifeEventsLog, `${e.name} 💸`);
                        logEvent(flowEventsLog, `🔔 Événement (${e.name}): -${Math.round(effectiveImpact).toLocaleString('fr-CA')}$`);
                    }
                }
            }
        });

        // V16: Stress Test
        if (effProj.stressTestEnabled) {
            const crashStartMonth = (effProj.stressTestYear || 5) * 12;
            const recoveryMonths = effProj.stressTestRecoveryMonths || 24;
            const drop = (effProj.stressTestDrop || 30) / 100;
            if (m === crashStartMonth) {
                const shockFactor = (1 - drop);
                celi *= shockFactor; reer *= shockFactor; nonReg *= shockFactor; crypto *= shockFactor;
                logEvent(lifeEventsLog, `📉 Choc Marché -${Math.round(drop * 100)}%`);
            } else if (m > crashStartMonth && m <= crashStartMonth + recoveryMonths) {
                const recoveryBoost = drop / recoveryMonths;
                celi *= (1 + recoveryBoost * 0.9); reer *= (1 + recoveryBoost * 0.9); nonReg *= (1 + recoveryBoost * 0.9);
            }
        }

        let monthlyCashflow = monthlyIncome - monthlyExpenses;
        const targetEF = monthlyExpenses * simEFMonths;
        // V31: Coussin Passif — on laisse tomber l'EF à 50% avant de vendre des actifs
        const criticalThreshold = targetEF * 0.5;

        if (m === 1 && month1ActionPlan === null) month1ActionPlan = { monthlyCashflow, strategy };

        // --- 4. MANQUE À GAGNER (SHORTFALL) UNIFIÉ ---
        if (monthlyCashflow < 0) {
            let shortfall = -monthlyCashflow;
            // Piger dans les liquidités jusqu'au seuil critique
            if (liquid - shortfall >= criticalThreshold) {
                liquid -= shortfall;
                shortfall = 0;
            } else {
                const fromLiquid = Math.max(0, liquid - criticalThreshold);
                liquid -= fromLiquid;
                shortfall -= fromLiquid;
            }

            if (shortfall > 0) shortfallMonths++;

            if (shortfall > 0) {
                const currentAnnualGrossTotal = isRetired
                    ? ((incomeRetirement * 12) + accRetraitsReerYear + accRentesYear)
                    : ((grossMarcBaseAnnual + grossAnnaBaseAnnual) * Math.pow(1 + simSalaryGrowth / 100, Math.floor(m / 12)) + accRetraitsReerYear);

                // PBMA: Montant Personnel de Base (Quebec 2025: ~17183$)
                const pbmaThreshold = 17183 * activeUsersCount;
                let pbmaRoom = Math.max(0, pbmaThreshold - currentAnnualGrossTotal);

                // Séquence dynamique
                let buckets: string[] = [];
                if (strategy === 'PRIO_REER') buckets = ['REER', 'CELI', 'NONREG', 'CRYPTO'];
                else if (strategy === 'PRIO_CELI') buckets = ['CELI', 'NONREG', 'REER', 'CRYPTO'];
                else buckets = ['CELI', 'REER', 'NONREG', 'CRYPTO'];

                // 🌟 LOGIQUE INTELLIGENTE #1: Retrait REER à 0% d'impôt marginal
                if (shortfall > 0 && reer > 0 && pbmaRoom > 0) {
                    const desiredNet = Math.min(shortfall, pbmaRoom);
                    const { gross: grossAttempt } = calculateGrossWithholdingRRSP(desiredNet);
                    
                    // V49: Gérer la retenue plate de la banque (Cliffs)
                    let actualGrossToDraw = Math.min(reer, grossAttempt, pbmaRoom);
                    
                    // Recalculer la retenue bancaire réelle sur le montant brut PIGÉ
                    let actualWithholding = 0;
                    if (actualGrossToDraw <= 5000) actualWithholding = actualGrossToDraw * 0.21;
                    else if (actualGrossToDraw <= 15000) actualWithholding = actualGrossToDraw * 0.26;
                    else actualWithholding = actualGrossToDraw * 0.30;

                    const actualNetAttempt = actualGrossToDraw - actualWithholding;
                    
                    // V48 Shortfall Infinity Loop Fix: Cap the actual net to the real shortfall to avoid overshoot
                    const actualNet = Math.min(actualNetAttempt, shortfall);

                    reer -= actualGrossToDraw;
                    liquid += actualNet;
                    accRetraitsReerYear += actualGrossToDraw;
                    retraitReerMois += actualGrossToDraw;
                    withdrawalREER += actualGrossToDraw;
                    taxCurrentYear.reer += actualWithholding; // Régularisé en Avril (Remboursement!)
                    pbmaRoom -= actualGrossToDraw;
                    shortfall -= actualNet;
                    logEvent(flowEventsLog, `↳ Retrait REER (Palier 0%): +${actualGrossToDraw.toFixed(0)}$ Brut -> +${actualNet.toFixed(0)}$ Net`);
                }

                // PRIORITÉ STANDARD POUR LE RESTE
                for (const bucket of buckets) {
                    if (shortfall <= 0.1) break;

                    if (bucket === 'CELI' && celi > 0) {
                        const drawn = Math.min(celi, shortfall);
                        celi -= drawn; liquid += drawn;
                        celiWithdrawalsThisYear += drawn;
                        retraitCeliMois += drawn;
                        withdrawalCELI += drawn;
                        shortfall -= drawn;
                        logEvent(flowEventsLog, `↳ Retrait CELI: +${Math.round(drawn).toLocaleString('fr-CA')}$`);
                    } else if (bucket === 'NONREG' && nonReg > 0) {
                        const drawnNonReg = handleNonRegSale(shortfall, 'Retrait Vie');
                        liquid += drawnNonReg;
                        withdrawalNonReg += drawnNonReg;
                        shortfall -= drawnNonReg;
                        logEvent(flowEventsLog, `↳ Retrait Non-Enreg: +${Math.round(drawnNonReg).toLocaleString('fr-CA')}$`);
                    } else if (bucket === 'REER' && reer > 0) {
                        const { gross: grossAttempt } = calculateGrossWithholdingRRSP(shortfall);
                        const actualGrossToDraw = Math.min(reer, grossAttempt);

                        let actualWithholding = 0;
                        if (actualGrossToDraw <= 5000) actualWithholding = actualGrossToDraw * 0.21;
                        else if (actualGrossToDraw <= 15000) actualWithholding = actualGrossToDraw * 0.26;
                        else actualWithholding = actualGrossToDraw * 0.30;

                        const actualNet = actualGrossToDraw - actualWithholding;

                        reer -= actualGrossToDraw;
                        liquid += actualNet;
                        accRetraitsReerYear += actualGrossToDraw;
                        retraitReerMois += actualGrossToDraw;
                        withdrawalREER += actualGrossToDraw;
                        taxCurrentYear.reer += actualWithholding;
                        shortfall -= actualNet;
                        logEvent(flowEventsLog, `↳ Retrait REER (Standard): +${actualGrossToDraw.toFixed(0)}$ Brut -> +${actualNet.toFixed(0)}$ Net`);
                    } else if (bucket === 'CRYPTO' && crypto > 0) {
                        const drawn = Math.min(crypto, shortfall);
                        crypto -= drawn; liquid += drawn;
                        shortfall -= drawn;
                        withdrawalCrypto += drawn;
                        accCapitalGainsYear += drawn;
                        logEvent(flowEventsLog, `🚨 Liquidation Crypto (Dernier Recours): +${drawn.toFixed(0)}$`);
                    }
                }
            }

        } else {
            let excess = monthlyCashflow;

            if (liquid < targetEF) {
                const fillEF = Math.min(excess, targetEF - liquid);
                liquid += fillEF; excess -= fillEF;
            }

            // V31: Cash Drag Sweep (Investir tout excès au-dessus du fonds d'urgence)
            if (liquid > targetEF) {
                const sweep = liquid - targetEF;
                liquid -= sweep;
                excess += sweep;
            }

            // V31: Arbitrage des Dettes Toxiques (> 7%) en priorité absolue
            // MOD: If DEBT_FIRST, we pay ALL debts here.
            if (excess > 0) {
                activeDebts.filter(d => d.balance > 0 && (d.interestRate > 7 || strategy === 'DEBT_FIRST')).sort((a, b) => b.interestRate - a.interestRate).forEach(d => {
                    const pay = Math.min(excess, d.balance);
                    if (pay > 0) {
                        d.balance -= pay;
                        excess -= pay;
                        const label = d.interestRate > 7 ? 'Dette Toxique' : 'Dette (Strat. Briseur)';
                        flowEventsLog.push(`💸 Remboursement ${label} (${d.name}): -${Math.round(pay).toLocaleString('fr-CA')}$`);
                    }
                });
            }

            // MOD: Re-check if debts remain after repayment
            const hasRemainingDebtPostPay = activeDebts.some(d => d.balance > 0);

            // V66: FHSA strictly stops after purchase
            // MOD: DEBT_FIRST skips FHSA until debts are gone.
            if (excess > 0 && fhsaRoom > 0 && !isRetired && hasFuturePurchase && !hasPurchasedPrimary && (strategy !== 'DEBT_FIRST' || !hasRemainingDebtPostPay)) {
                const fillFhsa = Math.min(fhsaRoom, excess);
                celiapp += fillFhsa; fhsaRoom -= fillFhsa; fhsaLifetimeContrib += fillFhsa;
                accFhsaYear += fillFhsa; excess -= fillFhsa;
            }

            if (!isRetired) {
                const yearsElapsedForMarg = Math.floor(m / 12);
                const estAnnualGross = (grossMarcBaseAnnual + grossAnnaBaseAnnual) * Math.pow(1 + simSalaryGrowth / 100, yearsElapsedForMarg);
                const marginal = calculateFiscalReport(estAnnualGross / activeUsersCount, 0, 0, loopYear, enableMonteCarlo).marginalRate;

                // DEBT_FIRST skips regular investments until debts are clear
                if (strategy === 'DEBT_FIRST' && hasRemainingDebtPostPay) {
                    // Do nothing with excess, it will flow back to liquid below
                } else if (strategy === 'PRIO_REER' || (strategy === 'AUTO_MARGINAL' && marginal >= 40)) {
                    if (excess > 0 && rrspRoom > 0) { const fill = Math.min(rrspRoom, excess); reer += fill; rrspRoom -= fill; excess -= fill; accRrspYear += fill; contribREER += fill; }
                    if (excess > 0 && celiRoom > 0) { const fill = Math.min(celiRoom, excess); celi += fill; celiRoom -= fill; excess -= fill; contribCELI += fill; }
                } else {
                    if (excess > 0 && celiRoom > 0) { const fill = Math.min(celiRoom, excess); celi += fill; celiRoom -= fill; excess -= fill; contribCELI += fill; }
                    if (excess > 0 && rrspRoom > 0) { const fill = Math.min(rrspRoom, excess); reer += fill; rrspRoom -= fill; excess -= fill; accRrspYear += fill; contribREER += fill; }
                }
            } else {
                // RETIREMENT: RRIF Overflow Sweep
                // Prioritize TFSA/CELI first to shelter excess from tax
                if (excess > 0 && celiRoom > 0) {
                    const fill = Math.min(celiRoom, excess);
                    celi += fill;
                    celiRoom -= fill;
                    excess -= fill;
                    contribCELI += fill;
                    logEvent(flowEventsLog, `↳ Surplus redirigé vers CELI: +${Math.round(fill).toLocaleString('fr-CA')}$`);
                }
            }

            if (excess > 0) { nonReg += excess; nonRegACB += excess; contribNonReg += excess; excess = 0; }
            liquid = targetEF;
        }

        // V64: Hyper-Aggressive REER Meltdown Logic
        // If strategy is MELTDOWN_REER and we have RRSP funds, we aggressively "melt" them to avoid the 50%+ tax bomb at death.
        if (strategy === 'MELTDOWN_REER' && reer > 0) {
            const yearsSinceStart = Math.floor(m / 12);
            const currentTotalGross = isRetired 
                ? (incomeRetirement * 12 + accRetraitsReerYear + accRentesYear)
                : (grossMarcBaseAnnual + grossAnnaBaseAnnual) * Math.pow(1 + simSalaryGrowth / 100, yearsSinceStart);
            
            // Goal: Aggressive Tax Arbitrage & ESTATE MAXIMIZATION.
            // For High NW users, we target the 180k+ brackets because the loss at death is ~53%.
            // Melting at 45-50% early is still a win if it stops the exponential growth of the "tax debt".
            const totalAssets = (reer + nonReg + celi + realEstateEquity);
            const isVeryHighNW = totalAssets > 2000000;
            const isHighNW = totalAssets > 1000000;
            
            // We target a much higher "floor" for withdrawals to ensure we actually pull money out.
            // MOD: Amplified Meltdown (Lowering floor triggers more withdrawals)
            const targetMeltGross = (isVeryHighNW ? 220000 : isHighNW ? 140000 : 90000) * (activeUsersCount || 1);
            
            if (currentTotalGross < targetMeltGross) {
                // If we are below the target, we withdraw the difference.
                const meltAmountBrut = Math.min(reer, (targetMeltGross - currentTotalGross) / 12);
                
                // Minimum withdrawal to make it worth the move
                if (meltAmountBrut > 200) { 
                    const withholding = meltAmountBrut * (isVeryHighNW ? 0.38 : 0.30); // Higher withholding for high brackets
                    const netMelt = meltAmountBrut - withholding;
                    
                    reer -= meltAmountBrut;
                    nonReg += netMelt;
                    nonRegACB += netMelt;
                    accRetraitsReerYear += meltAmountBrut;
                    taxCurrentYear.reer += withholding;
                    
                    // Log the gain context only once a year to avoid spam
                    if (m % 12 === 0) {
                        logEvent(flowEventsLog, `🔥 Stratégie Meltdown: Retrait de ${Math.round(meltAmountBrut * 12).toLocaleString('fr-CA')}$ pour saturer les paliers.`);
                    }
                }
            }
        }

        // Transfert NonReg → CELI/REER si espace
        if (nonReg > 0) {
            if (celiRoom > 0) { const a = Math.min(nonReg, celiRoom); const s = handleNonRegSale(a, 'Opti.CELI'); celi += s; celiRoom -= s; }
            if (rrspRoom > 0 && nonReg > 0 && !isRetired) { const a = Math.min(nonReg, rrspRoom); const s = handleNonRegSale(a, 'Opti.REER'); reer += s; rrspRoom -= s; accRrspYear += s; }
        }

        // V21 Mec 8: Glidepath asset allocation
        const yearsToRetirementNow = Math.max(0, (retirementMonthIndex - m) / 12);
        const glideStartYears = 10;
        const targetGlideRate = simInflation + 1.0;

        // V31: Terminal Rate Glidepath (Plancher d'équité de 60% en retraite)
        let glideFactor = yearsToRetirementNow < glideStartYears ? (yearsToRetirementNow / glideStartYears) : 1.0;
        if (isRetired) glideFactor = Math.max(0.60, glideFactor);

        // Monte Carlo B: Use random rates if MC mode enabled, else use base rates
        const activeCeliRate = enableMonteCarlo ? mcCeliRate : baseRates.celi;
        const activeReerRate = enableMonteCarlo ? mcReerRate : baseRates.reer;
        const activeNonRegRate = enableMonteCarlo ? mcNonRegRate : baseRates.nonReg;
        const activeCryptoRate = enableMonteCarlo ? mcCryptoRate : baseRates.crypto;
        const activeCashRate = enableMonteCarlo ? mcCashRate : baseRates.cash;

        const effectiveCeliRateRaw = activeCeliRate * glideFactor + targetGlideRate * (1 - glideFactor);
        const effectiveReerRate = activeReerRate * glideFactor + targetGlideRate * (1 - glideFactor);
        const effectiveNonRegRateRaw = activeNonRegRate * glideFactor + targetGlideRate * (1 - glideFactor);

        // D2.7: Withholding tax US 15% — drag sur le CELI uniquement.
        // REER exempté par convention fiscale. NON_ENREG: drag présent mais
        // crédit pour impôt étranger récupère, donc négligé ici.
        const usShareCeli = Math.min(1, Math.max(0, (effProj.usEquityShareCeli ?? 0) / 100));
        const usDivYield = (effProj.usEquityDividendYield ?? 1.5) / 100;
        const usCeliDragPct = usShareCeli * usDivYield * 0.15 * 100; // en points %
        const effectiveCeliRate = effectiveCeliRateRaw - usCeliDragPct;
        const effectiveNonRegRate = effectiveNonRegRateRaw;

        // V31: Séquençage Mid-Month & Intégration globale des MER
        const applyMidMonthGrowth = (startVal: number, endVal: number, rateAnnual: number, applyMER: boolean = true) => {
            if (startVal <= 0 && endVal <= 0) return { newVal: 0, growth: 0, pct: 0 };

            const monthlyRate = Math.pow(1 + rateAnnual / 100, 1 / 12) - 1;
            const netFlow = endVal - startVal;

            // Le solde initial croît le mois entier, les flux ne croissent qu'un demi-mois
            const growthOnStart = startVal * monthlyRate;
            const growthOnFlow = netFlow * ((Math.pow(1 + rateAnnual / 100, 1 / 24)) - 1);

            const merDeduction = applyMER ? (startVal + netFlow) * (MER / 12) : 0;
            const totalGrowth = growthOnStart + growthOnFlow - merDeduction;

            const newVal = Math.max(0, endVal + totalGrowth);
            const pct = startVal > 0 ? (totalGrowth / startVal) * 100 : 0;
            return { newVal, growth: totalGrowth, pct };
        };

        const resC = applyMidMonthGrowth(prevCELI, celi, effectiveCeliRate, true);
        celi = resC.newVal; growthCELI = resC.growth; growthPctCELI = resC.pct;

        const resA = applyMidMonthGrowth(celiapp, celiapp, activeCeliRate, true);
        celiapp = resA.newVal; growthCELIAPP = resA.growth; growthPctCELIAPP = resA.pct;

        const resR = applyMidMonthGrowth(prevREER, reer, effectiveReerRate, true);
        reer = resR.newVal; growthREER = resR.growth; growthPctREER = resR.pct;

        const resN = applyMidMonthGrowth((nonReg - contribNonReg), nonReg, effectiveNonRegRate, true);
        nonReg = resN.newVal; growthNonReg = resN.growth; growthPctNonReg = resN.pct;

        const resCr = applyMidMonthGrowth(crypto, crypto, activeCryptoRate, false); // No MER on Crypto
        crypto = resCr.newVal; growthCrypto = resCr.growth; growthPctCrypto = resCr.pct;

        const resL = applyMidMonthGrowth(prevLiquid, liquid, activeCashRate, false); // No MER on cash
        liquid = resL.newVal; growthLiquid = resL.growth; growthPctLiquid = resL.pct;

        const resRE = applyMidMonthGrowth(reee - contribREEE, reee, activeCashRate, true);
        reee = resRE.newVal; growthREEE = resRE.growth; growthPctREEE = resRE.pct;

        totalGrowth += growthCELI + growthREER + growthNonReg + growthCrypto + growthLiquid + growthCELIAPP + growthREEE;
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

        // V40: Accurate Latent Tax (Liquidation Delta)
        const yearsElapsedLat = Math.floor(m / 12);
        const inflationFactorLat = Math.pow(1 + simInflation / 100, yearsElapsedLat);
        const currentGrossBaseLat = !isRetired ? (grossMarcBaseAnnual + grossAnnaBaseAnnual) * Math.pow(1 + simSalaryGrowth / 100, yearsElapsedLat) : (accRentesYear + (incomeRetirement * 12));
        const currentGrossPerUserLat = (currentGrossBaseLat / activeUsersCount) / inflationFactorLat;

        const baseTaxReport = calculateFiscalReport(currentGrossPerUserLat, 0, 0, loopYear, enableMonteCarlo);
        const baseTaxAmount = baseTaxReport.totalTax * activeUsersCount * inflationFactorLat;

        const latentCapitalGain = Math.max(0, nonReg - nonRegACB);
        const thresholdGainsLat = 250000 * activeUsersCount;
        let taxableLatentGain = 0;
        if (latentCapitalGain <= thresholdGainsLat) {
            taxableLatentGain = latentCapitalGain * 0.50;
        } else {
            taxableLatentGain = (thresholdGainsLat * 0.50) + ((latentCapitalGain - thresholdGainsLat) * 0.6667);
        }

        // Inclusion: REER is 100% taxable, Crypto is 50/66% taxable (assumed 50% for simplicity in latent)
        const totalTaxableLatentAssets = reer + crypto * 0.5 + taxableLatentGain;
        const totalLatentIncomePerUser = ((currentGrossBaseLat + totalTaxableLatentAssets) / activeUsersCount) / inflationFactorLat;
        const fullLiquidationTaxReport = calculateFiscalReport(totalLatentIncomePerUser, 0, 0, loopYear, enableMonteCarlo);
        const fullLiquidationTaxAmount = fullLiquidationTaxReport.totalTax * activeUsersCount * inflationFactorLat;

        let impotLatent = -(fullLiquidationTaxAmount - baseTaxAmount);

        // ---- V31: TFSA/FHSA Room Refills move to December block (around line 550) ----

        const expectedRealReturnRate = 0.05;
        // V31: Coast FIRE corrigé en dollars constants actuels
        const targetToday = fireTargetNetWorth;
        const coastFireNominal = m >= retirementMonthIndex ? futureFireTarget : (targetToday / Math.pow(1 + expectedRealReturnRate / 12, Math.max(0, retirementMonthIndex - m))) * expenseMultiplier;

        // V31: Barista target ajusté avec expenseMultiplier
        const baristaTargetToday = Math.max(0, effectiveBaseExpenses - 1500) * 12 * 25;
        const baristaTargetFuture = baristaTargetToday * expenseMultiplier;

        if (enableMonteCarlo) {
            data.push({ NetWorth: Number(rawNetWorth.toFixed(2)), monthIndex: m } as any);
        } else {
            data.push({
                lifeEvents: lifeEventsLog,
                flowEvents: flowEventsLog,
                monthIndex: m,
                dateLabel: `${currentLoopDate.toLocaleString('fr-CA', { month: 'short' })} ${loopYear}`,
                year: loopYear,
                age,
                IncomeMarc: Number(incomeMarc.toFixed(2)),
                IncomeAnna: Number(incomeAnna.toFixed(2)),
                IncomeRetirement: Number(incomeRetirement.toFixed(2)),
                Income: Number(monthlyIncome.toFixed(2)),
                Expenses: Number(monthlyExpenses.toFixed(2)),
                childCost: Number(childMonthlyCost.toFixed(2)),
                childGross: Number(childGrossCost.toFixed(2)),
                childBenefits: Number(childBenefits.toFixed(2)),
                ReeeContrib: Number(reeeContribMonthly.toFixed(2)),
                ReeePayout: Number(reeePayoutMonthly.toFixed(2)),
                ImmoHypo: Number(immoHypo.toFixed(2)),
                ImmoCharges: Number(immoCharges.toFixed(2)),
                ImmoInterest: Number(immoInterest.toFixed(2)),
                ImmoPrincipal: Number(immoPrincipal.toFixed(2)),
                RentalIncome: Number(totalRentalIncome.toFixed(2)),
                Savings: Number((monthlyIncome - monthlyExpenses).toFixed(2)),
                NetSalary: Number(monthlyIncome.toFixed(2)),
                Liquidites: Number(liquid.toFixed(2)),
                CELI: Number(celi.toFixed(2)),
                RetraitREER: Number(retraitReerMois.toFixed(2)),
                RetraitCELI: Number(retraitCeliMois.toFixed(2)),
                CELIMax: Number((celiRoom + celi).toFixed(2)),
                CELIAPP: Number(celiapp.toFixed(2)),
                REER: Number(reer.toFixed(2)),
                REERMax: Number((rrspRoom + reer).toFixed(2)),
                REEE: Number(reee.toFixed(2)),
                NonReg: Number(nonReg.toFixed(2)),
                Crypto: Number(crypto.toFixed(2)),
                rapBalance: Number(rapRepaymentDueTotal.toFixed(2)),
                Immobilier: Number(realEstateEquity.toFixed(2)),
                DetteTotale: Number((mortgageBalance + activeDebtsTotal).toFixed(2)),
                NetWorth: Number(rawNetWorth.toFixed(2)),
                diffNW: Number((rawNetWorth - prevNW).toFixed(2)),
                diffCELI: Number((celi - prevCELI).toFixed(2)),
                diffREER: Number((reer - prevREER).toFixed(2)),
                diffLiquid: Number((liquid - prevLiquid).toFixed(2)),
                ImpotLatent: Number(impotLatent.toFixed(2)),
                FluxImpots: Number(fluxImpots.toFixed(2)),
                ImpotRetraitREER: Number(impotReerMois.toFixed(2)),
                ImpotSalaireMois: Number(impotSalaireMois.toFixed(2)),
                ImpotGainsCap: Number(impotGainsMois.toFixed(2)),
                ImpotDivers: Number(impotDiversMois.toFixed(2)),
                TaxPaidRevenu: Number(taxPaidRevenu.toFixed(2)),
                TaxPaidGains: Number(taxPaidGains.toFixed(2)),
                TaxPaidDivers: Number(taxPaidDivers.toFixed(2)),
                TaxPaidREER: Number(taxPaidREER.toFixed(2)),
                WithheldTaxRrif: Number((taxOnRrif || 0).toFixed(2)), // V49: Export FERR flat tax withholding
                FireTarget: Number(futureFireTarget.toFixed(2)),
                CoastFIRE: Number(coastFireNominal.toFixed(2)),
                BaristaFIRE: Number(baristaTargetFuture.toFixed(2)),
                isRetired,
                ContribCELI: Number(contribCELI.toFixed(2)),
                ContribREER: Number(contribREER.toFixed(2)),
                ContribNonReg: Number(contribNonReg.toFixed(2)),
                MarketGrowthCELI: Number(growthCELI.toFixed(2)),
                MarketGrowthREER: Number(growthREER.toFixed(2)),
                MarketGrowthNonReg: Number(growthNonReg.toFixed(2)),
                MarketGrowthCrypto: Number(growthCrypto.toFixed(2)),
                MarketGrowthLiquid: Number(growthLiquid.toFixed(2)),
                MarketGrowthCELIAPP: Number(growthCELIAPP.toFixed(2)),
                MarketGrowthREEE: Number(growthREEE.toFixed(2)),
                MarketGrowthPctCELI: Number(growthPctCELI.toFixed(2)),
                MarketGrowthPctREER: Number(growthPctREER.toFixed(2)),
                MarketGrowthPctNonReg: Number(growthPctNonReg.toFixed(2)),
                MarketGrowthPctCrypto: Number(growthPctCrypto.toFixed(2)),
                MarketGrowthPctLiquid: Number(growthPctLiquid.toFixed(2)),
                MarketGrowthPctCELIAPP: Number(growthPctCELIAPP.toFixed(2)),
                MarketGrowthPctREEE: Number(growthPctREEE.toFixed(2)),
                NetTransferCELI: Number((contribCELI - withdrawalCELI).toFixed(2)),
                NetTransferREER: Number((contribREER - withdrawalREER).toFixed(2)),
                NetTransferNonReg: Number((contribNonReg - withdrawalNonReg).toFixed(2)),
                NetTransferCrypto: Number((contribCrypto - withdrawalCrypto).toFixed(2)),
                NetTransferLiquid: Number((contribLiquid - withdrawalLiquid).toFixed(2)),
                NetTransferCELIAPP: Number((contribCELIAPP - withdrawalCELIAPP).toFixed(2)),
                NetTransferREEE: Number((contribREEE - withdrawalREEE).toFixed(2)),
                ExpenseInflationImpact: Number((monthlyExpenses * (simInflation / 100 / 12)).toFixed(2)),
                ExpenseInflationPct: Number((simInflation / 12).toFixed(2)),
                AccruedTaxRevenue: Number((taxCurrentYear.revenu + taxPreviousYear.revenu).toFixed(2)),
                AccruedTaxGains: Number((taxCurrentYear.gains + taxPreviousYear.gains).toFixed(2)),
                AccruedTaxDivers: Number((taxCurrentYear.divers + taxPreviousYear.divers).toFixed(2)),
                AccruedTaxREER: Number((taxCurrentYear.reer + taxPreviousYear.reer).toFixed(2))
            });
        }
    }

    // V48: Smith Manoeuvre Bug (Création magique d'argent)
    // On soustrait strictement la dette HELOC de la valeur nette car l'actif réinvesti existe dans le Non-Enreg
    const finalRawNetWorth = liquid + celi + celiapp + reer + nonReg + crypto + reee + realEstateEquity - mortgageBalance - smithManoeuvreDebt;

    // V40: Improved Estate Net Worth (Bilan Successoral)
    // We simulate a final year including all REER and all capital gains at the end of simulation.
    const finalM = projection.years * 12;
    const finalYear = startYear + projection.years;
    const finalAge = currentAge + projection.years;
    const finalIsRetired = finalAge >= retirementGoal.targetAge;

    const estateCurrentIncome = finalIsRetired
        ? (incomeRetirement * 12 + accRentesYear + accRetraitsReerYear) // these accumulators are annual, they represent the last simulated year
        : (grossMarcBaseAnnual + grossAnnaBaseAnnual) * Math.pow(1 + simSalaryGrowth / 100, projection.years);

    const estateLatentGain = Math.max(0, nonReg - nonRegACB);
    const thresholdEstate = 250000 * activeUsersCount;

    let taxableEstateGain = 0;
    if (estateLatentGain <= thresholdEstate) {
        taxableEstateGain = estateLatentGain * 0.50;
    } else {
        taxableEstateGain = (thresholdEstate * 0.50) + ((estateLatentGain - thresholdEstate) * 0.6667);
    }

    const cryptoGain = crypto;
    const taxableCryptoGain = cryptoGain * 0.50;

    const totalEstateLiquidation = reer + taxableEstateGain + taxableCryptoGain;
    // Phase 2: Double décès (Fin de simulation complète). 
    // L'impôt de succession est appliqué à 100%, annulation du Spousal Rollover car la ligne du temps s'arrête.
    // V48: On assume que l'impôt est supporté par le survivant SEUL, car c'est la fin absolue des deux vies.
    const estateReportBase = calculateFiscalReport(estateCurrentIncome / activeUsersCount, 0, 0, finalYear, enableMonteCarlo);
    const estateReportFinal = calculateFiscalReport((estateCurrentIncome + totalEstateLiquidation), 0, 0, finalYear, enableMonteCarlo);
    const totalEstateTax = (estateReportFinal.totalTax - estateReportBase.totalTax);

    // V60: Ultimate Estate Integration (NPV of future social safety nets)
    // If we stop at age 65, the value of RRQ/PSV is high but invisible. We calculate its Net Present Value (NPV).
    const lifeExpectancy = 95;
    const remainingYearsAtEnd = Math.max(0, lifeExpectancy - finalAge);
    const rrqExpected = (retirementGoal.governmentPension * 0.65 * (activeUsersCount || 1)) * Math.pow(1 + simInflation / 100, projection.years);
    const psvExpected = (retirementGoal.governmentPension * 0.35 * (activeUsersCount || 1)) * Math.pow(1 + simInflation / 100, projection.years);
    
    // Simplification calculate NPV (Annuity present value formula)
    // r = real discount rate (risk-free after inflation), approx 2%
    const r_npv = 0.02;
    const npvFactor = r_npv > 0 ? (1 - Math.pow(1 + r_npv, -remainingYearsAtEnd)) / r_npv : remainingYearsAtEnd;
    
    const rrqNPV = finalAge >= 65 ? (rrqExpected * npvFactor) : (rrqExpected * npvFactor * Math.pow(1.02, -(65 - finalAge)));
    const psvNPV = finalAge >= 65 ? (psvExpected * npvFactor) : (psvExpected * npvFactor * Math.pow(1.02, -(65 - finalAge)));
    
    // The "Pension Bonus" reflects the extra value of having delayed pensions vs regular ones
    const pensionValueTotal = (rrqNPV + psvNPV);

    const estateNetWorth = finalRawNetWorth - totalEstateTax + (pensionValueTotal * 0.7); // 30% reduction for liquidity risk
    
    const startNW = (calculatedStartingCash + liveCSVBalances.CELI + liveCSVBalances.CELIAPP + liveCSVBalances.REER + liveCSVBalances.NON_ENREG + liveCSVBalances.CRYPTO + liveCSVBalances.REEE);

    return { 
        chartData: data, 
        actionPlan: month1ActionPlan, 
        fireNumber: fireTargetNetWorth || 0, 
        finalNetWorth: Number.isNaN(finalRawNetWorth) ? 0 : finalRawNetWorth, 
        estateNetWorth: Number.isNaN(estateNetWorth) ? 0 : estateNetWorth,
        totalEstateTax: Number.isNaN(totalEstateTax) ? 0 : totalEstateTax,
        totalTaxesPaid: totalTaxesPaid || 0,
        totalGrowth: totalGrowth || 0,
        totalExpenses,
        minNetWorth,
        shortfallRate: shortfallMonths / (projection.years * 12),
        startNW
    };
};

// ---- Monte Carlo: Run N iterations and compute P10/P50/P90 curves + success rate ----
const runMonteCarlo = (params: SimulationParams, strategy: AllocationStrategy, delayPensions: boolean, iterations = 100) => {
    // Collect all final net worths + NetWorth per month index for percentile calc
    const allRuns: { 
        netWorthByMonth: number[]; 
        finalNW: number;
        minNetWorth: number;
        totalTaxesPaid: number;
        totalGrowth: number;
        totalExpenses: number;
        shortfallRate: number;
        estateNetWorth: number;
        chartData: any[];
    }[] = [];
    // Determine number of months (intended duration: m=0 to m=years*12)
    const nMonths = params.projection.years * 12;

    for (let i = 0; i < iterations; i++) {
        const result = runScenario(params, strategy, true, delayPensions, i);
        const nwHistory = result.chartData.map(d => d.NetWorth);
        // Pad with 0 if run terminated early (bankrupty)
        while (nwHistory.length <= nMonths) {
            nwHistory.push(0);
        }
        allRuns.push({
            netWorthByMonth: nwHistory,
            finalNW: result.finalNetWorth,
            minNetWorth: result.minNetWorth,
            totalTaxesPaid: result.totalTaxesPaid,
            totalGrowth: result.totalGrowth,
            totalExpenses: result.totalExpenses,
            shortfallRate: result.shortfallRate,
            estateNetWorth: result.estateNetWorth,
            chartData: result.chartData
        });
    }

    const successRate = Math.round((allRuns.filter(r => r.finalNW > 0).length / iterations) * 100);

    // For P10/P50/P90, pick the run closest to each percentile by final NW
    const sorted = [...allRuns].sort((a, b) => a.finalNW - b.finalNW);

    // Build per-month percentile curves from collected data (including month 0)
    const p10Index = Math.floor(iterations * 0.10);
    const p50Index = Math.floor(iterations * 0.50);
    const p90Index = Math.floor(iterations * 0.90);

    const p10Data = sorted[p10Index]?.netWorthByMonth || Array(nMonths + 1).fill(0);
    const p50Data = sorted[p50Index]?.netWorthByMonth || Array(nMonths + 1).fill(0);
    const p90Data = sorted[p90Index]?.netWorthByMonth || Array(nMonths + 1).fill(0);

    // V65: Calculate FVI Components
    const startNW = (params.calculatedStartingCash + params.liveCSVBalances.CELI + params.liveCSVBalances.CELIAPP + params.liveCSVBalances.REER + params.liveCSVBalances.NON_ENREG + params.liveCSVBalances.CRYPTO + params.liveCSVBalances.REEE);
    
    // 1. Survival Score (30%)
    const survivalScore = successRate / 100;
    
    // 2. Safety Score (30%) - Stress resilience (min NW > 10% of start)
    const safetyScore = allRuns.filter((r: any) => r.minNetWorth > startNW * 0.1).length / iterations;
    
    // 3. Efficiency Score (20%) - Tax Leakage (average 1 - Taxes/Growth)
    const avgEfficiency = allRuns.reduce((acc: number, r: any) => {
        const leakage = r.totalGrowth > 0 ? Math.min(1, r.totalTaxesPaid / r.totalGrowth) : 0.5;
        return acc + (1 - leakage);
    }, 0) / iterations;

    // 4. Legacy Score (20%) - Growth potential
    const avgLegacyRatio = allRuns.reduce((acc: number, r: any) => {
        return acc + Math.min(3, r.estateNetWorth / (startNW || 1));
    }, 0) / iterations;
    const legacyScore = Math.min(1, avgLegacyRatio / 2); // Score 1 if doubled estate

    const fvi = Math.round((survivalScore * 0.3 + safetyScore * 0.3 + avgEfficiency * 0.2 + legacyScore * 0.2) * 100);

    // Expert metrics for the main scenario
    const representativeRun = sorted[p50Index] || sorted[0];

    // D2.6: Sequence-of-returns risk dans la décennie critique (5 ans avant + 5 après retraite).
    // Un krach pendant cette fenêtre est ~10× plus destructeur qu'à 20 ans de retraite.
    // Métrique: % d'itérations MC où le NW chute sous 50% du capital initial pendant la décennie critique.
    const retAge = params.retirementGoal.targetAge || 65;
    const currentAge = params.config.users[0]?.age || 30;
    const yearsToRetirement = Math.max(0, retAge - currentAge);
    const criticalDecadeStartMonth = Math.max(0, (yearsToRetirement - 5) * 12);
    const criticalDecadeEndMonth = Math.min(nMonths, (yearsToRetirement + 5) * 12);
    const fragileThreshold = startNW * 0.5;

    let fragileCount = 0;
    let worstDecadeDrawdown = 0;
    for (const run of allRuns) {
        let minInDecade = Infinity;
        for (let mi = criticalDecadeStartMonth; mi <= criticalDecadeEndMonth && mi < run.netWorthByMonth.length; mi++) {
            const nw = run.netWorthByMonth[mi];
            if (nw < minInDecade) minInDecade = nw;
        }
        if (minInDecade < fragileThreshold) fragileCount++;
        const drawdown = startNW > 0 ? Math.max(0, (startNW - minInDecade) / startNW) : 0;
        if (drawdown > worstDecadeDrawdown) worstDecadeDrawdown = drawdown;
    }
    const sequenceRiskPct = Math.round((fragileCount / iterations) * 100);

    const expertMetrics = {
        swr: representativeRun ? (representativeRun.totalExpenses / (representativeRun.chartData?.length || 1) * 12) / (startNW || 1) : 0,
        taxLeakage: representativeRun ? (representativeRun.totalTaxesPaid / (representativeRun.totalGrowth || 1)) : 0,
        shortfallRisk: representativeRun ? representativeRun.shortfallRate : 0,
        // D2.6: nouveaux champs
        sequenceRiskPct,          // % itérations où NW < 50% startNW dans la décennie critique
        worstDecadeDrawdown,      // pire chute relative (0-1) observée dans la fenêtre
        criticalDecadeStartYear: Math.floor(criticalDecadeStartMonth / 12),
        criticalDecadeEndYear: Math.floor(criticalDecadeEndMonth / 12),
    };

    return { successRate, p10Data, p50Data, p90Data, fvi, expertMetrics };
};

export const calculateFutureProjection = (params: SimulationParams, runMC: boolean = false, selectedIdx: number = 0) => {
    // V90: Avenirs de Vie (5 Distinct Futures)
    const resBase = { 
        ...runScenario(params, 'AUTO_MARGINAL', false, false, 0, 'BASE'), 
        strategyName: "Le Plan de Base", 
        stratType: 'BASE', 
        delayPensions: false,
        stratDescription: "Votre trajectoire actuelle basée sur les paramètres standards (Inflation 2%, Retraite 65 ans).",
        pros: ["Équilibre réaliste", "Stabilité fiscale"],
        cons: ["Dépendance aux marchés standards"],
        icon: '📊'
    };
    const resLiberté55 = { 
        ...runScenario(params, 'PRIO_REER', false, false, 0, 'LIBERTE_55'), 
        strategyName: "Liberté 55", 
        stratType: 'LIBERTE_55', 
        delayPensions: false,
        stratDescription: "Simule un arrêt de travail précoce à 55 ans en maximisant le REER pour combler le pont fiscal.",
        pros: ["Retraite anticipée", "Pont fiscal optimisé"],
        cons: ["Nécessite une épargne agressive dès maintenant"],
        icon: '🌅'
    };
    const resHyperInflation = { 
        ...runScenario(params, 'AUTO_MARGINAL', false, false, 0, 'HYPER_INFLATION'), 
        strategyName: "Le Choc d'Inflation", 
        stratType: 'HYPER_INFLATION', 
        delayPensions: false,
        stratDescription: "Scénario catastrophe avec une inflation soutenue à 5.5% (type années 70-80).",
        pros: ["Test de résilience"],
        cons: ["Érosion massive du pouvoir d'achat"],
        icon: '🔥'
    };
    const resWindfall = { 
        ...runScenario(params, 'AUTO_MARGINAL', false, false, 0, 'WINDFALL'), 
        strategyName: "L'Héritage Inattendu", 
        stratType: 'WINDFALL', 
        delayPensions: false,
        stratDescription: "Simule une injection de 250,000$ (héritage ou gain) après 5 ans.",
        pros: ["Accélération massive", "Liberté financière soudaine"],
        cons: ["Incertitude sur le timing réel"],
        icon: '🎁'
    };
    const resWinter = { 
        ...runScenario(params, 'AUTO_MARGINAL', false, false, 0, 'ECONOMIC_WINTER'), 
        strategyName: "L'Hiver Économique", 
        stratType: 'ECONOMIC_WINTER', 
        delayPensions: false,
        stratDescription: "Une décennie de croissance faible (3% Bourse, 1% Cash) combinée à une inflation persistante.",
        pros: ["Scénario prudent"],
        cons: ["Croissance du patrimoine très lente"],
        icon: '❄️'
    };

    const results = [resBase, resLiberté55, resHyperInflation, resWindfall, resWinter];

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
        // D2.3: revenu à 100 itérations (IC95% ≈ ±3 points vs ±7 à 50 iter).
        // Migration vers Web Worker prévue pour pouvoir aller à 500-1000.
        const MC_ITERATIONS = 100;
        const mcResult = runMonteCarlo(params, 'AUTO_MARGINAL', target.delayPensions, MC_ITERATIONS);
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
