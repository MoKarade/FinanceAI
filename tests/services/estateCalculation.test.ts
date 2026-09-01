import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeEstateNetWorth, type EstateCalcInputs } from '../../services/projection/estateCalculation';
import type { FiscalReport } from '../../utils/tax';
import { stripComments, partDeCodeRestante } from '../../utils/stripComments';

// Stub fiscal : computeEstateNetWorth ne lit que report.totalTax.
const fiscalStub = (gross: number): FiscalReport =>
    ({ totalTax: Math.max(0, gross) * 0.3 } as FiscalReport);

// Barème nul — sert de RÉFÉRENCE pour isoler la VAN BRUTE (aucun impôt, donc facteur net = 1).
const sansImpotStub = (): FiscalReport => ({ totalTax: 0 } as FiscalReport);

/**
 * VAN des rentes CONTENUE dans un résultat :
 *   estateNetWorth = finalRawNetWorth − totalEstateTax + (VAN × facteurNet)
 * → `VAN × facteurNet` s'isole exactement par les trois champs publiés.
 */
const vanNette = (r: ReturnType<typeof computeEstateNetWorth>): number =>
    r.estateNetWorth - r.finalRawNetWorth + r.totalEstateTax;

/**
 * VAN BRUTE (avant le facteur net d'impôt), DÉRIVÉE en relançant le même calcul sous un barème nul.
 *
 * ⚠️ Ces helpers divisaient par un `0,7` CODÉ EN DUR, hérité du facteur plat supprimé par
 * `[ESTATE-NPV-07]`. Ils ne passaient plus que par coïncidence : `fiscalStub` est plat à 30 %, donc
 * le facteur CALCULÉ retombait sur 0,7 — mais changer `governmentPension` de 1 200 à 5 000 les
 * faisait rougir avec un message parlant d'annualisation, diagnostic totalement trompeur
 * (classe `UN-TEST-QUI-ECHOUE-N-A-PAS-FORCEMENT-RAISON`). Dériver la VAN brute d'un SECOND appel
 * supprime la constante : aucune valeur du facteur n'est supposée.
 */
const extractNPVBrute = (inputs: EstateCalcInputs): number => vanNette(computeEstateNetWorth(inputs, sansImpotStub));

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
    // Extraction : estateNetWorth = finalRawNetWorth − totalEstateTax + facteurNet×(rrqNPV+psvNPV).
    // Le facteur n'est PAS supposé (plus de `/0,7` en dur) : on relance sous un barème nul.
    const extractNPV = extractNPVBrute;

    it('RÉGRESSION : couple et solo au même governmentPension familial → même (rrqNPV+psvNPV)', () => {
        const soloIn = { ...base, activeUsersCount: 1 };
        const coupleIn = { ...base, activeUsersCount: 2 };
        expect(extractNPV(coupleIn)).toBeCloseTo(extractNPV(soloIn), 6);
        // Le stub fiscal est plat → totalEstateTax identique (M-2) → le patrimoine successoral
        // COMPLET doit être identique solo vs couple. Avant FA-5 : couple = solo + 0,7×NPV en trop.
        expect(computeEstateNetWorth(coupleIn, fiscalStub).estateNetWorth)
            .toBeCloseTo(computeEstateNetWorth(soloIn, fiscalStub).estateNetWorth, 6);
    });

    it('NPV PINNÉE à la formule FAMILIALE (sans ×N) : pension×12×infl^années×facteur d\'annuité', () => {
        // base : finalAge = 35+30 = 65 → branche SANS escompte pré-65 ; 95−65 = 30 ans restants.
        const npvFactor = (1 - Math.pow(1.02, -30)) / 0.02;
        // [FISC-ESTATE-PENSION-NPV] ×12 : la pension mensuelle (1200) est ANNUALISÉE avant le facteur
        // d'annuité ANNUEL (avant le fix, le ×12 manquait → NPV ÷12, ~49 k$ au lieu de ~584 k$ brut).
        const expected = 1200 * 12 * Math.pow(1 + 2 / 100, 30) * npvFactor; // (0,65+0,35) = 1 → familial
        const coupleIn = { ...base, activeUsersCount: 2 };
        expect(extractNPV(coupleIn)).toBeCloseTo(expected, 4);
        // Contre-preuve : l'ancienne valeur ×2 (le double-comptage ×N) est exclue.
        expect(extractNPV(coupleIn)).toBeLessThan(expected * 2 - 1000);
    });

    it('équivalence solo/couple maintenue AVANT 65 ans (branche escomptée 1,02^-(65-âge))', () => {
        const cfg = { ...base, simulationYears: 20 }; // finalAge 55 < 65 → escompte sur 10 ans
        const soloIn = { ...cfg, activeUsersCount: 1 };
        const coupleIn = { ...cfg, activeUsersCount: 2 };
        expect(extractNPV(coupleIn)).toBeCloseTo(extractNPV(soloIn), 6);
        expect(extractNPV(coupleIn)).toBeGreaterThan(0);
    });

    it('governmentPension = 0 → composante NPV nulle, peu importe N', () => {
        expect(extractNPV({ ...base, governmentPension: 0, activeUsersCount: 1 })).toBeCloseTo(0, 6);
        expect(extractNPV({ ...base, governmentPension: 0, activeUsersCount: 2 })).toBeCloseTo(0, 6);
    });

});

