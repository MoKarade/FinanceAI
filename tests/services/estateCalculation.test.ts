import { describe, it, expect } from 'vitest';
import { computeEstateNetWorth, type EstateCalcInputs } from '../../services/projection/estateCalculation';
import type { FiscalReport } from '../../utils/tax';

// Stub fiscal : computeEstateNetWorth ne lit que report.totalTax.
const fiscalStub = (gross: number): FiscalReport =>
    ({ totalTax: Math.max(0, gross) * 0.3 } as FiscalReport);

const base: EstateCalcInputs = {
    liquid: 50000, celi: 100000, celiapp: 0, reer: 200000, nonReg: 80000, nonRegACB: 60000,
    crypto: 10000, cryptoACB: 0, reee: 20000, realEstateEquity: 300000, mortgageBalance: 150000, smithManoeuvreDebt: 0,
    incomeRetirement: 4000, accRentesYear: 0, accRetraitsReerYear: 0,
    grossMarcBaseAnnual: 70000, grossAnnaBaseAnnual: 0, simSalaryGrowth: 2,
    simulationYears: 30, startYear: 2026, currentAge: 35, retirementTargetAge: 65,
    governmentPension: 1200, activeUsersCount: 1, simInflation: 2, enableMonteCarlo: false,
    startingCash: 50000, startingCELI: 100000, startingCELIAPP: 0, startingREER: 200000,
    startingNonReg: 80000, startingCrypto: 10000, startingREEE: 20000,
};

