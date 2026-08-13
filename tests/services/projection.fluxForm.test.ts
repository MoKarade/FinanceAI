// tests/services/projection.fluxForm.test.ts
//
// [ENG-INV-FLUXFORM-COVERAGE] INVARIANT DE FORME-FLUX — le chaînon manquant des gardes money.
//
// ⚠️ POURQUOI CETTE GARDE EXISTE, alors que la conservation est déjà couverte. Les invariants
// existants (`projection.moneyConservation`, `projection.fuzzConservation`) comparent des SOLDES
// entre eux : « Σ actifs − dettes == NetWorth ». Ils sont indifférents à la QUESTION D'OÙ VIENT
// l'argent. Un compte qui bouge sans qu'aucun flux ne l'explique les laisse parfaitement VERTS.
//
// C'est exactement ce qui s'est produit avec `[ENG-STRESSTEST-GROWTH-UNREGISTERED]` : le krach et
// la reprise du stress-test multipliaient CELI/REER/NonReg/Crypto sans alimenter aucun
// `MarketGrowth*`. Des centaines de milliers de dollars apparaissaient et disparaissaient, sans
// cause visible, et TOUTES les gardes restaient vertes.
//
// La forme-flux pose la question complémentaire, compte par compte et mois par mois :
//
//      solde(m) − solde(m−1)  ==  MarketGrowth<compte>(m) + NetTransfer<compte>(m)
//
// C'est-à-dire : « toute variation d'un compte est EXPLIQUÉE par les flux publiés ». Un mouvement
// non déclaré la casse. C'est la garde qu'il fallait, et il faut la lire comme un ENGAGEMENT :
// tout futur producteur qui mute un solde doit publier son flux.

import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionChartPoint } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal } from '../../types';

/** Comptes dont la variation DOIT être expliquée par `MarketGrowth<k>` + `NetTransfer<k>`. */
const ACCOUNTS = ['CELI', 'REER', 'Crypto'] as const;

// ⚠️ `NonReg` est ABSENT de cette liste, et c'est un constat mesuré, pas un confort. En écrivant
// cette garde SANS restriction, elle a trouvé un TROISIÈME producteur muet, sans rapport avec le
// stress-test : `processAprilSettlement` verse le remboursement d'impôt au non-enregistré
// (`addNonReg`, `projection.ts:987`) sans publier `contribNonReg`.
// **Mesuré : 29 796,22 $ au mois 123 (un mois d'AVRIL), stress-test désactivé.**
// Il n'est pas corrigé ici : ce mutateur s'exécute AVANT `cashflowAllocation`, qui reçoit
// `contribNonReg` en entrée — y toucher peut déplacer une décision d'allocation dans le même mois,
// ce qui demande sa propre mesure. → ticket `[ENG-APRIL-REFUND-NONREG-UNPUBLISHED]`.
//
// Après les deux correctifs de ce lot, le résiduel MESURÉ vaut 0,01 $ (l'arrondi au cent) sur
// CELI, REER et Crypto — avec ET sans stress-test. Le jour où le ticket ci-dessus sera livré,
// AJOUTER `'NonReg'` ici : c'est la vraie cible.

