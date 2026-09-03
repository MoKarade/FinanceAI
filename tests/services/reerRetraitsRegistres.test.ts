import { describe, it, expect } from 'vitest';
import {
    processRealEstate,
    type RealEstateState,
    type RealEstateCtx,
    type PropertyStateMutable,
} from '../../services/projection/realEstateMonth';
import { processDecemberTaxFiling, type DecemberContext } from '../../services/projection/taxDecember';
import { calculateFiscalReport, getMarginalRate, calculateDividendTax, RAP_LIMIT_PER_USER, withholdingForGrossRRSP , getDividendGrossUpRate } from '../../utils/tax';
import type { RealEstateGoal } from '../../types';

/**
 * [REER-IMMO-HORS-ASSIETTE] · [REER-RETRAIT-IMMO-REGISTRE] · [RAP-DIVORCE-DEUX-TETES]
 * [EMPILEMENT-REER-ACHAT-IMMO] · [REER-ACTIF-NON-RECONCILIE]  — audit de santé 2026-08-19.
 *
 * Ces cinq défauts partagent UNE cause : un retrait REER doit alimenter PLUSIEURS registres
 * (solde · assiette imposable · retenue · affichage · per-conjoint), et deux producteurs n'en
 * alimentaient qu'une partie.
 *
 * ⚠️ POURQUOI CES TESTS ET PAS LA CONSERVATION. `projection.moneyConservation` était VERT (20/20)
 * avec les cinq bugs en place : un impôt jamais prélevé ne crée ni ne détruit d'argent, il reste
 * simplement chez l'utilisateur. Un invariant de FLUX ne peut pas voir une erreur d'ASSIETTE.
 * Les assertions ci-dessous visent donc l'ASSIETTE et les REGISTRES PUBLIÉS, jamais les soldes.
 *
 * PREUVE DE DISCRIMINATION, mesurée en retirant le correctif (`git apply -R`) : **11 des 13 cas
 * échouent** sur le code d'avant. Les 2 qui passent sont signalés comme tels à leur emplacement —
 * ne pas les lire comme des gardes du correctif :
 *   · « aucun retrait ⇒ neutre » : c'est un test de RÉTROCOMPAT, il DOIT passer des deux côtés ;
 *   · « ventilation incohérente ignorée » : vacueux avant le correctif (la ventilation n'était pas
 *     lue du tout en phase active), il ne protège que contre une régression FUTURE.
 */

// ─── Fixtures immobilier ──────────────────────────────────────────────────────

const makeState = (over: Partial<RealEstateState> = {}): RealEstateState => ({
    liquid: 0, celi: 0, celiapp: 0, reer: 0, nonReg: 0, nonRegACB: 0, capitalLossBank: 0,
    monthlyIncome: 0, monthlyExpenses: 0, accRentesYear: 0, accCapitalGainsYear: 0,
    realEstateEquity: 0, mortgageBalance: 0, hasPurchasedPrimary: false,
    hasUsedRap: false, rapBorrowed: 0, rapRepaymentDueTotal: 0, rapRepaymentStartOffset: 0,
    smithManoeuvreDebt: 0, smithInterestDeductibleYear: 0, fhsaClosingYear: null,
    taxCurrentYearReer: 0, impotReerMois: 0,
    withdrawalLiquid: 0, withdrawalCELI: 0, withdrawalNonReg: 0, withdrawalREER: 0, contribLiquid: 0,
    celiWithdrawalsThisYear: 0, retraitCeliMois: 0,
    retraitReerMois: 0, rrspWithholdingMois: 0, accRetraitsReerYearAdd: 0, rapMissedRepaymentAdd: 0,
    immoInterest: 0, immoPrincipal: 0, immoHypo: 0, immoCharges: 0,
    totalRentalIncome: 0,
    lifeEventLogs: [], flowEventLogs: [],
    ...over,
});

const makeCtx = (over: Partial<RealEstateCtx> = {}): RealEstateCtx => ({
    m: 0, loopYear: 2026, isRetired: false, activeUsersCount: 2,
    simInflation: 0, simSalaryGrowth: 0,
    grossMarcBaseAnnual: 80000, grossAnnaBaseAnnual: 80000, incomeRetirement: 0,
    useSmithManoeuvre: false, currentRentExpense: 0,
    ...over,
});

const makeGoal = (over: Partial<RealEstateGoal> = {}): RealEstateGoal => ({
    id: 'p1', name: 'Condo', isActive: true, purchaseDate: '2026-01-01',
    price: 400000, downPayment: 150000, mortgageRate: 5, amortization: 25,
    totalClosingCosts: 0, monthlyPayment: 0, unrecoverableMonthly: 0,
    isPrimaryResidence: true,
    ...over,
});

