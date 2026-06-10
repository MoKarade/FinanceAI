// services/projection/retirementIncome.ts
// Cycle 13: calcul du revenu de retraite mensuel (RRQ + PSV + DB).
// Pure function: aucun side effect. Retourne RetirementIncomeBreakdown
// avec le total ET le split par source (Phase 3 Tier 3 — split pensions).

import type { RetirementGoal, User } from '../../types';
import { RRQ_MPE, calculateGISBenefit, rrqAdjustmentFactor, psvDeferralFactor, PSV_BONUS_75_PLUS } from '../../utils/tax';

// Constantes RRQ/PSV 2026 (Retraite Québec + Service Canada)
const RRQ_DENOMINATOR_YEARS = 39;       // Années cotisées pour pleine RRQ (8/47 plus faibles retirées)
const PSV_MIN_RESIDENCY_YEARS = 10;     // Minimum 10 ans résidence Canada après 18 ans pour PSV
const PSV_FULL_RESIDENCY_YEARS = 40;    // Pleine pension à 40 ans
// (facteurs de report/anticipation RRQ/PSV + bonus 75+ : source unique utils/tax.ts)

export interface RetirementIncomeCtx {
    m: number;
    age: number;
    simInflation: number;
    activeUsersCount: number;
    baseGrossAnnual: number;
    delayPensions: boolean;
    survivorMode: boolean;
    monthlyOasReduction: number;
    dbSurvivorPct: number;
    rrqSurvivorPct: number;
    psvResidencyYears: number[];
    startYear: number;  // pour calcul arrivalAge depuis canadaArrivalYear
    /**
     * FA-3b (audit fiscal 2026-06-09) — revenu imposable AUTRE de l'ANNÉE PRÉCÉDENTE
     * (retraits REER/FERR + revenus locatifs), en dollars NOMINAUX. Le vrai SRG est calculé
     * sur le revenu de l'année d'imposition précédente : l'ignorer affichait un SRG fictif
     * (jusqu'à ~13 k$/an) pour les profils FIRE/meltdown qui vivent de retraits REER.
     * Optionnel (absent → comportement RRQ+DB seul, rétro-compat).
     */
    otherIncomeAnnualLaggedNominal?: number;
}

/**
 * Détail du revenu de retraite par source. Le `total` est le montant
 * mensuel net (après écrêtement PSV) qui était retourné historiquement.
 * Les composantes individuelles sont exposées pour permettre aux onglets
 * (Retirement.tsx, TaxCenter.tsx) d'afficher le split sans recalculer.
 *
 * Phase 3 Tier 3 (2026-05-21) : avant ce refactor, computeRetirementIncome
 * retournait `number` (juste le total). Les onglets ne pouvaient pas afficher
 * "RRQ : 1200\$ / PSV : 700\$ / DB : 500\$" sans dupliquer le calcul.
 */
/**
 * Revenu de retraite mensuel ATTRIBUABLE à un conjoint donné (avant clamp).
 * A1 (impôt par conjoint) : la RRQ et la PSV dépendent de l'historique de salaire
 * et de la résidence de CHAQUE personne — donc elles sont attribuables par conjoint.
 * Les composantes non attribuables au modèle actuel (pension privée DB « cumulée
 * pour le couple », SRG calculé au niveau familial) sont réparties également.
 */
export interface RetirementIncomePerUser {
    /** Revenu de retraite total de ce conjoint (rrq + psv + privée − part écrêtement). */
    total: number;
    /** RRQ attribuable à ce conjoint (selon SON ratio salaire/MGA et SA résidence). */
    rrq: number;
    /** PSV + part du SRG (le SRG est familial → réparti également). */
    psv: number;
    /** Part de la pension privée DB (household → réparti également, faute de donnée par conjoint). */
    privee: number;
}

export interface RetirementIncomeBreakdown {
    /** Revenu mensuel total après écrêtement PSV. = ce que retournait le legacy `number`. */
    total: number;
    /** Rentes RRQ (Régime de rentes du Québec / RPC). */
    rrq: number;
    /** Pension de la Sécurité de la vieillesse + SRG (Supplément revenu garanti). */
    psv: number;
    /** Régimes à prestations déterminées (pensions privées). */
    privee: number;
    /** Écrêtement PSV pour revenus > seuil (montant déduit). */
    oasReduction: number;
    /**
     * FA-3a — SRG mensuel familial (déjà inclus dans `psv` et `total` : c'est du REVENU).
     * Exposé séparément parce que le SRG est NON IMPOSABLE (Service Canada) : taxDecember
     * le SOUSTRAIT de l'assiette imposable. Ne pas le compter deux fois.
     */
    gis: number;
    /**
     * A1 — décomposition PAR CONJOINT du revenu de retraite (index aligné sur `users`
     * filtrés non-nuls). Permet à `taxDecember` d'imposer chaque conjoint sur SON revenu
     * réel au lieu de la moitié du ménage (le barème étant progressif, le split égal
     * sous-estime l'impôt d'un couple à revenus inégaux). La somme des `total` par
     * conjoint == `total` famille (invariant vérifié par test).
     *
     * Limite honnête : la pension privée DB et le SRG restent répartis également (le
     * modèle ne distingue pas la DB par conjoint — `RetirementGoal.dbPensionMonthly`
     * est « cumulée pour le couple » ; le SRG est calculé au niveau familial). Seules
     * RRQ et PSV (qui dépendent du salaire/résidence individuels) sont vraiment
     * attribuées par conjoint.
     */
    perUser: RetirementIncomePerUser[];
}

