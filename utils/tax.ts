
// ============================================
// BARÈMES FISCAUX CANADA / QUÉBEC — 2025
// Source: ARC + Revenu Québec
// ============================================

// Paliers Fédéraux 2025
export const FED_BRACKETS = [
    { upTo: 57375, rate: 0.15, label: "15.0%" },
    { upTo: 114750, rate: 0.205, label: "20.5%" },
    { upTo: 177882, rate: 0.26, label: "26.0%" },
    { upTo: 253414, rate: 0.29, label: "29.0%" },
    { upTo: Infinity, rate: 0.33, label: "33.0%" }
];

// Paliers Québec 2025
export const QC_BRACKETS = [
    { upTo: 53255, rate: 0.14, label: "14.0%" },
    { upTo: 106495, rate: 0.19, label: "19.0%" },
    { upTo: 129590, rate: 0.24, label: "24.0%" },
    { upTo: Infinity, rate: 0.2575, label: "25.75%" }
];

// Montants personnels de base 2025
export const BASIC_PERSONAL_AMOUNT_FED = 16129;
export const BASIC_PERSONAL_AMOUNT_QC = 17183;

// ============================================
// COTISATIONS SOCIALES 2025
// ============================================
// RRQ (Régime de rentes du Québec) 2025
// Volet 1 : Taux 6.4% | MPE (Max pensionable earnings) : 73 200$ | Exemption : 3 500$
export const RRQ_RATE = 0.064;
export const RRQ_MPE = 73200;
export const RRQ_EXEMPTION = 3500;
export const RRQ_MAX = 4460.80; // (73200 - 3500) * 0.064

// Volet 2 : Taux 4% | MGAAS (YAMPE) : 81 200$ (Estimation 2025)
export const RRQ_PART2_RATE = 0.04;
export const RRQ_YAMPE = 81200;
export const RRQ_PART2_MAX = (RRQ_YAMPE - RRQ_MPE) * RRQ_PART2_RATE; // 320$

// RQAP (Régime québécois d'assurance parentale) 2025
// Taux : 0.494% | Revenu assurable max : 94 000$
// Max de cotisation : 464.36$
export const RQAP_RATE = 0.00494;
export const RQAP_MAX_INCOME = 94000;
export const RQAP_MAX = 464.36;

// AE (Assurance-emploi) 2025 — Taux Québec
// Taux employé QC : 1.31% | Max revenu assurable : 65 700$
// Max cotisation employé QC : 860.67$
export const AE_RATE_QC = 0.0131;
export const AE_MAX_INCOME = 65700;
export const AE_MAX_QC = 860.67;

// ============================================
// TAUX D'INCLUSION DES GAINS EN CAPITAL 2024+
// Budget fédéral 2024 : 66.67% pour gains > 250 000$
// ============================================
export const CAPITAL_GAINS_INCLUSION_STANDARD = 0.50;  // Gains <= 250 000$/an
export const CAPITAL_GAINS_INCLUSION_HIGH = 0.6667;    // Gains > 250 000$/an (Budget 2024)
export const CAPITAL_GAINS_HIGH_THRESHOLD = 250000;

// ============================================
// RETENUES À LA SOURCE (REER) QUÉBEC
// ============================================
/**
 * Calcule le retrait brut nécessaire pour obtenir un montant net précis,
 * en tenant compte de la retenue d'impôt à la source obligatoire au Québec.
 * Paliers QC : < 5k$ (21%), 5k$-15k$ (26%), > 15k$ (30%)
 */
export const calculateGrossWithholdingRRSP = (netNeeded: number): { gross: number, withholding: number } => {
    if (netNeeded <= 0) return { gross: 0, withholding: 0 };

    // Tenter le palier 1 (< 5000$)
    let grossAttempt = netNeeded / (1 - 0.21);
    if (grossAttempt <= 5000) return { gross: grossAttempt, withholding: grossAttempt * 0.21 };

    // Tenter le palier 2 (5000$ à 15000$)
    grossAttempt = netNeeded / (1 - 0.26);
    if (grossAttempt <= 15000) return { gross: grossAttempt, withholding: grossAttempt * 0.26 };

    // Palier 3 (> 15000$)
    grossAttempt = netNeeded / (1 - 0.30);
    return { gross: grossAttempt, withholding: grossAttempt * 0.30 };
};

// ============================================
// VRAIS PLAFONDS CELI HISTORIQUES (PAR ANNÉE)
// Source: ARC — canada.ca
// ============================================
export const CELI_ANNUAL_LIMITS: Record<number, number> = {
    2009: 5000, 2010: 5000, 2011: 5000, 2012: 5000,
    2013: 5500, 2014: 5500, 2015: 10000,
    2016: 5500, 2017: 5500, 2018: 5500,
    2019: 6000, 2020: 6000, 2021: 6000, 2022: 6000,
    2023: 6500, 2024: 7000, 2025: 7000,
    // Estimation future (indexé à l'inflation, arrondi à 500$)
    2026: 7000, 2027: 7500, 2028: 7500, 2029: 7500, 2030: 7500,
};

