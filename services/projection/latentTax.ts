// services/projection/latentTax.ts
// Cycle 17: calcul de l'impôt latent (V40) — dette fiscale hypothétique si
// tous les actifs imposables étaient liquidés aujourd'hui.
// Valeur d'affichage uniquement (impotLatent dans data.push).
// Pattern: Pure Function + injection calculateFiscalReport.

import { CAPITAL_GAINS_HIGH_THRESHOLD, type FiscalReport } from '../../utils/tax';

type FiscalFn = (
    grossIncome: number,
    rrspContrib: number,
    fhsaContrib: number,
    year: number,
    skipBreakdown: boolean,
) => FiscalReport;

export interface LatentTaxCtx {
    m: number;
    loopYear: number;
    simInflation: number;
    simSalaryGrowth: number;
    isRetired: boolean;
    activeUsersCount: number;
    grossMarcBaseAnnual: number;
    grossAnnaBaseAnnual: number;
    accRentesYear: number;
    incomeRetirement: number;
    reer: number;
    nonReg: number;
    nonRegACB: number;
    crypto: number;
    enableMonteCarlo: boolean;
}

/**
 * Retourne l'impôt latent estimé (négatif = obligation fiscale future).
 * Méthode: compare la facture fiscale à taux courant vs liquidation totale.
 */
export function computeLatentTax(
    ctx: LatentTaxCtx,
    calculateFiscalReport: FiscalFn,
): number {
    const {
        m, loopYear, simInflation, simSalaryGrowth, isRetired, activeUsersCount,
        grossMarcBaseAnnual, grossAnnaBaseAnnual, accRentesYear, incomeRetirement,
        reer, nonReg, nonRegACB, crypto, enableMonteCarlo,
    } = ctx;

    const yearsElapsed = Math.floor(m / 12);
    const inflationFactor = Math.pow(1 + simInflation / 100, yearsElapsed);

    const currentGrossBase = !isRetired
        ? (grossMarcBaseAnnual + grossAnnaBaseAnnual) * Math.pow(1 + simSalaryGrowth / 100, yearsElapsed)
        : (accRentesYear + incomeRetirement * 12);

    const currentGrossPerUser = (currentGrossBase / activeUsersCount) / inflationFactor;
    const baseTaxAmount = calculateFiscalReport(currentGrossPerUser, 0, 0, loopYear, enableMonteCarlo).totalTax
        * activeUsersCount * inflationFactor;

    const latentCapitalGain = Math.max(0, nonReg - nonRegACB);
    const thresholdGains = CAPITAL_GAINS_HIGH_THRESHOLD * activeUsersCount;
    const taxableLatentGain = latentCapitalGain <= thresholdGains
        ? latentCapitalGain * 0.50
        : (thresholdGains * 0.50) + ((latentCapitalGain - thresholdGains) * 0.6667);

    const totalTaxableLatent = reer + crypto * 0.5 + taxableLatentGain;
    const totalLatentPerUser = ((currentGrossBase + totalTaxableLatent) / activeUsersCount) / inflationFactor;
    const fullLiquidationTax = calculateFiscalReport(totalLatentPerUser, 0, 0, loopYear, enableMonteCarlo).totalTax
        * activeUsersCount * inflationFactor;

    return -(fullLiquidationTax - baseTaxAmount);
}
