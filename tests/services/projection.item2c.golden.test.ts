// tests/services/projection.item2c.golden.test.ts
//
// [ITEM-2C] FERR PER-CONJOINT : chaque conjoint de 72+ convertit SA part REER (`reerByUser[i]`) au facteur
// RRIF de SON âge, au lieu d'un âge MÉNAGE unique (user1) sur le pool entier.
//
// Avant : le gate FERR (`taxJanuary.ts` `ctx.age >= 72`) lisait l'âge de l'UTILISATEUR 1 (`projection.ts`
// `currentAge = users[0].age`) sur le POOL REER MÉNAGE → pour un couple à écart d'âge, mauvais timing
// (conjoint plus jeune FERR-converti trop tôt ; conjoint plus âgé retardé). `reerByUser` était un SHADOW.
// Après : `taxJanuary` boucle sur `reerByUser` + l'âge de chaque conjoint ; `projection.ts` débite la part
// FERR de chaque conjoint dans le registre. Défaut additif → âges égaux ⇒ Σ = `reer × rate` (identique).
//
// Golden (déterministes, hors Monte-Carlo) :
//   • ANCRES : couple d'âge ÉGAL + SOLO → INCHANGÉS vs le calcul ménage (preuve du défaut additif, zéro régression).
//   • AGE-GAP : timing per-conjoint CORRECT (chaque conjoint à SON 72). Re-basés SCIEMMENT vs l'ancien ménage.
//   • PREUVES DU FIX : assertions qui ÉCHOUENT sur le code ménage d'avant (discriminant git-stash).
// ⚠️ Le bonus PSV 75+ (entremêlé avec le gate de DÉBUT PSV) reste ménage → sous-phase PSV per-conjoint suivante.
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
    couplePsvBonus: retireeCouple(76, 64),     // user1 > 75 → bonus PSV SEULEMENT sur sa part ; user2=64 pas de PSV
    couplePsvStartGap: retireeCouple(66, 63),  // user1=66 (PSV démarrée) ; user2=63 (< 65 → PSV pas encore) — gate de départ per-conjoint
} as const;

