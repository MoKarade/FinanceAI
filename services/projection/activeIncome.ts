// services/projection/activeIncome.ts
// Cycle 15: calcul du revenu mensuel en phase active — salaire de base,
// perte d'emploi (AE 55%), invalidité LTD, bonus/RSU/side income.
//
// Pattern: Pure Return. tickJobLoss + tickLtd sont appelés en interne
// (évite de les dupliquer dans le caller).

import type { ProjectionConfig, User } from '../../types';
import { tickJobLoss, tickLtd } from './stochasticEvents';

import { AE_MAX_INCOME } from '../../utils/tax';
import type { FiscalReport } from '../../utils/tax';
import { projeterAuPatronMga } from './helpers';

/** Signature injectée de `calculateFiscalReport` (même patron que `childrenReee.ts`).
 *  ⚠️ La raison de l'injection est la TESTABILITÉ (brancher un stub/espion), PAS une dépendance
 *  circulaire : `utils/tax.ts` n'importe RIEN, il n'y a jamais eu de cycle — la phrase « évite la
 *  dépendance circulaire », recopiée d'un commentaire voisin, était fausse (revue 2026-08-20),
 *  et ce fichier importe d'ailleurs `AE_MAX_INCOME` statiquement trois lignes plus bas. */
type FiscalReportFn = (
    grossIncome: number,
    rrspContrib: number,
    fhsaContrib: number,
    year: number,
    skipBreakdown: boolean,
    ageOpts?: undefined,
    employmentIncome?: number,
) => FiscalReport;

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
    // [AE-PLAFOND-MANQUANT] Nécessaires au calcul de la prestation AE par le BRUT plafonné :
    // l'année fiscale du mois courant, l'inflation simulée (indexation du plafond), et la fonction
    // fiscale injectée. REQUIS (pas optionnels) : un appelant qui les omettrait retomberait en
    // silence sur l'ancienne approximation `net × 0,55` — le compilateur doit le voir.
    loopYear: number;
    simInflation: number;
    calculateFiscalReport: FiscalReportFn;
}

export interface ActiveIncomeResult {
    incomeMarc: number;
    incomeAnna: number;
    monthlyIncome: number;
    accGrossAdd: number;
    /** [FISC-RRSP-ROOM-PER-USER] Ventilation par personne du brut « revenu gagné » mensuel
     *  ([Marc, Anna]) — Σ == accGrossAdd (invariant testé). La règle ARC calcule les droits
     *  REER PAR PERSONNE : l'agrégat ménage ne suffit plus. */
    accGrossAddByUser: [number, number];
    newUnemployedMonths: number;
    newLtdMonths: number;
    ltdLogged: boolean;
    lifeEventLogs: string[];
}

/**
 * Calcule le revenu net mensuel du ménage en phase active.
 * Gère la croissance salariale, chômage, LTD et revenus variables.
 */
/**
 * [CHOMAGE-DEUX-MODELES] Prestation d'assurance-emploi NETTE mensuelle pour un brut annuel
 * assurable donné — SOURCE UNIQUE des deux modèles de chômage (le stochastique ci-dessous et
 * l'événement daté PERTE_EMPLOI de `projection.ts`). Une formule money-critical recopiée diverge
 * (`UNE-FORMULE-MONEY-CRITICAL-RECOPIEE-DIVERGE`) : c'est l'extraction qui unifie, pas la copie.
 * Règle (décision Marc 2026-08-20, FISCAL_REFERENCE §2) : 55 % des gains assurables BRUTS
 * plafonnés (`AE_MAX_INCOME` projeté au patron MGA), prestation IMPOSABLE à assiette de
 * cotisation NULLE (`employmentIncome: 0`).
 */
export function prestationAeNetteMensuelle(
    grossAnnual: number,
    ctx: {
        simInflation: number;
        yearsElapsed: number;
        loopYear: number;
        enableMonteCarlo: boolean;
        calculateFiscalReport: FiscalReportFn;
    },
): number {
    if (!(grossAnnual > 0)) return 0;
    const aeCapProjected = projeterAuPatronMga(AE_MAX_INCOME, ctx.simInflation, ctx.yearsElapsed);
    const aeGrossAnnual = Math.min(grossAnnual, aeCapProjected) * 0.55;
    return ctx.calculateFiscalReport(
        aeGrossAnnual, 0, 0, ctx.loopYear, ctx.enableMonteCarlo, undefined, 0,
    ).netIncome / 12;
}

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
        // [AE-PLAFOND-MANQUANT] La prestation AE = 55 % des gains assurables BRUTS, PLAFONNÉS —
        // jamais 55 % du net sans plafond (l'ancien `incomeMarc *= 0.55` sur-payait un haut salaire
        // et l'assujettissait aux cotisations). Règle sourcée (décision Marc 2026-08-20,
        // FISCAL_REFERENCE §2) : la prestation est IMPOSABLE à assiette de cotisation NULLE
        // (`employmentIncome: 0`). Le plafond 2026 (`AE_MAX_INCOME`, §2) est projeté au même patron
        // MGA que `rqapCapProjected` (inflation simulée + 0,5 pt — biais documenté §2).
        const grossMarcAnnual = ctx.grossMarcBaseAnnual * salaryGrowthFactor;
        if (grossMarcAnnual > 0) {
            // [CHOMAGE-DEUX-MODELES] Formule EXTRAITE en source unique (partagée avec l'événement
            // daté PERTE_EMPLOI) — comportement bit-identique à l'inline qu'elle remplace.
            incomeMarc = prestationAeNetteMensuelle(grossMarcAnnual, {
                simInflation: ctx.simInflation, yearsElapsed,
                loopYear: ctx.loopYear, enableMonteCarlo: ctx.enableMonteCarlo,
                calculateFiscalReport: ctx.calculateFiscalReport,
            });
        } else {
            // ⚠️ Repli quasi INATTEIGNABLE, gardé en défense en profondeur (revue 2026-08-20) :
            // depuis #669, `computeIncomeBaseline` dérive TOUJOURS un brut positif d'un net —
            // mesuré sur 8 formes d'entrée, le seul chemin vivant jusqu'ici est un `grossSalary`
            // NÉGATIF persisté, c'est-à-dire une CORRUPTION de données, pas du legacy. Dans ce cas
            // l'approximation `net × 0,55` (bornée) vaut mieux qu'une prestation inventée à 0 —
            // mais elle restitue l'ancienne sur-prestation : ne pas s'appuyer dessus.
            incomeMarc *= 0.55;
        }
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
    const accGrossAddByUser: [number, number] = [currentGrossMarcAnnual / 12, currentGrossAnnaAnnual / 12];

    return {
        incomeMarc,
        incomeAnna,
        monthlyIncome,
        accGrossAdd,
        accGrossAddByUser,
        newUnemployedMonths: jobLossResult.newMonthsRemaining,
        newLtdMonths: ltdResult.newMonthsRemaining,
        ltdLogged,
        lifeEventLogs,
    };
}