describe('computeEstateNetWorth — robustesse aux entrées (garde TB3)', () => {
    it('calcule un patrimoine fini avec des entrées valides', () => {
        const r = computeEstateNetWorth(base, fiscalStub);
        expect(Number.isFinite(r.finalRawNetWorth)).toBe(true);
        expect(Number.isFinite(r.estateNetWorth)).toBe(true);
        // realEstateEquity (300k) est DÉJÀ net d'hypothèque → plus de soustraction
        // de mortgageBalance (fix double-comptage 2026-05).
        // 50k+100k+0+200k+80k+10k+20k+300k −0(smith) = 760k
        expect(r.finalRawNetWorth).toBe(760000);
        expect(r.estateNetWorth).toBeGreaterThan(0);
    });

    // RE-GAIN-SUCC — disposition réputée au décès : gain latent locatif imposable à 50 %.
    it('RE-GAIN-SUCC : un gain latent locatif augmente l\'impôt successoral (50 % × taux) et réduit estateNetWorth', () => {
        const without = computeEstateNetWorth(base, fiscalStub);
        const withGain = computeEstateNetWorth({ ...base, realEstateLatentGain: 200000 }, fiscalStub);
        // liquidation additionnelle = 0,5 × 200000 = 100000 ; impôt (stub 30 %) = +30000.
        expect(withGain.totalEstateTax - without.totalEstateTax).toBeCloseTo(30000, 0);
        expect(withGain.estateNetWorth).toBeLessThan(without.estateNetWorth);
    });

    it('PV-6 : un liquidDebt (insolvabilité) réduit finalRawNetWorth et estateNetWorth $-pour-$', () => {
        const without = computeEstateNetWorth(base, fiscalStub);
        const withDebt = computeEstateNetWorth({ ...base, liquidDebt: 40000 }, fiscalStub);
        expect(without.finalRawNetWorth - withDebt.finalRawNetWorth).toBeCloseTo(40000, 0);
        expect(withDebt.estateNetWorth).toBeLessThan(without.estateNetWorth);
    });

    it('PV-6 : liquidDebt absent == 0 (non-régression)', () => {
        const absent = computeEstateNetWorth(base, fiscalStub);
        const zero = computeEstateNetWorth({ ...base, liquidDebt: 0 }, fiscalStub);
        expect(zero.estateNetWorth).toBe(absent.estateNetWorth);
    });

    it('RE-GAIN-SUCC : absent == 0 (non-régression stricte)', () => {
        const absent = computeEstateNetWorth(base, fiscalStub);
        const zero = computeEstateNetWorth({ ...base, realEstateLatentGain: 0 }, fiscalStub);
        expect(zero.estateNetWorth).toBe(absent.estateNetWorth);
        expect(zero.totalEstateTax).toBe(absent.totalEstateTax);
    });

    it('TB3 : un liquide NaN ne zérote PAS tout le patrimoine (contribue 0)', () => {
        const r = computeEstateNetWorth({ ...base, liquid: NaN }, fiscalStub);
        expect(Number.isFinite(r.finalRawNetWorth)).toBe(true);
        expect(Number.isFinite(r.estateNetWorth)).toBe(true);
        // liquid NaN → 0 : 760000 - 50000
        expect(r.finalRawNetWorth).toBe(710000);
    });

    it('TB3 : un champ de config undefined (coercé NaN) reste fini', () => {
        const r = computeEstateNetWorth(
            { ...base, governmentPension: undefined as unknown as number, incomeRetirement: NaN },
            fiscalStub,
        );
        expect(Number.isFinite(r.estateNetWorth)).toBe(true);
        expect(Number.isFinite(r.totalEstateTax)).toBe(true);
    });

    it('TB3 : plusieurs soldes NaN simultanés restent finis', () => {
        const r = computeEstateNetWorth(
            { ...base, celi: NaN, reer: NaN, nonReg: NaN, realEstateEquity: NaN },
            fiscalStub,
        );
        expect(Number.isFinite(r.finalRawNetWorth)).toBe(true);
        expect(Number.isFinite(r.estateNetWorth)).toBe(true);
        // realEstateEquity NaN→0 ; seuls liquid(50k)+crypto(10k)+reee(20k) restent.
        // Plus de soustraction d'hypothèque → 80000 (au lieu de l'ancien -70000).
        expect(r.finalRawNetWorth).toBe(80000);
    });

    it('M-2 : impôt successoral cohérent en couple (base et final à la même échelle)', () => {
        // Stub plat 30 %. Liquidation = reer(200k) + gains NonReg imposables(20k×0.5=10k)
        // + crypto imposable(10k×0.5=5k) = 215 000. Revenu retraite final = 4000×12 = 48 000.
        // Symétrique : totalEstateTax = 0.3×(48 000+215 000) − 0.3×48 000 = 0.3×215 000 = 64 500,
        // INDÉPENDANT de activeUsersCount. (Avant le fix, N=2 donnait 71 700 — terme parasite
        // 0.3×24 000 dû à la base divisée par 2.)
        const single = computeEstateNetWorth({ ...base, activeUsersCount: 1 }, fiscalStub);
        const couple = computeEstateNetWorth({ ...base, activeUsersCount: 2 }, fiscalStub);
        expect(single.totalEstateTax).toBeCloseTo(64500, 0);
        expect(couple.totalEstateTax).toBeCloseTo(64500, 0); // même impôt incrémental, peu importe N
    });

    it('M-4 : seul le GAIN crypto est imposable au décès (coût de base déduit)', () => {
        // crypto 10000. ACB=0 → gain 10000 (taxable 5000) ; ACB=10000 → gain 0.
        const allGain = computeEstateNetWorth({ ...base, crypto: 10000, cryptoACB: 0 }, fiscalStub);
        const noGain = computeEstateNetWorth({ ...base, crypto: 10000, cryptoACB: 10000 }, fiscalStub);
        expect(noGain.totalEstateTax).toBeLessThan(allGain.totalEstateTax);
        // écart = impôt (stub 0.3) sur la portion gain imposable : 0.3 × (10000 × 0.5) = 1500.
        expect(allGain.totalEstateTax - noGain.totalEstateTax).toBeCloseTo(1500, 0);
    });

    it('startNW fini même si soldes initiaux NaN', () => {
        const r = computeEstateNetWorth(
            { ...base, startingCash: NaN, startingREER: NaN },
            fiscalStub,
        );
        expect(Number.isFinite(r.startNW)).toBe(true);
        // 0 + 100k + 0 + 0 + 80k + 10k + 20k
        expect(r.startNW).toBe(210000);
    });
});

