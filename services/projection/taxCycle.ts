// services/projection/taxCycle.ts
// Cycle 8 split: April tax settlement (régularisation des impôts de l'année passée).
// Bien borné — s'exécute uniquement en avril (currentMonthIndex === 3).
// Mutations: liquid, nonReg, nonRegACB, taxPreviousYear (reset), log.

export interface AprilSettlementResult {
    /** Total payé (positif) ou remboursé (négatif). 0 si rien à régler. */
    fluxImpots: number;
    taxPaidRevenu: number;
    taxPaidGains: number;
    taxPaidDivers: number;
    taxPaidREER: number;
    /** Nouveau bucket taxPreviousYear après reset (toujours 0/0/0/0). */
    newTaxPreviousYear: { revenu: number; gains: number; divers: number; reer: number };
}

export interface AprilSettlementMutator {
    subtractLiquid: (amount: number) => void;     // liquid -= fluxImpots
    addNonReg: (amount: number) => void;          // nonReg += refund
    addNonRegACB: (amount: number) => void;       // nonRegACB += refund
    logFlow: (msg: string) => void;
}

/**
 * Règlement fiscal du mois d'avril.
 * Si nous sommes en avril (currentMonthIndex === 3) et qu'il y a un solde de
 * l'année passée, on règle. Sinon retourne 0.
 *
 * Cas spécial: si le total est négatif (remboursement), la partie venant du
 * salaire (taxPaidRevenu) est réinjectée dans nonReg comme placement.
 */
export function processAprilSettlement(
    currentMonthIndex: number,
    m: number,
    taxPreviousYear: { revenu: number; gains: number; divers: number; reer: number },
    state: AprilSettlementMutator,
): AprilSettlementResult {
    if (currentMonthIndex !== 3 || m === 0) {
        return {
            fluxImpots: 0,
            taxPaidRevenu: 0,
            taxPaidGains: 0,
            taxPaidDivers: 0,
            taxPaidREER: 0,
            newTaxPreviousYear: taxPreviousYear,
        };
    }

    const taxPaidRevenu = taxPreviousYear.revenu;
    const taxPaidGains = taxPreviousYear.gains;
    const taxPaidDivers = taxPreviousYear.divers;
    const taxPaidREER = taxPreviousYear.reer;
    const fluxImpots = taxPaidRevenu + taxPaidGains + taxPaidDivers + taxPaidREER;

    if (fluxImpots !== 0) {
        state.subtractLiquid(fluxImpots);
        if (fluxImpots < 0) {
            state.logFlow(`💸 Remboursement d'impôt: +${Math.round(Math.abs(fluxImpots)).toLocaleString('fr-CA')}$`);
            // Le remboursement de salaire (excédent retenu) est réinvesti
            if (taxPaidRevenu < 0) {
                state.addNonReg(Math.abs(taxPaidRevenu));
                state.addNonRegACB(Math.abs(taxPaidRevenu));
            }
        } else {
            state.logFlow(`🏛️ Fisc: Régularisation de ${Math.round(fluxImpots).toLocaleString()}$ payée.`);
        }
    }

    return {
        fluxImpots,
        taxPaidRevenu,
        taxPaidGains,
        taxPaidDivers,
        taxPaidREER,
        newTaxPreviousYear: { revenu: 0, gains: 0, divers: 0, reer: 0 },
    };
}

/**
 * V21 — OAS Clawback. Calculé en décembre quand retraité 65+.
 * Retourne le clawback annuel à étaler sur l'an suivant (0 si pas applicable).
 *
 * Le seuil OAS est indexé via expenseMultiplier (proxy inflation cumulée).
 */
export function computeOasClawback(
    currentMonthIndex: number,
    m: number,
    isRetired: boolean,
    age: number,
    expenseMultiplier: number,
    incomeRetirementMonthly: number,
    accRetraitsReerYear: number,
    accRentesYear: number,
    psvBasePension: number,
    simInflation: number,
): { clawbackAnnual: number; logMsg?: string } {
    if (currentMonthIndex !== 11 || m === 0 || !isRetired || age < 65) {
        return { clawbackAnnual: 0 };
    }
    const OAS_THRESHOLD = 90997 * expenseMultiplier;
    const annualPensionIncome = (incomeRetirementMonthly * 12) + accRetraitsReerYear + accRentesYear;
    const psvAnnualBase = psvBasePension * 12 * Math.pow(1 + simInflation / 100, m / 12);
    if (annualPensionIncome <= OAS_THRESHOLD) return { clawbackAnnual: 0 };

    const excess = annualPensionIncome - OAS_THRESHOLD;
    const clawback = Math.min(psvAnnualBase, excess * 0.15);
    if (clawback > 1) {
        return {
            clawbackAnnual: clawback,
            logMsg: `⚠️ PSV Clawback prévu: -${Math.round(clawback).toLocaleString('fr-CA')}$/an`,
        };
    }
    return { clawbackAnnual: clawback };
}

