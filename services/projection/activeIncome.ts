// services/projection/activeIncome.ts
// Cycle 15: calcul du revenu mensuel en phase active — salaire de base,
// perte d'emploi (AE 55%), invalidité LTD, bonus/RSU/side income.
//
// Pattern: Pure Return. tickJobLoss + tickLtd sont appelés en interne
// (évite de les dupliquer dans le caller).

import type { ProjectionConfig, User } from '../../types';
import { tickJobLoss, tickLtd } from './stochasticEvents';

export interface ActiveIncomeCtx {
    m: number;
    currentMonthIndex: number;
    simSalaryGrowth: number;
    enableMonteCarlo: boolean;
    rng: () => number;
    incomeMarcNetMonthly: number;
    incomeAnnaNetMonthly: number;
    survivorMode: boolean;
    grossMarcBaseAnnual: number;
    grossAnnaBaseAnnual: number;
    unemployedMonthsRemaining: number;
    ltdMonthsRemaining: number;
    ltdLogged: boolean;
}

export interface ActiveIncomeResult {
    incomeMarc: number;
    incomeAnna: number;
    monthlyIncome: number;
    accGrossAdd: number;
    newUnemployedMonths: number;
    newLtdMonths: number;
    ltdLogged: boolean;
    lifeEventLogs: string[];
}

/**
 * Calcule le revenu net mensuel du ménage en phase active.
 * Gère la croissance salariale, chômage, LTD et revenus variables.
 */
