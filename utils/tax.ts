
// ============================================
// BARÈMES FISCAUX CANADA / QUÉBEC — 2026
// Source: ARC + Revenu Québec
// ============================================

export const FED_BRACKETS = [
    { upTo: 58523, rate: 0.14, label: "14.0%" },
    { upTo: 117045, rate: 0.205, label: "20.5%" },
    { upTo: 181440, rate: 0.26, label: "26.0%" },
    { upTo: 258482, rate: 0.29, label: "29.0%" },
    { upTo: Infinity, rate: 0.33, label: "33.0%" }
];

export const QC_BRACKETS = [
    { upTo: 54345, rate: 0.14, label: "14.0%" },
    { upTo: 108680, rate: 0.19, label: "19.0%" },
    { upTo: 132245, rate: 0.24, label: "24.0%" },
    { upTo: Infinity, rate: 0.2575, label: "25.75%" }
];

export const BASIC_PERSONAL_AMOUNT_FED = 16452;
export const BASIC_PERSONAL_AMOUNT_QC = 18952;

// RRQ 2026: 5.4% base + 1% supplémentaire (volet 1) = 6.4%
// Source: Retraite Québec 2026
export const RRQ_RATE = 0.064;
export const RRQ_MPE = 74900;
export const RRQ_EXEMPTION = 3500;
export const RRQ_MAX = (RRQ_MPE - RRQ_EXEMPTION) * RRQ_RATE; // ≈ 4 569.60$

export const RRQ_PART2_RATE = 0.04;
export const RRQ_YAMPE = 85100;
export const RRQ_PART2_MAX = (RRQ_YAMPE - RRQ_MPE) * RRQ_PART2_RATE;

export const RQAP_RATE = 0.0043;
export const RQAP_MAX_INCOME = 103000;
export const RQAP_MAX = 442.90;

export const AE_RATE_QC = 0.0130;
export const AE_MAX_INCOME = 68900;
export const AE_MAX_QC = 895.70;

// Inclusion gains en capital: 50% uniforme depuis annulation de la proposition
// fédérale à 66.67% > 250k$ en mars 2025.
export const CAPITAL_GAINS_INCLUSION_STANDARD = 0.50;

// Plafonds spécifiques aux régimes (par utilisateur).
// Source : Budget fédéral 2024-2026. À mettre à jour à chaque budget.
export const RAP_LIMIT_PER_USER = 60000;                    // Régime Accession Propriété
export const PBMA_THRESHOLD_PER_USER = 17183;               // Palier de base montant ajusté
export const OAS_CLAWBACK_THRESHOLD_2026 = 93454;           // Seuil PSV clawback 2026 (indexé 2024→2026)
export const FHSA_LIFETIME_LIMIT_PER_USER = 40000;          // CELIAPP plafond à vie
export const FHSA_ANNUAL_LIMIT_PER_USER = 8000;             // CELIAPP plafond annuel

// ============================================
// CRÉDITS 65+ ET REVENU DE RETRAITE (audit §6.2)
// ============================================

// --- Fédéral ---
// Crédit en raison de l'âge (ligne 30100). Source: ARC, indexation 2026 = 2.0%.
// Base 2025: 8 790$ max, seuil 45 522$, réduction 15% au-delà.
// Voir https://www.canada.ca/.../line-30100-amount.html
export const AGE_AMOUNT_FED_2026 = 8966;                    // 8790 × 1.02
export const AGE_AMOUNT_FED_THRESHOLD_2026 = 46432;         // 45522 × 1.02
export const AGE_AMOUNT_FED_REDUCTION_RATE = 0.15;
export const AGE_AMOUNT_FED_MIN_AGE = 65;

// Crédit pour revenu de pension (ligne 31400). Source: ARC, montant fixe
// non indexé depuis 2006. Voir https://www.canada.ca/.../line-31400-pension-income-amount.html
export const PENSION_INCOME_AMOUNT_FED = 2000;

// Taux du palier le plus bas fédéral pour crédits non-remboursables (gelé à 15%
// par l'ARC malgré la baisse du 1er palier à 14% en 2026 — politique C-4).
export const FED_NONREFUNDABLE_RATE = 0.15;

