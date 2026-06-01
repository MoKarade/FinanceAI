/**
 * Caractérisation + invariants de computeActiveIncome (phase active).
 *
 * Logique couverte (services/projection/activeIncome.ts) :
 *  - croissance salariale composée (1 + g/100)^floor(m/12)
 *  - perte d'emploi → revenu Marc × 0.55 (AE)
 *  - invalidité LTD → revenu Marc × ltdIncomeReplacementPct/100 (défaut 60 %)
 *  - bonus / RSU / side income lissés /12 et taxés ×0.55
 *  - survivorMode → revenu, bonus, RSU, side du 2e conjoint (Anna) à 0
 *
 * Stratégie d'isolation : enableMonteCarlo=false par défaut → aucun trigger
 * stochastique ne peut se déclencher, on contrôle chômage/LTD via les compteurs
 * d'état (unemployedMonthsRemaining / ltdMonthsRemaining). Pour tester les
 * déclenchements, on force MC=true + janvier (currentMonthIndex=0, m=12) + rng=0.
 *
 * NE MODIFIE PAS le source. Tests de caractérisation du comportement actuel.
 */
import { describe, it, expect } from 'vitest';
import { computeActiveIncome } from '../../services/projection/activeIncome';
import type { ActiveIncomeCtx } from '../../services/projection/activeIncome';
import type { ProjectionConfig, User } from '../../types';

const proj = (o: Record<string, unknown> = {}): ProjectionConfig => o as unknown as ProjectionConfig;
const user = (o: Record<string, unknown> = {}): User => o as unknown as User;

// Contexte de base : MC désactivé → pas de trigger; pas de croissance (g=0);
// salaires nets 5000 (Marc) / 4000 (Anna); bruts 100k / 80k.
function baseCtx(overrides: Partial<ActiveIncomeCtx> = {}): ActiveIncomeCtx {
    return {
        m: 0,
        currentMonthIndex: 6,
        simSalaryGrowth: 0,
        enableMonteCarlo: false,
        rng: () => 0.999,
        incomeMarcNetMonthly: 5000,
        incomeAnnaNetMonthly: 4000,
        survivorMode: false,
        grossMarcBaseAnnual: 100000,
        grossAnnaBaseAnnual: 80000,
        unemployedMonthsRemaining: 0,
        ltdMonthsRemaining: 0,
        ltdLogged: false,
        ...overrides,
    };
}

// Deux salariés sans revenus variables (bonus/RSU/side tous absents).
const plainUsers: User[] = [user(), user()];

describe('computeActiveIncome — revenu de base', () => {
    it('sans croissance ni revenu variable : revenus = salaires nets injectés', () => {
        const r = computeActiveIncome(baseCtx(), proj(), plainUsers);
        expect(r.incomeMarc).toBe(5000);
        expect(r.incomeAnna).toBe(4000);
        expect(r.monthlyIncome).toBe(9000);
    });

    it('monthlyIncome est toujours la somme incomeMarc + incomeAnna', () => {
        const r = computeActiveIncome(baseCtx({ simSalaryGrowth: 3, m: 24 }), proj(), plainUsers);
        expect(r.monthlyIncome).toBeCloseTo(r.incomeMarc + r.incomeAnna, 6);
    });

    it('aucun revenu variable → accGrossAdd = (brutMarc + brutAnna) / 12', () => {
        const r = computeActiveIncome(baseCtx(), proj(), plainUsers);
        expect(r.accGrossAdd).toBeCloseTo((100000 + 80000) / 12, 6);
    });
});

describe('computeActiveIncome — croissance salariale', () => {
    it('année 0 (m < 12) : facteur de croissance = 1', () => {
        const r = computeActiveIncome(baseCtx({ simSalaryGrowth: 10, m: 11 }), proj(), plainUsers);
        expect(r.incomeMarc).toBe(5000);
        expect(r.incomeAnna).toBe(4000);
    });

    it('composée par années pleines : m=24, g=2% → ×1.02^2', () => {
        const factor = Math.pow(1.02, 2);
        const r = computeActiveIncome(baseCtx({ simSalaryGrowth: 2, m: 24 }), proj(), plainUsers);
        expect(r.incomeMarc).toBeCloseTo(5000 * factor, 6);
        expect(r.incomeAnna).toBeCloseTo(4000 * factor, 6);
    });

    it('invariant : croissance positive ⇒ revenu ≥ revenu de base', () => {
        const base = computeActiveIncome(baseCtx({ m: 36 }), proj(), plainUsers);
        const grown = computeActiveIncome(baseCtx({ simSalaryGrowth: 4, m: 36 }), proj(), plainUsers);
        expect(grown.incomeMarc).toBeGreaterThanOrEqual(base.incomeMarc);
        expect(grown.incomeAnna).toBeGreaterThanOrEqual(base.incomeAnna);
    });
});