export function computeActiveIncome(
    ctx: ActiveIncomeCtx,
    proj: ProjectionConfig,
    users: User[],
): ActiveIncomeResult {
    const {
        m, currentMonthIndex, simSalaryGrowth, enableMonteCarlo, rng,
        incomeMarcNetMonthly, incomeAnnaNetMonthly, survivorMode,
        grossMarcBaseAnnual, grossAnnaBaseAnnual,
    } = ctx;
    const yearsElapsed = Math.floor(m / 12);
    const lifeEventLogs: string[] = [];

    // F9 (audit 2026-05-28) — facteur de croissance salariale identique pour les 6 usages
    // ci-dessous (même simSalaryGrowth + yearsElapsed). Hissé une fois : Math.pow est appelé
    // dans la boucle mensuelle × N mois × M sims Monte-Carlo, donc ~millions d'appels évités.
    const salaryGrowthFactor = Math.pow(1 + simSalaryGrowth / 100, yearsElapsed);

    let incomeMarc = incomeMarcNetMonthly * salaryGrowthFactor;
    let incomeAnna = survivorMode ? 0 : (incomeAnnaNetMonthly * salaryGrowthFactor);

    // Job loss (AE 55%)
    const wasUnemployed = ctx.unemployedMonthsRemaining > 0;
    const jobLossResult = tickJobLoss({ m, currentMonthIndex, enableMonteCarlo, rng }, proj, ctx.unemployedMonthsRemaining);
    if (jobLossResult.triggered) {
        lifeEventLogs.push(`💼 Perte d'emploi (durée prévue ${jobLossResult.duration} mois)`);
    }
    if (wasUnemployed || jobLossResult.triggered) {
        incomeMarc *= 0.55;
    }

    // LTD
    const wasLtd = ctx.ltdMonthsRemaining > 0;
    const ltdResult = tickLtd({ m, currentMonthIndex, enableMonteCarlo, rng }, proj, ctx.ltdMonthsRemaining, ctx.ltdLogged);
    let ltdLogged = ctx.ltdLogged;
    if (ltdResult.needsLog) {
        lifeEventLogs.push(`♿ Invalidité longue durée (${ltdResult.duration} mois)`);
        ltdLogged = true;
    } else if (ltdResult.duration > 0 && !ltdLogged) {
        lifeEventLogs.push(`♿ Invalidité longue durée (${ltdResult.duration} mois)`);
        ltdLogged = true;
    }
    if (wasLtd || ltdResult.duration > 0) {
        incomeMarc *= (proj.ltdIncomeReplacementPct ?? 60) / 100;
    }

    // marcEmploymentActive : Marc touche-t-il un revenu d'EMPLOI ce mois-ci ?
    // Faux pendant chômage (AE) ou invalidité (LTD). Hissé ici car il gate à la fois
    // le revenu variable d'emploi (bonus/RSU) ET le brut de base servant à l'espace REER.
    const marcEmploymentActive = !(wasUnemployed || jobLossResult.triggered || wasLtd || ltdResult.duration > 0);

    // Bonus + RSU + Side income (lissés mensuellement, taxés ~45% marginal).
    // §réalisme (B-AUDIT-1) — bonus et RSU sont du revenu d'EMPLOI : ils cessent
    // pendant un chômage/LTD (on a quitté l'employeur) → gated par marcEmploymentActive.
    // Le side income (travail autonome) CONTINUE et reste du « revenu gagné » (espace REER).
    const u1 = users[0];
    const u2 = users[1];
    const bonusMonthly1 = (marcEmploymentActive && u1?.bonusPctOfGross ? (grossMarcBaseAnnual * salaryGrowthFactor) * (u1.bonusPctOfGross / 100) / 12 : 0);
    const bonusMonthly2 = (!survivorMode && u2?.bonusPctOfGross ? (grossAnnaBaseAnnual * salaryGrowthFactor) * (u2.bonusPctOfGross / 100) / 12 : 0);
    const rsuMonthly1 = (marcEmploymentActive && u1?.rsuVestingPerYear && (u1.rsuYearsRemaining ?? 99) > yearsElapsed) ? u1.rsuVestingPerYear / 12 : 0;
    const rsuMonthly2 = (!survivorMode && u2?.rsuVestingPerYear && (u2.rsuYearsRemaining ?? 99) > yearsElapsed) ? u2.rsuVestingPerYear / 12 : 0;
    const sideMonthly1 = (u1?.sideIncomeAnnual || 0) / 12;
    const sideMonthly2 = survivorMode ? 0 : (u2?.sideIncomeAnnual || 0) / 12;

    incomeMarc += (bonusMonthly1 + rsuMonthly1 + sideMonthly1) * 0.55;
    incomeAnna += (bonusMonthly2 + rsuMonthly2 + sideMonthly2) * 0.55;

    const monthlyIncome = incomeMarc + incomeAnna;

    // Brut annualisé pour le calcul de la cotisation REER en décembre.
    // §REER (art. 146(1) LIR) — l'AE et l'invalidité ne sont PAS du « revenu gagné »
    // et ne génèrent aucun droit REER. Pendant un chômage/LTD : le salaire de base de
    // Marc est neutralisé ci-dessous (marcEmploymentActive) et bonus/RSU le sont déjà
    // plus haut. Seul le side income (autonome) subsiste comme revenu gagné.
    const baseGrossMarc = marcEmploymentActive ? grossMarcBaseAnnual * salaryGrowthFactor : 0;
    const baseGrossAnna = survivorMode ? 0 : (grossAnnaBaseAnnual * salaryGrowthFactor);
    const currentGrossMarcAnnual = baseGrossMarc + (bonusMonthly1 + rsuMonthly1 + sideMonthly1) * 12;
    const currentGrossAnnaAnnual = baseGrossAnna + (bonusMonthly2 + rsuMonthly2 + sideMonthly2) * 12;
    const accGrossAdd = (currentGrossMarcAnnual + currentGrossAnnaAnnual) / 12;

    return {
        incomeMarc,
        incomeAnna,
        monthlyIncome,
        accGrossAdd,
        newUnemployedMonths: jobLossResult.newMonthsRemaining,
        newLtdMonths: ltdResult.newMonthsRemaining,
        ltdLogged,
        lifeEventLogs,
    };
}
