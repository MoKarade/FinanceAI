// services/projection/taxDecember.ts
// Cycle 23 split (depuis taxCycle.ts): blocs fiscaux de décembre.
// Cycle 10 (computeOasClawback, processTaxLossHarvesting): décembre = mois 11.
// Cycle 11 (processDecemberTaxFiling): régularisation annuelle d'impôt.

import { OAS_CLAWBACK_THRESHOLD_2026, CAPITAL_GAINS_INCLUSION_STANDARD, calculateRamqPremium, calculateFSSPremium, type FiscalReport, type AgeCreditOptions } from '../../utils/tax';

/**
 * V31 — OAS Clawback prévu (calcul annuel en décembre).
 * S'applique uniquement aux retraités 65+ avec revenu de pension > seuil.
 * Retourne le clawback annuel prévu (à diviser par 12 par le caller).
 */
export function computeOasClawback(
    currentMonthIndex: number,
    m: number,
    isRetired: boolean,
    age: number,
    expenseMultiplier: number,
    incomeRetirementMonthly: number,
    accRetraitsReerYear: number,
    accRentesYear: number,
    psvBasePension: number,
    simInflation: number,
): { clawbackAnnual: number; logMsg?: string } {
    if (currentMonthIndex !== 11 || m === 0 || !isRetired || age < 65) {
        return { clawbackAnnual: 0 };
    }
    // BONUS FIX (Marc, 2026-06) — le seuil de récupération PSV doit être indexé par
    // l'inflation NOMINALE du revenu (Math.pow(1+simInflation/100, m/12)), PAS par
    // expenseMultiplier (inflation des DÉPENSES, qui diverge via l'inflation par
    // catégorie ou le bonus santé 75+). annualPensionIncome ci-dessous est nominal
    // (la pension croît au taux nominal, cf incomeRetirement) → comparer à un seuil
    // indexé sur les dépenses sous-évaluait/sur-évaluait le clawback selon l'écart
    // CPI dépenses vs revenu. Cohérent désormais avec psvAnnualBase (même facteur).
    // expenseMultiplier est conservé dans la signature (compat appelant) mais inutilisé.
    void expenseMultiplier;
    const nominalIncomeFactor = Math.pow(1 + simInflation / 100, m / 12);
    const OAS_THRESHOLD = OAS_CLAWBACK_THRESHOLD_2026 * nominalIncomeFactor;
    const annualPensionIncome = (incomeRetirementMonthly * 12) + accRetraitsReerYear + accRentesYear;
    const psvAnnualBase = psvBasePension * 12 * nominalIncomeFactor;
    if (annualPensionIncome <= OAS_THRESHOLD) return { clawbackAnnual: 0 };

    const excess = annualPensionIncome - OAS_THRESHOLD;
    const clawback = Math.min(psvAnnualBase, excess * 0.15);
    if (clawback > 1) {
        return {
            clawbackAnnual: clawback,
            logMsg: `⚠️ PSV Clawback prévu: -${Math.round(clawback).toLocaleString('fr-CA')}$/an`,
        };
    }
    return { clawbackAnnual: clawback };
}

/**
 * V31 — Tax-Loss Harvesting actif en décembre.
 * Si le rendement Non-Reg de l'année est négatif, on vend 50% pour cristalliser
 * la perte → banque de pertes capitales (capitalLossBank) + ACB ajusté.
 *
 * Retourne {harvestedLoss, acbDelta, log}. Caller applique les mutations.
 */
export function processTaxLossHarvesting(
    currentMonthIndex: number,
    m: number,
    nonReg: number,
    nonRegACB: number,
    currentNonRegRate: number,
): { harvestedLoss: number; acbDelta: number; logMsg?: string } {
    if (currentMonthIndex !== 11 || m === 0) return { harvestedLoss: 0, acbDelta: 0 };
    if (currentNonRegRate >= 0 || nonReg <= 0) return { harvestedLoss: 0, acbDelta: 0 };

    const fakeSell = nonReg * 0.50;
    const dropRate = Math.abs(currentNonRegRate) / 100;
    const harvestedLoss = fakeSell * dropRate;

    const proportion = nonRegACB > 0 && nonReg > 0 ? Math.min(1, nonRegACB / nonReg) : 0;
    const acbDelta = -(fakeSell * proportion) + (fakeSell * (1 - dropRate));

    return {
        harvestedLoss,
        acbDelta,
        logMsg: `🛡️ Perte Cristallisée (TLH): +${Math.round(harvestedLoss).toLocaleString('fr-CA')}$ (Banque) | ACB ajusté à la baisse`,
    };
}