describe('computeActiveIncome — perte d\'emploi (AE 55%)', () => {
    it('chômage déjà en cours (unemployedMonths > 0) → revenu Marc × 0.55', () => {
        const r = computeActiveIncome(baseCtx({ unemployedMonthsRemaining: 4 }), proj(), plainUsers);
        expect(r.incomeMarc).toBeCloseTo(5000 * 0.55, 6);
    });

    it('le chômage ne touche QUE le revenu de Marc, pas celui d\'Anna', () => {
        const r = computeActiveIncome(baseCtx({ unemployedMonthsRemaining: 4 }), proj(), plainUsers);
        expect(r.incomeAnna).toBe(4000);
    });

    it('le compteur de chômage en cours est décrémenté (4 → 3)', () => {
        const r = computeActiveIncome(baseCtx({ unemployedMonthsRemaining: 4 }), proj(), plainUsers);
        expect(r.newUnemployedMonths).toBe(3);
    });

    it('déclenchement stochastique en janvier (MC, rng=0) → ×0.55 + log + durée', () => {
        const p = proj({ jobLossEnabled: true, jobLossAnnualProbability: 0.5, jobLossDurationMonths: 8 });
        const r = computeActiveIncome(
            baseCtx({ enableMonteCarlo: true, currentMonthIndex: 0, m: 12, rng: () => 0 }),
            p,
            plainUsers,
        );
        expect(r.incomeMarc).toBeCloseTo(5000 * 0.55, 6);
        expect(r.newUnemployedMonths).toBe(8);
        expect(r.lifeEventLogs.some(l => l.includes('Perte d\'emploi'))).toBe(true);
    });

    it('MC désactivé : pas de chômage même avec rng=0', () => {
        const r = computeActiveIncome(
            baseCtx({ enableMonteCarlo: false, currentMonthIndex: 0, m: 12, rng: () => 0 }),
            proj({ jobLossEnabled: true, jobLossAnnualProbability: 1 }),
            plainUsers,
        );
        expect(r.incomeMarc).toBe(5000);
        expect(r.lifeEventLogs).toHaveLength(0);
    });
});

describe('computeActiveIncome — invalidité longue durée (LTD)', () => {
    it('LTD en cours → revenu Marc × 60 % (défaut)', () => {
        const r = computeActiveIncome(baseCtx({ ltdMonthsRemaining: 12 }), proj(), plainUsers);
        expect(r.incomeMarc).toBeCloseTo(5000 * 0.6, 6);
    });

    it('taux de remplacement LTD configurable (ltdIncomeReplacementPct=70)', () => {
        const r = computeActiveIncome(
            baseCtx({ ltdMonthsRemaining: 12 }),
            proj({ ltdIncomeReplacementPct: 70 }),
            plainUsers,
        );
        expect(r.incomeMarc).toBeCloseTo(5000 * 0.7, 6);
    });

    it('LTD ne touche que Marc, pas Anna', () => {
        const r = computeActiveIncome(baseCtx({ ltdMonthsRemaining: 12 }), proj(), plainUsers);
        expect(r.incomeAnna).toBe(4000);
    });

    it('compteur LTD en cours décrémenté + log émis une fois (ltdLogged passe true)', () => {
        const r = computeActiveIncome(baseCtx({ ltdMonthsRemaining: 12, ltdLogged: false }), proj(), plainUsers);
        expect(r.newLtdMonths).toBe(11);
        expect(r.ltdLogged).toBe(true);
        expect(r.lifeEventLogs.some(l => l.includes('Invalidité'))).toBe(true);
    });

    it('LTD déjà loggée → pas de nouveau log', () => {
        const r = computeActiveIncome(baseCtx({ ltdMonthsRemaining: 12, ltdLogged: true }), proj(), plainUsers);
        expect(r.lifeEventLogs.some(l => l.includes('Invalidité'))).toBe(false);
    });

    it('chômage ET LTD simultanés se cumulent (×0.55 puis ×0.60)', () => {
        const r = computeActiveIncome(
            baseCtx({ unemployedMonthsRemaining: 3, ltdMonthsRemaining: 3 }),
            proj(),
            plainUsers,
        );
        expect(r.incomeMarc).toBeCloseTo(5000 * 0.55 * 0.6, 6);
    });
});

