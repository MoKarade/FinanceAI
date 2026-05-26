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
import {
    DAYCARE_INFO, SCHOOL_INFO, ACTIVITIES_INFO, UNI_INFO, CAR_INFO,
    type DaycareType, type SchoolType, type ActivitiesLevel,
    type UniversityType, type CarGift,
} from './childCosts';

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

    // Résolution des choix UI (defaults alignés avec ChildPlanning.tsx)
    const daycareType: DaycareType = (child.daycareType as DaycareType) || 'cpe';
    const schoolType: SchoolType = (child.schoolType as SchoolType) || 'publique';
    const activitiesLevel: ActivitiesLevel = (child.activitiesLevel as ActivitiesLevel) || 'legeres';
    const universityType: UniversityType = (child.universityType as UniversityType) || 'uni_local';
    const carGift: CarGift = (child.carGift as CarGift) || 'non';
    const daycareMonthlyUI = DAYCARE_INFO[daycareType].monthly;
    const schoolYearly = SCHOOL_INFO[schoolType].yearlyExtra;
    const activitiesYearly = ACTIVITIES_INFO[activitiesLevel].yearlyExtra;
    const uni = UNI_INFO[universityType];
    const carCost = CAR_INFO[carGift].cost;
    const parentAtHome = daycareType === 'parent_foyer';
    const childAgeYears = Math.floor(childAgeMonths / 12);

    if (isFirstMonth) {
        liquidDelta -= (child.initialCost ?? 0);
        lifeEventLogs.push(`Naissance 👶 (${child.name || 'Enfant'})`);
    }

    if (childAgeMonths < 18 * 12) {
        // Mêmes tranches que ChildPlanning.tsx — voir services/projection/childCosts.ts.
        // On reconstruit ici les flux mensuels pour conserver l'intégration mois-à-mois
        // (RQAP, allocations, REEE) qui suit son propre cadencement.
        const diapers = child.monthlyDiapers ?? 0;
        const food = child.monthlyFood ?? 0;
        const clothing = child.monthlyClothing ?? 0;

        let cMonthly = 0; // dépenses essentielles mensuelles
        let careMonthly = 0; // garderie / école / activités, en mensuel

        if (childAgeYears === 0) {
            cMonthly = diapers + food + clothing;
            careMonthly = parentAtHome ? 0 : daycareMonthlyUI;
        } else if (childAgeYears >= 1 && childAgeYears <= 4) {
            cMonthly = diapers * 0.5 + food + clothing + 50;
            careMonthly = parentAtHome ? 0 : daycareMonthlyUI;
        } else if (childAgeYears >= 5 && childAgeYears <= 11) {
            cMonthly = food + clothing + 80;
            careMonthly = (schoolYearly + activitiesYearly) / 12;
        } else if (childAgeYears >= 12 && childAgeYears <= 17) {
            cMonthly = food * 1.2 + clothing * 1.5 + 150;
            careMonthly = (schoolYearly + activitiesYearly) / 12;
            // Achat 16 ans amorti sur l'année (500$/an = ~41.67$/mois cette année-là)
            if (childAgeYears === 16) cMonthly += 500 / 12;
        }

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
            // Pendant le congé parental : pas de frais garderie
            careMonthly = 0;
        }

        // Frais garderie nets après crédit d'impôt fédéral 30% au-delà de 400$/mois
        // Compatible avec la logique historique (CPE déjà subventionné → < 400$
        //  → pas de crédit ; garderie privée 1400$ → ~30% remboursés).
        if (careMonthly > 400) {
            careMonthly = careMonthly * 0.30;
        }

        // Total mensuel = essentiel + garderie/école/activités, indexé inflation
        const currentChildGrossCost = (cMonthly + careMonthly) * expenseMultiplier;
        monthlyExpenseDelta += currentChildGrossCost;

        let adjustedBenefits = child.governmentBenefits ?? 0;
        // Ados 12-17 ans : réduction allocation (cohérence ChildPlanning)
        if (childAgeYears >= 12 && childAgeYears <= 17) {
            adjustedBenefits = Math.max(0, adjustedBenefits - 100);
        }
        if (householdGross > 150000) {
            const clawbackRatio = Math.max(0, 1 - ((householdGross - 150000) / 100000));
            adjustedBenefits *= clawbackRatio;
        }
        monthlyIncomeDelta += adjustedBenefits;
        childGrossCostAdd += currentChildGrossCost;
        childBenefitsAdd += adjustedBenefits;
        childMonthlyCostAdd += currentChildGrossCost;

        // REEE contributions with SCEE/IQEE catch-up
        // +1 car SCEE calcule sur l'année civile EN COURS, pas l'âge révolu
        const childAgeYearsForGrant = childAgeYears + 1;
        const maxTheoreticalScee = Math.min(7200, childAgeYearsForGrant * 500);

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

    // Achat voiture cadeau à 18 ans (premier mois de la 18e année)
    if (childAgeMonths === 18 * 12 && carCost > 0) {
        const carInflated = carCost * expenseMultiplier;
        liquidDelta -= carInflated;
        lifeEventLogs.push(`🚗 Cadeau voiture pour ${child.name || 'l\'enfant'} (18 ans) : -${Math.round(carInflated).toLocaleString('fr-CA')} $`);
        childGrossCostAdd += carInflated;
        childMonthlyCostAdd += carInflated;
    }

    // Études post-secondaires : durée et coût annuel selon universityType
    // (uni_local 5k$/an × 4 ans, uni_etranger 35k$/an × 4 ans, etc.).
    // Avant : 20 000$/an fixe sur 18-25 — ignorait totalement le choix UI.
    const uniStartMonths = 18 * 12;
    const uniEndMonths = uniStartMonths + uni.years * 12;
    if (uni.years > 0 && childAgeMonths >= uniStartMonths && childAgeMonths < uniEndMonths) {
        const studiesMonthly = (uni.yearlyCost / 12) * expenseMultiplier;
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
        flowEventLogs.push(`🎓 Fermeture du REEE (régime d'épargne-études) de ${child.name || 'l\'enfant'} : +${Math.round(reeeNewBalance).toLocaleString('fr-CA')} $ versés dans tes liquidités`);
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
