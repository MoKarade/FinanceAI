// tests/services/projection.item2c.golden.test.ts
//
// [ITEM-2C — Phase 0 : caractérisation] Golden tests qui PINNENT le comportement ACTUEL des gates de
// timing de retraite (FERR 72 / reset REER 71) — AVANT le passage per-conjoint. ZÉRO changement moteur ici.
//
// État actuel (vérifié) : le gate FERR (`taxJanuary.ts:173` `ctx.age >= 72`) lit l'âge de l'UTILISATEUR 1
// (`projection.ts:177` `currentAge = users[0].age`) appliqué au POOL REER MÉNAGE (`ctx.reer`). L'âge du
// conjoint 2 n'entre PAS dans la décision. `reerByUser` existe en SHADOW (ne pilote rien).
//
// Ces golden servent de FILET pour la Phase 1 (refactor additif) :
//   • ANCRES ZÉRO-RÉGRESSION : couple d'âge ÉGAL + SOLO → DOIVENT rester identiques après Phase 1.
//   • COMPORTEMENT DOCUMENTÉ (à corriger en Phase 2) : couple à écart d'âge → la FERR se déclenche sur
//     l'âge de l'user1, jamais sur celui du conjoint plus âgé. Ces valeurs seront RE-BASÉES en Phase 2.
import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal } from '../../types';

const makeProjection = (o: Partial<ProjectionConfig> = {}): ProjectionConfig => ({
    // years: 14 → ≥ 96 mois pour le scénario coupleUser1Younger (FERR au mois 96 = user1 64→72).
    years: 14, returnRate: 5, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 6, cash: 1 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3, ...o,
});