/**
 * Calcule le revenu mensuel brut de retraite (RRQ + PSV + DB − écrêtement PSV).
 * Appelé une fois par mois quand isRetired === true.
 *
 * Retourne maintenant un `RetirementIncomeBreakdown` avec le split par source.
 * Pour la compat legacy : `result.total` est l'équivalent du `number` retourné
 * avant le refactor.
 */
export function computeRetirementIncome(
    ctx: RetirementIncomeCtx,
    retirementGoal: RetirementGoal,
    users: User[],
): RetirementIncomeBreakdown {
    const {
        m, age, simInflation, activeUsersCount, baseGrossAnnual,
        delayPensions, survivorMode, monthlyOasReduction,
        dbSurvivorPct, rrqSurvivorPct, psvResidencyYears, startYear,
    } = ctx;

    let totalPsvProrata = 0;
    let totalRrqMpeRatio = 0;
    const yearsElapsed = Math.floor(m / 12);
    // MGA RRQ projeté: base 2026 (RRQ_MPE) indexée à inflation + croissance salariale ~0.5%/an
    const rrqMpeProjected = RRQ_MPE * Math.pow(1 + (simInflation + 0.5) / 100, yearsElapsed);

    // A1 — on conserve les ratios PAR CONJOINT (et pas seulement leur somme) pour
    // attribuer RRQ/PSV à chaque personne selon SON salaire / SA résidence.
    const filteredUsers = users.filter(u => u);
    const perUserRrqRatio: number[] = [];
    const perUserPsvProrata: number[] = [];
    filteredUsers.forEach((u, idx) => {
        // B-AUDIT-4 — indexer le salaire courant par le MÊME facteur que la MGA projetée
        // (rrqMpeProjected). Sinon le ratio currentGross/MGA rétrécit artificiellement avec
        // les années → RRQ sous-évaluée pour les départs lointains. Hypothèse standard : le
        // salaire suit la croissance de la MGA sur la carrière → ratio earnings/MGA stable.
        const currentGrossUser = (u.grossSalary || (baseGrossAnnual / activeUsersCount))
            * Math.pow(1 + (simInflation + 0.5) / 100, yearsElapsed);
        const rrqRatioUser = Math.min(1.0, currentGrossUser / rrqMpeProjected);
        perUserRrqRatio.push(rrqRatioUser);
        totalRrqMpeRatio += rrqRatioUser;

        // PSV résidence: prorata 1/40, mais 0 si < 10 ans (règle Service Canada)
        const residencyYears = psvResidencyYears[idx] ?? 0;
        const psvIndividualProrata = residencyYears < PSV_MIN_RESIDENCY_YEARS
            ? 0
            : Math.min(1.0, residencyYears / PSV_FULL_RESIDENCY_YEARS);
        perUserPsvProrata.push(psvIndividualProrata);
        totalPsvProrata += psvIndividualProrata;
    });
    const psvProrata = totalPsvProrata / activeUsersCount;
    const rrqMpeRatio = totalRrqMpeRatio / activeUsersCount;

    // Prorata RRQ basé sur années cotisées au Canada entre 18 ans et l'âge de retraite.
    // canadaArrivalYear est une ANNÉE calendaire (ex. 2010), il faut la convertir en ÂGE
    // via birthYear. Si pas d'immigration documentée, on suppose présence depuis 18 ans.
    const u0 = users[0];
    let arrivalAge = 18;
    if (u0?.canadaArrivalYear && u0?.birthYear) {
        arrivalAge = Math.max(18, u0.canadaArrivalYear - u0.birthYear);
    } else if (u0?.canadaArrivalYear && !u0?.birthYear) {
        // Fallback: si on n'a que arrivalYear, estimer via startYear et âge courant
        const currentAge = age;
        const currentYear = startYear + yearsElapsed;
        const estimatedBirthYear = currentYear - currentAge;
        arrivalAge = Math.max(18, u0.canadaArrivalYear - estimatedBirthYear);
    }
    const workedYearsAtRetirement = Math.max(0, retirementGoal.targetAge - arrivalAge);
    const rrqProrata = Math.min(1, workedYearsAtRetirement / RRQ_DENOMINATOR_YEARS) * rrqMpeRatio;

    // Début des rentes = CHOIX INDÉPENDANT de l'âge d'arrêt de travail (correctif Marc 2026-06 :
    // l'ancien `max(60/65, targetAge)` FORÇAIT les rentes à démarrer à l'âge de retraite → « pas de
    // rente avant 71 » si on prévoyait d'arrêter tard, alors qu'on touche le RRQ dès 65 même en
    // travaillant). Défaut = min(targetAge, 65) : plafonne le début à l'âge NORMAL (65) tout en
    // préservant l'anticipation d'un retraité précoce. Champs `rrqStartAge`/`psvStartAge` pour un
    // choix explicite. Bornes légales : RRQ 60-72 (report étendu à 72 depuis 2024), PSV 65-70.
    // delayPensions (stratégie de report optimal) → RRQ 72, PSV 70.
    const defaultStart = Math.min(retirementGoal.targetAge, 65);
    let rrqStartAge = Math.min(72, Math.max(60, retirementGoal.rrqStartAge ?? defaultStart));
    let psvStartAge = Math.min(70, Math.max(65, retirementGoal.psvStartAge ?? defaultStart));
    if (delayPensions) {
        rrqStartAge = 72;
        psvStartAge = 70;
    }
    // Facteurs de report/anticipation dérivés des âges de début (source unique utils/tax.ts).
    // delayPensions → RRQ 72 = +84 mois ×1,588 ; PSV 70 = +60 mois ×1,36. La PSV ne s'anticipe pas.
    const rrqFactor = rrqAdjustmentFactor((rrqStartAge - 65) * 12);
    const psvFactor = psvDeferralFactor((psvStartAge - 65) * 12);

    const rrqBaseIndiv = (retirementGoal.rrqEstimateMonthly !== undefined)
        ? (retirementGoal.rrqEstimateMonthly * activeUsersCount)
        : (retirementGoal.governmentPension * 0.65);
    const psvBaseIndiv = (retirementGoal.psvEstimateMonthly !== undefined)
        ? (retirementGoal.psvEstimateMonthly * activeUsersCount)
        : (retirementGoal.governmentPension * 0.35);

    const survivorRrqFactor = survivorMode ? (1 - 0.5 + 0.5 * rrqSurvivorPct) : 1;
    const survivorPsvFactor = survivorMode ? 0.5 : 1;
    // Bonification automatique PSV +10% à partir de 75 ans (depuis juillet 2022)
    const psv75Bonus = age >= 75 ? (1 + PSV_BONUS_75_PLUS) : 1;
    const rrqMonthly = age >= rrqStartAge ? (rrqBaseIndiv * rrqProrata * rrqFactor * survivorRrqFactor) : 0;
    const psvMonthly = age >= psvStartAge ? (psvBaseIndiv * psvProrata * psvFactor * psv75Bonus * survivorPsvFactor) : 0;

    const inflFactor = Math.pow(1 + simInflation / 100, m / 12);

    const dbStartAge = retirementGoal.dbPensionStartAge ?? retirementGoal.targetAge;
    const dbBaseMonthly = retirementGoal.dbPensionMonthly || 0;
    const dbIndexationFraction = Math.min(1, Math.max(0, (retirementGoal.dbPensionIndexationPct ?? 100) / 100));
    const dbInflFactor = 1 + (inflFactor - 1) * dbIndexationFraction;
    const dbSurvivorFactor = survivorMode ? dbSurvivorPct : 1;
    const dbMonthly = age >= dbStartAge ? dbBaseMonthly * dbInflFactor * dbSurvivorFactor : 0;

    // §6.3 — SRG (Supplément de revenu garanti) pour retraités 65+ recevant la PSV.
    // FA-3b (audit fiscal 2026-06-09) : le « revenu autre que PSV » du test SRG inclut
    // désormais le revenu imposable de l'ANNÉE PRÉCÉDENTE (retraits REER/FERR + loyers,
    // transmis nominal et déflaté ici à la même base réelle que RRQ ; NB : dbMonthly porte
    // déjà dbInflFactor (quasi nominal si indexation 100 %) → revenu test légèrement surévalué
    // pour les profils DB = SRG sous-évalué, sens CONSERVATEUR) — comme le vrai
    // SRG, calculé sur la déclaration de l'année passée. Avant : RRQ+DB seuls → SRG
    // fictif (~13 k$/an) pour les profils FIRE/meltdown vivant de retraits REER.
    // Limite assumée : les gains en capital réalisés ne sont pas inclus (FA-8).
    // Garde NaN à la source (cohérence FA-1) : Math.max(0, NaN) = NaN — calculateGISBenefit a
    // sa propre garde mais on neutralise ici pour ne jamais propager.
    const otherLaggedReal = (Number.isFinite(ctx.otherIncomeAnnualLaggedNominal)
        ? Math.max(0, ctx.otherIncomeAnnualLaggedNominal as number)
        : 0) / inflFactor;
    // rrqMonthly is already family-level (rrqBaseIndiv × activeUsersCount above).
    // Computing family total first, then dividing for the per-adult figure avoids
    // the double-multiplication that caused SRG = $0 for entitled couples (§7.G).
    const otherIncomeAnnualFamily = (rrqMonthly + dbMonthly) * 12 + otherLaggedReal;
    const otherIncomeAnnualPerAdult = otherIncomeAnnualFamily / Math.max(1, activeUsersCount);
    const hasSpouseWithOAS = activeUsersCount > 1 && age >= psvStartAge;
    // FA-9 (audit fiscal 2026-06-09) — TOUT en base RÉELLE ici, comme RRQ/PSV : appel SANS
    // `year` (seuils/max 2026 de base) contre le revenu test déjà en base réelle, puis la
    // nominalisation UNIQUE ×inflFactor ci-dessous (gisTotal). Avant : `year=currentYear`
    // indexait max+seuils ×1,02^Δ DANS calculateGISBenefit PUIS ×inflFactor dehors → max SRG
    // double-indexé (surévalué ~49 % à 20 ans, ~+6,5 k$/an fictifs) et seuils nominaux face
    // à un revenu réel (clawback trop clément, même sens non conservateur).
    const gisMonthlyPerAdult = (age >= psvStartAge && psvMonthly > 0)
        ? calculateGISBenefit(
            hasSpouseWithOAS ? otherIncomeAnnualFamily : otherIncomeAnnualPerAdult,
            hasSpouseWithOAS,
        )
        : 0;
    const gisMonthly = gisMonthlyPerAdult * activeUsersCount;

    // Phase 3 Tier 3 — split par source avant clamp Math.max(0, ...)
    const rrq = rrqMonthly * inflFactor;
    const psv = (psvMonthly + gisMonthly) * inflFactor;
    const psvOasOnly = psvMonthly * inflFactor;   // PSV hors SRG (attribuable par résidence)
    const gisTotal = gisMonthly * inflFactor;     // SRG (familial → réparti également)
    const privee = dbMonthly;
    const totalRaw = rrq + psv + privee - monthlyOasReduction;

    // A1 — décomposition PAR CONJOINT. RRQ ∝ ratio salaire/MGA individuel ; PSV (volet
    // OAS) ∝ prorata de résidence individuel. Le SRG (familial), la pension DB
    // (« cumulée pour le couple ») et l'écrêtement PSV sont répartis également faute
    // de donnée par conjoint. On répartit les TOTAUX famille au prorata des ratios
    // individuels : la somme par conjoint == total famille (invariant exact, même quand
    // un ratio est nul — fallback part égale).
    const n = Math.max(1, filteredUsers.length);
    const sumRrqRatio = perUserRrqRatio.reduce((s, r) => s + r, 0);
    const sumPsvProrata = perUserPsvProrata.reduce((s, p) => s + p, 0);
    const perUser: RetirementIncomePerUser[] = filteredUsers.map((_, i) => {
        const rrqShare = sumRrqRatio > 0 ? perUserRrqRatio[i] / sumRrqRatio : 1 / n;
        const psvShare = sumPsvProrata > 0 ? perUserPsvProrata[i] / sumPsvProrata : 1 / n;
        const rrqUser = rrq * rrqShare;
        // PSV individuelle = volet OAS au prorata résidence + part égale du SRG familial.
        const psvUser = psvOasOnly * psvShare + gisTotal / n;
        const priveeUser = privee / n;            // DB household → part égale
        const oasReductionUser = monthlyOasReduction / n;
        return {
            total: Math.max(0, rrqUser + psvUser + priveeUser - oasReductionUser),
            rrq: Math.max(0, rrqUser),
            psv: Math.max(0, psvUser),
            privee: Math.max(0, priveeUser),
        };
    });

    return {
        total: Math.max(0, totalRaw),
        rrq: Math.max(0, rrq),
        psv: Math.max(0, psv),
        privee: Math.max(0, privee),
        oasReduction: monthlyOasReduction,
        gis: Math.max(0, gisTotal),
        perUser,
    };
}
