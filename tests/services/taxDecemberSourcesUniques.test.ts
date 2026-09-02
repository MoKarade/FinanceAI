// tests/services/taxDecemberSourcesUniques.test.ts
//
// [TAXDEC-TROIS-FABRIQUES-AGEOPTS] — deux consolidations dans `taxDecember.ts`, aucune n'ajoute de
// comportement : elles suppriment des COPIES qui pouvaient diverger.
//
// (1) TROIS fabriques d'`AgeCreditOptions` (branche active, branche retraitée, helper de bande),
//     de forme identique et aux gardes textuellement différentes → une seule, garde stricte `>= 65`.
// (2) DEUX validations quasi-jumelles de `accRetraitsReerYearByUser`, sur la MÊME entrée, avec des
//     règles subtilement différentes → une seule autorité.
//
// ⚠️ Ce fichier ne prouve pas « ça marche » (les 141 tests du module s'en chargent) : il verrouille
// ce qui rendait la duplication dangereuse, c'est-à-dire les entrées SALES sur lesquelles les deux
// copies rendaient des verdicts opposés.
import { describe, it, expect, vi } from 'vitest';
import {
    processDecemberTaxFiling, type DecemberContext, type DecemberHelpers,
} from '../../services/projection/taxDecember';
import { calculateFiscalReport, getMarginalRate, calculateDividendTax, getDividendGrossUpRate,
    type AgeCreditOptions, type FiscalReport } from '../../utils/tax';

const DECEMBRE = 11;
const ZERO = { revenu: 0, gains: 0, divers: 0, reer: 0, donCredit: 0 };
const TAUX = 0.3;

/** Espion : capture l'assiette de chaque appel fiscal et ses options de crédits. */
const espion = () => {
    const calls: Array<{ gross: number; opts?: AgeCreditOptions }> = [];
    const helpers: DecemberHelpers = {
        calculateFiscalReport: ((g: number, d: number, _f: number, _y: number, _s: boolean, o?: AgeCreditOptions) => {
            calls.push({ gross: g, opts: o });
            return { totalTax: Math.max(0, g - (d ?? 0)) * TAUX } as unknown as FiscalReport;
        }) as DecemberHelpers['calculateFiscalReport'],
        getMarginalRate: () => 0.4,
        calculateDividendTax: (d: number, r: number) => d * r,
        getDividendGrossUpRate: () => 1.38,
    };
    return { helpers, calls };
};

const base = (o: Partial<DecemberContext> = {}): DecemberContext => ({
    m: 24, loopYear: 2026, isRetired: false, enableMonteCarlo: false, yearsElapsed: 0,
    inflationFactor: 1, activeUsersCount: 2,
    grossMarcBaseAnnual: 50000, grossAnnaBaseAnnual: 50000, simSalaryGrowth: 0,
    optimizeSourceDeductions: undefined, incomeRetirementMonthly: 0,
    nonReg: 0, baseNonRegRate: 0, accRrspYear: 0, accFhsaYear: 0, smithInterestDeductibleYear: 0,
    accRentesYear: 0, accRetraitsReerYear: 30000, accCapitalGainsYear: 0,
    age: 73, ageSpouse: 73, childrenCount: 0, ramqExempt: true,
    ...o,
});

/** Assiettes imposables per-conjoint vues par le calcul principal, dans l'ordre des appels. */
const assiettes = (ctx: DecemberContext): number[] => {
    const { helpers, calls } = espion();
    processDecemberTaxFiling(DECEMBRE, ctx, helpers, { ...ZERO });
    return calls.map(c => c.gross);
};

