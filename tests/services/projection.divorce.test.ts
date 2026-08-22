// tests/services/projection.divorce.test.ts
//
// [ENG-DIVORCE-*] Le divorce était incohérent sur TROIS plans à la fois (audit 2026-08-12) :
//   1. il partageait les ACTIFS et l'hypothèque, mais gardait 100 % des dettes non immobilières ;
//   2. il était fiscalement INERTE (le ménage restait à 2 contribuables) ;
//   3. le conjoint parti continuait d'encaisser son salaire à vie.
//
// ⚠️ OBSERVABILITÉ — à lire avant de toucher ces tests. Le divorce n'existe QUE dans la branche
// Monte-Carlo (`tryDivorce` exige `enableMonteCarlo`), et `chartData` est TOUJOURS déterministe
// (`[ENG-MC-CONSERVATION-BLIND]`). Mesurer le divorce sur `chartData` donne donc un résultat
// IDENTIQUE avec et sans divorce — j'ai commencé par là et le test ne prouvait rien. La sortie
// réellement consommée est celle du MC : les cônes `P10/P50/P90` posés sur chartData et
// `survivalRatePct`. C'est sur eux qu'on assied les assertions.
import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, Debt } from '../../types';

const DETTE_NON_IMMO = 100_000;

const makeProjection = (o: Partial<ProjectionConfig> = {}): ProjectionConfig => ({
    years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3, ...o,
});

