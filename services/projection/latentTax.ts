// services/projection/latentTax.ts
// Cycle 17: calcul de l'impôt latent (V40) — dette fiscale hypothétique si
// tous les actifs imposables étaient liquidés aujourd'hui.
// Valeur d'affichage uniquement (impotLatent dans data.push).
// Pattern: Pure Function + injection calculateFiscalReport.

import { CAPITAL_GAINS_INCLUSION_STANDARD, type FiscalReport } from '../../utils/tax';

type FiscalFn = (
    grossIncome: number,
    rrspContrib: number,
    fhsaContrib: number,
    year: number,
    skipBreakdown: boolean,
    ageOpts?: undefined,
    employmentIncome?: number,
    realDeflator?: number,
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
    cryptoACB: number;
    /** FISC-LATENT-RE — gain latent BRUT des immeubles LOCATIFS non vendus (RP exclue), Σ max(0, valeur−ACB). */
    realEstateLatentGain: number;
    enableMonteCarlo: boolean;
}

/**
 * Retourne l'impôt latent estimé (négatif = obligation fiscale future).
 * Méthode: compare la facture fiscale à taux courant vs liquidation totale.
 */
export function computeLatentTax(
    ctx: Readonly<LatentTaxCtx>,
    calculateFiscalReport: FiscalFn,
): number {
    const {
        m, loopYear, simInflation, simSalaryGrowth, isRetired, activeUsersCount,
        grossMarcBaseAnnual, grossAnnaBaseAnnual, accRentesYear, incomeRetirement,
        reer, nonReg, nonRegACB, crypto, cryptoACB, realEstateLatentGain, enableMonteCarlo,
    } = ctx;

    const yearsElapsed = Math.floor(m / 12);
    const inflationFactor = Math.pow(1 + simInflation / 100, yearsElapsed);

    const currentGrossBase = !isRetired
        ? (grossMarcBaseAnnual + grossAnnaBaseAnnual) * Math.pow(1 + simSalaryGrowth / 100, yearsElapsed)
        : (accRentesYear + incomeRetirement * 12);

    // [FISC-BRACKET-REALINDEX] revenu déflaté en $ RÉELS → le barème doit suivre (realDeflator),
    // sinon paliers ×1,02^Δ nominaux sur revenu réel = double indexation (latent sous-évalué ~35 % à 30 ans).
    const currentGrossPerUser = (currentGrossBase / activeUsersCount) / inflationFactor;
    const baseTaxAmount = calculateFiscalReport(currentGrossPerUser, 0, 0, loopYear, enableMonteCarlo,
        undefined, undefined, inflationFactor).totalTax
        * activeUsersCount * inflationFactor;

    const latentCapitalGain = Math.max(0, nonReg - nonRegACB);
    const taxableLatentGain = latentCapitalGain * CAPITAL_GAINS_INCLUSION_STANDARD;

    // M-4 : seul le GAIN crypto (valeur − coût de base) est imposable, pas la valeur entière.
    const taxableCryptoLatent = Math.max(0, crypto - cryptoACB) * CAPITAL_GAINS_INCLUSION_STANDARD;
    // FISC-LATENT-RE : gain latent des immeubles LOCATIFS (déjà brut Σmax(0,…) à la source ; garde NaN globale).
    const taxableRealEstateLatent = Math.max(0, realEstateLatentGain) * CAPITAL_GAINS_INCLUSION_STANDARD;
    const totalTaxableLatent = reer + taxableCryptoLatent + taxableLatentGain + taxableRealEstateLatent;
    const totalLatentPerUser = ((currentGrossBase + totalTaxableLatent) / activeUsersCount) / inflationFactor;
    const fullLiquidationTax = calculateFiscalReport(totalLatentPerUser, 0, 0, loopYear, enableMonteCarlo,
        undefined, undefined, inflationFactor).totalTax
        * activeUsersCount * inflationFactor;

    return -(fullLiquidationTax - baseTaxAmount);
}