describe('[TAXDEC-TROIS-FABRIQUES-AGEOPTS] (2) une seule autorité sur l\'attribution des retraits REER', () => {
    it('attribution VALIDE : chacun est imposé sur SES retraits, pas sur la moitié', () => {
        // Anti-vacuité de tout ce qui suit : sans ce cas, on ne saurait pas que l'attribution
        // per-conjoint est seulement lue.
        const a = assiettes(base({ accRetraitsReerYearByUser: [25000, 5000] }));
        expect(a, 'Marc : 50 000 salaire + 25 000 retraits').toContain(75000);
        expect(a, 'Anna : 50 000 salaire + 5 000 retraits').toContain(55000);
    });

    it('SOLO : le gate `activeUsersCount > 1` d\'une des copies était INERTE — mesuré, pas supposé', () => {
        // ⚠️ Divergence la plus visible entre les deux copies d'avant : l'une exigeait
        // `activeUsersCount > 1` et refusait donc l'attribution d'un déclarant seul, l'autre
        // l'acceptait. Elle est INOBSERVABLE, et pour une raison arithmétique : chez un solo, le
        // repli `total / 1` vaut exactement l'unique part, et si le tableau ne reconstitue PAS le
        // total, le contrôle de somme le rejette de toute façon. Ce test le PROUVE (les deux
        // chemins rendent la même chose) au lieu de l'affirmer — c'est aussi pourquoi la
        // divergence a pu vivre si longtemps : rien ne pouvait la faire rougir.
        const avecTableau = assiettes(base({ activeUsersCount: 1, grossAnnaBaseAnnual: 0,
            accRetraitsReerYearByUser: [30000] }));
        const sansTableau = assiettes(base({ activeUsersCount: 1, grossAnnaBaseAnnual: 0,
            accRetraitsReerYearByUser: undefined }));
        expect(avecTableau).toEqual(sansTableau);
        expect(avecTableau, 'un seul déclarant : 50 000 + 30 000').toContain(80000);
    });

    it('somme INCOHÉRENTE avec le total : repli sur le split égal, jamais une assiette sous-comptée', () => {
        const a = assiettes(base({ accRetraitsReerYearByUser: [1000, 1000] })); // Σ = 2 000 ≠ 30 000
        expect(a, 'repli : 50 000 + 15 000 chacun').toContain(65000);
        expect(a).not.toContain(51000);
    });

    it('ENTRÉES SALES : un total NON FINI ou NÉGATIF ne produit jamais d\'assiette non finie ni négative', () => {
        // Les deux copies d'avant se répliaient différemment ici — l'une sur `NaN / n`, l'autre sur
        // 0 ; l'une gardait des parts négatives, l'autre non. Les résultats FINAUX coïncidaient par
        // ABSORPTION en aval, pas par conception : c'est exactement la forme d'une bombe à retardement.
        for (const [total, tableau] of [
            [Number.NaN, undefined], [Number.NaN, [10000, 20000]], [Number.NaN, [-10000, -20000]],
            [Number.POSITIVE_INFINITY, undefined], [Number.POSITIVE_INFINITY, [10000, 20000]],
            [-50000, undefined], [-50000, [10000, 20000]], [-50000, [-10000, -20000]],
        ] as Array<[number, number[] | undefined]>) {
            const a = assiettes(base({ accRetraitsReerYear: total, accRetraitsReerYearByUser: tableau }));
            for (const g of a) {
                expect(Number.isFinite(g), `assiette non finie pour total=${total}`).toBe(true);
                expect(g, `assiette négative pour total=${total}`).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it('une part NÉGATIVE dans une attribution par ailleurs COHÉRENTE ne réduit l\'assiette de personne', () => {
        // Le seul chemin qui atteint le clamp `Math.max(0, part)` : la somme reconstitue bien le
        // total (0 = −10 000 + 10 000), donc l'attribution est ACCEPTÉE, et sans clamp le premier
        // déclarant verrait son assiette imposable amputée de 10 000 $ — un revenu qu'il n'a pas
        // gagné, retiré de son impôt. Une des deux copies d'avant clampait, l'autre non.
        // ⚠️ La borne « assiette ≥ 0 » du test précédent ne suffit PAS à l'attraper (50 000 − 10 000
        // reste positif) : il faut asserter la VALEUR, pas le signe. Vérifié par perturbation.
        const a = assiettes(base({ accRetraitsReerYear: 0, accRetraitsReerYearByUser: [-10000, 10000] }));
        expect(a, 'Marc garde son salaire entier : la part négative est ramenée à 0').toContain(50000);
        expect(a, 'et surtout PAS 50 000 − 10 000').not.toContain(40000);
    });
});

describe('[TAXDEC-TROIS-FABRIQUES-AGEOPTS] (1) une seule fabrique d\'options de crédits', () => {
    const optionsDe = (ctx: DecemberContext): Array<AgeCreditOptions | undefined> => {
        const { helpers, calls } = espion();
        processDecemberTaxFiling(DECEMBRE, ctx, helpers, { ...ZERO });
        return calls.map(c => c.opts);
    };

    it('`hasSpouse` suit le nombre de déclarants — décidé à UN seul endroit', () => {
        // C'est le champ qui a déjà coûté ~305 $/tête de sur-crédit quand il manquait d'un côté :
        // il est désormais impossible qu'un site le calcule autrement qu'un autre.
        const couple = optionsDe(base({ activeUsersCount: 2 })).filter(Boolean);
        const solo = optionsDe(base({ activeUsersCount: 1, grossAnnaBaseAnnual: 0, ageSpouse: undefined })).filter(Boolean);
        expect(couple.length, 'un couple de 73 ans doit recevoir des options').toBeGreaterThan(0);
        expect(solo.length, 'un déclarant seul de 73 ans aussi').toBeGreaterThan(0);
        for (const o of couple) expect(o!.hasSpouse).toBe(true);
        for (const o of solo) expect(o!.hasSpouse).toBe(false);
    });

    it('la garde d\'âge est UNIFORME : aucune option sous 65 ans, sur AUCUN des trois sites', () => {
        // Avant, deux fabriques gataient à 65 et la troisième non — équivalent en sortie (tous les
        // crédits sont gatés `>= 65` à l'intérieur de `calculateAgeAndPensionCredits`), mais c'est
        // l'uniformité qui empêche la prochaine divergence. Les trois sites sont exercés ici :
        // calcul principal, bande des gains, bande des dividendes.
        const jeune = optionsDe(base({ age: 60, ageSpouse: 60, accCapitalGainsYear: 20000, nonReg: 200000, baseNonRegRate: 5 }));
        expect(jeune.some(o => o !== undefined), 'aucune option sous 65 ans').toBe(false);
        // Anti-vacuité : à 65 ans, la MÊME fixture en produit — sinon le test passerait sur un
        // moteur qui n'émettrait plus d'options du tout.
        const age = optionsDe(base({ age: 65, ageSpouse: 65, accCapitalGainsYear: 20000, nonReg: 200000, baseNonRegRate: 5 }));
        expect(age.some(o => o !== undefined)).toBe(true);
    });
});
