// services/projection/taxDecember.ts
// Cycle 23 split (depuis taxCycle.ts): blocs fiscaux de décembre.
// Cycle 10 (computeOasClawback, processTaxLossHarvesting): décembre = mois 11.
// Cycle 11 (processDecemberTaxFiling): régularisation annuelle d'impôt.

import { OAS_CLAWBACK_THRESHOLD_2026, CAPITAL_GAINS_INCLUSION_STANDARD, type FiscalReport, type AgeCreditOptions } from '../../utils/tax';

/**
 * V31 — OAS Clawback prévu (calcul annuel en décembre).
 * S'applique uniquement aux retraités 65+ avec revenu de pension > seuil.
 * Retourne le clawback annuel prévu (à diviser par 12 par le caller).
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
    const OAS_THRESHOLD = OAS_CLAWBACK_THRESHOLD_2026 * expenseMultiplier;
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
    /** Âge courant de l'utilisateur principal — sert aux crédits §6.2 (65+ et revenu retraite). */
    age?: number;
}

export interface DecemberHelpers {
    calculateFiscalReport: (gross: number, deductions: number, withheld: number, year: number, mc?: boolean, ageOpts?: AgeCreditOptions) => FiscalReport;
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

        // §6.2 — crédits 65+ pour salarié actif 65+ (audit silent-failure FINDING 2).
        // Cas : senior qui continue à travailler après 65 ans. Sans ce passage,
        // le crédit âge fédéral + ligne 361 QC seraient silencieusement nuls.
        // Limite : on utilise ctx.age (user[0] = Marc) pour les deux conjoints.
        // Si seul Anna a 65+ et pas Marc, la prudence préfère 0 crédit (faux négatif)
        // à un crédit indu (faux positif). Marc fait foi pour la simplicité ici.
        const familyGrossReal = grossMarcReal + grossAnnaReal;
        const ageOptsActive: AgeCreditOptions | undefined = (ctx.age !== undefined && ctx.age >= 65)
            ? {
                age: ctx.age,
                eligiblePensionIncome: 0, // pas de pension admissible en mode actif
                hasSpouse: ctx.activeUsersCount > 1,
                familyIncome: familyGrossReal,
            }
            : undefined;

        const taxMarcReal = grossMarcReal > 0 ? helpers.calculateFiscalReport(grossMarcReal, deductionsMarc, 0, ctx.loopYear, ctx.enableMonteCarlo, ageOptsActive).totalTax : 0;
        const taxAnnaReal = grossAnnaReal > 0 ? helpers.calculateFiscalReport(grossAnnaReal, deductionsAnna, 0, ctx.loopYear, ctx.enableMonteCarlo, ageOptsActive).totalTax : 0;
        const totalAnnualTax = (taxMarcReal + taxAnnaReal) * ctx.inflationFactor;

        // V49: Retenue source (T1213 ou non)
        let taxMarcEmployer = taxMarcReal;
        let taxAnnaEmployer = taxAnnaReal;
        if (!ctx.optimizeSourceDeductions) {
            taxMarcEmployer = grossMarcReal > 0 ? helpers.calculateFiscalReport(grossMarcReal, 0, 0, ctx.loopYear, ctx.enableMonteCarlo, ageOptsActive).totalTax : 0;
            taxAnnaEmployer = grossAnnaReal > 0 ? helpers.calculateFiscalReport(grossAnnaReal, 0, 0, ctx.loopYear, ctx.enableMonteCarlo, ageOptsActive).totalTax : 0;
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
            const incomeIndividualReal = basePensionReal / ctx.activeUsersCount;
            // §6.2 — crédits 65+ et revenu de retraite (ARC ligne 30100/31400 + Revenu Québec ligne 361).
            // FIX audit code-reviewer MEDIUM 5 : familyIncome inclut aussi les retraits REER de l'année
            // pour ne pas surestimer le crédit ligne 361 QC.
            const reerRealForFamily = ctx.accRetraitsReerYear / ctx.inflationFactor;
            const ageOpts: AgeCreditOptions | undefined = ctx.age !== undefined
                ? {
                    age: ctx.age,
                    eligiblePensionIncome: incomeIndividualReal,
                    hasSpouse: ctx.activeUsersCount > 1,
                    familyIncome: basePensionReal + reerRealForFamily,
                }
                : undefined;
            const taxReal = helpers.calculateFiscalReport(incomeIndividualReal, 0, 0, ctx.loopYear, ctx.enableMonteCarlo, ageOpts).totalTax * ctx.activeUsersCount;
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

        // Inclusion gains capitaux: 50% uniforme (annulation 66.67% > 250k$ mars 2025).
        const taxableCapGains = ctx.accCapitalGainsYear * CAPITAL_GAINS_INCLUSION_STANDARD;

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
