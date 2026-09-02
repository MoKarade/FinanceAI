// tests/services/estateAgeCredits.test.ts
//
// [FISC-BANDES-FRERES-SANS-AGEOPTS] — moitié `estateCalculation.ts` (lot 85).
//
// Le module calcule DEUX bandes fiscales incrémentales à un âge parfaitement connu
// (`currentAge + simulationYears`) et les calculait sans crédits d'âge :
//   · l'impôt successoral      = impôt(contexte + liquidation) − impôt(contexte) ;
//   · `facteurNetRentes`       = 1 − [impôt(contexte) − impôt(contexte − rentes)] / rentes.
//
// ⚠️ **SEULE LA PREMIÈRE est corrigée par ce lot, et le refus de la seconde est MESURÉ.** Câbler
// les crédits sur la bande des rentes INVERSE un invariant vrai du monde réel (« une pension DB
// pleinement indexée ne peut pas appauvrir ») pour tout horizon ≤ ~9 ans — non pas à cause des
// crédits, mais parce que cette bande souffre déjà de `[ESTATE-NPV-CONTEXTE-PLURIANNUEL]` (facteur
// d'UNE année appliqué à une VAN pluriannuelle) et que la rendre plus sensible au revenu amplifie
// l'artefact. Décomposition par site, fixture `buildAtRetirement` à 5 ans : bande successorale
// seule → +4 764 $ (invariant intact) ; bande des rentes seule → −4 773 $. Les deux se livrent
// ENSEMBLE ou pas du tout. Détail chiffré : commentaire du module + `docs/FISCAL_REFERENCE.md`.
//
// ⚠️ Pourquoi AUCUN test existant ne pouvait voir ce défaut : le stub fiscal partagé de
// `estateCalculation.test.ts` est `gross × 0,3`, un taux PLAT. Un crédit non remboursable est
// invisible sous un barème plat — il n'y a ni seuil de récupération ni montant personnel. C'est
// exactement `UN-STUB-QUI-A-LA-FORME-DU-DEFAUT-NE-PEUT-PAS-LE-VOIR`. Les assertions de
// COMPORTEMENT ci-dessous passent donc par le VRAI `calculateFiscalReport`.
import { describe, it, expect, vi } from 'vitest';
import { computeEstateNetWorth, type EstateCalcInputs } from '../../services/projection/estateCalculation';
import { calculateFiscalReport, type AgeCreditOptions, type FiscalReport } from '../../utils/tax';

/**
 * Barème RÉEL amputé de son 6e argument. Ce n'est PAS une ré-implémentation du calcul (ce serait
 * le piège « le test contient une expression qui ressemble au code testé ») : c'est la MÊME
 * fonction, privée de la seule chose que ce lot ajoute. Tout écart mesuré contre elle est donc
 * imputable aux crédits d'âge, et à rien d'autre.
 */
const sansCredits = (g: number, r: number, f: number, y: number, s: boolean): FiscalReport =>
    calculateFiscalReport(g, r, f, y, s);
const avecCredits = calculateFiscalReport;

/** Ménage RETRAITÉ à l'horizon, avec rentes publiques : les deux bandes sont exercées. */
const baseRetraite: EstateCalcInputs = {
    liquid: 40000, celi: 120000, celiapp: 0, reer: 250000, nonReg: 90000, nonRegACB: 60000,
    crypto: 0, cryptoACB: 0, reee: 0, realEstateEquity: 350000, mortgageBalance: 0, smithManoeuvreDebt: 0,
    incomeRetirement: 4000, accRentesYear: 0, accRetraitsReerYear: 0,
    grossMarcBaseAnnual: 0, grossAnnaBaseAnnual: 0, simSalaryGrowth: 0,
    simulationYears: 10, startYear: 2026, currentAge: 65, retirementTargetAge: 60,
    governmentPension: 1800, activeUsersCount: 1, simInflation: 0, enableMonteCarlo: false,
    startingCash: 40000, startingCELI: 120000, startingCELIAPP: 0, startingREER: 250000,
    startingNonReg: 90000, startingCrypto: 0, startingREEE: 0,
};

