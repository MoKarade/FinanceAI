// services/projection/childrenReee.ts
// Cycle 14: traitement mensuel d'un enfant — dépenses enfant, RQAP, REEE,
// études et fermeture REEE.
//
// Pattern: Pure Return — la fonction retourne tous les deltas, le caller
// les applique sur ses propres variables locales.
// Injection: calculateFiscalReport passé en argument (évite dep circulaire
// avec utils/tax).

import type { ChildGoal } from '../../types';
import type { FiscalReport } from '../../utils/tax';

type FiscalReportFn = (
    grossIncome: number,
    rrspContrib: number,
    fhsaContrib: number,
    year: number,
    skipBreakdown: boolean,
) => FiscalReport;

export interface ChildProcessCtx {
    m: number;
    loopYear: number;
    simSalaryGrowth: number;
    simInflation: number;
    expenseMultiplier: number;
    isRetired: boolean;
    grossMarcBaseAnnual: number;
    grossAnnaBaseAnnual: number;
    incomeAnna: number;
    liquid: number;
    reee: number;
    householdGross: number;
    trackerScee: number;
    trackerIqee: number;
    /** Contributions REEE cumulées à vie pour CE bénéficiaire (audit §6.9 / F13).
     *  Le plafond ARC est 50 000$/enfant à vie — au-delà, plus de cotisations
     *  permises (mais la croissance continue). */
    trackerReeeContribLifetime: number;
    enableMonteCarlo: boolean;
}

export interface ChildTickResult {
    liquidDelta: number;
    monthlyExpenseDelta: number;
    monthlyIncomeDelta: number;
    newIncomeAnna: number | null;
    accGrossDelta: number;
    reeeNewBalance: number;
    taxDiversAdd: number;

    newTrackerScee: number;
    newTrackerIqee: number;
    /** Contributions REEE cumulées à vie après application du mois courant
     *  (clamped à 50 000$ par bénéficiaire). */
    newTrackerReeeContribLifetime: number;
    childId: string;

    childGrossCostAdd: number;
    childBenefitsAdd: number;
    childMonthlyCostAdd: number;
    reeeContribAdd: number;
    withdrawalLiquidAdd: number;
    withdrawalREEEAdd: number;
    reeePayoutAdd: number;
    contribREEEAdd: number;
    contribLiquidAdd: number;

    lifeEventLogs: string[];
    flowEventLogs: string[];
}

/**
 * Traite un enfant pour le mois courant.
 * @param isFirstMonth  true si m === birthOffset (événement naissance)
 * @param childAgeMonths  m − birthOffset
 */