const couple: BudgetConfig = {
    users: [
        { name: 'Marc', grossSalary: 8200, netSalary: 5620, color: '#10b981', age: 30, birthYear: 1996, canadaArrivalYear: 1996, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
        { name: 'Anna', grossSalary: 7100, netSalary: 4995, color: '#3b82f6', age: 30, birthYear: 1996, canadaArrivalYear: 1996, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    ],
    splitMode: '50/50',
};

const debts: Debt[] = [
    { id: 'd1', name: 'Prêt auto', balance: DETTE_NON_IMMO, interestRate: 6, minimumPayment: 900, category: 'Auto' } as unknown as Debt,
];

const goal: RetirementGoal = { targetAge: 60, targetMonthlyIncome: 5500, governmentPension: 1850, lifeExpectancy: 92 };

const makeParams = (proj: Partial<ProjectionConfig>, debtsUsed: Debt[] = debts): SimulationParams => ({
    projection: makeProjection(proj),
    calculatedStartingCash: 15_000,
    liveCSVBalances: { CELI: 40_000, CELIAPP: 0, REER: 60_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: debtsUsed, childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: goal, config: couple,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 1_800,
    baseMonthlyExpenses: 6_801, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

/**
 * Lance le MC (le divorce n'existe que là) et rend le P50 du dernier point + la survie brute.
 *
 * ⚠️ [FLAKE-DIVORCE-INCOME-PHANTOM] — POURQUOI CE HELPER REFUSE PLUTÔT QUE DE RENDRE `NaN`.
 * Il rendait `cd.at(-1)?.P50 ?? NaN`. Or `P50` est explicitement ANNULABLE côté moteur
 * (`projection.ts` : `d.P50 = mcResult.p50Data[i] ?? null`), et `chartData` peut être vide. Une
 * mesure ABSENTE devenait donc un `NaN` silencieux, que le test comparait ensuite à un seuil :
 * `expect(NaN).toBeGreaterThan(0.5)` échoue, mais son message parle du SEUIL — pas du fait qu'il
 * n'y avait rien à comparer. C'est exactement `GARDE-AU-PRODUCTEUR-NE-PROUVE-PAS-LA-CHAINE`
 * (« prouver que la grandeur mesurée est NON NULLE avant de la comparer ; en Monte Carlo les points
 * sont réduits »), leçon déjà indexée dans `CLAUDE.md` — et que ce fichier enfreignait.
 *
 * Ce n'est pas cosmétique : c'est la seule façon connue de rendre ces assertions rouges sans
 * changer le code. La marge y est ÉNORME (mesuré : perte = 1,132 contre un seuil de 0,5, le
 * scénario divorcé finissant à −644 980 $ pour 4 885 681 $ sans divorce) — aucun tremblement
 * numérique ne peut la franchir. Si ces tests redeviennent rouges, ce sera parce qu'une grandeur
 * MANQUE, et le message doit le dire tout de suite plutôt que de faire chercher un défaut de
 * moteur qui n'existe pas.
 *
 * ⚠️ Choix assumé : le helper valide les DEUX grandeurs qu'il publie, donc un appelant qui n'utilise
 * que la survie échoue quand même si `P50` manque. C'est voulu — une exécution Monte-Carlo sans
 * bandes n'est pas partiellement bonne, elle est cassée, et laisser un cas vert dans ce monde-là
 * ferait croire que la moitié du résultat est fiable.
 *
 * ⚠️ Ce que ce lot ne prétend PAS : il ne REPRODUIT pas le flake d'origine. 8 exécutions vertes
 * (5 en isolation, 3 suites complètes) sur le même commit. Ce qui a été MESURÉ, en revanche,
 * réfute les explications faciles — voir `BACKLOG.md`, `[FLAKE-DIVORCE-INCOME-PHANTOM]`.
 */
const runMc = (proj: Partial<ProjectionConfig>, debtsUsed: Debt[] = debts) => {
    const r = calculateFutureProjection(makeParams(proj, debtsUsed), true) as unknown as {
        chartData?: Record<string, number | null>[]; survivalRatePct?: number | null;
    };
    const cd = r.chartData ?? [];
    const dernier = cd[cd.length - 1];

    expect(cd.length, 'chartData VIDE : le moteur n’a produit aucun point, rien à mesurer').toBeGreaterThan(0);
    expect(dernier, 'dernier point de chartData absent').toBeDefined();
    expect(
        dernier?.P50,
        'P50 ABSENT du dernier point — le Monte Carlo n’a pas publié de bande (P50 est annulable : '
        + '`d.P50 = mcResult.p50Data[i] ?? null`). Ce n’est PAS un écart de valeur : il n’y a pas de valeur.',
    ).toEqual(expect.any(Number));
    expect(
        r.survivalRatePct,
        'survivalRatePct ABSENT — le Monte Carlo n’a pas tourné, ou son résultat n’a pas été rattaché.',
    ).toEqual(expect.any(Number));

    return { p50Final: dernier!.P50 as number, survie: r.survivalRatePct as number };
};

// Divorce CERTAIN (probabilité 1) → il se déclenche au 1er janvier de chaque itération, donc
// le résultat est stable d'un run à l'autre malgré le Monte-Carlo.
const DIVORCE_CERTAIN = { divorceEnabled: true, divorceAnnualProbability: 1 };

describe('[ENG-DIVORCE-DEBT-ASYMMETRY] les dettes se partagent comme les actifs', () => {
    it('un divorce qui cède 100 % du patrimoine emporte AUSSI la dette', () => {
        // Montage qui ISOLE la dette : deux runs identiques à un seul détail près — la dette de
        // départ. `divorceSplitPct: 100` ⇒ `keep = 0` : au divorce, tout est cédé.
        //
        // Si les dettes suivent le partage (correctif), la dette de départ est effacée au divorce
        // comme le reste : les deux runs convergent, seuls quelques mois de paiements les séparent.
        // Si elles NE suivent PAS (code d'avant), la dette survit à la coupe et pèse 30 ans —
        // l'audit avait mesuré un patrimoine à −81 827 $ après avoir pourtant tout cédé.
        const avecDette = runMc({ ...DIVORCE_CERTAIN, divorceSplitPct: 100 }, debts);
        const sansDette = runMc({ ...DIVORCE_CERTAIN, divorceSplitPct: 100 }, []);

        const ecart = Math.abs(sansDette.p50Final - avecDette.p50Final);
        expect(ecart, `la dette de ${DETTE_NON_IMMO} $ a survécu à un divorce qui cède TOUT (écart ${Math.round(ecart)} $)`)
            .toBeLessThan(DETTE_NON_IMMO);
    });
});

describe('[FISC-DIVORCE-INCOME-PHANTOM] le ménage passe VRAIMENT à une tête', () => {
    it('un divorce à 50 % coûte bien plus que quelques pourcents du patrimoine final', () => {
        // Avant : le conjoint parti continuait d'encaisser son salaire à vie ET le ménage restait
        // imposé à 2 contribuables → céder la MOITIÉ de tout ne coûtait que ~4 % du patrimoine
        // final (4 682 545 $ contre 4 885 758 $ mesurés). Le revenu fantôme compensait la coupe.
        const avecDivorce = runMc({ ...DIVORCE_CERTAIN, divorceSplitPct: 50 });
        const sansDivorce = runMc({ divorceEnabled: false });

        const perte = (sansDivorce.p50Final - avecDivorce.p50Final) / sansDivorce.p50Final;
        expect(perte, 'céder 50 % du patrimoine ne peut pas coûter ~4 % du résultat final')
            .toBeGreaterThan(0.5);
    });

    it('la survie chute — le divorce n\'est plus un non-événement', () => {
        // ⚠️ Ce résultat est SOMBRE par construction, et c'est une hypothèse ASSUMÉE (décision
        // Marc 2026-08-13) : le moteur ne réduit PAS les dépenses du ménage quand il passe à une
        // tête. Marc garde 100 % des dépenses du couple, à vie, plus la pension alimentaire.
        // Direction volontairement conservatrice. Si un jour un facteur « dépenses solo » est
        // ajouté, CE test est celui qui devra bouger — pas les deux au-dessus.
        const avecDivorce = runMc({ ...DIVORCE_CERTAIN, divorceSplitPct: 50 });
        const sansDivorce = runMc({ divorceEnabled: false });

        expect(sansDivorce.survie).toBeGreaterThan(avecDivorce.survie);
    });
});
