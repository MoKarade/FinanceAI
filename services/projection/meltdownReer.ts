// services/projection/meltdownReer.ts
// Cycle 15: stratégie Meltdown REER (V64).
// Décaissement agressif du REER pour éviter la bombe fiscale à la mort.
// Pure Return: retourne null si aucune action.

import type { AllocationStrategy } from './types';
import { withholdingForGrossRRSP } from '../../utils/tax';

const MELTDOWN_NW_HIGH = 2_000_000;
const MELTDOWN_NW_MID  = 1_000_000;
const MELTDOWN_TARGET_HIGH = 220_000;
const MELTDOWN_TARGET_MID  = 140_000;
const MELTDOWN_TARGET_BASE =  90_000;

export interface MeltdownCtx {
    m: number;
    isRetired: boolean;
    simSalaryGrowth: number;
    activeUsersCount: number;
    incomeRetirement: number;
    accRetraitsReerYear: number;
    accRentesYear: number;
    grossMarcBaseAnnual: number;
    grossAnnaBaseAnnual: number;
    reer: number;
    nonReg: number;
    celi: number;
    realEstateEquity: number;
}

export interface MeltdownResult {
    reerDrawn: number;
    nonRegAdd: number;
    withholding: number;
    log: string | null;
}

/**
 * Applique la stratégie MELTDOWN_REER pour le mois courant.
 * Retourne null si la stratégie n'est pas active, si reer=0, ou si le
 * revenu imposable courant dépasse déjà la cible.
 */
export function processReerMeltdown(
    ctx: Readonly<MeltdownCtx>,
    strategy: AllocationStrategy,
): MeltdownResult | null {
    if (strategy !== 'MELTDOWN_REER' || ctx.reer <= 0) return null;

    const {
        m, isRetired, simSalaryGrowth, activeUsersCount,
        incomeRetirement, accRetraitsReerYear, accRentesYear,
        grossMarcBaseAnnual, grossAnnaBaseAnnual,
        reer, nonReg, celi, realEstateEquity,
    } = ctx;
    const yearsSinceStart = Math.floor(m / 12);

    const currentTotalGross = isRetired
        ? (incomeRetirement * 12 + accRetraitsReerYear + accRentesYear)
        : (grossMarcBaseAnnual + grossAnnaBaseAnnual) * Math.pow(1 + simSalaryGrowth / 100, yearsSinceStart);

    const totalAssets = reer + nonReg + celi + realEstateEquity;
    const isVeryHighNW = totalAssets > MELTDOWN_NW_HIGH;
    const isHighNW = totalAssets > MELTDOWN_NW_MID;

    const targetMeltGross = (isVeryHighNW ? MELTDOWN_TARGET_HIGH : isHighNW ? MELTDOWN_TARGET_MID : MELTDOWN_TARGET_BASE) * (activeUsersCount || 1);

    if (currentTotalGross >= targetMeltGross) return null;

    const meltAmountBrut = Math.min(reer, (targetMeltGross - currentTotalGross) / 12);
    if (meltAmountBrut <= 200) return null;

    // F-fix (audit 2026-06) : la retenue suit la source de vérité RRSP_WITHHOLDING_QC
    // (19/24/29 % par tranche, sur le brut mensuel — même convention que le décaissement
    // standard). Avant : 30/38 % en dur, ne correspondant à aucune tranche → impôt
    // (retenue) surévalué sur un meltdown. La réconciliation réelle reste en décembre.
    const withholding = withholdingForGrossRRSP(meltAmountBrut).withholding;
    const netMelt = meltAmountBrut - withholding;

    return {
        reerDrawn: meltAmountBrut,
        nonRegAdd: netMelt,
        withholding,
        log: m % 12 === 0
            ? `🔥 Stratégie Meltdown: Retrait de ${Math.round(meltAmountBrut * 12).toLocaleString('fr-CA')}$ pour saturer les paliers.`
            : null,
    };
}
