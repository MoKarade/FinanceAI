
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

// RRQ 2026: 5.3% base + 1% supplémentaire (volet 1)
export const RRQ_RATE = 0.063;
export const RRQ_MPE = 74600;
export const RRQ_EXEMPTION = 3500;
export const RRQ_MAX = 4479.30;

export const RRQ_PART2_RATE = 0.04;
export const RRQ_YAMPE = 85000;
export const RRQ_PART2_MAX = (RRQ_YAMPE - RRQ_MPE) * RRQ_PART2_RATE;

export const RQAP_RATE = 0.0043;
export const RQAP_MAX_INCOME = 103000;
export const RQAP_MAX = 442.90;

export const AE_RATE_QC = 0.0130;
export const AE_MAX_INCOME = 68900;
export const AE_MAX_QC = 895.70;

export const CAPITAL_GAINS_INCLUSION_STANDARD = 0.50;
export const CAPITAL_GAINS_INCLUSION_HIGH = 0.6667;
export const CAPITAL_GAINS_HIGH_THRESHOLD = 250000;

// Plafonds spécifiques aux régimes (par utilisateur).
// Source : Budget fédéral 2024-2026. À mettre à jour à chaque budget.
export const RAP_LIMIT_PER_USER = 60000;                    // Régime Accession Propriété
export const PBMA_THRESHOLD_PER_USER = 17183;               // Palier de base montant ajusté
export const OAS_CLAWBACK_THRESHOLD_2024 = 90997;           // Seuil PSV clawback 2024
export const FHSA_LIFETIME_LIMIT_PER_USER = 40000;          // CELIAPP plafond à vie
export const FHSA_ANNUAL_LIMIT_PER_USER = 8000;             // CELIAPP plafond annuel

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
    2026: 33140, 2027: 33800, 2028: 34480, 2029: 35170, 2030: 35870,
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

export const calculateFiscalReport = (grossIncome: number, rrspContribution: number, fhsaContribution: number, year: number = 2026, skipBreakdown: boolean = false) => {
    grossIncome = Number(grossIncome) || 0;
    rrspContribution = Number(rrspContribution) || 0;
    fhsaContribution = Number(fhsaContribution) || 0;
    const { fed: indexedFedBrackets, qc: indexedQcBrackets, basicFed: indexedBasicFed, basicQc: indexedBasicQc } = getIndexedBracketsForYear(year);

    const netTaxable = Math.max(0, grossIncome - rrspContribution - fhsaContribution);

    const fedData = calculateDetailedTax(netTaxable, indexedFedBrackets, skipBreakdown);
    let fedTax = fedData.totalTax;
    // Crédit non-remboursable BPA fédéral: taux de la 1ère tranche (14% en 2026, baisse de 15%)
    fedTax -= (indexedBasicFed * 0.14);
    const abatement = fedTax * 0.165;
    fedTax -= abatement;

    const qcData = calculateDetailedTax(netTaxable, indexedQcBrackets, skipBreakdown);
    let qcTax = qcData.totalTax;
    qcTax -= (indexedBasicQc * 0.14);

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

export const calculateCapitalGainsTax = (realizedGain: number, marginalRate: number, activeUsersCount: number = 1, otherGainsThisYear: number = 0): number => {
    if (realizedGain <= 0) return 0;
    const limit = CAPITAL_GAINS_HIGH_THRESHOLD * activeUsersCount;
    const remainingStandardRoom = Math.max(0, limit - otherGainsThisYear);
    const gainsAtStandardRate = Math.min(realizedGain, remainingStandardRoom);
    const gainsAtHighRate = Math.max(0, realizedGain - gainsAtStandardRate);
    const taxStandard = gainsAtStandardRate * CAPITAL_GAINS_INCLUSION_STANDARD * marginalRate;
    const taxHigh = gainsAtHighRate * CAPITAL_GAINS_INCLUSION_HIGH * marginalRate;
    return taxStandard + taxHigh;
};

export const calculateDividendTax = (dividendAmount: number, marginalRate: number): number => {
    if (dividendAmount <= 0) return 0;
    const grossedUpAmount = dividendAmount * 1.38;
    const grossTax = grossedUpAmount * marginalRate;
    const cidTotalRate = 0.267;
    const cidAmount = grossedUpAmount * cidTotalRate;
    return Math.max(0, grossTax - cidAmount);
};