// --- Provincial Québec ---
// Ligne 361 — Montant accordé en raison de l'âge ou pour revenus de retraite.
// Source: Revenu Québec, formulaire TP-1.G 2026, indexation 2026 = 2.05%.
// Voir https://www.revenuquebec.ca/.../aide-par-ligne/350-a-398-1-credits-dimpot-non-remboursables/ligne-361/
export const AGE_AMOUNT_QC_2026 = 3986;                     // 65+ par personne, 2026
export const RETIREMENT_INCOME_AMOUNT_QC_2026 = 3058;       // max sur premier 3 058$ de pension admissible (≈2998 × 1.0205)
export const QC_LINE_361_THRESHOLD_SINGLE = 27835;          // revenu familial max pour crédit complet (sans conjoint)
export const QC_LINE_361_THRESHOLD_COUPLE = 45270;          // revenu familial max pour crédit complet (avec conjoint)
export const QC_LINE_361_REDUCTION_RATE = 0.1875;           // 18.75% au-delà du seuil
export const QC_LINE_361_MIN_AGE = 65;

// Taux du palier le plus bas QC pour crédits non-remboursables.
export const QC_NONREFUNDABLE_RATE = 0.14;

export interface AgeCreditOptions {
    /** Âge de la personne au moment du calcul (≥ 65 pour activer crédit âge fed + QC). */
    age?: number;
    /** Revenu de pension admissible — sert au crédit pension fed (max 2 000$) et au crédit revenu retraite QC. */
    eligiblePensionIncome?: number;
    /** Si vrai, utilise le seuil QC couple (45 270$). Sinon seuil individuel (27 835$). */
    hasSpouse?: boolean;
    /**
     * Revenu familial QC utilisé pour réduire la ligne 361.
     * Si non fourni, on prend le revenu imposable net (grossIncome - rrsp - fhsa).
     */
    familyIncome?: number;
}

/**
 * Calcule les crédits non-remboursables fédéraux et provinciaux liés à l'âge
 * (65+) et au revenu de pension admissible.
 *
 * Retourne `{ fedCredit, qcCredit }` à SOUSTRAIRE de l'impôt déjà calculé
 * (avant abattement fédéral et avant BPA).
 *
 * Sources :
 *  - ARC ligne 30100 (âge fédéral, indexé annuellement via getIndexedBracketsForYear)
 *  - ARC ligne 31400 (pension fédéral, fixe 2 000$, restreint 65+ hors cas invalidité)
 *  - Revenu Québec ligne 361 (âge + revenu retraite, indexé annuellement)
 *
 * @param opts          Âge, revenu pension admissible, statut conjoint, revenu familial
 * @param netTaxableIncome Revenu net après déductions (sert au seuil fed et fallback QC)
 * @param year          Année fiscale pour indexer les seuils et montants (défaut 2026)
 */
