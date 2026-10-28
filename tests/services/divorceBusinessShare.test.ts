// tests/services/divorceBusinessShare.test.ts
//
// [ENG-W5-BUSINESS-DIVORCE-NON-PARTAGE] Trouvé par le panel du lot 214 (`privateBusinessValue` était
// un `const` calculé AVANT la boucle et JAMAIS touché par le partage du divorce, contrairement à
// TOUS les autres actifs). Mesuré alors : entreprise à 900 000 $, partage à 75 % → patrimoine
// post-divorce surestimé de 900 000 $ EXACTEMENT (l'entreprise restait à 100 % pendant que le CELI
// tombait de 237 773 $ à 52 553 $).
//
// DÉCISION MARC 2026-09-14 : partager l'entreprise COMME LE RESTE (× keep), hypothèse « société
// d'acquêts par défaut » — le modèle ne distingue nulle part ailleurs les biens propres des biens
// communs. Ce fichier VERROUILLE le correctif : plus de la moitié du 900 000 $ ne doit plus
// survivre au divorce.
//
// ⚠️ Piège hérité de `divorceImmobilier.test.ts` : un partage à 50 % ne distingue PAS `keep` de
// `1 − keep` (les deux valent 0,5) → le discriminant tourne à 75 %.
import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, PrivateBusiness } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';
import { usersCouple } from '../helpers/menageProprietaire';

const entreprise = (): PrivateBusiness => ({
    id: 'biz1', name: 'Consultation Inc.', ownershipPct: 100, estimatedValue: 900_000,
});

/** [revue #954] Avec dividende — pour verrouiller que le REVENU suit le MÊME partage que la VALEUR. */
const entrepriseAvecDividende = (): PrivateBusiness => ({
    id: 'biz1', name: 'Consultation Inc.', ownershipPct: 100, estimatedValue: 900_000,
    annualDividend: 60_000,
});

