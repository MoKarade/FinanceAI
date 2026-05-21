// services/projection/monthlyOutput.ts
// Cycle 21: assemblage du point de données mensuel (data.push) — ~100 lignes.
// Inclut: calcul CoastFIRE + BaristaFIRE, puis formatage complet du
// ProjectionChartPoint (mode déterministe) ou point minimal (mode MC).
//
// Pattern: Pure Function — reçoit un contexte immuable, retourne le point.

import type { ProjectionChartPoint } from './types';

type TaxBucket = { revenu: number; gains: number; reer: number; divers: number };

export interface MonthlyOutputCtx {
    m: number;
    retirementMonthIndex: number;
    fireTargetNetWorth: number;
    futureFireTarget: number;
    simInflation: number;
    expenseMultiplier: number;
    effectiveBaseExpenses: number;
    enableMonteCarlo: boolean;
    rawNetWorth: number;
    // Labels
    currentLoopDate: Date;
    loopYear: number;
    age: number;
    isRetired: boolean;
    // Revenus / dépenses
    incomeMarc: number;
    incomeAnna: number;
    incomeRetirement: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    // Enfants
    childMonthlyCost: number;
    childGrossCost: number;
    childBenefits: number;
    reeeContribMonthly: number;
    reeePayoutMonthly: number;
    // Phase 3 Tier 2 — REEE cumulés ménage
    reeeContribCum: number;
    reeeGrantsCum: number;
    // Phase 3 Tier 3 — dividendes mensuels + revenus de placement imposables
    dividendIncome: number;
    taxableInvIncome: number;
    // Phase 3 Tier 3 — taux d'imposition (par adulte)
    marginalTaxRate: number;
    effectiveTaxRate: number;
    // Phase 3 Tier 3 — split pensions retraite
    pensionRRQ: number;
    pensionPSV: number;
    pensionPrivee: number;
    // Immobilier
    immoHypo: number;
    immoCharges: number;
    immoInterest: number;
    immoPrincipal: number;
    totalRentalIncome: number;
    // Actifs
    liquid: number;
    celi: number;
    celiapp: number;
    reer: number;
    reee: number;
    nonReg: number;
    crypto: number;
    // Retraits et espaces
    retraitReerMois: number;
    retraitCeliMois: number;
    celiRoom: number;
    rrspRoom: number;
    // Immobilier / dettes
    rapRepaymentDueTotal: number;
    realEstateEquity: number;
    mortgageBalance: number;
    activeDebtsTotal: number;
    // Valeurs précédentes (diff)
    prevNW: number;
    prevCELI: number;
    prevREER: number;
    prevLiquid: number;
    // Impôts affichage
    impotLatent: number;
    fluxImpots: number;
    impotReerMois: number;
    impotSalaireMois: number;
    impotGainsMois: number;
    impotDiversMois: number;
    taxPaidRevenu: number;
    taxPaidGains: number;
    taxPaidDivers: number;
    taxPaidREER: number;
    taxOnRrif: number;
    // Contributions / retraits suivi mensuel
    contribCELI: number;
    withdrawalCELI: number;
    contribREER: number;
    withdrawalREER: number;
    contribNonReg: number;
    withdrawalNonReg: number;
    contribCrypto: number;
    withdrawalCrypto: number;
    contribLiquid: number;
    withdrawalLiquid: number;
    contribCELIAPP: number;
    withdrawalCELIAPP: number;
    contribREEE: number;
    withdrawalREEE: number;
    // Croissance marché
    growthCELI: number;
    growthREER: number;
    growthNonReg: number;
    growthCrypto: number;
    growthLiquid: number;
    growthCELIAPP: number;
    growthREEE: number;
    growthPctCELI: number;
    growthPctREER: number;
    growthPctNonReg: number;
    growthPctCrypto: number;
    growthPctLiquid: number;
    growthPctCELIAPP: number;
    growthPctREEE: number;
    // Fiscalité cumulée
    taxCurrentYear: TaxBucket;
    taxPreviousYear: TaxBucket;
    // Événements
    lifeEventsLog: string[];
    flowEventsLog: string[];
}

/**
 * Assemble le point de données mensuel pour data.push().
 * En mode MC, retourne { NetWorth, monthIndex } seulement.
 * En mode déterministe, calcule CoastFIRE / BaristaFIRE et retourne
 * le ProjectionChartPoint complet (~50 champs).
 */
