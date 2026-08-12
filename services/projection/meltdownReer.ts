// services/projection/meltdownReer.ts
// Cycle 15: stratégie Meltdown REER (V64).
// Décaissement agressif du REER pour éviter la bombe fiscale à la mort.
// Pure Return: retourne null si aucune action.

import type { AllocationStrategy } from './types';
import { withholdingForGrossRRSP } from '../../utils/tax';

// [MELTDOWN-THRESHOLDS-DOC 2026-08-12] ⚠️ Ces cinq seuils sont des HEURISTIQUES DE CONCEPTION,
// PAS des constantes fiscales — aucun d'eux n'existe dans une loi ou un barème (rien à sourcer
// dans FISCAL_REFERENCE §1-8 ; ils sont déclarés dans « Limites connues », §9). Logique :
//
//   • MELTDOWN_TARGET_* = revenu BRUT annuel PAR ADULTE que la stratégie cherche à atteindre en
//     complétant avec des retraits REER. L'idée du meltdown : vider le REER pendant les années à
//     faible revenu en « remplissant » les paliers d'imposition bas/moyens, plutôt que de laisser
//     le solde entier devenir imposable d'un coup au décès (revenu réputé — la « bombe fiscale »).
//     90 k$ reste DANS le 2e palier des deux barèmes 2026 (plafonds 117 045 $ féd / 108 680 $ QC,
//     marginal combiné ≈ 39,5 % — vérifié contre FED_BRACKETS/QC_BRACKETS) ; 140 k$ et 220 k$
//     étendent le remplissage aux paliers suivants quand le patrimoine justifie de payer plus
//     d'impôt MAINTENANT pour en éviter davantage à la succession.
//   • MELTDOWN_NW_HIGH/MID = paliers de PATRIMOINE (actifs financiers + équité immo) qui modulent
//     cette agressivité : plus le patrimoine est gros, plus la bombe fiscale terminale l'est
//     aussi, plus il est rentable de saturer des paliers élevés de son vivant.
//
// Les chiffres sont des ordres de grandeur raisonnés (arrondis volontaires), pas des optima
// calculés — un vrai optimum dépendrait de l'espérance de vie, du rendement et des taux futurs.
// Les ajuster ne demande AUCUNE source fiscale, mais re-basera les scénarios qui utilisent la
// stratégie MELTDOWN_REER (chartData.RetraitREER) : le faire SCIEMMENT, avec goldens re-basés.
// La partie FISCALE du module, elle, EST sourcée : la retenue suit RRSP_WITHHOLDING_QC
// (FISCAL_REFERENCE §3, tables ARC/RQ).
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
    // [Finding projection-validator #551] `NaN <= 200 === false` : un solde REER non fini
    // passerait la garde et sortirait en chartData.RetraitREER = NaN. Rejet explicite.
    if (!Number.isFinite(meltAmountBrut) || meltAmountBrut <= 200) return null;

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