/**
 * V30 — Régularisation fiscale de décembre.
 * Calcule l'impôt final sur l'année écoulée :
 *  - Cas actif: paie ou rembourse selon retenue employeur vs impôt réel
 *  - Cas retraité: impôt marginal réel sur pension + rentes + retraits REER/FERR,
 *    moins la retenue à la source déjà captée dans le bucket .reer (réconciliation
 *    en miroir de la phase active, sans double-comptage — voir détail dans le corps).
 * Plus gains en capital (palier 250k) et dividendes éligibles Non-Reg.
 *
 * Retourne le nouveau taxCurrentYear et les logs émis.
 * NE TOUCHE PAS à taxPreviousYear (caller fait le transfert).
 */
export interface DecemberContext {
    m: number;
    loopYear: number;
    isRetired: boolean;
    enableMonteCarlo: boolean;
    yearsElapsed: number;
    inflationFactor: number;
    activeUsersCount: number;
    grossMarcBaseAnnual: number;
    grossAnnaBaseAnnual: number;
    simSalaryGrowth: number;
    optimizeSourceDeductions: boolean | undefined;
    incomeRetirementMonthly: number;
    /**
     * A1 — revenu de retraite mensuel ATTRIBUABLE à chaque conjoint (RRQ+PSV+DB),
     * issu de `computeRetirementIncome().perUser[i].total`. Quand fourni (couple),
     * l'impôt de retraite de décembre est calculé en taxant chaque conjoint sur SON
     * revenu réel (RRQ/PSV dépendent du salaire et de la résidence individuels) plutôt
     * que sur la moitié du ménage — corrige la sous-estimation due au split égal sous
     * un barème progressif. La somme == `incomeRetirementMonthly`.
     *
     * Limite : les rentes gouvernementales (`accRentesYear`) et les retraits REER/FERR
     * (`accRetraitsReerYear`) restent répartis également (le moteur ne les attribue pas
     * par conjoint). Seule la pension RRQ/PSV/DB est attribuée. Si `undefined` ou
     * longueur ≠ activeUsersCount → repli sur l'ancien split égal (rétro-compat).
     */
    incomeRetirementPerUserMonthly?: number[];
    /** Phase 3 — composante DB (rente viagère) mensuelle PAR CONJOINT. Partie ADMISSIBLE au
     *  fractionnement de pension dès 65 ans (les retraits FERR/RIF le sont dès 72 ans). Sert à
     *  borner le transfert ≤ 50 % de l'admissible. Absent → aucun fractionnement (repli sûr). */
    incomeRetirementDbPerUserMonthly?: number[];
    nonReg: number;
    baseNonRegRate: number;
    accRrspYear: number;
    accFhsaYear: number;
    smithInterestDeductibleYear: number;
    accRentesYear: number;
    accRetraitsReerYear: number;
    /** Phase 2 — retraits REER/FERR de l'année ATTRIBUÉS par conjoint (au prorata des soldes au
     *  retrait ; Σ == accRetraitsReerYear). Quand fourni (couple), chacun est taxé sur SES vrais
     *  retraits au lieu du split 50/50. Absent/incohérent → repli sur le split égal. */
    accRetraitsReerYearByUser?: number[];
    accCapitalGainsYear: number;
    /** Âge courant de l'utilisateur principal — sert aux crédits §6.2 (65+ et revenu retraite). */
    age?: number;
    /**
     * B-AUDIT-3 — âge courant du conjoint (user[1]). Permet d'appliquer les crédits
     * d'âge/pension PAR conjoint (chacun selon SON âge) au lieu de l'âge de Marc pour
     * les deux. `undefined` si pas de conjoint → repli conservateur (aucun crédit
     * d'âge pour le 2e). N'affecte PAS encore les gates de timing (FERR 72, reset REER
     * 71, bonus PSV 75+) qui restent sur l'âge principal — voir BACKLOG.
     */
    ageSpouse?: number;
    /**
     * Nombre d'enfants à charge — sert au seuil d'exemption RAMQ (§6.4).
     * Optionnel, défaut 0.
     */
    childrenCount?: number;
    /**
     * Si vrai, l'utilisateur est exempté de la prime RAMQ (§6.4) — couverture
     * privée par régime employeur/association, livret de réclamation valide,
     * étudiant 18-25, 65+ avec SRG max.
     * Optionnel, défaut false (l'utilisateur paie au public).
     */
    ramqExempt?: boolean;
}

