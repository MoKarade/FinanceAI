// services/projection/retirementIncome.ts
// Cycle 13: calcul du revenu de retraite mensuel (RRQ + PSV + DB).
// Pure function: aucun side effect. Retourne RetirementIncomeBreakdown
// avec le total ET le split par source (Phase 3 Tier 3 — split pensions).

import type { RetirementGoal, User } from '../../types';
import { RRQ_MPE, calculateGISBenefit, rrqAdjustmentFactor, psvDeferralFactor, PSV_BONUS_75_PLUS, CAPITAL_GAINS_INCLUSION_STANDARD, GOV_PENSION_RRQ_SHARE, GOV_PENSION_PSV_SHARE, getResidencyStartYear } from '../../utils/tax';

// Constantes RRQ/PSV 2026 (Retraite Québec + Service Canada) — règles documentées
// FISCAL_REFERENCE §6 « Prorata RRQ / résidence PSV » (FA-8, 2026-06-11).
// RRQ — approximation de MODÈLE « 39 meilleures années » : la rente officielle = moyenne des
// gains ajustés sur la période cotisable (18 ans → début de rente, ≈ 47 ans à 65 ans) avec
// retranchement de 15 % des mois les plus faibles (Retraite Québec) ≈ conserver 39 années
// (8/47 retirées). Le moteur fait : prorata = min(1, années au Canada 18→targetAge / 39)
// × min(1, salaire/MGA) (salaire et MGA projetés au même facteur, cf B-AUDIT-4 plus bas).
const RRQ_DENOMINATOR_YEARS = 39;
// PSV — règle OFFICIELLE de résidence (Service Canada) : admissible dès 10 ans de résidence au
// Canada après 18 ans (versement au Canada) ; pension PLEINE à 40 ans ; entre les deux, prorata
// en 40es. < 10 ans → 0 $.
const PSV_MIN_RESIDENCY_YEARS = 10;
const PSV_FULL_RESIDENCY_YEARS = 40;
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
    /**
     * PV-9 (2026-06-10) — gains en capital RÉALISÉS de l'année PRÉCÉDENTE, en dollars NOMINAUX
     * et BRUTS (avant inclusion 50 %). À l'ARC, le gain imposable (×0,5) entre dans le revenu net
     * (ligne 23400) qui sert au test SRG : l'omettre surévalue le SRG d'un 65+ bas revenu qui a
     * réalisé des gains (NonReg/crypto, levier `gainHarvesting`). L'inclusion 50 % est appliquée ici.
     * Optionnel (absent → 0, rétro-compat).
     */
    prevYearCapitalGainsForGisNominal?: number;
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
    let totalRrqWeight = 0;
    const yearsElapsed = Math.floor(m / 12);
    // MGA RRQ projeté: base 2026 (RRQ_MPE) indexée à inflation + croissance salariale ~0.5%/an
    const rrqMpeProjected = RRQ_MPE * Math.pow(1 + (simInflation + 0.5) / 100, yearsElapsed);

    // A1 — on conserve les POIDS PAR CONJOINT (et pas seulement leur somme) pour
    // attribuer RRQ/PSV à chaque personne selon SON salaire / SA résidence.
    const filteredUsers = users.filter(u => u);
    const perUserRrqWeight: number[] = [];
    const perUserPsvProrata: number[] = [];
    filteredUsers.forEach((u, idx) => {
        // B-AUDIT-4 — indexer le salaire courant par le MÊME facteur que la MGA projetée
        // (rrqMpeProjected). Sinon le ratio currentGross/MGA rétrécit artificiellement avec
        // les années → RRQ sous-évaluée pour les départs lointains. Hypothèse standard : le
        // salaire suit la croissance de la MGA sur la carrière → ratio earnings/MGA stable.
        // FISC-RRQ-UNIT — grossSalary est MENSUEL (convention canonique du store, cf utils/salary.ts) ;
        // baseGrossAnnual/activeUsersCount est ANNUEL. On annualise grossSalary (×12) pour que le ratio
        // earnings/MGA (rrqMpeProjected, annuel) ait la bonne échelle — sinon RRQ ~12× trop basse.
        const currentGrossUser = (u.grossSalary ? u.grossSalary * 12 : (baseGrossAnnual / activeUsersCount))
            * Math.pow(1 + (simInflation + 0.5) / 100, yearsElapsed);
        const rrqRatioUser = Math.min(1.0, currentGrossUser / rrqMpeProjected);

        // FISC-RRQ-PRORATA (2026-06-16) — prorata de RÉSIDENCE RRQ désormais PER-CONJOINT (avant :
        // dérivé de users[0] SEUL puis appliqué à la rente du COUPLE → faux pour un couple d'arrivées
        // inégales, ~20 % d'erreur pour un mix natif/immigrant tardif). Mirroir de la PSV : arrivalAge
        // via getResidencyStartYear (gate isImmigrant inclus ; même repli birthYear que projection.ts:196).
        // RRQ = années cotisées 18→retraite / 39 (modèle « 39 meilleures années », FISCAL_REFERENCE §6).
        const birthYearU = u.birthYear || (startYear - (u.age || 30));
        const residencyStartU = getResidencyStartYear(birthYearU, u.isImmigrant, u.canadaArrivalYear);
        const arrivalAgeU = Math.max(18, residencyStartU - birthYearU);
        const rrqResidenceProrataUser = Math.min(1, Math.max(0, retirementGoal.targetAge - arrivalAgeU) / RRQ_DENOMINATOR_YEARS);
        // Poids RRQ individuel = ratio gains/MGA × prorata de résidence (les deux PER-CONJOINT).
        const rrqWeightUser = rrqRatioUser * rrqResidenceProrataUser;
        perUserRrqWeight.push(rrqWeightUser);
        totalRrqWeight += rrqWeightUser;

        // PSV résidence: prorata 1/40, mais 0 si < 10 ans (règle Service Canada)
        // [NAN-INPUT-HARDENING] `?? 0` ne rattrape PAS NaN → `Number.isFinite` (sinon NaN<10=false → prorata NaN).
        const ryRaw = psvResidencyYears[idx];
        const residencyYears = Number.isFinite(ryRaw) ? ryRaw : 0;
        const psvIndividualProrata = residencyYears < PSV_MIN_RESIDENCY_YEARS
            ? 0
            : Math.min(1.0, residencyYears / PSV_FULL_RESIDENCY_YEARS);
        perUserPsvProrata.push(psvIndividualProrata);
        totalPsvProrata += psvIndividualProrata;
    });
    const psvProrata = totalPsvProrata / activeUsersCount;
    // RRQ : moyenne des poids per-conjoint (gains/MGA × résidence). Couple non-immigrant (résidence=1
    // chacun) ⇒ = moyenne des ratios gains/MGA = comportement antérieur EXACT (zéro régression baseline).
    const rrqProrata = totalRrqWeight / activeUsersCount;

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

    // Base FAMILIALE (ménage) de RRQ / PSV — deux chemins qui aboutissent TOUS DEUX à un montant
    // familial (cohérent avec estateCalculation.ts:177-178 et setupSimulation.ts:114-118) :
    //  • `governmentPension` est DÉJÀ un agrégat MÉNAGE (RRQ+PSV combinés des 2 conjoints) → split 65/35
    //    SANS ×N (convention de MODÈLE GOV_PENSION_*_SHARE, utils/tax.ts — PAS une règle ARC/RQ, cf
    //    FISCAL_REFERENCE §6 FA-8). ⚠️ NE PAS ajouter ×activeUsersCount ici : ce serait un double-comptage
    //    (bug FA-5 déjà corrigé) → un couple verrait sa rente doublée. (FISC-GOVPENSION-SCALE = faux positif.)
    //  • `rrqEstimateMonthly`/`psvEstimateMonthly` (relevés Retraite Québec / Service Canada) sont
    //    PER-PERSONNE → ×activeUsersCount pour reconstituer le familial. Ces estimés précis priment.
    // RRQ-PSV-MIN — clamp `Math.max(0, …)` : un estimé NÉGATIF (saisie absurde, inputs sans `min`) ne
    // doit pas créer une rente négative qui sous-estimerait en silence le revenu (et le NPV estate, aligné).
    const rrqBaseFamily = (retirementGoal.rrqEstimateMonthly !== undefined)
        ? (Math.max(0, retirementGoal.rrqEstimateMonthly) * activeUsersCount)
        : (retirementGoal.governmentPension * GOV_PENSION_RRQ_SHARE);
    const psvBaseFamily = (retirementGoal.psvEstimateMonthly !== undefined)
        ? (Math.max(0, retirementGoal.psvEstimateMonthly) * activeUsersCount)
        : (retirementGoal.governmentPension * GOV_PENSION_PSV_SHARE);

    const survivorRrqFactor = survivorMode ? (1 - 0.5 + 0.5 * rrqSurvivorPct) : 1;
    const survivorPsvFactor = survivorMode ? 0.5 : 1;
    // Bonification automatique PSV +10% à partir de 75 ans (depuis juillet 2022)
    const psv75Bonus = age >= 75 ? (1 + PSV_BONUS_75_PLUS) : 1;
    const rrqMonthly = age >= rrqStartAge ? (rrqBaseFamily * rrqProrata * rrqFactor * survivorRrqFactor) : 0;
    const psvMonthly = age >= psvStartAge ? (psvBaseFamily * psvProrata * psvFactor * psv75Bonus * survivorPsvFactor) : 0;

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
    // Garde NaN à la source (cohérence FA-1) : Math.max(0, NaN) = NaN — calculateGISBenefit a
    // sa propre garde mais on neutralise ici pour ne jamais propager.
    const otherLaggedReal = (Number.isFinite(ctx.otherIncomeAnnualLaggedNominal)
        ? Math.max(0, ctx.otherIncomeAnnualLaggedNominal as number)
        : 0) / inflFactor;
    // PV-9 — gains en capital RÉALISÉS de l'année précédente : le montant IMPOSABLE (×0,5) entre
    // dans le revenu net du test SRG, déflaté à la même base réelle. Avant : exclus (SRG surévalué
    // pour un 65+ bas revenu réalisant des gains). `accCapitalGainsYear` est déjà NET de la banque
    // de pertes (PV-2/PV-7) et ≥ 0 — c'est le gain RÉALISÉ net (BRUT, avant inclusion) ; ×0,5 = ligne 12700.
    const gainsLaggedReal = (Number.isFinite(ctx.prevYearCapitalGainsForGisNominal)
        ? Math.max(0, ctx.prevYearCapitalGainsForGisNominal as number)
        : 0) * CAPITAL_GAINS_INCLUSION_STANDARD / inflFactor;
    // rrqMonthly is already family-level (rrqBaseFamily above — agrégat ménage, déjà ×N si estimés).
    // Computing family total first, then dividing for the per-adult figure avoids
    // the double-multiplication that caused SRG = $0 for entitled couples (§7.G).
    const otherIncomeAnnualFamily = (rrqMonthly + dbMonthly) * 12 + otherLaggedReal + gainsLaggedReal;
    // FA-10 (suivi fiscal-accuracy) — survivorMode : UN seul bénéficiaire SRG. Avant, le
    // survivant gardait le barème COUPLE (max 662 $ ×2 = 1 324 $/mois, seuil combiné 29 760 $)
    // au lieu du barème célibataire (1 105 $, seuil 22 512 $) ET son revenu test était divisé
    // par 2 → jusqu'à ~2,6 k$/an de SRG fictif NON imposable (sens non conservateur).
    const gisHeads = survivorMode ? 1 : Math.max(1, activeUsersCount);
    const otherIncomeAnnualPerAdult = otherIncomeAnnualFamily / gisHeads;
    const hasSpouseWithOAS = !survivorMode && activeUsersCount > 1 && age >= psvStartAge;
    // FA-9 (audit 2026-06-09, fix 2026-06-10) — TOUT en base RÉELLE ici, comme RRQ/PSV : appel
    // SANS `year` (seuils/max 2026 de base) contre le revenu test déjà en base réelle, puis la
    // nominalisation UNIQUE ×inflFactor ci-dessous (gisTotal). Avant : `year=currentYear`
    // indexait max+seuils ×1,02^Δ DANS calculateGISBenefit PUIS ×inflFactor dehors → max SRG
    // double-indexé (surévalué ~49 % à 20 ans, ~+6,5 k$/an fictifs en $ RÉELS 2026, célibataire)
    // et seuils nominaux face à un revenu réel (clawback trop clément, même sens non conservateur).
    const gisMonthlyPerAdult = (age >= psvStartAge && psvMonthly > 0)
        ? calculateGISBenefit(
            hasSpouseWithOAS ? otherIncomeAnnualFamily : otherIncomeAnnualPerAdult,
            hasSpouseWithOAS,
        )
        : 0;
    const gisMonthly = gisMonthlyPerAdult * gisHeads;

    // Phase 3 Tier 3 — split par source avant clamp Math.max(0, ...)
    const rrq = rrqMonthly * inflFactor;
    const psv = (psvMonthly + gisMonthly) * inflFactor;
    const psvOasOnly = psvMonthly * inflFactor;   // PSV hors SRG (attribuable par résidence)
    const gisTotal = gisMonthly * inflFactor;     // SRG (familial → réparti également)
    const privee = dbMonthly;
    const totalRaw = rrq + psv + privee - monthlyOasReduction;

    // A1 — décomposition PAR CONJOINT. RRQ ∝ POIDS individuel (ratio salaire/MGA × prorata de
    // résidence, FISC-RRQ-PRORATA) ; PSV (volet OAS) ∝ prorata de résidence individuel. Le SRG
    // (familial), la pension DB (« cumulée pour le couple ») et l'écrêtement PSV sont répartis
    // également faute de donnée par conjoint. On répartit les TOTAUX famille au prorata des poids
    // individuels : la somme par conjoint == total famille (invariant exact, même quand un poids
    // est nul — fallback part égale).
    const n = Math.max(1, filteredUsers.length);
    const sumRrqWeight = perUserRrqWeight.reduce((s, r) => s + r, 0);
    const sumPsvProrata = perUserPsvProrata.reduce((s, p) => s + p, 0);
    const perUser: RetirementIncomePerUser[] = filteredUsers.map((_, i) => {
        const rrqShare = sumRrqWeight > 0 ? perUserRrqWeight[i] / sumRrqWeight : 1 / n;
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
