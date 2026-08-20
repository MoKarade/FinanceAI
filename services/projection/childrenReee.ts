// services/projection/childrenReee.ts
// Cycle 14: traitement mensuel d'un enfant — dépenses enfant, RQAP, REEE,
// études et fermeture REEE.
//
// Pattern: Pure Return — la fonction retourne tous les deltas, le caller
// les applique sur ses propres variables locales.
// Injection: calculateFiscalReport passé en argument (évite dep circulaire
// avec utils/tax).

import type { ChildGoal } from '../../types';
import { RQAP_MAX_INCOME, type FiscalReport } from '../../utils/tax';
import {
    DAYCARE_INFO, SCHOOL_INFO, ACTIVITIES_INFO, UNI_INFO, CAR_INFO,
    type DaycareType, type SchoolType, type ActivitiesLevel,
    type UniversityType, type CarGift,
} from './childCosts';

// ── Constantes fiscales REEE — SCEE / IQEE ──────────────────────────────────────
// Source de vérité : docs/FISCAL_REFERENCE.md § « REEE — SCEE / IQEE » (FISC-REEE-CONST).
// SCEE (Subvention canadienne pour l'épargne-études, ARC) : 20 % de la cotisation,
// max 500 $/an (1 000 $/an en rattrapage), 7 200 $ à vie par bénéficiaire.
const SCEE_GRANT_RATE = 0.20;
const SCEE_ANNUAL_GRANT_BASIC = 500;
const SCEE_ANNUAL_GRANT_CATCHUP = 1000;
const SCEE_LIFETIME_GRANT_LIMIT = 7200;
// IQEE (Incitatif québécois à l'épargne-études, Revenu Québec) : 10 % de la cotisation,
// max 250 $/an (500 $/an en rattrapage), 3 600 $ à vie par bénéficiaire.
const IQEE_GRANT_RATE = 0.10;
const IQEE_ANNUAL_GRANT_BASIC = 250;
const IQEE_ANNUAL_GRANT_CATCHUP = 500;
const IQEE_LIFETIME_GRANT_LIMIT = 3600;
// Plafond de cotisation REEE à vie (ARC §6.9 / F13) + cotisations annuelles visées pour
// capter la pleine subvention (5 000 $/an en rattrapage tant que SCEE < max théorique).
const REEE_LIFETIME_LIMIT_PER_BENEFICIARY = 50000;
const REEE_TARGET_ANNUAL_CONTRIB_BASIC = 2500;
const REEE_TARGET_ANNUAL_CONTRIB_CATCHUP = 5000;
// Impôt sur le Paiement de Revenu Accumulé (PRA) à la fermeture du REEE : APPROXIMATION
// de modèle (~20 %), PAS un taux combiné officiel ARC/RQ — à raffiner (BACKLOG FISC-REEE-AIP-MODEL).
// Biais : frappe le solde TOTAL (cotisations + gains) → SUR-impose les cotisations remboursées
// sans impôt, et SOUS-impose si le taux marginal + la surtaxe PRA de 20 % dépasse 20 %.
const REEE_AIP_TAX_RATE = 0.20;

// ── RQAP — congé parental ───────────────────────────────────────────────────────
// Source de vérité du PLAFOND : `RQAP_MAX_INCOME` (`utils/tax.ts`, FISCAL_REFERENCE §2).
// Il était RECOPIÉ ici en dur à 98 000 $ — la valeur 2025 — pendant que la source unique portait
// 103 000 $. Écart MESURÉ : 2 750 $/an de prestation brute manquante pour un 2e parent au-dessus
// du plafond (`[RQAP-CAP-98K]`).
//
// ⚠️ TAUX DE REMPLACEMENT — DIVERGENCE ASSUMÉE ET DOCUMENTÉE, pas une valeur à « sourcer ».
// Le régime de BASE du RQAP ne verse pas un taux plat : il verse 70 % pendant les semaines de
// maternité/paternité et le début du parental, puis 55 % pour le reste. Le moteur applique 55 %
// sur les 12 mois, donc il SOUS-ESTIME le début du congé.
// Le corriger fidèlement demanderait de modéliser le nombre de semaines par prestation ET le choix
// entre régime de base et régime particulier — que l'app ne saisit nulle part. C'est une décision
// PRODUIT, pas un correctif : ticket `[RQAP-PHASES-70-55]`. En attendant, la constante est NOMMÉE
// pour que la divergence soit lisible plutôt que noyée dans un `* 0.55`.
const RQAP_REPLACEMENT_RATE_BASE = 0.55;

