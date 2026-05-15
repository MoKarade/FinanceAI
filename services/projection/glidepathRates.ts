// services/projection/glidepathRates.ts
// Cycle 18: calcul des taux effectifs mensuels (glidepath + US drag CELI).
// Pure function: aucun side effect.

export interface BaseRates {
    celi: number;
    reer: number;
    nonReg: number;
    crypto: number;
    cash: number;
}

export interface GlidepathCtx {
    m: number;
    retirementMonthIndex: number;
    isRetired: boolean;
    simInflation: number;
    enableMonteCarlo: boolean;
    mcCeliRate: number;
    mcReerRate: number;
    mcNonRegRate: number;
    mcCryptoRate: number;
    mcCashRate: number;
    baseRates: BaseRates;
    usEquityShareCeli?: number;
    usEquityDividendYield?: number;
}

export interface GlidepathRates {
    effectiveCeliRate: number;
    effectiveReerRate: number;
    effectiveNonRegRate: number;
    activeCeliRate: number;
    activeCryptoRate: number;
    activeCashRate: number;
}

/**
 * Calcule les taux de rendement effectifs pour le mois courant.
 * Applique le glidepath (→ obligations en approche retraite) et le drag
 * fiscal US sur le CELI (retenue 15% sur dividendes US).
 */
export function computeGlidepathRates(ctx: GlidepathCtx): GlidepathRates {
    const {
        m, retirementMonthIndex, isRetired, simInflation,
        enableMonteCarlo, mcCeliRate, mcReerRate, mcNonRegRate, mcCryptoRate, mcCashRate,
        baseRates, usEquityShareCeli, usEquityDividendYield,
    } = ctx;

    const yearsToRetirement = Math.max(0, (retirementMonthIndex - m) / 12);
    const glideStartYears = 10;
    const targetGlideRate = simInflation + 1.0;

    let glideFactor = yearsToRetirement < glideStartYears ? (yearsToRetirement / glideStartYears) : 1.0;
    if (isRetired) glideFactor = Math.max(0.60, glideFactor);

    const activeCeliRate = enableMonteCarlo ? mcCeliRate : baseRates.celi;
    const activeReerRate = enableMonteCarlo ? mcReerRate : baseRates.reer;
    const activeNonRegRate = enableMonteCarlo ? mcNonRegRate : baseRates.nonReg;
    const activeCryptoRate = enableMonteCarlo ? mcCryptoRate : baseRates.crypto;
    const activeCashRate = enableMonteCarlo ? mcCashRate : baseRates.cash;

    const effectiveCeliRateRaw = activeCeliRate * glideFactor + targetGlideRate * (1 - glideFactor);
    const effectiveReerRate = activeReerRate * glideFactor + targetGlideRate * (1 - glideFactor);
    const effectiveNonRegRate = activeNonRegRate * glideFactor + targetGlideRate * (1 - glideFactor);

    // D2.7: retenue US 15% sur dividendes dans le CELI (non récupérable)
    const usShare = Math.min(1, Math.max(0, (usEquityShareCeli ?? 0) / 100));
    const usDivYield = (usEquityDividendYield ?? 1.5) / 100;
    const usCeliDrag = usShare * usDivYield * 0.15 * 100;
    const effectiveCeliRate = effectiveCeliRateRaw - usCeliDrag;

    return { effectiveCeliRate, effectiveReerRate, effectiveNonRegRate, activeCeliRate, activeCryptoRate, activeCashRate };
}