export function processOneChild(
    child: ChildGoal,
    childIdx: number,
    isFirstMonth: boolean,
    childAgeMonths: number,
    ctx: ChildProcessCtx,
    calculateFiscalReport: FiscalReportFn,
): ChildTickResult {
    const {
        m, loopYear, simSalaryGrowth, expenseMultiplier, isRetired,
        grossAnnaBaseAnnual, incomeAnna, liquid, reee,
        householdGross, trackerScee, trackerIqee,
        trackerReeeContribLifetime, enableMonteCarlo,
    } = ctx;

    const childId = child.id || `enfant_${childIdx}`;

    let liquidDelta = 0;
    let monthlyExpenseDelta = 0;
    let monthlyIncomeDelta = 0;
    let newIncomeAnna: number | null = null;
    let accGrossDelta = 0;
    let reeeNewBalance = reee;
    let taxDiversAdd = 0;
    let newTrackerScee = trackerScee;
    let newTrackerIqee = trackerIqee;
    let newTrackerReeeContribLifetime = trackerReeeContribLifetime;
    let childGrossCostAdd = 0;
    let childBenefitsAdd = 0;
    let childMonthlyCostAdd = 0;
    let reeeContribAdd = 0;
    let withdrawalLiquidAdd = 0;
    let withdrawalREEEAdd = 0;
    let reeePayoutAdd = 0;
    let contribREEEAdd = 0;
    let contribLiquidAdd = 0;
    const lifeEventLogs: string[] = [];
    const flowEventLogs: string[] = [];

    if (isFirstMonth) {
        liquidDelta -= (child.initialCost ?? 0);
        lifeEventLogs.push(`Naissance 👶 (${child.name || 'Enfant'})`);
    }

    if (childAgeMonths < 18 * 12) {
        let cMonthly = (child.monthlyDiapers ?? 0) + (child.monthlyFood ?? 0) + (child.monthlyClothing ?? 0);

        const annaIsOnMatLeave = childAgeMonths < 12;
        if (annaIsOnMatLeave) {
            const yearsElapsed = Math.floor(m / 12);
            const annaGrossAnnual = grossAnnaBaseAnnual * Math.pow(1 + simSalaryGrowth / 100, yearsElapsed);
            const rqapCap = 98000 * expenseMultiplier;
            const eligibleSalary = Math.min(annaGrossAnnual, rqapCap);

            const rqapNetInfo = calculateFiscalReport(eligibleSalary * 0.55, 0, 0, loopYear, enableMonteCarlo);
            const rqapNetMonthly = rqapNetInfo.netIncome / 12;

            // Replace Anna's salary with RQAP in the income pool
            monthlyIncomeDelta += rqapNetMonthly - incomeAnna;
            newIncomeAnna = rqapNetMonthly;

            const annaGrossMonthly = annaGrossAnnual / 12;
            accGrossDelta -= annaGrossMonthly;

            monthlyExpenseDelta -= 350 * expenseMultiplier; // commuting savings
        }

        if (childAgeMonths < 60 && !annaIsOnMatLeave) {
            const daycareGross = (child.monthlyDaycare ?? 0) * expenseMultiplier;
            const daycareCostNet = daycareGross > 400 ? daycareGross * 0.30 : daycareGross;
            cMonthly += daycareCostNet;
        }

        const currentChildGrossCost = cMonthly * expenseMultiplier;
        monthlyExpenseDelta += currentChildGrossCost;

        let adjustedBenefits = child.governmentBenefits ?? 0;
        if (householdGross > 150000) {
            const clawbackRatio = Math.max(0, 1 - ((householdGross - 150000) / 100000));
            adjustedBenefits *= clawbackRatio;
        }
        monthlyIncomeDelta += adjustedBenefits;
        childGrossCostAdd += currentChildGrossCost;
        childBenefitsAdd += adjustedBenefits;
        childMonthlyCostAdd += currentChildGrossCost;

        // REEE contributions with SCEE/IQEE catch-up
        const childAgeYears = Math.floor(childAgeMonths / 12) + 1;
        const maxTheoreticalScee = Math.min(7200, childAgeYears * 500);

        let optimalReeeMonthly = 2500 / 12;
        let sceeYearlyLimit = 500;
        let iqeeYearlyLimit = 250;

        if (newTrackerScee < maxTheoreticalScee) {
            optimalReeeMonthly = 5000 / 12;
            sceeYearlyLimit = 1000;
            iqeeYearlyLimit = 500;
        }

        // Audit §6.9 / F13: plafond REEE lifetime 50 000$/bénéficiaire (ARC).
        // Si on s'approche du plafond, on plafonne la cotisation du mois courant.
        // Au-delà du plafond → 0 cotisation (la croissance du REEE continue,
        // mais aucune nouvelle contribution n'est permise).
        const REEE_LIFETIME_LIMIT_PER_BENEFICIARY = 50000;
        const lifetimeContribRoomLeft = Math.max(0, REEE_LIFETIME_LIMIT_PER_BENEFICIARY - newTrackerReeeContribLifetime);
        if (optimalReeeMonthly > lifetimeContribRoomLeft) {
            optimalReeeMonthly = lifetimeContribRoomLeft;
        }

        // Check against effective liquid (after birth cost if first month)
        if (optimalReeeMonthly > 0 && liquid + liquidDelta >= optimalReeeMonthly && !isRetired) {
            liquidDelta -= optimalReeeMonthly;
            withdrawalLiquidAdd += optimalReeeMonthly;
            reeeContribAdd += Math.round(optimalReeeMonthly);
            // Audit §6.9: tracker mis à jour pour bloquer les futurs mois
            newTrackerReeeContribLifetime += optimalReeeMonthly;

            const sceeGrant = Math.min(optimalReeeMonthly * 0.20, sceeYearlyLimit / 12, 7200 - newTrackerScee);
            newTrackerScee += Math.max(0, sceeGrant);

            const iqeeGrant = Math.min(optimalReeeMonthly * 0.10, iqeeYearlyLimit / 12, 3600 - newTrackerIqee);
            newTrackerIqee += Math.max(0, iqeeGrant);

            const totalGrant = Math.max(0, sceeGrant) + Math.max(0, iqeeGrant);
            reeeNewBalance = reee + optimalReeeMonthly + totalGrant;
            contribREEEAdd += optimalReeeMonthly + totalGrant;
        }
    }

    if (childAgeMonths >= 18 * 12 && childAgeMonths < 25 * 12) {
        const studiesMonthly = (20000 / 12) * expenseMultiplier;
        monthlyExpenseDelta += studiesMonthly;
        childGrossCostAdd += studiesMonthly;
        childMonthlyCostAdd += studiesMonthly;

        if (reeeNewBalance >= studiesMonthly) {
            reeeNewBalance -= studiesMonthly;
            withdrawalREEEAdd += studiesMonthly;
            monthlyIncomeDelta += studiesMonthly;
            reeePayoutAdd += studiesMonthly;
            contribLiquidAdd += studiesMonthly;
        } else if (reeeNewBalance > 0) {
            const remaining = reeeNewBalance;
            monthlyIncomeDelta += remaining;
            reeePayoutAdd += remaining;
            withdrawalREEEAdd += remaining;
            contribLiquidAdd += remaining;
            reeeNewBalance = 0;
        }
    }

    if (childAgeMonths === 25 * 12 && reeeNewBalance > 0) {
        liquidDelta += reeeNewBalance;
        taxDiversAdd += reeeNewBalance * 0.20;
        flowEventLogs.push(`🎓 Fermeture REEE (${child.name || 'Enfant 25 ans'}): +${Math.round(reeeNewBalance).toLocaleString('fr-CA')}$ → Liquidités`);
        reeeNewBalance = 0;
    }

    return {
        liquidDelta,
        monthlyExpenseDelta,
        monthlyIncomeDelta,
        newIncomeAnna,
        accGrossDelta,
        reeeNewBalance,
        taxDiversAdd,
        newTrackerScee,
        newTrackerIqee,
        newTrackerReeeContribLifetime,
        childId,
        childGrossCostAdd,
        childBenefitsAdd,
        childMonthlyCostAdd,
        reeeContribAdd,
        withdrawalLiquidAdd,
        withdrawalREEEAdd,
        reeePayoutAdd,
        contribREEEAdd,
        contribLiquidAdd,
        lifeEventLogs,
        flowEventLogs,
    };
}
