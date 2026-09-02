// tests/services/taxDecemberActifPension.test.ts
//
// [TAXDEC-ACTIF-72-PENSION-CREDIT] — deux défauts d'un ménage ACTIF qui décaisse son REER.
//
// (A) ASSIETTE D'EMPILEMENT (défaut DOMINANT, population large) : `[REER-ACTIF-NON-RECONCILIE]`
//     avait élargi l'assiette imposable d'un actif à ses retraits REER — au §1 SEULEMENT. Les deux
//     bandes incrémentales (§2 gains, §3 dividendes) empilaient donc leur tranche sur le SALAIRE
//     SEUL, dans des paliers trop bas. Impôt jamais facturé : 701 à 2 520 $/an mesurés.
// (B) CRÉDIT DE PENSION (population étroite) : `mkActiveAgeOpts` passait `eligiblePensionIncome: 0`
//     en dur, alors que l'âge de retraite est saisissable jusqu'à 75 et que le moteur traite les
//     retraits REER comme du FERR dès 72 ans. Sur-imposition de 250 à 679 $/an.
//
// ⚠️ Pourquoi les 126 tests de caractérisation du module ne pouvaient voir NI l'un NI l'autre : leur
// stub fiscal est `gross × TAUX`, un barème PLAT. Une bande y vaut `tranche × taux` quelle que soit
// l'assiette, et un crédit non remboursable y est invisible
// (`UN-STUB-QUI-A-LA-FORME-DU-DEFAUT-NE-PEUT-PAS-LE-VOIR`). Tout ce fichier injecte donc le VRAI
// `calculateFiscalReport`, ou espionne ses ARGUMENTS.
import { describe, it, expect, vi } from 'vitest';
import {
    processDecemberTaxFiling,
    type DecemberContext,
    type DecemberHelpers,
} from '../../services/projection/taxDecember';
import {
    calculateFiscalReport, getMarginalRate, calculateDividendTax, getDividendGrossUpRate,
    CAPITAL_GAINS_INCLUSION_STANDARD, type AgeCreditOptions,
} from '../../utils/tax';

const DECEMBRE = 11;
const ZERO = { revenu: 0, gains: 0, divers: 0, reer: 0, donCredit: 0 };

const vraisHelpers = (): DecemberHelpers => ({
    calculateFiscalReport, getMarginalRate, calculateDividendTax, getDividendGrossUpRate,
});

/** Ménage ACTIF d'un seul déclarant : salaire, retraits REER de l'année, gains réalisés. */
const actif = (o: Partial<DecemberContext> = {}): DecemberContext => ({
    m: 24, loopYear: 2026, isRetired: false, enableMonteCarlo: false, yearsElapsed: 0,
    inflationFactor: 1, activeUsersCount: 1,
    grossMarcBaseAnnual: 60000, grossAnnaBaseAnnual: 0, simSalaryGrowth: 0,
    optimizeSourceDeductions: undefined, incomeRetirementMonthly: 0,
    nonReg: 0, baseNonRegRate: 0,
    accRrspYear: 0, accFhsaYear: 0, smithInterestDeductibleYear: 0,
    accRentesYear: 0, accRetraitsReerYear: 40000,
    accCapitalGainsYear: 40000, // → 20 000 $ imposables
    age: 40, childrenCount: 0, ramqExempt: true,
    ...o,
});

/** Capture les appels fiscaux : assiette de base et options de crédits. */
const espionner = (ctx: DecemberContext) => {
    const vus: Array<{ gross: number; opts?: AgeCreditOptions }> = [];
    const helpers = vraisHelpers();
    const spy = vi.fn((g: number, d: number, f: number, y: number, s: boolean, o?: AgeCreditOptions,
                       e?: number, rd?: number) => {
        vus.push({ gross: g, opts: o });
        return calculateFiscalReport(g, d, f, y, s, o, e, rd);
    }) as DecemberHelpers['calculateFiscalReport'];
    processDecemberTaxFiling(DECEMBRE, ctx, { ...helpers, calculateFiscalReport: spy }, { ...ZERO });
    return vus;
};