describe('[ITEM-2C] gates de timing per-conjoint — FERR (conversion) + PSV/RRQ (départ + bonus 75+)', () => {
    const measure = (config: BudgetConfig) => {
        const r = calculateFutureProjection(makeParams(config));
        return { ferr: ferrOnset(r.chartData), nw: round(r.finalNetWorth), tax: round(r.totalTaxesPaid) };
    };

    // Golden re-basés (projection déterministe, hors Monte-Carlo) APRÈS le fix FERR per-conjoint
    // (`taxJanuary.ts` : boucle sur `reerByUser` + âge par conjoint). Les ANCRES (equal/solo) sont INCHANGÉES
    // vs le comportement ménage (preuve du défaut additif) ; les age-gap reflètent le timing per-conjoint CORRECT.
    // `tax` re-basé SCIEMMENT 2026-08-01 ([PROJ-TTP-DOUBLECOUNT]) : le compteur = Σ FluxImpots
    // seul (les retenues ne sont plus re-comptées) → valeurs cash APRÈS réconciliation de
    // décembre — les remboursements d'avril absorbent l'essentiel des retenues RRIF sur ces
    // profils à faible revenu imposable.
    // Re-basé SCIEMMENT 2026-08-01 ([FISC-BRACKET-REALINDEX]) : paliers/crédits/RAMQ/FSS en $ RÉELS
    // (plus de double indexation) → l'impôt des années tardives REMONTE (`tax` ↑ ~70 %, `nw` ↓
    // ~4-8 %). Direction CONSERVATRICE voulue, mesurée avant/après par git-stash. `ferr` (timing)
    // STRICTEMENT inchangé — le fix ne touche aucun gate d'âge.
    const GOLDEN = {
        // Re-basés SCIEMMENT 2026-09-05 ([FISC-GIS-COUPLE-RATE] lot 169) : la récupération du SRG d'un
        // COUPLE passe de 50 ¢ à 25 ¢ par dollar de revenu combiné pour chaque conjoint → plus de SRG
        // (non imposable) → NW ↑ de 9 383 à 13 506 $, impôt ↓ de 599 à 1 569 $ selon le scénario. Le
        // SOLO ne bouge PAS (contrôle négatif : le barème célibataire est intact) — c'est exactement
        // le partage attendu. Ces ancres pinnent l'AMPLEUR ; la conception per-conjoint est prouvée
        // par les tests « FIX » plus bas, qui restent verts. (Étaient : −82 434/13 337, −82 024/13 337,
        // −78 810/13 351, −84 939/14 165, −82 480/15 044.)
        // Re-basés SCIEMMENT 2026-09-05 ([FISC-DEC-FLUX-ASSIETTE-TIMING] lot 179) : le dépôt fiscal de
        // décembre se fait en FIN de mois — les retraits REER/FERR de décembre de ces retraités
        // n'entraient dans l'assiette d'AUCUNE année (janvier les effaçait). Imposés l'année même :
        // `tax` ↑ de 3 477 à 14 895 $, `nw` ↓ de 2 225 à 9 694 $ selon le scénario ; `ferr` (timing)
        // STRICTEMENT inchangé — le lot ne touche aucun gate d'âge, ce que les tests « FIX » prouvent.
        // Décision Marc 2026-09-05 (réponse 15 : corriger la fuite d'assiette). (Étaient : −68 939/12 680,
        // −68 528/12 680, −65 304/12 701, −116 951/60 210, −75 556/13 566, −72 096/13 475.)
        coupleUser1Older:   { ferr: 24, nw: -71717, tax: 17003 },  // FERR + PSV/RRQ per-conjoint (user2=64 : PSV démarre à SES 65)
        coupleUser1Younger: { ferr: 24, nw: -71307, tax: 17003 },  // idem ; user0=64<65 mais user1=70 touche PSV → SRG calculé (psvMonthly>0)
        coupleEqual:        { ferr: 24, nw: -67529, tax: 16178 },  // ANCRE — inchangé vs ménage
        // Re-basé 2026-08-20 [FISC-PENSION-CREDIT-REAL] (était nw −116 753 / tax 59 919) : le
        // crédit pension féd est désormais déflaté en espace réel → +291 $ d'impôt cumulé
        // (recoupé analytiquement : Σ 0,15 × 0,835 × 2 000 × (d−1) ≈ 288 $), −198 $ de NW.
        // ⚠️ POURQUOI seul le solo bouge (MESURÉ par la revue — ma 1re explication était fausse) :
        // la pension per-adulte des couples est 10× AU-DESSUS du montant déflaté (20 568 vs
        // 1 922 $) — le min prend le MONTANT partout. Mais le fedTax des couples est DÉJÀ clampé
        // à 0 (BPA + montant d'âge > revenu imposable per-adulte) : le crédit non remboursable
        // est perdu, réduire un crédit perdu ne change rien. Si le REVENU des couples monte, ces
        // goldens DOIVENT bouger — ils ne sont pas structurellement insensibles au fix.
        solo:               { ferr: 24, nw: -126645, tax: 75105 }, // ANCRE — inchangé vs ménage ; TP1G-VIVANT-SEUL conservé
        couplePsvBonus:     { ferr: 12, nw: -78720, tax: 18541 },  // bonus PSV 75+ SEULEMENT sur user1=76 ; user2=64 pas de PSV
        couplePsvStartGap:  { ferr: 72, nw: -77043, tax: 21052 },  // user1=66 PSV démarrée ; user2=63 PSV démarre à SES 65
    } as const;

    // ── ANCRES ZÉRO-RÉGRESSION : le fix per-conjoint NE change RIEN quand les âges coïncident ──────
    it('ANCRE — couple d\'âge ÉGAL (70/70) : identique au calcul ménage', () => {
        expect(measure(SCENARIOS.coupleEqual)).toEqual(GOLDEN.coupleEqual);
    });
    it('ANCRE — solo (70) : identique au calcul ménage', () => {
        expect(measure(SCENARIOS.solo)).toEqual(GOLDEN.solo);
    });

    // ── TIMING PER-CONJOINT CORRECT (age-gap) ─────────────────────────────────────────────────────
    it('couple user1 PLUS ÂGÉ (70/64) : seul user1 (72) convertit sa part ; user2 (66) non', () => {
        expect(measure(SCENARIOS.coupleUser1Older)).toEqual(GOLDEN.coupleUser1Older);
    });
    it('couple user1 PLUS JEUNE (64/70) : le conjoint plus âgé déclenche SA FERR à temps', () => {
        expect(measure(SCENARIOS.coupleUser1Younger)).toEqual(GOLDEN.coupleUser1Younger);
    });

    // ── PREUVES DU FIX (ces assertions ÉCHOUENT sur le code ménage d'avant — discriminant git-stash) ──
    it('FIX : l\'âge du conjoint 2 COMPTE désormais — (70/64) ≠ (70/70)', () => {
        // Avant : identiques (gate sur user1 seul). Maintenant : un conjoint de 64 ans ne FERR-convertit pas
        // sa part à 66 ans → le couple 70/64 diverge du couple 70/70.
        expect(measure(SCENARIOS.coupleUser1Older)).not.toEqual(measure(SCENARIOS.coupleEqual));
    });
    it('FIX : un conjoint plus ÂGÉ que user1 déclenche SA FERR à 72 (plus de retard)', () => {
        // (64/70) : le conjoint B a 72 ans au mois 24 → FERR au mois 24 (avant : retardée au mois 96, 72 de A).
        expect(ferrOnset(calculateFutureProjection(makeParams(SCENARIOS.coupleUser1Younger)).chartData)).toBe(24);
    });

    // ── PSV/RRQ PER-CONJOINT (départ + bonus 75+ à l'âge de chaque conjoint) ──────────────────────
    it('couple user1 > 75 (76/64) : bonus PSV 75+ SEULEMENT sur user1 ; user2 (64) pas de PSV', () => {
        expect(measure(SCENARIOS.couplePsvBonus)).toEqual(GOLDEN.couplePsvBonus);
    });
    it('couple départ-gap (66/63) : la PSV de user2 ne démarre pas avant SES 65 ans', () => {
        expect(measure(SCENARIOS.couplePsvStartGap)).toEqual(GOLDEN.couplePsvStartGap);
    });
    // ── PREUVE DU FIX PSV : casse sur le code « PSV ménage sur l'âge user1 » (discriminant) ────────
    it('FIX PSV départ : (66/63) ≠ (66/66) — l\'âge du conjoint 2 décale enfin SA PSV', () => {
        // Avant : la PSV était gatée sur l'âge de user1 (66 ≥ 65) pour les DEUX scénarios → identiques (l'âge
        // de user2, 63 vs 66, était ignoré). Maintenant la PSV de user2=63 ne démarre qu'à SES 65 ans → (66/63)
        // diverge de (66/66). Ce test ÉCHOUE sur le code « PSV ménage » d'avant (les deux y sont égaux).
        expect(measure(SCENARIOS.couplePsvStartGap)).not.toEqual(measure(retireeCouple(66, 66)));
    });
});