const users = (age: number) => ([
    { name: 'Marc', grossSalary: 8200, netSalary: 5620, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 7100, netSalary: 4995, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
]);

const params = (proj: Partial<ProjectionConfig>): SimulationParams => ({
    projection: {
        years: 12, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 2_000,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3, ...proj,
    } as ProjectionConfig,
    calculatedStartingCash: 80_000,
    liveCSVBalances: { CELI: 90_000, CELIAPP: 0, REER: 150_000, NON_ENREG: 60_000, CRYPTO: 25_000, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: {
        targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 1_500,
        lifeExpectancy: 92, dbPensionMonthly: 0,
    } as unknown as RetirementGoal,
    config: { users: users(45), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 1_800,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

/**
 * Plus gros résidu |Δsolde − (croissance + transferts)| sur tout l'horizon, avec le contexte du
 * pire mois. Retourne le montant EN DOLLARS : un invariant money se juge en dollars, pas en
 * « ça a l'air bon ».
 */
const worstFluxResidual = (
    data: ProjectionChartPoint[],
    window?: { from: number; to: number },
): { max: number; where: string } => {
    let max = 0;
    let where = '(aucun)';
    const lo = window ? Math.max(1, window.from) : 1;
    const hi = window ? Math.min(data.length - 1, window.to) : data.length - 1;
    for (let i = lo; i <= hi; i++) {
        const prev = data[i - 1] as unknown as Record<string, number>;
        const cur = data[i] as unknown as Record<string, number>;
        for (const k of ACCOUNTS) {
            const delta = (Number(cur[k]) || 0) - (Number(prev[k]) || 0);
            const explained = (Number(cur[`MarketGrowth${k}`]) || 0) + (Number(cur[`NetTransfer${k}`]) || 0);
            const residual = Math.abs(delta - explained);
            if (residual > max) {
                max = residual;
                where = `${k} au mois ${i} : Δ=${delta.toFixed(2)} $ mais flux publiés=${explained.toFixed(2)} $`;
            }
        }
    }
    return { max, where };
};

// Tolérance : les champs du point sont arrondis au CENT (`toFixed(2)`) — deux arrondis par compte
// et par mois. 1 $ laisse la marge sans jamais laisser passer un mouvement réel non déclaré
// (le défaut mesuré valait des dizaines de milliers de dollars sur un seul mois).
const CENT_ROUNDING_TOLERANCE = 1;

describe('[ENG-INV-FLUXFORM-COVERAGE] toute variation de compte est EXPLIQUÉE par un flux publié', () => {
    const STRESS_YEAR = 3;
    const STRESS_RECOVERY = 24;

    it('scénario ordinaire (sans stress-test) : résiduel nul sur TOUT l\'horizon', () => {
        const r = calculateFutureProjection(params({}));
        const { max, where } = worstFluxResidual(r.chartData as ProjectionChartPoint[]);
        expect(max, `mouvement non expliqué — ${where}`).toBeLessThan(CENT_ROUNDING_TOLERANCE);
    });

    // ── LE test discriminant : il ÉCHOUE sur le code d'avant. ──
    it('[ENG-STRESSTEST-GROWTH-UNREGISTERED] krach ET reprise sont publiés comme des flux', () => {
        // Le krach est un mouvement de MARCHÉ : il doit sortir dans `MarketGrowth*`, au même titre
        // qu'un rendement mensuel. Avant le correctif, il mutait les soldes en silence.
        const r = calculateFutureProjection(params({
            stressTestEnabled: true, stressTestYear: STRESS_YEAR, stressTestDrop: 40,
            stressTestRecoveryMonths: STRESS_RECOVERY,
        }));
        const data = r.chartData as ProjectionChartPoint[];
        const { max, where } = worstFluxResidual(data);
        expect(max, `le stress-test mute les soldes sans publier de flux — ${where}`)
            .toBeLessThan(CENT_ROUNDING_TOLERANCE);

        // Garde anti-vacuité : sans elle, un stress-test qui ne se déclencherait pas (mauvaise
        // année, drapeau ignoré) rendrait le test ci-dessus VERT tout en ne mesurant rien.
        const crashMonth = STRESS_YEAR * 12;
        const growthAtCrash = Number((data[crashMonth] as unknown as Record<string, number>).MarketGrowthCELI) || 0;
        expect(growthAtCrash, 'aucun krach observé au mois attendu : la fixture ne déclenche rien')
            .toBeLessThan(0);
    });

    it('le krach est visible dans le TOTAL de croissance, pas seulement par compte', () => {
        // `totalGrowth` est le compteur agrégé consommé par l'UI (« croissance cumulée »). Publier
        // les deltas par compte sans les verser au total laisserait les deux en désaccord.
        const sans = calculateFutureProjection(params({}));
        const avec = calculateFutureProjection(params({
            stressTestEnabled: true, stressTestYear: 3, stressTestDrop: 40, stressTestRecoveryMonths: 24,
        }));
        const gSans = (sans as unknown as { totalGrowth?: number }).totalGrowth ?? 0;
        const gAvec = (avec as unknown as { totalGrowth?: number }).totalGrowth ?? 0;
        expect(gSans, 'fixture sans croissance : le test ne mesure rien').toBeGreaterThan(0);
        // −40 % puis reprise partielle (0,9 × le drop) : le total doit rester STRICTEMENT en deçà.
        expect(gAvec, 'le krach n\'a pas atteint le compteur de croissance agrégé').toBeLessThan(gSans);
    });
});
