// services/projection/estateCalculation.ts
// Cycle 26 split: calcul de la valeur nette successorale post-simulation.
// V40 (bilan successoral) + V48 (Smith bug) + V60 (NPV pensions publiques).
// Pattern: Pure Function + injection calculateFiscalReport.

import { CAPITAL_GAINS_INCLUSION_STANDARD, GOV_PENSION_RRQ_SHARE, GOV_PENSION_PSV_SHARE, type FiscalReport } from '../../utils/tax';
import { computeRawNetWorth } from './netWorth';

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
    /** RE-GAIN-SUCC — gain latent BRUT des immeubles LOCATIFS (Σ max(0, valeur − coût)), imposable à
     *  50 % à la disposition réputée au décès. RP exclue par l'appelant. Absent → 0 (non-régression). */
    realEstateLatentGain?: number;
    smithManoeuvreDebt: number;
    /** [PV-6] Passif d'insolvabilité (découverts non couverts portés en dette). Absent → 0. */
    liquidDebt?: number;
    /** [fix 2026-06-16] Prêts/cartes préexistants résiduels en fin de sim — soustraits comme dans
     *  le NW mensuel (computeRawNetWorth), sinon « Patrimoine projeté » surévalué du solde. Absent → 0. */
    activeDebtsTotal?: number;
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
    /** FA-8 — estimés PRÉCIS par rente (per-personne, mensuels ; relevés Retraite Québec / Service
     *  Canada). Quand fournis, PRIMENT sur le split 65/35 du champ agrégé `governmentPension` (×N pour
     *  le familial), exactement comme `retirementIncome.ts` → aligne le NPV estate sur le revenu de
     *  retraite (plus de divergence silencieuse). Absents → repli sur le split 65/35. */
    rrqEstimateMonthly?: number;
    psvEstimateMonthly?: number;
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
    // FA-5/FA-8 — `governmentPension` est déjà FAMILIAL : son split 65/35 ne prend PAS de ×N (le ×N
    // d'antan sur l'agrégé = double-comptage, corrigé FA-5). En revanche les estimés PRÉCIS
    // rrqEstimateMonthly/psvEstimateMonthly sont PER-PERSONNE → ×activeUsersCount pour obtenir le
    // familial (FA-8, à l'identique de retirementIncome.ts:207-212). Donc activeUsersCount est consommé
    // UNIQUEMENT pour scaler les estimés, JAMAIS l'agrégé — ne pas ré-introduire le ×N sur ce dernier.
    const activeUsersCount = fin(inputs.activeUsersCount);
    const rrqEstimateMonthly = inputs.rrqEstimateMonthly; // brut : `undefined` préservé pour la conditionnelle « estimé fourni ? »
    const psvEstimateMonthly = inputs.psvEstimateMonthly;
    const { enableMonteCarlo } = inputs;

    // Patrimoine successoral via la SOURCE UNIQUE (computeRawNetWorth) — MÊME formule que le NW
    // mensuel : realEstateEquity déjà net d'hypothèque (pas de re-soustraction de mortgageBalance) ;
    // soustrait smithManoeuvreDebt (HELOC, actif réinvesti dans Non-Enreg), liquidDebt (insolvabilité)
    // ET activeDebtsTotal (prêts résiduels — manquant avant le fix 2026-06-16 → estate surévalué).
    const finalRawNetWorth = computeRawNetWorth({
        liquid, celi, celiapp, reer, nonReg, crypto, reee, realEstateEquity,
        liquidDebt: fin(inputs.liquidDebt ?? 0),
        smithManoeuvreDebt,
        activeDebtsTotal: fin(inputs.activeDebtsTotal ?? 0),
    });

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
    // RE-GAIN-SUCC — disposition réputée au décès (LIR 70(5)) : le gain latent d'un IMMEUBLE LOCATIF
    // (Σ max(0, valeur − coût), fourni par l'appelant) est imposable à 50 %. La résidence principale
    // est EXEMPTE (exclue en amont). Absent → 0 (non-régression).
    const taxableRealEstateGain = fin(inputs.realEstateLatentGain ?? 0) * CAPITAL_GAINS_INCLUSION_STANDARD;
    const totalEstateLiquidation = reer + taxableEstateGain + taxableCryptoGain + taxableRealEstateGain;

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
    // FA-8 (résolu) — les estimés PRÉCIS par rente priment, exactement comme retirementIncome.ts:207-212
    // (estimé per-personne × activeUsersCount = familial mensuel ; repli sur le split 65/35 de l'agrégé
    // `governmentPension` sinon — convention de MODÈLE GOV_PENSION_*_SHARE, FISCAL_REFERENCE §6). Avant :
    // split INCONDITIONNEL → le NPV estate divergeait du revenu de retraite quand l'utilisateur saisissait
    // des estimés RRQ/PSV ≠ 65/35. Unités préservées (`governmentPension` et les estimés sont mensuels).
    // RRQ-PSV-MIN — clamp `Math.max(0, …)` symétrique à retirementIncome:207-212 (un estimé négatif
    // ne crée pas de rente négative qui gonflerait/dégonflerait le NPV en silence).
    // [ENG-ESTATE-ESTIMATE-FIN] `fin()` AVANT le clamp : un estimé NaN (lu BRUT pour préserver `undefined`)
    // donnait `Math.max(0, NaN)` = NaN → propagé jusqu'à `estateNetWorth`, que le `fin()` de SORTIE zérotait
    // ENTIÈREMENT (même un finalRawNetWorth positif → 0). Avec `fin()` ici, un estimé NaN ne contribue que 0 à
    // SA rente ; l'autre rente et le reste du patrimoine successoral restent calculés (dégradation gracieuse).
    const rrqMonthlyFamily = (rrqEstimateMonthly !== undefined) ? (Math.max(0, fin(rrqEstimateMonthly)) * activeUsersCount) : (governmentPension * GOV_PENSION_RRQ_SHARE);
    const psvMonthlyFamily = (psvEstimateMonthly !== undefined) ? (Math.max(0, fin(psvEstimateMonthly)) * activeUsersCount) : (governmentPension * GOV_PENSION_PSV_SHARE);
    // [FISC-ESTATE-PENSION-NPV] ANNUALISATION (×12) — le facteur d'annuité `npvFactor` plus bas
    // valorise des versements ANNUELS (r=2 %/an, n exprimé en ANNÉES) ; la pension doit donc être
    // convertie mensuel→annuel AVANT de l'y appliquer. Avant : montant MENSUEL × facteur annuel
    // = NPV ÷12 → rentes publiques (RRQ/PSV) ~12× SOUS-évaluées au bilan successoral. N'affecte
    // PAS le NW mensuel ni les invariants de conservation (estateCalculation ne touche que
    // `estateNetWorth`, écran Succession), mais fausse cet écran de plusieurs centaines de k$.
    const MONTHS_PER_YEAR = 12;
    const rrqExpected = rrqMonthlyFamily * MONTHS_PER_YEAR * Math.pow(1 + simInflation / 100, simulationYears);
    const psvExpected = psvMonthlyFamily * MONTHS_PER_YEAR * Math.pow(1 + simInflation / 100, simulationYears);

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