describe('computeEstateNetWorth — FA-5 (audit 2026-06-09) : NPV des rentes NON multipliée par N', () => {
    // `governmentPension` est déjà FAMILIAL dans tout le moteur (retirementIncome ne multiplie
    // pas par N). L'ancien code multipliait rrqExpected/psvExpected par activeUsersCount →
    // NPV ~doublée pour un couple → estateNetWorth gonflé de dizaines de k$.
    // Extraction : estateNetWorth = finalRawNetWorth − totalEstateTax + 0,7×(rrqNPV+psvNPV)
    //   → (rrqNPV+psvNPV) = (estateNetWorth − finalRawNetWorth + totalEstateTax) / 0,7.
    const extractNPV = (r: ReturnType<typeof computeEstateNetWorth>): number =>
        (r.estateNetWorth - r.finalRawNetWorth + r.totalEstateTax) / 0.7;

    it('RÉGRESSION : couple et solo au même governmentPension familial → même (rrqNPV+psvNPV)', () => {
        const solo = computeEstateNetWorth({ ...base, activeUsersCount: 1 }, fiscalStub);
        const couple = computeEstateNetWorth({ ...base, activeUsersCount: 2 }, fiscalStub);
        expect(extractNPV(couple)).toBeCloseTo(extractNPV(solo), 6);
        // Le stub fiscal est plat → totalEstateTax identique (M-2) → le patrimoine successoral
        // COMPLET doit être identique solo vs couple. Avant FA-5 : couple = solo + 0,7×NPV en trop.
        expect(couple.estateNetWorth).toBeCloseTo(solo.estateNetWorth, 6);
    });

    it('NPV PINNÉE à la formule FAMILIALE (sans ×N) : pension×12×infl^années×facteur d\'annuité', () => {
        // base : finalAge = 35+30 = 65 → branche SANS escompte pré-65 ; 95−65 = 30 ans restants.
        const npvFactor = (1 - Math.pow(1.02, -30)) / 0.02;
        // [FISC-ESTATE-PENSION-NPV] ×12 : la pension mensuelle (1200) est ANNUALISÉE avant le facteur
        // d'annuité ANNUEL (avant le fix, le ×12 manquait → NPV ÷12, ~49 k$ au lieu de ~584 k$ brut).
        const expected = 1200 * 12 * Math.pow(1 + 2 / 100, 30) * npvFactor; // (0,65+0,35) = 1 → familial
        const couple = computeEstateNetWorth({ ...base, activeUsersCount: 2 }, fiscalStub);
        expect(extractNPV(couple)).toBeCloseTo(expected, 4);
        // Contre-preuve : l'ancienne valeur ×2 (le double-comptage ×N) est exclue.
        expect(extractNPV(couple)).toBeLessThan(expected * 2 - 1000);
    });

    it('équivalence solo/couple maintenue AVANT 65 ans (branche escomptée 1,02^-(65-âge))', () => {
        const cfg = { ...base, simulationYears: 20 }; // finalAge 55 < 65 → escompte sur 10 ans
        const solo = computeEstateNetWorth({ ...cfg, activeUsersCount: 1 }, fiscalStub);
        const couple = computeEstateNetWorth({ ...cfg, activeUsersCount: 2 }, fiscalStub);
        expect(extractNPV(couple)).toBeCloseTo(extractNPV(solo), 6);
        expect(extractNPV(couple)).toBeGreaterThan(0);
    });

    it('governmentPension = 0 → composante NPV nulle, peu importe N', () => {
        const solo = computeEstateNetWorth({ ...base, governmentPension: 0, activeUsersCount: 1 }, fiscalStub);
        const couple = computeEstateNetWorth({ ...base, governmentPension: 0, activeUsersCount: 2 }, fiscalStub);
        expect(extractNPV(solo)).toBeCloseTo(0, 6);
        expect(extractNPV(couple)).toBeCloseTo(0, 6);
    });

});