const makeProp = (over: Partial<PropertyStateMutable> = {}): PropertyStateMutable => ({
    id: 'p1', isBought: false, mortgage: 0, currentValue: 0, calculatedPmt: 0,
    ...over,
});

const offset0 = () => 0;
const noWelcomeTax = () => 0;

/** Achat financé PAR LE REER : aucune liquidité, aucun CELI, aucun non-enregistré. */
const acheteParReer = (ctxOver: Partial<RealEstateCtx> = {}, reer = 600000) => {
    const state = makeState({ liquid: 0, celi: 0, celiapp: 0, nonReg: 0, reer });
    processRealEstate(
        state,
        makeCtx({ skipRapForPurchase: true, ...ctxOver }),
        [makeGoal()],
        [makeProp()],
        offset0,
        noWelcomeTax,
    );
    return state;
};

// ─── Fixtures décembre ────────────────────────────────────────────────────────

const decHelpers = { calculateFiscalReport, getMarginalRate, calculateDividendTax, getDividendGrossUpRate };

const makeDecCtx = (over: Partial<DecemberContext> = {}): DecemberContext => ({
    m: 11,
    loopYear: 2026,
    isRetired: false,
    activeUsersCount: 1,
    inflationFactor: 1,
    enableMonteCarlo: false,
    optimizeSourceDeductions: false,
    simSalaryGrowth: 0,
    yearsElapsed: 0,
    grossMarcBaseAnnual: 150000,
    grossAnnaBaseAnnual: 0,
    incomeRetirementMonthly: 0,
    incomeRetirementGisMonthly: 0,
    nonReg: 0,
    baseNonRegRate: 0,
    accRrspYear: 0,
    accFhsaYear: 0,
    smithInterestDeductibleYear: 0,
    accRentesYear: 0,
    accRetraitsReerYear: 0,
    accCapitalGainsYear: 0,
    ...over,
} as DecemberContext);

const zeroBucket = () => ({ revenu: 0, gains: 0, divers: 0, reer: 0, donCredit: 0 });

/**
 * Impôt sur le REVENU que décembre laisse à régler en avril : le solde (`.revenu`) plus la retenue
 * REER déjà provisionnée (`.reer`), qu'avril débite aussi.
 *
 * ⚠️ `.divers` est VOLONTAIREMENT exclu : il porte la prime RAMQ (et le FSS des retraités), qui
 * n'est pas un impôt sur le revenu et dont l'assiette du mode ACTIF ne contient pas les retraits
 * REER — elle plafonne d'ailleurs à `RAMQ_MAX_PREMIUM_2026` (766 $), atteint dans tous les cas
 * ci-dessous. L'inclure ajouterait un décalage constant de 766 $ sans rapport avec ce qu'on teste.
 * (Cette asymétrie RAMQ actif/retraité est un défaut SÉPARÉ, mesuré et porté au BACKLOG sous
 * `[RAMQ-ACTIF-HORS-RETRAITS]` — hors périmètre de ce lot.)
 */
const impotRevenuDuEnAvril = (b: { revenu: number; gains: number; divers: number; reer: number }): number =>
    b.revenu + b.gains + b.reer;

// ─────────────────────────────────────────────────────────────────────────────

