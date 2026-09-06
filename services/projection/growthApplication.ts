// services/projection/growthApplication.ts
// Cycle 24: extraction du bloc de croissance mensuelle (~20 lignes).
// 7 appels à applyMidMonthGrowth pour CELI, CELIAPP, REER, NonReg, Crypto, Liquide, REEE.
// Pattern: Pure Function — pas de mutation du caller.

import { applyMidMonthGrowth } from './helpers';

export interface GrowthInputs {
    prevCELI: number; celi: number; effectiveCeliRate: number;
    celiapp: number; activeCeliRate: number;
    prevREER: number; reer: number; effectiveReerRate: number;
    nonReg: number; contribNonReg: number; effectiveNonRegRate: number;
    // [ENG-MELTDOWN-MIMOIS] Jambe d'ARRIVÉE du meltdown REER→NonReg, à exclure de la base de
    // croissance du mois plein EXACTEMENT comme les cotisations ordinaires (décision Marc
    // 2026-09-04 : l'argent arrivé en cours de mois ne touche qu'un demi-mois de rendement).
    // Registre SÉPARÉ de `contribNonReg` — les deux n'ont pas les mêmes lecteurs d'affichage
    // (`NetTransferNonReg` le publie déjà) ; seul ce calcul-ci les traite pareil.
    // Optionnel à défaut neutre : tout appelant existant reste bit-identique.
    arriveeMeltdownNonReg?: number;
    crypto: number; activeCryptoRate: number;
    prevLiquid: number; liquid: number; activeCashRate: number;
    reee: number; contribREEE: number;
}

interface AssetGrowth {
    newVal: number;
    growth: number;
    pct: number;
}

interface GrowthResult {
    celi: AssetGrowth;
    celiapp: AssetGrowth;
    reer: AssetGrowth;
    nonReg: AssetGrowth;
    crypto: AssetGrowth;
    liquid: AssetGrowth;
    reee: AssetGrowth;
    totalGrowth: number;
}

/**
 * Applique la croissance mensuelle sur les 7 classes d'actifs.
 * MER appliqué sur CELI/CELIAPP/REER/NonReg/REEE (placements gérés).
 * Pas de MER sur Crypto/Liquide (auto-géré ou compte courant).
 *
 * NonReg utilise (nonReg - contribNonReg - arriveeMeltdownNonReg) comme prev pour
 * exclure du calcul de croissance les entrées du mois courant — cotisations ordinaires
 * ET arrivée du meltdown (même règle depuis [ENG-MELTDOWN-MIMOIS], décision Marc 2026-09-04).
 * Idem REEE avec contribREEE.
 */
export function applyMonthlyGrowth(inputs: Readonly<GrowthInputs>): GrowthResult {
    const celi = applyMidMonthGrowth(inputs.prevCELI, inputs.celi, inputs.effectiveCeliRate, true);
    const celiapp = applyMidMonthGrowth(inputs.celiapp, inputs.celiapp, inputs.activeCeliRate, true);
    const reer = applyMidMonthGrowth(inputs.prevREER, inputs.reer, inputs.effectiveReerRate, true);
    const nonReg = applyMidMonthGrowth(inputs.nonReg - inputs.contribNonReg - (inputs.arriveeMeltdownNonReg ?? 0), inputs.nonReg, inputs.effectiveNonRegRate, true);
    const crypto = applyMidMonthGrowth(inputs.crypto, inputs.crypto, inputs.activeCryptoRate, false);
    const liquid = applyMidMonthGrowth(inputs.prevLiquid, inputs.liquid, inputs.activeCashRate, false);
    const reee = applyMidMonthGrowth(inputs.reee - inputs.contribREEE, inputs.reee, inputs.activeCashRate, true);

    return {
        celi: { newVal: celi.newVal, growth: celi.growth, pct: celi.pct },
        celiapp: { newVal: celiapp.newVal, growth: celiapp.growth, pct: celiapp.pct },
        reer: { newVal: reer.newVal, growth: reer.growth, pct: reer.pct },
        nonReg: { newVal: nonReg.newVal, growth: nonReg.growth, pct: nonReg.pct },
        crypto: { newVal: crypto.newVal, growth: crypto.growth, pct: crypto.pct },
        liquid: { newVal: liquid.newVal, growth: liquid.growth, pct: liquid.pct },
        reee: { newVal: reee.newVal, growth: reee.growth, pct: reee.pct },
        totalGrowth: celi.growth + reer.growth + nonReg.growth + crypto.growth + liquid.growth + celiapp.growth + reee.growth,
    };
}
