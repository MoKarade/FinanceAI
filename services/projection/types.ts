// services/projection/types.ts
// Cycle 28 split: types partagés entre projection.ts et les sous-modules.
// Élimine les imports circulaires (monthlyOutput, meltdownReer, cashflowAllocation → projection.ts).

export type AllocationStrategy = 'AUTO_MARGINAL' | 'PRIO_REER' | 'PRIO_CELI' | 'MELTDOWN_REER' | 'DEBT_FIRST' | 'PRIO_CELI_NO_RAP';

export type FutureScenarioType =
    | 'BASE'
    | 'LIBERTE_55'
    | 'HYPER_INFLATION'
    | 'WINDFALL'
    | 'ECONOMIC_WINTER'
    // Phase 4 #4: compound stress scenarios (krach × inflation × LTC, héritage tardif)
    | 'COMPOUND_STRESS'
    | 'LATE_INHERITANCE';

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
    CELIAPPMax?: number;
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
    /** [M5 audit 2026-06-17] Dettes NON immobilières = activeDebts + liquidDebt + smithManoeuvre
     *  (DetteTotale SANS l'hypothèque). `NetWorth = Σ(actifs affichés, dont Immobilier=équité nette)
     *  − DettesNonImmo` tient TOUJOURS, même sous hypothèque — contrairement à DetteTotale (qui inclut
     *  l'hypothèque, déjà nettée dans Immobilier → reconstructabilité rompue sous prêt). */
    DettesNonImmo?: number;
    /** Découvert (liquidité négative non couverte) porté en dette [PV-6]. Inclus dans DetteTotale
     *  et soustrait de NetWorth ; exposé pour que l'UI explique un patrimoine net négatif. */
    LiquidDebt?: number;
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
    // Centralisation Phase 3 — champs dérivés simples (Tier 1)
    realNetWorth?: number;          // NetWorth déflaté à $ d'aujourd'hui
    liquidityRunway?: number;       // Mois de dépenses couverts par Liquidites
    mortgageRemainingMonths?: number; // Estimation linéaire balance/paiement
    // Centralisation Phase 3 — Tier 2 (tracking REEE)
    reeeContribCum?: number;        // Cumul contributions REEE (ménage)
    reeeGrantsCum?: number;         // Cumul subventions SCEE+IQEE (ménage)
    // Centralisation Phase 3 — Tier 3 (fiscalité + dividendes + pensions split)
    marginalTaxRate?: number;       // Taux marginal d'imposition (%)
    effectiveTaxRate?: number;      // Taux moyen d'imposition (%)
    DividendIncome?: number;        // Dividendes mensuels NonReg
    TaxableInvIncome?: number;      // Revenus de placement imposables
    pensionRRQ?: number;            // Rente RRQ/RPC mensuelle
    pensionPSV?: number;            // PSV + SRG mensuelle (après écrêtement)
    pensionPrivee?: number;         // Pensions privées DB mensuelles
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
    [extra: string]: number | string | boolean | string[] | null | undefined;
}

// FIX cycle 2 TS reviewer (ROI massif): typer le retour de calculateFutureProjection
// élimine ~40 erreurs en mode strict (cascade TS2339 sur consumers .chartData, .NetWorth, etc.).
export interface ProjectionResult {
    chartData: ProjectionChartPoint[];
    finalNetWorth?: number;
    estateNetWorth?: number;
    /** Phase 1 refactor « REER par conjoint » : solde REER final attribué par conjoint
     *  (Σ == solde REER commun final). Shadow/diagnostic ; consommé par la fiscalité en Phase 2. */
    reerByUserFinal?: number[];
    /** [ENG-TTP-UNSETTLED-HORIZON] Dette fiscale RÉCONCILIÉE (dernier décembre) jamais réglée par un
     *  avril dans l'horizon — à ADDITIONNER à totalTaxesPaid pour un « impôt de l'horizon » complet
     *  (jusqu'à 49 % du compteur sur 10 ans, mesuré). Signé ; disjoint de totalEstateTax. */
    unsettledTaxAtHorizon?: number;
    totalTaxesPaid?: number;
    totalGrowth?: number;
    totalExpenses?: number;
    minNetWorth?: number;
    /** [PV-11a] — objectifs PARTIELLEMENT financés à leur deadline (drawn < visé) :
     *  count = nb d'occurrences, total = somme des manques ($). ≠ shortfallRate (cashflow). */
    goalShortfalls?: { count: number; total: number };
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
    /** Survie BRUTE Monte Carlo (% de runs finissant patrimoine > 0). ⚠️ `successRate` est ÉCRASÉ
     *  par le FVI quand MC tourne (V65) — pour un verdict de soutenabilité, utiliser CE champ. */
    survivalRatePct?: number | null;
    fvi?: number | null;
    expertMetrics?: {
        swr: number;
        taxLeakage: number;
        shortfallRisk: number;
        sequenceRiskPct: number;
        worstDecadeDrawdown: number;
        criticalDecadeStartYear: number;
        criticalDecadeEndYear: number;
    } | null;
    allResults?: ProjectionResult[];
    bestStrategyIdx?: number;
    actionPlan?: { monthlyCashflow: number; strategy: AllocationStrategy } | null;
    // Audit 2026-05: unknown au lieu de any pour forcer narrow chez consommateurs.
    [key: string]: unknown;
}