export const calculateAgeAndPensionCredits = (
    opts: AgeCreditOptions,
    netTaxableIncome: number,
    year: number = 2026,
): { fedCredit: number; qcCredit: number } => {
    // Guard NaN/Infinity (audit silent-failure-hunter §6.2) : un NaN injecté via
    // opts (e.g. activeUsersCount = 0 → division NaN) polluerait tout le calcul.
    const safe = (v: number | undefined, fallback = 0): number => {
        const n = v ?? fallback;
        return Number.isFinite(n) ? Math.max(0, n) : fallback;
    };

    const age = safe(opts.age);
    const pension = safe(opts.eligiblePensionIncome);
    const familyIncome = safe(opts.familyIncome, netTaxableIncome);

    // Indexation des seuils et montants 2026 selon l'année (fact mutualisé
    // avec getIndexedBracketsForYear pour cohérence avec les paliers).
    const { inflationFactor } = getIndexedBracketsForYear(year);
    const ageAmountFed = AGE_AMOUNT_FED_2026 * inflationFactor;
    const ageThresholdFed = AGE_AMOUNT_FED_THRESHOLD_2026 * inflationFactor;
    const ageAmountQc = AGE_AMOUNT_QC_2026 * inflationFactor;
    const retirementAmountQc = RETIREMENT_INCOME_AMOUNT_QC_2026 * inflationFactor;
    const thresholdSingle = QC_LINE_361_THRESHOLD_SINGLE * inflationFactor;
    const thresholdCouple = QC_LINE_361_THRESHOLD_COUPLE * inflationFactor;

    let fedAmount = 0;
    let qcAmount = 0;

    // Crédit fédéral en raison de l'âge (65+, ARC ligne 30100)
    if (age >= AGE_AMOUNT_FED_MIN_AGE) {
        fedAmount += netTaxableIncome <= ageThresholdFed
            ? ageAmountFed
            : Math.max(
                0,
                ageAmountFed - (netTaxableIncome - ageThresholdFed) * AGE_AMOUNT_FED_REDUCTION_RATE,
            );
    }

    // Crédit fédéral pour revenu de pension (ARC ligne 31400).
    // FIX audit code-reviewer + silent-failure §6.2 — restreint 65+ pour rentes
    // standard (FERR, pension privée, REER converti). Les exceptions invalidité
    // < 65 ans ne sont pas modélisées dans FinanceAI (caller responsabilité).
    if (age >= AGE_AMOUNT_FED_MIN_AGE) {
        fedAmount += Math.min(PENSION_INCOME_AMOUNT_FED, pension);
    }

    // Ligne 361 QC (âge + revenu retraite combinés, Revenu Québec)
    if (age >= QC_LINE_361_MIN_AGE) {
        const retirementQc = Math.min(retirementAmountQc, pension);
        const grossLine361 = ageAmountQc + retirementQc;

        const threshold = opts.hasSpouse ? thresholdCouple : thresholdSingle;
        const reduction = Math.max(0, familyIncome - threshold) * QC_LINE_361_REDUCTION_RATE;
        qcAmount = Math.max(0, grossLine361 - reduction);
    }

    return {
        fedCredit: fedAmount * FED_NONREFUNDABLE_RATE,
        qcCredit: qcAmount * QC_NONREFUNDABLE_RATE,
    };
};

// ============================================
// RAMQ — Régime public d'assurance médicaments (audit §6.4)
// Source: Régie de l'assurance maladie du Québec (RAMQ) + Revenu Québec ligne 447.
// Annexe K de la déclaration TP-1. Indexation annuelle au 1er juillet.
//
// Sources :
//  - RAMQ tarifs 2026 : https://www.ramq.gouv.qc.ca/fr/citoyens/assurance-medicaments-prescrits
//  - Annexe K Revenu Québec : https://www.revenuquebec.ca/fr/citoyens/declaration-de-revenus/produire-votre-declaration-de-revenus/comment-remplir-votre-declaration-de-revenus/aide-par-ligne/400-a-447-impot-et-cotisations/ligne-447/
//  - CFFP Université de Sherbrooke (paliers détaillés) : https://cffp.recherche.usherbrooke.ca/outils-ressources/guide-mesures-fiscales/cotisation-regime-assurance-medicaments-quebec/
// ============================================

// Seuils d'exemption 2026 (revenu familial net) — pas de prime sous le seuil.
export const RAMQ_EXEMPTION_SINGLE_2026 = 19500;
export const RAMQ_EXEMPTION_COUPLE_2026 = 31610;
// Bonus seuil selon enfants à charge — barème Annexe K 2026 (Revenu Québec).
// Note: l'Annexe K s'arrête à "2 enfants ou plus" — pas de tranche additionnelle 3+.
export const RAMQ_EXEMPTION_SINGLE_CHILD_1 = 4105;          // ajouté pour 1 enfant
export const RAMQ_EXEMPTION_SINGLE_CHILD_2PLUS = 7895;      // total pour 2+ enfants
export const RAMQ_EXEMPTION_COUPLE_CHILD_1 = 12110;
export const RAMQ_EXEMPTION_COUPLE_CHILD_2PLUS = 16215;