// ============================================
// VRAIS PLAFONDS REER HISTORIQUES (PAR ANNÉE)
// Source: ARC — canada.ca
// ============================================
export const RRSP_ANNUAL_LIMITS: Record<number, number> = {
    2010: 22000, 2011: 22450, 2012: 22970, 2013: 23820, 2014: 24270,
    2015: 24930, 2016: 25370, 2017: 26010, 2018: 26230, 2019: 26500,
    2020: 27230, 2021: 27830, 2022: 29210, 2023: 30780, 2024: 31560,
    2025: 32490,
    // Estimation future (indexé à l'inflation)
    2026: 33140, 2027: 33800, 2028: 34480, 2029: 35170, 2030: 35870,
};

/**
 * Calcule le plafond CELI total accumulé.
 * Règle: L'espace s'accumule l'année où l'on a 18 ans ET qu'on est au Canada.
 * @param birthYear - Année de naissance (ex: 2000)
 * @param arrivalYear - Année d'arrivée au Canada (ex: 2023)
 * @param currentYear - Année courante
 */
export const calculateCeliRoom = (birthYear: number, arrivalYear: number, currentYear: number): number => {
    let room = 0;
    const yearTurning18 = birthYear + 18;
    // On commence à accumuler l'année où on a 18 ans ET qu'on est arrivé au Canada
    // Le CELI n'existe que depuis 2009.
    const startYear = Math.max(2009, Math.max(yearTurning18, arrivalYear));

    for (let y = startYear; y <= currentYear; y++) {
        // ✅ FIX #17 : Extrapolation automatique des plafonds CELI après 2030
        if (y > 2030) {
            // Indexation théorique de 2.0% par an (conservateur), arrondie au 500$ le plus proche
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

/**
 * Calcule le plafond CELI disponible restant.
 * @param arrivalYear - Année d'arrivée au Canada
 * @param currentYear - Année courante
 * @param currentCeliBalance - Solde CELI actuel (contributions nettes)
 */
export const calculateCeliAvailableRoom = (birthYear: number, arrivalYear: number, currentYear: number, currentCeliBalance: number): number => {
    const totalHistoricalRoom = calculateCeliRoom(birthYear, arrivalYear, currentYear);
    return Math.max(0, totalHistoricalRoom - currentCeliBalance);
};

// ============================================
// CALCULS FISCAUX
// ============================================

export const calculateDetailedTax = (income: number, brackets: typeof FED_BRACKETS, skipBreakdown: boolean = false) => {
    income = Number(income) || 0;
    let totalTax = 0;
    let previousLimit = 0;
    const breakdown = skipBreakdown ? undefined : [];

    for (let i = 0; i < brackets.length; i++) {
        const bracket = brackets[i];
        if (income <= previousLimit) {
            if (!skipBreakdown) {
                breakdown!.push({ rate: bracket.label, amount: 0, filled: 0, max: bracket.upTo === Infinity ? '∞' : bracket.upTo - previousLimit, percentFull: 0 });
            } else {
                break; // Huge optimization: don't iterate higher brackets if income is capped and we don't need UI breakdown
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

// Cache pour l'indexation annuelle afin d'accélérer la simulation Monte Carlo
const bracketsCache: Record<number, {
    fed: typeof FED_BRACKETS,
    qc: typeof QC_BRACKETS,
    basicFed: number,
    basicQc: number,
    inflationFactor: number
}> = {};

const getIndexedBracketsForYear = (year: number) => {
    if (bracketsCache[year]) return bracketsCache[year];
    
    const inflationFactor = Math.pow(1.02, Math.max(0, year - 2025));
    const indexedFed = FED_BRACKETS.map(b => ({ ...b, upTo: b.upTo === Infinity ? Infinity : b.upTo * inflationFactor }));
    const indexedQc = QC_BRACKETS.map(b => ({ ...b, upTo: b.upTo === Infinity ? Infinity : b.upTo * inflationFactor }));
    const basicFed = BASIC_PERSONAL_AMOUNT_FED * inflationFactor;
    const basicQc = BASIC_PERSONAL_AMOUNT_QC * inflationFactor;

    bracketsCache[year] = { fed: indexedFed, qc: indexedQc, basicFed, basicQc, inflationFactor };
    return bracketsCache[year];
};

export const getMarginalRate = (income: number, year: number = 2025) => {
    const { fed, qc } = getIndexedBracketsForYear(year);

    const fedRate = fed.find(b => income <= b.upTo)?.rate || 0.33;
    const qcRate = qc.find(b => income <= b.upTo)?.rate || 0.2575;
    // Abatement du Québec de 16.5% sur l'impôt fédéral
    const effectiveFedRate = fedRate * (1 - 0.165);
    return effectiveFedRate + qcRate;
};

export const calculateFiscalReport = (grossIncome: number, rrspContribution: number, fhsaContribution: number, year: number = 2025, skipBreakdown: boolean = false) => {
    grossIncome = Number(grossIncome) || 0;
    rrspContribution = Number(rrspContribution) || 0;
    fhsaContribution = Number(fhsaContribution) || 0;
    const { fed: indexedFedBrackets, qc: indexedQcBrackets, basicFed: indexedBasicFed, basicQc: indexedBasicQc } = getIndexedBracketsForYear(year);

    // 1. Revenu imposable (après déductions REER et CELIAPP)
    const netTaxable = Math.max(0, grossIncome - rrspContribution - fhsaContribution);

    // 2. Impôt Fédéral
    const fedData = calculateDetailedTax(netTaxable, indexedFedBrackets, skipBreakdown);
    let fedTax = fedData.totalTax;
    // Crédit montant personnel de base (15%)
    fedTax -= (indexedBasicFed * 0.15);
    // Abatement du Québec (16.5% de l'impôt fédéral)
    const abatement = fedTax * 0.165;
    fedTax -= abatement;

    // 3. Impôt Québec
    const qcData = calculateDetailedTax(netTaxable, indexedQcBrackets, skipBreakdown);
    let qcTax = qcData.totalTax;
    // Crédit montant personnel de base QC (14%)
    qcTax -= (indexedBasicQc * 0.14);

    // 4. Cotisations sociales 2025 — TAUX ET VOLETS CORRECTS
    // Volet 1
    const rrqBase = Math.max(0, Math.min(grossIncome, RRQ_MPE) - RRQ_EXEMPTION);
    const rrqVolet1 = Math.min(RRQ_MAX, rrqBase * RRQ_RATE);

    // Volet 2 (4% sur la tranche MPE -> YAMPE)
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

/**
 * Estimation inverse : Calcule le revenu brut annuel à partir d'un net annuel souhaité.
 * Utile quand l'utilisateur ne connaît que son net.
 */
export const calculateGrossFromNet = (targetNetAnnual: number): number => {
    if (targetNetAnnual <= 0) return 0;

    // Recherche par dichotomie (car l'impôt est monotone croissant avec le revenu)
    let low = targetNetAnnual;
    let high = targetNetAnnual * 2; // Hypothèse initiale large
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

/**
 * Calcule l'impôt sur les gains en capital (loi Budget 2024)
 * @param realizedGain - Gain en capital réalisé
 * @param marginalRate - Taux marginal d'imposition (décimal)
 * @param otherGainsThisYear - Autres gains en capital réalisés cette année (pour seuil 250k)
 */
export const calculateCapitalGainsTax = (realizedGain: number, marginalRate: number, activeUsersCount: number = 1, otherGainsThisYear: number = 0): number => {
    if (realizedGain <= 0) return 0;

    // Gains au-dessous du seuil de 250k : 50% d'inclusion
    const limit = CAPITAL_GAINS_HIGH_THRESHOLD * activeUsersCount;
    const remainingStandardRoom = Math.max(0, limit - otherGainsThisYear);
    const gainsAtStandardRate = Math.min(realizedGain, remainingStandardRoom);
    const gainsAtHighRate = Math.max(0, realizedGain - gainsAtStandardRate);

    const taxStandard = gainsAtStandardRate * CAPITAL_GAINS_INCLUSION_STANDARD * marginalRate;
    const taxHigh = gainsAtHighRate * CAPITAL_GAINS_INCLUSION_HIGH * marginalRate;

    return taxStandard + taxHigh;
};

/**
 * Calcule l'impôt réel sur les dividendes (Canada/Québec)
 * Utilise le mécanisme de "Majoration" (Gross-up) et "Crédit d'impôt pour dividendes".
 * On assume des dividendes déterminés (Majorations de 38%).
 */
export const calculateDividendTax = (dividendAmount: number, marginalRate: number): number => {
    if (dividendAmount <= 0) return 0;

    // 1. Majoration (Gross-up) de 38% pour dividendes déterminés
    const grossedUpAmount = dividendAmount * 1.38;

    // 2. Impôt brut théorique (avant crédits)
    const grossTax = grossedUpAmount * marginalRate;

    // 3. Crédit d'impôt pour dividendes (CID)
    // Fédéral : ~15.0198% du montant majoré
    // Québec : ~11.7% du montant majoré
    // Total approx : 26.7 % du montant majoré
    const cidTotalRate = 0.267;
    const cidAmount = grossedUpAmount * cidTotalRate;

    // 4. Impôt net
    return Math.max(0, grossTax - cidAmount);
};
