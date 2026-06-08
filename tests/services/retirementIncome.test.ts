import { describe, it, expect } from 'vitest';
import { computeRetirementIncome } from '../../services/projection/retirementIncome';
import type { RetirementIncomeCtx } from '../../services/projection/retirementIncome';
import type { RetirementGoal, User } from '../../types';

const baseGoal: RetirementGoal = {
    targetAge: 65,
    targetMonthlyIncome: 5000,
    governmentPension: 2000,
    rrqEstimateMonthly: 800,
    psvEstimateMonthly: 700,
    dbPensionMonthly: 0,
    dbPensionStartAge: 65,
    dbPensionIndexationPct: 100,
};

const baseUser: User = {
    name: 'Test',
    salary: 60000,
    netSalary: 45000,
    birthYear: 1961,
    canadaArrivalYear: 1990,
} as unknown as User;

const baseCtx: RetirementIncomeCtx = {
    m: 0,
    age: 65,
    simInflation: 2,
    activeUsersCount: 1,
    baseGrossAnnual: 60000,
    delayPensions: false,
    survivorMode: false,
    monthlyOasReduction: 0,
    dbSurvivorPct: 0.6,
    rrqSurvivorPct: 0.6,
    psvResidencyYears: [35],
    startYear: 2026,
};

describe('computeRetirementIncome — SRG §7.G regression', () => {
    it('couple: SRG is > 0 when combined income is below threshold', () => {
        // Low-income couple: both RRQ estimates are minimal.
        const coupleGoal: RetirementGoal = {
            ...baseGoal,
            rrqEstimateMonthly: 300,  // per person → 600/month family
            psvEstimateMonthly: 700,  // per person → 1400/month family
        };
        const coupleCtx: RetirementIncomeCtx = {
            ...baseCtx,
            activeUsersCount: 2,
            psvResidencyYears: [35, 35],
        };
        const coupleUsers: User[] = [baseUser, { ...baseUser, name: 'Partner' }];

        const income = computeRetirementIncome(coupleCtx, coupleGoal, coupleUsers);
        // With low income, GIS should kick in — income must exceed RRQ+PSV alone
        const rrqPsvOnly = (300 * 2) * (35 / 40) + (700 * 2) * (35 / 40); // rough family total
        expect(income.total).toBeGreaterThan(rrqPsvOnly * 0.8);
    });

    it('single: SRG computation does not multiply income by activeUsersCount=1 (no double-count)', () => {
        // Single person — ensure otherIncomeAnnualFamily equals rrqMonthly*12, not doubled
        const singleCtx: RetirementIncomeCtx = { ...baseCtx, activeUsersCount: 1 };
        const income1 = computeRetirementIncome(singleCtx, baseGoal, [baseUser]);
        expect(income1.total).toBeGreaterThan(0);
        expect(Number.isFinite(income1.total)).toBe(true);
        // Phase 3 Tier 3 — split par source disponible
        expect(income1.rrq).toBeGreaterThanOrEqual(0);
        expect(income1.psv).toBeGreaterThanOrEqual(0);
        expect(income1.privee).toBeGreaterThanOrEqual(0);
        // Total = somme des composantes - oasReduction (clampé à 0)
        const computed = Math.max(0, income1.rrq + income1.psv + income1.privee - income1.oasReduction);
        expect(income1.total).toBeCloseTo(computed, 1);
    });

    it('couple with minimal pension: GIS is NOT zero (§7.G double-count fix)', () => {
        // Before fix: otherIncomeAnnualFamily = (rrqMonthly) * 12 * 2 → over GIS threshold
        // After fix: otherIncomeAnnualFamily = (rrqMonthly) * 12 → correct
        const lowIncomeGoal: RetirementGoal = {
            ...baseGoal,
            rrqEstimateMonthly: 100,   // very low per-person
            psvEstimateMonthly: 700,
        };
        const coupleCtx: RetirementIncomeCtx = {
            ...baseCtx,
            activeUsersCount: 2,
            psvResidencyYears: [40, 40], // full PSV
        };
        const income = computeRetirementIncome(coupleCtx, lowIncomeGoal, [baseUser, baseUser]);
        // GIS should push total above raw PSV+RRQ
        const rawPsvRrq = (700 * 2 + 100 * 2); // family monthly
        expect(income.total).toBeGreaterThan(rawPsvRrq * 0.85);
    });
});

// Goal à revenu élevé : RRQ assez haut pour annuler le SRG (GIS=0), ce qui isole
// la PSV pure et permet d'asserter le bonus 75+ exactement (sinon le SRG, non
// bonifié, dilue le ratio).
const highPensionGoal: RetirementGoal = {
    ...baseGoal,
    rrqEstimateMonthly: 4000,
    psvEstimateMonthly: 700,
};