/**
 * Indexation du plafond de revenu assurable RQAP.
 *
 * ⚠️ C'était `98000 * expenseMultiplier`, et le multiplicateur était le MAUVAIS index — pas
 * seulement imprécis, structurellement faux :
 *   • `expenseMultiplier` compose l'inflation des DÉPENSES DU MÉNAGE, courbe du sourire de retraite
 *     comprise (`computeEffectiveExpenseInflation` dépend de `age` et `isRetired`) ;
 *   • et il est GELABLE par Guyton-Klinger. MESURÉ : à l'année 20, un gel de la règle de
 *     décaissement faisait passer l'assiette RQAP de 80 092 $ à 53 900 $. Aucune stratégie de
 *     portefeuille ne peut déplacer un plafond gouvernemental.
 *
 * Le plafond RQAP est indexé sur la rémunération hebdomadaire moyenne au Québec — la même nature
 * que le MGA de la RRQ, que ce dépôt projette DÉJÀ à `inflation + 0,5 %/an`
 * (`retirementIncome.ts`, FISCAL_REFERENCE §6). On réutilise ce patron plutôt que d'en inventer un.
 */
const rqapCapProjected = (simInflation: number, yearsElapsed: number): number =>
    RQAP_MAX_INCOME * Math.pow(1 + (simInflation + 0.5) / 100, yearsElapsed);

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
    /**
     * [ENG-DIVORCE-REEE-COTISATIONS] Part des COTISATIONS REEE qui reste à la charge du déclarant.
     *
     * Décision Marc 2026-08-17 : les cotisations suivent le partage **PATRIMONIAL** (`keep`,
     * cumulé au fil des divorces), comme le SOLDE du régime — et NON la garde des enfants, qui
     * pilote les coûts. `docs/decisions.md` laissait la question ouverte ; Marc l'a tranchée.
     *
     * ⚠️ Optionnel à défaut NEUTRE (1) : hors divorce, la projection est BIT-IDENTIQUE, donc
     * aucun code de migration et aucune rétrocompat à écrire.
     */
    reeeContribShare?: number;
    /**
     * [ENG-DIVORCE-BENEFITS-FLUX] Part des ENFANTS qui reste à la charge du déclarant (garde).
     *
     * ⚠️ APPLIQUÉE ICI, À LA SOURCE, et plus par l'appelant. La première version multipliait
     * quelques champs du RÉSULTAT dans `projection.ts` — et c'était structurellement condamné :
     * chaque montant d'enfant alimente 3 à 5 registres (liquidités, dépenses du mois, coût brut,
     * coût mensuel, allocations, retrait REEE), et partager le résultat oblige à se souvenir de
     * TOUS. Deux ont été oubliés, mesurés par deux agents indépendants :
     *   • les ALLOCATIONS étaient encaissées à 100 % (`monthlyIncomeDelta` non partagé) mais
     *     publiées à 50 % — 332 $/mois encaissés contre 166 $ affichés, 75 957 $ d'écart sur le
     *     patrimoine final ;
     *   • le DÉCAISSEMENT REEE d'études restait entier face à une dépense à 50 % — +1 450 $/mois
     *     de trésorerie née de nulle part, et le régime de l'enfant vidé 2× trop vite.
     * En partageant le MONTANT plutôt que ses reflets, tout dérivé suit par construction. C'est la
     * classe maison « un flux alimente PLUSIEURS registres », traitée à la racine cette fois.
     *
     * ⚠️ Ne s'applique PAS au RQAP ni à l'économie de transport du congé parental : ceux-là
     * dépendent du congé de l'ex-conjoint, pas de la garde. Ni aux cotisations REEE, qui suivent
     * le partage patrimonial (`reeeContribShare`).
     * ⚠️ Optionnel à défaut NEUTRE (1) ⇒ hors divorce, projection BIT-IDENTIQUE.
     */
    childCustodyShare?: number;
}