describe('[FISC-BANDES-FRERES-SANS-AGEOPTS] câblage — on OBSERVE l\'argument, on ne le reconstruit pas', () => {
    /** Espion : capture les `ageOpts` de CHAQUE appel, dans l'ordre, puis délègue au vrai barème. */
    const espionner = (inputs: EstateCalcInputs) => {
        const vus: Array<{ gross: number; opts: AgeCreditOptions | undefined }> = [];
        const spy = vi.fn((g: number, r: number, f: number, y: number, s: boolean, o?: AgeCreditOptions) => {
            vus.push({ gross: g, opts: o });
            return calculateFiscalReport(g, r, f, y, s, o);
        });
        computeEstateNetWorth(inputs, spy);
        return vus;
    };

    it('la bande SUCCESSORALE porte l\'âge FINAL réel', () => {
        const vus = espionner(baseRetraite);
        // Anti-vacuité : les deux bandes DOIVENT être exercées, sinon tout ce qui suit est vide.
        expect(vus.length, 'les deux bandes doivent produire 4 appels fiscaux').toBe(4);
        const ageFinal = baseRetraite.currentAge + baseRetraite.simulationYears; // 75
        for (const i of [0, 1]) {
            expect(vus[i].opts, `appel ${i} sans ageOpts`).toBeDefined();
            expect(vus[i].opts?.age, `appel ${i} : âge transmis`).toBe(ageFinal);
        }
    });

    it('structure des deux bandes : la liquidation s\'EMPILE, la tranche de rentes se RETIRE', () => {
        // Ce contrôle ne recalcule aucun montant : il vérifie le SENS de chaque paire, ce qui
        // identifie les appels sans avoir à re-dériver les assiettes depuis le test.
        const vus = espionner(baseRetraite);
        expect(vus[1].gross, 'bande successorale : final = contexte + liquidation').toBeGreaterThan(vus[0].gross);
        expect(vus[3].gross, 'bande des rentes : le second appel retire la tranche').toBeLessThan(vus[2].gross);
    });

    it('`hasSpouse: false` même en COUPLE — la liquidation est imposée sur la déclaration du survivant SEUL', () => {
        // Fixture COUPLE par nécessité : en solo, `false` et « le compteur de têtes » rendent la même
        // chose et le test ne distinguerait RIEN (même famille que
        // `UN-PARTAGE-A-50-POURCENT-NE-DISTINGUE-PAS-KEEP-DE-SON-COMPLEMENT`). La formule qui vient
        // spontanément — le compteur de têtes du ménage, `activeUsersCount > 1` — serait ici une
        // FAUTE : le modèle du module (double décès, une seule déclaration finale) dit l'inverse.
        const vus = espionner({ ...baseRetraite, activeUsersCount: 2 });
        expect(vus[0].opts?.hasSpouse).toBe(false);
        expect(vus[1].opts?.hasSpouse).toBe(false);
    });

    it('INVENTAIRE DE DETTE — la bande des RENTES reste sans crédits, et ce test doit MOURIR avec `[ESTATE-NPV-CONTEXTE-PLURIANNUEL]`', () => {
        // Ce test n'affirme pas que l'état actuel est BON : il affirme qu'il est DÉLIBÉRÉ, et il
        // borne la dette. Deux sens, comme tout inventaire qui doit savoir mourir :
        //   · aucune TROISIÈME bande ne s'ajoute en douce sans crédits (le compte est exact) ;
        //   · le jour où le couple `[ESTATE-NPV-CONTEXTE-PLURIANNUEL]` + crédits d'âge est livré, ce
        //     test rougit PAR CONCEPTION — il se retourne alors (« les 4 appels portent l'âge »), il
        //     ne se supprime pas (`UN-TEST-DE-LIMITE-S-INVERSE-IL-NE-SE-SUPPRIME-PAS`).
        const vus = espionner(baseRetraite);
        expect(vus[2].opts, 'bande des rentes : sans crédits, volontairement').toBeUndefined();
        expect(vus[3].opts).toBeUndefined();
        expect(vus.filter(v => v.opts === undefined).length, 'exactement DEUX appels non crédités').toBe(2);
    });
});

describe('[FISC-BANDES-FRERES-SANS-AGEOPTS] comportement sous le VRAI barème', () => {
    it('l\'âge se LIMITE tout seul : sous 65 ans, résultat identique au barème sans crédits', () => {
        // Le ticket parlait de « contextes par définition 65+ ». C'est faux (une simulation peut
        // s'arrêter avant), et c'est justement pourquoi on transmet l'âge RÉEL : tous les crédits de
        // `calculateAgeAndPensionCredits` sont gatés `age >= 65`, montant « vivant seule » compris.
        const jeune: EstateCalcInputs = { ...baseRetraite, currentAge: 50, simulationYears: 10 }; // 60 ans
        const avec = computeEstateNetWorth(jeune, avecCredits);
        const sans = computeEstateNetWorth(jeune, sansCredits);
        expect(avec.estateNetWorth).toBe(sans.estateNetWorth);
        expect(avec.totalEstateTax).toBe(sans.totalEstateTax);
    });

    it('à 65+, le câblage CHANGE bien le résultat publié (anti-vacuité du test précédent)', () => {
        const avec = computeEstateNetWorth(baseRetraite, avecCredits);
        const sans = computeEstateNetWorth(baseRetraite, sansCredits);
        expect(avec.estateNetWorth).not.toBe(sans.estateNetWorth);
    });

    it('la bande SUCCESSORALE monte : le crédit d\'âge existe sur la base, la liquidation l\'écrase', () => {
        // Signe contre-intuitif et pourtant juste : `impôt(contexte + liquidation) − impôt(contexte)`
        // gagne le crédit PERDU du fait de la liquidation. Mesuré hors fixture : +3 440 $ pour un
        // déclarant seul de 65 ans (contexte 48 k$, liquidation 215 k$). On borne largement plutôt
        // que d'ancrer au dollar — un montant ancré serait une bombe à la prochaine indexation.
        const avec = computeEstateNetWorth(baseRetraite, avecCredits);
        const sans = computeEstateNetWorth(baseRetraite, sansCredits);
        expect(avec.totalEstateTax).toBeGreaterThan(sans.totalEstateTax);
        expect(avec.totalEstateTax - sans.totalEstateTax).toBeGreaterThan(200);
    });
});
