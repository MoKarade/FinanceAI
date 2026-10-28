// tests/services/logRamqFssMemeUnite.test.ts
//
// [LOG-RAMQ-FSS-DEUX-UNITES-DANS-UNE-PHRASE] (lot 202) — le journal de décembre publiait, dans la MÊME
// phrase, un total en dollars NOMINAUX (celui qui entre dans `divers`) et une part par adulte en
// dollars RÉELS (la sortie brute de `calculateRamqPremium` / `calculateFSSPremium`, calculée sur un
// revenu déflaté). Les deux passent par `formatCAD`, se ressemblent typographiquement, et la phrase
// « X/an (Y/adulte) » invite à la division X ÷ Y — qui ne donnait PAS le nombre d'adultes dès que
// l'année est indexée. Défaut PRÉEXISTANT, signalé au lot 101 et laissé ouvert.
//
// La garde ne lit pas un montant en dollars (il s'indexe) : elle lit la RELATION que la phrase
// affirme — total = nombre d'adultes × part par adulte, à l'arrondi près — sur une année dont le
// facteur d'inflation est franchement différent de 1. Sur le code d'avant, cette relation est fausse
// d'un facteur égal au facteur d'inflation (mesuré : 1,5).
import { describe, it, expect } from 'vitest';
import { processDecemberTaxFiling, type DecemberHelpers, type DecemberContext } from '../../services/projection/taxDecember';
import { calculateFiscalReport, getMarginalRate, calculateDividendTax, getDividendGrossUpRate } from '../../utils/tax';

const helpers: DecemberHelpers = { calculateFiscalReport, getMarginalRate, calculateDividendTax, getDividendGrossUpRate };
const ZERO_TAX = { revenu: 0, gains: 0, divers: 0, reer: 0, donCredit: 0 };

// Couple RETRAITÉ : seule la branche retraitée alimente le FSS, et son revenu familial (96 000 $
// réels) est au-dessus de l'exemption RAMQ du couple (31 610 $) comme du palier FSS — les deux
// primes sont donc NON NULLES (anti-vacuité vérifiée plus bas).
const ctx = (inflationFactor: number): DecemberContext => ({
    m: 120, loopYear: 2036, isRetired: true, enableMonteCarlo: false, yearsElapsed: 10,
    inflationFactor, activeUsersCount: 2, age: 70, ageSpouse: 68,
    grossMarcBaseAnnual: 0, grossAnnaBaseAnnual: 0, simSalaryGrowth: 0,
    optimizeSourceDeductions: false,
    // Le MÊME revenu réel quel que soit le facteur (64 000 $/an pour le ménage), exprimé en nominal
    // comme le moteur le fait : au facteur 1,5 c'est 8 000 $/mois, au facteur 1 c'est 5 333 $/mois.
    incomeRetirementMonthly: (64_000 / 12) * inflationFactor,
    nonReg: 0, baseNonRegRate: 0,
    accRrspYear: 0, accFhsaYear: 0, smithInterestDeductibleYear: 0,
    accRentesYear: 0, accRetraitsReerYear: 0, accCapitalGainsYear: 0,
    childrenCount: 0,
} as unknown as DecemberContext);

/** Les montants d'une ligne de journal, dans l'ordre, en nombre (formatCAD sépare par une insécable). */
const montants = (ligne: string): number[] =>
    (ligne.match(/-?[\d   ]+\$/g) ?? []).map((s) => Number(s.replace(/[^\d-]/g, '')));

const ligne = (logs: string[], motif: RegExp): string => {
    const l = logs.find((x) => motif.test(x));
    expect(l, `ligne ${motif} absente du journal`).toBeTruthy();
    return l as string;
};

describe('[LOG-RAMQ-FSS-DEUX-UNITES-DANS-UNE-PHRASE] total et part par adulte dans la MÊME unité', () => {
    const FACTEUR = 1.5;
    const r = processDecemberTaxFiling(11, ctx(FACTEUR), helpers, { ...ZERO_TAX });
    const ramq = ligne(r.logs, /RAMQ/);
    const fss = ligne(r.logs, /FSS/);

    it('anti-vacuité : les deux primes sont non nulles et l\'année est franchement indexée', () => {
        expect(FACTEUR).not.toBe(1);
        expect(r.newTaxCurrentYear.divers).toBeGreaterThan(100);
        expect(montants(ramq)).toHaveLength(2);
        expect(montants(fss)).toHaveLength(2);
        expect(montants(ramq)[0]).toBeGreaterThan(0);
        expect(montants(fss)[0]).toBeGreaterThan(0);
    });

    it('RAMQ : la phrase nomme le nombre d\'adultes, et total = adultes × part (à l\'arrondi près)', () => {
        const [total, part] = montants(ramq);
        const n = Number(/(\d+) adulte/.exec(ramq)?.[1]);
        expect(n).toBe(2);
        // Deux arrondis indépendants au dollar : l'écart admissible est de n × 0,5 $ + 0,5 $.
        expect(Math.abs(total - n * part)).toBeLessThanOrEqual(n * 0.5 + 0.5);
    });

    it('FSS : même relation', () => {
        const [total, part] = montants(fss);
        const n = Number(/(\d+) adulte/.exec(fss)?.[1]);
        expect(n).toBe(2);
        expect(Math.abs(total - n * part)).toBeLessThanOrEqual(n * 0.5 + 0.5);
    });

    it('le total publié est celui qui entre dans `divers` (unité NOMINALE), au dollar près', () => {
        // Discrimine « les deux en RÉEL » : la division serait juste, mais le total ne serait plus
        // celui que le ménage paie. La perturbation « total ÷ facteur » rougit ici et nulle part ailleurs.
        expect(montants(ramq)[0] + montants(fss)[0]).toBeCloseTo(r.newTaxCurrentYear.divers, -1);
    });

    it('contrôle : année non indexée (facteur 1), la relation tient aussi', () => {
        const r1 = processDecemberTaxFiling(11, ctx(1), helpers, { ...ZERO_TAX });
        for (const motif of [/RAMQ/, /FSS/]) {
            const l = ligne(r1.logs, motif);
            const [total, part] = montants(l);
            expect(part).toBeGreaterThan(0);
            expect(Math.abs(total - 2 * part)).toBeLessThanOrEqual(1.5);
        }
    });
});