describe('computeRetirementIncome — report / survivant / immigrant / bonus 75+', () => {
    it('report des rentes (delayPensions) → RRQ démarre à 72 (×1,588) et PSV à 70 (×1,36)', () => {
        // delayPensions → RRQ 72 (report étendu depuis 2024) / PSV 70. À 72 ans, les deux ont démarré.
        const ctx72 = { ...baseCtx, age: 72 };
        const standard = computeRetirementIncome({ ...ctx72, delayPensions: false }, baseGoal, [baseUser]);
        const delayed = computeRetirementIncome({ ...ctx72, delayPensions: true }, baseGoal, [baseUser]);
        expect(delayed.rrq).toBeGreaterThan(standard.rrq); // ×1,588 vs ×1,0
        expect(delayed.psv).toBeGreaterThanOrEqual(standard.psv); // ×1,36 vs ×1,0
    });

    it('CORRECTIF — retraite TARDIVE (targetAge 71) : rentes touchées dès 65, pas à 71', () => {
        // Bug Marc 2026-06 : l'ancien max(60/65, targetAge) ne versait aucune rente avant l'âge
        // d'arrêt. Désormais début = min(targetAge, 65) = 65 → rente présente à 65 même si on
        // prévoit d'arrêter à 71.
        const lateGoal: RetirementGoal = { ...baseGoal, targetAge: 71 };
        const at65 = computeRetirementIncome({ ...baseCtx, age: 65 }, lateGoal, [baseUser]);
        expect(at65.rrq).toBeGreaterThan(0);
        expect(at65.psv).toBeGreaterThan(0);
    });

    it('bonification PSV +10% exactement à 75 ans (pas à 74), SRG neutralisé', () => {
        const at74 = computeRetirementIncome({ ...baseCtx, age: 74 }, highPensionGoal, [baseUser]);
        const at75 = computeRetirementIncome({ ...baseCtx, age: 75 }, highPensionGoal, [baseUser]);
        // même m → même inflFactor ; GIS=0 (revenu RRQ élevé) → seul le bonus ×1.10 diffère
        expect(at75.psv / at74.psv).toBeCloseTo(1.10, 2);
    });

    it('survivorMode → RRQ × (0.5 + 0.5·rrqSurvivorPct) = ×0.8 par défaut (rrqSurvivorPct=0.6)', () => {
        const std = computeRetirementIncome(baseCtx, baseGoal, [baseUser]);
        const surv = computeRetirementIncome({ ...baseCtx, survivorMode: true }, baseGoal, [baseUser]);
        // la RRQ n'inclut pas le SRG → ratio exact indépendant du GIS
        expect(surv.rrq / std.rrq).toBeCloseTo(0.8, 4);
        expect(surv.total).toBeLessThanOrEqual(std.total);
    });

    it('résidence < 10 ans → PSV = 0 (règle Service Canada), RRQ inchangée', () => {
        const immigrant = computeRetirementIncome({ ...baseCtx, psvResidencyYears: [5] }, baseGoal, [baseUser]);
        expect(immigrant.psv).toBeCloseTo(0, 6);
        expect(immigrant.rrq).toBeGreaterThan(0);
    });

    it('résidence partielle (20/40) → PSV strictement inférieure à la pleine résidence (40/40)', () => {
        const full = computeRetirementIncome({ ...baseCtx, psvResidencyYears: [40] }, highPensionGoal, [baseUser]);
        const half = computeRetirementIncome({ ...baseCtx, psvResidencyYears: [20] }, highPensionGoal, [baseUser]);
        expect(half.psv).toBeLessThan(full.psv);
    });

    it('avant l\'âge d\'admissibilité (60 ans, départ 65) → aucune rente versée', () => {
        const young = computeRetirementIncome({ ...baseCtx, age: 60 }, baseGoal, [baseUser]);
        expect(young.rrq).toBeCloseTo(0, 6);
        expect(young.psv).toBeCloseTo(0, 6);
    });

    it('écrêtement PSV supérieur au revenu → total clampé à 0 (jamais négatif)', () => {
        const clamped = computeRetirementIncome({ ...baseCtx, monthlyOasReduction: 999999 }, baseGoal, [baseUser]);
        expect(clamped.total).toBe(0);
        expect(clamped.oasReduction).toBe(999999);
    });

    it('pension privée DB versée seulement à partir de dbPensionStartAge', () => {
        const goalDb: RetirementGoal = { ...baseGoal, dbPensionMonthly: 1000, dbPensionStartAge: 65 };
        const before = computeRetirementIncome({ ...baseCtx, age: 64 }, goalDb, [baseUser]);
        const after = computeRetirementIncome({ ...baseCtx, age: 65 }, goalDb, [baseUser]);
        expect(before.privee).toBeCloseTo(0, 6);
        expect(after.privee).toBeGreaterThan(0);
    });

    it('invariant : toutes les composantes finies et ≥ 0 (cas âgé, longue projection)', () => {
        const r = computeRetirementIncome({ ...baseCtx, age: 80, simInflation: 3, m: 180 }, highPensionGoal, [baseUser]);
        for (const v of [r.total, r.rrq, r.psv, r.privee, r.oasReduction]) {
            expect(Number.isFinite(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
        }
    });
});

describe('computeRetirementIncome — décomposition PAR conjoint (A1)', () => {
    const mkEarner = (gross: number): User =>
        ({ ...baseUser, grossSalary: gross } as User);

    it('solo : perUser a 1 entrée et perUser[0].total == total famille', () => {
        const r = computeRetirementIncome(baseCtx, baseGoal, [mkEarner(50000)]);
        expect(r.perUser).toHaveLength(1);
        expect(r.perUser[0].total).toBeCloseTo(r.total, 4);
    });

    it('couple : invariant — la somme des perUser.total == total famille', () => {
        const coupleCtx: RetirementIncomeCtx = {
            ...baseCtx, activeUsersCount: 2, psvResidencyYears: [40, 40],
        };
        const r = computeRetirementIncome(coupleCtx, baseGoal, [mkEarner(80000), mkEarner(20000)]);
        expect(r.perUser).toHaveLength(2);
        const sum = r.perUser.reduce((s, p) => s + p.total, 0);
        expect(sum).toBeCloseTo(r.total, 3);
        // Idem composante par composante (rrq/psv/privée).
        expect(r.perUser.reduce((s, p) => s + p.rrq, 0)).toBeCloseTo(r.rrq, 3);
        expect(r.perUser.reduce((s, p) => s + p.psv, 0)).toBeCloseTo(r.psv, 3);
        expect(r.perUser.reduce((s, p) => s + p.privee, 0)).toBeCloseTo(r.privee, 3);
    });

    it('couple à salaires INÉGAUX → RRQ par conjoint inégale (le plus haut salaire a plus de RRQ)', () => {
        const coupleCtx: RetirementIncomeCtx = {
            ...baseCtx, activeUsersCount: 2, psvResidencyYears: [40, 40],
        };
        // 80k vs 20k, tous deux SOUS la MGA (74 600) pour le 20k → ratios distincts.
        const r = computeRetirementIncome(coupleCtx, baseGoal, [mkEarner(70000), mkEarner(20000)]);
        expect(r.perUser[0].rrq).toBeGreaterThan(r.perUser[1].rrq);
    });

    it('couple à salaires ÉGAUX → RRQ par conjoint identique (chacun la moitié)', () => {
        const coupleCtx: RetirementIncomeCtx = {
            ...baseCtx, activeUsersCount: 2, psvResidencyYears: [40, 40],
        };
        const r = computeRetirementIncome(coupleCtx, baseGoal, [mkEarner(50000), mkEarner(50000)]);
        expect(r.perUser[0].rrq).toBeCloseTo(r.perUser[1].rrq, 4);
        expect(r.perUser[0].total).toBeCloseTo(r.perUser[1].total, 4);
    });

    it('résidence PSV inégale → PSV (volet OAS) plus élevée pour le conjoint résident plus longtemps', () => {
        const coupleCtx: RetirementIncomeCtx = {
            ...baseCtx, activeUsersCount: 2, psvResidencyYears: [40, 20],
        };
        const r = computeRetirementIncome(coupleCtx, highPensionGoal, [mkEarner(50000), mkEarner(50000)]);
        // highPensionGoal annule le SRG (réparti également) → la PSV reflète la résidence.
        expect(r.perUser[0].psv).toBeGreaterThan(r.perUser[1].psv);
    });
});

describe('computeRetirementIncome — ratio RRQ indexé (B-AUDIT-4)', () => {
    it('la RRQ réelle (déflatée) d\'un même salarié ne rétrécit pas selon les années avant la retraite', () => {
        // Salaire SOUS la MGA (sinon ratio capé à 1, effet masqué). Même personne,
        // même âge de départ (65) : seul m (années écoulées) change. Le ratio
        // earnings/MGA doit rester stable → la RRQ réelle (hors inflation) identique.
        // Avant le fix : currentGross non indexé vs MGA indexée → ratio rétrécit → RRQ
        // sous-évaluée pour un départ lointain.
        const earner = { ...baseUser, grossSalary: 50000 } as User;
        const now = computeRetirementIncome({ ...baseCtx, age: 65, m: 0, simInflation: 2 }, baseGoal, [earner]);
        const later = computeRetirementIncome({ ...baseCtx, age: 65, m: 240, simInflation: 2 }, baseGoal, [earner]);
        const deflate = (rrq: number, m: number) => rrq / Math.pow(1.02, m / 12);
        expect(deflate(later.rrq, 240)).toBeCloseTo(deflate(now.rrq, 0), 0);
    });
});