describe('[REER-IMMO-HORS-ASSIETTE] le retrait REER qui finance un achat entre dans l’ASSIETTE', () => {
    it('publie le brut retiré dans accRetraitsReerYearAdd (le registre que décembre impose)', () => {
        const state = acheteParReer();

        // Discriminant : AVANT le correctif, `accRetraitsReerYearAdd` n'existait pas — le retrait
        // n'atteignait JAMAIS l'assiette de décembre, qui posait donc un crédit de retenue sans
        // la dette correspondante. Mesuré : 94 599,60 $ d'impôt éludé.
        expect(state.withdrawalREER).toBeGreaterThan(0);
        expect(state.accRetraitsReerYearAdd).toBeGreaterThan(0);
        // Tout le brut imposable retiré y passe (aucun RAP ici : skipRapForPurchase).
        expect(state.accRetraitsReerYearAdd).toBeCloseTo(state.withdrawalREER, 6);
    });

    it('le RAP est EXCLU de l’assiette (non imposable) mais compté à l’affichage', () => {
        // RAP autorisé cette fois : une partie du financement passe par lui.
        const state = makeState({ liquid: 0, celi: 0, celiapp: 0, nonReg: 0, reer: 600000 });
        processRealEstate(state, makeCtx(), [makeGoal()], [makeProp()], offset0, noWelcomeTax);

        expect(state.rapBorrowed).toBeGreaterThan(0);
        // Non-vacuité : il y a AUSSI du retrait imposable, sinon l'écart testé serait trivial.
        expect(state.accRetraitsReerYearAdd).toBeGreaterThan(0);
        // L'assiette ne contient QUE la part imposable : le RAP en est absent.
        expect(state.accRetraitsReerYearAdd).toBeCloseTo(state.withdrawalREER - state.rapBorrowed, 6);
    });

    it('[EMPILEMENT-REER-ACHAT-IMMO] la retenue suit le BARÈME 19/24/29 %, pas un marginal plat', () => {
        const state = acheteParReer();
        const attendu = withholdingForGrossRRSP(state.accRetraitsReerYearAdd).withholding;

        // Discriminant : AVANT, la retenue valait `drawn * getMarginalRate(revenuAvantRetrait)`,
        // soit 36,12 % plat sur un retrait de 235 639 $ — mesuré 22 110 $ sous le vrai incrémental.
        // Le barème est le seul qui ait une source (FISCAL_REFERENCE), et c'est décembre qui
        // réconcilie ensuite au marginal RÉEL.
        expect(state.taxCurrentYearReer).toBeCloseTo(attendu, 6);
        expect(state.rrspWithholdingMois).toBeCloseTo(attendu, 6);
        expect(state.impotReerMois).toBeCloseTo(attendu, 6);
    });
});

describe('[REER-RETRAIT-IMMO-REGISTRE] le retrait alimente aussi le registre d’AFFICHAGE', () => {
    it('retraitReerMois suit withdrawalREER (RAP inclus) — plus de « 0 $ retiré » avec l’impôt en face', () => {
        const state = makeState({ liquid: 0, celi: 0, celiapp: 0, nonReg: 0, reer: 600000 });
        processRealEstate(state, makeCtx(), [makeGoal()], [makeProp()], offset0, noWelcomeTax);

        // Discriminant : AVANT, `RealEstateState` déclarait `retraitCeliMois` mais PAS
        // `retraitReerMois` — 355 639 $ sortis du REER s'affichaient « RetraitREER = 0 $ » avec
        // « ImpotRetraitREER = 85 107 $ » juste en face dans le même panneau.
        expect(state.withdrawalREER).toBeGreaterThan(0);
        expect(state.retraitReerMois).toBeCloseTo(state.withdrawalREER, 6);
        // Le RAP compte comme une sortie du REER à l'affichage (il n'est « que » non imposable).
        expect(state.retraitReerMois).toBeGreaterThan(state.accRetraitsReerYearAdd);
    });
});

describe('[RAP-DIVORCE-DEUX-TETES] le plafond RAP est un droit PAR PERSONNE', () => {
    it('un seul déclarant ⇒ plafond d’UNE personne, pas celui d’un couple', () => {
        const state = makeState({ liquid: 0, celi: 0, celiapp: 0, nonReg: 0, reer: 600000 });
        processRealEstate(
            state,
            makeCtx({ activeUsersCount: 2, taxFilers: 1 }),
            [makeGoal()], [makeProp()], offset0, noWelcomeTax,
        );

        // Discriminant : AVANT, le plafond était `RAP_LIMIT_PER_USER * activeUsersCount` — nominal,
        // donc toujours 2. Un divorcé recevait le plafond d'un COUPLE : mesuré 98 080,68 $ contre
        // 60 000 $ légaux, soit 38 080,68 $ de retrait non imposable illégitime.
        expect(state.rapBorrowed).toBeGreaterThan(0);          // non-vacuité
        expect(state.rapBorrowed).toBeLessThanOrEqual(RAP_LIMIT_PER_USER);
    });

    it('deux déclarants ⇒ le double (aucune régression du cas nominal)', () => {
        const state = makeState({ liquid: 0, celi: 0, celiapp: 0, nonReg: 0, reer: 600000 });
        processRealEstate(
            state,
            makeCtx({ activeUsersCount: 2, taxFilers: 2 }),
            [makeGoal()], [makeProp()], offset0, noWelcomeTax,
        );
        expect(state.rapBorrowed).toBeGreaterThan(RAP_LIMIT_PER_USER);
        expect(state.rapBorrowed).toBeLessThanOrEqual(RAP_LIMIT_PER_USER * 2);
    });

    it('taxFilers absent ⇒ repli sur activeUsersCount (rétrocompat bit-identique)', () => {
        const avec = makeState({ liquid: 0, celi: 0, celiapp: 0, nonReg: 0, reer: 600000 });
        const sans = makeState({ liquid: 0, celi: 0, celiapp: 0, nonReg: 0, reer: 600000 });
        processRealEstate(avec, makeCtx({ activeUsersCount: 2, taxFilers: 2 }), [makeGoal()], [makeProp()], offset0, noWelcomeTax);
        processRealEstate(sans, makeCtx({ activeUsersCount: 2 }), [makeGoal()], [makeProp()], offset0, noWelcomeTax);
        expect(sans.rapBorrowed).toBeCloseTo(avec.rapBorrowed, 9);
        expect(sans.accRetraitsReerYearAdd).toBeCloseTo(avec.accRetraitsReerYearAdd, 9);
    });
});