describe('[TAXDEC-ACTIF-72-PENSION-CREDIT] (A) l\'assiette d\'empilement d\'un ACTIF porte ses retraits REER', () => {
    it('la bande des GAINS part de salaire + retraits, jamais du salaire seul', () => {
        const vus = espionner(actif());
        const bases = vus.map(v => v.gross);
        // Anti-vacuité : le §2 doit avoir tourné, donc une base à 100 000 $ doit exister.
        expect(bases, 'assiette d\'empilement = 60 000 salaire + 40 000 retraits').toContain(100000);
        // Et la base FAUSSE (salaire seul) ne doit plus servir d'assiette d'empilement. Elle reste
        // légitime au §1 (l'assiette d'EMPLOI), d'où une assertion sur la PAIRE de la bande.
        const hautDeBande = 100000 + 40000 * CAPITAL_GAINS_INCLUSION_STANDARD;
        expect(bases, 'haut de la bande = assiette + gains imposables').toContain(hautDeBande);
    });

    it('l\'effet est RÉEL, pas décoratif : plus de retraits ⇒ bande plus chère', () => {
        // Contrôle indispensable : sous un barème plat, cette assertion serait vacueuse — c'est
        // exactement pourquoi les tests de caractérisation ne voyaient rien.
        const peu = processDecemberTaxFiling(DECEMBRE, actif({ accRetraitsReerYear: 0 }), vraisHelpers(), { ...ZERO });
        const beaucoup = processDecemberTaxFiling(DECEMBRE, actif(), vraisHelpers(), { ...ZERO });
        expect(beaucoup.newTaxCurrentYear.gains).toBeGreaterThan(peu.newTaxCurrentYear.gains);
    });

    it('la bande des DIVIDENDES part de la MÊME assiette — le §3 avait le même trou que le §2', () => {
        // Le ticket ne nommait que le §2. Le §3 a été trouvé en énumérant les producteurs.
        const sansDiv = processDecemberTaxFiling(DECEMBRE, actif({ nonReg: 0 }), vraisHelpers(), { ...ZERO });
        const avecDiv = processDecemberTaxFiling(DECEMBRE, actif({ nonReg: 500000, baseNonRegRate: 6 }), vraisHelpers(), { ...ZERO });
        // Anti-vacuité : le bloc dividendes doit produire quelque chose.
        expect(avecDiv.newTaxCurrentYear.gains).toBeGreaterThan(sansDiv.newTaxCurrentYear.gains);
        const vus = espionner(actif({ nonReg: 500000, baseNonRegRate: 6 }));
        // L'assiette du dividende empile SUR les gains : 100 000 + 20 000 imposables.
        expect(vus.map(v => v.gross)).toContain(100000 + 40000 * CAPITAL_GAINS_INCLUSION_STANDARD);
    });

    it('un ménage RETRAITÉ garde exactement son assiette d\'avant (non-régression)', () => {
        // Le lot factorise `accRetraitsReerYear` HORS du ternaire : la branche retraitée, qui les
        // portait déjà, doit être bit-identique.
        const vus = espionner(actif({
            isRetired: true, grossMarcBaseAnnual: 0, incomeRetirementMonthly: 3000, accRentesYear: 5000,
        }));
        expect(vus.map(v => v.gross), 'retraite : 36 000 pension + 5 000 loyers + 40 000 retraits').toContain(81000);
    });
});