describe('computeActiveIncome — bonus / RSU / side income', () => {
    it('bonus lissé /12 et taxé ×0.55 ajouté au net de Marc', () => {
        // bonus = 10% de 100k = 10000/an → 833.33/mois brut → ×0.55 net
        const users: User[] = [user({ bonusPctOfGross: 10 }), user()];
        const r = computeActiveIncome(baseCtx(), proj(), users);
        const bonusNet = (100000 * 0.10 / 12) * 0.55;
        expect(r.incomeMarc).toBeCloseTo(5000 + bonusNet, 6);
    });

    it('RSU lissé /12 et taxé ×0.55 tant que rsuYearsRemaining > années écoulées', () => {
        const users: User[] = [user({ rsuVestingPerYear: 24000, rsuYearsRemaining: 5 }), user()];
        const r = computeActiveIncome(baseCtx(), proj(), users);
        const rsuNet = (24000 / 12) * 0.55;
        expect(r.incomeMarc).toBeCloseTo(5000 + rsuNet, 6);
    });

    it('RSU expire quand années écoulées ≥ rsuYearsRemaining', () => {
        // m=60 → 5 années écoulées; rsuYearsRemaining=5 → 5 > 5 faux → pas de RSU
        const users: User[] = [user({ rsuVestingPerYear: 24000, rsuYearsRemaining: 5 }), user()];
        const r = computeActiveIncome(baseCtx({ m: 60 }), proj(), users);
        expect(r.incomeMarc).toBe(5000);
    });

    it('side income annuel lissé /12 et taxé ×0.55', () => {
        const users: User[] = [user({ sideIncomeAnnual: 12000 }), user()];
        const r = computeActiveIncome(baseCtx(), proj(), users);
        const sideNet = (12000 / 12) * 0.55;
        expect(r.incomeMarc).toBeCloseTo(5000 + sideNet, 6);
    });

    it('revenus variables d\'Anna ajoutés à son revenu (couple actif)', () => {
        const users: User[] = [user(), user({ bonusPctOfGross: 20, sideIncomeAnnual: 6000 })];
        const r = computeActiveIncome(baseCtx(), proj(), users);
        const bonusNet = (80000 * 0.20 / 12) * 0.55;
        const sideNet = (6000 / 12) * 0.55;
        expect(r.incomeAnna).toBeCloseTo(4000 + bonusNet + sideNet, 6);
    });

    it('revenus variables croissent avec le facteur salarial (bonus/side basés sur le brut)', () => {
        const users: User[] = [user({ bonusPctOfGross: 10 }), user()];
        const base = computeActiveIncome(baseCtx(), proj(), users);
        const grown = computeActiveIncome(baseCtx({ simSalaryGrowth: 5, m: 24 }), proj(), users);
        // Le revenu de base ET le bonus croissent → strictement supérieur
        expect(grown.incomeMarc).toBeGreaterThan(base.incomeMarc);
    });
});

describe('computeActiveIncome — survivorMode (décès du 2e conjoint)', () => {
    it('survivorMode → revenu d\'Anna = 0', () => {
        const r = computeActiveIncome(baseCtx({ survivorMode: true }), proj(), plainUsers);
        expect(r.incomeAnna).toBe(0);
    });

    it('survivorMode → bonus/RSU/side d\'Anna ignorés (revenu Anna reste 0)', () => {
        const users: User[] = [
            user(),
            user({ bonusPctOfGross: 50, rsuVestingPerYear: 50000, sideIncomeAnnual: 50000 }),
        ];
        const r = computeActiveIncome(baseCtx({ survivorMode: true }), proj(), users);
        expect(r.incomeAnna).toBe(0);
    });

    it('survivorMode → revenu de Marc inchangé', () => {
        const r = computeActiveIncome(baseCtx({ survivorMode: true }), proj(), plainUsers);
        expect(r.incomeMarc).toBe(5000);
    });

    it('survivorMode → brut d\'Anna exclu de accGrossAdd (= brutMarc / 12)', () => {
        const r = computeActiveIncome(baseCtx({ survivorMode: true }), proj(), plainUsers);
        expect(r.accGrossAdd).toBeCloseTo(100000 / 12, 6);
    });

    it('invariant : monthlyIncome en survivorMode ≤ monthlyIncome couple complet', () => {
        const couple = computeActiveIncome(baseCtx({ survivorMode: false }), proj(), plainUsers);
        const survivor = computeActiveIncome(baseCtx({ survivorMode: true }), proj(), plainUsers);
        expect(survivor.monthlyIncome).toBeLessThanOrEqual(couple.monthlyIncome);
    });
});

describe('computeActiveIncome — invariants généraux', () => {
    it('tous les montants retournés sont finis (pas de NaN/Infinity)', () => {
        const users: User[] = [
            user({ bonusPctOfGross: 15, rsuVestingPerYear: 30000, rsuYearsRemaining: 10, sideIncomeAnnual: 8000 }),
            user({ bonusPctOfGross: 8, sideIncomeAnnual: 4000 }),
        ];
        const r = computeActiveIncome(baseCtx({ simSalaryGrowth: 3, m: 48 }), proj(), users);
        for (const v of [r.incomeMarc, r.incomeAnna, r.monthlyIncome, r.accGrossAdd, r.newUnemployedMonths, r.newLtdMonths]) {
            expect(Number.isFinite(v)).toBe(true);
        }
    });

    it('users vides (tableau []) → revenus de base sans crash', () => {
        const r = computeActiveIncome(baseCtx(), proj(), []);
        expect(r.incomeMarc).toBe(5000);
        expect(r.incomeAnna).toBe(4000);
    });
});
