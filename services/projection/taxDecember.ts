// services/projection/taxDecember.ts
// Cycle 23 split (depuis taxCycle.ts): blocs fiscaux de décembre.
// Cycle 10 (computeOasClawback, processTaxLossHarvesting): décembre = mois 11.
// Cycle 11 (processDecemberTaxFiling): régularisation annuelle d'impôt.

import { OAS_CLAWBACK_THRESHOLD_2026, OAS_CLAWBACK_RATE, CAPITAL_GAINS_INCLUSION_STANDARD, firstCombinedBracketTopForYear, calculateRamqPremium, calculateFSSPremium, type FiscalReport, type AgeCreditOptions } from '../../utils/tax';
import { NONREG_DIVIDEND_DISTRIBUTION_SHARE, RRIF_FIRST_WITHDRAWAL_AGE } from './helpers';

/**
 * [ENG-TAXDEC-FLOOR-INDEX] Borne du solde d'impôt d'avril, en dollars d'AUJOURD'HUI (2026).
 * Ce n'est pas une valeur fiscale (rien dans la loi ne plafonne un remboursement) mais un
 * garde-fou de modèle contre un remboursement aberrant issu d'une donnée corrompue. Il est
 * INDEXÉ à l'usage : un plancher nominal figé perdrait 45 % de sa valeur réelle sur 30 ans et
 * se mettrait à tronquer des remboursements légitimes de plus en plus tôt.
 */
const APRIL_SETTLEMENT_FLOOR_REAL = 100_000;

/**
 * V31 — OAS Clawback prévu (calcul annuel en décembre).
 * S'applique uniquement aux retraités 65+ avec revenu de pension > seuil.
 * Retourne le clawback annuel prévu (à diviser par 12 par le caller).
 */
// [FISC-DIV-DERIVED-BASES] SOURCE UNIQUE du dividende annuel CASH du non-enregistré — la même
// formule alimente l'assiette FSS, le revenu de récupération PSV, l'impôt du §3 et l'affichage
// mensuel (projection.ts DividendIncome). Le MAJORÉ = × getDividendGrossUpRate('eligible').
export const computeAnnualNonRegDividends = (nonReg: number, baseNonRegRate: number): number =>
    (Number.isFinite(nonReg) ? Math.max(0, nonReg) : 0)
    * ((Number.isFinite(baseNonRegRate) ? baseNonRegRate : 0) / 100)
    * NONREG_DIVIDEND_DISTRIBUTION_SHARE;

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
    // PV-9 — gains en capital RÉALISÉS de l'année (BRUT, avant inclusion 50 %). Le montant
    // imposable (×0,5) entre dans le revenu net de récupération PSV (ligne 23400 ARC). Réparti
    // également (gains non attribuables par conjoint dans le modèle). Absent → 0 (rétro-compat).
    accCapitalGainsYear: number = 0,
    // FA-8 (2026-06-11) — PSV familiale réellement VERSÉE (mensuelle, NOMINALE, HORS SRG : breakdown
    // de décembre `psv − gis`). Sert de CAP au clawback : le vrai impôt de récupération est plafonné
    // à la PSV REÇUE, qui inclut le facteur de report (×1,36 à 70 ans), le bonus 75+ (×1,10), le
    // prorata de résidence et le facteur survivant — pas la pension de BASE. Absent → repli legacy
    // (base sans report, rétro-compat).
    psvActualMonthlyNominal?: number,
    // [FISC-DIV-DERIVED-BASES] Dividendes MAJORÉS annuels du non-enregistré (cash × gross-up).
    // Le revenu de récupération PSV (ligne 23400 ARC) inclut le dividende IMPOSABLE = le majoré,
    // comme il inclut déjà le gain imposable (PV-9). Réparti également (non attribuable par
    // conjoint dans le modèle, même limite que les gains). Défaut 0 = rétro-compat bit-identique.
    // MESURÉ (vraie formule, part distribuée 30 %) : +1 552,50 $/an de récupération sur un
    // couple à 100 k$/conjoint + 500 k$ non-enreg à 5 % ; +2 484 $ à 110 k$/conjoint + 800 k$.
    // ⚠️ Un premier chiffrage disait +3 006 $ — il oubliait NONREG_DIVIDEND_DISTRIBUTION_SHARE
    // (0,3) dans l'assiette : re-mesuré avec la source unique (classe ECRIRE-UN-CHIFFRE).
    annualGrossedUpDividends: number = 0,
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

    // FA-8 (2026-06-11) — cap = PSV réellement VERSÉE quand le caller la fournit (déjà nominale :
    // le breakdown porte ×inflFactor — ne PAS re-multiplier par nominalIncomeFactor). Avant : cap
    // = base sans facteur de report → clawback SOUS-estimé pour un reporteur 66-70 à haut revenu
    // (cap réel jusqu'à ×1,36×1,10 plus haut — non conservateur), SURestimé si prorata de
    // résidence < 1, et clawback FICTIF possible avant psvStartAge (PSV non versée → cap doit
    // être 0). Repli legacy si paramètre ABSENT (rétro-compat tests/anciens callers).
    // Revue FA-8 (silent-failure) — présent-mais-NaN ≠ absent : une corruption amont (ex.
    // psvResidencyYears NaN) prendrait le repli SANS trace ; on le signale via le logMsg.
    const capInvalid = psvActualMonthlyNominal !== undefined && !Number.isFinite(psvActualMonthlyNominal);
    const psvAnnualActual = Number.isFinite(psvActualMonthlyNominal)
        ? Math.max(0, psvActualMonthlyNominal as number) * 12
        : psvAnnualBase;
    const psvCapPerUser = psvAnnualActual / n;
    // PV-9 — gain imposable (50 % d'inclusion) réparti également par adulte. Garde NaN symétrique.
    const taxableGainsPerUser = (Number.isFinite(accCapitalGainsYear)
        ? Math.max(0, accCapitalGainsYear) : 0) * CAPITAL_GAINS_INCLUSION_STANDARD / n;
    // [FISC-DIV-DERIVED-BASES] dividende majoré réparti également — même patron que les gains.
    const grossedUpDivPerUser = (Number.isFinite(annualGrossedUpDividends)
        ? Math.max(0, annualGrossedUpDividends) : 0) / n;
    let clawbackAnnual = 0;
    for (let i = 0; i < n; i++) {
        const incomeUser = (validIncome ? perUserIncomeMonthly![i] * 12 : (incomeRetirementMonthly * 12) / n)
            + (validReer ? perUserReerAnnual![i] : accRetraitsReerYear / n)
            + accRentesYear / n
            + taxableGainsPerUser
            + grossedUpDivPerUser;
        const excess = incomeUser - OAS_THRESHOLD;
        // Taux de récupération PSV : 15 % de l'excédent (ARC, ligne 23500) — OAS_CLAWBACK_RATE,
        // sourcé FISCAL_REFERENCE §6 (FA-8 : littéral 0.15 nommé).
        if (excess > 0) clawbackAnnual += Math.min(psvCapPerUser, excess * OAS_CLAWBACK_RATE);
    }

    // Revue FA-8 — cap NaN signalé même si le clawback résultant est nul (corruption amont).
    const invalidNote = capInvalid ? ' [cap PSV réel invalide (NaN) — repli sur la base, corruption amont ?]' : '';
    if (clawbackAnnual > 1 || capInvalid) {
        return {
            clawbackAnnual,
            logMsg: `⚠️ PSV Clawback prévu: -${Math.round(clawbackAnnual).toLocaleString('fr-CA')}$/an${invalidNote}`,
        };
    }
    return { clawbackAnnual };
}

