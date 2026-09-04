// [ENG-RAMQ-FIELDS] (lot 155) — exemption RAMQ PAR ADULTE (Annexe K : chaque conjoint calcule SA
// prime sur le revenu familial). Le ticket disait « bascule RAMQ/privé dans taxDecember » :
// recensé, la bascule de MÉNAGE (`ramqExempt`) existait déjà — ce qui manquait était la
// granularité par adulte (`ramqExemptAdultsCount`) et son producteur (`User.hasPrivateDrugInsurance`).
// Les assertions épinglent des RELATIONS (moitié exacte, zéro, priorité), jamais un montant en
// dollars — la prime s'indexe chaque année.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { processDecemberTaxFiling } from '../../services/projection/taxDecember';
import { calculateFiscalReport, getMarginalRate, calculateDividendTax } from '../../services/tax';
import { stripComments } from '../../utils/stripComments';

const helpers = {
    calculateFiscalReport,
    getMarginalRate,
    calculateDividendTax,
    getDividendGrossUpRate: () => 1.38,
};
const ZERO_TAX = { revenu: 0, gains: 0, divers: 0, reer: 0, donCredit: 0 };

// Couple actif : deux salaires, revenu familial bien au-dessus de l'exemption couple (31 610 $)
// pour que la prime par adulte soit NON NULLE (une fixture sous le seuil rendrait tout vacueux).
const coupleCtx = {
    m: 12,
    loopYear: 2026,
    isRetired: false,
    enableMonteCarlo: false,
    yearsElapsed: 0,
    inflationFactor: 1,
    activeUsersCount: 2,
    grossMarcBaseAnnual: 60_000,
    grossAnnaBaseAnnual: 40_000,
    simSalaryGrowth: 0,
    optimizeSourceDeductions: false,
    incomeRetirementMonthly: 0,
    nonReg: 0,
    baseNonRegRate: 0,
    accRrspYear: 0,
    accFhsaYear: 0,
    smithInterestDeductibleYear: 0,
    accRentesYear: 0,
    accRetraitsReerYear: 0,
    accCapitalGainsYear: 0,
    childrenCount: 0,
};

const diversAvec = (extras: Record<string, unknown>): number =>
    processDecemberTaxFiling(11, { ...coupleCtx, ...extras }, helpers, { ...ZERO_TAX }).newTaxCurrentYear.divers;

describe('[ENG-RAMQ-FIELDS] exemption RAMQ par adulte (taxDecember)', () => {
    const deuxPayeurs = diversAvec({ ramqExemptAdultsCount: 0 });
    const unPayeur = diversAvec({ ramqExemptAdultsCount: 1 });
    const zeroPayeur = diversAvec({ ramqExemptAdultsCount: 2 });

    it('anti-vacuité : la fixture produit une prime non nulle pour deux payeurs', () => {
        expect(deuxPayeurs).toBeGreaterThan(0);
    });

    it('un adulte couvert au privé = exactement la MOITIÉ de la prime du ménage', () => {
        // Même revenu familial ⇒ même prime PAR ADULTE (Annexe K) ; seule la multiplication change.
        expect(unPayeur).toBeCloseTo(deuxPayeurs / 2, 6);
        expect(unPayeur).toBeGreaterThan(0);
    });

    it('les deux adultes couverts = zéro prime, et le log RAMQ disparaît', () => {
        expect(zeroPayeur).toBe(0);
        const r = processDecemberTaxFiling(11, { ...coupleCtx, ramqExemptAdultsCount: 2 }, helpers, { ...ZERO_TAX });
        expect(r.logs.some(l => l.includes('RAMQ'))).toBe(false);
    });

    it('un conjoint exempté ne transforme pas l\'autre en célibataire (seuils du COUPLE)', () => {
        // Si `hasSpouse` basculait avec l'exemption, l'exemption de revenu passerait de 31 610 $
        // (couple) à 19 500 $ (célibataire) et la prime du payeur restant MONTERAIT au-delà de la
        // moitié. L'égalité stricte à la moitié (test ci-dessus) le couvre déjà ; ce cas nomme le
        // piège pour qu'un futur refactor le lise.
        expect(unPayeur).toBeLessThanOrEqual(deuxPayeurs / 2 + 0.01);
    });

    it('rétrocompat : `ramqExempt: true` sans le compte fin exempte tout le ménage', () => {
        expect(diversAvec({ ramqExempt: true })).toBe(0);
    });

    it('le compte fin PRIME sur le drapeau de ménage quand les deux sont fournis', () => {
        // Contrat documenté dans le type : `ramqExemptAdultsCount` a priorité.
        expect(diversAvec({ ramqExempt: true, ramqExemptAdultsCount: 0 })).toBeCloseTo(deuxPayeurs, 6);
    });

    it('le compte est CLAMPÉ à activeUsersCount (un compte délirant ne rend pas la prime négative)', () => {
        expect(diversAvec({ ramqExemptAdultsCount: 5 })).toBe(0);
        expect(diversAvec({ ramqExemptAdultsCount: -3 })).toBeCloseTo(deuxPayeurs, 6);
    });
});

describe('[ENG-RAMQ-FIELDS] câblage moteur : User.hasPrivateDrugInsurance → ramqExemptAdultsCount', () => {
    // L'appelant est enfoui dans la boucle moteur : un test de câblage par montage laisserait tout
    // vert si l'argument disparaissait (leçon CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE — seul le
    // scan de SOURCE couvre un appelant de boucle). Source DÉCOMMENTÉE : le nom du champ figure
    // aussi dans le commentaire qui explique le câblage.
    it('projection.ts dérive le compte du champ User, branches solo ET couple', () => {
        const src = stripComments(readFileSync(resolve(__dirname, '../../services/projection.ts'), 'utf8'));
        // Anti-vacuité du décommentage : il reste du code, et un jeton voisin connu y figure.
        expect(src.replace(/\s/g, '').length).toBeGreaterThan(10_000);
        expect(src).toContain('activeUsersCount: taxFilers');
        expect(src).toMatch(/ramqExemptAdultsCount:\s*soloHousehold/);
        expect(src).toMatch(/config\.users\[0\]\?\.hasPrivateDrugInsurance \? 1 : 0/);
        expect(src).toMatch(/config\.users\.filter\(u => u\?\.hasPrivateDrugInsurance\)\.length/);
        // L'ancien câblage en dur ne doit pas réapparaître.
        expect(src).not.toMatch(/ramqExempt:\s*false/);
    });
});