describe('computeEstateNetWorth — FA-8 : estimés précis par rente priment sur le split 65/35', () => {
    const extractNPV = extractNPVBrute;
    // base : finalAge 35+30 = 65 → branche SANS escompte pré-65 ; 95−65 = 30 ans restants.
    const npvFactor = (1 - Math.pow(1.02, -30)) / 0.02;
    const inflPow = Math.pow(1 + 2 / 100, 30);
    // [FISC-ESTATE-PENSION-NPV] NPV attendue à partir d'un montant MENSUEL familial : ANNUALISER (×12)
    // avant le facteur d'annuité annuel. Avant le fix, le ×12 manquait (NPV ~12× sous-évaluée).
    const expectedNPV = (monthlyFamily: number): number => monthlyFamily * 12 * inflPow * npvFactor;

    it('estimés fournis (solo) → NPV basée sur RRQ+PSV estimés, PAS sur le split 65/35 de l\'agrégé', () => {
        // estimés per-personne 800+600 = 1400/mois familial (solo) ≠ split de governmentPension (1200).
        const avecEstimes = { ...base, rrqEstimateMonthly: 800, psvEstimateMonthly: 600, activeUsersCount: 1 };
        expect(extractNPV(avecEstimes)).toBeCloseTo(expectedNPV(800 + 600), 4);
        // Contre-preuve : différent du repli agrégé (1200) — les estimés ont bien primé.
        expect(extractNPV(avecEstimes)).not.toBeCloseTo(extractNPV({ ...base, activeUsersCount: 1 }), 0);
    });

    it('estimés PER-PERSONNE → ×activeUsersCount (comme retirementIncome) ; le repli AGRÉGÉ reste SANS ×N (garde FA-5)', () => {
        // couple : estimés (800+600)×2 = 2800/mois familial.
        expect(extractNPV({ ...base, rrqEstimateMonthly: 800, psvEstimateMonthly: 600, activeUsersCount: 2 }))
            .toBeCloseTo(expectedNPV((800 + 600) * 2), 4);
        // Le repli agrégé (sans estimé) ne prend toujours PAS de ×N : couple == solo (FA-5 non régressé).
        expect(extractNPV({ ...base, activeUsersCount: 2 })).toBeCloseTo(expectedNPV(1200), 4);
    });

    it('estimés absents → repli sur le split 65/35 (non-régression stricte)', () => {
        const withUndef = computeEstateNetWorth({ ...base, rrqEstimateMonthly: undefined, psvEstimateMonthly: undefined }, fiscalStub);
        const baseline = computeEstateNetWorth(base, fiscalStub);
        expect(withUndef.estateNetWorth).toBe(baseline.estateNetWorth);
    });

    it('un seul estimé fourni → indépendance par rente : l\'estimé pour la sienne, le split 65/35 pour l\'autre', () => {
        // rrqEstimate 900 fourni, psv absent → psv = 0,35 × 1200 = 420. Σ = 1320.
        expect(extractNPV({ ...base, rrqEstimateMonthly: 900, activeUsersCount: 1 }))
            .toBeCloseTo(expectedNPV(900 + 1200 * 0.35), 4);
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
        const neg = { ...base, rrqEstimateMonthly: -500, activeUsersCount: 1 };
        const zero = { ...base, rrqEstimateMonthly: 0, activeUsersCount: 1 };
        expect(extractNPV(neg)).toBeCloseTo(expectedNPV(0 + 1200 * 0.35), 4);
        expect(extractNPV(zero)).toBeCloseTo(expectedNPV(0 + 1200 * 0.35), 4); // ancré en absolu
        expect(extractNPV(neg)).toBeCloseTo(extractNPV(zero), 6);
    });
});

describe('computeEstateNetWorth — [FISC-ESTATE-PENSION-NPV] annualisation des rentes (×12)', () => {
    const extractNPV = extractNPVBrute;

    it('la NPV des rentes publiques est ANNUELLE (×12), pas mensuelle — discrimine le bug d\'unité', () => {
        // base : 1200 $/mois familial, finalAge 65 (sans escompte pré-65), 30 ans restants, infl 2 %.
        const npvFactor = (1 - Math.pow(1.02, -30)) / 0.02;
        const inflPow = Math.pow(1 + 2 / 100, 30);
        const annualNPV = 1200 * 12 * inflPow * npvFactor;   // correct
        const monthlyNPV = 1200 * inflPow * npvFactor;        // ANCIENNE valeur buggée (÷12)
        expect(extractNPV(base)).toBeCloseTo(annualNPV, 4);
        // Discriminant fort : la NPV correcte vaut ~12× l'ancienne → un retour au bug échouerait ici.
        expect(extractNPV(base)).toBeGreaterThan(monthlyNPV * 11);
        // Ordre de grandeur : une rente viagère de 1200 $/mois vaut des CENTAINES de k$ (pas des dizaines).
        expect(extractNPV(base)).toBeGreaterThan(400_000);
    });
});

/**
 * [ESTATE-NPV-07] La VAN des rentes publiques est ajoutée NETTE d'impôt.
 *
 * ⚠️ DEUX PIÈGES DE CE FICHIER, à connaître avant d'ajouter un test ici.
 *
 * 1. Le `fiscalStub` partagé est `gross * 0,3`, un taux PLAT : l'impôt incrémental sur les rentes
 *    vaut alors exactement 30 % quel que soit le revenu, le facteur calculé retombe sur 0,7, et le
 *    correctif est INVISIBLE. Un stub qui a la FORME du défaut ne peut pas le voir.
 * 2. Mon premier jet a remplacé ce stub par `(gross − 20 000) × 0,4` en le croyant progressif. Il
 *    ne l'est PAS au-dessus du coude : c'est un affine dont la pente est CONSTANTE à 40 %. Or les
 *    deux points mesurés (`incomeRetirement` 0 et 8 000) tombaient l'un sur la branche dégénérée
 *    (revenu nul → impôt incrémental nul par le clamp), l'autre en pleine zone plate. Résultat
 *    MESURÉ par perturbation : les trois tests restaient VERTS en annulant tout le contexte
 *    incrémental (`revenuSansRentes = 0`) ET en changeant la base de +81 %. Ils ne discriminaient
 *    RIEN. Ce bloc est donc réécrit autour d'un stub à DEUX PALIERS et de points de mesure
 *    STRICTEMENT POSITIFS placés de part et d'autre des coudes.
 */
