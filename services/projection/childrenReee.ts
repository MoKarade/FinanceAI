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
// ── [FISC-REEE-GRANT-CLAWBACK] Fermeture du REEE : TROIS poches, pas un solde unique ─────────
//
// Le modèle d'avant versait 100 % du solde résiduel dans les liquidités en prélevant un forfait
// de 20 % sur le TOUT. Deux erreurs de sens opposé, qui ne se compensaient pas :
//   1. les subventions SCEE/IQEE non utilisées (jusqu'à 10 800 $/enfant) étaient VERSÉES au
//      souscripteur alors qu'elles doivent être REMBOURSÉES au gouvernement → patrimoine surévalué ;
//   2. les COTISATIONS, qui reviennent au souscripteur SANS impôt (c'est son argent après impôt),
//      étaient imposées à 20 % → patrimoine sous-évalué sur cette poche.
//
// Modèle retenu (choix Marc 2026-08-05, « les 3 poches complètes ») :
//   - COTISATIONS  → rendues au souscripteur, aucun impôt ;
//   - SUBVENTIONS  → remboursées, elles ne deviennent JAMAIS du patrimoine ;
//   - REVENU ACCUMULÉ (PRA) → versé au souscripteur, imposé à son taux marginal RÉEL (calculé par
//     empilement incrémental, convention B-AUDIT-2 : tax(revenu + PRA) − tax(revenu), donc juste
//     même quand le PRA traverse plusieurs paliers) + la surtaxe PRA.
//
// ⚠️ La poche de revenu est DÉRIVÉE (`solde − subventions − cotisations`), jamais suivie à part :
// les trois poches somment donc au solde PAR CONSTRUCTION, et la croissance du marché (appliquée au
// solde global par `growthApplication`) atterrit automatiquement dans la bonne poche. Un 4ᵉ compteur
// indépendant aurait dérivé en silence à la première divergence d'arrondi.
//
// ⚠️ Le PRA n'entre PAS dans `accGrossDelta` : `taxJanuary.ts:164` dérive les droits REER de
// `accGrossIncomeYear × 18 %`, or un PRA n'est PAS un revenu GAGNÉ — l'y ajouter fabriquerait des
// droits de cotisation inexistants. C'est exactement le piège « élargir l'assiette d'un calcul sans
// auditer ses dérivés » (CLAUDE.md). L'impôt est donc porté par `taxDiversAdd`, déjà prévu pour ça.
//
// Source : docs/FISCAL_REFERENCE.md § « REEE — SCEE / IQEE ».
/** Surtaxe sur le Paiement de Revenu Accumulé, EN PLUS de l'impôt au taux marginal. */
const REEE_AIP_PENALTY_RATE = 0.20;

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
    /** [FISC-REEE-GRANT-CLAWBACK] Subventions SCEE+IQEE encore DANS le régime (≠ versées à vie).
     *  Distinct de `trackerScee`/`trackerIqee`, qui restent des compteurs À VIE pour les plafonds
     *  et ne doivent JAMAIS être décrémentés (sinon les plafonds se rouvriraient tout seuls). */
    trackerReeeGrantsInPlan: number;
    /** [FISC-REEE-GRANT-CLAWBACK] Cotisations encore DANS le régime (≠ cotisées à vie). */
    trackerReeeContribInPlan: number;
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
    /** [FISC-REEE-GRANT-CLAWBACK] Poches restant dans le régime après le mois courant. */
    newTrackerReeeGrantsInPlan: number;
    newTrackerReeeContribInPlan: number;
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
        trackerReeeContribLifetime, trackerReeeGrantsInPlan, trackerReeeContribInPlan,
        enableMonteCarlo,
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
    let grantsInPlan = trackerReeeGrantsInPlan;
    let contribInPlan = trackerReeeContribInPlan;
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

        // Frais garderie nets : au-delà de 400 $/mois, il RESTE ~30 % du coût à charge
        // (≈70 % d'aide implicite — heuristique FISC-CHILDCARE, cf FISCAL_REFERENCE §9).
        // CPE déjà subventionné → < 400 $ → pas de réduction. ⚠️ L'ancien commentaire disait
        // « ~30 % remboursés » : c'était l'inverse de ce que fait la ligne (× 0.30 = on GARDE 30 %).
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

        // Check against effective liquid (after birth cost if first month)
        if (optimalReeeMonthly > 0 && liquid + liquidDelta >= optimalReeeMonthly && !isRetired) {
            liquidDelta -= optimalReeeMonthly;
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
            // [FISC-REEE-GRANT-CLAWBACK] Les poches suivent l'argent qui ENTRE. La croissance du
            // marché n'est volontairement suivie nulle part : elle gonfle le solde, donc la poche
            // de revenu (dérivée) l'absorbe — ce qui est exactement sa définition fiscale.
            contribInPlan += optimalReeeMonthly;
            grantsInPlan += totalGrant;
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

        const withdrawn = Math.min(reeeNewBalance, studiesMonthly);
        if (withdrawn > 0) {
            reeeNewBalance -= withdrawn;
            withdrawalREEEAdd += withdrawn;
            monthlyIncomeDelta += withdrawn;
            reeePayoutAdd += withdrawn;
            contribLiquidAdd += withdrawn;

            // [FISC-REEE-GRANT-CLAWBACK] ORDRE DE PUISAGE : subventions → revenu → cotisations.
            // Ce n'est pas arbitraire : une subvention non utilisée doit être REMBOURSÉE, donc la
            // dépenser en premier est le seul ordre qui ne détruit pas de valeur (c'est aussi la
            // recommandation standard). Les cotisations passent en dernier — elles reviennent au
            // souscripteur sans impôt de toute façon, rien ne presse de les sortir.
            // ⚠️ Le revenu n'est PAS décrémenté ici : il est DÉRIVÉ du solde, qui vient de baisser.
            const fromGrants = Math.min(withdrawn, grantsInPlan);
            grantsInPlan -= fromGrants;
            const incomePocketBefore = Math.max(0, (reeeNewBalance + withdrawn) - grantsInPlan - fromGrants - contribInPlan);
            const fromIncome = Math.min(withdrawn - fromGrants, incomePocketBefore);
            const fromContrib = Math.min(withdrawn - fromGrants - fromIncome, contribInPlan);
            contribInPlan -= fromContrib;

            // ⚠️ [choix Marc 2026-08-05] Le retrait d'études (PAE) est imposable dans les mains de
            // l'ÉTUDIANT, pas du souscripteur. On le laisse à ~0 $ d'impôt — un étudiant sans autre
            // revenu est généralement couvert par le montant personnel de base et les crédits de
            // scolarité — mais c'est une HYPOTHÈSE ASSUMÉE, pas un calcul : le moteur ne modélise
            // aucun troisième contribuable. Écrit ici pour que le résultat juste ne passe pas pour
            // un calcul qu'on n'a pas fait. Ticket de raffinement : [FISC-REEE-EAP-STUDENT-TAX].
        }
    }

    // [FISC-REEE-GRANT-CLAWBACK] Fermeture à 25 ans — TROIS poches (voir l'en-tête du module).
    if (childAgeMonths === 25 * 12 && reeeNewBalance > 0) {
        const grantsRepaid = Math.min(grantsInPlan, reeeNewBalance);
        const capitalReturned = Math.min(contribInPlan, reeeNewBalance - grantsRepaid);
        // Poche DÉRIVÉE : le reste après subventions et cotisations. Le clamp à 0 n'est pas
        // décoratif — un marché baissier peut laisser un solde INFÉRIEUR aux cotisations versées
        // (perte en capital), auquel cas il n'y a simplement aucun revenu accumulé à imposer.
        const accumulatedIncome = Math.max(0, reeeNewBalance - grantsRepaid - capitalReturned);

        // Impôt au taux marginal RÉEL par empilement incrémental (B-AUDIT-2) : un PRA de plusieurs
        // milliers de dollars traverse souvent un palier, donc un taux moyen mentirait.
        let aipTax = 0;
        if (accumulatedIncome > 0) {
            const baseIncome = Math.max(0, householdGross);
            const taxBefore = calculateFiscalReport(baseIncome, 0, 0, loopYear, true).totalTax;
            const taxAfter = calculateFiscalReport(baseIncome + accumulatedIncome, 0, 0, loopYear, true).totalTax;
            const marginalTax = taxAfter - taxBefore;
            if (!Number.isFinite(marginalTax)) {
                // Donnée amont corrompue : on n'invente PAS un taux crédible (no-fake-data). On
                // applique la seule part certaine — la surtaxe — et on le DIT, plutôt que de laisser
                // un NaN se propager dans le patrimoine ou un 0 $ passer pour un calcul.
                aipTax = accumulatedIncome * REEE_AIP_PENALTY_RATE;
                flowEventLogs.push(
                    `⚠️ Impôt du revenu accumulé du REEE NON CALCULABLE (revenu du ménage non fini) : `
                    + `seule la surtaxe de ${Math.round(REEE_AIP_PENALTY_RATE * 100)} % est appliquée.`,
                );
            } else {
                aipTax = Math.max(0, marginalTax) + accumulatedIncome * REEE_AIP_PENALTY_RATE;
            }
            // Un impôt ne peut pas dépasser le versement : sans ce plafond, une surtaxe cumulée à
            // un taux marginal élevé pourrait créer un décaissement net NÉGATIF (de l'argent qui
            // sort du patrimoine sans exister), ce que la conservation n'attraperait pas ici.
            aipTax = Math.min(aipTax, accumulatedIncome);
        }

        // SEULS le capital et le revenu accumulé rejoignent les liquidités. Les subventions sont
        // REMBOURSÉES : elles quittent le patrimoine sans jamais y entrer — c'est LE correctif.
        liquidDelta += capitalReturned + accumulatedIncome;
        taxDiversAdd += aipTax;

        const paidOut = Math.round(capitalReturned + accumulatedIncome);
        flowEventLogs.push(
            `🎓 Fermeture du REEE (régime d'épargne-études) de ${child.name || 'l\'enfant'} : `
            + `+${paidOut.toLocaleString('fr-CA')} $ versés dans tes liquidités`
            + (grantsRepaid > 0
                ? ` — ${Math.round(grantsRepaid).toLocaleString('fr-CA')} $ de subventions non utilisées REMBOURSÉES au gouvernement`
                : '')
            + (accumulatedIncome > 0
                ? ` ; ${Math.round(aipTax).toLocaleString('fr-CA')} $ d'impôt sur le revenu accumulé`
                : ''),
        );
        reeeNewBalance = 0;
        grantsInPlan = 0;
        contribInPlan = 0;
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
        newTrackerReeeGrantsInPlan: grantsInPlan,
        newTrackerReeeContribInPlan: contribInPlan,
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
