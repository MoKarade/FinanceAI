// tests/services/divorceImmobilier.test.ts
//
// [TEST-DIVORCE-SANS-IMMOBILIER] Les 16 fixtures de divorce du dépôt portaient `realEstateGoals: []`
// — mesuré en livrant `[ENG-DIVORCE-PMT-NON-PARTAGEE]` (#737), où un correctif qui déplace des
// dizaines de milliers de dollars n'a re-basé AUCUN golden. #737 a couvert la MENSUALITÉ ; ce
// fichier couvre le reste du partage d'un bien DÉTENU : équité, dette, intérêt.
//
// ⚠️ CE QUI A ÉTÉ MESURÉ AVANT D'ÉCRIRE (maison 500 000 $, mise 100 000 $, 5 %/25 ans, achetée
// 2021, divorce certain au mois 12) — le mécanisme est SAIN depuis #735/#737, ce lot ne corrige
// rien, il VERROUILLE :
//   · partage 50 % : équité ×0,5047 (0,5 + croissance/amortissement du mois), intérêt du mois
//     suivant ×0,5000 exactement (calculé sur la dette divisée), NW ×0,4840 ;
//   · partage 75 % (keep 0,25) : équité ×0,2523, intérêt ×0,2500.
//
// ⚠️ Deux pièges de fixture, tous deux payés cette session et re-documentés ici :
//   · sans `isActive: true` ET `isOwned: true`, le bien N'EXISTE PAS (`Immobilier = 0` sur tout
//     l'horizon) — la fixture décrirait une maison sans en avoir une ;
//   · un partage à 50 % ne distingue PAS `keep` de `1 − keep` (les deux valent 0,5) : le test
//     discriminant tourne donc à 75 %, où confondre les deux ferait ×3 d'écart.

import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';
import { usersCouple, maisonDetenue } from '../helpers/menageProprietaire';

/** Fixture RÉUTILISABLE « ménage propriétaire » — voir l'en-tête pour les deux pièges. */
const params = (proj: Partial<ProjectionConfig>): SimulationParams => ({
    projection: {
        years: 15, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 1_500,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3, ...proj,
    } as ProjectionConfig,
    calculatedStartingCash: 70_000,
    liveCSVBalances: { CELI: 90_000, CELIAPP: 0, REER: 150_000, NON_ENREG: 40_000, CRYPTO: 0, REEE: 0 },
    // ⚠️ `debts: []` à dessein : sans autre dette, `DetteTotale` EST l'hypothèque (le point mensuel
    // ne publie pas de champ dédié). Le test d'anti-vacuité le vérifie plutôt que le supposer.
    realEstateGoals: [maisonDetenue()], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 1_500, lifeExpectancy: 92, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: { users: usersCouple(45), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 0,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

const run = (proj: Partial<ProjectionConfig>) => (__runScenarioForTests(
    params(proj), 'AUTO_MARGINAL' as AllocationStrategy, true, false, 0, 'BASE', {},
    { verboseMonthlyPoints: true },
) as unknown as { chartData: Array<Record<string, number>> }).chartData;

const n = (o: Record<string, number> | undefined, k: string): number => Number(o?.[k] ?? NaN);

/** `tryDivorce` ne se déclenche qu'au 1er janvier suivant → m = 12. */
const M_AVANT = 11;
const M_APRES = 12;

describe('[TEST-DIVORCE-SANS-IMMOBILIER] le partage d\'un bien DÉTENU, sur les grandeurs publiées', () => {
    it('la fixture MESURE bien quelque chose : maison, hypothèque, divorce', () => {
        const d = run({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 75 });
        expect(n(d[M_AVANT], 'Immobilier'), 'aucune équité : la maison n\'est pas dans le scénario')
            .toBeGreaterThan(100_000);
        expect(n(d[M_AVANT], 'DetteTotale'), 'aucune hypothèque : rien à partager côté dette')
            .toBeGreaterThan(100_000);
        expect(n(d[M_AVANT], 'DettesNonImmo'), 'une dette non immobilière fausserait DetteTotale comme proxy')
            .toBe(0);
        expect(n(d[M_APRES], 'NetWorth'), 'le divorce n\'a pas eu lieu')
            .toBeLessThan(n(d[M_AVANT], 'NetWorth') * 0.5);
    });

    // ── Discriminant à 75 % : confondre `keep` et `1 − keep` ferait ×3 d'écart. ──
    it('à 75 %, équité ET dette immobilières sont réduites au quart, pas aux trois quarts', () => {
        const d = run({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 75 });
        // Mesuré : 0,2523 (0,25 + croissance/amortissement du mois). Bande large, jamais ancrée.
        const ratioEquite = n(d[M_APRES], 'Immobilier') / n(d[M_AVANT], 'Immobilier');
        expect(ratioEquite, `équité ×${ratioEquite.toFixed(4)} — le partage a gardé la mauvaise part`)
            .toBeGreaterThan(0.24);
        expect(ratioEquite).toBeLessThan(0.27);
        const ratioDette = n(d[M_APRES], 'DetteTotale') / n(d[M_AVANT], 'DetteTotale');
        expect(ratioDette, `dette ×${ratioDette.toFixed(4)} — la dette n'a pas suivi le même partage`)
            .toBeGreaterThan(0.24);
        expect(ratioDette).toBeLessThan(0.26);
    });

    /**
     * L'intérêt du mois SUIVANT est calculé sur la dette DIVISÉE — c'est la preuve que le partage a
     * atteint l'état du moteur (`pState.mortgage`), pas seulement l'affichage. Mesuré : ratio
     * 0,2500 exactement contre le scénario sans divorce.
     */
    it('l\'intérêt hypothécaire du mois suivant est celui d\'une dette au quart', () => {
        const d = run({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 75 });
        const s = run({ divorceEnabled: false });
        expect(n(s[M_APRES + 1], 'ImmoInterest'), 'aucun intérêt sans divorce : rien à comparer')
            .toBeGreaterThan(500);
        const ratio = n(d[M_APRES + 1], 'ImmoInterest') / n(s[M_APRES + 1], 'ImmoInterest');
        expect(ratio, `intérêt ×${ratio.toFixed(4)} — il est calculé sur une dette non partagée`)
            .toBeCloseTo(0.25, 2);
    });

    it('contre-épreuve : sans divorce, rien ne chute entre les mêmes mois', () => {
        const s = run({ divorceEnabled: false });
        const avant = n(s[M_AVANT], 'Immobilier');
        expect(avant, 'pas de maison : la contre-épreuve ne mesure rien').toBeGreaterThan(100_000);
        // L'équité MONTE légèrement (croissance + amortissement) — elle ne chute jamais.
        expect(n(s[M_APRES], 'Immobilier'), 'l\'équité a chuté SANS divorce : le discriminant mesure autre chose')
            .toBeGreaterThan(avant);
    });
});