describe('computeEstateNetWorth — FA-8 : estimés précis par rente priment sur le split 65/35', () => {
    const extractNPV = (r: ReturnType<typeof computeEstateNetWorth>): number =>
        (r.estateNetWorth - r.finalRawNetWorth + r.totalEstateTax) / 0.7;
    // base : finalAge 35+30 = 65 → branche SANS escompte pré-65 ; 95−65 = 30 ans restants.
    const npvFactor = (1 - Math.pow(1.02, -30)) / 0.02;
    const inflPow = Math.pow(1 + 2 / 100, 30);
    // [FISC-ESTATE-PENSION-NPV] NPV attendue à partir d'un montant MENSUEL familial : ANNUALISER (×12)
    // avant le facteur d'annuité annuel. Avant le fix, le ×12 manquait (NPV ~12× sous-évaluée).
    const expectedNPV = (monthlyFamily: number): number => monthlyFamily * 12 * inflPow * npvFactor;

    it('estimés fournis (solo) → NPV basée sur RRQ+PSV estimés, PAS sur le split 65/35 de l\'agrégé', () => {
        // estimés per-personne 800+600 = 1400/mois familial (solo) ≠ split de governmentPension (1200).
        const r = computeEstateNetWorth({ ...base, rrqEstimateMonthly: 800, psvEstimateMonthly: 600, activeUsersCount: 1 }, fiscalStub);
        expect(extractNPV(r)).toBeCloseTo(expectedNPV(800 + 600), 4);
        // Contre-preuve : différent du repli agrégé (1200) — les estimés ont bien primé.
        const fallback = computeEstateNetWorth({ ...base, activeUsersCount: 1 }, fiscalStub);
        expect(extractNPV(r)).not.toBeCloseTo(extractNPV(fallback), 0);
    });

    it('estimés PER-PERSONNE → ×activeUsersCount (comme retirementIncome) ; le repli AGRÉGÉ reste SANS ×N (garde FA-5)', () => {
        // couple : estimés (800+600)×2 = 2800/mois familial.
        const couple = computeEstateNetWorth({ ...base, rrqEstimateMonthly: 800, psvEstimateMonthly: 600, activeUsersCount: 2 }, fiscalStub);
        expect(extractNPV(couple)).toBeCloseTo(expectedNPV((800 + 600) * 2), 4);
        // Le repli agrégé (sans estimé) ne prend toujours PAS de ×N : couple == solo (FA-5 non régressé).
        const fallbackCouple = computeEstateNetWorth({ ...base, activeUsersCount: 2 }, fiscalStub);
        expect(extractNPV(fallbackCouple)).toBeCloseTo(expectedNPV(1200), 4);
    });

    it('estimés absents → repli sur le split 65/35 (non-régression stricte)', () => {
        const withUndef = computeEstateNetWorth({ ...base, rrqEstimateMonthly: undefined, psvEstimateMonthly: undefined }, fiscalStub);
        const baseline = computeEstateNetWorth(base, fiscalStub);
        expect(withUndef.estateNetWorth).toBe(baseline.estateNetWorth);
    });

    it('un seul estimé fourni → indépendance par rente : l\'estimé pour la sienne, le split 65/35 pour l\'autre', () => {
        // rrqEstimate 900 fourni, psv absent → psv = 0,35 × 1200 = 420. Σ = 1320.
        const r = computeEstateNetWorth({ ...base, rrqEstimateMonthly: 900, activeUsersCount: 1 }, fiscalStub);
        expect(extractNPV(r)).toBeCloseTo(expectedNPV(900 + 1200 * 0.35), 4);
    });

    it('garde fin() : un rrqEstimateMonthly NaN ne propage pas de NaN (estateNetWorth reste fini)', () => {
        // [ENG-ESTATE-ESTIMATE-FIN] le NaN est neutralisé à la SOURCE (`fin()` avant `Math.max`), plus
        // seulement au `fin()` de sortie — un estimé NaN ne contribue que 0 à SA rente.
        const r = computeEstateNetWorth({ ...base, rrqEstimateMonthly: NaN, activeUsersCount: 1 }, fiscalStub);
        expect(Number.isFinite(r.estateNetWorth)).toBe(true);
        expect(Number.isFinite(r.totalEstateTax)).toBe(true);
    });

    it('[ENG-ESTATE-ESTIMATE-FIN] DISCRIMINANT : un rrq NaN dégrade GRACIEUSEMENT (== rrq 0), sans zéroter tout l\'estate', () => {
        // Avant le fix : NaN rrq → NPV NaN → estateNetWorth NaN → le fin() de SORTIE zérotait TOUT l'estate
        // (même un finalRawNetWorth positif → 0). Avec fin() à la source : rrq NaN contribue 0, psv calcule.
        const withNaN = computeEstateNetWorth({ ...base, rrqEstimateMonthly: NaN, psvEstimateMonthly: 600, activeUsersCount: 1 }, fiscalStub);
        const withZero = computeEstateNetWorth({ ...base, rrqEstimateMonthly: 0, psvEstimateMonthly: 600, activeUsersCount: 1 }, fiscalStub);
        // Le NaN se comporte EXACTEMENT comme 0 (et NON comme « tout l'estate à 0 », qui était l'ancien bug).
        expect(withNaN.estateNetWorth).toBeCloseTo(withZero.estateNetWorth, 4);
        // L'estate n'est PAS zéroté : la composante psv positive S'AJOUTE au patrimoine successoral.
        expect(withNaN.estateNetWorth).toBeGreaterThan(withNaN.finalRawNetWorth - withNaN.totalEstateTax);
    });

    it('RRQ-PSV-MIN : un estimé NÉGATIF est clampé à 0 (pas de rente négative), == estimé 0 explicite', () => {
        // rrq -500 → max(0,-500)=0 ; psv absent → repli 0,35×1200 = 420. Σ = 420.
        const neg = computeEstateNetWorth({ ...base, rrqEstimateMonthly: -500, activeUsersCount: 1 }, fiscalStub);
        expect(extractNPV(neg)).toBeCloseTo(expectedNPV(0 + 1200 * 0.35), 4);
        const zero = computeEstateNetWorth({ ...base, rrqEstimateMonthly: 0, activeUsersCount: 1 }, fiscalStub);
        expect(extractNPV(zero)).toBeCloseTo(expectedNPV(0 + 1200 * 0.35), 4); // ancré en absolu
        expect(extractNPV(neg)).toBeCloseTo(extractNPV(zero), 6);
    });
});