describe('[ESTATE-NPV-07] VAN des rentes nette d’impôt — facteur CALCULÉ, plus un 0,7 plat', () => {
    // Barème à deux paliers, VRAIMENT convexe : 0 % sous 20 k$, 20 % de 20 à 60 k$, 50 % au-delà.
    // Le second coude est ce qui rend le facteur sensible à la BASE soustraite, pas seulement au
    // revenu : entre deux revenus au-dessus de 60 k$, un affine rendrait la même chose.
    const paliers = (gross: number): number => {
        const g = Math.max(0, gross);
        return Math.min(g, 20_000) * 0
            + Math.min(Math.max(0, g - 20_000), 40_000) * 0.2
            + Math.max(0, g - 60_000) * 0.5;
    };
    const stubPaliers = (gross: number): FiscalReport => ({ totalTax: paliers(gross) } as FiscalReport);

    // Ménage RETRAITÉ à l'horizon (`finalAge` 65 ≥ `retirementTargetAge` 65) ET dont les rentes
    // RÉELLEMENT versées sont renseignées — sans elles, `contexteRetraite` est faux et c'est la
    // branche pré-retraite qui s'exécute. Les deux branches sont couvertes séparément plus bas.
    const RENTES_MENSUELLES = 1_500; // familial → 18 000 $/an de tranche imposable
    // ⚠️ `governmentPension: 500` (au lieu du 1 200 de `base`) : la tranche imposée est
    // `max(rente VERSÉE, rente VALORISÉE par la VAN)`. Avec 1 200 $/mois, la valorisation à 30 ans
    // (26 087 $) DÉPASSERAIT la rente versée (18 000 $) et c'est elle qui piloterait le calcul —
    // les valeurs analytiques ci-dessous porteraient alors sur autre chose que ce qu'elles annoncent.
    // À 500 $/mois la valorisation vaut 10 870 $, donc la rente versée domine, ce qu'un test dédié
    // vérifie explicitement pour que ce choix ne devienne pas un présupposé tacite.
    const retraite = (incomeRetirementMensuel: number): EstateCalcInputs => ({
        ...base,
        currentAge: 35, retirementTargetAge: 65, simulationYears: 30, governmentPension: 500,
        incomeRetirement: incomeRetirementMensuel,
        pensionRrqMonthlyFinal: 900, pensionPsvMonthlyFinal: 600, pensionGisMonthlyFinal: 0,
    });

    /** Facteur net effectivement appliqué = VAN nette ÷ VAN brute (dérivée sous barème nul). */
    const facteurNet = (inputs: EstateCalcInputs, fn: (g: number) => FiscalReport): number => {
        const brute = extractNPVBrute(inputs);
        expect(brute, 'VAN brute nulle → le test ne mesurerait rien').toBeGreaterThan(1_000);
        return vanNette(computeEstateNetWorth(inputs, fn)) / brute;
    };

    // Le facteur ATTENDU, calculé à la main sur le barème ci-dessus — pas seulement un ordre.
    const facteurAttendu = (revenuAnnuel: number): number =>
        1 - (paliers(revenuAnnuel) - paliers(Math.max(0, revenuAnnuel - RENTES_MENSUELLES * 12))) / (RENTES_MENSUELLES * 12);

    it('la fixture impose bien la rente VERSÉE (et non la rente valorisée) — anti-présupposé', () => {
        // Sans cette garde, un changement de `governmentPension` dans `base` ferait basculer tous les
        // tests suivants sur l'autre terme du `max(…)` en restant VERTS sur des valeurs fausses.
        expect(500 * 12 * Math.pow(1.02, 30)).toBeLessThan(RENTES_MENSUELLES * 12);
    });

    it('la tranche imposée est celle que la VAN VALORISE — continuité au démarrage d’une rente', () => {
        // La VAN valorise `rrqExpected + psvExpected` à TOUT horizon. Imposer seulement ce qui est
        // déjà versé faisait chuter le facteur de 10,59 points au démarrage de la PSV à 65 ans
        // (−61 936 $ pour un an d'horizon en plus) alors que rien de réel ne s'était produit.
        const partiel = {
            ...retraite(2_500), governmentPension: 1_200,
            pensionRrqMonthlyFinal: 1_000, pensionPsvMonthlyFinal: 0,
        };
        const valorisee = 1_200 * 12 * Math.pow(1.02, 30);
        const complement = valorisee - 12_000;
        expect(complement).toBeGreaterThan(0); // sinon le test n'exerce pas la branche
        // contexte = revenu structurel (30 000) + complément ; tranche = la rente valorisée entière.
        expect(facteurNet(partiel, stubPaliers))
            .toBeCloseTo(1 - (paliers(30_000 + complement) - paliers(30_000 + complement - valorisee)) / valorisee, 6);
        // CONTINUITÉ : le jour où le reste de la rente est versé, `rentesReellesAnnuelles` monte
        // exactement de ce dont le complément descend → contexte et tranche inchangés, facteur égal.
        const versee = {
            ...partiel,
            pensionPsvMonthlyFinal: valorisee / 12 - 1_000,
            incomeRetirement: 2_500 + complement / 12,
        };
        expect(facteurNet(versee, stubPaliers)).toBeCloseTo(facteurNet(partiel, stubPaliers), 6);
    });

    it('le facteur vaut l’impôt INCRÉMENTAL des rentes dans leur contexte — valeur PINNÉE, pas un ordre', () => {
        // Revenu de contexte = `incomeRetirement × 12` (+ `accRentesYear`, nul ici).
        // 30 000 $ : la tranche 18 000 $ descend de 30 000 à 12 000, donc à cheval sur le 1er coude.
        //   impôt(30 000) = 2 000 ; impôt(12 000) = 0 → facteur = 1 − 2 000/18 000 = 0,8889.
        const f30 = facteurNet(retraite(2_500), stubPaliers);
        expect(f30).toBeCloseTo(facteurAttendu(30_000), 6);
        expect(f30).toBeCloseTo(0.888889, 5);

        // 96 000 $ : la tranche descend de 96 000 à 78 000, entièrement au-dessus du 2e coude.
        //   impôt(96 000) = 8 000 + 18 000 = 26 000 ; impôt(78 000) = 8 000 + 9 000 = 17 000
        //   → facteur = 1 − 9 000/18 000 = 0,5.
        const f96 = facteurNet(retraite(8_000), stubPaliers);
        expect(f96).toBeCloseTo(facteurAttendu(96_000), 6);
        expect(f96).toBeCloseTo(0.5, 6);

        // ⚠️ LE point qui rend ces deux ancrages non vacueux : ils encadrent 0,7. Un retour au
        // facteur plat rendrait 0,7 pour les DEUX, donc échouerait des deux côtés — et une
        // perturbation qui annule le contexte incrémental (`revenuSansRentes = 0`) rendrait
        // 1 − impôt(revenu)/rentes, soit −0,444 et −0,444 : hors de portée des deux ancrages.
        expect(f30).toBeGreaterThan(0.7);
        expect(f96).toBeLessThan(0.7);
    });

    it('la BASE soustraite est la rente RÉELLE, pas l’estimé de saisie — discrimine l’erreur d’unité', () => {
        // Même ménage, mêmes estimés de saisie (donc MÊME VAN brute), mais des rentes réellement
        // versées deux fois plus élevées : seul le facteur peut bouger. Une base reconstruite depuis
        // `governmentPension`/`rrqEstimateMonthly` (le premier jet de ce lot) rendrait la MÊME valeur.
        // ⚠️ Revenu de contexte choisi pour que les deux tranches ne tombent PAS dans le même
        // palier — à 96 000 $, les tranches 18 000 et 36 000 rendent toutes deux 0,5 par pure
        // coïncidence du barème, et le test serait vacueux (constaté à l'exécution, pas déduit).
        // À 70 000 $ : tranche 18 000 → de 70 000 à 52 000, à cheval sur le 2e coude ;
        //              tranche 36 000 → de 70 000 à 34 000, à cheval sur les DEUX coudes.
        const contexte = { ...retraite(70_000 / 12) };
        const petites = facteurNet(contexte, stubPaliers);
        const grandes = facteurNet({ ...contexte, pensionRrqMonthlyFinal: 1_800, pensionPsvMonthlyFinal: 1_200 }, stubPaliers);
        expect(petites).toBeCloseTo(1 - (paliers(70_000) - paliers(70_000 - 18_000)) / 18_000, 6);
        expect(grandes).toBeCloseTo(1 - (paliers(70_000) - paliers(70_000 - 36_000)) / 36_000, 6);
        expect(petites).toBeCloseTo(0.633333, 5);
        expect(grandes).toBeCloseTo(0.716667, 5);
        expect(grandes - petites).toBeGreaterThan(0.05);
    });

    it('BRANCHE PRÉ-RETRAITE : le contexte est la rente elle-même, JAMAIS le salaire', () => {
        // Horizon qui s'arrête AVANT la retraite → aucune rente versée, `estateCurrentIncome` est un
        // SALAIRE (ici 70 000 × 1,02^20 ≈ 104 000 $). Mesurer un taux marginal au sommet de ce salaire
        // pour taxer des rentes encaissées 10 ans plus tard rendait 0,52 — PIRE que le 0,7 remplacé.
        // ⚠️ `incomeRetirement: 0` EXPLICITE — la fixture `base` en pose 4 000, ce qui n'a aucun sens
        // pour un ménage pas encore retraité et masquerait ce que ce test vérifie (le revenu de
        // contexte est la rente, et RIEN d'autre que le revenu de retraite structurel).
        const preRetraite: EstateCalcInputs = {
            ...base, currentAge: 35, retirementTargetAge: 65, simulationYears: 20,
            incomeRetirement: 0,
            pensionRrqMonthlyFinal: 0, pensionPsvMonthlyFinal: 0,
        };
        const f = facteurNet(preRetraite, stubPaliers);
        // La rente valorisée à l'année finale : 1 200 $/mois × 12 × 1,02^20 = 21 397,64 $.
        const renteValorisee = 1_200 * 12 * Math.pow(1.02, 20);
        expect(f).toBeCloseTo(1 - paliers(renteValorisee) / renteValorisee, 6);
        // DISCRIMINANT : le salaire ne doit avoir AUCUNE influence. Doubler le salaire de base
        // change `estateCurrentIncome` du simple au double ; le facteur, lui, ne doit pas bouger.
        const fSalaireDouble = facteurNet({ ...preRetraite, grossMarcBaseAnnual: 140_000 }, stubPaliers);
        expect(fSalaireDouble).toBeCloseTo(f, 10);
    });

    it('CONTEXTE STRUCTUREL : un retrait REER d’UNE année ne pilote pas 25 ans de VAN', () => {
        // `accRetraitsReerYear` est le décaissement de la SEULE dernière année — il dépend de la
        // stratégie et de l'endroit où l'utilisateur coupe l'horizon. L'inclure faisait BASCULER
        // le gagnant de `compareLifeScenarios` au gré du curseur d'horizon (mesuré : MELTDOWN_REER
        // gagnait à 28 et 30 ans, AUTO_MARGINAL à 33 et 35 — inversion que `main` n'a pas).
        const sans = facteurNet(retraite(2_500), stubPaliers);
        // Les DEUX accumulateurs ANNÉE-À-DATE sont exclus — ils sont remis à zéro chaque janvier
        // (`taxJanuary.ts`) et les additionner à un `incomeRetirement × 12` mélange deux unités.
        // Garder `accRentesYear` faisait dépendre `estateNetWorth` du MOIS CALENDRIER de lancement :
        // 210 997 $ d'amplitude mesurée à loyer annuel identique.
        expect(facteurNet({ ...retraite(2_500), accRetraitsReerYear: 200_000 }, stubPaliers)).toBeCloseTo(sans, 10);
        expect(facteurNet({ ...retraite(2_500), accRentesYear: 200_000 }, stubPaliers)).toBeCloseTo(sans, 10);
        // Contre-preuve que la fixture EXERCE bien le contexte : le revenu de retraite MENSUEL,
        // lui, DOIT compter — sinon ce test ne prouverait rien du tout.
        expect(facteurNet(retraite(8_000), stubPaliers)).toBeLessThan(sans - 0.3);
    });

    it('le SRG est retiré des DEUX côtés — il ne peut pas servir d’assiette imposable', () => {
        // ⚠️ Défaut de mon 2e jet, trouvé en revue : je retirais le SRG de la TRANCHE mais pas du
        // CONTEXTE. `incomeRetirement` = `retirementBreakdown.total`, qui CONTIENT le SRG via `psv`.
        // Le résidu `revenuSansRentes` était donc composé de SRG PUR — non imposable (`taxDecember`
        // le soustrait de ses cinq assiettes) — et la tranche s'empilait dessus comme s'il l'était.
        // MESURÉ : ce seul défaut renversait la recommandation de décaissement sur 4 points /52.
        //
        // Fixture : rentes 1 500 $/mois dont 500 $ de SRG → tranche imposable = 1 000 × 12 = 12 000 $.
        // `incomeRetirement` 2 500 $/mois = 30 000 $/an dont 6 000 $ de SRG → contexte = 24 000 $.
        //   impôt(24 000) = 800 ; impôt(24 000 − 12 000) = 0 → facteur = 1 − 800/12 000 = 0,933333.
        const avecSrg = {
            ...retraite(2_500),
            pensionRrqMonthlyFinal: 900, pensionPsvMonthlyFinal: 600, pensionGisMonthlyFinal: 500,
        };
        expect(facteurNet(avecSrg, stubPaliers)).toBeCloseTo(1 - (paliers(24_000) - paliers(12_000)) / 12_000, 6);
        expect(facteurNet(avecSrg, stubPaliers)).toBeCloseTo(0.933333, 5);
        // DISCRIMINANT de l'asymétrie : si le SRG restait dans le contexte (30 000 $) sans être dans
        // la tranche (12 000 $), le résidu vaudrait 18 000 $ et le facteur 1 − (2 000 − 0)/12 000
        // = 0,833333. Les deux valeurs sont séparées de 10 points : aucune coïncidence possible.
        expect(facteurNet(avecSrg, stubPaliers)).not.toBeCloseTo(1 - (paliers(30_000) - paliers(18_000)) / 12_000, 3);
    });

    it('l’écrêtement PSV est retiré des DEUX côtés (même convention que le SRG)', () => {
        // `retirementBreakdown.rrq`/`.psv` sont BRUTS de l'écrêtement, `.total` en est NET. Sans ce
        // terme, la tranche retirée dépasse le revenu qui la contient pour un retraité en
        // récupération PSV. Fixture : rentes brutes 1 500, écrêtement 300 → tranche 1 200 × 12.
        const avecEcretement = {
            ...retraite(2_500),
            pensionRrqMonthlyFinal: 900, pensionPsvMonthlyFinal: 600, pensionOasReductionMonthlyFinal: 300,
        };
        expect(facteurNet(avecEcretement, stubPaliers))
            .toBeCloseTo(1 - (paliers(30_000) - paliers(30_000 - 14_400)) / 14_400, 6);
        // Sans le retrait, la tranche vaudrait 18 000 $ : facteur différent d'au moins 2 points.
        expect(Math.abs(facteurNet(avecEcretement, stubPaliers) - (1 - (paliers(30_000) - paliers(12_000)) / 18_000)))
            .toBeGreaterThan(0.02);
    });

    it('RETRAITÉ mais rentes PAS ENCORE versées : la tranche s’ajoute PAR-DESSUS le revenu réel', () => {
        // ⚠️ Défaut de mon 2e jet, trouvé en revue : je branchais sur « une rente est-elle versée ? »
        // en le traitant comme « le ménage est-il retraité ? ». Entre l'âge de retraite et le début
        // du RRQ, un retraité avec une rente DB tombait dans la branche pré-retraite et était imposé
        // « depuis zéro » sur sa rente publique ESTIMÉE, en IGNORANT son revenu réel. MESURÉ :
        // 235 205 $ de patrimoine successoral fantôme, et `estateNetWorth` qui DÉCROISSAIT de
        // 169 437 $ quand l'horizon augmentait d'UN an — alors que le code d'avant est croissant.
        //
        // Fixture : retraité (`finalAge` 65 ≥ `retirementTargetAge` 65), 4 000 $/mois de rente DB,
        // AUCUNE rente publique encore versée. Contexte attendu = 48 000 $ + la rente valorisée.
        const sansRentePublique: EstateCalcInputs = {
            ...base, currentAge: 35, retirementTargetAge: 65, simulationYears: 30,
            incomeRetirement: 4_000,
            pensionRrqMonthlyFinal: 0, pensionPsvMonthlyFinal: 0, pensionGisMonthlyFinal: 0,
        };
        const renteValorisee = 1_200 * 12 * Math.pow(1.02, 30);
        expect(facteurNet(sansRentePublique, stubPaliers))
            .toBeCloseTo(1 - (paliers(48_000 + renteValorisee) - paliers(48_000)) / renteValorisee, 6);
        // DISCRIMINANT : le revenu réel doit COMPTER. Sans lui (contexte = la rente seule), le
        // facteur serait 1 − impôt(rente)/rente — un écart de plusieurs points.
        expect(Math.abs(facteurNet(sansRentePublique, stubPaliers) - (1 - paliers(renteValorisee) / renteValorisee)))
            .toBeGreaterThan(0.05);
        // Et la CONTINUITÉ : le jour où la rente commence, le revenu structurel monte exactement du
        // montant qu'on cessait d'ajouter → même contexte, donc même facteur.
        const renteVersee: EstateCalcInputs = {
            ...sansRentePublique,
            incomeRetirement: 4_000 + renteValorisee / 12,
            pensionRrqMonthlyFinal: renteValorisee / 12, pensionPsvMonthlyFinal: 0,
        };
        expect(facteurNet(renteVersee, stubPaliers)).toBeCloseTo(facteurNet(sansRentePublique, stubPaliers), 6);
    });

    it('le facteur ne dépend d’AUCUNE grandeur pilotée par la stratégie de décaissement', () => {
        // C'est ce qui garantit que le terme VAN s'ANNULE au classement de `drawdownOptimizer` —
        // exactement comme le faisait le forfait plat, et donc que corriger le facteur ne change
        // aucune recommandation. Vérifié à l'échelle du moteur : 32 points de mesure (REER × horizon)
        // rendent des marges MELTDOWN−AUTO identiques au dollar près à `origin/main`.
        // Ici, au niveau unitaire : ni le retrait REER de l'année, ni les soldes ne doivent compter.
        const ref = facteurNet(retraite(2_500), stubPaliers);
        expect(facteurNet({ ...retraite(2_500), accRetraitsReerYear: 250_000 }, stubPaliers)).toBeCloseTo(ref, 10);
        expect(facteurNet({ ...retraite(2_500), reer: 900_000, startingREER: 900_000 }, stubPaliers)).toBeCloseTo(ref, 10);
        expect(facteurNet({ ...retraite(2_500), celi: 400_000, startingCELI: 400_000 }, stubPaliers)).toBeCloseTo(ref, 10);
        // ⚠️ Réserve honnête : `incomeRetirement` est NET de l'écrêtement PSV, lequel dépend du
        // revenu, donc indirectement de la stratégie. Le découplage est mesuré, pas prouvé.
    });

    it('le MOTEUR alimente vraiment les champs plombés — scan du SITE D\u2019APPEL', () => {
        // ⚠️ Ce fichier teste le MODULE avec les champs posés à la main : rien n'y prouve que
        // `services/projection.ts` les alimente. MESURÉ : débrancher `dbPensionMonthlyPlanned` ou
        // `pensionOasReductionMonthlyFinal` au site d'appel laissait **324 tests VERTS** sur les
        // 15 fichiers qui touchent `estateNetWorth`. `TEST-AU-CONTRAT-NE-VOIT-PAS-L-APPELANT` —
        // et le site d'appel vit au milieu d'une boucle moteur non instanciable, donc le patron
        // du dépôt pour ce cas est le scan de SOURCE.
        const src = readFileSync(resolve(__dirname, '../../services/projection.ts'), 'utf8');
        const code = stripComments(src);
        // Anti-vacuité du décommentage : il doit rester du VRAI code et un jeton connu.
        // ⚠️ PAS `code.length` : la source unique BLANCHIT, donc la longueur ne bouge jamais.
        expect(partDeCodeRestante(src, code)).toBeGreaterThan(0.25);
        expect(code).toContain('computeEstateNetWorth');
        // ⚠️ CE QUE CE SCAN PROUVE, ET CE QU'IL NE PROUVE PAS. Il vérifie qu'un JETON attendu est
        // présent au bon endroit — pas que la valeur est réellement acheminée. Mesuré : il reste
        // vert sur une clé dupliquée par spread (JS garde la DERNIÈRE, la regex trouve la PREMIÈRE),
        // sur un leurre placé dans un export bidon du même fichier, sur `pensionPrivee` alimenté par
        // `retirementBreakdown.rrq` (bon nom, mauvais contenu), et sur un reset DÉPLACÉ en fin de
        // boucle. Ces quatre cas sont rattrapés ailleurs (`projection.test.ts > indexation 0 %`,
        // `projection.convergence.test.ts`, `estateDbProxyWiring.test.ts`) — c'est de la défense en
        // profondeur, pas une garde suffisante à elle seule.
        // Chaque champ doit être alimenté par la variable moteur ATTENDUE, pas par un littéral.
        const attendus: Array<[string, string]> = [
            ['pensionRrqMonthlyFinal', 'pensionRRQ'],
            ['pensionPsvMonthlyFinal', 'pensionPSV'],
            ['pensionGisMonthlyFinal', 'incomeRetirementGis'],
            ['pensionOasReductionMonthlyFinal', 'pensionOasReduction'],
            ['pensionPriveeMonthlyFinal', 'pensionPrivee'],
        ];
        for (const [champ, source] of attendus) {
            const m = code.match(new RegExp(`${champ}\\s*:\\s*([A-Za-z0-9_.]+)`));
            expect(m, `${champ} absent du site d'appel`).not.toBeNull();
            expect(m?.[1], `${champ} n'est pas alimenté par ${source}`).toBe(source);
        }
        // Le proxy DB doit passer par la SOURCE UNIQUE, jamais par une indexation recopiée.
        expect(code).toMatch(/dbPensionMonthlyPlanned:\s*computeDbPensionMonthly\(/);
        // Et ces variables doivent être remises à zéro EN TÊTE DE BOUCLE, comme leurs voisines.
        // ⚠️ `toContain('x = 0;')` serait VACUEUX : la DÉCLARATION `let x = 0;` le satisfait déjà.
        // Mesuré — la perturbation « reset retiré » laissait 40/40 vert avec cette formulation.
        // On exige donc DEUX occurrences : la déclaration hors boucle, et le reset dans la boucle.
        for (const v of ['incomeRetirementGis', 'pensionOasReduction', 'pensionPrivee', 'pensionRRQ', 'pensionPSV']) {
            const occurrences = code.split(new RegExp(`(?:^|[^A-Za-z0-9_.])${v}\\s*=\\s*0;`)).length - 1;
            expect(occurrences, `${v} : déclaration + reset de boucle attendus, trouvé ${occurrences}`)
                .toBeGreaterThanOrEqual(2);
        }
    });

    it('les DEUX appels fiscaux du facteur portent la MÊME année — scan de SOURCE', () => {
        // ⚠️ Ce lot CRÉE une paire `calculateFiscalReport(…, finalYear, …)`. Désapparier l'année sur
        // un seul des deux appels laisse 34/34 VERT : les stubs de ce fichier ignorent tous
        // l'argument `year`, donc AUCUN test de comportement ne peut voir la faute.
        // `CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE` — et pour une paire enfouie dans une expression,
        // le patron du dépôt est le scan de SOURCE. On lit la source DÉCOMMENTÉE : le bloc au-dessus
        // explique la paire en prose, et un `toBe(2)` sur du texte commenté serait vacueux.
        const src = readFileSync(resolve(__dirname, '../../services/projection/estateCalculation.ts'), 'utf8');
        const code = stripComments(src);
        // Anti-vacuité du décommentage : il doit rester du VRAI code, et un jeton connu.
        // ⚠️ PAS `code.length` : la source unique BLANCHIT, donc la longueur ne bouge jamais.
        expect(partDeCodeRestante(src, code)).toBeGreaterThan(0.25);
        expect(code).toContain('const facteurNetRentes');
        // ⚠️ Extraction par PROFONDEUR, pas par `[^)]*` : un argument parenthésé
        // (`(estateCurrentIncome + totalEstateLiquidation)`) tronque la classe négative et l'appel
        // paraît alors ne pas contenir `finalYear` — `GARDE-BORNEE-PAR-CLASSE-NEGATIVE`, constaté à
        // l'exécution sur ce fichier même. L'extracteur est vérifié sur ce cas juste en dessous.
        const extraireAppels = (texte: string): string[] => {
            const out: string[] = [];
            const jeton = 'calculateFiscalReport(';
            for (let i = texte.indexOf(jeton); i >= 0; i = texte.indexOf(jeton, i + 1)) {
                let d = 0;
                for (let j = i + jeton.length - 1; j < texte.length; j++) {
                    if (texte[j] === '(') d++;
                    else if (texte[j] === ')') { d--; if (d === 0) { out.push(texte.slice(i, j + 1)); break; } }
                }
            }
            return out;
        };
        // L'extracteur lui-même, sur la forme la plus tordue du fichier :
        expect(extraireAppels('x = calculateFiscalReport((a + b), 0, 0, Y, mc).totalTax;'))
            .toEqual(['calculateFiscalReport((a + b), 0, 0, Y, mc)']);

        const appels = extraireAppels(code);
        expect(appels.length, 'la fonction doit appeler calculateFiscalReport').toBeGreaterThanOrEqual(4);
        // ⚠️ `toContain('finalYear')` NE SUFFIT PAS : `finalYear + 5` le contient aussi, et cette
        // perturbation laissait 36/36 VERT. On isole le 4ᵉ argument (à profondeur 0) et on exige
        // qu'il soit EXACTEMENT `finalYear` — `SCAN-QUI-MATCHE-LA-DECLARATION-AU-LIEU-DE-L-USAGE`.
        const quatriemeArg = (appel: string): string => {
            const inner = appel.slice(appel.indexOf('(') + 1, -1);
            const args: string[] = []; let d = 0, courant = '';
            for (const c of inner) {
                if (c === '(' || c === '[') d++;
                else if (c === ')' || c === ']') d--;
                if (c === ',' && d === 0) { args.push(courant.trim()); courant = ''; continue; }
                courant += c;
            }
            args.push(courant.trim());
            return args[3] ?? '';
        };
        expect(quatriemeArg('calculateFiscalReport((a + b), 0, 0, Y, mc)')).toBe('Y');
        for (const a of appels) {
            expect(quatriemeArg(a), `année non appariée dans : ${a}`).toBe('finalYear');
        }
    });

    it('AVANT la retraite, la pension DB PLANIFIÉE sert de plancher au contexte', () => {
        // Sans ce plancher, `incomeRetirement` vaut 0 tant que le ménage travaille et le contexte
        // fiscal est la rente seule : le facteur s'effondrait au passage à la retraite, faisant
        // DÉCROÎTRE `estateNetWorth` de 65 687 $ pour UN an d'horizon en plus. La pension DB est une
        // SAISIE, connue dès le premier mois — s'en priver fabrique une falaise sur une information
        // qu'on a déjà.
        const preRetraite: EstateCalcInputs = {
            ...base, currentAge: 35, retirementTargetAge: 65, simulationYears: 20,
            incomeRetirement: 0, pensionRrqMonthlyFinal: 0, pensionPsvMonthlyFinal: 0,
        };
        // ⚠️ `dbPensionMonthlyPlanned` est reçu DÉJÀ valorisé à l'année finale — c'est
        // `computeDbPensionMonthly` (source unique) qui porte l'indexation, l'âge de début et le
        // facteur de survivant. Ce module ne fait plus que l'annualiser : le recopier ici avait
        // produit trois divergences mesurées contre le moteur.
        const renteValorisee = 1_200 * 12 * Math.pow(1.02, 20);
        const dbPlanifiee = 3_000 * 12;
        const avecDb = { ...preRetraite, dbPensionMonthlyPlanned: 3_000 };
        expect(facteurNet(avecDb, stubPaliers))
            .toBeCloseTo(1 - (paliers(dbPlanifiee + renteValorisee) - paliers(dbPlanifiee)) / renteValorisee, 6);
        // DISCRIMINANT : sans le proxy, le contexte serait la rente seule — plusieurs points d'écart.
        expect(facteurNet(preRetraite, stubPaliers) - facteurNet(avecDb, stubPaliers)).toBeGreaterThan(0.05);
        // CONTINUITÉ au démarrage de la DB : elle devient réelle, le proxy s'efface, contexte égal.
        const dbVersee = { ...avecDb, incomeRetirement: 3_000, pensionPriveeMonthlyFinal: 3_000 };
        expect(facteurNet(dbVersee, stubPaliers)).toBeCloseTo(facteurNet(avecDb, stubPaliers), 6);
    });

    it('DB pas encore versée : le proxy S\u2019AJOUTE au revenu réel, il ne le REMPLACE pas', () => {
        // ⚠️ Mon jet précédent écrivait `Math.max(revenuRéel, proxyDB)`. Entre l'âge de la retraite
        // et `dbPensionStartAge`, un ménage touche déjà ses rentes publiques mais pas encore sa DB :
        // le `max` prenait le proxy et JETAIT les rentes réelles. MESURÉ sur un solo (retraite 58,
        // DB à 70) : contexte surestimé de 53 799 $/an, `estateNetWorth` sous-évalué de 142 890 $,
        // et une falaise NEUVE de 5,49 points — le défaut même que ce terme devait supprimer.
        // Ici : revenu réel 18 000 $ (rentes versées) + proxy DB 24 000 $ = 42 000 $ de contexte.
        const cas = { ...retraite(1_500), dbPensionMonthlyPlanned: 2_000, pensionPriveeMonthlyFinal: 0 };
        expect(facteurNet(cas, stubPaliers)).toBeCloseTo(1 - (paliers(42_000) - paliers(24_000)) / 18_000, 6);
        // DISCRIMINANT : un `max` rendrait 24 000 $ de contexte, donc une valeur nettement différente.
        expect(Math.abs(facteurNet(cas, stubPaliers)
            - (1 - (paliers(24_000) - paliers(6_000)) / 18_000))).toBeGreaterThan(0.05);
    });

    it('DB déjà versée : le proxy ne compte PLUS (sinon il double, et à VIE)', () => {
        // `incomeRetirement` porte alors la DB à sa valeur RÉELLE — indexation partielle comprise.
        // Un proxy qui continuerait de compter surestimerait le contexte de façon PERMANENTE (le
        // `max` ne redescend jamais) : mesuré jusqu'à 47 287 $/an pour une pension NON indexée,
        // soit 34 645 $ d'`estateNetWorth` effacés.
        const sansProxy = { ...retraite(4_000), pensionPriveeMonthlyFinal: 2_500 };
        const avecProxy = { ...sansProxy, dbPensionMonthlyPlanned: 9_999 };
        expect(facteurNet(avecProxy, stubPaliers)).toBeCloseTo(facteurNet(sansProxy, stubPaliers), 10);
    });

    it('un NaN sur les champs de rente PLOMBÉS ne bascule pas de branche en silence', () => {
        // Sans `fin()`, un NaN rend `rentesReellesAnnuelles` NaN : la comparaison au complément
        // bascule vers l'autre terme du `max(…)` sans que rien ne le signale. Avec `fin()`, le champ
        // ne contribue que 0 — dégradation gracieuse, comme `rrqEstimateMonthly` chez le voisin.
        const ref = facteurNet(retraite(2_500), stubPaliers);
        // ⚠️ `pensionPriveeMonthlyFinal` était ABSENT de cette liste, qui en listait cinq quand le
        // scan voisin en listait six — deux listes de la même famille, dans le même fichier,
        // désynchronisées.
        // ⚠️ HONNÊTETÉ SUR CE QUE CETTE ENTRÉE-LÀ PROTÈGE : rien, aujourd'hui. J'avais écrit qu'elle
        // couvrait « le SEUL champ qui discrimine une branche » ; c'est faux. Sa seule consommation
        // est `dbVerseeAnnuelle > 0`, et `NaN > 0` est faux exactement comme `0 > 0` : retirer le
        // `fin()` de cette ligne laisse 40/40 VERT (mesuré). L'entrée est de la défense en
        // profondeur — elle deviendra discriminante le jour où `dbVerseeAnnuelle` sera lu
        // numériquement. Un invariant qui ne trouve rien doit dire qu'il POURRAIT trouver, et quand.
        for (const champ of ['pensionRrqMonthlyFinal', 'pensionPsvMonthlyFinal', 'pensionGisMonthlyFinal',
            'pensionOasReductionMonthlyFinal', 'dbPensionMonthlyPlanned', 'pensionPriveeMonthlyFinal'] as const) {
            const avecNaN = computeEstateNetWorth({ ...retraite(2_500), [champ]: NaN }, stubPaliers);
            expect(Number.isFinite(avecNaN.estateNetWorth), `${champ} NaN → estate non fini`).toBe(true);
            const avecZero = facteurNet({ ...retraite(2_500), [champ]: 0 }, stubPaliers);
            const avecNaNFac = facteurNet({ ...retraite(2_500), [champ]: NaN }, stubPaliers);
            expect(avecNaNFac, `${champ} : NaN doit se comporter comme 0`).toBeCloseTo(avecZero, 10);
        }
        expect(Number.isFinite(ref)).toBe(true);
    });

    it('le facteur ne descend jamais SOUS 0 — un barème ne confisque pas plus que la rente', () => {
        // ⚠️ Seule la borne BASSE est atteignable : `impotSurRentes` est clampé à ≥ 0 et le
        // dénominateur est > 0, donc le ratio est ≤ 1 par construction. Le `Math.min(1, …)` du code
        // est une ceinture contre une entrée aberrante, pas une branche testable — d'où l'intitulé,
        // qui ne promet plus « borné à [0, 1] » comme le faisait mon premier jet.
        const confiscatoire = (gross: number): FiscalReport => ({ totalTax: Math.max(0, gross) * 2 } as FiscalReport);
        const r = computeEstateNetWorth(retraite(8_000), confiscatoire);
        expect(vanNette(r)).toBeGreaterThanOrEqual(0);


        // ⚠️ HONNÊTETÉ SUR CE QUI N'EST **PAS** TESTABLE ICI. Le `Math.max(0, …)` sur
        // `revenuSansRentes` n'est exercé par aucune fixture (perturbation : le retirer laisse
        // 32/32 VERT), et il ne PEUT pas l'être : tout barème sain rend 0 sur un revenu négatif —
        // `calculateFiscalReport` comme ce stub commencent par clamper leur entrée. Un résidu de
        // −48 000 $ et un résidu de 0 $ produisent donc exactement le même impôt. Le clamp est une
        // ceinture de lisibilité, pas une branche : plutôt que de fabriquer un stub absurde
        // (impôt non nul sur un revenu négatif) pour le « couvrir », on écrit ici qu'il ne l'est
        // pas et pourquoi. Un test qui n'aurait discriminé que contre un barème impossible
        // n'aurait rien prouvé sur le moteur réel.
    });
});
