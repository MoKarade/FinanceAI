// services/projection.ts — moteur de projection financière (migré depuis utils/useFutureSimulation.ts)
import { ProjectionConfig, RealEstateGoal, ChildGoal, TravelGoal, LifeEvent, Debt, RetirementGoal, BudgetConfig as Config, InsurancePolicy, VehicleReplacement, MajorRenovation, CharitableGoal, RentalProperty, PrivateBusiness, SavingsGoal, FinancialGoal } from '../types';
import { calculateFiscalReport, getMarginalRate, calculateDividendTax, getDividendGrossUpRate, calculateGrossWithholdingRRSP, getResidencyStartYear, CAPITAL_GAINS_INCLUSION_STANDARD, FHSA_ANNUAL_LIMIT_PER_USER, FHSA_LIFETIME_LIMIT_PER_USER } from '../utils/tax';
import { RRIF_RATES, welcomeTax, NONREG_DIVIDEND_DISTRIBUTION_SHARE } from './projection/helpers';
import { salaryShares, splitByShares, stepReerByUser, addByWeights } from './projection/perUserBalances';
import { logError, logErrorThrottled } from './errorLogger';
import { runMonteCarlo, effectiveMcIterations, type MonteCarloResult } from './projection/monteCarlo';
import type { EngineOverrides, StrategyConfig } from './projection/strategyConfig';
import { returnRatesForProfile } from './projection/strategyConfig';
import { runStrategySearch, type StrategySearchResult, type RunStrategySearchOptions } from './projection/strategySearch';
import { ASSET_LOCATION_BONUS_PP } from './projection/strategySpace';
import { SCENARIO_DEFINITIONS, strategyDefFor } from './projection/scenarios';
import { applyW5Effects, applyAgeBasedExpenses } from './projection/w5Effects';
import { tryCriticalIllness, tryInheritance, tryMortality, trySpouseMortality, tryLtcTrigger, ltcMonthlyCost, tryDivorce, clampSplitPct, DIVORCE_SPLIT_PCT_DEFAULT } from './projection/stochasticEvents';
import { processAprilSettlement } from './projection/taxApril';
import { computeOasClawback, computeAnnualNonRegDividends, processTaxLossHarvesting, processGainHarvesting, processDecemberTaxFiling } from './projection/taxDecember';
import { processJanuaryReset } from './projection/taxJanuary';
import { phaseDette, estLePremierMoisApresLeTerme } from './projection/debtSchedule';
import { initRentalStates, processRentalMonth } from './projection/rentalMonth';
import { processAutoVehicleReplacement } from './projection/vehicleCycle';
import { buildHistoricalSequence, buildReplaySequence, type YearReturn } from './projection/historicalReturns';
import { computeRetirementIncome, computeDbPensionMonthly } from './projection/retirementIncome';
import { processOneChild } from './projection/childrenReee';
// [FUTUR-FIRE-STRUCT] Libellé du jalon FIRE partagé avec ses consommateurs (le texte n'est plus
// dupliqué en dur : un lecteur qui doit matcher le libellé compare à la MÊME constante).
import { FIRE_LIFE_EVENT } from './projection/fireMilestone';
import { computeActiveIncome } from './projection/activeIncome';
import { processReerMeltdown } from './projection/meltdownReer';
import { initPastPurchase } from './projection/pastPurchaseInit';
import { SCHL_AMORT_MAX_INSURED_STANDARD } from './realEstate';
import { applyTravelExpenses, applyLifeEvents, computeStressTest, applySavingsGoalDeadlines, applyFinancialGoalDeadlines, computeIncomeLossFactor } from './projection/monthlyEvents';
import { computeLatentTax } from './projection/latentTax';
import { computeGlidepathRates } from './projection/glidepathRates';
import { processCashflowAllocation, type CashflowState } from './projection/cashflowAllocation';
import { processRealEstate, type RealEstateState } from './projection/realEstateMonth';
import { buildMonthlyDataPoint } from './projection/monthlyOutput';
import { FIRE_TARGET_MULTIPLE } from './projection/modelAssumptions';
import { computeRawNetWorth } from './projection/netWorth';
import { applyMonthlyGrowth } from './projection/growthApplication';
import { buildSeededRng, computeHistoricalContributionRoom, computeRrqAdjustment, computeIncomeBaseline, computeScenarioOverrides, makeSmileLifestyleFactor } from './projection/setupSimulation';
import { handleNonRegSale as portfolioNonRegSale, handleCryptoSale as portfolioCryptoSale, applyCapitalDisposition } from './projection/portfolioOps';
import { computeEstateNetWorth } from './projection/estateCalculation';
import { computeMonthlyMarketRates, type StressTestConfig } from './projection/marketShocks';
import { computeEffectiveExpenseInflation } from './projection/monthlyCalcs';
import { type AllocationStrategy, type FutureScenarioType, type ProjectionResult } from './projection/types';
export type { AllocationStrategy, FutureScenarioType, ProjectionChartPoint, ProjectionResult } from './projection/types';
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
/**
 * [ENG-MC-OBSERVABILITY] Options de DIAGNOSTIC — délibérément séparées d'`EngineOverrides`, qui
 * porte des LEVIERS de stratégie explorés par la recherche (`strategySpace`). Un drapeau de
 * diagnostic glissé là-dedans serait balayé comme s'il changeait le plan financier.
 */
export interface ScenarioDiagnostics {
    /**
     * Émettre le point mensuel COMPLET même sous Monte-Carlo. **Tests uniquement.**
     * Sous MC, `buildMonthlyDataPoint` ne rend normalement que `{ NetWorth, monthIndex }` (perf).
     * Or le divorce, la mortalité du conjoint, le LTC et la perte d'emploi n'existent QUE sous MC :
     * leurs flux mensuels étaient donc INVÉRIFIABLES. Trois lots ont dû se rabattre sur des
     * agrégats ou des tests de fonction pure faute de pouvoir les observer.
     */
    verboseMonthlyPoints?: boolean;
}