describe('computeEstateNetWorth — [FISC-ESTATE-PENSION-NPV] annualisation des rentes (×12)', () => {
    const extractNPV = (r: ReturnType<typeof computeEstateNetWorth>): number =>
        (r.estateNetWorth - r.finalRawNetWorth + r.totalEstateTax) / 0.7;

    it('la NPV des rentes publiques est ANNUELLE (×12), pas mensuelle — discrimine le bug d\'unité', () => {
        // base : 1200 $/mois familial, finalAge 65 (sans escompte pré-65), 30 ans restants, infl 2 %.
        const npvFactor = (1 - Math.pow(1.02, -30)) / 0.02;
        const inflPow = Math.pow(1 + 2 / 100, 30);
        const r = computeEstateNetWorth(base, fiscalStub);
        const annualNPV = 1200 * 12 * inflPow * npvFactor;   // correct
        const monthlyNPV = 1200 * inflPow * npvFactor;        // ANCIENNE valeur buggée (÷12)
        expect(extractNPV(r)).toBeCloseTo(annualNPV, 4);
        // Discriminant fort : la NPV correcte vaut ~12× l'ancienne → un retour au bug échouerait ici.
        expect(extractNPV(r)).toBeGreaterThan(monthlyNPV * 11);
        // Ordre de grandeur : une rente viagère de 1200 $/mois vaut des CENTAINES de k$ (pas des dizaines).
        expect(extractNPV(r)).toBeGreaterThan(400_000);
    });
});

/**
 * [ESTATE-NPV-07] La VAN des rentes publiques est ajoutée NETTE d'impôt.
 *
 * ⚠️ PIÈGE DE CE FICHIER, à connaître avant d'ajouter un test ici : le `fiscalStub` partagé est
 * `gross * 0.3`, un taux PLAT. Avec lui, l'impôt incrémental sur les rentes vaut exactement 30 %
 * quel que soit le revenu — donc le nouveau facteur calculé rend précisément 0,7, et le correctif
 * est INVISIBLE. Un stub qui reproduit la forme du défaut ne peut pas le détecter. Ces tests
 * utilisent donc un stub PROGRESSIF.
 */
