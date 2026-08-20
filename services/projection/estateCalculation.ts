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
    /** [ENG-W5-BUSINESS-OFFBALANCE] Valeur des entreprises privées (au prorata détenu). Absente de
     *  la succession jusqu'au 2026-08-19 — le legs sous-évaluait le patrimoine de la valeur ENTIÈRE
     *  de l'entreprise. Optionnel (défaut 0) : rétrocompat bit-identique sans entreprise saisie. */
    privateBusinessValue?: number;
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
    /** [ESTATE-NPV-07] Rentes publiques RÉELLEMENT versées au dernier point de la simulation
     *  (mensuel FAMILIAL, dollars NOMINAUX de l'année finale) — `retirementBreakdown.rrq` / `.psv`,
     *  remontés hors boucle par `services/projection.ts` comme `incomeRetirement` l'est déjà.
     *  ⚠️ NE PAS reconstruire cette grandeur depuis `rrqEstimateMonthly`/`governmentPension` : celle-ci
     *  porte le prorata de gains/résidence (`rrqProrata`, mesuré 0,784) et l'indexation à l'année
     *  finale, que la base d'estimé ne porte PAS. Absents → repli sur l'estimé indexé (rétrocompat).
     *  `pensionGisMonthlyFinal` est le SRG, INCLUS dans `.psv` mais NON IMPOSABLE : on le retranche
     *  de l'assiette (même traitement que `taxDecember.ts`). */
    pensionRrqMonthlyFinal?: number;
    pensionPsvMonthlyFinal?: number;
    pensionGisMonthlyFinal?: number;
    /** [ESTATE-NPV-07] Écrêtement PSV du dernier point (`retirementBreakdown.oasReduction`, mensuel
     *  familial). `.rrq`/`.psv` sont BRUTS de cet écrêtement alors que `.total` (donc le revenu de
     *  contexte) en est NET : sans ce terme, la tranche retirée dépasserait le revenu qui la contient
     *  pour un retraité en récupération PSV. Un montant, deux registres, une seule convention. */
    pensionOasReductionMonthlyFinal?: number;
    activeUsersCount: number;
    /**
     * [ENG-DIVORCE-ESTATE-PENSION] Part du ménage qui reste au déclarant, pour les rentes exprimées
     * en AGRÉGAT FAMILIAL non ventilé — ici le repli sur `governmentPension`. Défaut `1`.
     *
     * ⚠️ Deux réductions DISTINCTES, à ne surtout pas cumuler sur le même terme :
     *   · branche « estimés précis » : la valeur est PER-PERSONNE, elle se réduit en multipliant
     *     par MOINS DE TÊTES (`activeUsersCount` que l'appelant passe à 1 en ménage solo) ;
     *   · branche « repli agrégé »   : `governmentPension` est DÉJÀ familial, aucun `× N` ne s'y
     *     applique — il lui faut donc ce facteur EXPLICITE, exactement comme
     *     `householdPensionShare` dans `retirementIncome.ts` pour la pension DB.
     * Appliquer le compteur de têtes au repli (ou la part aux estimés) réduirait deux fois.
     */
    householdPensionShare?: number;
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
        privateBusinessValue: fin(inputs.privateBusinessValue ?? 0),
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
    // [ENG-DIVORCE-ESTATE-PENSION] Sans ce facteur, un divorcé héritait à l'écran Succession de la
    // valeur actualisée des rentes de son EX : `computeEstateNetWorth` est la fonction MIROIR de
    // `computeRetirementIncome` — corrigée, elle, dans le lot divorce — et son propre commentaire
    // renvoie à « retirementIncome.ts:207-212 ». Le même défaut est resté dans la fonction sœur :
    // c'est le motif d'échec récurrent de ce lot.
    const householdPensionShare = Number.isFinite(inputs.householdPensionShare) && (inputs.householdPensionShare as number) > 0
        ? (inputs.householdPensionShare as number)
        : 1;
    const rrqMonthlyFamily = (rrqEstimateMonthly !== undefined) ? (Math.max(0, fin(rrqEstimateMonthly)) * activeUsersCount) : (governmentPension * GOV_PENSION_RRQ_SHARE * householdPensionShare);
    const psvMonthlyFamily = (psvEstimateMonthly !== undefined) ? (Math.max(0, fin(psvEstimateMonthly)) * activeUsersCount) : (governmentPension * GOV_PENSION_PSV_SHARE * householdPensionShare);
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

    // [ESTATE-NPV-07] La VAN des rentes est ajoutée NETTE d'impôt — les rentes publiques sont un
    // revenu IMPOSABLE, et `totalEstateTax` ci-dessus ne couvre que la LIQUIDATION (REER + gains),
    // pas ce flux-là.
    //
    // ⚠️ C'était un facteur PLAT `× 0,7`, sans nom ni commentaire, seul littéral nu d'un bloc où
    // tout le reste est justifié. MESURÉ sur le barème 2026, le facteur net RÉEL d'une rente
    // publique n'est plat pour personne :
    //     ménage vivant surtout de ses rentes (24 k$/an) ....... 0,94
    //     avec 30 k$ d'autre revenu de retraite ................ 0,743
    //     avec 60 k$ ........................................... 0,639
    //     avec 100 k$ .......................................... 0,594
    // `0,7` n'était donc juste que dans une bande étroite, et il SOUS-ESTIMAIT lourdement le
    // patrimoine successoral des ménages modestes — ceux pour qui les rentes publiques pèsent le
    // plus. Même forme d'erreur que `[MIGRATE-GROSS-135]` : un facteur plat sur une relation qui
    // ne l'est pas.
    //
    // Le patron correct vit 40 lignes plus haut (`estateReportFinal − estateReportBase`) : on
    // mesure l'impôt INCRÉMENTAL que les rentes portent DANS LE CONTEXTE de revenu du ménage.
    // ⚠️ On l'applique au FLUX ANNUEL, pas à la VAN : taxer une VAN de plusieurs centaines de k$
    // comme un revenu d'une seule année la ferait passer au taux marginal maximal, ce qui serait
    // bien plus faux que le 0,7 qu'on remplace.
    //
    // ⚠️ POURQUOI ON SOUSTRAIT (et pas on ajoute) — vérifié, j'ai failli le câbler à l'envers.
    // `estateCurrentIncome` CONTIENT déjà les rentes publiques, via `incomeRetirement * 12` :
    // `incomeRetirement = retirementBreakdown.total = rrq + psv + privee − oasReduction`
    // (`retirementIncome.ts`). On les en retire donc pour isoler l'impôt qu'elles portent EN
    // CONTEXTE. ⚠️ Ne pas se fier au nom `accRentesYear` du terme voisin : malgré « rentes », il
    // cumule les LOYERS (`realEstateMonth.ts` : `accRentesYear += rentalIncome`), pas des rentes
    // publiques. Un nom trompeur, et le calcul partait à l'envers.
    //
    // ⚠️ LA TRANCHE À RETIRER EST LA RENTE **RÉELLEMENT VERSÉE**, PAS L'ESTIMÉ DE SAISIE.
    // Première version de ce lot : `rrqMonthlyFamily * 12`. MESURÉ faux de −29 % (28 800 $ retirés
    // pour 40 616 $ réellement portés par `incomeRetirement`), pour trois causes cumulées :
    //   1. `rrqMonthlyFamily` est en dollars D'AUJOURD'HUI — 40 lignes plus haut, `rrqExpected` le
    //      multiplie par `(1+inflation)^années` précisément pour ça. La soustraction l'oubliait.
    //   2. il ne porte NI `rrqProrata` (gains/MGA × résidence ; mesuré 0,784) NI `rrqFactor` ;
    //   3. le SRG est DANS `estateCurrentIncome` (via `psv`) mais était absent de la tranche retirée.
    // Le dénominateur seul étant faux, le facteur sortait systématiquement TROP BAS — l'erreur était
    // MAXIMALE sur les ménages modestes que ce lot prétend servir (0,898 rendu au lieu de 0,948 pour
    // un ménage vivant à 100 % de ses rentes). D'où le plombage de `pension*MonthlyFinal`.
    // Le SRG est retranché : il est du REVENU (donc dans `psv`) mais NON IMPOSABLE (`taxDecember.ts`),
    // et la VAN ci-dessus ne le valorise pas.
    // ⚠️ LA TRANCHE ET LE CONTEXTE SUIVENT LA MÊME CONVENTION, SINON L'UN IMPOSE CE QUE L'AUTRE EXONÈRE.
    // `incomeRetirement` = `retirementBreakdown.total` = `rrq + psv + privee − oasReduction`, et `psv`
    // CONTIENT le SRG. Trois retraits obligatoires, et il faut les faire des DEUX côtés :
    //   · le SRG est du REVENU mais N'EST PAS IMPOSABLE (`taxDecember.ts` le soustrait de ses cinq
    //     assiettes) — et la VAN ci-dessus ne le valorise pas ;
    //   · l'écrêtement PSV est déjà déduit de `total` mais PAS de `psv`.
    // ⚠️ Mon 1er correctif ne retirait le SRG que de la TRANCHE. Le résidu `revenuSansRentes` était
    // alors composé de SRG PUR, sur lequel la tranche s'empilait comme s'il était imposable :
    // MESURÉ, ce seul défaut RENVERSAIT la recommandation de décaissement (MELTDOWN → AUTO) sur
    // 4 points de mesure /52, et valait jusqu'à 62 830 $ sur le patrimoine successoral. Corriger un
    // seul côté d'une convention partagée est pire que ne rien corriger.
    const gisAnnuel = fin(inputs.pensionGisMonthlyFinal ?? 0) * MONTHS_PER_YEAR;
    const ecretementPsvAnnuel = fin(inputs.pensionOasReductionMonthlyFinal ?? 0) * MONTHS_PER_YEAR;
    const rentesReellesAnnuelles = Math.max(0,
        (fin(inputs.pensionRrqMonthlyFinal ?? 0) + fin(inputs.pensionPsvMonthlyFinal ?? 0)) * MONTHS_PER_YEAR
            - gisAnnuel - ecretementPsvAnnuel);

    // ⚠️ BRANCHE NON RETRAITÉE — un salaire n'est PAS le contexte fiscal d'une rente.
    // Quand l'horizon s'arrête avant l'âge de retraite, `estateCurrentIncome` est un SALAIRE et
    // aucune rente n'est encore versée (`rentesReellesAnnuelles = 0`). Mesurer un taux marginal au
    // SOMMET de ce salaire pour taxer des rentes encaissées 10 ans plus tard, une fois le salaire
    // disparu, est un contresens : mesuré, il rendait 0,52 — soit PIRE que le 0,7 plat qu'on
    // remplace (−158 543 $ sur le patrimoine successoral affiché, pour la population même que le
    // bloc VAN a été écrit pour servir : « valeur invisible en fin de simulation AVANT 65 ans »).
    // Le seul contexte défendable est alors la rente ELLE-MÊME, valorisée à l'année finale
    // (`rrqExpected + psvExpected`, la grandeur exactement actualisée ci-dessus) et imposée depuis
    // zéro : c'est ce que touchera un ménage dont le salaire a cessé. Continu et sans falaise.
    // ⚠️ LA SEULE QUESTION EST « LES RENTES SONT-ELLES DÉJÀ DANS LE REVENU ? », PAS « EST-ON RETRAITÉ ? ».
    // Mon 1er correctif branchait sur `rentesReellesAnnuelles > 0` en le traitant comme un
    // « le ménage est retraité », et basculait alors sur un contexte qui IGNORE le revenu réel.
    // Faux entre l'âge de retraite et le début des rentes publiques : un retraité à 55 ans avec
    // 60 000 $/an de rente DB était imposé « depuis zéro » sur sa rente publique ESTIMÉE.
    // MESURÉ : facteur 0,9068 au lieu de 0,6388, soit 235 205 $ de patrimoine successoral fantôme,
    // et `estateNetWorth` qui DÉCROISSAIT de 169 437 $ quand l'horizon augmentait d'UN an — alors
    // que `origin/main` est strictement croissant sur la même plage.
    //
    // La formulation ci-dessous n'a plus de branche « retraité » du tout. Le revenu STRUCTUREL du
    // ménage est toujours le même terme ; la seule chose qui change est de savoir si la tranche y
    // est DÉJÀ comprise (rentes versées) ou si elle viendra PAR-DESSUS (pas encore versées, que le
    // ménage soit pré-retraité ou retraité-avant-65). Continu par construction : au mois où la rente
    // commence, `revenuStructurel` monte exactement du montant qu'on cessait d'ajouter.
    //
    // ⚠️ CONTEXTE **STRUCTUREL**, PAS `estateCurrentIncome` — un retrait REER d'UNE année ne peut pas
    // piloter 25 ans de VAN. `estateCurrentIncome` inclut `accRetraitsReerYear`, c.-à-d. le décaissement
    // de la SEULE dernière année, qui dépend de la stratégie ET de l'endroit où l'utilisateur coupe
    // l'horizon. MESURÉ sur un couple 45 ans / REER 300 k$ / retraite à 60, en ne bougeant QUE `years` :
    //     contexte = estateCurrentIncome  → gagnant : MELTDOWN(25) MELTDOWN(28) MELTDOWN(30) AUTO(33) AUTO(35)
    //     contexte = structurel (ce code) → gagnant : MELTDOWN(25) AUTO(28)     AUTO(30)     AUTO(33) AUTO(35)
    //     `origin/main` (facteur 0,7 plat) → gagnant : MELTDOWN(25) AUTO(28)     AUTO(30)     AUTO(33) AUTO(35)
    // `estateNetWorth` n'est pas qu'un chiffre d'écran : `drawdownOptimizer.ts` trie DESSUS et publie
    // « Meilleur avenir : X », `strategyRanking.ts` en fait le score de l'objectif `wealth`, et deux
    // outils MCP l'exposent au LLM. Le contexte total faisait donc BASCULER le conseil de décaissement
    // au gré du curseur d'horizon ; le contexte structurel reproduit l'ordre de `main` à tous les
    // horizons mesurés, en ne corrigeant que le NIVEAU.
    // ⚠️ HYPOTHÈSE DE MODÈLE ASSUMÉE, avec son sens d'erreur et sa BORNE MESURÉE — pas « légère » :
    // pour un retraité qui décaisse son REER/FERR chaque année, ce contexte sous-estime le revenu
    // récurrent, donc SURESTIME le facteur. Mesuré : +3,5 pts / +32 135 $ sur la fixture divorce,
    // mais **+16,5 pts / +66 232 $** sur un REER de 700 k$ et **+36,1 pts / +144 963 $** sur un REER
    // de 2 M$ — le biais croît avec la taille du REER, donc frappe le plus la population que
    // `drawdownOptimizer` conseille. Le vrai correctif est un revenu de retraite MOYEN sur les années
    // restantes, pas un point : ticket `[ESTATE-NPV-CONTEXTE-PLURIANNUEL]`.
    const revenuStructurel = Math.max(0, incomeRetirement * 12 - gisAnnuel + accRentesYear);
    const rentesDejaVersees = rentesReellesAnnuelles > 0;
    const rentesAnnuellesFinales = rentesDejaVersees ? rentesReellesAnnuelles : (rrqExpected + psvExpected);
    const revenuDeContexte = rentesDejaVersees ? revenuStructurel : (revenuStructurel + rentesAnnuellesFinales);

    // Quand la tranche dépasse le revenu de contexte (fixtures où `incomeRetirement` est nul alors
    // qu'un `governmentPension` est saisi), le `Math.max(0, …)` ramène le revenu résiduel à zéro :
    // l'impôt attribué aux rentes devient l'impôt TOTAL du ménage, soit le taux MOYEN et non un
    // taux marginal de sommet. ⚠️ Ce n'est PAS « le facteur retombe à 1 » (ce que disait ce
    // commentaire, à tort) : il vaut alors `1 − impôt(revenu)/rentes`, qui ne vaut 1 que si le
    // revenu est sous le montant personnel de base. Dégradation gracieuse et continue en `Y = R`.
    const revenuSansRentes = Math.max(0, revenuDeContexte - rentesAnnuellesFinales);
    const impotSurRentes = rentesAnnuellesFinales > 0
        ? Math.max(0, calculateFiscalReport(revenuDeContexte, 0, 0, finalYear, enableMonteCarlo).totalTax
            - calculateFiscalReport(revenuSansRentes, 0, 0, finalYear, enableMonteCarlo).totalTax)
        : 0;
    // Facteur net borné à [0, 1]. ⚠️ Seule la borne BASSE est atteignable en pratique (`impotSurRentes`
    // est déjà clampé à ≥ 0 et le dénominateur est > 0, donc le ratio ≤ 1 dès que l'impôt ne dépasse
    // pas la rente) : le `Math.min` est une ceinture contre une entrée aberrante, pas une branche
    // que les tests peuvent exercer — d'où l'intitulé du test, qui ne promet que la borne basse.
    const facteurNetRentes = rentesAnnuellesFinales > 0
        ? Math.min(1, Math.max(0, 1 - impotSurRentes / rentesAnnuellesFinales))
        : 1;
    const estateNetWorth = finalRawNetWorth - totalEstateTax + ((rrqNPV + psvNPV) * facteurNetRentes);

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