// Paliers sur l'excès au-dessus du seuil
export const RAMQ_BRACKET1_AMOUNT = 5000;
export const RAMQ_BRACKET2_AMOUNT = 9600;       // jusqu'à 14 600$ d'excès total

// Taux par adulte (single vs couple — par adulte du couple)
export const RAMQ_RATE_SINGLE_BRACKET1 = 0.0765;
export const RAMQ_RATE_SINGLE_BRACKET2 = 0.1148;
export const RAMQ_RATE_COUPLE_BRACKET1 = 0.0384;
export const RAMQ_RATE_COUPLE_BRACKET2 = 0.0575;

// Prime maximale 2026
export const RAMQ_MAX_PREMIUM_2026 = 766;

export interface RamqOptions {
    /** Couple = seuils plus élevés et taux plus bas par adulte. */
    hasSpouse?: boolean;
    /** Nombre d'enfants à charge — relève le seuil d'exemption. */
    childrenCount?: number;
    /**
     * Personne exemptée du paiement (livret de réclamation valide, étudiant 18-25
     * célibataire temps plein, 65+ avec SRG maximum, trouble fonctionnel < 18 ans,
     * COUVERTURE PRIVÉE par régime employeur/association).
     * Caller responsabilité de fournir ce flag.
     */
    exempt?: boolean;
}

/**
 * Calcule la prime RAMQ annuelle PAR ADULTE pour le régime public d'assurance
 * médicaments (Revenu Québec ligne 447, Annexe K).
 *
 * Source : RAMQ + Revenu Québec, barème 2026 (prime max 766$). Indexation
 * annuelle via getIndexedBracketsForYear pour les projections > 2026.
 *
 * Important : si l'adulte est couvert par un régime PRIVÉ (employeur, association
 * professionnelle, conjoint), il ne paie pas la prime publique. Le caller doit
 * passer `exempt: true` dans ce cas.
 *
 * @param familyNetIncome Revenu familial NET (après déductions REER/FHSA).
 * @param opts            hasSpouse, childrenCount, exempt
 * @param year            Année fiscale pour indexer seuils + prime max (défaut 2026).
 * @returns Prime annuelle PAR ADULTE (0 à RAMQ_MAX_PREMIUM_2026 × indexation).
 *          Multiplier par activeUsersCount pour le total famille.
 */
export const calculateRamqPremium = (
    familyNetIncome: number,
    opts: RamqOptions = {},
    year: number = 2026,
): number => {
    if (opts.exempt) return 0;
    if (!Number.isFinite(familyNetIncome) || familyNetIncome <= 0) return 0;

    const children = Math.max(0, Math.floor(opts.childrenCount ?? 0));
    const isCouple = !!opts.hasSpouse;

    // Indexation annuelle des seuils et de la prime max (mutualisée avec les
    // paliers d'impôt via getIndexedBracketsForYear).
    const { inflationFactor } = getIndexedBracketsForYear(year);

    let exemption = (isCouple ? RAMQ_EXEMPTION_COUPLE_2026 : RAMQ_EXEMPTION_SINGLE_2026) * inflationFactor;
    if (children >= 1) {
        exemption += (isCouple ? RAMQ_EXEMPTION_COUPLE_CHILD_1 : RAMQ_EXEMPTION_SINGLE_CHILD_1) * inflationFactor;
    }
    if (children >= 2) {
        // L'écart entre "1 enfant" et "2+ enfants" couvre le 2e enfant et au-delà
        // (l'Annexe K ne distingue pas 2 vs 3+ enfants — c'est un palier final).
        exemption += (isCouple
            ? (RAMQ_EXEMPTION_COUPLE_CHILD_2PLUS - RAMQ_EXEMPTION_COUPLE_CHILD_1)
            : (RAMQ_EXEMPTION_SINGLE_CHILD_2PLUS - RAMQ_EXEMPTION_SINGLE_CHILD_1)
        ) * inflationFactor;
    }

    const excess = Math.max(0, familyNetIncome - exemption);
    if (excess <= 0) return 0;

    const rate1 = isCouple ? RAMQ_RATE_COUPLE_BRACKET1 : RAMQ_RATE_SINGLE_BRACKET1;
    const rate2 = isCouple ? RAMQ_RATE_COUPLE_BRACKET2 : RAMQ_RATE_SINGLE_BRACKET2;

    const bracket1Width = RAMQ_BRACKET1_AMOUNT * inflationFactor;
    const bracket2Width = RAMQ_BRACKET2_AMOUNT * inflationFactor;
    const maxPremium = RAMQ_MAX_PREMIUM_2026 * inflationFactor;

    const inBracket1 = Math.min(excess, bracket1Width);
    const inBracket2 = Math.min(Math.max(0, excess - bracket1Width), bracket2Width);

    const premium = inBracket1 * rate1 + inBracket2 * rate2;
    return Math.min(maxPremium, premium);
};