describe('[ESTATE-NPV-07] VAN des rentes nette d’impôt — facteur CALCULÉ, plus un 0,7 plat', () => {
    // Barème progressif minimal : 0 % sous 20 k$, 40 % au-delà. Suffit à distinguer un facteur
    // contextuel d'un facteur plat, sans dépendre du vrai barème (qui bouge chaque année).
    const stubProgressif = (gross: number): FiscalReport =>
        ({ totalTax: Math.max(0, gross - 20000) * 0.4 } as FiscalReport);
    const sansImpot = (): FiscalReport => ({ totalTax: 0 } as FiscalReport);

    const retraite = { ...base, currentAge: 60, retirementTargetAge: 65, incomeRetirement: 0 };

    /**
     * Le facteur net appliqué à la VAN, DÉRIVÉ des trois champs publiés :
     *   estateNetWorth = finalRawNetWorth − totalEstateTax + VAN × facteur
     * On isole `VAN × facteur`, puis on divise par la VAN BRUTE obtenue avec un stub sans impôt.
     * C'est la grandeur que le lot change — l'asserter directement évite de comparer des
     * patrimoines dont mille autres termes bougent.
     */
    const facteurNet = (inputs: EstateCalcInputs): number => {
        const avec = computeEstateNetWorth(inputs, stubProgressif);
        const brut = computeEstateNetWorth(inputs, sansImpot);
        const vanNette = avec.estateNetWorth - avec.finalRawNetWorth + avec.totalEstateTax;
        const vanBrute = brut.estateNetWorth - brut.finalRawNetWorth + brut.totalEstateTax;
        expect(vanBrute, 'VAN brute nulle → le test ne mesurerait rien').toBeGreaterThan(1000);
        return vanNette / vanBrute;
    };

    it('le facteur RÉPOND au barème — un facteur plat n’y répondrait pas du tout', () => {
        // ⚠️ Mon premier jet divisait la VAN nette par une VAN « brute » calculée avec un stub sans
        // impôt. VACUEUX : avec un facteur CONSTANT, numérateur et dénominateur sont multipliés par
        // la même chose et le ratio vaut 1 quoi qu'il arrive. Perturbation à l'appui — remettre
        // `0,7` ne faisait pas rougir ce test. On compare donc la VAN nette entre DEUX barèmes.
        const aise = { ...retraite, incomeRetirement: 8000 };
        const vanNette = (fn: (g: number) => FiscalReport): number => {
            const r = computeEstateNetWorth(aise, fn);
            return r.estateNetWorth - r.finalRawNetWorth + r.totalEstateTax;
        };
        const sans = vanNette(sansImpot);
        const avec = vanNette(stubProgressif);
        expect(sans, 'VAN nulle → le test ne mesurerait rien').toBeGreaterThan(1000);
        // Sous un barème qui impose, la VAN nette DOIT être plus basse. Avec `× 0,7` en dur, les
        // deux valent 0,7 × VAN — strictement égales.
        expect(avec).toBeLessThan(sans * 0.95);
    });

    it('le facteur DÉCROÎT quand le revenu monte — ce qu’un facteur plat ne peut pas faire', () => {
        const fModeste = facteurNet({ ...retraite, incomeRetirement: 0 });
        const fAise = facteurNet({ ...retraite, incomeRetirement: 8000 });
        expect(fAise).toBeLessThan(fModeste);
        // Et il descend VRAIMENT (le stub prélève 40 % au-delà du seuil), pas d'un epsilon.
        expect(fModeste - fAise).toBeGreaterThan(0.2);
    });

    it('le facteur reste BORNÉ à [0, 1] — un barème ne confisque ni ne rembourse la rente', () => {
        const confiscatoire = (gross: number): FiscalReport => ({ totalTax: Math.max(0, gross) * 2 } as FiscalReport);
        // ⚠️ `incomeRetirement` NON NUL, sinon la soustraction des rentes est clampée à 0, l'impôt
        // incrémental vaut 0 et le clamp n'est jamais sollicité — mon premier jet était vacueux
        // pour cette raison exacte (perturbation : retirer le clamp ne faisait rien rougir).
        const avec = computeEstateNetWorth({ ...retraite, incomeRetirement: 8000 }, confiscatoire);
        const vanNette = avec.estateNetWorth - avec.finalRawNetWorth + avec.totalEstateTax;
        // Clampé à 0 : la VAN n'ajoute rien, mais elle ne doit JAMAIS soustraire du patrimoine.
        expect(vanNette).toBeGreaterThanOrEqual(0);
    });
});
