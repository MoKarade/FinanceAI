// services/projection/taxDecember.ts
// Cycle 23 split (depuis taxCycle.ts): blocs fiscaux de décembre.
// Cycle 10 (computeOasClawback, processTaxLossHarvesting): décembre = mois 11.
// Cycle 11 (processDecemberTaxFiling): régularisation annuelle d'impôt.

import { OAS_CLAWBACK_THRESHOLD_2026, CAPITAL_GAINS_INCLUSION_STANDARD, firstCombinedBracketTopForYear, calculateRamqPremium, calculateFSSPremium, type FiscalReport, type AgeCreditOptions } from '../../utils/tax';

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
    // FA-2 (audit fiscal 2026-06-09) — décomposition PAR CONJOINT. Le seuil de récupération
    // PSV est PAR PARTICULIER (ARC) : comparer le revenu FAMILIAL au seuil individuel créait
    // un clawback fictif jusqu'à ~14 k$/an pour un couple 95-190 k$. Optionnels = rétro-compat
    // (absents → repli split égal, déjà bien meilleur que l'agrégat familial).
    activeUsersCount: number = 1,
    perUserIncomeMonthly?: number[],
    perUserReerAnnual?: number[],
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
    const psvAnnualBase = psvBasePension * 12 * nominalIncomeFactor;

    // FA-2 — clawback PAR CONJOINT : revenu_i vs seuil INDIVIDUEL, plafonné à SA part de PSV.
    // Gardes-fous symétriques aux autres décompositions (Number.isFinite + somme cohérente) ;
    // repli = split ÉGAL par adulte (jamais l'agrégat familial vs seuil individuel — le bug).
    // Limites assumées (doc §6) : part de PSV répartie également (psvStartAge par conjoint non
    // différencié ici) ; revenus locatifs répartis également (non attribuables).
    const n = Math.max(1, activeUsersCount);
    // Garde SYMÉTRIQUE à validReer (retour silent-failure-hunter) : une décomposition finie
    // mais DÉSYNCHRONISÉE du total (bug amont) ne doit pas passer — Σ(perUser) ≈ total.
    const incomeSum = Array.isArray(perUserIncomeMonthly)
        ? perUserIncomeMonthly.reduce((s, v) => s + (Number.isFinite(v) ? v : NaN), 0)
        : NaN;
    const validIncome = Array.isArray(perUserIncomeMonthly)
        && perUserIncomeMonthly.length === n
        && Number.isFinite(incomeSum)
        && Math.abs(incomeSum - incomeRetirementMonthly) <= Math.max(1, Math.abs(incomeRetirementMonthly) * 1e-6);
    const reerSum = Array.isArray(perUserReerAnnual)
        ? perUserReerAnnual.reduce((s, v) => s + (Number.isFinite(v) ? v : NaN), 0)
        : NaN;
    const validReer = Array.isArray(perUserReerAnnual)
        && perUserReerAnnual.length === n
        && Number.isFinite(reerSum)
        && Math.abs(reerSum - accRetraitsReerYear) <= Math.max(1, Math.abs(accRetraitsReerYear) * 1e-6);

    const psvCapPerUser = psvAnnualBase / n;
    let clawbackAnnual = 0;
    for (let i = 0; i < n; i++) {
        const incomeUser = (validIncome ? perUserIncomeMonthly![i] * 12 : (incomeRetirementMonthly * 12) / n)
            + (validReer ? perUserReerAnnual![i] : accRetraitsReerYear / n)
            + accRentesYear / n;
        const excess = incomeUser - OAS_THRESHOLD;
        if (excess > 0) clawbackAnnual += Math.min(psvCapPerUser, excess * 0.15);
    }

    if (clawbackAnnual > 1) {
        return {
            clawbackAnnual,
            logMsg: `⚠️ PSV Clawback prévu: -${Math.round(clawbackAnnual).toLocaleString('fr-CA')}$/an`,
        };
    }
    return { clawbackAnnual };
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
 * Récolte de GAINS en capital (tax-gain harvesting) — complément du TLH. Levier `gainHarvesting`.
 * Dans une année à FAIBLE revenu (typiquement le « creux » de retraite anticipée avant les rentes),
 * réalise volontairement des gains non-enregistrés latents pour REMPLIR le 1er palier d'impôt
 * (vente + rachat immédiat → l'ACB monte d'autant). Les gains sont alors imposés MAINTENANT à un
 * taux bas, ce qui réduit l'impôt sur les gains futurs (quand le revenu sera plus élevé).
 *
 * Revenu NOMINAL comparé au 1er palier indexé de l'ANNÉE (firstCombinedBracketTopForYear, MÊME
 * indexation ×1,02/an que l'impôt réel du moteur → l'objectif de remplissage vise exactement le
 * palier où l'impôt est calculé, quel que soit simInflation). Assiette imposée = revenu autre +
 * 50 % des gains. On réalise jusqu'à ce que cette assiette atteigne le plafond. Le gain réalisé est
 * ajouté à accCapitalGainsYear (donc imposé en décembre, au barème progressif empilé) ET l'ACB est
 * relevé du même montant (pas de fuite : le gain est bien imposé l'année où on relève l'ACB).
 * Conservateur : ne réalise jamais au-delà du gain latent disponible ni au-delà du palier bas.
 */
