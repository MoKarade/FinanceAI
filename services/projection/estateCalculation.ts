// services/projection/estateCalculation.ts
// Cycle 26 split: calcul de la valeur nette successorale post-simulation.
// V40 (bilan successoral) + V48 (Smith bug) + V60 (NPV pensions publiques).
// Pattern: Pure Function + injection calculateFiscalReport.

import { CAPITAL_GAINS_HIGH_THRESHOLD, type FiscalReport } from '../../utils/tax';

type FiscalFn = (
    grossIncome: number,
    rrspContrib: number,
    fhsaContrib: number,
    year: number,
    skipBreakdown: boolean,
) => FiscalReport;

export interface EstateCalcInputs {
    // Portefeuille (fin de simulation)
    liquid: number;
    celi: number;
    celiapp: number;
    reer: number;
    nonReg: number;
    nonRegACB: number;
    crypto: number;
    reee: number;
    realEstateEquity: number;
    mortgageBalance: number;
    smithManoeuvreDebt: number;
    // Revenus dernière période (pour taux marginal succession)
    incomeRetirement: number;
    accRentesYear: number;
    accRetraitsReerYear: number;
    grossMarcBaseAnnual: number;
    grossAnnaBaseAnnual: number;
    simSalaryGrowth: number;
    // Paramètres simulation
    simulationYears: number;
    startYear: number;
    currentAge: number;
    retirementTargetAge: number;
    governmentPension: number;
    activeUsersCount: number;
    simInflation: number;
    enableMonteCarlo: boolean;
    // Soldes initiaux (pour startNW)
    startingCash: number;
    startingCELI: number;
    startingCELIAPP: number;
    startingREER: number;
    startingNonReg: number;
    startingCrypto: number;
    startingREEE: number;
}

export interface EstateResult {
    finalRawNetWorth: number;
    estateNetWorth: number;
    totalEstateTax: number;
    startNW: number;
}

export function computeEstateNetWorth(
    inputs: Readonly<EstateCalcInputs>,
    calculateFiscalReport: FiscalFn,
): EstateResult {
    const {
        liquid, celi, celiapp, reer, nonReg, nonRegACB, crypto, reee,
        realEstateEquity, mortgageBalance, smithManoeuvreDebt,
        incomeRetirement, accRentesYear, accRetraitsReerYear,
        grossMarcBaseAnnual, grossAnnaBaseAnnual, simSalaryGrowth,
        simulationYears, startYear, currentAge, retirementTargetAge,
        governmentPension, activeUsersCount, simInflation, enableMonteCarlo,
        startingCash, startingCELI, startingCELIAPP, startingREER,
        startingNonReg, startingCrypto, startingREEE,
    } = inputs;

    // V48: Smith Manoeuvre Bug — la dette HELOC est soustraite car l'actif réinvesti existe dans le Non-Enreg.
    const finalRawNetWorth = liquid + celi + celiapp + reer + nonReg + crypto + reee + realEstateEquity - mortgageBalance - smithManoeuvreDebt;

    const finalYear = startYear + simulationYears;
    const finalAge = currentAge + simulationYears;
    const finalIsRetired = finalAge >= retirementTargetAge;

    const estateCurrentIncome = finalIsRetired
        ? (incomeRetirement * 12 + accRentesYear + accRetraitsReerYear)
        : (grossMarcBaseAnnual + grossAnnaBaseAnnual) * Math.pow(1 + simSalaryGrowth / 100, simulationYears);

    const estateLatentGain = Math.max(0, nonReg - nonRegACB);
    const thresholdEstate = CAPITAL_GAINS_HIGH_THRESHOLD * activeUsersCount;

    const taxableEstateGain = estateLatentGain <= thresholdEstate
        ? estateLatentGain * 0.50
        : (thresholdEstate * 0.50) + ((estateLatentGain - thresholdEstate) * 0.6667);

    const taxableCryptoGain = crypto * 0.50;
    const totalEstateLiquidation = reer + taxableEstateGain + taxableCryptoGain;

    // Phase 2: Double décès (fin de simulation). Impôt supporté par le survivant seul.
    const estateReportBase = calculateFiscalReport(estateCurrentIncome / activeUsersCount, 0, 0, finalYear, enableMonteCarlo);
    const estateReportFinal = calculateFiscalReport((estateCurrentIncome + totalEstateLiquidation), 0, 0, finalYear, enableMonteCarlo);
    const totalEstateTax = estateReportFinal.totalTax - estateReportBase.totalTax;

    // V60: NPV des rentes publiques futures (valeur invisible en fin de simulation avant 65 ans).
    const lifeExpectancy = 95;
    const remainingYearsAtEnd = Math.max(0, lifeExpectancy - finalAge);
    const rrqExpected = (governmentPension * 0.65 * (activeUsersCount || 1)) * Math.pow(1 + simInflation / 100, simulationYears);
    const psvExpected = (governmentPension * 0.35 * (activeUsersCount || 1)) * Math.pow(1 + simInflation / 100, simulationYears);

    const r_npv = 0.02;
    const npvFactor = r_npv > 0 ? (1 - Math.pow(1 + r_npv, -remainingYearsAtEnd)) / r_npv : remainingYearsAtEnd;
    const rrqNPV = finalAge >= 65 ? (rrqExpected * npvFactor) : (rrqExpected * npvFactor * Math.pow(1.02, -(65 - finalAge)));
    const psvNPV = finalAge >= 65 ? (psvExpected * npvFactor) : (psvExpected * npvFactor * Math.pow(1.02, -(65 - finalAge)));

    const estateNetWorth = finalRawNetWorth - totalEstateTax + ((rrqNPV + psvNPV) * 0.7);

    const startNW = startingCash + startingCELI + startingCELIAPP + startingREER + startingNonReg + startingCrypto + startingREEE;

    return {
        finalRawNetWorth: Number.isNaN(finalRawNetWorth) ? 0 : finalRawNetWorth,
        estateNetWorth: Number.isNaN(estateNetWorth) ? 0 : estateNetWorth,
        totalEstateTax: Number.isNaN(totalEstateTax) ? 0 : totalEstateTax,
        startNW,
    };
}