// ============================================
// FSS — Cotisation au Fonds des services de santé (audit §6.1)
// Source: Revenu Québec ligne 446 + Annexe F. S'applique principalement aux
// retraités, indépendants et autres revenus non salariaux (les salariés sont
// couverts par leur employeur via cotisation FSS de l'employeur).
//
// Paliers 2025 (indexés annuellement) :
//  - 0 à 18 130$         → 0$
//  - 18 130 à 33 130$    → 1% × (revenu - 18 130)
//  - 33 130 à 63 060$    → 150$ fixe
//  - 63 060 à 148 030$   → 150$ + 1% × (revenu - 63 060)
//  - ≥ 148 030$          → 1 000$ max
//
// https://www.revenuquebec.ca/fr/citoyens/declaration-de-revenus/produire-votre-declaration-de-revenus/comment-remplir-votre-declaration-de-revenus/aide-par-ligne/400-a-447-impot-et-cotisations/ligne-446/
// ============================================

export const FSS_THRESHOLD_ZERO = 18130;       // pas de cotisation sous ce seuil
export const FSS_THRESHOLD_FLAT = 33130;       // début palier 150$ fixe
export const FSS_THRESHOLD_RAMP = 63060;       // début palier 150$ + 1%
export const FSS_THRESHOLD_MAX = 148030;       // début plafond 1 000$
export const FSS_RATE_TIER1 = 0.01;            // 1% sur première tranche progressive
export const FSS_RATE_TIER2 = 0.01;            // 1% sur deuxième tranche progressive
export const FSS_FLAT_AMOUNT = 150;
export const FSS_MAX_PREMIUM = 1000;

/**
 * Calcule la cotisation FSS (ligne 446) selon l'Annexe F pour un particulier.
 *
 * Applicable aux retraités, indépendants et autres revenus non salariaux.
 * Les salariés sont couverts par leur employeur (cotisation FSS employeur).
 *
 * @param netIncome  Revenu net imposable (après déductions).
 * @param year       Année fiscale pour indexation (défaut 2026).
 * @returns Cotisation FSS annuelle (0 à FSS_MAX_PREMIUM × indexation).
 */
export const calculateFSSPremium = (
    netIncome: number,
    year: number = 2026,
): number => {
    if (!Number.isFinite(netIncome) || netIncome <= 0) return 0;

    const { inflationFactor } = getIndexedBracketsForYear(year);
    const t1 = FSS_THRESHOLD_ZERO * inflationFactor;
    const t2 = FSS_THRESHOLD_FLAT * inflationFactor;
    const t3 = FSS_THRESHOLD_RAMP * inflationFactor;
    const t4 = FSS_THRESHOLD_MAX * inflationFactor;
    const flat = FSS_FLAT_AMOUNT * inflationFactor;
    const max = FSS_MAX_PREMIUM * inflationFactor;

    if (netIncome <= t1) return 0;
    if (netIncome <= t2) return (netIncome - t1) * FSS_RATE_TIER1;
    if (netIncome <= t3) return flat;
    if (netIncome <= t4) return flat + (netIncome - t3) * FSS_RATE_TIER2;
    return max;
};