// Couple retraité (grossSalary 0) avec âges EXPLICITES (birthYear cohérent avec startYear 2026).
const retireeCouple = (age1: number, age2: number): BudgetConfig => ({
    users: [
        { name: 'A', grossSalary: 0, netSalary: 0, color: '#10b981', age: age1, birthYear: 2026 - age1, canadaArrivalYear: 2026 - age1, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
        { name: 'B', grossSalary: 0, netSalary: 0, color: '#3b82f6', age: age2, birthYear: 2026 - age2, canadaArrivalYear: 2026 - age2, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    ],
    splitMode: '50/50',
});

const retireeSolo = (age1: number): BudgetConfig => ({
    // `config.users` est typé tuple `[User, User]` ; un solo réel = 1 user → cast nécessaire (pas de variante
    // `[User] | [User, User]`). SÛR : le moteur lit `users[0]` pour le gate FERR et `users[1]?.…` partout
    // ailleurs (optional chaining) → aucun crash sur user[1] absent. Cast documenté, pas un contournement.
    users: [{ name: 'A', grossSalary: 0, netSalary: 0, color: '#10b981', age: age1, birthYear: 2026 - age1, canadaArrivalYear: 2026 - age1, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 }] as unknown as BudgetConfig['users'],
    splitMode: '50/50',
});

const NO_INVEST = { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 };
// `governmentPension: 1200` = paramètre de scénario ARBITRAIRE (reproductible), PAS une valeur ARC réelle.
const goal: RetirementGoal = { targetAge: 60, targetMonthlyIncome: 4000, governmentPension: 1200, lifeExpectancy: 95 };

const makeParams = (config: BudgetConfig): SimulationParams => ({
    projection: makeProjection(),
    calculatedStartingCash: 20_000,
    liveCSVBalances: { ...NO_INVEST, REER: 400_000 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: goal, config,
    baseGrossAnnual: 0, baseNetAnnual: 0, currentRentExpense: 0, baseMonthlyExpenses: 3_500,
    startYear: 2026, startMonth: 0,
});

// PAS de `|| 0` : une valeur non finie (régression structurelle du retour moteur) doit rester NaN →
// l'assertion golden ÉCHOUE (pas de faux-vert qui sanitise, cf. leçon NAN-INPUT-HARDENING).
const round = (v: number | undefined): number => Math.round(Number(v));
// 1er mois où la FERR se déclenche (flowEvent « 🏦 FERR »), ou -1 si jamais sur l'horizon.
const ferrOnset = (cd: ReadonlyArray<{ flowEvents?: string[]; monthIndex: number }>): number => {
    const p = cd.find(pt => (pt.flowEvents || []).some(e => /FERR/.test(e)));
    return p ? p.monthIndex : -1;
};

const SCENARIOS = {
    coupleUser1Older: retireeCouple(70, 64),   // user1 (gate) PLUS ÂGÉ → FERR à user1=72
    coupleUser1Younger: retireeCouple(64, 70), // user1 (gate) PLUS JEUNE → FERR à user1=72 (le 72 du conjoint B IGNORÉ = bug)
    coupleEqual: retireeCouple(70, 70),        // ANCRE zéro-régression
    solo: retireeSolo(70),                     // ANCRE zéro-régression
    couplePsvBonus: retireeCouple(76, 64),     // user1 > 75 (bonus PSV) sur base FAMILIALE — borne le gate PSV 75+ (même bug âge=user1)
} as const;

describe('[ITEM-2C Phase 0] caractérisation des gates de timing (FERR/reset) — comportement ACTUEL', () => {
    const measure = (config: BudgetConfig) => {
        const r = calculateFutureProjection(makeParams(config));
        return { ferr: ferrOnset(r.chartData), nw: round(r.finalNetWorth), tax: round(r.totalTaxesPaid) };
    };

    // Golden MESURÉS sur le code actuel (projection déterministe, hors Monte-Carlo). Tout écart en Phase 1
    // sur les ANCRES (equal/solo) = régression ; l'écart attendu en Phase 2 (age-gap) sera re-basé SCIEMMENT.
    const GOLDEN = {
        coupleUser1Older:   { ferr: 24, nw: -72522, tax: 111442 },
        coupleUser1Younger: { ferr: 96, nw: -90067, tax: 102750 },
        coupleEqual:        { ferr: 24, nw: -72522, tax: 111442 },
        solo:               { ferr: 24, nw: -116697, tax: 160409 },
        couplePsvBonus:     { ferr: 12, nw: -81900, tax: 115257 },
    } as const;

    // ── ANCRES ZÉRO-RÉGRESSION (DOIVENT rester identiques après la Phase 1 additive) ───────────────
    it('ANCRE — couple d\'âge ÉGAL (70/70) : golden stable', () => {
        expect(measure(SCENARIOS.coupleEqual)).toEqual(GOLDEN.coupleEqual);
    });
    it('ANCRE — solo (70) : golden stable', () => {
        expect(measure(SCENARIOS.solo)).toEqual(GOLDEN.solo);
    });

    // ── COMPORTEMENT ACTUEL DOCUMENTÉ (buggy — sera RE-BASÉ en Phase 2) ────────────────────────────
    it('couple user1 PLUS ÂGÉ (70/64) : FERR sur l\'âge user1 — golden actuel', () => {
        expect(measure(SCENARIOS.coupleUser1Older)).toEqual(GOLDEN.coupleUser1Older);
    });
    it('couple user1 PLUS JEUNE (64/70) : FERR RETARDÉE aux 72 de user1 (le 72 du conjoint ignoré) — golden actuel', () => {
        expect(measure(SCENARIOS.coupleUser1Younger)).toEqual(GOLDEN.coupleUser1Younger);
    });

    // ── SIGNATURES DU BUG (assertions qui CASSERONT en Phase 2 = preuve que le fix mord) ───────────
    it('BUG actuel : l\'âge du conjoint 2 est IGNORÉ — (70/64) ≡ (70/70) bit-à-bit', () => {
        // Un conjoint de 64 ans devrait voir SA part REER FERR-convertie bien plus tard qu'un conjoint de 70.
        // Aujourd'hui les deux scénarios sont IDENTIQUES → le gate ne regarde que l'user1. (Phase 2 brisera ceci.)
        expect(measure(SCENARIOS.coupleUser1Older)).toEqual(measure(SCENARIOS.coupleEqual));
    });
    it('BUG actuel : un conjoint plus ÂGÉ que user1 ne déclenche PAS sa FERR à 72 (retard)', () => {
        // (64/70) : le conjoint B a 72 ans au mois 24, mais la 1re FERR n'arrive qu'au mois 96 (72 de A).
        expect(ferrOnset(calculateFutureProjection(makeParams(SCENARIOS.coupleUser1Younger)).chartData)).toBe(96);
    });

    // ── BONUS PSV 75+ (gate `age >= 75` = user1, base FAMILIALE — même bug structurel que la FERR) ──
    it('couple user1 > 75 (76/64) : bonus PSV sur l\'âge user1 / base familiale — golden actuel', () => {
        // Aujourd'hui le bonus PSV 75+ s'active sur l'âge de user1 et la PSV est familiale → un conjoint de
        // 64 ans « profite » de l'âge de user1. Un fix per-conjoint (Phase 2) calculera le bonus par personne
        // → nw/tax bougeront. Ce golden borne le gate PSV avant le refactor (recommandation projection-validator).
        expect(measure(SCENARIOS.couplePsvBonus)).toEqual(GOLDEN.couplePsvBonus);
    });
});