const runScenario = (params: SimulationParams, strategy: AllocationStrategy, enableMonteCarlo = false, delayPensions = false, mcIterationIndex = 0, scenarioType: FutureScenarioType = 'BASE', overrides: EngineOverrides = {}, diagnostics: ScenarioDiagnostics = {}) => {
    const { projection, calculatedStartingCash, liveCSVBalances, realEstateGoals, debts, childGoals, travelGoals, lifeEvents, retirementGoal, config, baseGrossAnnual, baseNetAnnual, currentRentExpense, baseMonthlyExpenses, startYear = 2026, startMonth = 0, insurancePolicies = [], vehicleReplacements = [], majorRenovations = [], charitableGoals = [], rentalProperties = [], privateBusinesses = [], savingsGoals = [], financialGoals = [] } = params;
    
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
        if (isNaN(year) || isNaN(month)) {
            // [Panel #552, silent-failure] une date corrompue (offset 0 silencieux) rend un bien
            // DÉTENU indiscernable d'un achat « ce mois-ci » — tracer, jamais avaler.
            logErrorThrottled(`monthOffset-invalide:${dateStr}`, {
                source: 'projection', severity: 'warning',
                message: 'Date illisible dans la simulation — offset 0 appliqué',
                context: { date: dateStr.slice(0, 10) },
            });
            return 0;
        }
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

    // Sanitisation à la frontière (panel #552, même patron que activeDebts plus bas) : un champ
    // immo vidé dans l'UI (`parseFloat('')` = NaN) empoisonnait `goal.mortgageRate / 100` → PMT
    // NaN → 968 valeurs non finies mesurées dans chartData, rabattues en « 0 $ crédible » par la
    // garde de computeRawNetWorth. Normalisé + JOURNALISÉ (jamais avalé). NB : `activeRE` ne
    // filtre PAS isActive (seulement les entrées nullish) — le gate isActive vit dans le moteur.
    const activeRE = (realEstateGoals || []).filter(g => !!g).map(g => {
        const price = Number.isFinite(g.price) ? g.price : 0;
        const downPayment = Number.isFinite(g.downPayment) ? g.downPayment : 0;
        const mortgageRate = Number.isFinite(g.mortgageRate) ? g.mortgageRate : 0;
        const amortization = Number.isFinite(g.amortization) && (g.amortization as number) > 0
            ? g.amortization : SCHL_AMORT_MAX_INSURED_STANDARD;
        const hadCorruption = [g.price, g.downPayment, g.mortgageRate, g.amortization]
            .some(v => v != null && !Number.isFinite(Number(v)));
        if (hadCorruption) {
            logError({
                source: 'projection', severity: 'warning',
                message: 'RealEstateGoal à champ non numérique normalisé (projection)',
                context: { id: g.id, name: g.name },
            });
        }
        return { ...g, price, downPayment, mortgageRate, amortization };
    });
    const activeChild = (childGoals || []).filter(g => !!g);

    let realEstateEquity = 0;
    let mortgageBalance = 0;
    // [ENG-W5-RENTAL-OFFBALANCE] État des immeubles locatifs (W5.6). Jusqu'ici leur valeur, leur
    // hypothèque et le service de celle-ci n'existaient NULLE PART dans le moteur — seul le NOI
    // affluait au revenu (`w5Effects`). Mesuré : 300 k$ d'équité + 500 k$ de prêt introuvables.
    const rentalStates = initRentalStates(rentalProperties);
    /**
     * [ENG-W5-BUSINESS-OFFBALANCE] Valeur des entreprises privées détenues (W5.7), au prorata de la
     * part. Jusqu'au 2026-08-19, seul `annualDividend` circulait : la valeur elle-même n'entrait ni
     * au patrimoine mensuel ni à la succession — **2 M$ mesurés absents du NW**.
     *
     * ⚠️ On compte `estimatedValue × ownershipPct` et **PAS** `retainedEarnings` : une valeur juste
     * marchande EMBARQUE déjà les bénéfices non répartis (l'encaisse de la société en fait partie).
     * Les additionner double-compterait de 400 k$ dans le persona de référence. Si `estimatedValue`
     * devait un jour s'entendre HORS encaisse, ce serait une décision à écrire dans
     * `docs/adr/`, pas un `+` discret ici.
     *
     * ⚠️ Valeur CONSTANTE sur tout l'horizon : aucune croissance n'est modélisée. Faire croître une
     * entreprise privée à un taux inventé serait de la donnée fabriquée — le manque est nommé au
     * BACKLOG plutôt que comblé au jugé.
     */
    const privateBusinessValue = (privateBusinesses ?? []).reduce((sum, b) => {
        const v = Number(b?.estimatedValue);
        const pct = Number(b?.ownershipPct);
        if (!Number.isFinite(v) || v <= 0) return sum;
        const part = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 100;
        return sum + v * (part / 100);
    }, 0);
    const rentalNames = (rentalProperties ?? []).map(rp => rp?.name || 'immeuble locatif');

    let propertiesState = activeRE.map(g => {
        // [ENG-PAST-PURCHASE] (décision Marc 2026-07-31) Un bien acheté dans le PASSÉ démarre
        // DÉJÀ DÉTENU : équité présente dès le mois 0, hypothèque restante amortie, AUCUN débit
        // de mise de fonds du cash d'aujourd'hui. Avant : re-achat au m0 si le cash suffisait
        // (mise de fonds dépensée DEUX fois) ou « Achat reporté » à l'infini sinon (le Futur
        // perdait la maison — mesuré Immobilier = 0 sur tout l'horizon).
        const purchaseOffset = getMonthOffset(g.purchaseDate);
        // [ENG-PAST-OWNED-VS-PLANNED] (A6) : une date passée n'implique plus l'achat — seul
        // `isOwned !== false` initialise le passé (false = objectif planifié non réalisé → RIEN ;
        // undefined = legacy, comportement historique conservé, l'UI pose la question).
        const past = g.isActive && purchaseOffset < 0 && g.isOwned !== false ? initPastPurchase(g, -purchaseOffset) : null;
        return {
            id: g.id || 'anon',
            isBought: !!past,
            mortgage: past ? past.mortgage : (g.price || 0) - (g.downPayment || 0),
            currentValue: past ? past.currentValue : (g.price || 0),
            calculatedPmt: past ? past.calculatedPmt : 0,
            isPaidOff: past ? past.isPaidOff : false,
            isSold: false,
            // RE-GAIN — coût d'achat (ACB approx) + nature RP/locatif, pour imposer le gain en capital
            // à la disposition d'un immeuble locatif (vente via LifeEvent ou disposition réputée au décès).
            cost: g.price || 0,
            isPrimaryResidence: g.isPrimaryResidence ?? false,
        };
    });
    // [Panel #552, ÉLEVÉ projection-validator] SEMER l'équité/dette immo des biens DÉJÀ détenus
    // AVANT les graines prevNW/minNetWorth (plus bas) : sans ça, le bien passé existe au m0 mais
    // pas dans la graine → diffNW[0] portait un « flux fantôme » de toute l'équité (mesuré
    // +156 629 $) et minNetWorth démarrait SOUS le vrai plancher de 158 731 $ → biais pessimiste
    // dans safetyScore (Monte-Carlo), goalSeek et strategyRanking pour tout propriétaire.
    for (const p of propertiesState) {
        if (p.isBought) {
            realEstateEquity += p.currentValue - p.mortgage;
            mortgageBalance += p.mortgage;
        }
    }
    // [Panel #552, ÉLEVÉ financial-integrity] Pour une RP déjà détenue au boot, la substitution
    // « loyer retiré ↔ PMT ajouté » doit être NULLE au départ : le budget de base d'un propriétaire
    // contient DÉJÀ son versement hypothécaire réel. L'offset = PMT reconstruit + charges (constant,
    // comme les ajouts du moteur), au lieu du proxy loyer (défaut 1 600 $ → sur-charge mesurée
    // jusqu'à 20 084 $/an quand aucune ligne « logement » n'existe au budget).
    const bootPrimaryHousingOffset = propertiesState.reduce((s, p, i) =>
        s + (p.isBought && p.isPrimaryResidence
            ? p.calculatedPmt + (activeRE[i]?.unrecoverableMonthly || 0)
            : 0), 0);

    // Sanitisation à la frontière : un champ vidé dans l'UI (`parseFloat('')` = NaN, DebtManager)
    // contaminerait sinon `d.balance` (NaN persistant via l'amortissement) → `rawNetWorth` = NaN →
    // patrimoine net cassé SILENCIEUSEMENT (graphe vide). On normalise à 0 et on JOURNALISE
    // l'anomalie (jamais avalée). [silent-failure-hunter, money-critical 2026-06-16]
    let activeDebts = (debts || []).filter(d => !!d).map(d => {
        const balance = Number.isFinite(d.balance) ? d.balance : 0;
        const interestRate = Number.isFinite(d.interestRate) ? d.interestRate : 0;
        const minimumPayment = Number.isFinite(d.minimumPayment) ? d.minimumPayment : 0;
        if (balance !== d.balance || interestRate !== d.interestRate || minimumPayment !== d.minimumPayment) {
            logError({
                source: 'projection', severity: 'warning',
                message: 'Dette à champ non numérique normalisée à 0 (projection)',
                context: { id: d.id, name: d.name },
            });
        }
        return { ...d, balance, interestRate, minimumPayment };
    });
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
    
    // [ENG-PAST-PURCHASE] Une résidence principale DÉJÀ détenue au boot (achat passé) → le loyer
    // n'est pas facturé dès le mois 0. (`isBought` exige déjà `isActive` en amont — pas de garde
    // redondante ici, finding panel #552.)
    let hasPurchasedPrimary = propertiesState.some(p => p.isBought && p.isPrimaryResidence);
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

    // PH4-FUT-B-3 — levier « taux d'épargne » : multiplie l'épargne mensuelle (net − dépenses) par
    // `appliedSavingsMultiplier` et RÉDUIT les dépenses d'autant (conservation du revenu net : épargner
    // plus = dépenser moins, le surplus est investi par la cascade). Appliqué seulement en mode RÉEL et
    // sur une épargne POSITIVE (en déficit, « épargner plus » est mal défini → aucun effet). Défaut
    // absent/1 → dépenses inchangées (non-régression). baseNetAnnual et baseMonthlyExpenses ⊂ params.
    const savingsMult = projection.appliedSavingsMultiplier ?? 1;
    const realMonthlySavings = baseNetAnnual / 12 - baseMonthlyExpenses;
    const adjustedRealExpenses = (savingsMult !== 1 && realMonthlySavings > 0)
        ? Math.max(0, baseNetAnnual / 12 - realMonthlySavings * savingsMult)
        : baseMonthlyExpenses;
    const effectiveBaseExpenses = projection.useTheoretical ? (projection.theoreticalExpenses || 4000) : adjustedRealExpenses;
    const fireTargetAnnual = effectiveBaseExpenses * 12;
    // Règle des 4 % (Trinity Study, 1998) — justification et source unique du multiple :
    // `services/projection/modelAssumptions.ts`.
    const fireTargetNetWorth = fireTargetAnnual * FIRE_TARGET_MULTIPLE;

    // FIX cycle 2 TS reviewer: type explicite pour éviter inférence `null` (cascade strict)
    let month1ActionPlan: { monthlyCashflow: number; strategy: AllocationStrategy } | null = null;
    // [FISC-RRSP-ROOM-PER-USER] Revenu gagné de l'année PAR personne (règle ARC : les droits REER
    // se calculent PAR PERSONNE, jamais sur l'agrégat ménage). SOURCE UNIQUE : l'ancien scalaire
    // ménage accGrossIncomeYear a été SUPPRIMÉ (plus aucun lecteur) — un total se dérive par somme,
    // il ne se co-tient pas (PARTAGER-LE-MONTANT-PAS-SES-REFLETS).
    let accGrossIncomeYearByUser: [number, number] = [0, 0];
    let accRrspYear = 0;

    // donCredit [FA-6-CREDIT-CAP] = crédit-don accumulé (positif) ; plafonné à l'impôt dû puis appliqué
    // à `divers` en décembre (un crédit non remboursable ne peut pas générer de remboursement net).
    let taxCurrentYear = { revenu: 0, gains: 0, reer: 0, divers: 0, donCredit: 0 };
    let taxPreviousYear = { revenu: 0, gains: 0, reer: 0, divers: 0, donCredit: 0 };
    // [ENG-TTP-UNSETTLED-HORIZON] Dette fiscale RÉCONCILIÉE (par le dernier décembre) pas encore
    // réglée par un avril — photographiée à la réconciliation, remise à 0 au règlement.
    let reconciledUnsettledTax = 0;

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
    let guytonKlinger_indexationFactor = 1; // [ENG-GK-THRESHOLD-KNIFE] 1 = indexation pleine, 0 = gel total (lissé)
    let expenseMultiplier = 1;

    // V65: Advanced Metrics Tracking
    let totalTaxesPaid = 0;
    let totalGrowth = 0;
    let totalExpenses = 0;
    // minNetWorth : initialisé plus bas via la SOURCE UNIQUE (computeRawNetWorth), une fois la
    // closure currentRawNetWorth définie — sinon une copie locale incomplète (sans dettes) ferait
    // démarrer le min surévalué pour un persona endetté. [fix MEDIUM review 2026-06-16]
    let shortfallMonths = 0;
    // [PV-6] Passif d'INSOLVABILITÉ : résiduel d'un découvert NON couvert par la cascade de sauvetage
    // (comptes épuisés / cap OAS). Avant, il était absorbé par `liquid = 0` (CF-2) → patrimoine
    // surévalué dans les scénarios DÉJÀ en ruine. On le porte désormais comme dette cumulée, soustraite
    // du patrimoine net (mensuel + succession). Pas d'intérêt (conservateur ; scénario déjà ruiné).
    let liquidDebt = 0;
    // [PV-11a] — shortfalls d'OBJECTIF (drawn < visé aux deadlines de goals) : métrique structurée
    // (≠ shortfallMonths qui compte les mois de déficit de CASHFLOW — sémantique différente).
    let goalShortfallCount = 0;
    let goalShortfallTotal = 0;

    let reeeTracker: Record<string, { scee: number; iqee: number; contribLifetime: number }> = {};

    // Cycle 22 split: revenus net/brut baseline → ./projection/setupSimulation
    const { incomeMarcNetMonthly, incomeAnnaNetMonthly, grossMarcBaseAnnual, grossAnnaBaseAnnual } =
        computeIncomeBaseline(projection, config.users, startYear);

    // Registre REER PAR CONJOINT maintenu EN PARALLÈLE du solde commun (qui reste la vérité). Clé de
    // répartition = part salariale (proxy d'historique de cotisation ; `rrspContributed` prévu — ITEM-2C
    // sous-phase suivante). Invariant Σ(reerByUser) == reer garanti par stepReerByUser.
    // [ITEM-2C] Depuis le fix FERR per-conjoint, ce registre PILOTE la fiscalité : chaque conjoint de 72+
    // convertit SA part au facteur RRIF de SON âge (taxJanuary). Au décès, la part du défunt roule vers le
    // survivant (cf bloc survivorMode). Plus un shadow.
    // ⚠️ [panel #613 — ÉLEVÉ-2] `let`, PAS `const`. Ces parts pilotent l'attribution des COTISATIONS
    // dans `stepReerByUser` : tant qu'elles restent celles du couple, le slot du conjoint parti se
    // REPEUPLE dès la première cotisation, et la consolidation `reerByUser = [reer, 0]` faite au
    // divorce ne tient qu'UN MOIS. Mesuré : 342 658 $ réattribués à l'ex, et 16 janviers de FERR
    // OBLIGATOIRE sur ce slot fantôme (257 627 $ de retraits bruts imposés au ménage) — parce que
    // `taxJanuary` convertit `reerByUser[1]` au facteur RRIF de l'ÂGE de `config.users[1]`, un
    // contribuable qui n'est plus dans le ménage. C'est la régression FISC-SURVIVOR-DRAWDOWN, que
    // le bloc décès avait corrigée pour lui-même sans corriger les PARTS (défaut latent identique).
    let reerShares = salaryShares(
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

    // Patrimoine net via la SOURCE UNIQUE (computeRawNetWorth) → rawNetWorth, prevNW et la
    // succession utilisent la MÊME formule. Closure : lit les valeurs courantes des variables de
    // boucle à chaque appel. [audit money-critical 2026-06-16]
    // [DETTE-DATES] Mois courant de la boucle, publié ici pour que `sumActiveDebts` (closure définie
    // AVANT la boucle) puisse écarter les dettes PAS ENCORE COMMENCÉES. Sans ça, un prêt signé dans
    // six mois pèserait sur le bilan dès aujourd'hui — une dette qu'on n'a pas encore est une
    // donnée inventée, exactement ce que le no-fake-data interdit.
    let moisCourantPourDettes = 0;
    const sumActiveDebts = (): number => activeDebts.reduce(
        (s, d) => (phaseDette(d, startYear, startMonth, moisCourantPourDettes) === 'a-venir'
            ? s
            : s + (Number.isFinite(d.balance) ? d.balance : 0)),
        0,
    );
    const currentRawNetWorth = (): number => computeRawNetWorth({
        liquid, celi, celiapp, reer, nonReg, crypto, reee, realEstateEquity,
        privateBusinessValue,
        liquidDebt, smithManoeuvreDebt, activeDebtsTotal: sumActiveDebts(),
    });

    let prevCELI = celi, prevREER = reer, prevLiquid = liquid;
    // prevNW DOIT suivre la MÊME formule que rawNetWorth (celiapp + realEstateEquity − toutes les
    // dettes), sinon diffNW = rawNetWorth − prevNW est faussé en permanence. [finding prevNW]
    let prevNW = currentRawNetWorth();
    // minNetWorth (suivi du plus bas patrimoine sur la projection) part du VRAI patrimoine de départ,
    // dettes initiales incluses (même source unique que prevNW). Sinon, pour un persona endetté, le min
    // démarrait surévalué de Σ(dettes) → safetyScore/goalSeek surestimaient la sécurité. [fix review 2026-06-16]
    let minNetWorth = currentRawNetWorth();

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
    // [PV-11c] — le paramètre `_label` (jamais consommé, suggérait un log inexistant) est retiré.
    const handleNonRegSale = (amount: number): number => {
        const ms = { nonReg, nonRegACB, capitalLossBank, accCapitalGainsYear };
        const sold = portfolioNonRegSale(ms, amount);
        nonReg = ms.nonReg;
        nonRegACB = ms.nonRegACB;
        capitalLossBank = ms.capitalLossBank;
        accCapitalGainsYear = ms.accCapitalGainsYear;
        return sold;
    };
    // [PV-7] Closure crypto symétrique : gain proportionnel + banque de pertes (cf portfolioOps).
    const handleCryptoSaleLocal = (amount: number): number => {
        const ms = { crypto, cryptoACB, capitalLossBank, accCapitalGainsYear };
        const sold = portfolioCryptoSale(ms, amount);
        crypto = ms.crypto;
        cryptoACB = ms.cryptoACB;
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
    // PV-9 — gains en capital RÉALISÉS de l'année courante (BRUT, avant inclusion 50 %), capturés
    // AVANT le reset de décembre. Servent à 2 assiettes : le clawback PSV de l'année N (décembre)
    // et le test SRG de l'année N+1 (`prevYearCapitalGainsForGisNominal`, lag comme les retraits REER).
    let capitalGainsRealizedThisYear = 0;
    let prevYearCapitalGainsForGisNominal = 0;
    // Phase 3 Tier 3 — split par source (RRQ + PSV + privée) pour chartData
    let pensionRRQ = 0;
    let pensionPSV = 0;
    let pensionPrivee = 0;
    let pensionOasReduction = 0;

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
    /** [ENG-DIVORCE-REEE-COTISATIONS] Part patrimoniale cumulée — pilote les COTISATIONS REEE. */
    let reeeContribShare = 1;
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
        moisCourantPourDettes = m;   // [DETTE-DATES] cf. `sumActiveDebts` — closure sur ce compteur
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
        // [ENG-DIVORCE, panel #613 — ÉLEVÉ-3] `!divorced` : un DIVORCÉ ne devient pas VEUF de son
        // ex. Sans cette garde, la mort de l'ex basculait le ménage en `survivorMode` et lui
        // ouvrait les prestations de survivant — mesuré dans 96 itérations MC sur 101, pour
        // −2 555,20 $/mois (PSV ×0,5, DB ×0,6, RRQ ×0,8). Direction conservatrice, mais c'est la
        // contradiction LITTÉRALE de la justification du correctif (« un divorcé ne touche AUCUNE
        // prestation de survivant ») : le code disait l'inverse de son commentaire.
        if (!divorced && trySpouseMortality({ m, currentMonthIndex, enableMonteCarlo, rng }, effProj, spouseAge, spouseAlive, survivorMode)) {
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
        // [ENG-GK-THRESHOLD-KNIFE] indexation PROPORTIONNELLE au facteur GK (1 = pleine,
        // 0 = gel — extrêmes identiques à l'ancien booléen ; entre les deux, le lissage
        // remplace le seuil couteau).
        if (guytonKlinger_indexationFactor > 0) {
            expenseMultiplier *= Math.pow(1 + (effectiveExpenseInflation * guytonKlinger_indexationFactor) / 100, 1 / 12);
        }

        prevCELI = celi;
        prevREER = reer;
        prevLiquid = liquid;
        // prevNW = rawNetWorth du mois précédent (source unique) → diffNW = variation nette EXACTE.
        prevNW = currentRawNetWorth();

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
        // [ESTATE-NPV-07] `incomeRetirementGis` et `pensionOasReduction` manquaient à ce reset alors
        // que leurs SIX voisins immédiats y sont — `PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`. Inoffensif
        // tant que `isRetired` est monotone, mais ces champs PILOTENT désormais un calcul
        // money-critical (l'assiette du facteur net de la VAN successorale).
        incomeRetirementGis = 0;
        pensionOasReduction = 0;
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
        // [Panel #552, ÉLEVÉ financial-integrity] Rendre VISIBLE l'hypothèse « bien passé =
        // détenu » : un objectif d'achat à date passée jamais réalisé serait sinon promu bien
        // détenu EN SILENCE (équité + dette fantômes). Le vrai discriminant (champ isOwned) est
        // au BACKLOG [ENG-PAST-OWNED-VS-PLANNED] — décision UX Marc requise.
        if (m === 0) {
            propertiesState.forEach((p, i) => {
                if (p.isBought) {
                    lifeEventsLog.push(`🏠 ${activeRE[i]?.name || 'Propriété'} : supposée DÉTENUE depuis ${activeRE[i]?.purchaseDate || '?'} (équité de départ ${Math.round(p.currentValue - p.mortgage).toLocaleString('fr-CA')}$)`);
                }
            });
        }
        let flowEventsLog: string[] = [];
        // FIX silent-failure: les événements stochastiques de vie (divorce, LTC,
        // LTD, CI, héritage, perte emploi, décès conjoint, mortalité) ne se
        // déclenchent QUE quand enableMonteCarlo. Si on gate ici par !MC, on
        // perd tous les logs d'événements. lifeEventsLog est cappé à 50 entrées.
        // [FUTUR-DAILY-EVENTS] Jour du mois (1-based) des événements qui en ONT un (événement saisi
        // avec date complète, échéance fiscale). Clé = le message lui-même (jointure exacte côté
        // affichage). Un événement sans jour connu n'y figure pas — l'affichage le pose au mois.
        const eventDaysLog: Record<string, number> = {};
        const ambiguousEventDays = new Set<string>();
        const logEvent = (arr: string[], msg: string, day?: number) => {
            if (arr.length >= 50) return;
            // ⚠️ Collision de MESSAGES identiques le même mois (finding ÉLEVÉ revue #594, élargi au
            // mix daté/non-daté par le validator) : deux homonymes ne peuvent pas partager une
            // entrée — écraser poserait les deux sur le jour du dernier, et une occurrence SANS
            // jour hériterait du jour de l'autre (fausse précision dans les deux sens). No-fake :
            // toute ambiguïté RETIRE l'entrée et la verrouille, tous s'affichent au mois.
            const seenBefore = arr.includes(msg);
            arr.push(msg);
            const hasDay = Number.isFinite(day) && (day as number) >= 1 && (day as number) <= 31;
            if (!hasDay) {
                if (msg in eventDaysLog) delete eventDaysLog[msg];
                if (seenBefore) ambiguousEventDays.add(msg);
                return;
            }
            const rounded = Math.round(day as number);
            if (seenBefore && (!(msg in eventDaysLog) || eventDaysLog[msg] !== rounded)) {
                delete eventDaysLog[msg];
                ambiguousEventDays.add(msg);
                return;
            }
            if (!ambiguousEventDays.has(msg)) eventDaysLog[msg] = rounded;
        };

        // W1.4: log différé du décès conjoint (déclenché plus haut avant l'init de logEvent)
        if (survivorMode && !survivorTriggerLogged) {
            const spouseAge = (config.users[1]?.age || 30) + Math.floor(m / 12);
            logEvent(lifeEventsLog, `🖤 Décès du conjoint à ${spouseAge} ans — bascule en mode survivant`);
            // [ITEM-2C] Roulement REER conjugal AU DÉCÈS (sans impôt, règle ARC) : la part REER du défunt
            // rejoint le SURVIVANT (user0) → `reerByUser = [Σ, 0]`. Sans cela, la part du défunt (registre
            // [1]) continuerait de FERR-convertir au gate per-conjoint comme un « contribuable mort » à 72+
            // = flux fiscal fantôme imposé au survivant (régression FISC-SURVIVOR-DRAWDOWN). Cohérent avec le
            // modèle « tout le revenu de retraite est celui du survivant » (1 contribuable).
            const mergedReer = reerByUser.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
            reerByUser = reerByUser.map((_, i) => (i === 0 ? mergedReer : 0));
            // [panel #613 — ÉLEVÉ-2] Les PARTS aussi : le défaut était identique ici, simplement
            // moins visible (un défunt ne cotise plus, mais le SURVIVANT si — et sa cotisation était
            // répartie vers le slot du mort, qui repartait en FERR obligatoire à son âge).
            reerShares = reerShares.map((_, i) => (i === 0 ? 1 : 0));
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
            celiRoom += celiWithdrawalsThisYear; // +0 si aucun retrait → celiRoom inchangé (zéro effet $)
            // [FUTUR-ICONS-RICH] Ne journaliser la régénération QUE s'il y a eu un vrai retrait à restituer :
            // sinon ~30-40 flowEvents « régénération de 0 $ » polluent les icônes du graphe (finding code-reviewer).
            if (celiWithdrawalsThisYear > 0) flowEventsLog.push(`🔄 CELI: Régénération de l'espace de cotisation`);
            celiWithdrawalsThisYear = 0;
        }
        let fluxImpots = 0;
        let impotGainsMois = 0; // V29: Gains en capital (taxes payées ce mois ou différées)
        let impotDiversMois = 0; // V29: Taxes divers (FHSA, etc.)
        let retraitReerMois = 0;
        // [WHT-DISPLAY-EXACT volet a] Retenue REER PAR TIRAGE cumulée sur le mois (cascade + sauvetage
        // de découvert) → compteur d'affichage `totalTaxesPaid` exact (barème par palier non additif).
        let rrspWithholdingMois = 0;
        let retraitCeliMois = 0;
        let impotReerMois = 0; // V24: Impôt sur retraits REER, séparé de fluxImpots
        let impotSalaireMois = 0; // V36: Impôt sur salaire (retenues/provision)
        let taxOnRrif = 0; // V49: Impôt FERR retenu à la source
        /**
         * [ENG-FERR-NETTRANSFER-MUET] Part du retrait FERR de CE mois. La FERR EST un retrait REER :
         * elle doit entrer dans `withdrawalREER`, donc dans le flux PUBLIÉ `NetTransferREER`. Mais
         * `stepReerByUser` doit l'EXCLURE : elle a déjà été retirée de la part EXACTE de chaque
         * conjoint (`ferrGrossByUser`, facteur RRIF de SON âge), et la re-soustraire AU PRORATA
         * fausserait le partage d'un couple à écart d'âge. Un montant, deux registres, deux règles.
         */
        let ferrWithdrawalMois = 0;

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

        // Cycle 10 split: divorce → ./projection/stochasticEvents (tryDivorce)
        // Le splitter callback mute toutes les locales en un point.
        // [panel #613 — MOYEN-8] `spouseAlive` : on ne divorce pas d'un conjoint DÉCÉDÉ. La
        // mortalité est évaluée plus haut dans le MÊME mois, donc le cas est atteignable — mesuré
        // 14 itérations sur 101 avec une conjointe âgée. Le défaut préexistait pour les actifs ;
        // le partage des dettes l'aurait AGGRAVÉ (le veuf voyait aussi ses dettes divisées par 2).
        if (spouseAlive && tryDivorce({ m, currentMonthIndex, enableMonteCarlo, rng }, effProj, divorced, (keep) => {
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
            // ⚠️ [ENG-DIVORCE-SCALE-UNBOUGHT] `p.isBought` : on ne partage que les biens RÉELLEMENT
            // DÉTENUS. Pour un bien pas encore acheté, `currentValue` et `mortgage` ne sont pas des
            // actifs du couple — ce sont les PARAMÈTRES SEMÉS du futur achat (`price` et
            // `price − downPayment`), que `realEstateMonth` consomme tels quels au moment de l'achat
            // (`const p = pState.mortgage`).
            // MESURÉ sur un achat à 500 000 $ / mise de fonds 100 000 $ après un divorce à `keep`
            // 0,5 : le cash sorti reste IDENTIQUE (105 000 $, il vient de `goal`, pas de l'état),
            // mais le bien acheté vaut 250 000 $ pour une hypothèque de 199 664 $ — l'équité obtenue
            // tombe de 100 672 $ à 50 336 $. **La moitié de la mise de fonds s'évapore à l'achat.**
            // Deux sources pour une même opération : le débit vient du BUT, l'actif de l'ÉTAT.
            propertiesState = propertiesState.map(p => (p.isBought ? {
                ...p,
                currentValue: p.currentValue * keep,
                mortgage: p.mortgage * keep,
            } : p));
            // [ENG-W5-RENTAL-OFFBALANCE] Les IMMEUBLES LOCATIFS se partagent comme le reste du
            // patrimoine familial. Oubliés ici, ils survivaient INTACTS au divorce pendant que tous
            // les autres actifs étaient divisés — MESURÉ : équité de 337 224 $ conservée à 100 %
            // alors que le CELI passait de 231 723 $ à 107 770 $. Trouvé par une revue automatique
            // sur la PR ; c'est la classe `MODULE-ECRIT-HORS-CHECKLIST` appliquée à un état que je
            // venais MOI-MÊME d'introduire — un état persistant nouveau doit être confronté à TOUS
            // les mutateurs globaux existants (divorce, décès, événements de vie), pas seulement au
            // chemin heureux.
            //
            // ⚠️ La MENSUALITÉ est partagée elle aussi, contrairement au chemin des buts immobiliers
            // (`propertiesState` ci-dessus ne touche pas `calculatedPmt`). Payer la mensualité
            // ENTIÈRE sur une hypothèque réduite de moitié amortirait le prêt deux fois trop vite et
            // ponctionnerait un cashflow que le divorcé n'a plus. La divergence est VOLONTAIRE et
            // assumée ; l'asymétrie du chemin des buts est un défaut préexistant, tracé au BACKLOG
            // (`[ENG-DIVORCE-PMT-NON-PARTAGEE]`) plutôt que corrigé ici — il re-baserait des goldens.
            for (const rs of rentalStates) {
                rs.currentValue *= keep;
                rs.mortgage *= keep;
                rs.monthlyPayment *= keep;
            }
            // [ENG-DIVORCE-DEBT-ASYMMETRY] Les dettes NON immobilières se partagent au MÊME taux que
            // les actifs — DÉCISION MARC 2026-08-13 (esprit du patrimoine familial québécois : on
            // partage la valeur NETTE, pas les actifs bruts ; cf. docs/adr/).
            // Avant : seule l'hypothèque suivait `keep`. Mesuré : après avoir cédé 100 % des ACTIFS,
            // le patrimoine restait à −81 827 $ — 100 k$ de dettes intactes en face de rien.
            activeDebts = activeDebts.map(d => ({
                ...d,
                balance: Number.isFinite(d.balance) ? d.balance * keep : d.balance,
                // [panel #613 — MOYEN-9] Le paiement MINIMUM suit le solde. Sans ça, une dette
                // divisée par deux continuait d'être remboursée au rythme calibré pour la dette
                // ENTIÈRE : extinction ~2× trop rapide et, surtout, AUCUNE détente de trésorerie
                // pour quelqu'un qui vient de perdre la moitié de ses revenus. Incohérence
                // INTRODUITE par le partage des dettes — elle n'existait pas avant.
                minimumPayment: Number.isFinite(d.minimumPayment) ? d.minimumPayment * keep : d.minimumPayment,
            }));
            liquidDebt *= keep;
            smithManoeuvreDebt *= keep;
            // [ENG-DIVORCE-REGISTRE-PERCONJOINT] Le registre REER per-conjoint doit suivre le split,
            // sinon l'invariant Σ(reerByUser) == reer casse (le total vient d'être multiplié par
            // `keep`). Le ménage passe à UNE tête : tout ce qui reste est au déclarant restant, même
            // consolidation que le décès — la différence étant qu'ici le total a d'abord été réduit.
            reerByUser = reerByUser.map((_, i) => (i === 0 ? reer : 0));
            // ⚠️ …ET LES PARTS AVEC (panel #613 — ÉLEVÉ-2). Sans cette ligne, la consolidation
            // ci-dessus est annulée dès la première cotisation : `stepReerByUser` répartit par
            // `shares[i]` et repeuple le slot de l'ex. L'invariant Σ restait numériquement vert
            // (0 violation sur 36 461 observations) alors que la SÉMANTIQUE était fausse — un
            // invariant de somme ne dit rien de l'ATTRIBUTION.
            reerShares = reerShares.map((_, i) => (i === 0 ? 1 : 0));
            // [ENG-DIVORCE-TAXDEBT-UNSPLIT] La CRÉANCE (ou la DETTE) fiscale se partage comme le
            // reste. `taxPreviousYear` porte l'impôt de l'année du COUPLE, réglé en avril : sans
            // ce partage, un divorcé ayant cédé 100 % de son patrimoine voyait quand même arriver
            // le remboursement INTÉGRAL du couple — mesuré 26 948,77 $ crédités sur un patrimoine
            // de 135 $, montant identique au témoin sans divorce. Symétrique et plus grave dans
            // l'autre sens : il aurait porté SEUL une dette d'impôt du ménage.
            // C'est la DÉCISION VERROUILLÉE de Marc (`docs/adr/`) : on partage la valeur
            // NETTE — c'est elle qui a justifié d'ajouter les dettes au split, et une créance
            // fiscale née pendant l'union est de la valeur nette comme une autre.
            // Effet de bord corrigé au passage : ce remboursement non partagé rendait
            // `totalTaxesPaid` NÉGATIF (« impôt à vie : −12 992,70 $ »).
            // `taxCurrentYear` est partagé aussi, par SYMÉTRIE : il vaut ~0 en janvier (remis à
            // zéro en décembre), donc l'effet est nul aujourd'hui — mais laisser un seul des deux
            // registres suivre le split est exactement le motif « règle dupliquée corrigée à
            // moitié » qui a déjà coûté deux NO-GO sur ce lot.
            const splitTaxBucket = (b: typeof taxPreviousYear): typeof taxPreviousYear => ({
                revenu: b.revenu * keep, gains: b.gains * keep, reer: b.reer * keep,
                divers: b.divers * keep, donCredit: b.donCredit * keep,
            });
            taxPreviousYear = splitTaxBucket(taxPreviousYear);
            taxCurrentYear = splitTaxBucket(taxCurrentYear);
            // [ENG-DIVORCE-REEE-COTISATIONS] Le SOLDE du REEE vient d'être partagé (`reee *= keep`
            // ci-dessus). Les COTISATIONS futures doivent suivre la même clé — décision Marc
            // 2026-08-17 — et `keep` n'existe que dans cette callback : sans le RETENIR ici, le
            // déclarant continuait de cotiser la part ENTIÈRE sur un régime réduit de moitié.
            // Multiplicatif, pas affecté : un second divorce doit composer avec le premier.
            reeeContribShare *= keep;
        })) {
            divorced = true;
        }
        if (divorced && !divorceLogged) {
            // [panel #613 — FAIBLE-12] Libellé neutre en SIGNE : « -X% patrimoine » était faux pour
            // un ménage à valeur nette négative, où le partage des dettes lui REND X % de son
            // déficit. On décrit le geste (un partage), pas sa direction.
            // ⚠️ [ENG-DIVORCE-SPLITPCT-UNBOUNDED, revue Vercel] Le libellé DOIT passer par le même
            // `clampSplitPct` que le calcul. Avec la valeur brute, une saisie hors bornes (150) ou
            // non finie annonçait « partage de 150 % » pendant que le moteur en appliquait 100 —
            // et le clamp AGGRAVAIT le mensonge : avant lui, le libellé et le calcul étaient faux
            // ENSEMBLE, donc cohérents. C'est le motif « règle dupliquée corrigée à moitié ».
            logEvent(lifeEventsLog, `💔 Divorce — partage de ${clampSplitPct(effProj.divorceSplitPct ?? DIVORCE_SPLIT_PCT_DEFAULT)}% du patrimoine NET (actifs et dettes)`);
            divorceLogged = true;
        }

        // [FISC-DIVORCE-INCOME-PHANTOM] Le divorce coupait les ACTIFS mais gardait le revenu ET la
        // fiscalité de COUPLE : le conjoint parti continuait d'encaisser son salaire à vie (mesuré :
        // 85 k$/an de revenu fantôme sur un couple à 183 k$ brut) et le ménage restait imposé à deux
        // têtes. Cette erreur DOMINE la coupe de patrimoine — et la garde de conservation ne peut pas
        // l'attraper : l'argent reste conservé, il est simplement INVENTÉ au bon endroit.
        //
        // `soloHousehold` = « il ne reste qu'UN déclarant dans ce ménage ». Décès et divorce y mènent
        // tous les deux, et la plomberie fiscale existait déjà pour le décès (`survivorMode`) : on la
        // RÉUTILISE au lieu d'ouvrir un second chemin qui divergerait.
        // ⚠️ Ne remplace PAS `survivorMode` partout : les PRESTATIONS DE SURVIVANT (RRQ réversible,
        // PSV, DB du conjoint décédé) n'existent pas pour un divorcé — `computeRetirementIncome`
        // continue donc de recevoir `survivorMode`, pas ce drapeau.
        // ⚠️ POSITION — corrigée après mesure (panel #613). J'avais d'abord posé ce drapeau AVANT
        // le bloc `tryDivorce`, en affirmant que le décalage d'un mois était sans effet puisque le
        // divorce n'arme qu'en janvier et que le dépôt fiscal est en décembre. C'était FAUX : le
        // dépôt de décembre était bien épargné, mais pas la PHASE REVENUS — mesuré 5 094,90 $ de
        // salaire du conjoint encaissé pendant l'année du divorce, et intégralement conservé
        // (le split précède la trésorerie du mois). Ce revenu gonflait aussi le revenu gagné annuel (aujourd'hui `accGrossIncomeYearByUser`),
        // donc l'espace REER de l'année suivante, alors que décembre déclarait `grossAnna = 0`.
        // `tryDivorce` est donc désormais évalué JUSTE AU-DESSUS, avant les revenus.
        const soloHousehold = survivorMode || divorced;

        // Nombre de CONTRIBUABLES du ménage — ≠ `activeUsersCount`, qui reste la taille NOMINALE et
        // sert de diviseur d'agrégats. Hissé ici (il vivait dans le seul bloc de décembre) parce
        // qu'il pilote désormais aussi le meltdown REER : deux copies de la même règle finissent
        // toujours par diverger, et c'est exactement ce qui s'est produit (`taxFilers` = 1 au dépôt
        // fiscal pendant que le meltdown visait encore un revenu de DEUX déclarants).
        const taxFilers = soloHousehold ? 1 : activeUsersCount;

        // ---- PHASE RETRAITE ----
        if (isRetired) {
            if (!hasLoggedRetirement) {
                lifeEventsLog.push('📍 Début Retraite');
                hasLoggedRetirement = true;
            }
            // Cycle 13 split: calcul RRQ/PSV/DB → ./projection/retirementIncome
            const retirementBreakdown = computeRetirementIncome(
                { m, age, simInflation,
                  // [FISC-DIVORCE-INCOME-PHANTOM + panel #613 ÉLEVÉ-1] Après un divorce, les rentes
                  // du conjoint partent avec lui.
                  // ⚠️ `activeUsersCount` reste INCHANGÉ, et c'est CONTRE-INTUITIF : ici ce n'est pas
                  // un compteur de bénéficiaires mais le DIVISEUR de l'agrégat ménage
                  // (`(base/activeUsersCount) × poids_i`, sommé sur `users`). La réduction vient de
                  // la liste d'users RACCOURCIE, plus bas. Le premier correctif passait AUSSI
                  // `activeUsersCount: 1` : le `/N` annulait alors le retrait du conjoint — Δ rentes
                  // MESURÉ = 0,00 $/mois, et +398 $/mois à salaires inégaux (le divorce enrichissait).
                  activeUsersCount,
                  // La DB (`dbPensionMonthly`) est un montant MÉNAGE que rien ne divise : elle exige
                  // un facteur EXPLICITE, sinon un divorcé gardait 100 % de la pension du couple.
                  householdPensionShare: divorced ? 1 / Math.max(1, activeUsersCount) : 1,
                  // Le SRG est la seule prestation dont le barème dépend de la COMPOSITION du
                  // ménage : ni le diviseur ci-dessus ni la liste d'users raccourcie ne
                  // l'atteignent (ces lignes-là ne bouclent pas sur `users`). D'où ce compteur de
                  // TÊTES explicite. `soloHousehold` et non `divorced` : le veuf y arrive aussi,
                  // même si `survivorMode` le couvre déjà — les deux voies doivent dire la même
                  // chose, sinon la prochaine correction n'en bougera qu'une (c'est exactement ce
                  // qui a produit la contradiction `taxFilers` / meltdown).
                  householdAdults: soloHousehold ? 1 : activeUsersCount,
                  baseGrossAnnual, delayPensions,
                  survivorMode, monthlyOasReduction, dbSurvivorPct, rrqSurvivorPct, psvResidencyYears,
                  startYear,
                  // FA-3b — le test SRG regarde le revenu de l'ANNÉE PRÉCÉDENTE (retraits REER + loyers).
                  otherIncomeAnnualLaggedNominal: prevYearOtherIncomeForGisNominal,
                  // PV-9 — + gains en capital RÉALISÉS de l'année précédente (BRUT ; ×0,5 appliqué dans computeRetirementIncome).
                  prevYearCapitalGainsForGisNominal },
                retirementGoal,
                // C'EST ICI que la réduction opère : un seul user ⇒ la somme
                // `(base/activeUsersCount) × poids_i` ne porte plus que sur le déclarant restant.
                divorced ? config.users.slice(0, 1) : config.users,
            );
            incomeRetirement = retirementBreakdown.total;
            incomeRetirementPerUser = retirementBreakdown.perUser.map(p => p.total);
            incomeRetirementDbPerUser = retirementBreakdown.perUser.map(p => p.privee);
            incomeRetirementGis = retirementBreakdown.gis;
            pensionRRQ = retirementBreakdown.rrq;
            pensionPSV = retirementBreakdown.psv;
            pensionPrivee = retirementBreakdown.privee;
            pensionOasReduction = retirementBreakdown.oasReduction;
            monthlyIncome = incomeRetirement;

            // D2.3: monthlyExpenses est défini de façon unique dans le bloc
            // EXPENSES & EVENTS plus bas (évite la double affectation).
        } else {
            // ---- PHASE ACTIVE ----
            // Cycle 15 split: salaire + job loss/LTD + bonus/RSU → ./projection/activeIncome
            const aiResult = computeActiveIncome(
                { m, currentMonthIndex, simSalaryGrowth, enableMonteCarlo, rng,
                  // `survivorMode` est le nom du PARAMÈTRE ; sa sémantique côté activeIncome est
                  // « pas de revenu de conjoint » — vrai au décès comme au divorce.
                  incomeMarcNetMonthly, incomeAnnaNetMonthly, survivorMode: soloHousehold,
                  grossMarcBaseAnnual, grossAnnaBaseAnnual,
                  unemployedMonthsRemaining, ltdMonthsRemaining, ltdLogged,
                  // [AE-PLAFOND-MANQUANT] prestation AE par le brut plafonné, imposée à assiette nulle
                  loopYear, simInflation, calculateFiscalReport },
                effProj,
                config.users,
            );
            incomeMarc = aiResult.incomeMarc;
            incomeAnna = aiResult.incomeAnna;
            monthlyIncome = aiResult.monthlyIncome;
            // [FISC-EVENT-INCOMELOSS] événements de perte de revenu DATÉS (PERTE_EMPLOI/SABBATIQUE/
            // ACCIDENT) : réduisent le revenu MÉNAGE de incomeLossPercent % pendant durationMonths mois
            // (sémantique Marc 2026-06-18 : % perdu + durée, niveau ménage). On réduit le NET (`monthlyIncome`,
            // cashflow) ET `accGrossAdd` du même facteur. ⚠️ `accGrossAdd` alimente UNIQUEMENT l'espace REER
            // de l'an+1 (`taxJanuary.ts`), PAS l'impôt salarial de décembre (calculé sur `grossMarcBaseAnnual`
            // PLEIN — vérifié empiriquement, ΔFluxImpots = 0). Le fix NE modélise donc PAS le remboursement
            // d'impôt qu'une vraie perte de revenu déclencherait → biais CONSERVATEUR (NW post-perte
            // légèrement sous-estimé), IDENTIQUE au chômage STOCHASTIQUE existant (`activeIncome.ts` AE 55 %/
            // LTD). Conservation préservée (résiduel < 1 $, moneyConservation). Appliqué AVANT le bloc enfants
            // (prestations revenu-testées recalculées sur le revenu réduit). RETRAITE : non appliqué (pas de
            // revenu d'EMPLOI à perdre) → un événement daté en retraite est inerte. Interaction avec une perte
            // STOCHASTIQUE (Monte-Carlo) le même mois : composition MULTIPLICATIVE (× 0,55 × facteur), bornée
            // [0, 1] — voulu (aléa MC + événement planifié = deux pertes distinctes).
            const incomeLossFactor = computeIncomeLossFactor(lifeEvents, currentLoopDate);
            let activeGrossAddByUser = aiResult.accGrossAddByUser;
            if (incomeLossFactor < 1) {
                incomeMarc *= incomeLossFactor;
                incomeAnna *= incomeLossFactor;
                monthlyIncome *= incomeLossFactor;
                activeGrossAddByUser = [activeGrossAddByUser[0] * incomeLossFactor, activeGrossAddByUser[1] * incomeLossFactor];
                logEvent(lifeEventsLog, `📉 Perte de revenu planifiée (-${Math.round((1 - incomeLossFactor) * 100)} %)`);
            }
            // [Revue #679 ÉLEVÉ-1] Ménage à UN SEUL déclarant : le mode « sandbox »
            // (computeIncomeBaseline) splitte TOUJOURS le revenu théorique 55/45, même avec un
            // seul user — sans repli, la part « 45 % » atterrit à l'index 1 qu'aucun roomUsers ne
            // lit : −12 173 $/an de droits mesurés (−50 159 $ de NW à 12 ans). MÊME critère que
            // reerShares (l. 438) — pas soloHousehold : après décès/divorce, activeIncome met déjà
            // le brut du conjoint à 0 et le repli est alors un no-op.
            if (activeUsersCount > 1) {
                accGrossIncomeYearByUser[0] += activeGrossAddByUser[0];
                accGrossIncomeYearByUser[1] += activeGrossAddByUser[1];
            } else {
                accGrossIncomeYearByUser[0] += activeGrossAddByUser[0] + activeGrossAddByUser[1];
            }
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
            logLife: (msg: string, day?: number) => logEvent(lifeEventsLog, msg, day),
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
                addTaxDivers: (amt) => { taxCurrentYear.divers += amt; },
                addDonationCredit: (amt) => { taxCurrentYear.donCredit += amt; },
                logFlow: (msg, day?: number) => logEvent(flowEventsLog, msg, day),
                logLife: (msg, day?: number) => logEvent(lifeEventsLog, msg, day),
            }
        );

        // --- 4. TAX WITHHOLDING & APRIL SETTLEMENT ---
        // Cycle 8 split: avril extrait dans ./projection/taxCycle (processAprilSettlement).
        const aprilResult = processAprilSettlement(currentMonthIndex, m, taxPreviousYear, {
            subtractLiquid: (amt) => { liquid -= amt; },
            addNonReg: (amt) => { nonReg += amt; },
            addNonRegACB: (amt) => { nonRegACB += amt; },
            logFlow: (msg, day?: number) => logEvent(flowEventsLog, msg, day),
        });
        const taxPaidRevenu = aprilResult.taxPaidRevenu;
        const taxPaidGains = aprilResult.taxPaidGains;
        const taxPaidDivers = aprilResult.taxPaidDivers;
        const taxPaidREER = aprilResult.taxPaidREER;
        // [ENG-APRIL-REFUND-NONREG-UNPUBLISHED] Le remboursement d'impôt réinvesti est un TRANSFERT
        // vers le non-enregistré : il alimente le flux publié comme n'importe quelle cotisation.
        // ⚠️ Le ticket redoutait que publier ce flux « déplace une décision d'allocation dans le même
        // mois », `cashflowAllocation` recevant `contribNonReg` en ENTRÉE. VÉRIFIÉ : ce module ne
        // fait qu'un `state.contribNonReg += excess` et ne LIT jamais la valeur. Le risque annoncé
        // n'existe pas — le golden le confirme (seul `NetTransferNonReg` bouge).
        contribNonReg += aprilResult.reinvestedNonReg;
        if (aprilResult.fluxImpots !== 0) {
            fluxImpots = aprilResult.fluxImpots;
            impotSalaireMois = taxPaidRevenu;
            impotReerMois = taxPaidREER;
            impotGainsMois = taxPaidGains;
            impotDiversMois = taxPaidDivers;
        }
        // [ENG-TTP-UNSETTLED-HORIZON] Avril vient de RÉGLER l'année réconciliée (le settlement ne
        // s'exécute qu'à currentMonthIndex === 3 ET m > 0, cf taxApril.ts:44 — garde alignée #555 :
        // une future reprise d'état avec report fiscal au m0 ne doit pas effacer une dette).
        if (currentMonthIndex === 3 && m > 0) reconciledUnsettledTax = 0;
        taxPreviousYear = aprilResult.newTaxPreviousYear;

        // [FISC-SRCDED-NOOP — retenue mensuelle retirée 2026-06-26] La provision salariale mensuelle
        // (`computeMonthlyWithholding`) était VESTIGIALE : sa sortie accumulée dans `taxCurrentYear.revenu`
        // était ÉCRASÉE par l'override de décembre (`taxDecember`, balise « V30: Override ») avant tout
        // règlement → jamais consommée (prouvé : perturbation +999 999/mois ⇒ golden byte-identique, 2331
        // tests d'intégration inchangés). Le flag T1213 agit correctement via le chemin décembre (`taxDecember`,
        // balise « V49: Retenue source »). On conserve UNIQUEMENT la remise à 0 de l'affichage « impôt salaire »
        // pour le non-retraité (annule l'affectation d'avril ci-dessus : le règlement d'avril s'affiche via
        // `fluxImpots`, pas `impotSalaireMois`).
        if (!isRetired) {
            impotSalaireMois = 0;
        }

        // Cycle 11 split: December tax filing → ./projection/taxCycle.processDecemberTaxFiling
        if (currentMonthIndex === 11 && m > 0) {
            const yearsElapsed = Math.floor(m / 12);
            const inflationFactor = Math.pow(1 + simInflation / 100, yearsElapsed);
            // FA-10 — `taxFilers` (déclaré en tête d'itération) : nombre de CONTRIBUABLES du ménage.
            // Sert ici à la récolte de gains (palier ×1) ET au dépôt fiscal ci-dessous.
            // [ENG-DIVORCE-REGISTRE-PERCONJOINT] DEUX portes y mènent : le décès et le DIVORCE. Le
            // divorce était fiscalement INERTE — mesuré : Δ impôt = 0 $ EXACT sur 30 ans, alors que
            // la différence entre 1 et 2 contribuables vaut ~187 k$ d'impôt cumulé.

            // Levier « récolte de gains » (timing) : réalise des gains non-enreg latents dans une
            // année à faible revenu pour remplir le 1er palier (ACB relevé). À FAIRE AVANT le dépôt
            // fiscal de décembre → le gain réalisé entre dans accCapitalGainsYear et est imposé CETTE
            // année (au taux bas), sans fuite (l'ACB monte du montant imposé).
            // FA-10 : palier du SURVIVANT seul (×1) et sans le salaire fantôme du défunt — sinon le
            // levier récoltait avec une marge de palier doublée par un contribuable mort.
            const ghOtherNominal = isRetired
                ? (incomeRetirement * 12 + accRentesYear + accRetraitsReerYear)
                : (grossMarcBaseAnnual + (soloHousehold ? 0 : grossAnnaBaseAnnual)) * Math.pow(1 + simSalaryGrowth / 100, yearsElapsed);
            const gh = processGainHarvesting({
                enabled: !!overrides.gainHarvesting,
                nonReg, nonRegACB, otherTaxableNominal: ghOtherNominal,
                existingGainsNominal: accCapitalGainsYear, activeUsersCount: taxFilers, loopYear,
                capitalLossBank,
            });
            if (gh.harvestedGain > 0) {
                // [PV-2] Seule la part NON compensée par la banque de pertes est imposable ;
                // l'ACB monte du gain TOTAL réalisé (la part compensée = step-up gratuit).
                accCapitalGainsYear += gh.harvestedGain - gh.consumedLoss;
                capitalLossBank -= gh.consumedLoss;
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
                    grossAnnaBaseAnnual: soloHousehold ? 0 : grossAnnaBaseAnnual,
                    simSalaryGrowth,
                    optimizeSourceDeductions: effProj.optimizeSourceDeductions,
                    incomeRetirementMonthly: incomeRetirement,
                    // FA-3a — SRG mensuel familial : NON IMPOSABLE (Service Canada), soustrait
                    // de l'assiette imposable par taxDecember (revenu cash inchangé).
                    incomeRetirementGisMonthly: incomeRetirementGis,
                    // A1 — décomposition par conjoint pour imposer chacun sur SON revenu de
                    // retraite réel (split égal sinon, cf. taxDecember). Vide hors retraite.
                    incomeRetirementPerUserMonthly: soloHousehold ? undefined : incomeRetirementPerUser,
                    // Phase 3 — composante DB mensuelle par conjoint (fractionnement 65+).
                    incomeRetirementDbPerUserMonthly: soloHousehold
                        ? [incomeRetirementDbPerUser.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)]
                        : incomeRetirementDbPerUser,
                    nonReg, baseNonRegRate: baseRates.nonReg,
                    accRrspYear, accFhsaYear, smithInterestDeductibleYear,
                    accRentesYear, accRetraitsReerYear, accCapitalGainsYear,
                    accRetraitsReerYearByUser: soloHousehold ? undefined : accRetraitsReerYearByUser,
                    age,
                    // B-AUDIT-3 — âge courant du conjoint (user[1]) pour les crédits d'âge/
                    // pension PAR conjoint dans l'impôt de décembre. undefined si pas de conjoint
                    // (ou conjoint décédé — FA-10).
                    ageSpouse: (!soloHousehold && config.users[1]) ? (config.users[1].age || 30) + yearsElapsed : undefined,
                    // §6.4 RAMQ: nombre d'enfants à charge (relève le seuil d'exemption).
                    // Approximé via childGoals.length faute de champ dédié dans User.
                    // TODO: ajouter `User.dependentChildrenCount` pour précision.
                    childrenCount: activeChild.length,
                    // §6.4 RAMQ: exempt si couverture privée (employeur/association).
                    // TODO: flag `User.hasPrivateDrugInsurance` à ajouter. Par défaut
                    // false (paie au régime public) — conservateur pour FinanceAI.
                    ramqExempt: false,
                    // PH4-FUT-B — levier fractionnement de pension. Absent/true = actif (historique) ;
                    // false → la Phase 3 d'optimisation de décembre est sautée (impôt = brut par conjoint).
                    enablePensionSplitting: effProj.appliedPensionSplitting !== false,
                },
                { calculateFiscalReport, getMarginalRate, calculateDividendTax, getDividendGrossUpRate },
                taxCurrentYear,
            );
            taxCurrentYear = decResult.newTaxCurrentYear;
            // [ENG-TTP-UNSETTLED-HORIZON] Décembre vient de RÉCONCILIER l'année : ce montant est
            // la vraie dette fiscale de l'année (retenues provisionnées + complément), réglée par
            // l'avril SUIVANT. Photo ICI ≡ lire taxPreviousYear (son transfert est quelques lignes
            // plus bas, MÊME bloc décembre — vérifié #555) : la photo est le point le plus lisible.
            // NB : l'audit #554 mesurait 5 815,50 $ en sommant les séries AccruedTax* = année
            // réconciliée (171,89 $ NET) + stub de l'année en cours NON réconciliée (5 643,61 $ de
            // retenues brutes) — c'est le NET réconcilié seul qui est la vraie dette.
            reconciledUnsettledTax = (['revenu', 'gains', 'divers', 'reer'] as const)
                .reduce((s, k) => s + (Number.isFinite(taxCurrentYear[k]) ? taxCurrentYear[k] : 0), 0);
            decResult.logs.forEach(msg => logEvent(flowEventsLog, msg));

            // PV-9 : capture des gains réalisés de l'année AVANT le reset (réutilisés par le clawback
            // PSV ci-dessous, même décembre, et par le test SRG de l'an prochain via le lag de janvier).
            capitalGainsRealizedThisYear = accCapitalGainsYear;
            accCapitalGainsYear = 0;
            smithInterestDeductibleYear = 0;
            accRrspYear = 0;
            accFhsaYear = 0;

            // V30: Transfer accumulated taxes to the 'previous year' bucket to be paid in April.
            taxPreviousYear = { ...taxCurrentYear };
            taxCurrentYear = { revenu: 0, gains: 0, reer: 0, divers: 0, donCredit: 0 };

            // V28 + Cycle 12: TFSA Room reset géré en Janvier — voir processJanuaryReset (./projection/taxJanuary)

            // [CELIAPP-DOUBLE-RECHARGE] Décembre n'écrit PLUS l'espace CELIAPP — audit 2026-08-19.
            //
            // Il posait ici `fhsaRoom = FHSA_ANNUAL_LIMIT_PER_USER * taxFilers`, ce qui REMETTAIT
            // l'espace au plein annuel quoi qu'on ait cotisé. Or janvier (`taxJanuary.ts`, la
            // source unique depuis le Cycle 12) calcule SON report à partir de cette valeur :
            //   allowedCarryForward = min(annuel, fhsaRoomCurrent)
            // Il lisait donc toujours « annuel » comme résiduel → report TOUJOURS MAXIMAL, quelle
            // que soit l'utilisation réelle. Deux producteurs qui s'ignorent.
            //
            // MESURÉ (couple, plafond annuel 16 000 $) : espace publié 32 000 $ CHAQUE année au
            // lieu de suivre le résiduel (16 000 $ si tout est cotisé, 24 000 $ si la moitié l'est),
            // et le plafond à vie de 80 000 $ atteint en 3 ans au lieu de 5.
            //
            // ⚠️ La garde du panel #613 (« les droits sont PERSONNELS : ceux du conjoint partent
            // avec lui ») n'est PAS perdue : janvier reçoit déjà `fhsaEligibleUsersCount` passé au
            // travers de `soloHousehold` (voir l'appel à `processJanuaryReset` plus bas), et ce
            // compteur est même PLUS juste que `taxFilers` — il exclut les propriétaires récents,
            // qui n'ont pas droit au CELIAPP.
            //
            // Le résiduel transmis est désormais le VRAI : `cashflowAllocation` fait
            // `state.fhsaRoom -= fillFhsa` à chaque cotisation. Le CELI avait migré vers janvier au
            // Cycle 12 (cf. commentaire ci-dessus) ; le CELIAPP était resté en arrière.

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
            // [panel #613 — ÉLEVÉ-4] `soloHousehold`, PAS `survivorMode`. Le commentaire de
            // `cashflowAllocation.ts` DOCUMENTE une cohérence à 3 voies — `taxFilers` (taxDecember),
            // `oasBeneficiaries` (clawback PSV) et `liveFilers` (cascade) doivent dire le MÊME
            // nombre de contribuables. Le premier correctif ne basculait que `taxFilers` : le
            // divorcé était imposé comme célibataire mais gardait un seuil de récupération PSV de
            // COUPLE. Mesuré : clawback 0 $ au lieu de 7 016 $/an sur un retraité à 144 k$.
            // Casser en silence une cohérence écrite dans le code est le pire des deux mondes.
            const oasBeneficiaries = soloHousehold ? 1 : activeUsersCount;
            const gisShare = incomeRetirementGis / Math.max(1, oasBeneficiaries);
            const oasResult = computeOasClawback(
                currentMonthIndex, m, isRetired, age, expenseMultiplier,
                incomeRetirement - incomeRetirementGis, accRetraitsReerYear, accRentesYear,
                psvBasePension, simInflation,
                oasBeneficiaries,
                // [panel #613 — ÉLEVÉ-5] Même drapeau que `oasBeneficiaries` ci-dessus, et c'est
                // ce qui referme un échec SILENCIEUX : après un divorce, `incomeRetirementPerUser`
                // est de longueur 1 (liste d'users raccourcie) ; avec `n = 2`, la garde
                // `perUser.length === n` de `computeOasClawback` échouait sans aucune trace et
                // retombait sur le split égal. Mesuré : 2 696 $/an de clawback → 0 $.
                soloHousehold ? undefined : incomeRetirementPerUser.map((v) => v - gisShare),
                soloHousehold ? undefined : accRetraitsReerYearByUser,
                // PV-9 : gains imposables de l'année (50 % d'inclusion appliqué dans la fonction)
                // entrent dans le revenu net de récupération PSV (ligne 23400 ARC).
                capitalGainsRealizedThisYear,
                // FA-8 : cap du clawback = PSV réellement VERSÉE (breakdown nominal de décembre,
                // HORS SRG — facteur de report, bonus 75+, prorata résidence et survivant inclus),
                // au lieu de la base sans report (psvBasePension, désormais simple repli legacy).
                pensionPSV - incomeRetirementGis,
                // [FISC-DIV-DERIVED-BASES] dividendes MAJORÉS de l'année : le revenu de
                // récupération PSV (ligne 23400) inclut le dividende imposable, comme les gains
                // (PV-9). Source unique de la formule ; MESURÉ +1 552,50 $/an sur un couple
                // 100 k$/conjoint + 500 k$ non-enreg à 5 % (part distribuée 30 % incluse).
                computeAnnualNonRegDividends(nonReg, baseRates.nonReg ?? 0) * getDividendGrossUpRate('eligible'),
            );
            oasClawbackNextPeriod = oasResult.clawbackAnnual;
            if (oasResult.logMsg) flowEventsLog.push(oasResult.logMsg);
        }

        // Cycle 12 split: January reset → ./projection/taxCycle.processJanuaryReset
        const janResult = processJanuaryReset(
            currentMonthIndex,
            {
                // [ENG-DIVORCE-ROOM-COUPLE] Les droits enregistrés restaient ceux d'un COUPLE après
                // un divorce (ou un décès). Mesuré : +15 000 $/an de droits CELI (2 × 7 500) pour un
                // ménage à UNE tête → CELI final 2 268 641 $ contre 1 405 271 $, soit +58 573 $ de
                // patrimoine et −27 456 $ d'impôt sur 30 ans. Décembre disait déjà « 1 déclarant » —
                // janvier, lui, redonnait les droits des deux : les deux voies se contredisaient.
                //
                // ⚠️ Les QUATRE usages de `activeUsersCount` dans `taxJanuary` ont été relus un par
                // un avant de passer `taxFilers` — c'est un homonyme, comme dans `retirementIncome` :
                //   · plafond REER `rrspYearlyCap × N`  → un COMPTE de déclarants  → 1 ✔
                //   · `revenu / N` (taux marginal FERR) → revenu PAR TÊTE ; après divorce le revenu
                //     est déjà celui d'une seule personne, diviser par 2 le sous-estimerait → 1 ✔
                //   · `hasSpouse: N > 1`                → faux pour un divorcé      → 1 ✔
                //   · `familyIncome: parTête × N`       → reconstitue le familial    → 1 ✔
                m, startYear, simInflation, age, isRetired, activeUsersCount: taxFilers,
                oasClawbackNextPeriod, hasPurchasedPrimary,
                celiappOpeningYear,
                // Plafond FHSA À VIE : `FHSA_LIFETIME_LIMIT_PER_USER × N`. Un ménage à une tête ne
                // conserve pas les 80 000 $ d'un couple.
                fhsaEligibleUsersCount: soloHousehold ? Math.min(1, fhsaEligibleUsersCount) : fhsaEligibleUsersCount,
                users: config.users,
                // ⚠️ Liste DÉDIÉE aux droits — `users` reste ENTIER : la boucle FERR itère sur
                // `reerByUser.length` et lit `users[i]` pour l'âge du conjoint. La raccourcir ferait
                // rendre `-Infinity` à `currentAgeOfUser(1)`, et la part REER de l'index 1 ne se
                // convertirait jamais en FERR — silencieusement. Deux questions, deux listes.
                roomUsers: soloHousehold ? config.users.slice(0, 1) : config.users,
                celiapp, reer, reerByUser, liquid, nonReg, crypto, celi,
                accGrossIncomeYearByUser, accRetraitsReerYearOld: accRetraitsReerYear,
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
            // PV-9 : les gains réalisés de l'année écoulée (capturés en décembre) entrent dans
            // l'assiette du test SRG de la nouvelle année (lag, comme les retraits REER + loyers).
            prevYearCapitalGainsForGisNominal = capitalGainsRealizedThisYear;
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
            accGrossIncomeYearByUser = [0, 0];
            // FERR
            if (janResult.ferrMandatoryGross > 0) {
                taxOnRrif = janResult.ferrTaxOnRrif;
                reer -= janResult.ferrMandatoryGross;
                taxCurrentYear.reer += janResult.ferrTaxOnRrif;
                impotReerMois += janResult.ferrTaxOnRrif;
                accRetraitsReerYear += janResult.ferrMandatoryGross;
                // [ENG-FERR-FLOW-INVISIBLE] (panel #551, MESURÉ : 113 418 $ = 11,6 % des sorties
                // REER invisibles sur AUTO_MARGINAL) — la FERR est un retrait REER : elle alimente
                // le flux AFFICHÉ comme les autres sources, sinon « 1er retrait REER » ne se
                // déclenche jamais pour un retraité 71+ et le tooltip/MCP sous-affichent.
                // (l'impôt FERR arrive à totalTaxesPaid via le débit d'avril du bucket .reer —
                // [PROJ-TTP-DOUBLECOUNT] : plus AUCUN terme séparé à ajouter.)
                retraitReerMois += janResult.ferrMandatoryGross;
                // [ENG-FERR-NETTRANSFER-MUET] (2026-08-19) — le lot [ENG-FERR-FLOW-INVISIBLE] avait
                // alimenté le registre d'AFFICHAGE (`retraitReerMois`) et oublié celui des TRANSFERTS
                // (`withdrawalREER` → `NetTransferREER`). MESURÉ : 131 566,62 $ de REER qui
                // disparaissaient sans flux publié, en mode DÉTERMINISTE, à chaque janvier de 72+.
                // La garde forme-flux ne l'avait jamais vu : sa fixture s'arrête AVANT la retraite.
                withdrawalREER += janResult.ferrMandatoryGross;
                ferrWithdrawalMois += janResult.ferrMandatoryGross;
                // [ITEM-2C] La FERR de chaque conjoint sort de SA part REER (registre per-conjoint), pas au
                // pro-rata du pool → le solde REER de chaque conjoint reflète SES conversions obligatoires
                // (et conditionne SON FERR de l'an suivant). La réconciliation de fin de mois préserve l'attribution.
                reerByUser = reerByUser.map((v, i) => Math.max(0, (Number.isFinite(v) ? v : 0) - (janResult.ferrGrossByUser[i] ?? 0)));
                accRetraitsReerYearByUser = accRetraitsReerYearByUser.map((v, i) => (Number.isFinite(v) ? v : 0) + (janResult.ferrGrossByUser[i] ?? 0));
                liquid += janResult.ferrMandatoryGross;
                if (janResult.ferrLogMsg) flowEventsLog.push(janResult.ferrLogMsg);
            }
            // Guyton-Klinger
            guytonKlinger_indexationFactor = janResult.guytonKlingerIndexationFactor;
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
            // [DETTE-DATES] Le calendrier de la dette AVANT son arithmétique. Une dette pas encore
            // commencée ne coûte rien ; une dette dont le terme est échu ne se paie plus.
            const phase = phaseDette(d, startYear, startMonth, m);

            // ⚠️ Terme échu avec un solde RESTANT : on ne l'efface PAS (décision Marc 2026-08-19).
            // Effacer une dette parce qu'une date est passée fabriquerait du patrimoine — le solde
            // reste au bilan, visible, et on le DIT une seule fois, le mois où le terme échoit.
            // Répéter l'alerte tous les mois pendant vingt ans la rendrait invisible.
            if (phase === 'terminee'
                && d.balance > 0.005
                && estLePremierMoisApresLeTerme(d, startYear, startMonth, m)) {
                lifeEventsLog.push(
                    `⚠️ ${d.name} : fin du terme, il reste ${Math.round(d.balance).toLocaleString('fr-CA')} $ à régler`,
                );
            }

            if (phase === 'active' && d.balance > 0) {
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
            retraitReerMois, rrspWithholdingMois, accRetraitsReerYearAdd: 0,
            immoInterest, immoPrincipal, immoHypo, immoCharges,
            totalRentalIncome: 0,
            lifeEventLogs: [], flowEventLogs: [],
        };
        processRealEstate(
            reState,
            { m, loopYear, isRetired, activeUsersCount, simInflation, simSalaryGrowth,
              grossMarcBaseAnnual, grossAnnaBaseAnnual, incomeRetirement,
              // [RAP-DIVORCE-DEUX-TETES] plafond RAP = droit PAR PERSONNE → nombre de DÉCLARANTS.
              taxFilers,
              useSmithManoeuvre: effProj.useSmithManoeuvre === true, currentRentExpense,
              bootPrimaryHousingOffset,
              skipRapForPurchase: overrides.skipRapForPurchase ?? (strategy === 'PRIO_CELI_NO_RAP'),
              // PH4-FUT-B-4 — downsizing déclenché au mois EXACT de la retraite (une seule fois).
              // Revue : clamp à max(0,…) pour ne PAS perdre le levier si l'utilisateur est DÉJÀ
              // retraité au départ (retirementMonthIndex < 0) → downsizing au mois 0 plutôt que jamais.
              downsizeThisMonth: effProj.appliedDownsize === true && m === Math.max(0, retirementMonthIndex) },
            activeRE,
            propertiesState,
            getMonthOffset,
            welcomeTax,
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
        // [REER-RETRAIT-IMMO-REGISTRE] + [REER-IMMO-HORS-ASSIETTE] — le module alimente désormais
        // TOUS les registres du retrait REER, pas seulement le solde et la retenue :
        // l'AFFICHAGE (`retraitReerMois`, `rrspWithholdingMois`) et surtout l'ASSIETTE
        // (`accRetraitsReerYear` + sa ventilation per-conjoint) que décembre impose.
        // ⚠️ `accRetraitsReerYearAdd` EXCLUT le RAP, non imposable.
        retraitReerMois = reState.retraitReerMois;
        rrspWithholdingMois = reState.rrspWithholdingMois;
        if (reState.accRetraitsReerYearAdd > 0) {
            accRetraitsReerYear += reState.accRetraitsReerYearAdd;
            accRetraitsReerYearByUser = addByWeights(accRetraitsReerYearByUser, reState.accRetraitsReerYearAdd, reerByUser);
        }
        immoInterest = reState.immoInterest; immoPrincipal = reState.immoPrincipal;
        immoHypo = reState.immoHypo; immoCharges = reState.immoCharges;
        // [ENG-W5-RENTAL-OFFBALANCE] Les immeubles locatifs, APRÈS **toutes** les réaffectations
        // depuis `reState` — y compris `immoInterest`/`immoPrincipal`/`immoHypo`, qui sont ÉCRASÉES
        // (`=`, pas `+=`) trois lignes plus haut. Placé avant, le `+=` de ce bloc disparaissait en
        // SILENCE : le service de dette locatif n'aurait jamais atteint l'affichage, et le lot
        // aurait été vert en test et inerte à l'écran (`CORRECTIF-VERT-EN-TEST-INERTE-EN-PROD`).
        // Les trois volets vont ENSEMBLE — valeur au bilan, hypothèque au bilan, service
        // de la dette en dépense. Chacun seul serait pire que le statu quo : l'équité sans le
        // service donnerait une hypothèque qui ne descend jamais.
        // ⚠️ `equity` est DÉJÀ nette (valeur − hypothèque), comme `realEstateEquity` : on ne
        // re-soustrait JAMAIS `rentalMortgage` du patrimoine (double comptage interdit par la
        // source unique `computeRawNetWorth`).
        if (rentalStates.length > 0) {
            const rm = processRentalMonth(rentalStates, effProj.propertyGrowthRate ?? 3, rentalNames);
            realEstateEquity += rm.equity;
            mortgageBalance += rm.mortgageBalance;
            monthlyExpenses += rm.debtService;
            immoInterest += rm.interest;
            immoPrincipal += rm.principal;
            immoHypo += rm.debtService;
            rm.logs.forEach(msg => logEvent(lifeEventsLog, msg));
        }
        const totalRentalIncome = reState.totalRentalIncome;
        reState.lifeEventLogs.forEach(msg => logEvent(lifeEventsLog, msg));
        reState.flowEventLogs.forEach(msg => logEvent(flowEventsLog, msg));

        // ---- ENFANTS & REEE ----
        // Cycle 14 split: processOneChild → ./projection/childrenReee.
        // Les variables liquid/reee/monthlyIncome/incomeAnna sont commitées après le forEach.
        /**
         * [ENG-DIVORCE-CHILDREN-REEE] Part des enfants qui reste à la charge du déclarant.
         *
         * Décision Marc 2026-08-17 (`docs/adr/`) : **garde PARTAGÉE 50/50**. Après un
         * divorce, les COÛTS d'enfants et les ALLOCATIONS familiales se partagent donc moitié-
         * moitié — cohérent avec le régime réel (en garde partagée, l'ACE se divise 50/50).
         *
         * ⚠️ Défaut NEUTRE (1) hors divorce ⇒ rétrocompat BIT-IDENTIQUE, sous test.
         *
         * ⚠️ ELLE EST TRANSMISE, PLUS APPLIQUÉE ICI — et c'est la leçon du lot. Le premier jet
         * multipliait quelques champs du RÉSULTAT (`childGrossCostAdd`, `monthlyExpenseDelta`…).
         * Ça oblige à se souvenir des 3 à 5 registres que chaque montant d'enfant alimente, et
         * DEUX ont été oubliés — mesurés par deux agents indépendants :
         *   • allocations encaissées à 100 % (`monthlyIncomeDelta` jamais partagé) mais publiées à
         *     50 % : 332 $/mois contre 166 $ affichés, 75 957 $ d'écart sur le patrimoine final ;
         *   • décaissement REEE d'études ENTIER face à une dépense à 50 % : +1 450 $/mois de
         *     trésorerie née de nulle part, régime de l'enfant vidé 2× trop vite.
         * En partageant le MONTANT à la source, tout dérivé suit par construction. Classe maison
         * « un flux alimente PLUSIEURS registres », cette fois traitée à la racine.
         *
         * ⚠️ Elle ne s'applique PAS aux flux REEE : le régime suit le partage PATRIMONIAL
         * (`reeeContribShare`), pas la garde — deuxième décision de Marc le même jour. Ni au RQAP
         * ni à l'économie de transport du congé parental, qui dépendent du congé de l'ex-conjoint.
         */
        const childCustodyShare = divorced ? 0.5 : 1;
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
                    isRetired, grossMarcBaseAnnual,
                    // [REEE-CONGE-SANS-GARDE-SOLO] `soloHousehold` comme aux QUATRE autres sites qui
                    // passent ce salaire (l. 1197, 1229, 1909, 2114). Il manquait ICI : après décès ou
                    // divorce, le bloc enfants déclenchait le congé parental sur un salaire que le
                    // ménage ne touche plus — MESURÉ : −5 000 $/mois de brut RETIRÉ (−60 k$/an, jamais
                    // crédité) et +2 436 $/mois de prestation RQAP fabriquée pour un parent absent.
                    // Corriger le PRODUCTEUR, pas le consommateur : le module enfants n'a aucun moyen
                    // de savoir que le second parent a disparu.
                    grossAnnaBaseAnnual: soloHousehold ? 0 : grossAnnaBaseAnnual,
                    incomeAnna: _childIncomeAnna,
                    liquid: _childLiquid,
                    reee: _childReee,
                    // ⚠️ `householdGross` reste la somme des DEUX salaires, volontairement : il ne
                    // sert PAS au congé mais à la récupération des allocations (`householdGross >
                    // 150 000`). Y appliquer `soloHousehold` fait BAISSER la récupération, donc
                    // MONTER les allocations d'un parent seul — mesuré 166 $ → 250 $/mois au mois 36,
                    // et le test de scénario `[ENG-DIVORCE-BENEFITS-FLUX]` le voit immédiatement.
                    // C'est une question de RÈGLE (quelle assiette pour les allocations après une
                    // séparation ?), pas le défaut de câblage que ce lot corrige : routée en
                    // `[ENG-DIVORCE-ALLOC-ASSIETTE]` plutôt que tranchée en passant.
                    householdGross: grossMarcBaseAnnual + grossAnnaBaseAnnual,
                    trackerScee: tracker.scee, trackerIqee: tracker.iqee,
                    trackerReeeContribLifetime: tracker.contribLifetime ?? 0,
                    enableMonteCarlo,
                    reeeContribShare,
                    childCustodyShare,
                },
                calculateFiscalReport,
            );
            // ⚠️ AUCUNE part appliquée ici : elle l'est à la SOURCE (`childCustodyShare` dans le
            // ctx). Multiplier les champs du RÉSULTAT obligeait à se souvenir des 3 à 5 registres
            // que chaque montant alimente — deux ont été oubliés (allocations, retrait d'études),
            // mesurés par deux agents indépendants. Partager le montant, pas ses reflets.
            _childLiquid += result.liquidDelta;
            _childReee = result.reeeNewBalance;
            monthlyExpenses += result.monthlyExpenseDelta;
            _childMonthlyIncome += result.monthlyIncomeDelta;
            if (result.newIncomeAnna !== null) _childIncomeAnna = result.newIncomeAnna;
            // Le congé parental modélisé est TOUJOURS celui d'Anna (childrenReee `annaIsOnMatLeave`,
            // `accGrossDelta -= annaGrossMonthly`) : le retrait s'attribue à l'index 1. Si le congé
            // devient per-parent un jour, cette attribution doit suivre.
            accGrossIncomeYearByUser[1] += result.accGrossDelta;
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
            logFlow: (s, day?: number) => logEvent(flowEventsLog, s, day),
        });
        applyLifeEvents(lifeEvents, currentIsoMonth, expenseMultiplier, propertiesState, {
            shockPortfolio: (f) => { celi *= f; reer *= f; nonReg *= f; crypto *= f; },
            addLiquid: (n) => { liquid += n; },
            addExpense: (n) => { monthlyExpenses += n; },
            adjustRealEstate: (eq, mort) => { realEstateEquity += eq; mortgageBalance += mort; },
            realizeCapitalDisposition: (rawGain) => {
                // Idiome copie/recopie (comme handleNonRegSale) : le helper mute un mini-state, on recopie
                // les `let` du moteur. Une PERTE alimente `capitalLossBank` (consommée par les gains futurs).
                const ms = { capitalLossBank, accCapitalGainsYear };
                const result = applyCapitalDisposition(ms, rawGain);
                capitalLossBank = ms.capitalLossBank;
                accCapitalGainsYear = ms.accCapitalGainsYear;
                return result;
            },
            logLife: (s, day?: number) => logEvent(lifeEventsLog, s, day),
            logFlow: (s, day?: number) => logEvent(flowEventsLog, s, day),
        });

        // Wiring 2026-05: SavingsGoal et FinancialGoal aux deadlines.
        const goalMutator = {
            withdrawFromAccount: (account: 'CELI' | 'REER' | 'NON-ENREG' | 'CRYPTO' | 'LIQUID', amount: number): number => {
                let remaining = amount;
                if (account === 'LIQUID' || account === 'NON-ENREG') {
                    // [PV-11 revue] clamp à 0 : `liquid` peut être NÉGATIF ici (impôt d'avril débité
                    // AVANT les goals, sauvetage PV-1 après) — sans clamp, un goal « effaçait » le
                    // découvert sans le payer (survente NonReg + withdrawalLiquid négatif au chart).
                    const fromLiquid = Math.min(Math.max(0, liquid), remaining);
                    liquid -= fromLiquid; remaining -= fromLiquid;
                    withdrawalLiquid += fromLiquid;
                    if (remaining > 0 && account === 'NON-ENREG' && nonReg > 0) {
                        // [PV-10] Vente non-enregistrée RÉELLE via handleNonRegSale : gain réalisé
                        // (ACB proportionnel, banque de pertes, accCapitalGainsYear → imposé en
                        // décembre). Avant : ACB décrémenté du montant VENDU complet et AUCUN gain
                        // réalisé → retraits d'objectifs jamais imposés (sous-imposition) ET ACB
                        // sous-évalué (sur-imposition des ventes suivantes) — double erreur.
                        const fromNR = handleNonRegSale(remaining);
                        remaining -= fromNR;
                        withdrawalNonReg += fromNR;
                    }
                } else if (account === 'CELI') {
                    const drawn = Math.min(celi, remaining);
                    celi -= drawn; celiWithdrawalsThisYear += drawn; remaining -= drawn;
                    withdrawalCELI += drawn;
                } else if (account === 'REER') {
                    const drawn = Math.min(reer, remaining);
                    reer -= drawn; accRetraitsReerYear += drawn; remaining -= drawn;
                    accRetraitsReerYearByUser = addByWeights(accRetraitsReerYearByUser, drawn, reerByUser);
                    withdrawalREER += drawn;
                    // [ENG-FERR-FLOW-INVISIBLE] même parité pour les retraits de GOALS (3ᵉ source).
                    retraitReerMois += drawn;
                } else if (account === 'CRYPTO') {
                    // [PV-7] gain proportionnel + banque de pertes via le helper partagé.
                    const drawn = handleCryptoSaleLocal(remaining);
                    remaining -= drawn;
                    withdrawalCrypto += drawn;
                }
                // [PV-11b] — les retraits de GOALS alimentent désormais les séries withdrawal* du
                // chartData (sous-rapport pour les consommateurs « source unique » avant ce fix).
                return amount - remaining;
            },
            addExpense: (_n: number) => { /* déjà soustrait du compte ciblé */ },
            logFlow: (s: string, day?: number) => logEvent(flowEventsLog, s, day),
            // [PV-11a] — remontée STRUCTURÉE du shortfall d'objectif (le log texte reste).
            onGoalShortfall: (_goalName: string, asked: number, drawn: number) => {
                goalShortfallCount++;
                // Borne drawn à 0 (défense) : un drawn négatif surévaluerait le manque.
                goalShortfallTotal += Math.max(0, asked - Math.max(0, drawn));
            },
        };
        applySavingsGoalDeadlines(savingsGoals, currentIsoMonth, expenseMultiplier, goalMutator);
        applyFinancialGoalDeadlines(financialGoals, currentIsoMonth, expenseMultiplier, goalMutator);
        // [ENG-STRESSTEST-GROWTH-UNREGISTERED] Le krach et la reprise MUTENT les soldes — c'est bien
        // un mouvement de MARCHÉ, exactement comme le rendement mensuel. Ils n'alimentaient pourtant
        // AUCUN registre de flux : mesuré 371 782 $ de patrimoine apparus (puis disparus) sans
        // qu'aucun `MarketGrowth*` ne l'explique. La conservation du bilan restait verte — elle
        // compare des SOLDES entre eux et se moque de savoir si un flux justifie l'écart.
        //
        // ⚠️ Les deltas sont MÉMORISÉS ici et versés APRÈS `applyMonthlyGrowth` : ce dernier
        // ASSIGNE (`growthCELI = g.celi.growth`), il n'accumule pas. Les ajouter maintenant les
        // ferait écraser quelques centaines de lignes plus bas — silencieusement.
        let shockCELI = 0, shockREER = 0, shockNonReg = 0, shockCrypto = 0;
        const stressResult = computeStressTest(effProj, m);
        if (stressResult.crashFactor !== 1) {
            const f = stressResult.crashFactor - 1;
            shockCELI += celi * f; shockREER += reer * f;
            shockNonReg += nonReg * f; shockCrypto += crypto * f;
            celi *= stressResult.crashFactor; reer *= stressResult.crashFactor;
            nonReg *= stressResult.crashFactor; crypto *= stressResult.crashFactor;
            if (stressResult.log) logEvent(lifeEventsLog, stressResult.log);
        }
        if (stressResult.recoveryFactor !== 1) {
            // La reprise ne touche PAS le crypto (choix d'origine conservé) : ne rien inventer ici.
            const f = stressResult.recoveryFactor - 1;
            shockCELI += celi * f; shockREER += reer * f; shockNonReg += nonReg * f;
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
            retraitReerMois, rrspWithholdingMois, retraitCeliMois,
            withdrawalREER, withdrawalCELI, withdrawalNonReg, withdrawalCrypto,
            contribCELI, contribREER, contribNonReg, contribCELIAPP,
            shortfallMonths,
            uncoveredShortfall: 0,
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
            retraitReerMois = cs.retraitReerMois; rrspWithholdingMois = cs.rrspWithholdingMois; retraitCeliMois = cs.retraitCeliMois;
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
            // [panel #613 — ÉLEVÉ-4] 3e voie de la cohérence : `cashflowAllocation` dérive
            // `liveFilers` de ce drapeau pour les seuils PBMA / palier 1 / plafond PSV, et zéroïse
            // le salaire du conjoint. Sémantique « un seul contribuable » ⇒ `soloHousehold`.
            // Sans ça, un divorcé cotisait au REER sur des seuils DOUBLÉS de célibataire.
            m, loopYear, enableMonteCarlo, activeUsersCount, survivorMode: soloHousehold,
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
        // FISC-BROKE-LIQUID-FLOOR : un déficit mensuel non couvert (tous comptes de décaissement
        // épuisés, coussin critique gardé) est porté en dette VISIBLE — pas évaporé. Conservation
        // rétablie : ΔNW baisse du déficit, DetteTotale l'expose (NW reconstructible même insolvable).
        // Pas de double-comptage avec le sauvetage de découvert [PV-6] plus bas : PV-6 ne RE-porte pas
        // CE déficit (le liquide reste au coussin ≥0, donc il ne s'arme pas dessus). Un découvert DISTINCT
        // créé le même mois par un débit direct (réno/impôt d'avril) peut, lui, déclencher PV-6 sur un
        // AUTRE montant — montants disjoints, jamais le même dollar (vérifié au panel). Seuil > 1 $ :
        // ignore les poussières d'arrondi (zone morte 0,1–1 $ négligeable), aligné sur le résiduel PV-6.
        if (cashState.uncoveredShortfall > 1) {
            liquidDebt += cashState.uncoveredShortfall;
            logEvent(flowEventsLog, `⚠️ Dépense non couverte (comptes de décaissement épuisés) : ${Math.round(cashState.uncoveredShortfall).toLocaleString('fr-CA')} $ — portée en dette`);
        }

        // Cycle 15 split: REER Meltdown → ./projection/meltdownReer
        const meltResult = processReerMeltdown(
            // [ENG-DIVORCE — panel re-revue] `taxFilers`, PAS `activeUsersCount` : la cible du
            // meltdown est un revenu imposable PAR DÉCLARATION. Et `grossAnnaBaseAnnual` mis à 0 en
            // solo — même motif qu'au dépôt fiscal de décembre : le salaire d'un ex-conjoint parti
            // ne fait plus partie de l'assiette qu'on cherche à « remplir ».
            { m, isRetired, simSalaryGrowth, taxFilers, incomeRetirement,
              accRetraitsReerYear, accRentesYear, grossMarcBaseAnnual,
              grossAnnaBaseAnnual: soloHousehold ? 0 : grossAnnaBaseAnnual,
              reer, nonReg, celi, realEstateEquity },
            strategy,
        );
        if (meltResult) {
            reer -= meltResult.reerDrawn;
            nonReg += meltResult.nonRegAdd;
            nonRegACB += meltResult.nonRegAdd;
            // FISC-REER-WHT-DOUBLE (2026-06-16) : la retenue est un ACOMPTE d'impôt payé en avril via
            // le bucket .reer (ci-dessous). On la conserve au patrimoine (liquide) jusque-là — sinon le
            // brut sort du REER, seul le net entre en nonReg, et avril re-débite la retenue = double
            // comptage. Avec cette ligne le meltdown est NW-neutre (reer −brut, nonReg +net, liquid
            // +retenue), et la retenue n'est débitée qu'UNE fois (avril). Cohérent avec drawReer/CF-2.
            liquid += meltResult.withholding;
            // [WHT-DISPLAY-MELTDOWN + ENG-MELTDOWN-FLOW-INVISIBLE] (findings MESURÉS 2026-07-31)
            // Le meltdown est un RETRAIT REER comme les autres : il alimente les compteurs
            // d'AFFICHAGE comme les tirages en cascade — sinon (1) `totalTaxesPaid` suivait une
            // convention DIFFÉRENTE des autres stratégies (mesuré sur le scénario du test :
            // ratio MELTDOWN/AUTO 0,601 → 1,400) et `strategyRanking` recommandait MELTDOWN_REER
            // à tort sous l'objectif « impôt » (corrigé, mesuré) ; (2) `chartData.RetraitREER`
            // rendait ~96 % des sorties invisibles (30 496 $ affichés pour 794 303 $ tirés).
            // Aucun impact NW : PROUVÉ bit-identique (301 mois × 9 grandeurs, 2 worktrees).
            // NB : depuis [PROJ-TTP-DOUBLECOUNT] (2026-08-01), `rrspWithholdingMois` n'entre PLUS
            // dans totalTaxesPaid (l'impôt arrive au compteur via le débit d'avril du bucket
            // .reer, une seule fois) et n'atteint PAS chartData (vérifié par grep — panel #554) :
            // son seul rôle restant est le re-crédit CF-2 de cashflowAllocation (NW-neutralité).
            retraitReerMois += meltResult.reerDrawn;
            // [ENG-NETTRANSFER-REER-INCOMPLET] Registre des TRANSFERTS, oublié ici alors que la FERR
            // l'a reçu le 2026-08-19 (`[ENG-FERR-NETTRANSFER-MUET]`) : le meltdown est un retrait
            // REER comme les autres, il doit apparaître dans le flux PUBLIÉ `NetTransferREER`.
            // MESURÉ sous la stratégie MELTDOWN_REER : le solde REER chutait de 34 794 $ en un mois
            // pour 802 $ de flux publiés (pire résiduel 35 596,32 $), soit 1 849 080,59 $ d'écart
            // cumulé entre `RetraitREER` (affichage) et `ContribREER − NetTransferREER` (transferts)
            // sur 156 mois de retrait. Après : 0,10 $ (arrondi au cent).
            // ⚠️ Contrairement à la FERR, ce montant N'EST PAS exclu de `stepReerByUser` : la FERR
            // sort de la part EXACTE de chaque conjoint (facteur RRIF de SON âge), alors que le
            // meltdown est attribué AU PRORATA (`addByWeights` ci-dessous). Le soustraire au prorata
            // dans le registre per-conjoint est donc la MÊME règle, pas une seconde.
            // ⚠️ Publier la jambe d'ARRIVÉE (`contribNonReg += nonRegAdd`) N'EST PAS fait ici : ce
            // registre pilote l'exclusion de croissance de mi-mois, donc l'alimenter DÉPLACE de
            // l'argent (mesuré −5 045,04 $ de patrimoine final) et fait rougir deux goldens
            // « NEUTRALITÉ NW ». Décision de Marc → `[ENG-MELTDOWN-JAMBE-ARRIVEE]`.
            withdrawalREER += meltResult.reerDrawn;
            rrspWithholdingMois += meltResult.withholding;
            accRetraitsReerYear += meltResult.reerDrawn;
            // 5e source de retrait REER (audit fiscal-accuracy) : attribuer le meltdown par conjoint
            // comme FERR/goals/cashflow, sinon Σ(byUser) < accRetraitsReerYear → sous-imposition sous
            // le scénario MELTDOWN_REER (l'opposé du but de la Phase 2).
            accRetraitsReerYearByUser = addByWeights(accRetraitsReerYearByUser, meltResult.reerDrawn, reerByUser);
            taxCurrentYear.reer += meltResult.withholding;
            if (meltResult.log) logEvent(flowEventsLog, meltResult.log);
        }

        // Transfert NonReg → CELI/REER si espace
        // [ENG-INV-FLUXFORM-COVERAGE] Ce bloc VEND du non-enregistré pour remplir les droits
        // disponibles — un vrai mouvement d'argent entre deux comptes de l'utilisateur — et ne
        // publiait AUCUN flux : ni `withdrawalNonReg`, ni `contribCELI`, ni `contribREER`. Mesuré
        // sur un scénario ordinaire (stress-test désactivé) : 51 197 $ de variation de NonReg
        // inexpliquée en un mois, et 26 458 $ côté REER. Les gardes de conservation restaient
        // VERTES — elles comparent des soldes entre eux et ne demandent jamais « quel flux
        // justifie cet écart ». D'où la garde de forme-flux qui accompagne ce correctif.
        // ⚠️ `accRrspYear` était DÉJÀ alimenté (le suivi fiscal était juste) : seul l'AFFICHAGE des
        // flux mentait. C'est précisément ce qui rendait le défaut indétectable côté impôt.
        if (nonReg > 0) {
            if (celiRoom > 0) {
                const a = Math.min(nonReg, celiRoom); const s = handleNonRegSale(a);
                celi += s; celiRoom -= s;
                withdrawalNonReg += s; contribCELI += s;
            }
            if (rrspRoom > 0 && nonReg > 0 && !isRetired) {
                const a = Math.min(nonReg, rrspRoom); const s = handleNonRegSale(a);
                reer += s; rrspRoom -= s; accRrspYear += s;
                withdrawalNonReg += s;
                // ⚠️ `contribREER` alimente AUSSI `stepReerByUser` (registre REER per-conjoint,
                // celui qui a produit deux NO-GO de panel) — d'où une MESURE avant de le toucher.
                // Résultat : effet NUL. Patrimoine final ET `reerByUserFinal` bit-identiques sur
                // 3 stratégies avec salaires très inégaux (8 200 $ vs 3 100 $/mois) :
                // `[714314, 270046]` des deux côtés. La raison est structurelle — `stepReerByUser`
                // réconcilie sur `poolEnd: reer`, donc la cotisation était DÉJÀ absorbée, avec
                // exactement les mêmes parts salariales. Ce `+=` ne change que la PUBLICATION du
                // flux, pas l'attribution. (J'avais d'abord écrit ici que l'attribution « devenait
                // juste » : la mesure a réfuté cette affirmation.)
                contribREER += s;
            }
        }

        // [PV-1] Sauvetage du liquide négatif (choix Marc 2026-06-10 : cascade de vente).
        // Des débits DIRECTS du liquide (impôt d'avril taxApril.ts, véhicules/rénos W5,
        // échéances d'objectifs) peuvent le rendre négatif sans passer par le cashflow ;
        // applyMidMonthGrowth clampait ensuite à 0 (helpers.ts `Math.max`) → la dette était
        // EFFACÉE et le patrimoine surévalué (jusqu'à plusieurs centaines de k$ sur 30 ans).
        // Correctif : dernier point AVANT la croissance — si le liquide est négatif, on
        // couvre le découvert par la MÊME cascade que le shortfall régulier (stratégie de
        // retrait respectée, retenue REER comptée via taxCurrentYearReer, garde-fous PBMA/OAS).
        // Avec liquid=0 en entrée, la cascade ne puise pas sous zéro et son invariant CF-2 ramène le
        // liquide à la retenue REER prélevée (acompte d'impôt conservé jusqu'à avril, cf FISC-REER-WHT-
        // DOUBLE) : les ventes financent exactement le découvert (net), la retenue reste au patrimoine.
        // Cas insolvable (comptes épuisés ou cap OAS) : résiduel JOURNALISÉ, VISIBLE (flowEvents +
        // shortfallMonths) ET désormais PORTÉ EN DETTE [PV-6] (`liquidDebt`, soustrait du patrimoine
        // net mensuel et successoral) — plus d'absorption silencieuse qui surévaluait le patrimoine.
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
                liquidDebt += residual; // [PV-6] porté en dette (plus absorbé silencieusement)
                logEvent(flowEventsLog, `⚠️ Découvert NON couvert (comptes insuffisants) : ${Math.round(residual).toLocaleString('fr-CA')} $ — porté en dette`);
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
        reerByUser = stepReerByUser(reerByUser, { withdrawal: withdrawalREER - ferrWithdrawalMois, contribution: contribREER, poolEnd: reer, shares: reerShares });
        nonReg = g.nonReg.newVal; growthNonReg = g.nonReg.growth; growthPctNonReg = g.nonReg.pct;
        crypto = g.crypto.newVal; growthCrypto = g.crypto.growth; growthPctCrypto = g.crypto.pct;
        liquid = g.liquid.newVal; growthLiquid = g.liquid.growth; growthPctLiquid = g.liquid.pct;
        reee = g.reee.newVal; growthREEE = g.reee.growth; growthPctREEE = g.reee.pct;
        totalGrowth += g.totalGrowth;
        // [ENG-STRESSTEST-GROWTH-UNREGISTERED] Versement des deltas de choc/reprise APRÈS les
        // assignations ci-dessus (qui écrasent). `+=` et non `=` : un mois peut porter les deux.
        // Le choc entre dans `MarketGrowth*` parce que c'en EST un — un krach est un rendement
        // négatif, pas une catégorie à part. Hors stress-test, tous ces deltas valent 0 : la
        // rétrocompat est bit-identique.
        if (shockCELI !== 0) { growthCELI += shockCELI; totalGrowth += shockCELI; }
        if (shockREER !== 0) { growthREER += shockREER; totalGrowth += shockREER; }
        if (shockNonReg !== 0) { growthNonReg += shockNonReg; totalGrowth += shockNonReg; }
        if (shockCrypto !== 0) { growthCrypto += shockCrypto; totalGrowth += shockCrypto; }
        // [PROJ-TTP-DOUBLECOUNT] (panel #551, MESURÉ au cent — corrigé 2026-08-01) « Impôt à vie »
        // = Σ des flux d'impôt réellement DÉBITÉS du liquide, c'est-à-dire `fluxImpots` SEUL :
        // avril débite le bucket `.reer` ENTIER (taxApril.ts — retenues cascade + meltdown + FERR,
        // toutes provisionnées dedans) + `.revenu` (le COMPLÉMENT de décembre). Les retenues ne
        // sont « débitées qu'UNE fois, en avril » (contrat FISC-REER-WHT-DOUBLE,
        // cashflowAllocation.ts : le brut reste au patrimoine jusqu'au règlement) — ajouter
        // `rrspWithholdingMois` et `taxOnRrif` ici RE-COMPTAIT donc les mêmes dollars (mesuré :
        // MELTDOWN 321 122 $ affichés pour 131 871 $ réels, +144 % ; AUTO 229 338 $ pour
        // 29 806 $). L'ancien raisonnement (« décembre n'ajoute que le complément ») protégeait
        // l'ASSIETTE, pas le compteur : le complément ET les acomptes passent tous deux par avril.
        // Borne assumée : les acomptes de la DERNIÈRE année (sans avril suivant) ne sont pas
        // comptés — vision cash honnête ; la succession a son propre `totalEstateTax`.
        totalTaxesPaid += fluxImpots;
        totalExpenses += monthlyExpenses;

        // Patrimoine net = actifs − TOUTES les dettes. realEstateEquity est DÉJÀ net
        // d'hypothèque (pas de re-soustraction de mortgageBalance). On soustrait :
        //   • liquidDebt          — découvert non couvert porté en dette [PV-6]
        //   • smithManoeuvreDebt  — HELOC du levier Smith (l'actif réinvesti est dans NonReg,
        //                           déjà compté → sans cette soustraction, NW gonflé du HELOC)
        //   • activeDebtsTotal    — prêts/cartes/auto PRÉEXISTANTS (sinon le solde dû surévalue
        //                           le patrimoine ET rembourser le principal érode le NW au plein
        //                           paiement au lieu du seul intérêt — money-critical, 2026-06-16).
        // Cohérent avec la succession (estateCalculation : finalRawNetWorth).
        const activeDebtsTotal = sumActiveDebts();
        const rawNetWorth = currentRawNetWorth();
        if (rawNetWorth < minNetWorth) minNetWorth = rawNetWorth;

        // V23 Fix 1: FIRE comparaison en dollars futurs (inflation-ajustée)
        const futureFireTarget = fireTargetNetWorth * Math.pow(1 + simInflation / 100, m / 12);
        if (!hasHitFire && rawNetWorth >= futureFireTarget) {
            logEvent(lifeEventsLog, FIRE_LIFE_EVENT);
            hasHitFire = true;
        }

        // Cycle 17 split: impôt latent → ./projection/latentTax
        // FISC-LATENT-RE — inclure le gain latent des immeubles LOCATIFS (RP exclue, exempte au décès),
        // pour cohérence avec le bilan successoral (même Σ que realEstateLatentGain plus bas, estateCalculation).
        const realEstateLatentGainNow = propertiesState
            .filter(p => p.isBought && !p.isSold && !p.isPrimaryResidence)
            .reduce((s, p) => s + Math.max(0, p.currentValue - (p.cost ?? 0)), 0);
        const impotLatent = computeLatentTax(
            // [ENG-DIVORCE-LATENTTAX] `activeUsersCount` est ici un NOMBRE DE DÉCLARANTS : il
            // divise le revenu pour calculer l'impôt d'UNE déclaration, puis le remultiplie. Après
            // un divorce, tout le patrimoine latent pèse sur UNE seule déclaration, donc sur des
            // paliers plus élevés. Passer 2 lissait la facture sur deux têtes fictives — mesuré :
            // impôt latent −337 063 $ au lieu de −390 189 $, soit **53 126 $ sous-estimés**, et un
            // patrimoine net d'impôt affiché d'autant trop haut.
            // Même famille que `taxFilers` (dépôt fiscal) et `taxJanuary` : ces trois-là doivent
            // dire la même chose, sinon la prochaine correction n'en bougera qu'une.
            { m, loopYear, simInflation, simSalaryGrowth, isRetired, activeUsersCount: taxFilers,
              grossMarcBaseAnnual,
              // Le salaire d'un ex-conjoint parti ne fait plus partie de l'assiette — même motif
              // qu'au dépôt de décembre et au meltdown REER.
              grossAnnaBaseAnnual: soloHousehold ? 0 : grossAnnaBaseAnnual,
              accRentesYear, incomeRetirement,
              reer, nonReg, nonRegACB, crypto, cryptoACB, realEstateLatentGain: realEstateLatentGainNow, enableMonteCarlo },
            calculateFiscalReport,
        );

        // Centralisation Phase 3 Tier 2 — cumul REEE (somme sur tous les enfants)
        const reeeContribCum = Object.values(reeeTracker).reduce((s, t) => s + (t.contribLifetime ?? 0), 0);
        const reeeGrantsCum = Object.values(reeeTracker).reduce((s, t) => s + (t.scee ?? 0) + (t.iqee ?? 0), 0);

        // Centralisation Phase 3 Tier 3 — dividendes mensuels + revenus de
        // placement imposables (50% des gains capital + 100% des dividendes).
        // Approximation : rendement non-reg × 30% × balance, divisé par 12.
        // [FISC-DIV-DERIVED-BASES] 3e copie de la formule remplacée par la source unique.
        const dividendIncome = computeAnnualNonRegDividends(nonReg, baseRates.nonReg ?? 0) / 12;
        const taxableInvIncome = dividendIncome + (accCapitalGainsYear * CAPITAL_GAINS_INCLUSION_STANDARD) / 12;

        // Phase 3 Tier 3 — taux d'imposition marginal et effectif (PAR ADULTE)
        // Source : calculateFiscalReport sur le revenu brut annuel courant.
        // En retraite : on combine pensions + retraits REER pour le calcul.
        // [ENG-DIVORCE-DISPLAY-RATES] Après un divorce, ce taux AFFICHÉ additionnait encore les deux
        // salaires puis divisait par 2 : il montrait le taux d'un ménage qui n'existe plus. Les deux
        // gestes du lot s'appliquent ici comme partout — `taxFilers` au dénominateur, salaire de
        // l'ex retiré du numérateur. C'est une sortie d'AFFICHAGE (taux marginal/effectif du point
        // mensuel), pas une assiette de calcul : rien d'autre n'en dépend.
        const grossHouseholdAnnual = grossMarcBaseAnnual + (soloHousehold ? 0 : grossAnnaBaseAnnual);
        const grossPerUserAnnual = isRetired
            ? (incomeRetirement * 12 + accRetraitsReerYear) / Math.max(1, taxFilers)
            : grossHouseholdAnnual / Math.max(1, taxFilers);
        const fiscalReportTier3 = grossPerUserAnnual > 0
            ? calculateFiscalReport(grossPerUserAnnual, 0, 0, loopYear, true /* skip breakdown pour perf */)
            : null;
        const marginalTaxRate = fiscalReportTier3 ? fiscalReportTier3.marginalRate * 100 : 0;
        const effectiveTaxRate = fiscalReportTier3 ? fiscalReportTier3.averageRate : 0;

        // Cycle 21 split: assemblage data.push → ./projection/monthlyOutput
        data.push(buildMonthlyDataPoint({
            m, retirementMonthIndex, fireTargetNetWorth, futureFireTarget,
            simInflation, expenseMultiplier, effectiveBaseExpenses, enableMonteCarlo,
            verboseMonthlyPoints: diagnostics.verboseMonthlyPoints,
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
            liquidDebt, smithManoeuvreDebt,
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
            lifeEventsLog, flowEventsLog, eventDaysLog,
        }));
    }

    // Cycle 26 split: bilan successoral → ./projection/estateCalculation
    // RE-GAIN-SUCC — gain latent des immeubles LOCATIFS non vendus à la fin (RP exclue, exempte au décès).
    const realEstateLatentGain = propertiesState
        .filter(p => p.isBought && !p.isSold && !p.isPrimaryResidence)
        .reduce((s, p) => s + Math.max(0, p.currentValue - (p.cost ?? 0)), 0);
    const estate = computeEstateNetWorth({
        liquid, celi, celiapp, reer, nonReg, nonRegACB, crypto, cryptoACB, reee,
        realEstateEquity, mortgageBalance, realEstateLatentGain, smithManoeuvreDebt, liquidDebt,
        // [ENG-W5-BUSINESS-OFFBALANCE] La succession aussi : sans ce terme, le legs sous-évaluait le
        // patrimoine de la valeur ENTIÈRE de l'entreprise (mesuré 2 M$ dans le persona W5).
        privateBusinessValue,
        // [fix 2026-06-16] dettes actives résiduelles en fin de sim : soustraites du patrimoine
        // successoral comme dans le NW mensuel (sinon « Patrimoine projeté » diverge du graphe).
        activeDebtsTotal: sumActiveDebts(),
        incomeRetirement, accRentesYear, accRetraitsReerYear,
        grossMarcBaseAnnual, grossAnnaBaseAnnual, simSalaryGrowth,
        simulationYears: projection.years,
        startYear, currentAge,
        retirementTargetAge: retirementGoal.targetAge,
        governmentPension: retirementGoal.governmentPension,
        // FA-8 — estimés précis par rente (per-personne) : priment sur le split 65/35 dans le NPV estate,
        // comme dans le revenu de retraite (plus de divergence silencieuse).
        rrqEstimateMonthly: retirementGoal.rrqEstimateMonthly,
        psvEstimateMonthly: retirementGoal.psvEstimateMonthly,
        // [ESTATE-NPV-07] Rentes RÉELLEMENT versées au dernier point (nominal, familial) : elles
        // portent le prorata gains/résidence et l'indexation que les estimés de saisie ci-dessus
        // n'ont pas. Elles ne servent QU'À isoler la tranche imposable dans le facteur net d'impôt
        // de la VAN — la VAN elle-même reste bâtie sur les estimés (convention FA-8 inchangée).
        pensionRrqMonthlyFinal: pensionRRQ,
        pensionPsvMonthlyFinal: pensionPSV,
        pensionGisMonthlyFinal: incomeRetirementGis,
        pensionOasReductionMonthlyFinal: pensionOasReduction,
        // [ESTATE-NPV-07] Proxy de contexte tant que la DB n'est pas versée. ⚠️ Calculé par la
        // SOURCE UNIQUE `computeDbPensionMonthly` (partagée avec `retirementIncome.ts`), et NON
        // recopié : la re-dérivation avait produit trois divergences mesurées (indexation partielle,
        // âge de début, facteur de survivant). `age` est forcé au-delà de `dbPensionStartAge` parce
        // qu'on veut « ce que la DB vaudra », pas « ce qu'elle vaut aujourd'hui » ; `inflFactor` est
        // porté à l'année finale, comme `rrqExpected`.
        dbPensionMonthlyPlanned: computeDbPensionMonthly({
            retirementGoal,
            age: Math.max(currentAge + projection.years, retirementGoal.dbPensionStartAge ?? retirementGoal.targetAge),
            inflFactor: Math.pow(1 + simInflation / 100, projection.years),
            survivorMode, dbSurvivorPct,
            // ⚠️ `divorced` SEUL, PAS `survivorMode || divorced` — exactement comme l'appel de
            // référence de `computeRetirementIncome` 1 200 lignes plus haut. Le décès est DÉJÀ porté
            // par `dbSurvivorFactor = survivorMode ? dbSurvivorPct : 1` À L'INTÉRIEUR de la source
            // unique ; y ajouter un `1/N` réduit DEUX FOIS. J'avais recopié l'expression de la ligne
            // voisine (`householdPensionShare` du repli `governmentPension`), où le halving survivant
            // est légitime parce que l'agrégat couvre les DEUX conjoints. MESURÉ : proxy/réel = 0,5000
            // en mode survivant (contre 1,0000 en couple intact et en divorce), soit jusqu'à
            // 17 067 $ de patrimoine successoral surestimé tant que la DB n'a pas démarré, et une
            // marche résiduelle de ~2 k$ à son démarrage — la falaise même que ce terme supprime.
            householdPensionShare: divorced ? 1 / Math.max(1, activeUsersCount) : 1,
        }),
        pensionPriveeMonthlyFinal: pensionPrivee,
        // [ENG-DIVORCE-ESTATE-PENSION] Le compteur de TÊTES : il MULTIPLIE ici un estimé
        // per-personne pour reconstituer le familial — sémantique INVERSE de `retirementIncome`,
        // où le même nom désigne un DIVISEUR d'agrégat. D'où une lecture ligne à ligne avant de
        // câbler (le piège homonyme a déjà coûté un NO-GO sur ce lot).
        // ⚠️ `survivorMode || divorced` et non `soloHousehold` : ce dernier est déclaré DANS la
        // boucle mensuelle et n'existe plus ici. Les deux drapeaux, eux, vivent au niveau du
        // scénario et portent l'état FINAL du ménage — ce qui est exactement la bonne question
        // pour un bilan successoral.
        activeUsersCount: (survivorMode || divorced) ? 1 : activeUsersCount,
        // Et la PART, pour le repli sur l'agrégat familial `governmentPension`, que rien ne divise.
        householdPensionShare: (survivorMode || divorced) ? 1 / Math.max(1, activeUsersCount) : 1,
        simInflation, enableMonteCarlo,
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
        // [ENG-TTP-UNSETTLED-HORIZON] (panel #554/#555, mesuré NET : 8,6 % du compteur à 10 ans,
        // 51,5 % à 2 ans, 100 % à 1 an) : la dernière année RÉCONCILIÉE par décembre n'a jamais
        // son avril → sa dette échappe à totalTaxesPaid. On l'expose SÉPARÉMENT (l'affichage additionne)
        // plutôt que de la fondre dans le compteur : l'identité totalTaxesPaid == Σ FluxImpots reste
        // vraie et testable. SURTOUT PAS taxCurrentYear (année partielle NON réconciliée = retenues
        // brutes → ré-introduirait la sur-estimation). Signé (négatif = remboursement dû au
        // patrimoine). Couvre aussi le décès mi-simulation (break avant avril — même chemin de
        // retour). `totalEstateTax` est une grandeur DISJOINTE (impôt de liquidation).
        unsettledTaxAtHorizon: Number.isFinite(reconciledUnsettledTax) ? reconciledUnsettledTax : 0,
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
        // [PV-11a] — objectifs partiellement financés (≠ shortfallMonths/cashflow).
        goalShortfalls: { count: goalShortfallCount, total: Math.round(goalShortfallTotal) },
        startNW: estate.startNW,
    };
};