export interface DecemberHelpers {
    calculateFiscalReport: (gross: number, deductions: number, withheld: number, year: number, mc?: boolean, ageOpts?: AgeCreditOptions) => FiscalReport;
    getMarginalRate: (income: number, year: number) => number;
    // ITEM 2d — 4e arg optionnel : impôt brut PROGRESSIF (bande sur le montant majoré).
    // Quand fourni, il remplace le calcul plat (montant majoré × taux marginal).
    calculateDividendTax: (annualDiv: number, marginalRate: number, kind?: 'eligible' | 'non-eligible', progressiveGrossTax?: number) => number;
    // ITEM 2d — taux de majoration du dividende (pour empiler le montant majoré).
    getDividendGrossUpRate?: (kind?: 'eligible' | 'non-eligible') => number;
}

export interface DecemberResult {
    /** Nouveau taxCurrentYear après régularisation (à passer en taxPreviousYear par le caller). */
    newTaxCurrentYear: { revenu: number; gains: number; divers: number; reer: number };
    /** Logs à émettre. */
    logs: string[];
}

export function processDecemberTaxFiling(
    currentMonthIndex: number,
    ctx: DecemberContext,
    helpers: DecemberHelpers,
    taxCurrentYearInitial: { revenu: number; gains: number; divers: number; reer: number },
): DecemberResult {
    if (currentMonthIndex !== 11 || ctx.m === 0) {
        return { newTaxCurrentYear: { ...taxCurrentYearInitial }, logs: [] };
    }
    const logs: string[] = [];
    const taxCurrent = { ...taxCurrentYearInitial };

    // ---- 1. Impôt sur revenu salarial ou retraite ----
    if (!ctx.isRetired) {
        // F9 (audit 2026-05-28) — même facteur de croissance salariale pour Marc et Anna : hissé une fois.
        const salaryGrowthFactor = Math.pow(1 + ctx.simSalaryGrowth / 100, ctx.yearsElapsed);
        const grossMarc = ctx.grossMarcBaseAnnual * salaryGrowthFactor;
        const grossAnna = ctx.grossAnnaBaseAnnual * salaryGrowthFactor;
        const totalDeductions = ctx.accRrspYear + ctx.accFhsaYear + ctx.smithInterestDeductibleYear;
        const grossMarcReal = grossMarc / ctx.inflationFactor;
        const grossAnnaReal = grossAnna / ctx.inflationFactor;
        const deductionsReal = totalDeductions / ctx.inflationFactor;

        // V31: Optimisation fiscale — déductions au salaire le plus élevé
        const deductionsMarc = grossMarcReal > grossAnnaReal ? deductionsReal : 0;
        const deductionsAnna = grossMarcReal > grossAnnaReal ? 0 : deductionsReal;

        // §6.2 — crédits 65+ pour salarié actif 65+ (audit silent-failure FINDING 2).
        // Cas : senior qui continue à travailler après 65 ans.
        // B-AUDIT-3 — chaque conjoint selon SON âge (ctx.age / ctx.ageSpouse) : un 65+ qui
        // travaille a le crédit d'âge, un conjoint <65 ne l'a pas (corrige l'ancien biais
        // qui appliquait l'âge de Marc aux deux). eligiblePensionIncome=0 (aucune pension
        // admissible en mode actif) ; familyIncome = revenu familial (réduction ligne 361).
        const familyGrossReal = grossMarcReal + grossAnnaReal;
        const mkActiveAgeOpts = (a: number | undefined): AgeCreditOptions | undefined =>
            (a !== undefined && a >= 65)
                ? { age: a, eligiblePensionIncome: 0, hasSpouse: ctx.activeUsersCount > 1, familyIncome: familyGrossReal }
                : undefined;
        const ageOptsMarc = mkActiveAgeOpts(ctx.age);
        const ageOptsAnna = mkActiveAgeOpts(ctx.ageSpouse);

        const taxMarcReal = grossMarcReal > 0 ? helpers.calculateFiscalReport(grossMarcReal, deductionsMarc, 0, ctx.loopYear, ctx.enableMonteCarlo, ageOptsMarc).totalTax : 0;
        const taxAnnaReal = grossAnnaReal > 0 ? helpers.calculateFiscalReport(grossAnnaReal, deductionsAnna, 0, ctx.loopYear, ctx.enableMonteCarlo, ageOptsAnna).totalTax : 0;
        const totalAnnualTax = (taxMarcReal + taxAnnaReal) * ctx.inflationFactor;

        // V49: Retenue source (T1213 ou non)
        let taxMarcEmployer = taxMarcReal;
        let taxAnnaEmployer = taxAnnaReal;
        if (!ctx.optimizeSourceDeductions) {
            taxMarcEmployer = grossMarcReal > 0 ? helpers.calculateFiscalReport(grossMarcReal, 0, 0, ctx.loopYear, ctx.enableMonteCarlo, ageOptsMarc).totalTax : 0;
            taxAnnaEmployer = grossAnnaReal > 0 ? helpers.calculateFiscalReport(grossAnnaReal, 0, 0, ctx.loopYear, ctx.enableMonteCarlo, ageOptsAnna).totalTax : 0;
        }
        const totalEmployerTax = (taxMarcEmployer + taxAnnaEmployer) * ctx.inflationFactor;
        const estimatedWithholding = totalEmployerTax * 0.92;

        // V30: Override 12-month approximation
        taxCurrent.revenu = Math.max(-100000, totalAnnualTax - estimatedWithholding);
    } else {
        // ---- Retraité : régularisation au taux marginal réel (MIROIR de la phase active) ----
        //
        // FIX FISCAL CRITIQUE (Marc, 2026-06) — l'ancien code n'ajoutait que 5 % du
        // vrai impôt sur la pension (« 95 % retenu à la source »), MAIS aucune retenue
        // mensuelle n'existe pour les retraités (computeMonthlyWithholding est gardé par
        // `if (!isRetired)`). Et les retraits REER/FERR (ctx.accRetraitsReerYear) étaient
        // EXCLUS de l'assiette imposable → ils restaient au seul taux de retenue à la
        // source (19/24/29 %), jamais réconciliés au taux marginal réel. Résultat :
        // retraités massivement sous-imposés (patrimoine/revenu net surévalués).
        //
        // Assiette imposable retraité = pension (incomeRetirementMonthly×12) + rentes
        // gouvernementales (accRentesYear) + retraits REER/FERR (accRetraitsReerYear,
        // 100 % imposables comme revenu ordinaire). On calcule le VRAI impôt annuel sur
        // cette assiette, par conjoint (crédits d'âge/pension B-AUDIT-3 selon SON âge),
        // en traitement réel puis re-nominal (/ inflationFactor … × inflationFactor).
        //
        // RÉCONCILIATION SANS DOUBLE-COMPTAGE : le bucket `.reer` (taxCurrentYearInitial.reer)
        // contient DÉJÀ la retenue à la source prélevée pendant l'année sur les retraits
        // REER/FERR (via cashflowAllocation/realEstate/meltdown/FERR janvier). Cette retenue
        // sera payée en avril (taxApril débite liquid de revenu+gains+divers+reer). On
        // ajoute donc à `.revenu` SEULEMENT le complément = vrai impôt − retenue déjà
        // captée dans `.reer`. Ainsi la somme des impôts retraité de l'année
        // (`.reer` + complément `.revenu`) == vrai impôt annuel, exactement comme la
        // phase active fait `revenu = totalAnnualTax − estimatedWithholding`. La retenue
        // `.reer` n'est ni ignorée (sinon double imposition) ni recomptée (sinon le
        // complément la ré-ajouterait).
        const basePensionAnnual = (ctx.incomeRetirementMonthly * 12) + ctx.accRentesYear;
        const taxableAnnual = basePensionAnnual + ctx.accRetraitsReerYear;
        if (taxableAnnual > 0) {
            const taxableReal = taxableAnnual / ctx.inflationFactor;
            const n = Math.max(1, ctx.activeUsersCount);

            // A1 — impôt PAR CONJOINT sur SON revenu de retraite réel. Quand le moteur
            // fournit la décomposition par conjoint (`incomeRetirementPerUserMonthly`),
            // on taxe chaque personne sur SA pension RRQ/PSV/DB (qui dépend de son salaire
            // et de sa résidence) + sa part ÉGALE des rentes gouvernementales et des
            // retraits REER/FERR (non attribuables par conjoint dans le modèle actuel).
            // Sinon (solo, ou breakdown absent/incohérent) on retombe sur le split égal
            // historique. Le barème étant progressif, taxer les vrais revenus inégaux
            // donne un impôt ≥ celui du split égal (qui le minimisait).
            const perUserPension = ctx.incomeRetirementPerUserMonthly;
            const usePerUser = ctx.activeUsersCount > 1
                && Array.isArray(perUserPension)
                && perUserPension.length === ctx.activeUsersCount
                && perUserPension.every(v => Number.isFinite(v));

            // Rentes gouvernementales (non attribuables) : part ÉGALE par conjoint, en réel.
            const rentesRealPerAdult = ctx.accRentesYear / ctx.inflationFactor / n;
            // Phase 2 — retraits REER/FERR attribués PAR CONJOINT (accRetraitsReerYearByUser, au
            // prorata des soldes au retrait) : chacun est taxé sur SES vrais retraits au lieu du
            // split 50/50. Le TOTAL imposable est inchangé (Σ == accRetraitsReerYear) ; seule la
            // répartition entre conjoints bouge → impôt plus exact sous barème progressif. Repli
            // égal si l'attribution est absente/incohérente (solo, ou breakdown manquant).
            const perUserReer = ctx.accRetraitsReerYearByUser;
            // Garde-fou (audit fiscal-accuracy) : on n'attribue par conjoint QUE si la somme
            // par conjoint reconstitue bien le total (Σ == accRetraitsReerYear, à epsilon près).
            // Sinon (un retrait non attribué en amont — ex. meltdown oublié), on retombe sur le
            // split égal CONSERVATEUR plutôt que de taxer une assiette sous-comptée (sous-imposition).
            const perUserReerSum = Array.isArray(perUserReer) ? perUserReer.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0) : NaN;
            const useReerPerUser = ctx.activeUsersCount > 1
                && Array.isArray(perUserReer)
                && perUserReer.length === n
                && perUserReer.every(v => Number.isFinite(v))
                && Math.abs(perUserReerSum - ctx.accRetraitsReerYear) <= Math.max(1, Math.abs(ctx.accRetraitsReerYear) * 1e-6);

            // Revenu imposable réel et pension admissible réelle, par conjoint.
            // - splitÉgal : tout le taxable / N (comportement historique).
            // - perUser   : pension_i + part égale des rentes + SES retraits REER (Phase 2).
            const ages = [ctx.age, ctx.ageSpouse];
            const taxableRealByUser: number[] = [];
            const eligiblePensionRealByUser: number[] = [];
            if (usePerUser) {
                for (let i = 0; i < n; i++) {
                    const pensionRealUser = (perUserPension![i] * 12) / ctx.inflationFactor;
                    const reerRealUser = (useReerPerUser ? perUserReer![i] : ctx.accRetraitsReerYear / n) / ctx.inflationFactor;
                    taxableRealByUser.push(pensionRealUser + rentesRealPerAdult + reerRealUser);
                    // eligiblePensionIncome (crédit pension féd ligne 31400 + revenu retraite
                    // QC ligne 361) = pension + rentes gouv., HORS retraits REER (inchangé).
                    eligiblePensionRealByUser.push(pensionRealUser + rentesRealPerAdult);
                }
            } else {
                const incomeIndividualReal = taxableReal / n;
                const eligiblePensionPerAdult = basePensionAnnual / ctx.inflationFactor / n;
                for (let i = 0; i < n; i++) {
                    taxableRealByUser.push(incomeIndividualReal);
                    eligiblePensionRealByUser.push(eligiblePensionPerAdult);
                }
            }

            // §6.2 — crédits 65+ et revenu de retraite (ARC ligne 30100/31400 + Revenu Québec
            // ligne 361). familyIncome inclut tout le revenu imposable (retraits REER compris)
            // pour réduire correctement la ligne 361 QC.
            // B-AUDIT-3 — crédit d'âge/pension PAR conjoint : chacun selon SON âge.
            // Couple de même âge ET revenu → taxMarc + taxAnna == ancien per-adulte × N.
            const mkRetiredAgeOpts = (a: number | undefined, eligible: number): AgeCreditOptions | undefined =>
                a !== undefined
                    ? { age: a, eligiblePensionIncome: eligible, hasSpouse: ctx.activeUsersCount > 1, familyIncome: taxableReal }
                    : undefined;
            // Impôt combiné du ménage pour une répartition imposable donnée (crédits d'âge/pension
            // par conjoint, familyIncome = total inchangé). Le 2e conjoint sans âge → pas de crédit.
            const combinedTaxFor = (taxables: number[]): number => {
                let t = 0;
                for (let i = 0; i < n; i++) {
                    const ageOpts = mkRetiredAgeOpts(ages[i], eligiblePensionRealByUser[i]);
                    t += helpers.calculateFiscalReport(taxables[i], 0, 0, ctx.loopYear, ctx.enableMonteCarlo, ageOpts).totalTax;
                }
                return t;
            };

            // Sans fractionnement (Phase 2). C'est le PLANCHER : le fractionnement étant une élection
            // OPTIONNELLE, on ne le retient que s'il BAISSE l'impôt → impossible d'augmenter à tort.
            let taxReal = combinedTaxFor(taxableRealByUser);

            // === Phase 3 — Fractionnement de pension 65+ ===
            // Transfert de ≤ 50 % du revenu de pension ADMISSIBLE du conjoint au revenu imposable le
            // plus élevé vers l'autre, pour minimiser l'impôt combiné. Admissible (ARC ligne 116 /
            // RQ Annexe Q) : rente viagère DB dès 65 ans ; retraits FERR/RIF dès 72 ans (post-conversion
            // REER→FERR). NON admissibles : RRQ/PSV et retraits REER pré-72 → exclus de l'assiette
            // fractionnable. Repli sûr (aucun fractionnement) si solo, âges inconnus, ou rien d'admissible.
            if (n === 2 && ctx.activeUsersCount > 1 && ctx.age !== undefined && ctx.ageSpouse !== undefined) {
                const dbReal = (i: number) => ((ctx.incomeRetirementDbPerUserMonthly?.[i] ?? 0) * 12) / ctx.inflationFactor;
                const reerReal = (i: number) => (useReerPerUser ? perUserReer![i] : ctx.accRetraitsReerYear / n) / ctx.inflationFactor;
                const splittable = [0, 1].map((i) => {
                    const a = ages[i];
                    if (a === undefined) return 0;
                    return (a >= 65 ? Math.max(0, dbReal(i)) : 0) + (a >= 72 ? Math.max(0, reerReal(i)) : 0);
                });
                const H = taxableRealByUser[0] >= taxableRealByUser[1] ? 0 : 1; // transféreur = plus haut revenu
                const L = 1 - H;
                const maxTransfer = Math.min(0.5 * splittable[H], taxableRealByUser[H]); // ≤ 50 % de l'admissible, borné par l'assiette
                if (maxTransfer > 1) {
                    // Recherche en grille du transfert optimal (impôt combiné convexe en T → 1 min).
                    const STEPS = 40;
                    for (let k = 1; k <= STEPS; k++) {
                        const tr = maxTransfer * (k / STEPS);
                        const cand = taxableRealByUser.slice();
                        cand[H] -= tr; cand[L] += tr;
                        const ct = combinedTaxFor(cand);
                        if (ct < taxReal) taxReal = ct; // on ne garde que si ça BAISSE l'impôt
                    }
                }
            }

            const totalAnnualTax = taxReal * ctx.inflationFactor;
            // Retenue à la source déjà captée sur les retraits REER/FERR de l'année
            // (présente dans le bucket .reer au moment de décembre). On la crédite pour ne
            // payer en avril que la différence avec l'impôt marginal réel.
            const withholdingAlreadyTaken = Number.isFinite(taxCurrent.reer) ? taxCurrent.reer : 0;
            const reconciliation = totalAnnualTax - withholdingAlreadyTaken;
            // Garde-fous NaN/Infinity (comme ailleurs). Le plancher -100000 borne un
            // sur-crédit théorique (retenue REER > impôt réel, p. ex. gros meltdown à
            // 38 % sous un taux marginal faible) → remboursement en avril, cohérent avec
            // la borne de la phase active.
            if (Number.isFinite(reconciliation) && Math.abs(reconciliation) > 1) {
                taxCurrent.revenu += Math.max(-100000, reconciliation);
            }
        }
    }

    // ---- 1.5. RAMQ — prime annuelle régime public d'assurance médicaments (audit §6.4) ----
    // Calculée par adulte sur le revenu familial NET (après déductions REER/FHSA).
    // Si l'utilisateur a une couverture privée (régime employeur/association),
    // passer `ramqExempt: true`.
    {
        let familyNetIncome: number;
        if (ctx.isRetired) {
            // Mode retraité : revenu pension + rentes + retraits REER + gains capitaux
            // accumulés sur l'année. Tous imposables au sens de la ligne 275 TP-1.
            familyNetIncome = (
                ctx.incomeRetirementMonthly * 12
                + ctx.accRentesYear
                + ctx.accRetraitsReerYear
                + ctx.accCapitalGainsYear * CAPITAL_GAINS_INCLUSION_STANDARD
            ) / ctx.inflationFactor;
        } else {
            // Mode actif : revenu brut salarial - déductions REER + FHSA + Smith.
            // FIX audit code-reviewer HIGH 1 : sans soustraction des déductions, RAMQ
            // surestime systématiquement la prime pour les cotisants REER.
            const grossFamily = (ctx.grossMarcBaseAnnual + ctx.grossAnnaBaseAnnual)
                * Math.pow(1 + ctx.simSalaryGrowth / 100, ctx.yearsElapsed);
            const deductions = ctx.accRrspYear + ctx.accFhsaYear + ctx.smithInterestDeductibleYear;
            familyNetIncome = Math.max(0, grossFamily - deductions) / ctx.inflationFactor;
        }
        const ramqPerAdult = calculateRamqPremium(
            familyNetIncome,
            {
                hasSpouse: ctx.activeUsersCount > 1,
                childrenCount: ctx.childrenCount ?? 0,
                exempt: !!ctx.ramqExempt,
            },
            ctx.loopYear,  // indexation seuils + prime max
        );
        const ramqTotal = ramqPerAdult * ctx.activeUsersCount * ctx.inflationFactor;
        if (ramqTotal > 0) {
            taxCurrent.divers += ramqTotal;
            logs.push(`💊 RAMQ médicaments: ${Math.round(ramqTotal).toLocaleString('fr-CA')}$/an (${Math.round(ramqPerAdult)}$/adulte)`);
        }
    }

    // ---- 1.6. FSS — Cotisation au Fonds des services de santé (audit §6.1) ----
    // Applicable aux retraités et autres revenus non salariaux. Les salariés
    // sont couverts par leur employeur (cotisation employeur, hors scope ici).
    //
    // Limitations connues (audit silent-failure §6.1) :
    //  1. Le mode actif est exclu du calcul FSS individuel. Un travailleur
    //     autonome (auto-employé) ou un actif avec revenu d'entreprise
    //     individuelle devrait payer FSS. FinanceAI n'expose pas encore le
    //     flag `User.hasSelfEmployedIncome` — à ajouter dans une future PR.
    //  2. `individualNetIncome` est calculé comme moyenne (revenu_famille /
    //     activeUsersCount). Pour des conjoints aux revenus très asymétriques,
    //     la cotisation FSS familiale peut être imprécise (la moyenne sous-
    //     estime la cotisation du conjoint le plus aisé). Approximation
    //     acceptable pour projections long terme — précision exacte nécessite
    //     un suivi individuel des revenus retraite (hors scope §6.1).
    if (ctx.isRetired) {
        const individualNetIncome = (
            ctx.incomeRetirementMonthly * 12
            + ctx.accRentesYear
            + ctx.accRetraitsReerYear
            + ctx.accCapitalGainsYear * CAPITAL_GAINS_INCLUSION_STANDARD
        ) / ctx.activeUsersCount / ctx.inflationFactor;
        const fssPerAdult = calculateFSSPremium(individualNetIncome, ctx.loopYear);
        const fssTotal = fssPerAdult * ctx.activeUsersCount * ctx.inflationFactor;
        if (fssTotal > 0) {
            taxCurrent.divers += fssTotal;
            logs.push(`🏥 FSS (ligne 446): ${Math.round(fssTotal).toLocaleString('fr-CA')}$/an (${Math.round(fssPerAdult)}$/adulte)`);
        }
    }

    // ---- 2. Gains en capital accumulés (palier 250k) ----
    if (ctx.accCapitalGainsYear > 0) {
        const incomeForGains = ctx.isRetired
            ? (ctx.incomeRetirementMonthly * 12 + ctx.accRentesYear + ctx.accRetraitsReerYear)
            : (ctx.grossMarcBaseAnnual + ctx.grossAnnaBaseAnnual) * Math.pow(1 + ctx.simSalaryGrowth / 100, ctx.yearsElapsed);

        // Inclusion gains capitaux: 50% uniforme (annulation 66.67% > 250k$ mars 2025).
        const taxableCapGains = ctx.accCapitalGainsYear * CAPITAL_GAINS_INCLUSION_STANDARD;

        // B-AUDIT-2 — impôt INCRÉMENTAL empilé (progressif) plutôt qu'un taux marginal
        // plat. Les gains s'empilent SUR le revenu : on impose la BANDE
        // [revenu, revenu+gains] = impôt(revenu+gains) − impôt(revenu), au lieu de taxer
        // tout le gain au taux d'ENTRÉE (ce qui sous-estimait l'impôt quand un gros gain
        // franchit un palier). Calculé par adulte (le revenu est familial) puis ×N. Le
        // BPA s'annule dans la soustraction ; un gain qui reste dans le même palier donne
        // un incrément ≈ gain × taux marginal (cohérent avec l'ancien comportement).
        const perAdultIncome = incomeForGains / ctx.activeUsersCount;
        const perAdultGains = taxableCapGains / ctx.activeUsersCount;
        const taxBase = helpers.calculateFiscalReport(perAdultIncome, 0, 0, ctx.loopYear, true).totalTax;
        const taxTop = helpers.calculateFiscalReport(perAdultIncome + perAdultGains, 0, 0, ctx.loopYear, true).totalTax;
        const tax = Math.max(0, taxTop - taxBase) * ctx.activeUsersCount;
        taxCurrent.gains += tax;
        if (tax > 100) logs.push(`↳ Impôt Gains Cap Accumulés: +${Math.round(tax).toLocaleString('fr-CA')}$`);
    }

    // ---- 3. Dividendes Non-Reg (30% du rendement) ----
    if (ctx.nonReg > 0) {
        const annualDiv = ctx.nonReg * (ctx.baseNonRegRate / 100) * 0.30;
        const incomeForDiv = (ctx.isRetired
            ? (ctx.incomeRetirementMonthly * 12 + ctx.accRentesYear)
            : (ctx.grossMarcBaseAnnual + ctx.grossAnnaBaseAnnual) * Math.pow(1 + ctx.simSalaryGrowth / 100, ctx.yearsElapsed)
        ) / ctx.activeUsersCount;
        const currentMarginal = helpers.getMarginalRate(incomeForDiv, ctx.loopYear);
        // ITEM 2d — empilement PROGRESSIF du dividende majoré (comme B-AUDIT-2 pour les
        // gains). Le dividende MAJORÉ (gross-up) s'empile sur le revenu : l'impôt brut =
        // bande [revenu, revenu+majoré] par adulte, ×N. L'ancien taux marginal PLAT au
        // revenu de base sous-estimait (voire annulait via le crédit d'impôt dividende)
        // l'impôt d'un gros dividende franchissant un palier. Le crédit (CID) reste géré
        // dans calculateDividendTax. Repli sur le plat si le helper gross-up est absent.
        const grossUpRate = helpers.getDividendGrossUpRate ? helpers.getDividendGrossUpRate('eligible') : undefined;
        let progressiveGrossTax: number | undefined;
        if (grossUpRate !== undefined) {
            const annualDivPerAdult = annualDiv / ctx.activeUsersCount;
            const grossedUpPerAdult = annualDivPerAdult * grossUpRate;
            const taxBase = helpers.calculateFiscalReport(incomeForDiv, 0, 0, ctx.loopYear, true).totalTax;
            const taxTop = helpers.calculateFiscalReport(incomeForDiv + grossedUpPerAdult, 0, 0, ctx.loopYear, true).totalTax;
            progressiveGrossTax = Math.max(0, taxTop - taxBase) * ctx.activeUsersCount;
        }
        const divTax = helpers.calculateDividendTax(annualDiv, currentMarginal, 'eligible', progressiveGrossTax);
        if (divTax > 1) taxCurrent.gains += divTax;
    }

    return { newTaxCurrentYear: taxCurrent, logs };
}