export const calculateGrossWithholdingRRSP = (netNeeded: number): { gross: number, withholding: number } => {
    if (netNeeded <= 0) return { gross: 0, withholding: 0 };
    let grossAttempt = netNeeded / (1 - 0.21);
    if (grossAttempt <= 5000) return { gross: grossAttempt, withholding: grossAttempt * 0.21 };
    grossAttempt = netNeeded / (1 - 0.26);
    if (grossAttempt <= 15000) return { gross: grossAttempt, withholding: grossAttempt * 0.26 };
    grossAttempt = netNeeded / (1 - 0.30);
    return { gross: grossAttempt, withholding: grossAttempt * 0.30 };
};

export const CELI_ANNUAL_LIMITS: Record<number, number> = {
    2009: 5000, 2010: 5000, 2011: 5000, 2012: 5000,
    2013: 5500, 2014: 5500, 2015: 10000,
    2016: 5500, 2017: 5500, 2018: 5500,
    2019: 6000, 2020: 6000, 2021: 6000, 2022: 6000,
    2023: 6500, 2024: 7000, 2025: 7000,
    2026: 7000, 2027: 7500, 2028: 7500, 2029: 7500, 2030: 7500,
};

export const RRSP_ANNUAL_LIMITS: Record<number, number> = {
    2010: 22000, 2011: 22450, 2012: 22970, 2013: 23820, 2014: 24270,
    2015: 24930, 2016: 25370, 2017: 26010, 2018: 26230, 2019: 26500,
    2020: 27230, 2021: 27830, 2022: 29210, 2023: 30780, 2024: 31560,
    2025: 32490,
    2026: 33810, 2027: 34480, 2028: 35170, 2029: 35870, 2030: 36590,
};

export const calculateCeliRoom = (birthYear: number, arrivalYear: number, currentYear: number): number => {
    let room = 0;
    const yearTurning18 = birthYear + 18;
    const startYear = Math.max(2009, Math.max(yearTurning18, arrivalYear));

    for (let y = startYear; y <= currentYear; y++) {
        if (y > 2030) {
            const yearsSince2030 = y - 2030;
            const approxInflation = Math.pow(1.02, yearsSince2030);
            const base2030 = 7500;
            const rawLimit = base2030 * approxInflation;
            room += Math.round(rawLimit / 500) * 500;
        } else {
            room += CELI_ANNUAL_LIMITS[y] || 7500;
        }
    }
    return room;
};

export const calculateCeliAvailableRoom = (birthYear: number, arrivalYear: number, currentYear: number, currentCeliBalance: number): number => {
    const totalHistoricalRoom = calculateCeliRoom(birthYear, arrivalYear, currentYear);
    return Math.max(0, totalHistoricalRoom - currentCeliBalance);
};

type BracketBreakdown = {
    rate: string;
    amount: number;
    filled: number;
    max: number | string;
    percentFull: number;
};

export const calculateDetailedTax = (income: number, brackets: typeof FED_BRACKETS, skipBreakdown: boolean = false) => {
    income = Number(income) || 0;
    let totalTax = 0;
    let previousLimit = 0;
    // Fix: typage explicite pour eviter TS7005 implicit any[]
    const breakdown: BracketBreakdown[] | undefined = skipBreakdown ? undefined : [];

    for (let i = 0; i < brackets.length; i++) {
        const bracket = brackets[i];
        if (income <= previousLimit) {
            if (!skipBreakdown) {
                breakdown!.push({ rate: bracket.label, amount: 0, filled: 0, max: bracket.upTo === Infinity ? '∞' : bracket.upTo - previousLimit, percentFull: 0 });
            } else {
                break;
            }
            continue;
        }

        const currentBracketRange = bracket.upTo - previousLimit;
        const taxableInThisBracket = Math.min(Math.max(0, income - previousLimit), currentBracketRange);

        const taxInBracket = taxableInThisBracket * bracket.rate;
        totalTax += taxInBracket;

        if (!skipBreakdown) {
            breakdown!.push({
                rate: bracket.label,
                amount: taxInBracket,
                filled: taxableInThisBracket,
                max: bracket.upTo === Infinity ? '∞' : currentBracketRange,
                percentFull: bracket.upTo === Infinity ? 100 : Math.min(100, (taxableInThisBracket / currentBracketRange) * 100)
            });
        }

        previousLimit = bracket.upTo;
    }
    return { totalTax, breakdown };
};