export interface ChildTickResult {
    liquidDelta: number;
    /**
     * [ENG-DIVORCE-CHILDREN-REEE] `liquidDelta` VENTILÉ par CLÉ DE PARTAGE, parce que les deux
     * familles ne suivent PAS la même règle après un divorce :
     *   • `liquidDeltaCosts` — coûts d'enfants (frais de naissance, voiture) → suivent la GARDE ;
     *   • `liquidDeltaReee`  — flux REEE (cotisations, décaissement) → suivent le partage
     *     PATRIMONIAL `keep`, comme le SOLDE du régime (`reee *= keep`).
     * ⚠️ Invariant : `liquidDeltaCosts + liquidDeltaReee === liquidDelta`, sous test. Sans cette
     * séparation, appliquer une part au flux entier diviserait aussi les cotisations REEE — un faux
     * SILENCIEUX. C'est le motif « un flux alimente PLUSIEURS registres », déjà au dossier.
     */
    liquidDeltaCosts: number;
    liquidDeltaReee: number;
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
        m, loopYear, simSalaryGrowth, simInflation, expenseMultiplier, isRetired,
        grossAnnaBaseAnnual, incomeAnna, liquid, reee,
        householdGross, trackerScee, trackerIqee,
        trackerReeeContribLifetime, enableMonteCarlo,
    } = ctx;
    // Défaut neutre : un `undefined` (appelant d'avant, test existant) vaut « part entière ».
    const reeeContribShare = Number.isFinite(ctx.reeeContribShare) ? Number(ctx.reeeContribShare) : 1;
    const custody = Number.isFinite(ctx.childCustodyShare) ? Number(ctx.childCustodyShare) : 1;

    const childId = child.id || `enfant_${childIdx}`;

    let liquidDelta = 0;
    let liquidDeltaCosts = 0;
    let liquidDeltaReee = 0;
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
        // ⚠️ Part de garde au MONTANT, pas à ses reflets — voir `childCustodyShare` dans le ctx.
        const fraisNaissance = (child.initialCost ?? 0) * custody;
        liquidDelta -= fraisNaissance;
        liquidDeltaCosts -= fraisNaissance;
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

        // Congé parental « Anna » (2e parent) : UNIQUEMENT si un 2e parent existe
        // et a un salaire. Sans ce garde-fou, un PARENT SEUL (grossAnnaBaseAnnual=0)
        // recevait un RQAP fantôme : calculateFiscalReport(0) renvoie un net POSITIF
        // (crédits remboursables QC sur revenu nul) → newIncomeAnna > 0 = revenu d'un
        // 2e parent inexistant. (Le congé du parent seul n'est pas modélisé ici — à
        // faire séparément ; au minimum on ne fabrique plus de revenu.)
        const annaIsOnMatLeave = childAgeMonths < 12 && grossAnnaBaseAnnual > 0;
        if (annaIsOnMatLeave) {
            const yearsElapsed = Math.floor(m / 12);
            const annaGrossAnnual = grossAnnaBaseAnnual * Math.pow(1 + simSalaryGrowth / 100, yearsElapsed);
            const rqapCap = rqapCapProjected(simInflation, yearsElapsed);
            const eligibleSalary = Math.min(annaGrossAnnual, rqapCap);

            const rqapNetInfo = calculateFiscalReport(
                eligibleSalary * RQAP_REPLACEMENT_RATE_BASE, 0, 0, loopYear, enableMonteCarlo);
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

        // Frais garderie nets : au-delà de 400 $/mois, il RESTE ~30 % du coût à charge
        // (≈70 % d'aide implicite — heuristique FISC-CHILDCARE, cf FISCAL_REFERENCE §9).
        // CPE déjà subventionné → < 400 $ → pas de réduction. ⚠️ L'ancien commentaire disait
        // « ~30 % remboursés » : c'était l'inverse de ce que fait la ligne (× 0.30 = on GARDE 30 %).
        if (careMonthly > 400) {
            careMonthly = careMonthly * 0.30;
        }

        // Total mensuel = essentiel + garderie/école/activités, indexé inflation
        const currentChildGrossCost = (cMonthly + careMonthly) * expenseMultiplier * custody;
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
        // ⚠️ LE défaut mesuré 2×. Partager `adjustedBenefits` ICI touche d'un coup
        // `monthlyIncomeDelta` (l'encaisse) ET `childBenefitsAdd` (le registre publié) : c'est
        // leur DIVERGENCE qui faisait encaisser 332 $/mois pendant que l'écran affichait 166 $.
        adjustedBenefits *= custody;
        monthlyIncomeDelta += adjustedBenefits;
        childGrossCostAdd += currentChildGrossCost;
        childBenefitsAdd += adjustedBenefits;
        childMonthlyCostAdd += currentChildGrossCost;

        // REEE contributions with SCEE/IQEE catch-up
        // +1 car SCEE calcule sur l'année civile EN COURS, pas l'âge révolu
        const childAgeYearsForGrant = childAgeYears + 1;
        const maxTheoreticalScee = Math.min(SCEE_LIFETIME_GRANT_LIMIT, childAgeYearsForGrant * SCEE_ANNUAL_GRANT_BASIC);

        let optimalReeeMonthly = REEE_TARGET_ANNUAL_CONTRIB_BASIC / 12;
        let sceeYearlyLimit = SCEE_ANNUAL_GRANT_BASIC;
        let iqeeYearlyLimit = IQEE_ANNUAL_GRANT_BASIC;

        if (newTrackerScee < maxTheoreticalScee) {
            optimalReeeMonthly = REEE_TARGET_ANNUAL_CONTRIB_CATCHUP / 12;
            sceeYearlyLimit = SCEE_ANNUAL_GRANT_CATCHUP;
            iqeeYearlyLimit = IQEE_ANNUAL_GRANT_CATCHUP;
        }

        // Audit §6.9 / F13: plafond REEE lifetime 50 000$/bénéficiaire (ARC).
        // Si on s'approche du plafond, on plafonne la cotisation du mois courant.
        // Au-delà du plafond → 0 cotisation (la croissance du REEE continue,
        // mais aucune nouvelle contribution n'est permise).
        const lifetimeContribRoomLeft = Math.max(0, REEE_LIFETIME_LIMIT_PER_BENEFICIARY - newTrackerReeeContribLifetime);
        if (optimalReeeMonthly > lifetimeContribRoomLeft) {
            optimalReeeMonthly = lifetimeContribRoomLeft;
        }

        // [ENG-DIVORCE-REEE-COTISATIONS] La part patrimoniale s'applique ICI, sur le MONTANT de
        // cotisation, avant tout usage.
        // ⚠️ POURQUOI ICI ET NULLE PART AILLEURS. Cette cotisation alimente CINQ registres à la
        // fois : la sortie de liquidités, le tracker à vie, les subventions SCEE/IQEE (calculées
        // EN PROPORTION de la cotisation), le nouveau solde du REEE et `contribREEE`. Mettre la
        // part en aval — sur `liquidDeltaReee` seul, comme la première version le laissait
        // croire — aurait CRÉÉ de l'argent : le solde REEE aurait crédité une cotisation que les
        // liquidités n'auraient pas payée, et la conservation aurait cassé sans qu'aucun test de
        // la garde 50/50 ne rougisse. Classe maison « un flux alimente PLUSIEURS registres ».
        // Appliquée APRÈS le plafond à vie : une cotisation réduite ne peut pas le dépasser.
        if (reeeContribShare !== 1) optimalReeeMonthly *= reeeContribShare;

        // Check against effective liquid (after birth cost if first month)
        if (optimalReeeMonthly > 0 && liquid + liquidDelta >= optimalReeeMonthly && !isRetired) {
            liquidDelta -= optimalReeeMonthly;
            liquidDeltaReee -= optimalReeeMonthly;
            withdrawalLiquidAdd += optimalReeeMonthly;
            reeeContribAdd += Math.round(optimalReeeMonthly);
            // Audit §6.9: tracker mis à jour pour bloquer les futurs mois
            newTrackerReeeContribLifetime += optimalReeeMonthly;

            const sceeGrant = Math.min(optimalReeeMonthly * SCEE_GRANT_RATE, sceeYearlyLimit / 12, SCEE_LIFETIME_GRANT_LIMIT - newTrackerScee);
            newTrackerScee += Math.max(0, sceeGrant);

            const iqeeGrant = Math.min(optimalReeeMonthly * IQEE_GRANT_RATE, iqeeYearlyLimit / 12, IQEE_LIFETIME_GRANT_LIMIT - newTrackerIqee);
            newTrackerIqee += Math.max(0, iqeeGrant);

            const totalGrant = Math.max(0, sceeGrant) + Math.max(0, iqeeGrant);
            reeeNewBalance = reee + optimalReeeMonthly + totalGrant;
            contribREEEAdd += optimalReeeMonthly + totalGrant;
        }
    }

    // Achat voiture cadeau à 18 ans (premier mois de la 18e année)
    if (childAgeMonths === 18 * 12 && carCost > 0) {
        const carInflated = carCost * expenseMultiplier * custody;
        liquidDelta -= carInflated;
        liquidDeltaCosts -= carInflated;
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
        // ⚠️ Deuxième défaut mesuré : partagé ICI, donc le RETRAIT REEE qui finance ces études
        // (calibré sur `studiesMonthly` juste en dessous) suit automatiquement. Partager la seule
        // dépense laissait sortir du régime 2× ce qu'il fallait payer.
        const studiesMonthly = (uni.yearlyCost / 12) * expenseMultiplier * custody;
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
        liquidDeltaReee += reeeNewBalance;
        taxDiversAdd += reeeNewBalance * REEE_AIP_TAX_RATE;
        flowEventLogs.push(`🎓 Fermeture du REEE (régime d'épargne-études) de ${child.name || 'l\'enfant'} : +${Math.round(reeeNewBalance).toLocaleString('fr-CA')} $ versés dans tes liquidités`);
        reeeNewBalance = 0;
    }

    return {
        liquidDelta,
        liquidDeltaCosts,
        liquidDeltaReee,
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