describe('[TAXDEC-ACTIF-72-PENSION-CREDIT] (B) un ACTIF de 72+ a droit au crédit de pension', () => {
    it('à 73 ans, l\'assiette du crédit vaut les retraits REER — et les DEUX côtés disent la même chose', () => {
        // C'est le cœur du ticket : porter la pension d'un seul côté (§1 ou la bande) recréait
        // ±1 878 $/an d'incohérence interne. On observe donc les DEUX familles d'appels.
        const vus = espionner(actif({ age: 73 }));
        const avecOpts = vus.filter(v => v.opts !== undefined);
        expect(avecOpts.length, 'un actif de 73 ans doit recevoir des crédits d\'âge').toBeGreaterThan(0);
        for (const v of avecOpts) {
            expect(v.opts?.age).toBe(73);
            expect(v.opts?.eligiblePensionIncome, 'assiette = les retraits REER, partout').toBe(40000);
        }
    });

    it('à 71 ans, rien : le gate FERR du modèle est 72, pas 65', () => {
        // Le crédit d'ÂGE, lui, existe dès 65 — donc les options sont bien présentes, avec une
        // assiette de pension NULLE. Les deux gates sont distincts et ce test les sépare.
        const vus = espionner(actif({ age: 71 }));
        const avecOpts = vus.filter(v => v.opts !== undefined);
        expect(avecOpts.length, 'à 71 ans le crédit d\'âge s\'applique déjà').toBeGreaterThan(0);
        for (const v of avecOpts) expect(v.opts?.eligiblePensionIncome).toBe(0);
    });

    it('l\'effet PUBLIÉ est réel mais ÉTROIT — et la fixture qui l\'observe n\'est pas celle qu\'on croit', () => {
        // ⚠️ MESURÉ, et c'est le résultat le plus important du lot : sur le règlement de décembre,
        // le crédit de pension s'ANNULE presque toujours. `revenu` vaut `impôt − retenue`, et les
        // DEUX appels portent les mêmes `ageOpts` avec le MÊME `familyIncome` — le crédit fédéral
        // (2 000 $, non testé au revenu) et le montant québécois disparaissent donc dans la
        // soustraction. Mesuré sur cinq configurations : **zéro effet dans quatre**.
        // Il ne survit que là où le crédit est PERDU du côté de la retenue, c'est-à-dire quand le
        // SALAIRE est petit devant les retraits : à 20 k$ de salaire et 50 k$ de retraits,
        // −678,62 $ sur `revenu` et +372,81 $ sur la bande des gains (le `familyIncome`, lui,
        // DIFFÈRE entre les deux appels de la bande), soit −305,81 $ net.
        // La population n'est donc pas « les actifs de 72-75 ans » comme le disait le ticket, mais
        // « ceux dont le salaire est petit devant leurs retraits »
        // (`UNE-GARDE-AU-PRODUCTEUR-NE-PROUVE-PAS-LA-CHAINE` : mesuré sur `calculateFiscalReport`,
        // l'écart valait 250-679 $ PARTOUT ; publié, il est nul presque partout).
        const sansAssiette: DecemberHelpers['calculateFiscalReport'] = (g, d, f, y, s, o, e, rd) =>
            calculateFiscalReport(g, d, f, y, s, o ? { ...o, eligiblePensionIncome: 0 } : o, e, rd);
        const observable = actif({ age: 73, grossMarcBaseAnnual: 20000, accRetraitsReerYear: 50000 });
        const avec = processDecemberTaxFiling(DECEMBRE, observable, vraisHelpers(), { ...ZERO });
        const sans = processDecemberTaxFiling(DECEMBRE, observable, { ...vraisHelpers(), calculateFiscalReport: sansAssiette }, { ...ZERO });
        expect(avec.newTaxCurrentYear.revenu, 'moins d\'impôt : la sur-imposition est corrigée').toBeLessThan(sans.newTaxCurrentYear.revenu);

        // Et le CONTRE-cas, écrit pour que personne ne croie l'effet universel : à salaire élevé,
        // le crédit s'annule et le règlement est INCHANGÉ. Sans cette moitié, le test laisserait
        // croire à un gain général et le prochain lot chercherait un bug là où il n'y en a pas.
        const neutre = actif({ age: 73, grossMarcBaseAnnual: 60000, accRetraitsReerYear: 40000 });
        const avecN = processDecemberTaxFiling(DECEMBRE, neutre, vraisHelpers(), { ...ZERO });
        const sansN = processDecemberTaxFiling(DECEMBRE, neutre, { ...vraisHelpers(), calculateFiscalReport: sansAssiette }, { ...ZERO });
        expect(avecN.newTaxCurrentYear.revenu).toBe(sansN.newTaxCurrentYear.revenu);
    });
});