const bracketsCache: Record<number, {
    fed: typeof FED_BRACKETS,
    qc: typeof QC_BRACKETS,
    basicFed: number,
    basicQc: number,
    inflationFactor: number
}> = {};

const getIndexedBracketsForYear = (year: number) => {
    if (bracketsCache[year]) return bracketsCache[year];
    const inflationFactor = Math.pow(1.02, Math.max(0, year - 2026));
    const indexedFed = FED_BRACKETS.map(b => ({ ...b, upTo: b.upTo === Infinity ? Infinity : b.upTo * inflationFactor }));
    const indexedQc = QC_BRACKETS.map(b => ({ ...b, upTo: b.upTo === Infinity ? Infinity : b.upTo * inflationFactor }));
    const basicFed = BASIC_PERSONAL_AMOUNT_FED * inflationFactor;
    const basicQc = BASIC_PERSONAL_AMOUNT_QC * inflationFactor;
    bracketsCache[year] = { fed: indexedFed, qc: indexedQc, basicFed, basicQc, inflationFactor };
    return bracketsCache[year];
};

export const getMarginalRate = (income: number, year: number = 2026) => {
    const { fed, qc } = getIndexedBracketsForYear(year);
    const fedRate = fed.find(b => income <= b.upTo)?.rate || 0.33;
    const qcRate = qc.find(b => income <= b.upTo)?.rate || 0.2575;
    const effectiveFedRate = fedRate * (1 - 0.165);
    return effectiveFedRate + qcRate;
};

export type FiscalReport = ReturnType<typeof calculateFiscalReport>;

export const calculateFiscalReport = (
    grossIncome: number,
    rrspContribution: number,
    fhsaContribution: number,
    year: number = 2026,
    skipBreakdown: boolean = false,
    ageOpts?: AgeCreditOptions,
) => {
    grossIncome = Number(grossIncome) || 0;
    rrspContribution = Number(rrspContribution) || 0;
    fhsaContribution = Number(fhsaContribution) || 0;
    const { fed: indexedFedBrackets, qc: indexedQcBrackets, basicFed: indexedBasicFed, basicQc: indexedBasicQc } = getIndexedBracketsForYear(year);

    const netTaxable = Math.max(0, grossIncome - rrspContribution - fhsaContribution);

    // Crédits 65+ et revenu de retraite (audit §6.2). Calculés une seule fois,
    // appliqués au fédéral AVANT l'abatement QC et au provincial APRÈS le BPA.
    // L'année est propagée pour indexer seuils et montants ligne 361 + ligne 30100.
    const ageCredits = ageOpts
        ? calculateAgeAndPensionCredits(ageOpts, netTaxable, year)
        : { fedCredit: 0, qcCredit: 0 };

    const fedData = calculateDetailedTax(netTaxable, indexedFedBrackets, skipBreakdown);
    let fedTax = fedData.totalTax;
    // Crédit non-remboursable BPA fédéral: l'ARC maintient le crédit au taux le plus
    // bas applicable, soit 15% (gelé), malgré la baisse du 1er palier à 14% (C-4).
    fedTax -= (indexedBasicFed * FED_NONREFUNDABLE_RATE);
    // §6.2 — crédits âge fédéral + pension fédéral (appliqués AVANT abatement QC).
    // Le clamp final à 0 sur totalTax couvre déjà le cas où fedTax devient négatif.
    fedTax -= ageCredits.fedCredit;
    const abatement = fedTax * 0.165;
    fedTax -= abatement;

    const qcData = calculateDetailedTax(netTaxable, indexedQcBrackets, skipBreakdown);
    let qcTax = qcData.totalTax;
    qcTax -= (indexedBasicQc * QC_NONREFUNDABLE_RATE);
    // §6.2 — ligne 361 QC (âge + revenu retraite, réduite par revenu familial)
    qcTax -= ageCredits.qcCredit;

    const rrqBase = Math.max(0, Math.min(grossIncome, RRQ_MPE) - RRQ_EXEMPTION);
    const rrqVolet1 = Math.min(RRQ_MAX, rrqBase * RRQ_RATE);

    const rrqBaseVolet2 = Math.max(0, Math.min(grossIncome, RRQ_YAMPE) - RRQ_MPE);
    const rrqVolet2 = rrqBaseVolet2 * RRQ_PART2_RATE;
    const rrq = rrqVolet1 + rrqVolet2;

    const rqap = Math.min(RQAP_MAX, Math.min(grossIncome, RQAP_MAX_INCOME) * RQAP_RATE);
    const ae = Math.min(AE_MAX_QC, Math.min(grossIncome, AE_MAX_INCOME) * AE_RATE_QC);

    const totalTax = Math.max(0, fedTax) + Math.max(0, qcTax);
    const totalDeductions = totalTax + rrq + rqap + ae;
    const netIncome = grossIncome - totalDeductions;

    const marginalRate = getMarginalRate(netTaxable);

    return {
        fedTax: Math.max(0, fedTax),
        qcTax: Math.max(0, qcTax),
        deductionsSource: rrq + rqap + ae,
        rrq, rrqVolet1, rrqVolet2, rqap, ae,
        totalTax,
        netIncome,
        marginalRate,
        averageRate: grossIncome > 0 ? (totalTax / grossIncome) * 100 : 0,
        fedBreakdown: fedData.breakdown,
        qcBreakdown: qcData.breakdown,
        refundOrOwe: 0
    };
};

