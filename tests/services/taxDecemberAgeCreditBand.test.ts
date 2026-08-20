// tests/services/taxDecemberAgeCreditBand.test.ts
//
// [FISC-TAXDEC-INCR] (a) — GO Marc A2 (« code le », 2026-08-20). Les bandes incrémentales de
// gains (§2) et de dividendes (§3) de décembre portaient AUCUN ageOpts : l'ÉROSION des crédits
// d'âge (féd ligne 30100 : 15 % du revenu au-dessus du seuil ; QC ligne 361 : 18,75 % du revenu
// FAMILIAL) n'était pas facturée à la bande → sous-imposition d'un retraité 65+ en zone d'érosion.
// Sens NON conservateur, borné (le crédit s'érode à zéro).
//
// Des trois sous-volets du ticket de 2026-06-16, re-tracés sur le code AVANT de coder :
//   (b) « gains+div empilés depuis la même base » : DÉJÀ corrigé ([FISC-STACK-GAINS-DIV]) ;
//   (c) FSS sur revenu moyen : statu quo DOCUMENTÉ in situ. Seul (a) était vivant.

import { describe, it, expect } from 'vitest';
import { processDecemberTaxFiling, type DecemberHelpers } from '../../services/projection/taxDecember';
import { calculateFiscalReport, getMarginalRate, calculateDividendTax, getDividendGrossUpRate } from '../../utils/tax';
import type { DecemberContext } from '../../services/projection/taxDecember';

const realHelpers: DecemberHelpers = { calculateFiscalReport, getMarginalRate, calculateDividendTax, getDividendGrossUpRate };
const DECEMBER = 11;
const ZERO_TAX = { revenu: 0, gains: 0, divers: 0, reer: 0, donCredit: 0 };

const baseCtx = (o: Partial<DecemberContext>): DecemberContext => ({
    isRetired: false, age: undefined, ageSpouse: undefined, activeUsersCount: 2,
    incomeRetirementMonthly: 0, accRentesYear: 0, accRetraitsReerYear: 0,
    accCapitalGainsYear: 0, nonReg: 0, baseNonRegRate: 0,
    grossMarcBaseAnnual: 0, grossAnnaBaseAnnual: 0, simSalaryGrowth: 0, yearsElapsed: 0,
    loopYear: 2026, enableMonteCarlo: false, inflationFactor: 1, ramqExempt: true,
    ...o,
} as unknown as DecemberContext);

const gainsTax = (o: Partial<DecemberContext>): number =>
    processDecemberTaxFiling(DECEMBER, baseCtx(o), realHelpers, ZERO_TAX).newTaxCurrentYear.gains;

describe('[FISC-TAXDEC-INCR] la bande incrémentale porte l\'érosion du crédit d\'âge', () => {
    it('retraité 68 ans en ZONE D\'ÉROSION : la bande de gains coûte PLUS qu\'un sous-65 au même revenu', () => {
        // Profil 1 du plan : 60 k$ de revenu (fédéral : seuil ~45,5 k$ — en pleine érosion),
        // 30 k$ de gains. Le même ménage à 65− ne PORTE aucun crédit à éroder : sa bande est
        // l'ancienne. La différence EST l'effet du lot, et elle doit être strictement positive.
        const common = { isRetired: true, activeUsersCount: 1, incomeRetirementMonthly: 60_000 / 12,
            accCapitalGainsYear: 30_000 } as Partial<DecemberContext>;
        const a68 = gainsTax({ ...common, age: 68 });
        const a60 = gainsTax({ ...common, age: 60 });
        expect(a68).toBeGreaterThan(a60);
        // Ampleur PINNÉE à la valeur MESURÉE (675,5625 $) — jamais déduite de tête : la
        // superposition des deux érosions (féd 15 % ; QC 18,75 % sur revenu FAMILIAL) est bornée
        // par le crédit RESTANT au niveau de revenu de base, et cette borne ne se calcule pas de
        // mémoire (un premier pin « raisonné » à 776,25 était FAUX — classe
        // ECRIRE-UN-CHIFFRE-FISCAL-SANS-LE-MESURER-FABRIQUE-SA-SOURCE). Si ce pin bouge,
        // re-mesurer et expliquer le delta, ne pas l'ajuster au jugé.
        expect(a68 - a60).toBeCloseTo(675.56, 1);
    });

    it('ACTIF < 65 : bit-identique à l\'ancien calcul (opts undefined)', () => {
        // Profil 2 : la bande sans ageOpts == la bande avec mk() qui rend undefined. On le prouve
        // en comparant au calcul manuel SANS opts — zéro delta attendu, au centime.
        const t = gainsTax({ isRetired: false, age: 45, ageSpouse: 44, activeUsersCount: 2,
            grossMarcBaseAnnual: 90_000, grossAnnaBaseAnnual: 70_000, accCapitalGainsYear: 40_000 });
        const perAdultIncome = (90_000 + 70_000) / 2;
        const perAdultGains = (40_000 * 0.5) / 2;
        const manuel = (calculateFiscalReport(perAdultIncome + perAdultGains, 0, 0, 2026, true).totalTax
            - calculateFiscalReport(perAdultIncome, 0, 0, 2026, true).totalTax) * 2;
        expect(t).toBeCloseTo(manuel, 6);
    });

    it('retraité RICHE (crédits déjà érodés à zéro par le revenu de base) : delta ≈ 0', () => {
        // Profil 3 : à 200 k$ de revenu, les crédits d'âge sont morts avant la bande — le lot ne
        // doit RIEN changer pour lui (l'érosion d'un crédit nul est nulle).
        const common = { isRetired: true, activeUsersCount: 1, incomeRetirementMonthly: 200_000 / 12,
            accCapitalGainsYear: 30_000 } as Partial<DecemberContext>;
        expect(gainsTax({ ...common, age: 68 })).toBeCloseTo(gainsTax({ ...common, age: 60 }), 2);
    });

    it('la bande de DIVIDENDES porte aussi l\'érosion (même helper, §3)', () => {
        const common = { isRetired: true, activeUsersCount: 1, incomeRetirementMonthly: 60_000 / 12,
            nonReg: 500_000, baseNonRegRate: 5 } as Partial<DecemberContext>;
        const a68 = gainsTax({ ...common, age: 68 });
        const a60 = gainsTax({ ...common, age: 60 });
        expect(a68).toBeGreaterThan(a60);
    });
});