// Cycle 7 split: runMonteCarlo extrait dans ./projection/monteCarlo

// FA-12 — hook TEST-ONLY : l'API publique (calculateFutureProjection) ne lance les scénarios
// qu'en déterministe (enableMonteCarlo=false) et AGRÈGE le Monte Carlo (percentiles). Le test
// d'intégration survivorMode doit piloter UNE itération MC seedée précise : la mortalité du
// conjoint (trySpouseMortality) n'est tirée que sous enableMonteCarlo. Ne pas utiliser hors tests.
export const __runScenarioForTests = runScenario;

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
    // PH4-FUT-B — profil de rendement (levier) : remplace returnRates par le preset
    // (conservative/aggressive ; 'balanced'/absent = inchangé → non-régression) PUIS bonus
    // asset-location. `returnRatesForProfile` est le helper PARTAGÉ avec configToEngine (recherche)
    // → la courbe « appliquée » reproduit EXACTEMENT ce que l'optimiseur a classé.
    const profileRates = returnRatesForProfile(proj.appliedReturnProfile, proj.returnRates);
    const effectiveReturnRates = proj.appliedAssetLocation && profileRates
        ? {
            ...profileRates,
            celi: profileRates.celi + ASSET_LOCATION_BONUS_PP,
            reer: profileRates.reer + ASSET_LOCATION_BONUS_PP,
            nonReg: profileRates.nonReg + ASSET_LOCATION_BONUS_PP,
        }
        : profileRates;
    const effectiveParams: SimulationParams = effectiveReturnRates && effectiveReturnRates !== proj.returnRates
        ? { ...params, projection: { ...proj, returnRates: effectiveReturnRates } }
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
    let mcIterationsRun: number | null = null;
    let fvi: number | null = null;
    let expertMetrics: MonteCarloResult['expertMetrics'] | null = null;

    if (runMC) {
        // Cycle 5 audit UI: monteCarloIterations désormais lu depuis ProjectionConfig
        // (panneau Paramètres Avancés). [REFONTE-NAV-L2a] Clamp délégué à la source unique
        // (mêmes bornes 50-1000, défaut 100) — l'UI affiche via le MÊME helper, donc le
        // libellé « Monte Carlo (N itér.) » ne peut plus diverger du calcul réellement fait.
        const MC_ITERATIONS = effectiveMcIterations(params.projection.monteCarloIterations);
        // Cycle 7 split: runScenario injecté pour éviter dépendance circulaire.
        // G21 C4 fix : utilise la stratégie réelle du scénario ciblé (avant,
        // 'AUTO_MARGINAL' était hardcodé → le MC ignorait le scénario sélectionné).
        const mcResult = runMonteCarlo(runScenario, effectiveParams, (target.strategy as AllocationStrategy) ?? 'AUTO_MARGINAL', target.delayPensions as boolean, MC_ITERATIONS, appliedOverrides);
        successRate = mcResult.successRate;
        fvi = mcResult.fvi;
        expertMetrics = mcResult.expertMetrics;
        // [MC-LABEL-FROZEN] Le compte voyage AVEC le résultat : le libellé de l'écran Futur lisait
        // la config vivante, donc mentait dès qu'on bougeait le curseur sans relancer.
        mcIterationsRun = mcResult.iterationsRun;

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
        // [MCP-RETIREMENT-VERDICT] — survie BRUTE Monte Carlo (% de runs avec patrimoine final > 0,
        // monteCarlo.ts:92), NON écrasée par le FVI : `successRate` ci-dessus EST le FVI (score
        // composite survie 30 % + sécurité 30 % + efficacité 20 % + legs 20 %) → un verdict de
        // soutenabilité qui seuillait dessus pouvait dire « plan solide » à 50 % de survie réelle
        // (finding panel 2026-07-14). Champ ADDITIF : aucun consommateur existant ne change.
        survivalRatePct: successRate,
        fvi,
        mcIterationsRun,
        expertMetrics: expertMetrics ?? undefined,
        allResults: results,
        bestStrategyIdx: results.indexOf(best)
    };
};

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