export const calculateNetFromGross = (monthlyGross: number) => {
    const annualGross = monthlyGross * 12;
    const report = calculateFiscalReport(annualGross, 0, 0);
    return report.netIncome / 12;
};

export const calculateGrossFromNet = (targetNetAnnual: number): number => {
    if (targetNetAnnual <= 0) return 0;
    let low = targetNetAnnual;
    let high = targetNetAnnual * 2;
    let iterations = 0;

    while (iterations < 20) {
        const mid = (low + high) / 2;
        const net = calculateFiscalReport(mid, 0, 0).netIncome;
        if (Math.abs(net - targetNetAnnual) < 1) return mid;
        if (net < targetNetAnnual) {
            low = mid;
        } else {
            high = mid;
        }
        iterations++;
    }
    return (low + high) / 2;
};

// Signature préservée pour compat — paramètres activeUsersCount/otherGainsThisYear
// ignorés depuis l'annulation de la proposition fédérale 66.67% > 250k$ (mars 2025).
export const calculateCapitalGainsTax = (realizedGain: number, marginalRate: number, _activeUsersCount: number = 1, _otherGainsThisYear: number = 0): number => {
    if (realizedGain <= 0) return 0;
    return realizedGain * CAPITAL_GAINS_INCLUSION_STANDARD * marginalRate;
};

export type DividendKind = 'eligible' | 'non-eligible';

// Dividendes 2026 (Québec):
// - Admissibles (grandes sociétés cotées): gross-up 38%, CID fédéral 15.0198% + CID QC 11.7% du majoré
// - Non-admissibles (SPCC, sociétés privées): gross-up 15%, CID fédéral 9.0301% + CID QC 3.42% du majoré
export const calculateDividendTax = (dividendAmount: number, marginalRate: number, kind: DividendKind = 'eligible'): number => {
    if (dividendAmount <= 0) return 0;
    const grossUpRate = kind === 'eligible' ? 1.38 : 1.15;
    const cidFedRate = kind === 'eligible' ? 0.150198 : 0.090301;
    const cidQcRate = kind === 'eligible' ? 0.117 : 0.0342;
    const grossedUpAmount = dividendAmount * grossUpRate;
    const grossTax = grossedUpAmount * marginalRate;
    const cidAmount = grossedUpAmount * (cidFedRate + cidQcRate);
    return Math.max(0, grossTax - cidAmount);
};
