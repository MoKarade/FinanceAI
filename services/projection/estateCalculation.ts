// services/projection/estateCalculation.ts
// Cycle 26 split: calcul de la valeur nette successorale post-simulation.
// V40 (bilan successoral) + V48 (Smith bug) + V60 (NPV pensions publiques).
// Pattern: Pure Function + injection calculateFiscalReport.

import { CAPITAL_GAINS_INCLUSION_STANDARD, type FiscalReport } from '../../utils/tax';

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
    cryptoACB: number;
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
    // TB3 fix (2026-05-27) — validation aux frontières (cf. CLAUDE.md « never trust
    // external data »). Un champ de config numérique vide/NaN ne doit JAMAIS produire
    // un NaN qui se propage à finalRawNetWorth → estate → 7 cards à 0.00M$. `?? 0` ne
    // suffit pas (NaN n'est ni null ni undefined), d'où `Number.isFinite`. Un champ
    // fautif contribue 0 (au lieu de zéroter tout le patrimoine successoral).
    const fin = (v: number): number => (Number.isFinite(v) ? v : 0);
    const liquid = fin(inputs.liquid);
    const celi = fin(inputs.celi);
    const celiapp = fin(inputs.celiapp);
    const reer = fin(inputs.reer);
    const nonReg = fin(inputs.nonReg);
    const nonRegACB = fin(inputs.nonRegACB);
    const crypto = fin(inputs.crypto);
    const cryptoACB = fin(inputs.cryptoACB);
    const reee = fin(inputs.reee);
    const realEstateEquity = fin(inputs.realEstateEquity);
    // mortgageBalance n'est plus soustrait ici (realEstateEquity est déjà net) ;
    // le champ reste dans l'interface car les appelants le fournissent encore.
    const smithManoeuvreDebt = fin(inputs.smithManoeuvreDebt);
    const incomeRetirement = fin(inputs.incomeRetirement);
    const accRentesYear = fin(inputs.accRentesYear);
    const accRetraitsReerYear = fin(inputs.accRetraitsReerYear);
    const grossMarcBaseAnnual = fin(inputs.grossMarcBaseAnnual);
    const grossAnnaBaseAnnual = fin(inputs.grossAnnaBaseAnnual);
    const simSalaryGrowth = fin(inputs.simSalaryGrowth);
    const simulationYears = fin(inputs.simulationYears);
    const startYear = fin(inputs.startYear);
    const currentAge = fin(inputs.currentAge);
    const retirementTargetAge = fin(inputs.retirementTargetAge);
    const governmentPension = fin(inputs.governmentPension);
    const simInflation = fin(inputs.simInflation);
    const startingCash = fin(inputs.startingCash);
    const startingCELI = fin(inputs.startingCELI);
    const startingCELIAPP = fin(inputs.startingCELIAPP);
    const startingREER = fin(inputs.startingREER);
    const startingNonReg = fin(inputs.startingNonReg);
    const startingCrypto = fin(inputs.startingCrypto);
    const startingREEE = fin(inputs.startingREEE);
    // FA-5 : `activeUsersCount` n'est plus consommé ici (le ×N du NPV des rentes était un
    // double-comptage) — le champ reste dans EstateCalcInputs (fourni par les appelants).
    const { enableMonteCarlo } = inputs;

    // realEstateEquity est DÉJÀ net d'hypothèque (currentValue − mortgage, cf
    // realEstateMonth.ts:326) → ne PAS re-soustraire mortgageBalance (double-
    // comptage corrigé 2026-05, trouvé via l'audit personas). On garde la
    // soustraction de smithManoeuvreDebt (dette HELOC réelle, dont l'actif
    // réinvesti existe dans le Non-Enreg).
    const finalRawNetWorth = liquid + celi + celiapp + reer + nonReg + crypto + reee + realEstateEquity - smithManoeuvreDebt;

    const finalYear = startYear + simulationYears;
    const finalAge = currentAge + simulationYears;
    const finalIsRetired = finalAge >= retirementTargetAge;

    const estateCurrentIncome = finalIsRetired
        ? (incomeRetirement * 12 + accRentesYear + accRetraitsReerYear)
        : (grossMarcBaseAnnual + grossAnnaBaseAnnual) * Math.pow(1 + simSalaryGrowth / 100, simulationYears);

    const estateLatentGain = Math.max(0, nonReg - nonRegACB);
    const taxableEstateGain = estateLatentGain * CAPITAL_GAINS_INCLUSION_STANDARD;

    // M-4 : seul le GAIN crypto (valeur − coût de base) est imposable, pas la valeur entière.
    const taxableCryptoGain = Math.max(0, crypto - cryptoACB) * CAPITAL_GAINS_INCLUSION_STANDARD;
    const totalEstateLiquidation = reer + taxableEstateGain + taxableCryptoGain;

    // Phase 2: Double décès (fin de simulation). Impôt supporté par le survivant SEUL → toute la
    // liquidation est imposée sur UNE seule déclaration finale.
    // M-2 (2026-06) : la base était divisée par `activeUsersCount` (per-capita) alors que le final
    // empilait la liquidation sur le revenu COMPLET d'un seul déclarant → l'incrément
    // `final − base` n'était pas cohérent (il incluait un terme parasite ≈ impôt(revenu·(1−1/N)))
    // → impôt successoral surévalué pour un couple. Symétrisé : les deux à l'échelle d'un seul
    // déclarant (pas de `/N`) → `totalEstateTax` = vrai impôt incrémental sur la liquidation.
    // (≠ latentTax.ts qui est per-capita, car là les deux conjoints sont VIVANTS.)
    const estateReportBase = calculateFiscalReport(estateCurrentIncome, 0, 0, finalYear, enableMonteCarlo);
    const estateReportFinal = calculateFiscalReport((estateCurrentIncome + totalEstateLiquidation), 0, 0, finalYear, enableMonteCarlo);
    const totalEstateTax = estateReportFinal.totalTax - estateReportBase.totalTax;

    // V60: NPV des rentes publiques futures (valeur invisible en fin de simulation avant 65 ans).
    // FA-5 (audit fiscal 2026-06-09) : `governmentPension` est déjà FAMILIAL dans tout le moteur
    // (retirementIncome ne multiplie pas par N) — l'ancien ×activeUsersCount le comptait DEUX fois
    // pour un couple → NPV des rentes ~doublée → estateNetWorth gonflé de dizaines de k$.
    const lifeExpectancy = 95;
    const remainingYearsAtEnd = Math.max(0, lifeExpectancy - finalAge);
    const rrqExpected = (governmentPension * 0.65) * Math.pow(1 + simInflation / 100, simulationYears);
    const psvExpected = (governmentPension * 0.35) * Math.pow(1 + simInflation / 100, simulationYears);

    const r_npv = 0.02;
    const npvFactor = r_npv > 0 ? (1 - Math.pow(1 + r_npv, -remainingYearsAtEnd)) / r_npv : remainingYearsAtEnd;
    const rrqNPV = finalAge >= 65 ? (rrqExpected * npvFactor) : (rrqExpected * npvFactor * Math.pow(1.02, -(65 - finalAge)));
    const psvNPV = finalAge >= 65 ? (psvExpected * npvFactor) : (psvExpected * npvFactor * Math.pow(1.02, -(65 - finalAge)));

    const estateNetWorth = finalRawNetWorth - totalEstateTax + ((rrqNPV + psvNPV) * 0.7);

    const startNW = startingCash + startingCELI + startingCELIAPP + startingREER + startingNonReg + startingCrypto + startingREEE;

    // Garde de sortie (belt-and-suspenders) : avec les entrées sanitisées ci-dessus,
    // ces valeurs sont déjà finies tant que calculateFiscalReport l'est. On conserve
    // `fin()` au cas où le rapport fiscal renverrait un non-fini (sécurité, jamais 0
    // « magique » caché : tous les inputs sont déjà validés).
    return {
        finalRawNetWorth: fin(finalRawNetWorth),
        estateNetWorth: fin(estateNetWorth),
        totalEstateTax: fin(totalEstateTax),
        startNW,
    };
}