const params = (proj: Partial<ProjectionConfig>, businesses: PrivateBusiness[] = [entreprise()]): SimulationParams => ({
    projection: {
        years: 10, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 1_500,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, ...proj,
    } as ProjectionConfig,
    calculatedStartingCash: 70_000,
    liveCSVBalances: { CELI: 90_000, CELIAPP: 0, REER: 150_000, NON_ENREG: 40_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    privateBusinesses: businesses,
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 1_500, lifeExpectancy: 92, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: { users: usersCouple(45), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 0,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

const runWith = (p: SimulationParams) => (__runScenarioForTests(
    p, 'AUTO_MARGINAL' as AllocationStrategy, true, false, 0, 'BASE', {},
    { verboseMonthlyPoints: true },
) as unknown as { chartData: Array<Record<string, number>> }).chartData;

const run = (proj: Partial<ProjectionConfig>, businesses?: PrivateBusiness[]) => runWith(params(proj, businesses));

const n = (o: Record<string, number> | undefined, k: string): number => Number(o?.[k] ?? NaN);

/** `tryDivorce` ne se déclenche qu'au 1er janvier suivant → m = 12. */
const M_AVANT = 11;
const M_APRES = 12;

describe('[ENG-W5-BUSINESS-DIVORCE-NON-PARTAGE] entreprise privée partagée au divorce', () => {
    it('contrôle : sans divorce, la valeur de l\'entreprise reste CONSTANTE sur tout l\'horizon', () => {
        const d = run({ divorceEnabled: false });
        expect(n(d[0], 'Entreprise')).toBe(900_000);
        expect(n(d[d.length - 1], 'Entreprise')).toBe(900_000);
    });

    it('la fixture MESURE bien quelque chose : entreprise présente, divorce déclenché', () => {
        const d = run({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 75 });
        expect(n(d[M_AVANT], 'Entreprise'), 'aucune entreprise : rien à partager').toBe(900_000);
        expect(n(d[M_APRES], 'NetWorth'), 'le divorce n\'a pas eu lieu')
            .toBeLessThan(n(d[M_AVANT], 'NetWorth') * 0.7);
    });

    // ── Discriminant à 75 % (keep = 0,25) : confondre `keep` et `1 − keep` ferait ×3 d'écart. ──
    it('à 75 %, l\'entreprise tombe au QUART de sa valeur, pas aux trois quarts', () => {
        const d = run({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 75 });
        expect(n(d[M_APRES], 'Entreprise')).toBe(225_000);
        // Reste CONSTANTE (à sa nouvelle valeur) après le divorce — aucune croissance modélisée.
        expect(n(d[d.length - 1], 'Entreprise')).toBe(225_000);
    });

    it('avec vs sans entreprise, l\'écart de patrimoine post-divorce est la part CONSERVÉE (225 000 $), pas la valeur totale (900 000 $)', () => {
        const avecBiz = run({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 75 });
        // Rejoue le MÊME scénario sans entreprise.
        const sansBiz = run({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 75 }, []);
        const ecart = n(avecBiz[M_APRES], 'NetWorth') - n(sansBiz[M_APRES], 'NetWorth');
        // Avant le correctif, cet écart valait 900 000 $ pile (l'entreprise entière survivait au
        // divorce). Après : seule la part CONSERVÉE (25 % de 900 000 $ = 225 000 $) doit survivre.
        expect(ecart).toBeCloseTo(225_000, 0);
    });

    // ── [revue #954] Le REVENU (dividende) doit suivre le MÊME partage que la VALEUR. ──
    // Deux revues indépendantes (code-reviewer, silent-failure-hunter) ont trouvé que le fix initial
    // partageait `privateBusinessValue` (le bilan) sans toucher `ownershipPct` (qui pilote le
    // dividende dans `applyW5Effects`) — le ménage restant touchait alors 100 % du dividende annuel
    // indéfiniment pendant que son équité tombait à `keep`. `PARTAGER-LE-MONTANT-PAS-SES-REFLETS`.
    it('à 75 %, le dividende mensuel encaissé tombe aussi au QUART, pas seulement la valeur au bilan', () => {
        // Double différence (avec vs sans dividende) pour isoler le SEUL effet du dividende : le
        // revenu total change AUSSI au mois du divorce pour d'autres raisons (ménage à une tête,
        // réallocation fiscale), donc une lecture brute d'`Income` n'isole rien à elle seule.
        const divorceProj = { divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 75 };
        const avecDividende = run(divorceProj, [entrepriseAvecDividende()]);
        const sansDividende = run(divorceProj, [entreprise()]); // même entreprise, dividende = 0
        const avant = n(avecDividende[M_AVANT], 'Income') - n(sansDividende[M_AVANT], 'Income');
        const apres = n(avecDividende[M_APRES], 'Income') - n(sansDividende[M_APRES], 'Income');
        // Dividende mensuel plein = 60 000 / 12 = 5 000 $ (avant divorce, ownershipPct 100 %) ;
        // au quart = 1 250 $ (après, ownershipPct × 0,25).
        expect(avant).toBeCloseTo(5_000, 0);
        expect(apres).toBeCloseTo(1_250, 0);
    });

    it('avec vs sans dividende, l\'écart de patrimoine à la fin de l\'horizon reste borné à la part CONSERVÉE du dividende cumulé, jamais au dividende PLEIN', () => {
        const divorceProj = { divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 75 };
        const avecDividende = run(divorceProj, [entrepriseAvecDividende()]);
        const sansDividende = run(divorceProj, [entreprise()]); // même valeur d'entreprise, dividende = 0
        const finHorizon = avecDividende.length - 1;
        const anneesApresDivorce = (finHorizon - M_APRES) / 12;
        const dividendePleinCumule = 60_000 * anneesApresDivorce;
        const ecartFinal = n(avecDividende[finHorizon], 'NetWorth') - n(sansDividende[finHorizon], 'NetWorth');
        // Avant le correctif du revenu : l'écart aurait pu approcher le dividende PLEIN cumulé
        // (100 % perçu indéfiniment). Après : borné à la part CONSERVÉE (25 %), même en comptant la
        // croissance des sommes réinvesties — donc strictement sous le dividende plein.
        expect(ecartFinal).toBeLessThan(dividendePleinCumule * 0.5);
        // Et non-vacueux : un dividende non nul doit bien laisser une trace positive au patrimoine.
        expect(ecartFinal).toBeGreaterThan(0);
    });
});
