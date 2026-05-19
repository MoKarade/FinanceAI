
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