export function buildMonthlyDataPoint(ctx: MonthlyOutputCtx): ProjectionChartPoint {
    const { m, retirementMonthIndex, fireTargetNetWorth, futureFireTarget,
        simInflation, expenseMultiplier, effectiveBaseExpenses,
        enableMonteCarlo, rawNetWorth } = ctx;

    if (enableMonteCarlo) {
        return { NetWorth: Number(rawNetWorth.toFixed(2)), monthIndex: m };
    }

    const coastFireNominal = m >= retirementMonthIndex
        ? futureFireTarget
        : (fireTargetNetWorth / Math.pow(1 + 0.05 / 12, Math.max(0, retirementMonthIndex - m))) * expenseMultiplier;

    const baristaTargetFuture = Math.max(0, effectiveBaseExpenses - 1500) * 12 * 25 * expenseMultiplier;

    const {
        currentLoopDate, loopYear, age, isRetired,
        incomeMarc, incomeAnna, incomeRetirement, monthlyIncome, monthlyExpenses,
        childMonthlyCost, childGrossCost, childBenefits,
        reeeContribMonthly, reeePayoutMonthly,
        reeeContribCum, reeeGrantsCum,
        dividendIncome, taxableInvIncome,
        marginalTaxRate, effectiveTaxRate,
        pensionRRQ, pensionPSV, pensionPrivee,
        immoHypo, immoCharges, immoInterest, immoPrincipal, totalRentalIncome,
        liquid, celi, celiapp, reer, reee, nonReg, crypto,
        retraitReerMois, retraitCeliMois, celiRoom, rrspRoom,
        rapRepaymentDueTotal, realEstateEquity, mortgageBalance, activeDebtsTotal,
        prevNW, prevCELI, prevREER, prevLiquid,
        impotLatent, fluxImpots, impotReerMois, impotSalaireMois, impotGainsMois, impotDiversMois,
        taxPaidRevenu, taxPaidGains, taxPaidDivers, taxPaidREER, taxOnRrif,
        contribCELI, withdrawalCELI, contribREER, withdrawalREER,
        contribNonReg, withdrawalNonReg, contribCrypto, withdrawalCrypto,
        contribLiquid, withdrawalLiquid, contribCELIAPP, withdrawalCELIAPP,
        contribREEE, withdrawalREEE,
        growthCELI, growthREER, growthNonReg, growthCrypto, growthLiquid, growthCELIAPP, growthREEE,
        growthPctCELI, growthPctREER, growthPctNonReg, growthPctCrypto, growthPctLiquid, growthPctCELIAPP, growthPctREEE,
        taxCurrentYear, taxPreviousYear,
        lifeEventsLog, flowEventsLog,
    } = ctx;

    return {
        lifeEvents: lifeEventsLog,
        flowEvents: flowEventsLog,
        monthIndex: m,
        dateLabel: `${currentLoopDate.toLocaleString('fr-CA', { month: 'short' })} ${loopYear}`,
        year: loopYear,
        age,
        IncomeMarc: Number(incomeMarc.toFixed(2)),
        IncomeAnna: Number(incomeAnna.toFixed(2)),
        IncomeRetirement: Number(incomeRetirement.toFixed(2)),
        Income: Number(monthlyIncome.toFixed(2)),
        Expenses: Number(monthlyExpenses.toFixed(2)),
        childCost: Number(childMonthlyCost.toFixed(2)),
        childGross: Number(childGrossCost.toFixed(2)),
        childBenefits: Number(childBenefits.toFixed(2)),
        ReeeContrib: Number(reeeContribMonthly.toFixed(2)),
        ReeePayout: Number(reeePayoutMonthly.toFixed(2)),
        // Phase 3 Tier 2 — cumul REEE pour ChildPlanning respProjection
        reeeContribCum: Number(reeeContribCum.toFixed(2)),
        reeeGrantsCum: Number(reeeGrantsCum.toFixed(2)),
        // Phase 3 Tier 3 — dividendes et revenus de placement imposables
        DividendIncome: Number(dividendIncome.toFixed(2)),
        TaxableInvIncome: Number(taxableInvIncome.toFixed(2)),
        marginalTaxRate: Number(marginalTaxRate.toFixed(2)),
        effectiveTaxRate: Number(effectiveTaxRate.toFixed(2)),
        pensionRRQ: Number(pensionRRQ.toFixed(2)),
        pensionPSV: Number(pensionPSV.toFixed(2)),
        pensionPrivee: Number(pensionPrivee.toFixed(2)),
        ImmoHypo: Number(immoHypo.toFixed(2)),
        ImmoCharges: Number(immoCharges.toFixed(2)),
        ImmoInterest: Number(immoInterest.toFixed(2)),
        ImmoPrincipal: Number(immoPrincipal.toFixed(2)),
        RentalIncome: Number(totalRentalIncome.toFixed(2)),
        Savings: Number((monthlyIncome - monthlyExpenses).toFixed(2)),
        NetSalary: Number(monthlyIncome.toFixed(2)),
        Liquidites: Number(liquid.toFixed(2)),
        CELI: Number(celi.toFixed(2)),
        RetraitREER: Number(retraitReerMois.toFixed(2)),
        RetraitCELI: Number(retraitCeliMois.toFixed(2)),
        CELIMax: Number((celiRoom + celi).toFixed(2)),
        CELIAPP: Number(celiapp.toFixed(2)),
        REER: Number(reer.toFixed(2)),
        REERMax: Number((rrspRoom + reer).toFixed(2)),
        REEE: Number(reee.toFixed(2)),
        NonReg: Number(nonReg.toFixed(2)),
        Crypto: Number(crypto.toFixed(2)),
        rapBalance: Number(rapRepaymentDueTotal.toFixed(2)),
        Immobilier: Number(realEstateEquity.toFixed(2)),
        DetteTotale: Number((mortgageBalance + activeDebtsTotal).toFixed(2)),
        NetWorth: Number(rawNetWorth.toFixed(2)),
        // Centralisation Phase 3 Tier 1 — champs dérivés simples
        realNetWorth: Number((rawNetWorth / Math.max(1e-9, expenseMultiplier)).toFixed(2)),
        liquidityRunway: monthlyExpenses > 0 ? Number((liquid / monthlyExpenses).toFixed(1)) : 0,
        // Estimation linéaire : balance / paiement mensuel (approximation
        // raisonnable pour amortissement classique sans changement de taux).
        // Pour une valeur exacte avec capitalisation, voir mortgageBlendedRate
        // (Phase 3 ultérieure).
        mortgageRemainingMonths: immoHypo > 0 && mortgageBalance > 0
            ? Math.ceil(mortgageBalance / immoHypo)
            : 0,
        diffNW: Number((rawNetWorth - prevNW).toFixed(2)),
        diffCELI: Number((celi - prevCELI).toFixed(2)),
        diffREER: Number((reer - prevREER).toFixed(2)),
        diffLiquid: Number((liquid - prevLiquid).toFixed(2)),
        ImpotLatent: Number(impotLatent.toFixed(2)),
        FluxImpots: Number(fluxImpots.toFixed(2)),
        ImpotRetraitREER: Number(impotReerMois.toFixed(2)),
        ImpotSalaireMois: Number(impotSalaireMois.toFixed(2)),
        ImpotGainsCap: Number(impotGainsMois.toFixed(2)),
        ImpotDivers: Number(impotDiversMois.toFixed(2)),
        TaxPaidRevenu: Number(taxPaidRevenu.toFixed(2)),
        TaxPaidGains: Number(taxPaidGains.toFixed(2)),
        TaxPaidDivers: Number(taxPaidDivers.toFixed(2)),
        TaxPaidREER: Number(taxPaidREER.toFixed(2)),
        WithheldTaxRrif: Number((taxOnRrif || 0).toFixed(2)),
        FireTarget: Number(futureFireTarget.toFixed(2)),
        CoastFIRE: Number(coastFireNominal.toFixed(2)),
        BaristaFIRE: Number(baristaTargetFuture.toFixed(2)),
        isRetired,
        ContribCELI: Number(contribCELI.toFixed(2)),
        ContribREER: Number(contribREER.toFixed(2)),
        ContribNonReg: Number(contribNonReg.toFixed(2)),
        MarketGrowthCELI: Number(growthCELI.toFixed(2)),
        MarketGrowthREER: Number(growthREER.toFixed(2)),
        MarketGrowthNonReg: Number(growthNonReg.toFixed(2)),
        MarketGrowthCrypto: Number(growthCrypto.toFixed(2)),
        MarketGrowthLiquid: Number(growthLiquid.toFixed(2)),
        MarketGrowthCELIAPP: Number(growthCELIAPP.toFixed(2)),
        MarketGrowthREEE: Number(growthREEE.toFixed(2)),
        MarketGrowthPctCELI: Number(growthPctCELI.toFixed(2)),
        MarketGrowthPctREER: Number(growthPctREER.toFixed(2)),
        MarketGrowthPctNonReg: Number(growthPctNonReg.toFixed(2)),
        MarketGrowthPctCrypto: Number(growthPctCrypto.toFixed(2)),
        MarketGrowthPctLiquid: Number(growthPctLiquid.toFixed(2)),
        MarketGrowthPctCELIAPP: Number(growthPctCELIAPP.toFixed(2)),
        MarketGrowthPctREEE: Number(growthPctREEE.toFixed(2)),
        NetTransferCELI: Number((contribCELI - withdrawalCELI).toFixed(2)),
        NetTransferREER: Number((contribREER - withdrawalREER).toFixed(2)),
        NetTransferNonReg: Number((contribNonReg - withdrawalNonReg).toFixed(2)),
        NetTransferCrypto: Number((contribCrypto - withdrawalCrypto).toFixed(2)),
        NetTransferLiquid: Number((contribLiquid - withdrawalLiquid).toFixed(2)),
        NetTransferCELIAPP: Number((contribCELIAPP - withdrawalCELIAPP).toFixed(2)),
        NetTransferREEE: Number((contribREEE - withdrawalREEE).toFixed(2)),
        ExpenseInflationImpact: Number((monthlyExpenses * (simInflation / 100 / 12)).toFixed(2)),
        ExpenseInflationPct: Number((simInflation / 12).toFixed(2)),
        AccruedTaxRevenu: Number((taxCurrentYear.revenu + taxPreviousYear.revenu).toFixed(2)),
        AccruedTaxGains: Number((taxCurrentYear.gains + taxPreviousYear.gains).toFixed(2)),
        AccruedTaxDivers: Number((taxCurrentYear.divers + taxPreviousYear.divers).toFixed(2)),
        AccruedTaxREER: Number((taxCurrentYear.reer + taxPreviousYear.reer).toFixed(2)),
    };
}