/**
 * V31 — Tax-Loss Harvesting actif en décembre.
 * Une année négative est le DÉCLENCHEUR (on regarde s'il y a une perte à cristalliser), mais le
 * montant récolté est borné par la perte LATENTE RÉELLE de la tranche vendue (coût fiscal
 * proportionnel − valeur), JAMAIS fabriqué à partir du seul rendement de l'année.
 * PV-8 : un titre en GAIN latent (ACB < valeur) ne donne AUCUNE perte, même en année négative —
 * le vendre réaliserait un gain, pas une perte. L'ancien code gonflait la banque de pertes sur
 * des positions en gain (sous-imposition des gains réels abrités ensuite).
 *
 * Modèle : vente de 50 % + rachat immédiat à la valeur marchande (hypothèse « perte apparente »
 * LIR 54 levée — cf docs/FISCAL_REFERENCE.md §3). La banque monte de L, l'ACB total baisse
 * exactement de L (acbDelta = −L) → le gain futur régénéré vaut L : conservation exacte.
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
    if (currentNonRegRate >= 0 || !(nonReg > 0)) return { harvestedLoss: 0, acbDelta: 0 }; // !(>0) capte 0, négatif ET NaN

    const fakeSell = nonReg * 0.50; // 50 % de la valeur marchande
    // ACB proportionnel de la tranche vendue — VOLONTAIREMENT non plafonné à proportion 1 (contrairement à
    // `handleNonRegSale`/`handleCryptoSale` qui font `min(1, ACB/valeur)`, portfolioOps.ts) : le TLH est le
    // SEUL chemin qui RÉALISE une perte (cf docs/FISCAL_REFERENCE.md §3 « la banque ne s'alimente que par le
    // TLH ») ; il doit donc voir la perte latente ENTIÈRE. Les ventes involontaires la diffèrent (conservateur).
    // NE PAS « harmoniser » avec le plafond de handleNonRegSale : ça remettrait la récolte à zéro.
    const costBasisSold = fakeSell * (nonRegACB / nonReg); // nonReg > 0 garanti par le gate ci-dessus
    const harvestedLoss = costBasisSold - fakeSell; // = 0,5 × (ACB − valeur) ; ≤ 0 si gain latent
    if (!(harvestedLoss > 0)) return { harvestedLoss: 0, acbDelta: 0 }; // gain latent → rien ; !(>0) capte aussi NaN

    const acbDelta = -harvestedLoss; // rachat à la valeur marchande → l'ACB baisse de la perte cristallisée

    return {
        harvestedLoss,
        acbDelta,
        logMsg: `🛡️ Perte Cristallisée (TLH): +${Math.round(harvestedLoss).toLocaleString('fr-CA')}$ (Banque) | ACB −${Math.round(harvestedLoss).toLocaleString('fr-CA')}$`,
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
    /** PH4-FUT-B — levier fractionnement de pension. Absent/true = Phase 3 active (comportement
     *  historique) ; false = sautée (compare l'impact de NE PAS fractionner). */
    enablePensionSplitting?: boolean;
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
    // [FISC-BRACKET-REALINDEX] `realDeflator` (positionnel 8, après employmentIncome) : déflateur
    // (1+i)^Δ à passer quand `gross` est en dollars RÉELS — les paliers/crédits sont alors ramenés
    // dans le même espace (facteur effectif 1,02^Δ/(1+i)^Δ au lieu du double-indexé 1,02^Δ sur un
    // revenu déflaté). Les appels en espace NOMINAL (gains, dividendes) ne le passent PAS.
    calculateFiscalReport: (gross: number, deductions: number, withheld: number, year: number, mc?: boolean, ageOpts?: AgeCreditOptions, employmentIncome?: number, realDeflator?: number) => FiscalReport;
    getMarginalRate: (income: number, year: number) => number;
    // ITEM 2d — 4e arg optionnel : impôt brut PROGRESSIF (bande sur le montant majoré).
    // Quand fourni, il remplace le calcul plat (montant majoré × taux marginal).
    calculateDividendTax: (annualDiv: number, marginalRate: number, kind?: 'eligible' | 'non-eligible', progressiveGrossTax?: number) => number;
    // ITEM 2d — taux de majoration du dividende (pour empiler le montant majoré).
    getDividendGrossUpRate?: (kind?: 'eligible' | 'non-eligible') => number;
}

