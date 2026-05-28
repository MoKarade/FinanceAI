// services/projection/monthlyCalcs.ts
// Cycle 29 split: deux calculs mensuels Pure Function extraits de la boucle principale.
//
//  1. computeEffectiveExpenseInflation — inflation réelle des dépenses (CPI par
//     poste ou inflation uniforme) avec bonus santé 75+ ans.
//     V31 (Guyton-Klinger) + D2.9 (inflation différenciée).
//
//  2. computeMonthlyWithholding — provision mensuelle d'impôt salarial (T1213).
//     V49: si optimizeSourceDeductions, l'employeur réduit la retenue selon
//     les cotisations REER/CELIAPP du mois courant.

import type { FiscalReport } from '../../utils/tax';

// ──────────────────────────────────────────────────────────────────────────────
// 1. Inflation des dépenses
// ──────────────────────────────────────────────────────────────────────────────

export interface ExpenseInflationConfig {
    usePerCategoryInflation?: boolean;
    inflationHousing?: number;
    inflationFood?: number;
    inflationTransport?: number;
    inflationHealth?: number;
    inflationLeisure?: number;
    inflationOther?: number;
}

/**
 * Retourne l'inflation effective des dépenses pour le mois courant.
 * Caller: `if (!guytonKlinger_freezeInflation) expenseMultiplier *= Math.pow(1 + result/100, 1/12)`
 */
export function computeEffectiveExpenseInflation(
    age: number,
    isRetired: boolean,
    currentInflation: number,
    config: Readonly<ExpenseInflationConfig>,
): number {
    // Bonus santé progressif à partir de 75 ans (max 2.5%)
    const healthInflationBonus = (isRetired && age >= 75) ? Math.min(2.5, (age - 75) * 0.25) : 0;

    if (config.usePerCategoryInflation) {
        // Pondérations CPI 2023: Logement 30%, Alim 17%, Transport 15%, Santé 5%, Loisirs 6%, Autres 27%.
        const wHousing = 0.30, wFood = 0.17, wTransport = 0.15, wHealth = 0.05, wLeisure = 0.06, wOther = 0.27;
        const iHousing  = config.inflationHousing   ?? 4.0;
        const iFood     = config.inflationFood       ?? 3.5;
        const iTransp   = config.inflationTransport  ?? 2.5;
        const iHealthB  = (config.inflationHealth    ?? 4.5) + healthInflationBonus;
        const iLeisure  = config.inflationLeisure    ?? 1.5;
        const iOther    = config.inflationOther      ?? 2.0;
        return wHousing * iHousing + wFood * iFood + wTransport * iTransp + wHealth * iHealthB + wLeisure * iLeisure + wOther * iOther;
    }

    return currentInflation + healthInflationBonus;
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. Retenue salariale mensuelle
// ──────────────────────────────────────────────────────────────────────────────

type FiscalFn = (g: number, d: number, f: number, y: number, mc: boolean) => FiscalReport;

export interface MonthlyWithholdingCtx {
    m: number;
    loopYear: number;
    simInflation: number;
    simSalaryGrowth: number;
    grossMarcBaseAnnual: number;
    grossAnnaBaseAnnual: number;
    contribREER: number;
    contribCELIAPP: number;
    smithInterestDeductibleYear: number;
    enableMonteCarlo: boolean;
    optimizeSourceDeductions?: boolean;
}

/**
 * Retourne le delta mensuel à ajouter à taxCurrentYear.revenu (peut être 0).
 * Si optimizeSourceDeductions: déductions REER/CELIAPP/Smith réduisent la retenue employeur.
 */
export function computeMonthlyWithholding(
    ctx: Readonly<MonthlyWithholdingCtx>,
    calculateFiscalReport: FiscalFn,
): number {
    const {
        m, loopYear, simInflation, simSalaryGrowth,
        grossMarcBaseAnnual, grossAnnaBaseAnnual,
        contribREER, contribCELIAPP, smithInterestDeductibleYear,
        enableMonteCarlo, optimizeSourceDeductions,
    } = ctx;

    const yearsElapsed = Math.floor(m / 12);
    const inflationFactor = Math.pow(1 + simInflation / 100, yearsElapsed);
    // F9 (audit 2026-05-28) — même facteur de croissance salariale pour Marc et Anna : hissé une fois.
    const salaryGrowthFactor = Math.pow(1 + simSalaryGrowth / 100, yearsElapsed);
    const grossMarcReal = (grossMarcBaseAnnual * salaryGrowthFactor) / inflationFactor;
    const grossAnnaReal = (grossAnnaBaseAnnual * salaryGrowthFactor) / inflationFactor;

    let monthlyDeductionsMarc = 0;
    let monthlyDeductionsAnna = 0;

    if (optimizeSourceDeductions) {
        const totalMonthlyDeduct = (contribREER + contribCELIAPP + (smithInterestDeductibleYear / 12)) / inflationFactor;
        if (grossMarcReal > grossAnnaReal) monthlyDeductionsMarc = totalMonthlyDeduct;
        else monthlyDeductionsAnna = totalMonthlyDeduct;
    }

    const taxMarcReal = grossMarcReal > 0 ? calculateFiscalReport(grossMarcReal, monthlyDeductionsMarc, 0, loopYear, enableMonteCarlo).totalTax : 0;
    const taxAnnaReal = grossAnnaReal > 0 ? calculateFiscalReport(grossAnnaReal, monthlyDeductionsAnna, 0, loopYear, enableMonteCarlo).totalTax : 0;

    const totalAnnualTax = (taxMarcReal + taxAnnaReal) * inflationFactor;
    const estimatedWithholding = totalAnnualTax * 0.92;
    return Math.max(-5000, totalAnnualTax - estimatedWithholding) / 12;
}