describe('[REER-ACTIF-NON-RECONCILIE] décembre impose les retraits REER d’un ménage ACTIF', () => {
    it('un retrait REER augmente l’impôt dû, au marginal réel du salaire', () => {
        const sansRetrait = processDecemberTaxFiling(11, makeDecCtx(), decHelpers, zeroBucket());

        // 100 k$ retirés sur 150 k$ de salaire. La retenue à la source du barème est déjà dans
        // le bucket `.reer` au moment où décembre passe — comme en production.
        const retrait = 100000;
        const retenue = withholdingForGrossRRSP(retrait).withholding;
        const avecRetrait = processDecemberTaxFiling(
            11,
            makeDecCtx({ accRetraitsReerYear: retrait }),
            decHelpers,
            { ...zeroBucket(), reer: retenue },
        );

        const duSans = impotRevenuDuEnAvril(sansRetrait.newTaxCurrentYear);
        const duAvec = impotRevenuDuEnAvril(avecRetrait.newTaxCurrentYear);

        // Discriminant : AVANT, la branche active ne mettait QUE le salaire dans l'assiette. Le
        // retrait restait au seul taux de retenue → `duAvec - duSans` valait exactement la retenue,
        // et l'écart au marginal réel (mesuré 20 177 $ sur ce cas) n'était JAMAIS facturé.
        const impotSupplementaire = duAvec - duSans;
        expect(impotSupplementaire).toBeGreaterThan(retenue * 1.2);

        // Et il vaut bien l'impôt incrémental réel sur la tranche retirée.
        const impotSalaireSeul = calculateFiscalReport(150000, 0, 0, 2026, false).totalTax;
        const impotAvecRetrait = calculateFiscalReport(150000 + retrait, 0, 0, 2026, false, undefined, 150000).totalTax;
        expect(impotSupplementaire).toBeCloseTo(impotAvecRetrait - impotSalaireSeul, 2);
    });

    it('la retenue déjà prélevée est créditée UNE seule fois (pas de double imposition)', () => {
        const retrait = 50000;
        const retenue = withholdingForGrossRRSP(retrait).withholding;
        const res = processDecemberTaxFiling(
            11,
            makeDecCtx({ grossMarcBaseAnnual: 90000, accRetraitsReerYear: retrait }),
            decHelpers,
            { ...zeroBucket(), reer: retenue },
        );

        // Le bucket `.reer` reste la retenue telle quelle (avril la débite), et `.revenu` porte le
        // SOLDE — pas l'impôt entier. Sans le crédit, `.revenu` aurait facturé la retenue une 2e fois.
        expect(res.newTaxCurrentYear.reer).toBeCloseTo(retenue, 6);
        const impotTotalAttendu =
            calculateFiscalReport(90000 + retrait, 0, 0, 2026, false, undefined, 90000).totalTax;
        const retenueSalariale = calculateFiscalReport(90000, 0, 0, 2026, false, undefined, 90000).totalTax;
        expect(impotRevenuDuEnAvril(res.newTaxCurrentYear)).toBeCloseTo(impotTotalAttendu - retenueSalariale, 2);
    });

    it('les cotisations RRQ/RQAP/AE ne portent PAS sur le retrait REER', () => {
        // Salaire SOUS les maximums de cotisation : si le retrait entrait dans l'assiette d'emploi,
        // il gonflerait RRQ/AE/RQAP et l'impôt dû baisserait (les cotisations sont déductibles /
        // créditées). On compare à l'incrémental calculé avec `employmentIncome` explicite.
        const salaire = 50000;
        const retrait = 40000;
        const retenue = withholdingForGrossRRSP(retrait).withholding;
        const res = processDecemberTaxFiling(
            11,
            makeDecCtx({ grossMarcBaseAnnual: salaire, accRetraitsReerYear: retrait }),
            decHelpers,
            { ...zeroBucket(), reer: retenue },
        );
        // `.revenu + .reer` == impôt total − retenue salariale : la retenue REER se neutralise
        // (créditée dans `.revenu`, re-débitée par `.reer`). C'est ce qui prouve le non-double-comptage.
        const attendu =
            calculateFiscalReport(salaire + retrait, 0, 0, 2026, false, undefined, salaire).totalTax
            - calculateFiscalReport(salaire, 0, 0, 2026, false, undefined, salaire).totalTax;
        expect(impotRevenuDuEnAvril(res.newTaxCurrentYear)).toBeCloseTo(attendu, 2);
        // Non-vacuité : la retenue n'est pas nulle, donc le crédit testé a bien un effet.
        expect(retenue).toBeGreaterThan(1000);
    });

    // ⚠️ NON DISCRIMINANT par construction : un test de rétrocompat doit passer AVANT et APRÈS.
    it('aucun retrait ⇒ le correctif est NEUTRE (rétrocompat du salarié pur)', () => {
        const res = processDecemberTaxFiling(11, makeDecCtx(), decHelpers, zeroBucket());
        // Salaire seul, sans déduction ni T1213 : l'assiette élargie vaut l'assiette salariale et
        // la retenue de l'employeur l'annule → aucun solde d'impôt sur le revenu à régler.
        expect(impotRevenuDuEnAvril(res.newTaxCurrentYear)).toBeCloseTo(0, 2);
        expect(res.newTaxCurrentYear.reer).toBe(0);
        // Seule la prime RAMQ subsiste dans `.divers` — inchangée par ce lot.
        expect(res.newTaxCurrentYear.divers).toBeGreaterThan(0);
    });

    it('couple : chacun est taxé sur SES propres retraits quand la ventilation est cohérente', () => {
        const retraitMarc = 80000;
        const retenue = withholdingForGrossRRSP(retraitMarc).withholding;
        const base = {
            activeUsersCount: 2,
            grossMarcBaseAnnual: 150000,
            grossAnnaBaseAnnual: 40000,
            accRetraitsReerYear: retraitMarc,
        };
        // Tout le retrait est à Marc (le plus haut revenu) → imposé à SON marginal.
        const cible = processDecemberTaxFiling(
            11, makeDecCtx({ ...base, accRetraitsReerYearByUser: [retraitMarc, 0] }),
            decHelpers, { ...zeroBucket(), reer: retenue },
        );
        // Ventilation absente → repli sur le split égal, donc une part chez Anna (marginal plus bas).
        const splitEgal = processDecemberTaxFiling(
            11, makeDecCtx(base), decHelpers, { ...zeroBucket(), reer: retenue },
        );

        // Discriminant d'ORDRE : concentrer le retrait sur le HAUT revenu coûte STRICTEMENT plus
        // cher que l'étaler. Si la ventilation était ignorée, les deux seraient égaux.
        expect(impotRevenuDuEnAvril(cible.newTaxCurrentYear)).toBeGreaterThan(impotRevenuDuEnAvril(splitEgal.newTaxCurrentYear));
    });

    // ⚠️ NON DISCRIMINANT sur le code d'avant (mesuré) : la phase active n'y lisait aucune
    // ventilation, donc les deux branches étaient déjà égales. Ce test garde contre une régression
    // future, il ne prouve pas le correctif.
    it('une ventilation INCOHÉRENTE avec le total est ignorée (repli sur le split égal)', () => {
        const retrait = 60000;
        const retenue = withholdingForGrossRRSP(retrait).withholding;
        const base = { activeUsersCount: 2, grossMarcBaseAnnual: 120000, grossAnnaBaseAnnual: 60000, accRetraitsReerYear: retrait };
        // Σ = 10 000 ≠ 60 000 : la ventilation ment. Elle ne doit PAS servir à taxer.
        const incoherent = processDecemberTaxFiling(
            11, makeDecCtx({ ...base, accRetraitsReerYearByUser: [10000, 0] }),
            decHelpers, { ...zeroBucket(), reer: retenue },
        );
        const repli = processDecemberTaxFiling(11, makeDecCtx(base), decHelpers, { ...zeroBucket(), reer: retenue });
        expect(impotRevenuDuEnAvril(incoherent.newTaxCurrentYear)).toBeCloseTo(impotRevenuDuEnAvril(repli.newTaxCurrentYear), 6);
    });
});