export interface DecemberResult {
    /** Nouveau taxCurrentYear après régularisation (à passer en taxPreviousYear par le caller). */
    newTaxCurrentYear: { revenu: number; gains: number; divers: number; reer: number; donCredit: number };
    /** Logs à émettre. */
    logs: string[];
}

export function processDecemberTaxFiling(
    currentMonthIndex: number,
    ctx: DecemberContext,
    helpers: DecemberHelpers,
    taxCurrentYearInitial: { revenu: number; gains: number; divers: number; reer: number; donCredit: number },
): DecemberResult {
    if (currentMonthIndex !== 11 || ctx.m === 0) {
        return { newTaxCurrentYear: { ...taxCurrentYearInitial }, logs: [] };
    }
    const logs: string[] = [];
    const taxCurrent = { ...taxCurrentYearInitial };
    // [FA-6-CREDIT-CAP] Impôt sur le revenu BRUT de l'année (salaire/retraite), capturé dans chaque branche.
    // Sert à plafonner le crédit-don non remboursable (il ne peut pas excéder l'impôt par ailleurs dû).
    let grossIncomeTax = 0;

    // FA-3a — SRG mensuel à exclure des assiettes, HOISTÉ une fois avec garde NaN
    // (même piège que la garde DB de FA-1 : `?? 0` ne capte PAS NaN, et Math.max(0, NaN)=NaN
    // sauterait silencieusement TOUT l'impôt annuel via `if (taxableAnnual > 0)`).
    const gisMonthlySafe = Number.isFinite(ctx.incomeRetirementGisMonthly)
        ? Math.max(0, ctx.incomeRetirementGisMonthly as number)
        : 0;

    // [FISC-TAXDEC-INCR] (revue #676, F1) — la pension ADMISSIBLE par conjoint est une SOURCE
    // UNIQUE hissée ici : le bloc retraité §6 la consomme en RÉEL, la bande incrémentale ci-dessous
    // en NOMINAL (× ctx.inflationFactor). La dupliquer avait déjà un précédent de divergence
    // (UNE-FORMULE-RECOPIEE-DIVERGE).
    const nAdults = Math.max(1, ctx.activeUsersCount);
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
        && perUserReer.length === nAdults
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
    const reerRealUser = (i: number): number => (useReerPerUser ? perUserReer![i] : ctx.accRetraitsReerYear / nAdults) / ctx.inflationFactor;
    const eligiblePensionFor = (i: number): number => {
        const a = ages[i];
        if (a === undefined) return 0;
        // ⚠️ [Audit 2026-08-06] `RRIF_FIRST_WITHDRAWAL_AGE` est ici DÉRIVÉ, pas coïncident :
        // un retrait REER n'entre dans l'assiette du crédit pension qu'à partir du moment où
        // le moteur le considère comme du FERR — c'est-à-dire exactement le gate de
        // `taxJanuary`. Découpler les deux constantes accorderait le crédit (et le
        // fractionnement) un an trop tôt : MESURÉ +6 508 $ sur 22 personas / 56.
        // La règle stricte serait `max(65 ARC ; âge FERR du modèle)` ; le `max` est lié par
        // 72 aujourd'hui et ne se dénouerait que si la conversion volontaire 65-71 était
        // modélisée (limite déjà consignée FISCAL_REFERENCE §4).
        return (a >= 65 ? Math.max(0, dbRealUser(i)) : 0)
            + (a >= RRIF_FIRST_WITHDRAWAL_AGE ? Math.max(0, reerRealUser(i)) : 0);
    };

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

        // [REER-ACTIF-NON-RECONCILIE] — audit 2026-08-19.
        // AVANT : l'assiette de décembre en phase ACTIVE ne contenait QUE le salaire. Les retraits
        // REER d'un ménage actif (cascade de shortfall, retraits d'objectifs, meltdown, achat immo)
        // n'y entraient jamais → ils restaient au seul taux de RETENUE (19/24/29 %) et n'étaient
        // jamais réconciliés au taux marginal réel. Impôt jamais facturé, mesuré : 1 424 $ pour un
        // retrait de 20 k$ sur 60 k$ de salaire, 6 315 $ pour 50 k$ sur 90 k$, 20 177 $ pour 100 k$
        // sur 150 k$.
        // ⚠️ C'est EXACTEMENT le bug corrigé côté RETRAITÉ en juin 2026 — le commentaire de cette
        // correction (branche `else` ci-dessous) décrit le symptôme mot pour mot. Seul le miroir
        // côté actif manquait. `moneyConservation` ne pouvait pas l'attraper : un impôt jamais
        // prélevé est parfaitement conservatif (cf. CONSERVATION-NE-VOIT-PAS-L-IMPOT-ELUDE).
        //
        // Répartition per-conjoint : même contrat que la branche retraitée — on n'utilise
        // `accRetraitsReerYearByUser` que s'il est COHÉRENT avec le total (Σ == total, bonne
        // longueur, tout fini), sinon repli sur le split égal. Un tableau incohérent taxerait le
        // mauvais conjoint en silence.
        const nFilersActive = Math.max(1, ctx.activeUsersCount);
        const reerAnnualNominal = Number.isFinite(ctx.accRetraitsReerYear) ? Math.max(0, ctx.accRetraitsReerYear) : 0;
        const reerByUserActive = ctx.accRetraitsReerYearByUser;
        const reerByUserSum = Array.isArray(reerByUserActive)
            ? reerByUserActive.reduce((acc, v) => acc + (Number.isFinite(v) ? v : NaN), 0)
            : NaN;
        const reerByUserValid = Array.isArray(reerByUserActive)
            && reerByUserActive.length === nFilersActive
            && Number.isFinite(reerByUserSum)
            && Math.abs(reerByUserSum - reerAnnualNominal) <= Math.max(1, Math.abs(reerAnnualNominal) * 1e-6);
        const reerShareOf = (i: number): number => (reerByUserValid
            ? Math.max(0, reerByUserActive![i])
            : reerAnnualNominal / nFilersActive);
        // Solo (1 déclarant) : tout le retrait est au principal, rien au « conjoint ».
        const reerMarcReal = reerShareOf(0) / ctx.inflationFactor;
        const reerAnnaReal = nFilersActive > 1 ? reerShareOf(1) / ctx.inflationFactor : 0;
        // Assiette IMPOSABLE élargie. ⚠️ L'assiette d'EMPLOI reste le SALAIRE SEUL : les cotisations
        // RRQ/RQAP/AE ne portent pas sur un retrait REER, et `employmentIncome` absent vaut
        // `grossIncome` par défaut (cf. FISC-PAYROLL-BASE-INVEST) — l'omettre ici gonflerait les
        // cotisations sociales du montant retiré.
        const taxableMarcReal = grossMarcReal + reerMarcReal;
        const taxableAnnaReal = grossAnnaReal + reerAnnaReal;

        // V31: Optimisation fiscale — déductions au salaire le plus élevé
        const deductionsMarc = grossMarcReal > grossAnnaReal ? deductionsReal : 0;
        const deductionsAnna = grossMarcReal > grossAnnaReal ? 0 : deductionsReal;

        // §6.2 — crédits 65+ pour salarié actif 65+ (audit silent-failure FINDING 2).
        // Cas : senior qui continue à travailler après 65 ans.
        // B-AUDIT-3 — chaque conjoint selon SON âge (ctx.age / ctx.ageSpouse) : un 65+ qui
        // travaille a le crédit d'âge, un conjoint <65 ne l'a pas (corrige l'ancien biais
        // qui appliquait l'âge de Marc aux deux). eligiblePensionIncome=0 (aucune pension
        // admissible en mode actif) ; familyIncome = revenu familial (réduction ligne 361).
        const familyGrossReal = taxableMarcReal + taxableAnnaReal;
        const mkActiveAgeOpts = (a: number | undefined): AgeCreditOptions | undefined =>
            (a !== undefined && a >= 65)
                ? { age: a, eligiblePensionIncome: 0, hasSpouse: ctx.activeUsersCount > 1, familyIncome: familyGrossReal }
                : undefined;
        const ageOptsMarc = mkActiveAgeOpts(ctx.age);
        const ageOptsAnna = mkActiveAgeOpts(ctx.ageSpouse);

        // [FISC-BRACKET-REALINDEX] revenus en dollars RÉELS (déflatés ci-dessus) → paliers/crédits
        // ramenés en réel via realDeflator = ctx.inflationFactor (sinon : double indexation, les
        // paliers s'élargissaient de ~2 %/an en termes réels → impôt long-terme sous-évalué).
        const taxMarcReal = taxableMarcReal > 0 ? helpers.calculateFiscalReport(taxableMarcReal, deductionsMarc, 0, ctx.loopYear, ctx.enableMonteCarlo, ageOptsMarc, grossMarcReal, ctx.inflationFactor).totalTax : 0;
        const taxAnnaReal = taxableAnnaReal > 0 ? helpers.calculateFiscalReport(taxableAnnaReal, deductionsAnna, 0, ctx.loopYear, ctx.enableMonteCarlo, ageOptsAnna, grossAnnaReal, ctx.inflationFactor).totalTax : 0;
        const totalAnnualTax = (taxMarcReal + taxAnnaReal) * ctx.inflationFactor;
        grossIncomeTax = totalAnnualTax; // [FA-6-CREDIT-CAP] liability salariale de l'année

        // V49: Retenue source (T1213 ou non)
        // ⚠️ [REER-ACTIF-NON-RECONCILIE] La retenue de l'EMPLOYEUR porte sur le SALAIRE, jamais sur
        // un retrait REER (celui-ci a sa propre retenue, dans le bucket `.reer`). Avant l'élargissement
        // de l'assiette, `taxMarcReal` ÉTAIT l'impôt du salaire seul, donc le raccourci
        // `taxMarcEmployer = taxMarcReal` était juste ; il ne l'est plus. On recalcule donc sur
        // `grossMarcReal` dans les DEUX branches — avec les déductions quand T1213 est actif.
        const deductionsEmployerMarc = ctx.optimizeSourceDeductions ? deductionsMarc : 0;
        const deductionsEmployerAnna = ctx.optimizeSourceDeductions ? deductionsAnna : 0;
        const taxMarcEmployer = grossMarcReal > 0 ? helpers.calculateFiscalReport(grossMarcReal, deductionsEmployerMarc, 0, ctx.loopYear, ctx.enableMonteCarlo, ageOptsMarc, grossMarcReal, ctx.inflationFactor).totalTax : 0;
        const taxAnnaEmployer = grossAnnaReal > 0 ? helpers.calculateFiscalReport(grossAnnaReal, deductionsEmployerAnna, 0, ctx.loopYear, ctx.enableMonteCarlo, ageOptsAnna, grossAnnaReal, ctx.inflationFactor).totalTax : 0;
        const totalEmployerTax = (taxMarcEmployer + taxAnnaEmployer) * ctx.inflationFactor;
        // [FISC-WHT-92PCT] retenue = 100 % de l'impôt sans déductions (GO Marc 2026-08-01). L'ancien
        // ×0,92 n'était sourcé nulle part et facturait ~8 % de l'impôt salarial EN DOUBLE chaque avril :
        // le netSalary saisi incorpore déjà ~100 % de la retenue réelle (vérifié numériquement,
        // FISCAL_REFERENCE §9). Le solde d'avril ne règle plus que l'écart dû aux déductions (REER…).
        const estimatedWithholding = totalEmployerTax;

        // V30: Override 12-month approximation
        // Panel #558 : le plancher tronquait EN SILENCE — et la retenue 100 % rend les gros
        // remboursements (hauts revenus + REER/Smith) bien plus proches du plancher qu'avant.
        // On journalise la troncature pour qu'un remboursement sous-évalué soit VISIBLE.
        // [REER-ACTIF-NON-RECONCILIE] Créditer AUSSI la retenue REER déjà prélevée sur les retraits
        // de l'année : elle vit dans le bucket `.reer`, que le règlement d'avril débite à part.
        // Sans ce crédit, l'élargissement de l'assiette ci-dessus la facturerait une SECONDE fois.
        // Total réellement payé en avril = `.revenu` + `.reer`
        //   = (impôt total − retenue salariale − retenue REER) + retenue REER
        //   = impôt total − retenue salariale.  ✔
        const reerWithholdingAlreadyTaken = Number.isFinite(taxCurrentYearInitial.reer) ? taxCurrentYearInitial.reer : 0;
        const aprilSettlementRaw = totalAnnualTax - estimatedWithholding - reerWithholdingAlreadyTaken;
        // [ENG-TAXDEC-NAN-GUARD] ⚠️ `Math.max(-100000, NaN) === NaN` : le clamp AVAIT L'AIR d'un
        // garde-fou mais laissait passer un NaN amont (prouvé avec inflationFactor = 0) jusqu'à
        // FluxImpots puis totalTaxesPaid/NetWorth, sans la moindre trace. La branche RETRAITÉE
        // gardait déjà `Number.isFinite` ; ce site-ci ne le faisait pas. Un impôt non fini ne
        // devient JAMAIS un défaut numérique silencieux — on le dit et on retombe sur 0.
        if (!Number.isFinite(aprilSettlementRaw)) {
            logs.push(`⚠️ Solde d'impôt d'avril NON FINI (impôt=${totalAnnualTax}, retenue=${estimatedWithholding}) → 0 retenu ; donnée amont corrompue.`);
            taxCurrent.revenu = 0;
        } else {
            // [ENG-TAXDEC-FLOOR-INDEX] Le plancher est un montant NOMINAL, comme le flux qu'il
            // borne : il doit suivre l'inflation, sinon sa valeur RÉELLE fond (à 30 ans, facteur
            // 1,81 → un plancher de -100 000 $ ne vaut plus que ~-55 000 $ d'aujourd'hui, et
            // tronque donc de plus en plus tôt à mesure que la projection avance).
            const floor = -APRIL_SETTLEMENT_FLOOR_REAL * (Number.isFinite(ctx.inflationFactor) ? Math.max(1, ctx.inflationFactor) : 1);
            taxCurrent.revenu = Math.max(floor, aprilSettlementRaw);
            if (aprilSettlementRaw < floor) {
                logs.push(`⚠️ Remboursement d'avril tronqué au plancher ${Math.round(floor).toLocaleString('fr-CA')}$ (calculé: ${Math.round(aprilSettlementRaw).toLocaleString('fr-CA')}$)`);
            }
        }
    } else {
        // ---- Retraité : régularisation au taux marginal réel (MIROIR de la phase active) ----
        //
        // FIX FISCAL CRITIQUE (Marc, 2026-06) — l'ancien code n'ajoutait que 5 % du
        // vrai impôt sur la pension (« 95 % retenu à la source »), MAIS aucune retenue
        // mensuelle n'existe pour les retraités (la branche active `if (!isRetired)` ne
        // s'applique pas). Et les retraits REER/FERR (ctx.accRetraitsReerYear) étaient
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
                    // [FISC-BRACKET-REALINDEX] taxables[i] est en $ RÉELS → paliers/crédits en réel.
                    t += helpers.calculateFiscalReport(taxables[i], 0, 0, ctx.loopYear, ctx.enableMonteCarlo, ageOpts, undefined, ctx.inflationFactor).totalTax;
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
            // PH4-FUT-B — levier : `enablePensionSplitting === false` saute la Phase 3 (défaut absent/true = actif).
            if (ctx.enablePensionSplitting !== false && n === 2 && ctx.activeUsersCount > 1 && ctx.age !== undefined && ctx.ageSpouse !== undefined) {
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
            grossIncomeTax = totalAnnualTax; // [FA-6-CREDIT-CAP] liability de retraite de l'année
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
                // [ENG-TAXDEC-FLOOR-INDEX] Plancher indexé — miroir EXACT de la phase active
                // (sinon les deux branches divergeraient au fil des années de projection).
                const floor = -APRIL_SETTLEMENT_FLOOR_REAL * (Number.isFinite(ctx.inflationFactor) ? Math.max(1, ctx.inflationFactor) : 1);
                taxCurrent.revenu += Math.max(floor, reconciliation);
                // Panel #558 : troncature journalisée (miroir du plancher de la phase active).
                if (reconciliation < floor) {
                    logs.push(`⚠️ Régularisation retraité tronquée au plancher ${Math.round(floor).toLocaleString('fr-CA')}$ (calculée: ${Math.round(reconciliation).toLocaleString('fr-CA')}$)`);
                }
            } else if (!Number.isFinite(reconciliation)) {
                // [Revue #680] Symétrie avec la branche ACTIVE (⚠️ solde d'avril NON FINI) : un
                // NaN ici laissait taxCurrent.revenu inchangé SANS trace — seul filet du sous-cas
                // NaN de la chaîne des crédits. On dit, on ne corrige pas en silence.
                logs.push(`⚠️ Régularisation retraité NON FINIE (reconciliation=${reconciliation}) → ignorée ; donnée amont corrompue.`);
            }
        }
    }

    // [FISC-DIV-DERIVED-BASES] SOURCE UNIQUE du dividende annuel du non-enregistré — consommée
    // par l'assiette FSS (§1.6), le revenu de récupération PSV (via le caller) et le bloc
    // dividendes (§3). Deux copies de cette formule divergeraient en silence.
    const annualDivForBases = computeAnnualNonRegDividends(ctx.nonReg, ctx.baseNonRegRate);
    // Repli si le helper gross-up est absent (même contrat optionnel qu'au §3) : dividende CASH —
    // sous-estime l'assiette plutôt que d'inventer un taux ; le vrai moteur passe toujours le helper.
    const annualGrossedUpDivForBases = annualDivForBases
        * (helpers.getDividendGrossUpRate ? helpers.getDividendGrossUpRate('eligible') : 1);

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
            //
            // [RAMQ-ACTIF-HORS-RETRAITS] — audit 2026-08-19. L'assiette était ASYMÉTRIQUE entre
            // les deux branches : la retraitée ci-dessus inclut `accRetraitsReerYear` et les gains,
            // l'active les ignorait. Or la prime RAMQ porte sur le revenu NET au sens de la ligne
            // 275 TP-1, qui comprend un retrait REER comme un gain réalisé — un salarié qui retire
            // 40 k$ de son REER a bien ce revenu-là. Trouvé en corrigeant
            // `[REER-ACTIF-NON-RECONCILIE]` : un écart CONSTANT de 766 $ dans les tests menait à la
            // prime, et de la prime à cette asymétrie.
            //
            // ⚠️ Le FSS juste en dessous est un cas DIFFÉRENT, à ne PAS « corriger » par symétrie :
            // il ne s'applique qu'aux retraités par choix documenté (les salariés sont couverts par
            // la cotisation de leur employeur), pas par oubli.
            //
            // Impact BORNÉ : la prime plafonne à `RAMQ_MAX_PREMIUM_2026` (766 $/adulte), donc
            // l'écart n'existe que pour un revenu modeste assorti d'un retrait notable — nul dès
            // que le salaire seul atteint déjà le plafond.
            const grossFamily = (ctx.grossMarcBaseAnnual + ctx.grossAnnaBaseAnnual)
                * Math.pow(1 + ctx.simSalaryGrowth / 100, ctx.yearsElapsed);
            const deductions = ctx.accRrspYear + ctx.accFhsaYear + ctx.smithInterestDeductibleYear;
            const retraitsReer = Number.isFinite(ctx.accRetraitsReerYear) ? Math.max(0, ctx.accRetraitsReerYear) : 0;
            const gainsImposables = Number.isFinite(ctx.accCapitalGainsYear)
                ? Math.max(0, ctx.accCapitalGainsYear) * CAPITAL_GAINS_INCLUSION_STANDARD
                : 0;
            familyNetIncome = Math.max(0, grossFamily - deductions + retraitsReer + gainsImposables) / ctx.inflationFactor;
        }
        const ramqPerAdult = calculateRamqPremium(
            familyNetIncome,
            {
                hasSpouse: ctx.activeUsersCount > 1,
                childrenCount: ctx.childrenCount ?? 0,
                exempt: !!ctx.ramqExempt,
            },
            ctx.loopYear,  // indexation seuils + prime max
            ctx.inflationFactor,  // [FISC-BRACKET-REALINDEX] familyNetIncome est en $ RÉELS → seuils en réel
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
        // [FISC-DIV-DERIVED-BASES] le dividende MAJORÉ entre dans le revenu net (ligne 275 QC),
        // comme le gain imposable — l'assiette FSS l'ignorait (asymétrie du panel #564).
        // MESURÉ : +70 $/an/ménage à 500 k$ non-enreg (borné par le plafond 1 000 $/adulte).
        const individualNetIncome = (
            (ctx.incomeRetirementMonthly - gisMonthlySafe) * 12
            + ctx.accRentesYear
            + ctx.accRetraitsReerYear
            + ctx.accCapitalGainsYear * CAPITAL_GAINS_INCLUSION_STANDARD
            + annualGrossedUpDivForBases
        ) / ctx.activeUsersCount / ctx.inflationFactor;
        // [FISC-BRACKET-REALINDEX] individualNetIncome est en $ RÉELS → seuils FSS en réel.
        const fssPerAdult = calculateFSSPremium(individualNetIncome, ctx.loopYear, ctx.inflationFactor);
        const fssTotal = fssPerAdult * ctx.activeUsersCount * ctx.inflationFactor;
        if (fssTotal > 0) {
            taxCurrent.divers += fssTotal;
            logs.push(`🏥 FSS (ligne 446): ${Math.round(fssTotal).toLocaleString('fr-CA')}$/an (${Math.round(fssPerAdult)}$/adulte)`);
        }
    }


    // [FISC-TAXDEC-INCR] (a) — impôt d'une BANDE incrémentale [base, base+bande] par adulte, avec
    // les crédits d'âge de CHAQUE conjoint. Espace NOMINAL (jamais de realDeflator ici — cf. notes
    // FISC-BRACKET-REALINDEX des deux blocs appelants). Retourne le total FAMILIAL.
    // [Revue #676] Un 3e déclarant serait imposé sur sa bande SANS jamais pouvoir porter de
    // crédit d'âge (ages[2] === undefined, silencieux). L'UI plafonne à 2 — si ça change, on le
    // dit au lieu de sous-créditer en silence. Ne PAS borner la boucle à ages.length : ça
    // supprimerait la bande du 3e déclarant (argent perdu). Hors du helper : émis UNE fois par
    // décembre, pas une fois par site d'appel (§2 + §3).
    if (ctx.activeUsersCount > ages.length) {
        logs.push(`⚠️ incrementalBandTax : ${ctx.activeUsersCount} déclarants mais ${ages.length} âges — crédits d'âge indisponibles au-delà du 2e.`);
    }
    const incrementalBandTax = (perAdultBase: number, perAdultBand: number,
        familyBase: number, familyBand: number): number => {
        // [ENG-TAXDEC-NAN-GUARD, resserré 2e relecture #676] La garde porte sur les ENTRÉES :
        // `calculateFiscalReport` assainit son grossIncome (`Number(x) || 0`), donc tb/tt sortent
        // FINIS même d'une base NaN — tester les sorties laissait passer 3 chemins de corruption
        // sur 4 en rendant 0 $ sans trace. Un terme non fini se dit et retombe sur 0 — jamais un
        // défaut numérique silencieux qui empoisonnerait FluxImpots puis le patrimoine.
        if (![perAdultBase, perAdultBand, familyBase, familyBand].every(Number.isFinite)) {
            logs.push(`⚠️ Bande incrémentale : entrée NON FINIE (base=${perAdultBase}, bande=${perAdultBand}, familyBase=${familyBase}, familyBand=${familyBand}) → 0 retenu ; donnée amont corrompue.`);
            return 0;
        }
        let total = 0;
        for (let i = 0; i < ctx.activeUsersCount; i++) {
            const a = ages[i];
            // [Revue #676 F1 + 2e relecture] Pension admissible RÉELLE de l'adulte, renominalisée
            // par l'inflation SIMULÉE (comme le revenu du bloc), la MÊME aux deux appels — le
            // NIVEAU du crédit s'annule, le clamp de la ligne 361 QC tombe au vrai montant (avec
            // 0, il mordait ~16 300 $ de revenu familial trop tôt : −317,81 $ mesurés sur 80 k$
            // + 15 k$ de gains, 73 ans, DB). BORNÉE À LA BRANCHE RETRAITÉE : chez un actif, le
            // calcul principal (§1) garde `eligiblePensionIncome: 0` — porter la pension d'un
            // seul côté re-créerait l'incohérence que F1 vient de fermer (mesuré ±1 878 $ sur un
            // actif 72+ à retraits REER ; routé [TAXDEC-ACTIF-72-PENSION-CREDIT]).
            const pensionNominal = ctx.isRetired ? eligiblePensionFor(i) * ctx.inflationFactor : 0;
            const mk = (fam: number): AgeCreditOptions | undefined =>
                a !== undefined && a >= 65
                    ? { age: a, eligiblePensionIncome: pensionNominal, hasSpouse: ctx.activeUsersCount > 1, familyIncome: fam }
                    : undefined;
            const tb = helpers.calculateFiscalReport(perAdultBase, 0, 0, ctx.loopYear, true, mk(familyBase)).totalTax;
            const tt = helpers.calculateFiscalReport(perAdultBase + perAdultBand, 0, 0, ctx.loopYear, true, mk(familyBase + familyBand)).totalTax;
            total += Math.max(0, tt - tb);
        }
        return total;
    };

    // ---- 2. Gains en capital accumulés (palier 250k) ----
    // [FISC-STACK-GAINS-DIV] Hissé hors du bloc : le montant imposable des gains est l'ASSIETTE
    // sur laquelle les dividendes s'empilent ensuite (§3). Vaut 0 sans gains → §3 inchangé.
    const taxableCapGainsTotal = ctx.accCapitalGainsYear > 0
        ? ctx.accCapitalGainsYear * CAPITAL_GAINS_INCLUSION_STANDARD
        : 0;
    if (ctx.accCapitalGainsYear > 0) {
        // FA-3a : SRG exclu de l'assiette d'empilement (non imposable).
        const incomeForGains = ctx.isRetired
            ? ((ctx.incomeRetirementMonthly - gisMonthlySafe) * 12 + ctx.accRentesYear + ctx.accRetraitsReerYear)
            : (ctx.grossMarcBaseAnnual + ctx.grossAnnaBaseAnnual) * Math.pow(1 + ctx.simSalaryGrowth / 100, ctx.yearsElapsed);

        // Inclusion gains capitaux: 50% uniforme (annulation 66.67% > 250k$ mars 2025).
        const taxableCapGains = taxableCapGainsTotal;

        // B-AUDIT-2 — impôt INCRÉMENTAL empilé (progressif) plutôt qu'un taux marginal
        // plat. Les gains s'empilent SUR le revenu : on impose la BANDE
        // [revenu, revenu+gains] = impôt(revenu+gains) − impôt(revenu), au lieu de taxer
        // tout le gain au taux d'ENTRÉE (ce qui sous-estimait l'impôt quand un gros gain
        // franchit un palier). Calculé par adulte (le revenu est familial) puis ×N. Le
        // BPA s'annule dans la soustraction ; un gain qui reste dans le même palier donne
        // un incrément ≈ gain × taux marginal (cohérent avec l'ancien comportement).
        const perAdultIncome = incomeForGains / ctx.activeUsersCount;
        const perAdultGains = taxableCapGains / ctx.activeUsersCount;
        // [FISC-BRACKET-REALINDEX] bloc NOMINAL-cohérent : revenus/gains JAMAIS déflatés ici, impôt
        // ajouté sans re-nominalisation → paliers ×1,02^Δ nominal = le bon espace. PAS de realDeflator
        // (en passer un déflaterait les paliers sous un revenu nominal → sur-imposition croissante).
        // [FISC-TAXDEC-INCR] (a) — la bande porte les ageOpts PAR CONJOINT (GO Marc A2, 2026-08-20) :
        // avant, l'incrément ignorait le crédit d'âge, donc son ÉROSION (féd 15 % du revenu au-dessus
        // du seuil, QC 18,75 % du revenu FAMILIAL au-dessus de la ligne 361) n'était pas capturée →
        // sous-imposition d'un retraité 65+ en zone d'érosion. Pension admissible (revue #676 F1) :
        // le helper passe la pension RÉELLE per-conjoint (source unique `eligiblePensionFor`,
        // renominalisée) — la MÊME aux deux appels, donc le NIVEAU du crédit s'annule tant qu'aucun
        // clamp ne mord, et le clamp de la ligne 361 tombe au VRAI montant — pas de double comptage
        // avec le bloc retraité principal (qui a déjà crédité le niveau sur le revenu SANS gains).
        // Chez un ACTIF elle reste 0, aligné sur mkActiveAgeOpts (§1). `familyIncome` = le familial
        // NOMINAL du bloc, augmenté de la bande FAMILIALE côté top (le test QC ligne 361 est
        // familial). Actif < 65 → opts undefined → bit-identique à l'ancien calcul.
        const tax = incrementalBandTax(perAdultIncome, perAdultGains, incomeForGains, taxableCapGains);
        taxCurrent.gains += tax;
        if (tax > 100) logs.push(`↳ Impôt Gains Cap Accumulés: +${Math.round(tax).toLocaleString('fr-CA')}$`);
    }

    // ---- 3. Dividendes Non-Reg (30% du rendement) ----
    // Hypothèse de MODÈLE (pas une constante fiscale) : 30 % du rendement NonReg est versé en
    // dividendes ADMISSIBLES chaque année (réf FISCAL_REFERENCE §3). Majoration +38 % et CID
    // appliqués dans calculateDividendTax — source unique. ⚠️ Le CID FÉDÉRAL y vaut 15,0198 %
    // × (1 − 16,5 %) = 12,5415 % du majoré ([FISC-DTC-ABATEMENT-ORDER] : un crédit fédéral est
    // soustrait AVANT l'abattement QC, donc sa valeur effective est réduite d'autant) ; le CID
    // QC (11,7 %) n'est pas abattu.
    if (ctx.nonReg > 0) {
        const annualDiv = annualDivForBases; // source unique hissée avant le bloc FSS
        // FA-3a : SRG exclu de l'assiette d'empilement (non imposable).
        // FA-8 (2026-06-11) : MÊME assiette de BASE que l'empilement des gains (§2 ci-dessus) —
        // les retraits REER/FERR de l'année (`accRetraitsReerYear`) font partie du revenu sur
        // lequel le dividende majoré s'empile. Avant, ils manquaient ICI mais pas pour les gains :
        // taux d'entrée sous-évalué → impôt sur dividendes SOUS-estimé pour un retraité vivant de
        // retraits REER (non conservateur) + incohérence d'assiette entre les deux blocs.
        // [FISC-STACK-GAINS-DIV] ⚠️ L'assiette inclut les GAINS IMPOSABLES de l'année. Avant, les
        // deux blocs empilaient CHACUN leur bande à partir du même revenu nu : la bande commune
        // [revenu, revenu+min(gains,divMajoré)] était donc facturée DEUX FOIS au taux bas, et
        // l'impôt total sous-évalué (mesuré : −815 $/an d'impôt brut sur un retraité à 100 k$ de
        // revenu, 30 k$ de gains et 500 k$ de non-enregistré ; le ticket mesurait −1 346 $ sur une
        // autre fixture). L'empilement est désormais SÉQUENTIEL — gains sur le revenu, dividendes
        // sur revenu+gains — ce qui rend la somme des deux bandes exactement égale à la bande
        // totale [revenu, revenu+gains+divMajoré] : aucun trou, aucun recouvrement (vérifié au
        // cent, et c'est le test d'additivité qui le verrouille).
        const incomeForDiv = ((ctx.isRetired
            ? ((ctx.incomeRetirementMonthly - gisMonthlySafe) * 12 + ctx.accRentesYear + ctx.accRetraitsReerYear)
            : (ctx.grossMarcBaseAnnual + ctx.grossAnnaBaseAnnual) * Math.pow(1 + ctx.simSalaryGrowth / 100, ctx.yearsElapsed)
        ) + taxableCapGainsTotal) / ctx.activeUsersCount;
        // [FISC-BRACKET-REALINDEX] bloc NOMINAL-cohérent (comme les gains §2) : incomeForDiv est
        // nominal, l'impôt s'ajoute sans re-nominalisation → PAS de realDeflator.
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
            // [FISC-TAXDEC-INCR] (a) — même traitement que la bande des gains : ageOpts par
            // conjoint, érosion du crédit d'âge capturée sur la bande du dividende MAJORÉ.
            progressiveGrossTax = incrementalBandTax(
                incomeForDiv, grossedUpPerAdult,
                incomeForDiv * ctx.activeUsersCount, grossedUpPerAdult * ctx.activeUsersCount);
        }
        const divTax = helpers.calculateDividendTax(annualDiv, currentMarginal, 'eligible', progressiveGrossTax);
        if (divTax > 1) taxCurrent.gains += divTax;
    }

    // ---- 4. [FA-6-CREDIT-CAP] Crédit-don NON REMBOURSABLE, PLAFONNÉ à l'impôt dû ----
    // Un crédit non remboursable ne peut pas générer de remboursement net : on le borne à l'impôt sur le
    // revenu + gains de l'année (`grossIncomeTax` capturé dans chaque branche + l'impôt sur gains/dividendes
    // empilé ci-dessus). RAMQ/FSS (cotisations santé, dans `divers`) ne sont PAS dans l'assiette du crédit.
    // L'excédent non utilisé est PERDU (le report prospectif 5 ans n'est pas modélisé — conservateur, doc
    // FISCAL_REFERENCE §10). Le crédit appliqué va dans `divers` (qui survit, débité en avril → réduit l'impôt).
    const donCredit = Math.max(0, Number.isFinite(taxCurrent.donCredit) ? taxCurrent.donCredit : 0);
    if (donCredit > 0) {
        // Garde NaN sur l'ASSIETTE (pas seulement le crédit) : un NaN dans grossIncomeTax/gains
        // contaminerait divers→fluxImpots→liquide en silence (leçon HARDEN-NETWORTH-NAN). Repli 0.
        const safeGrossIncomeTax = Number.isFinite(grossIncomeTax) ? grossIncomeTax : 0;
        const safeGains = Number.isFinite(taxCurrent.gains) ? taxCurrent.gains : 0;
        if (!Number.isFinite(grossIncomeTax) || !Number.isFinite(taxCurrent.gains)) {
            logs.push(`⚠️ Assiette crédit-don non finie (revenu=${grossIncomeTax}, gains=${taxCurrent.gains}) → repli 0`);
        }
        const offsettableTax = Math.max(0, safeGrossIncomeTax) + Math.max(0, safeGains);
        const appliedCredit = Math.min(donCredit, offsettableTax);
        taxCurrent.divers -= appliedCredit;
        if (donCredit - appliedCredit > 1) {
            logs.push(`↳ Crédit dons plafonné à l'impôt dû: ${Math.round(appliedCredit).toLocaleString('fr-CA')}$ appliqué, ${Math.round(donCredit - appliedCredit).toLocaleString('fr-CA')}$ non utilisable`);
        }
    }
    taxCurrent.donCredit = 0; // consommé (excédent perdu : aucun report modélisé)

    return { newTaxCurrentYear: taxCurrent, logs };
}
