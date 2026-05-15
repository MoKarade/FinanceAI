// services/projection/types.ts
// Cycle 28 split: types partagés entre projection.ts et les sous-modules.
// Élimine les imports circulaires (monthlyOutput, meltdownReer, cashflowAllocation → projection.ts).

export type AllocationStrategy = 'AUTO_MARGINAL' | 'PRIO_REER' | 'PRIO_CELI' | 'MELTDOWN_REER' | 'DEBT_FIRST';

export type FutureScenarioType = 'BASE' | 'LIBERTE_55' | 'HYPER_INFLATION' | 'WINDFALL' | 'ECONOMIC_WINTER';

// Cycle 3 TS reviewer quick win #1 (ROI massif): typer chartData[] avec
// ProjectionChartPoint élimine ~35 erreurs strict en cascade dans
// RealEstate/Investments/ChildPlanning. Tous les champs optionnels pour
// compat avec les entrées MC réduites (NetWorth + monthIndex seulement).
export interface ProjectionChartPoint {
    monthIndex: number;
    NetWorth: number;
    // Variantes MC (minimales)
    P10?: number | null;
    P50?: number | null;
    P90?: number | null;
    // Variantes déterministes (champ complet)
    dateLabel?: string;
    year?: number;
    age?: number;
    IncomeMarc?: number;
    IncomeAnna?: number;
    IncomeRetirement?: number;
    Income?: number;
    NetSalary?: number;
    Expenses?: number;
    childCost?: number;
    childGross?: number;
    childBenefits?: number;
    ReeeContrib?: number;
    ReeePayout?: number;
    ImmoHypo?: number;
    ImmoCharges?: number;
    ImmoInterest?: number;
    ImmoPrincipal?: number;
    RentalIncome?: number;
    Savings?: number;
    Liquidites?: number;
    CELI?: number;
    CELIMax?: number;
    CELIAPP?: number;
    REER?: number;
    REERMax?: number;
    REEE?: number;
    NonReg?: number;
    Crypto?: number;
    RetraitREER?: number;
    RetraitCELI?: number;
    rapBalance?: number;
    Immobilier?: number;
    DetteTotale?: number;
    diffNW?: number;
    diffCELI?: number;
    diffREER?: number;
    diffLiquid?: number;
    ImpotLatent?: number;
    FluxImpots?: number;
    ImpotRetraitREER?: number;
    ImpotSalaireMois?: number;
    ImpotGainsCap?: number;
    ImpotDivers?: number;
    TaxPaidRevenu?: number;
    TaxPaidGains?: number;
    TaxPaidDivers?: number;
    TaxPaidREER?: number;
    WithheldTaxRrif?: number;
    FireTarget?: number;
    CoastFIRE?: number;
    BaristaFIRE?: number;
    isRetired?: boolean;
    ContribCELI?: number;
    ContribREER?: number;
    ContribNonReg?: number;
    MarketGrowthCELI?: number;
    MarketGrowthREER?: number;
    MarketGrowthNonReg?: number;
    MarketGrowthCrypto?: number;
    MarketGrowthLiquid?: number;
    MarketGrowthCELIAPP?: number;
    MarketGrowthREEE?: number;
    MarketGrowthPctCELI?: number;
    MarketGrowthPctREER?: number;
    MarketGrowthPctNonReg?: number;
    MarketGrowthPctCrypto?: number;
    MarketGrowthPctLiquid?: number;
    MarketGrowthPctCELIAPP?: number;
    MarketGrowthPctREEE?: number;
    NetTransferCELI?: number;
    NetTransferREER?: number;
    NetTransferNonReg?: number;
    NetTransferCrypto?: number;
    NetTransferLiquid?: number;
    NetTransferCELIAPP?: number;
    NetTransferREEE?: number;
    ExpenseInflationImpact?: number;
    ExpenseInflationPct?: number;
    AccruedTaxRevenu?: number;
    AccruedTaxGains?: number;
    AccruedTaxDivers?: number;
    AccruedTaxREER?: number;
    lifeEvents?: string[];
    flowEvents?: string[];
    // Audit 2026-05: index signature narrow (unknown au lieu de any) pour
    // forcer narrowing côté consommateur sans casser l'accès aux champs ad-hoc.
    [extra: string]: number | string | boolean | string[] | undefined;
}

// FIX cycle 2 TS reviewer (ROI massif): typer le retour de calculateFutureProjection
// élimine ~40 erreurs en mode strict (cascade TS2339 sur consumers .chartData, .NetWorth, etc.).
export interface ProjectionResult {
    chartData: ProjectionChartPoint[];
    finalNetWorth?: number;
    estateNetWorth?: number;
    totalTaxesPaid?: number;
    totalGrowth?: number;
    totalExpenses?: number;
    minNetWorth?: number;
    shortfallMonths?: number;
    shortfallRate?: number;
    fireNumber?: number;
    aiNote?: string;
    strategyName?: string;
    stratType?: FutureScenarioType | string;
    stratDescription?: string;
    pros?: string[];
    cons?: string[];
    icon?: string;
    delayPensions?: boolean;
    gainVsAuto?: number;
    successRate?: number | null;
    fvi?: number | null;
    expertMetrics?: any;
    allResults?: ProjectionResult[];
    bestStrategyIdx?: number;
    actionPlan?: { monthlyCashflow: number; strategy: AllocationStrategy } | null;
    // Audit 2026-05: unknown au lieu de any pour forcer narrow chez consommateurs.
    [key: string]: unknown;
}
