// tests/services/taxDecemberInflationAmont.test.ts
//
// [TAXDEC-INFLATIONFACTOR-AMONT] Le facteur d'inflation est validé À L'ENTRÉE du mois de décembre,
// et son repli est DIT une fois — au lieu d'être réparé en silence, N fois, en aval.
//
// ⚠️ CE QUE LE TICKET DÉCRIVAIT, ET CE QU'IL MANQUAIT. Il visait les appels fiscaux qui passent le
// facteur comme `realDeflator` (où `utils/tax.ts` le répare via `safeDeflator`). Mais le facteur est
// AUSSI le DIVISEUR qui ramène en dollars réels une dizaine de grandeurs de ce bloc — salaires,
// déductions, retraits REER, rentes, pension DB. À 0, ces divisions rendaient `Infinity` AVANT même
// d'atteindre `utils/tax.ts`, dont le repli ne couvre que la bande de paliers. Deux protections
// partielles à deux étages ne font pas une protection.
//
// ⚠️ Les DEUX sens sont testés : un avertissement qui s'affiche toujours est une alarme qu'on
// apprend à ignorer (`QUAND-ON-NE-PEUT-PAS-DETECTER-DE-FACON-FIABLE-ON-AVERTIT-SANS-PRETENDRE`).
import { describe, it, expect } from 'vitest';
import { processDecemberTaxFiling, type DecemberHelpers, type DecemberContext } from '../../services/projection/taxDecember';
import { calculateFiscalReport, getMarginalRate, calculateDividendTax, getDividendGrossUpRate } from '../../utils/tax';

const realHelpers: DecemberHelpers = { calculateFiscalReport, getMarginalRate, calculateDividendTax, getDividendGrossUpRate };
const DECEMBER = 11;
const ZERO_TAX = { revenu: 0, gains: 0, divers: 0, reer: 0, donCredit: 0 };

const baseCtx = (o: Partial<DecemberContext>): DecemberContext => ({
    isRetired: false, age: undefined, ageSpouse: undefined, activeUsersCount: 2,
    incomeRetirementMonthly: 0, accRentesYear: 0, accRetraitsReerYear: 0,
    accCapitalGainsYear: 0, nonReg: 0, baseNonRegRate: 0,
    grossMarcBaseAnnual: 90_000, grossAnnaBaseAnnual: 70_000, simSalaryGrowth: 0, yearsElapsed: 0,
    // Des DÉDUCTIONS non nulles : sans elles, la retenue à la source égale l'impôt et le solde
    // d'avril vaut exactement 0 — le test d'anti-vacuité ci-dessous l'a d'ailleurs attrapé.
    accRrspYear: 18_000, accFhsaYear: 0, smithInterestDeductibleYear: 0,
    optimizeSourceDeductions: false,
    loopYear: 2026, enableMonteCarlo: false, inflationFactor: 1, ramqExempt: true,
    m: 120,
    ...o,
} as unknown as DecemberContext);

const decembre = (o: Partial<DecemberContext>) =>
    processDecemberTaxFiling(DECEMBER, baseCtx(o), realHelpers, ZERO_TAX);

const lignesFacteur = (logs: string[]): string[] => logs.filter((l) => /[Ff]acteur d'inflation/.test(l));

describe('[TAXDEC-INFLATIONFACTOR-AMONT] un facteur corrompu est dit UNE fois, à l\'entrée', () => {
    for (const [nom, valeur] of [['zéro', 0], ['négatif', -1.5], ['NaN', Number.NaN], ['Infinity', Number.POSITIVE_INFINITY]] as const) {
        it(`facteur ${nom} : exactement UNE ligne de journal, et aucun montant non fini`, () => {
            const r = decembre({ inflationFactor: valeur as number });
            expect(lignesFacteur(r.logs), `facteur ${nom}`).toHaveLength(1);
            expect(lignesFacteur(r.logs)[0]).toMatch(/replié sur 1/);
            // Ce qui compte n'est pas le message mais la SORTIE : avant, les divisions par 0
            // faisaient sortir des `Infinity` du bloc entier.
            for (const [cle, v] of Object.entries(r.newTaxCurrentYear)) {
                expect(Number.isFinite(v), `${cle} non fini avec un facteur ${nom}`).toBe(true);
            }
        });
    }

    it('un facteur SAIN ne dit rien (une alarme permanente s\'ignore)', () => {
        for (const f of [1, 1.02, 1.81, 3]) {
            expect(lignesFacteur(decembre({ inflationFactor: f }).logs), `facteur ${f}`).toEqual([]);
        }
    });

    it('le repli vaut EXACTEMENT « année non indexée » — la convention déjà retenue en aval', () => {
        // Le repli n'invente pas un facteur : il traite l'année comme non indexée, comme le
        // `safeDeflator` d'`utils/tax.ts`. La preuve est une ÉGALITÉ, pas une plausibilité.
        const replie = decembre({ inflationFactor: 0 }).newTaxCurrentYear;
        const neutre = decembre({ inflationFactor: 1 }).newTaxCurrentYear;
        expect(replie).toEqual(neutre);
    });

    it('anti-vacuité : le scénario produit bien de l\'impôt (sinon tout ce qui précède est creux)', () => {
        // Sans ça, « aucun montant non fini » et « replié == neutre » seraient satisfaits par un
        // bloc qui ne calcule RIEN (zéro partout est fini, et zéro égale zéro).
        const neutre = decembre({ inflationFactor: 1 }).newTaxCurrentYear;
        expect(Math.abs(neutre.revenu)).toBeGreaterThan(1000);
    });
});