/**
 * V31 — Tax-Loss Harvesting actif en décembre.
 * Si le rendement Non-Reg de l'année est négatif, on vend 50% pour cristalliser
 * la perte → banque de pertes capitales (capitalLossBank) + ACB ajusté.
 *
 * Retourne {harvestedLoss, acbDelta, log}. Caller applique les mutations.
 */
export function processTaxLossHarvesting(
    currentMonthIndex: number,
    m: number,
    nonReg: number,
    nonRegACB: number,
    currentNonRegRate: number,
): { harvestedLoss: number; acbDelta: number; logMsg?: string } {
    if (currentMonthIndex !== 11 || m === 0) return { harvestedLoss: 0, acbDelta: 0 };
    if (currentNonRegRate >= 0 || nonReg <= 0) return { harvestedLoss: 0, acbDelta: 0 };

    const fakeSell = nonReg * 0.50;
    const dropRate = Math.abs(currentNonRegRate) / 100;
    const harvestedLoss = fakeSell * dropRate;

    const proportion = nonRegACB > 0 && nonReg > 0 ? Math.min(1, nonRegACB / nonReg) : 0;
    const acbDelta = -(fakeSell * proportion) + (fakeSell * (1 - dropRate));

    return {
        harvestedLoss,
        acbDelta,
        logMsg: `🛡️ Perte Cristallisée (TLH): +${Math.round(harvestedLoss).toLocaleString('fr-CA')}$ (Banque) | ACB ajusté à la baisse`,
    };
}

/**
 * V22 — Remplacement véhicule automatique (cyclique, tous les 10 ans).
 * Indépendant du conteneur VehicleReplacement[] (qui est plus granulaire).
 *
 * Retourne {cost, log} si remplacement déclenché ce mois.
 */
/**
 * V30 — Régularisation fiscale de décembre.
 * Calcule l'impôt final sur l'année écoulée :
 *  - Cas actif: paie ou rembourse selon retenue employeur vs impôt réel
 *  - Cas retraité: petit ajustement (~5% du total)
 * Plus gains en capital (palier 250k) et dividendes éligibles Non-Reg.
 *
 * Retourne le nouveau taxCurrentYear et les logs émis.
 * NE TOUCHE PAS à taxPreviousYear (caller fait le transfert).
 */
export interface DecemberContext {
    m: number;
    loopYear: number;
    isRetired: boolean;
    enableMonteCarlo: boolean;
    yearsElapsed: number;
    inflationFactor: number;
    activeUsersCount: number;
    grossMarcBaseAnnual: number;
    grossAnnaBaseAnnual: number;
    simSalaryGrowth: number;
    optimizeSourceDeductions: boolean | undefined;
    incomeRetirementMonthly: number;
    nonReg: number;
    baseNonRegRate: number;
    accRrspYear: number;
    accFhsaYear: number;
    smithInterestDeductibleYear: number;
    accRentesYear: number;
    accRetraitsReerYear: number;
    accCapitalGainsYear: number;
}

export interface DecemberHelpers {
    calculateFiscalReport: (gross: number, deductions: number, withheld: number, year: number, mc?: boolean) => any;
    getMarginalRate: (income: number, year: number) => number;
    calculateDividendTax: (annualDiv: number, marginalRate: number) => number;
}

export interface DecemberResult {
    /** Nouveau taxCurrentYear après régularisation (à passer en taxPreviousYear par le caller). */
    newTaxCurrentYear: { revenu: number; gains: number; divers: number; reer: number };
    /** Logs à émettre. */
    logs: string[];
}

