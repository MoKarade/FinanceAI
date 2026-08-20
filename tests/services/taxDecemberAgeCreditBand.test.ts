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
        // Ampleur PINNÉE à la valeur MESURÉE (675,5625 $), décomposition VÉRIFIÉE (revue #676 F2) :
        // féd 15 000 × 15 % (érosion) × 15 % (taux de crédit) × (1 − 16,5 % abattement QC) = 281,8125
        // + QC 15 000 × 18,75 % (érosion) × 14 % (taux de crédit) = 393,75. Ni borne ni clamp sur ce
        // profil — les deux érosions y sont strictement linéaires. Deux mécanismes déduits de tête
        // ont été FAUX avant celui-ci (776,25 « raisonné », puis « borné par le crédit restant ») :
        // le pin ET son explication se mesurent (ECRIRE-UN-CHIFFRE-FISCAL-SANS-LE-MESURER).
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

    it('la bande de DIVIDENDES porte aussi l\'érosion (même helper, §3) — delta PINNÉ', () => {
        const common = { isRetired: true, activeUsersCount: 1, incomeRetirementMonthly: 60_000 / 12,
            nonReg: 500_000, baseNonRegRate: 5 } as Partial<DecemberContext>;
        const a68 = gainsTax({ ...common, age: 68 });
        const a60 = gainsTax({ ...common, age: 60 });
        expect(a68).toBeGreaterThan(a60);
        // Pin de MAGNITUDE (revue #676 F4) : sans lui, une régression qui diviserait l'érosion de
        // ce site par deux resterait verte (le §2 avait son pin, pas le §3). MESURÉ.
        expect(a68 - a60).toBeCloseTo(466.14, 1);
    });

    it('COUPLE à âges décalés : 68/60 capte exactement la MOITIÉ de l\'érosion de 68/68 (par-adulte)', () => {
        // Revue #676 (test-writer + code-reviewer) : aucune fixture n'exerçait la boucle par-adulte
        // avec activeUsersCount: 2. Ce cas verrouille l'indexation ages[i], hasSpouse: true, et la
        // non-duplication du crédit d'un seul conjoint. Valeurs MESURÉES.
        const couple = { isRetired: true, activeUsersCount: 2, incomeRetirementMonthly: 120_000 / 12,
            accCapitalGainsYear: 60_000 } as Partial<DecemberContext>;
        const b60 = gainsTax({ ...couple, age: 60, ageSpouse: 60 });
        const b68 = gainsTax({ ...couple, age: 68, ageSpouse: 68 });
        const mix = gainsTax({ ...couple, age: 68, ageSpouse: 60 });
        expect(b68 - b60).toBeCloseTo(563.63, 1);
        expect(mix - b60).toBeCloseTo((b68 - b60) / 2, 6);
        // Symétrie : l'érosion ne dépend pas de QUI est le 65+.
        expect(gainsTax({ ...couple, age: 60, ageSpouse: 68 })).toBeCloseTo(mix, 6);
    });

    it('revenu FAIBLE 65+ : le crédit d\'âge INUTILISÉ abrite la bande — l\'impôt BAISSE (bidirectionnel)', () => {
        // Revue #676 (projection-validator) : le lot ne fait pas qu'augmenter l'impôt. À revenu
        // faible, impôt(base) est déjà clampé à 0 par les crédits, et le crédit restant abrite la
        // bande — exactement comme le calcul « en un coup ». Sur l'ANCIEN code cette bande valait
        // 1 708,61 $ (l'incrément ignorait le crédit) : ce cas est le discriminant de la branche.
        const low = { isRetired: true, activeUsersCount: 1, incomeRetirementMonthly: 10_000 / 12,
            accCapitalGainsYear: 30_000 } as Partial<DecemberContext>;
        expect(gainsTax({ ...low, age: 68 })).toBeCloseTo(0, 2);
        expect(gainsTax({ ...low, age: 60 })).toBeCloseTo(1708.61, 1);
    });

    it('PENSION ADMISSIBLE (revue #676 F1) : le clamp QC 361 de la bande tombe au VRAI montant', () => {
        // Avec eligiblePensionIncome: 0 dans le helper, grossLine361 perdait le montant « revenu
        // de retraite » et le clamp mordait ~16 300 $ de revenu familial trop tôt → bande
        // SOUS-facturée de 317,81 $ sur ce profil (73 ans, DB 80 k$, 30 k$ de gains). Le correctif
        // passe la MÊME pension admissible (nominalisée) aux deux appels : le niveau s'annule, le
        // clamp est au bon endroit. Valeurs MESURÉES ; rouge sur le code d'avant (5 699,44).
        const db = { isRetired: true, activeUsersCount: 1, incomeRetirementMonthly: 80_000 / 12,
            incomeRetirementDbPerUserMonthly: [80_000 / 12, 0], accCapitalGainsYear: 30_000 } as Partial<DecemberContext>;
        expect(gainsTax({ ...db, age: 73 })).toBeCloseTo(6017.25, 1);
        // Sans pension admissible, l'ancien monde : la bande plus basse reste la référence du profil sans DB.
        expect(gainsTax({ ...db, incomeRetirementDbPerUserMonthly: undefined, age: 73 })).toBeCloseTo(5699.44, 1);
    });

    it('ACTIF 72+ à retraits REER : la bande garde pension admissible = 0, alignée sur le calcul §1', () => {
        // 2e relecture #676 (MOYEN 2) : le hissage de eligiblePensionFor faisait porter les
        // retraits REER (admissibles dès 72 ans) à la bande d'un ACTIF, pendant que son calcul
        // d'impôt principal garde eligiblePensionIncome: 0 — améliorer UN seul côté d'une
        // incohérence partagée re-crée la classe CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE
        // (mesuré ±1 878 $/an). Bornée à la branche retraitée ; l'incohérence active est routée
        // ([TAXDEC-ACTIF-72-PENSION-CREDIT]). Ce test échoue si la borne saute (l'attendu est
        // reconstruit avec pension 0 et l'ÂGE porté — le crédit d'âge, lui, reste dû).
        const t = gainsTax({ isRetired: false, age: 72, ageSpouse: undefined, activeUsersCount: 1,
            grossMarcBaseAnnual: 75_000, accRetraitsReerYear: 20_000, accCapitalGainsYear: 30_000 });
        const mk = (fam: number) => ({ age: 72, eligiblePensionIncome: 0, hasSpouse: false, familyIncome: fam });
        const attendu = calculateFiscalReport(75_000 + 15_000, 0, 0, 2026, true, mk(90_000)).totalTax
            - calculateFiscalReport(75_000, 0, 0, 2026, true, mk(75_000)).totalTax;
        expect(t).toBeCloseTo(attendu, 6);
    });
});