export function processGainHarvesting(opts: {
    enabled: boolean;
    nonReg: number;
    nonRegACB: number;
    /** Revenu imposable AUTRE que les gains, nominal (salaire, ou pension+rentes+retraits REER). */
    otherTaxableNominal: number;
    /** Gains déjà réalisés cette année (accCapitalGainsYear), nominal. */
    existingGainsNominal: number;
    activeUsersCount: number;
    /** Année de la projection (sert à indexer le 1er palier, comme l'impôt réel). */
    loopYear: number;
    /** [PV-2] Banque de pertes en capital (TLH) disponible — les gains récoltés la consomment
     *  D'ABORD (LIR 111(1)(b)) : part compensée = SANS impôt et HORS palier. Absent → 0. */
    capitalLossBank?: number;
}): { harvestedGain: number; consumedLoss: number; logMsg?: string } {
    if (!opts.enabled) return { harvestedGain: 0, consumedLoss: 0 };
    const unrealized = opts.nonReg - opts.nonRegACB;
    if (!(unrealized > 1)) return { harvestedGain: 0, consumedLoss: 0 };
    // [PV-2] Récolte « GRATUITE » d'abord : les gains compensés par la banque de pertes
    // (report de pertes nettes en capital, LIR 111(1)(b)) sont imposables à 0 $ et
    // n'occupent AUCUNE place dans le palier → ACB relevé sans impôt, quel que soit le
    // revenu de l'année. Avant : la banque était ignorée → impôt payé sur des gains
    // compensables (conservateur, sous-optimal) et place de palier gaspillée.
    // Garde Number.isFinite ISOLANTE (revue silent-failure) : une banque NaN/±Inf ne doit
    // pas empoisonner freeGain→harvestedGain et désactiver TOUT le levier (la branche
    // palier reste fonctionnelle) — précédent FA-2 du fichier : garde déterministe sans
    // logger (fonction pure de la boucle chaude, worker-safe).
    const rawBank = opts.capitalLossBank ?? 0;
    const bank = Number.isFinite(rawBank) ? Math.max(0, rawBank) : 0;
    const freeGain = Math.min(unrealized, bank);
    const remainingUnrealized = unrealized - freeGain;
    const n = Math.max(1, opts.activeUsersCount);
    // Plafond du 1er palier combiné (le plus restrictif QC/féd), indexé à l'année, par tête × N.
    const bracketTopNominal = firstCombinedBracketTopForYear(opts.loopYear) * n;
    // Part imposable déjà occupée = revenu autre + 50 % des gains déjà réalisés cette année.
    const occupied = opts.otherTaxableNominal + Math.max(0, opts.existingGainsNominal) * CAPITAL_GAINS_INCLUSION_STANDARD;
    const roomTaxable = bracketTopNominal - occupied;
    // gain réalisable tel que 50 % × gain ≤ room → gain ≤ room / 0,5 (sur le latent restant).
    const bracketGain = roomTaxable > 0
        ? Math.min(remainingUnrealized, roomTaxable / CAPITAL_GAINS_INCLUSION_STANDARD)
        : 0;
    const harvestedGain = freeGain + bracketGain;
    if (!(harvestedGain > 1)) return { harvestedGain: 0, consumedLoss: 0 };
    const freeNote = freeGain > 0.5
        ? ` dont ${Math.round(freeGain).toLocaleString('fr-CA')}$ compensés par la banque de pertes (0$ d'impôt)`
        : '';
    // Libellé honnête (revue) : « au palier bas » seulement si une part remplit RÉELLEMENT le
    // palier — une récolte 100 % compensée peut avoir lieu palier PLEIN.
    const where = bracketGain > 0.5 ? ' réalisés au palier bas' : ' réalisés';
    return {
        harvestedGain,
        consumedLoss: freeGain,
        logMsg: `🌱 Récolte de gains: +${Math.round(harvestedGain).toLocaleString('fr-CA')}$${where} (ACB relevé)${freeNote}`,
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
     * FA-3a (audit fiscal 2026-06-09) — SRG mensuel familial INCLUS dans
     * `incomeRetirementMonthly` (c'est du revenu cash) mais NON IMPOSABLE (Service
     * Canada) : soustrait de toutes les assiettes fiscales de décembre. Optionnel
     * (absent → 0, rétro-compat).
     */
    incomeRetirementGisMonthly?: number;
    /**
     * A1 — revenu de retraite mensuel ATTRIBUABLE à chaque conjoint (RRQ+PSV+DB),
     * issu de `computeRetirementIncome().perUser[i].total`. Quand fourni (couple),
     * l'impôt de retraite de décembre est calculé en taxant chaque conjoint sur SON
     * revenu réel (RRQ/PSV dépendent du salaire et de la résidence individuels) plutôt
     * que sur la moitié du ménage — corrige la sous-estimation due au split égal sous
     * un barème progressif. La somme == `incomeRetirementMonthly`.
     *
     * Limite : les revenus LOCATIFS (`accRentesYear` — des loyers, PAS des rentes : cf
     * realEstateMonth.ts:355, confusion à l'origine du bug FA-1) et les retraits REER/FERR
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

    // FA-3a — SRG mensuel à exclure des assiettes, HOISTÉ une fois avec garde NaN
    // (même piège que la garde DB de FA-1 : `?? 0` ne capte PAS NaN, et Math.max(0, NaN)=NaN
    // sauterait silencieusement TOUT l'impôt annuel via `if (taxableAnnual > 0)`).
    const gisMonthlySafe = Number.isFinite(ctx.incomeRetirementGisMonthly)
        ? Math.max(0, ctx.incomeRetirementGisMonthly as number)
        : 0;

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
        // NB : accRentesYear = revenus LOCATIFS annuels (loyers, realEstateMonth.ts:355) —
        // imposables comme revenu ordinaire, mais JAMAIS admissibles au crédit pension (FA-1).
        // FA-3a : le SRG (non imposable) est RETIRÉ de l'assiette — il reste du revenu cash.
        const basePensionAnnual = ((ctx.incomeRetirementMonthly - gisMonthlySafe) * 12) + ctx.accRentesYear;
        const taxableAnnual = basePensionAnnual + ctx.accRetraitsReerYear;
        if (taxableAnnual > 0) {
            const taxableReal = taxableAnnual / ctx.inflationFactor;
            const n = Math.max(1, ctx.activeUsersCount);

            // A1 — impôt PAR CONJOINT sur SON revenu de retraite réel. Quand le moteur
            // fournit la décomposition par conjoint (`incomeRetirementPerUserMonthly`),
            // on taxe chaque personne sur SA pension RRQ/PSV/DB (qui dépend de son salaire
            // et de sa résidence) + sa part ÉGALE des revenus locatifs (accRentesYear) et des
            // retraits REER/FERR (non attribuables par conjoint dans le modèle actuel).
            // Sinon (solo, ou breakdown absent/incohérent) on retombe sur le split égal
            // historique. Le barème étant progressif, taxer les vrais revenus inégaux
            // donne un impôt ≥ celui du split égal (qui le minimisait).
            const perUserPension = ctx.incomeRetirementPerUserMonthly;
            const usePerUser = ctx.activeUsersCount > 1
                && Array.isArray(perUserPension)
                && perUserPension.length === ctx.activeUsersCount
                && perUserPension.every(v => Number.isFinite(v));

            // Revenus LOCATIFS (accRentesYear = loyers, cf realEstateMonth.ts:355 — PAS des
            // rentes ; non attribuables par conjoint) : part ÉGALE par conjoint, en réel.
            const rentalRealPerAdult = ctx.accRentesYear / ctx.inflationFactor / n;
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

            // FA-1 (audit fiscal 2026-06-09) — assiette du crédit pension (féd ligne 31400 + QC
            // ligne 361) CORRIGÉE : l'ancienne assiette (pension RRQ/PSV/DB + accRentesYear)
            // incluait RRQ/PSV (EXCLUS par l'ARC et RQ) et les revenus LOCATIFS (accRentesYear =
            // loyers, jamais admissibles) → crédit surévalué ~250-680 $/an/personne 65+.
            // Bonne assiette dans ce modèle = la MÊME que l'assiette FRACTIONNABLE (ligne 116 /
            // Annexe Q, #211) : rente DB dès 65 ans + retraits FERR dès 72 ans (proxy de la
            // conversion REER→FERR à 72). Réf. FISCAL_REFERENCE §4.
            // Garde-fou symétrique à perUserPension/perUserReer (l.327-349) : `?? 0` ne capte PAS
            // NaN — un NaN traverserait Math.max(0, NaN)=NaN puis serait avalé par safe() en aval
            // (crédit zéroté en silence). Number.isFinite par valeur, repli 0 conservateur.
            const dbRealUser = (i: number): number => {
                const v = ctx.incomeRetirementDbPerUserMonthly?.[i];
                return Number.isFinite(v) ? ((v as number) * 12) / ctx.inflationFactor : 0;
            };
            const reerRealUser = (i: number): number => (useReerPerUser ? perUserReer![i] : ctx.accRetraitsReerYear / n) / ctx.inflationFactor;
            const eligiblePensionFor = (i: number): number => {
                const a = ages[i];
                if (a === undefined) return 0;
                return (a >= 65 ? Math.max(0, dbRealUser(i)) : 0) + (a >= 72 ? Math.max(0, reerRealUser(i)) : 0);
            };

            const taxableRealByUser: number[] = [];
            const eligiblePensionRealByUser: number[] = [];
            if (usePerUser) {
                for (let i = 0; i < n; i++) {
                    // FA-3a : la part de SRG (familial → répartie également) est retirée du
                    // revenu IMPOSABLE de chaque conjoint (perUser[i].total l'inclut).
                    const pensionRealUser = Math.max(0, ((perUserPension![i] - gisMonthlySafe / n) * 12) / ctx.inflationFactor);
                    taxableRealByUser.push(pensionRealUser + rentalRealPerAdult + reerRealUser(i));
                    eligiblePensionRealByUser.push(eligiblePensionFor(i));
                }
            } else {
                const incomeIndividualReal = taxableReal / n;
                for (let i = 0; i < n; i++) {
                    taxableRealByUser.push(incomeIndividualReal);
                    eligiblePensionRealByUser.push(eligiblePensionFor(i));
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
            // PV-3 : l'assiette du crédit pension (féd 31400 / QC 361) est passée PAR APPEL — elle
            // SUIT le revenu de pension fractionné vers le récipiendaire (ARC : le bénéficiaire du
            // fractionnement peut réclamer le crédit sur la pension reçue). Défaut = assiette
            // pré-split (cas sans fractionnement, comportement inchangé).
            const combinedTaxFor = (taxables: number[], eligibles: number[] = eligiblePensionRealByUser): number => {
                let t = 0;
                for (let i = 0; i < n; i++) {
                    const ageOpts = mkRetiredAgeOpts(ages[i], eligibles[i]);
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
                // FA-1 : assiette fractionnable == assiette du crédit pension (mêmes règles
                // ARC/RQ dans ce modèle) → helper partagé eligiblePensionFor, plus de doublon.
                const splittable = [0, 1].map((i) => eligiblePensionFor(i));
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
                        // PV-3 : le transfert `tr` est INTÉGRALEMENT de la pension admissible (borné par
                        // 0,5 × splittable[H]) → il déplace AUSSI l'assiette du crédit pension : le
                        // récipiendaire L gagne le crédit sur la pension reçue, le transféreur H le perd
                        // sur la part cédée (calculateFiscalReport plafonne chacun au max féd/QC).
                        const eligCand = eligiblePensionRealByUser.slice();
                        // H : clamp défensif (jamais binding — tr ≤ 0,5×splittable[H] ≤ eligCand[H]).
                        // L : pas de clamp (eligCand[L] ≥ 0 et tr > 0 ⇒ somme toujours positive).
                        eligCand[H] = Math.max(0, eligCand[H] - tr);
                        eligCand[L] += tr;
                        const ct = combinedTaxFor(cand, eligCand);
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
            // FA-3a : SRG exclu. Justification exacte : le SRG entre dans le revenu NET (148→275)
            // mais est déduit au revenu IMPOSABLE (295 QC / 25000 féd) ; pour la RAMQ, l'exclusion
            // est une approximation SANS effet pratique (prestataire SRG ≈ sous l'exemption de
            // prime) qui va dans le sens de l'exemption réelle.
            familyNetIncome = (
                (ctx.incomeRetirementMonthly - gisMonthlySafe) * 12
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
        // FA-3a : SRG exclu du revenu net individuel (non imposable).
        const individualNetIncome = (
            (ctx.incomeRetirementMonthly - gisMonthlySafe) * 12
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
        // FA-3a : SRG exclu de l'assiette d'empilement (non imposable).
        const incomeForGains = ctx.isRetired
            ? ((ctx.incomeRetirementMonthly - gisMonthlySafe) * 12 + ctx.accRentesYear + ctx.accRetraitsReerYear)
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
        // FA-3a : SRG exclu de l'assiette d'empilement (non imposable).
        const incomeForDiv = (ctx.isRetired
            ? ((ctx.incomeRetirementMonthly - gisMonthlySafe) * 12 + ctx.accRentesYear)
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