export function processDecemberTaxFiling(
    currentMonthIndex: number,
    ctx: DecemberContext,
    helpers: DecemberHelpers,
    taxCurrentYearInitial: { revenu: number; gains: number; divers: number; reer: number },
): DecemberResult {
    if (currentMonthIndex !== 11 || ctx.m === 0) {
        return { newTaxCurrentYear: { ...taxCurrentYearInitial }, logs: [] };
    }
    const logs: string[] = [];
    const taxCurrent = { ...taxCurrentYearInitial };

    // ---- 1. Impôt sur revenu salarial ou retraite ----
    if (!ctx.isRetired) {
        const grossMarc = ctx.grossMarcBaseAnnual * Math.pow(1 + ctx.simSalaryGrowth / 100, ctx.yearsElapsed);
        const grossAnna = ctx.grossAnnaBaseAnnual * Math.pow(1 + ctx.simSalaryGrowth / 100, ctx.yearsElapsed);
        const totalDeductions = ctx.accRrspYear + ctx.accFhsaYear + ctx.smithInterestDeductibleYear;
        const grossMarcReal = grossMarc / ctx.inflationFactor;
        const grossAnnaReal = grossAnna / ctx.inflationFactor;
        const deductionsReal = totalDeductions / ctx.inflationFactor;

        // V31: Optimisation fiscale — déductions au salaire le plus élevé
        const deductionsMarc = grossMarcReal > grossAnnaReal ? deductionsReal : 0;
        const deductionsAnna = grossMarcReal > grossAnnaReal ? 0 : deductionsReal;

        const taxMarcReal = grossMarcReal > 0 ? helpers.calculateFiscalReport(grossMarcReal, deductionsMarc, 0, ctx.loopYear, ctx.enableMonteCarlo).totalTax : 0;
        const taxAnnaReal = grossAnnaReal > 0 ? helpers.calculateFiscalReport(grossAnnaReal, deductionsAnna, 0, ctx.loopYear, ctx.enableMonteCarlo).totalTax : 0;
        const totalAnnualTax = (taxMarcReal + taxAnnaReal) * ctx.inflationFactor;

        // V49: Retenue source (T1213 ou non)
        let taxMarcEmployer = taxMarcReal;
        let taxAnnaEmployer = taxAnnaReal;
        if (!ctx.optimizeSourceDeductions) {
            taxMarcEmployer = grossMarcReal > 0 ? helpers.calculateFiscalReport(grossMarcReal, 0, 0, ctx.loopYear, ctx.enableMonteCarlo).totalTax : 0;
            taxAnnaEmployer = grossAnnaReal > 0 ? helpers.calculateFiscalReport(grossAnnaReal, 0, 0, ctx.loopYear, ctx.enableMonteCarlo).totalTax : 0;
        }
        const totalEmployerTax = (taxMarcEmployer + taxAnnaEmployer) * ctx.inflationFactor;
        const estimatedWithholding = totalEmployerTax * 0.92;

        // V30: Override 12-month approximation
        taxCurrent.revenu = Math.max(-100000, totalAnnualTax - estimatedWithholding);
    } else {
        // Retraité: petit ajustement ~5%
        const basePensionAnnual = (ctx.incomeRetirementMonthly * 12) + ctx.accRentesYear;
        if (basePensionAnnual > 0) {
            const basePensionReal = basePensionAnnual / ctx.inflationFactor;
            const taxReal = helpers.calculateFiscalReport(basePensionReal / ctx.activeUsersCount, 0, 0, ctx.loopYear).totalTax * ctx.activeUsersCount;
            const totalTax = taxReal * ctx.inflationFactor;
            const diff = totalTax * 0.05;
            if (diff > 100) taxCurrent.revenu += diff;
        }
    }

    // ---- 2. Gains en capital accumulés (palier 250k) ----
    if (ctx.accCapitalGainsYear > 0) {
        const incomeForGains = ctx.isRetired
            ? (ctx.incomeRetirementMonthly * 12 + ctx.accRentesYear + ctx.accRetraitsReerYear)
            : (ctx.grossMarcBaseAnnual + ctx.grossAnnaBaseAnnual) * Math.pow(1 + ctx.simSalaryGrowth / 100, ctx.yearsElapsed);
        const currentMargForGains = helpers.getMarginalRate(incomeForGains / ctx.activeUsersCount, ctx.loopYear);

        // V31: Loi du Gain en Capital (palier 250k)
        const thresholdGains = 250000 * ctx.activeUsersCount;
        const taxableCapGains = ctx.accCapitalGainsYear <= thresholdGains
            ? ctx.accCapitalGainsYear * 0.50
            : (thresholdGains * 0.50) + ((ctx.accCapitalGainsYear - thresholdGains) * 0.6667);

        const tax = taxableCapGains * currentMargForGains;
        taxCurrent.gains += tax;
        if (tax > 100) logs.push(`↳ Impôt Gains Cap Accumulés: +${Math.round(tax).toLocaleString('fr-CA')}$`);
    }

    // ---- 3. Dividendes Non-Reg (30% du rendement) ----
    if (ctx.nonReg > 0) {
        const annualDiv = ctx.nonReg * (ctx.baseNonRegRate / 100) * 0.30;
        const incomeForDiv = (ctx.isRetired
            ? (ctx.incomeRetirementMonthly * 12 + ctx.accRentesYear)
            : (ctx.grossMarcBaseAnnual + ctx.grossAnnaBaseAnnual) * Math.pow(1 + ctx.simSalaryGrowth / 100, ctx.yearsElapsed)
        ) / ctx.activeUsersCount;
        const currentMarginal = helpers.getMarginalRate(incomeForDiv, ctx.loopYear);
        const divTax = helpers.calculateDividendTax(annualDiv, currentMarginal);
        if (divTax > 1) taxCurrent.gains += divTax;
    }

    return { newTaxCurrentYear: taxCurrent, logs };
}

export function processAutoVehicleReplacement(
    m: number,
    monthsSinceLast: number,
    vehicleReplacementEnabled: boolean | undefined,
    simInflation: number,
): { cost: number; resetCounter: boolean; logMsg?: string } {
    if (!vehicleReplacementEnabled || m === 0 || monthsSinceLast < 120) {
        return { cost: 0, resetCounter: false };
    }
    const vehicleCost = 35000 * Math.pow(1 + simInflation / 100, m / 12);
    return {
        cost: vehicleCost,
        resetCounter: true,
        logMsg: `🚗 Remplacement véhicule: -${Math.round(vehicleCost).toLocaleString('fr-CA')}$`,
    };
}
