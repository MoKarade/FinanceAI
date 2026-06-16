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
    // gross = salaire ANNUEL pour la lisibilité ; le store stocke du MENSUEL (utils/salary.ts) et le
    // moteur annualise (FISC-RRQ-UNIT) → on divise par 12 pour refléter la convention réelle.
    const mkEarner = (annualGross: number): User =>
        ({ ...baseUser, grossSalary: annualGross / 12 } as User);

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
        const earner = { ...baseUser, grossSalary: 50000 / 12 } as User; // 50k$/an → mensuel (store)
        const now = computeRetirementIncome({ ...baseCtx, age: 65, m: 0, simInflation: 2 }, baseGoal, [earner]);
        const later = computeRetirementIncome({ ...baseCtx, age: 65, m: 240, simInflation: 2 }, baseGoal, [earner]);
        const deflate = (rrq: number, m: number) => rrq / Math.pow(1.02, m / 12);
        expect(deflate(later.rrq, 240)).toBeCloseTo(deflate(now.rrq, 0), 0);
    });
});

describe('FISC-RRQ-UNIT — grossSalary MENSUEL annualisé pour le ratio earnings/MGA', () => {
    it('un haut salarié (6000$/mois = 72k$/an) a une RRQ SUPÉRIEURE au profil fallback — pas ~12× inférieure', () => {
        // baseUser n'a pas de grossSalary → fallback baseGrossAnnual=60000 (annuel) → ratio ~0,80.
        // highEarner gagne 6000$/MOIS = 72 000$/an (> 60k, proche MGA) → ratio attendu ~0,96 > 0,80.
        // AVANT le fix : grossSalary 6000 (mensuel) comparé à la MGA ANNUELLE (~74 600) → ratio ~0,08
        // → RRQ aberrante, INFÉRIEURE au profil fallback. Ce test discrimine le bug d'unité.
        const highEarner = { ...baseUser, grossSalary: 6000 } as User; // 72k$/an
        const base = computeRetirementIncome(baseCtx, baseGoal, [baseUser]);
        const high = computeRetirementIncome(baseCtx, baseGoal, [highEarner]);
        expect(high.rrq).toBeGreaterThan(base.rrq);
    });
});

// ──────────────────────────────────────────────────────────────────────────
// FA-3 (audit 2026-06-09) : SRG — champ exposé + assiette de réduction élargie
// ──────────────────────────────────────────────────────────────────────────
describe('FA-3 (audit 2026-06-09) : SRG exposé (gis) + test de réduction sur le revenu de l\'année précédente', () => {
    // Profil bas revenu : RRQ minime → SRG substantiel attendu.
    const lowIncomeGoal: RetirementGoal = {
        ...baseGoal,
        rrqEstimateMonthly: 300,
        psvEstimateMonthly: 700,
    };
    const lowEarner = { ...baseUser, grossSalary: 20000 / 12 } as User; // 20k$/an → mensuel (store)

    it('FA-3a — breakdown.gis exposé, > 0 pour un bas revenu 65+, et INCLUS dans psv/total (revenu cash)', () => {
        const r = computeRetirementIncome(baseCtx, lowIncomeGoal, [lowEarner]);
        expect(r.gis).toBeGreaterThan(0);
        // Le SRG fait partie du revenu cash : psv (PSV+SRG) ≥ gis, et total cohérent.
        expect(r.psv).toBeGreaterThanOrEqual(r.gis);
        expect(r.total).toBeCloseTo(r.rrq + r.psv + r.privee - baseCtx.monthlyOasReduction, 5);
    });

    it('FA-3b — RÉGRESSION CLÉ : des retraits REER l\'année précédente RÉDUISENT le SRG (~50 ¢/$)', () => {
        // Avant FA-3b : otherIncome = RRQ+DB seuls → un retraité FIRE vivant de retraits
        // REER affichait un SRG fictif plein. 20 000 $ de retraits N-1 doivent réduire
        // le SRG d'environ 10 000 $/an (taux 50 %), à m=0 (inflFactor=1, nominal=réel).
        const sans = computeRetirementIncome({ ...baseCtx, otherIncomeAnnualLaggedNominal: 0 }, lowIncomeGoal, [lowEarner]);
        const avec = computeRetirementIncome({ ...baseCtx, otherIncomeAnnualLaggedNominal: 20000 }, lowIncomeGoal, [lowEarner]);
        expect(sans.gis).toBeGreaterThan(0);
        expect(avec.gis).toBeLessThan(sans.gis);
        const reductionAnnuelle = (sans.gis - avec.gis) * 12;
        // ~50 % du revenu ajouté, borné par le SRG disponible (tolérance : barème par paliers).
        expect(reductionAnnuelle).toBeGreaterThan(20000 * 0.35);
        expect(reductionAnnuelle).toBeLessThanOrEqual(20000 * 0.55 + 1);
    });

    it('FA-3b — assez de revenu N-1 → SRG à ZÉRO (pas de SRG fictif pour un gros meltdown REER)', () => {
        const r = computeRetirementIncome({ ...baseCtx, otherIncomeAnnualLaggedNominal: 80000 }, lowIncomeGoal, [lowEarner]);
        expect(r.gis).toBe(0);
    });

    it('FA-3b — revenu décalé NÉGATIF clampé à 0 (jamais d\'augmentation du SRG)', () => {
        const sans = computeRetirementIncome(baseCtx, lowIncomeGoal, [lowEarner]);
        const neg = computeRetirementIncome({ ...baseCtx, otherIncomeAnnualLaggedNominal: -50000 }, lowIncomeGoal, [lowEarner]);
        expect(neg.gis).toBeCloseTo(sans.gis, 5);
    });

    // [PV-9] Les gains en capital RÉALISÉS de l'année précédente (montant imposable ×0,5) entrent
    // dans le test de revenu du SRG → réduisent le SRG (~50 ¢ par $ d'inclusion).
    it('PV-9 — des gains réalisés N-1 RÉDUISENT le SRG (sur le montant imposable ×0,5)', () => {
        const sans = computeRetirementIncome({ ...baseCtx, prevYearCapitalGainsForGisNominal: 0 }, lowIncomeGoal, [lowEarner]);
        const avec = computeRetirementIncome({ ...baseCtx, prevYearCapitalGainsForGisNominal: 20000 }, lowIncomeGoal, [lowEarner]);
        expect(avec.gis).toBeLessThan(sans.gis);
        // 20 000 $ bruts → 10 000 $ imposables ; réduction SRG ≈ 50 ¢/$ d'inclusion = ~5 000 $/an,
        // bornée par le SRG disponible. On vérifie le SENS + l'ordre de grandeur (montant imposable).
        const reductionAnnuelle = (sans.gis - avec.gis) * 12;
        expect(reductionAnnuelle).toBeGreaterThan(10000 * 0.35);
        expect(reductionAnnuelle).toBeLessThanOrEqual(10000 * 0.5 + 1);
    });

    it('PV-9 — gains réalisés == retraits REER pour le test SRG (même assiette imposable, ×0,5 vs ×1)', () => {
        // 20 000 $ de gains (×0,5 = 10 000 imposables) doit réduire le SRG comme 10 000 $ de retraits REER.
        const parGains = computeRetirementIncome({ ...baseCtx, prevYearCapitalGainsForGisNominal: 20000 }, lowIncomeGoal, [lowEarner]);
        const parReer = computeRetirementIncome({ ...baseCtx, otherIncomeAnnualLaggedNominal: 10000 }, lowIncomeGoal, [lowEarner]);
        expect(parGains.gis).toBeCloseTo(parReer.gis, 5);
    });

    it('PV-9 — gains N-1 négatifs/NaN clampés (jamais d\'augmentation du SRG)', () => {
        const sans = computeRetirementIncome(baseCtx, lowIncomeGoal, [lowEarner]);
        const neg = computeRetirementIncome({ ...baseCtx, prevYearCapitalGainsForGisNominal: -30000 }, lowIncomeGoal, [lowEarner]);
        const nan = computeRetirementIncome({ ...baseCtx, prevYearCapitalGainsForGisNominal: NaN }, lowIncomeGoal, [lowEarner]);
        expect(neg.gis).toBeCloseTo(sans.gis, 5);
        expect(nan.gis).toBeCloseTo(sans.gis, 5);
    });

    it('FA-3b — le revenu décalé NOMINAL est déflaté à la même base réelle que RRQ/DB (m=240, 2 %)', () => {
        // À m=240 (20 ans, infl 2 %), 14 859 $ nominaux ≈ 10 000 $ réels : la réduction du SRG
        // (en réel) doit être ~celle de 10 000 $ réels à m=0, pas celle de 14 859 $.
        const m240 = { ...baseCtx, m: 240, age: 85 };
        const inflFactor = Math.pow(1.02, 20);
        const sans = computeRetirementIncome(m240, lowIncomeGoal, [lowEarner]);
        const avec = computeRetirementIncome({ ...m240, otherIncomeAnnualLaggedNominal: 10000 * inflFactor }, lowIncomeGoal, [lowEarner]);
        const ref0 = computeRetirementIncome(baseCtx, lowIncomeGoal, [lowEarner]);
        const ref10k = computeRetirementIncome({ ...baseCtx, otherIncomeAnnualLaggedNominal: 10000 }, lowIncomeGoal, [lowEarner]);
        const reductionRealM240 = (sans.gis - avec.gis) / inflFactor * 12;
        const reductionRealM0 = (ref0.gis - ref10k.gis) * 12;
        expect(reductionRealM240).toBeCloseTo(reductionRealM0, 0);
    });
});

// ──────────────────────────────────────────────────────────────────────────
// FA-9 (audit 2026-06-09) : SRG indexé UNE seule fois (jamais ×1,02^Δ dedans
// PUIS ×inflFactor dehors — le max était surévalué ~49 % à 20 ans).
// ──────────────────────────────────────────────────────────────────────────
describe('FA-9 — SRG : indexation simple (base réelle + nominalisation unique)', () => {
    // Revenu test NUL (RRQ explicitement 0, pas de DB, pas de revenu décalé)
    // → SRG = max du barème, là où la double indexation est maximale.
    const zeroIncomeGoal: RetirementGoal = {
        ...baseGoal,
        rrqEstimateMonthly: 0,
        psvEstimateMonthly: 700,
        dbPensionMonthly: 0,
    };
    const fullResidency = { ...baseCtx, psvResidencyYears: [40] };

    it('m=0 : SRG max = barème 2026 de base (1 105 $/mois célibataire)', () => {
        const r = computeRetirementIncome(fullResidency, zeroIncomeGoal, [baseUser]);
        expect(r.gis).toBeCloseTo(1105, 0);
    });

    it('m=240 (20 ans, infl 2 %) : SRG max nominal = 1105 × 1,02^20 — PAS ×1,02^40', () => {
        const r = computeRetirementIncome({ ...fullResidency, m: 240, age: 85 }, zeroIncomeGoal, [baseUser]);
        const singleIndexed = 1105 * Math.pow(1.02, 20);   // ≈ 1 642 $/mois (attendu)
        const doubleIndexed = 1105 * Math.pow(1.02, 40);   // ≈ 2 440 $/mois (le bug)
        expect(r.gis).toBeCloseTo(singleIndexed, 0);
        expect(r.gis).toBeLessThan(doubleIndexed * 0.75);
    });

    it('m=240 : le SRG en RÉEL (déflaté) est constant — pas de dérive du barème vs l\'inflation', () => {
        const r0 = computeRetirementIncome(fullResidency, zeroIncomeGoal, [baseUser]);
        const r240 = computeRetirementIncome({ ...fullResidency, m: 240, age: 85 }, zeroIncomeGoal, [baseUser]);
        expect(r240.gis / Math.pow(1.02, 20)).toBeCloseTo(r0.gis, 0);
    });

    it('seuil de coupure en base réelle : ≥ 22 512 $ réels coupent le SRG à m=240 aussi', () => {
        // Avant FA-9 le seuil était indexé ×1,02^20 (nominal) face à un revenu test réel →
        // un revenu réel AU seuil de base gardait du SRG fictif à m=240 (≈ 1 046 $/mois).
        // Marge +100 $ réels : la propriété testée (« le seuil réel coupe ») n'exige pas la
        // frontière exacte, et le round-trip ×1,02^20/1,02^20 est sensible à 1 ulp (revue FA-9).
        const aboveThreshold = computeRetirementIncome(
            { ...fullResidency, m: 240, age: 85, otherIncomeAnnualLaggedNominal: (22512 + 100) * Math.pow(1.02, 20) },
            zeroIncomeGoal, [baseUser],
        );
        expect(aboveThreshold.gis).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────────────────
// FA-10 (suivi fiscal-accuracy) — SRG en survivorMode : barème CÉLIBATAIRE
// sur UNE tête (avant : barème couple ×2 + revenu test divisé par 2 →
// jusqu'à ~2,6 k$/an de SRG fictif non imposable pour un survivant).
// ──────────────────────────────────────────────────────────────────────────
describe('FA-10 — SRG en survivorMode : barème célibataire, une tête', () => {
    const coupleCtx: RetirementIncomeCtx = { ...baseCtx, activeUsersCount: 2, psvResidencyYears: [40, 40] };
    const zeroIncomeGoal: RetirementGoal = {
        ...baseGoal, rrqEstimateMonthly: 0, psvEstimateMonthly: 700, dbPensionMonthly: 0,
    };
    const coupleUsers: User[] = [baseUser, { ...baseUser, name: 'Partner' }];

    it('survivant à revenu nul : SRG max = 1 105 $ (célibataire), PAS 1 324 $ (couple ×2)', () => {
        const surv = computeRetirementIncome({ ...coupleCtx, survivorMode: true }, zeroIncomeGoal, coupleUsers);
        expect(surv.gis).toBeCloseTo(1105, 0);
        // Et le couple vivant garde bien son barème couple (non-régression FA-10).
        const couple = computeRetirementIncome(coupleCtx, zeroIncomeGoal, coupleUsers);
        expect(couple.gis).toBeCloseTo(662 * 2, 0);
    });

    it('le revenu test du survivant n\'est PLUS divisé par 2 : coupure au seuil célibataire', () => {
        // 23 000 $ (> seuil célibataire 22 512) → SRG nul. L'ancien code divisait par 2
        // (11 500 $, sous le seuil) et servait un SRG fictif au survivant.
        const surv = computeRetirementIncome(
            { ...coupleCtx, survivorMode: true, otherIncomeAnnualLaggedNominal: 23000 },
            zeroIncomeGoal, coupleUsers,
        );
        expect(surv.gis).toBe(0);
    });
});

// PV-4 — clamps hors-bornes des âges de début de rentes (retirementIncome.ts:184-185).
// Bornes légales : RRQ 60-72 (report étendu à 72 depuis 2024), PSV 65-70 (ne s'anticipe pas).
// Une valeur persistée hors bornes (vieux store, saisie erronée) doit se comporter EXACTEMENT
// comme la borne — jamais verser avant l'âge légal ni geler la rente au-delà du report max.
describe('PV-4 — clamps hors-bornes rrqStartAge / psvStartAge', () => {
    it('rrqStartAge 55 (sous la borne) → clampé à 60 : rien à 59, versé à 60, identique à un 60 explicite', () => {
        const goal55: RetirementGoal = { ...baseGoal, rrqStartAge: 55 };
        const goal60: RetirementGoal = { ...baseGoal, rrqStartAge: 60 };
        expect(computeRetirementIncome({ ...baseCtx, age: 59 }, goal55, [baseUser]).rrq).toBeCloseTo(0, 6);
        const at60 = computeRetirementIncome({ ...baseCtx, age: 60 }, goal55, [baseUser]);
        expect(at60.rrq).toBeGreaterThan(0);
        expect(at60.rrq).toBeCloseTo(
            computeRetirementIncome({ ...baseCtx, age: 60 }, goal60, [baseUser]).rrq, 6);
    });

    it('rrqStartAge 80 (au-delà du report max) → clampé à 72 : rien à 71, versé à 72 au facteur du 72 explicite', () => {
        const goal80: RetirementGoal = { ...baseGoal, rrqStartAge: 80 };
        const goal72: RetirementGoal = { ...baseGoal, rrqStartAge: 72 };
        expect(computeRetirementIncome({ ...baseCtx, age: 71 }, goal80, [baseUser]).rrq).toBeCloseTo(0, 6);
        const at72 = computeRetirementIncome({ ...baseCtx, age: 72 }, goal80, [baseUser]);
        expect(at72.rrq).toBeGreaterThan(0);
        expect(at72.rrq).toBeCloseTo(
            computeRetirementIncome({ ...baseCtx, age: 72 }, goal72, [baseUser]).rrq, 6);
        // le facteur de report (×1,588) est bien appliqué : > au même RRQ débuté à 65
        const goal65: RetirementGoal = { ...baseGoal, rrqStartAge: 65 };
        expect(at72.rrq).toBeGreaterThan(
            computeRetirementIncome({ ...baseCtx, age: 72 }, goal65, [baseUser]).rrq);
    });

    it('psvStartAge 60 (la PSV ne s\'anticipe PAS) → clampé à 65 : rien à 64, versé à 65 sans réduction', () => {
        const goal60: RetirementGoal = { ...highPensionGoal, psvStartAge: 60 };
        const goal65: RetirementGoal = { ...highPensionGoal, psvStartAge: 65 };
        expect(computeRetirementIncome({ ...baseCtx, age: 64 }, goal60, [baseUser]).psv).toBeCloseTo(0, 6);
        const at65 = computeRetirementIncome({ ...baseCtx, age: 65 }, goal60, [baseUser]);
        expect(at65.psv).toBeGreaterThan(0);
        expect(at65.psv).toBeCloseTo(
            computeRetirementIncome({ ...baseCtx, age: 65 }, goal65, [baseUser]).psv, 6);
    });

    it('psvStartAge 80 (au-delà du report max) → clampé à 70 : rien à 69, versé à 70 au facteur ×1,36', () => {
        const goal80: RetirementGoal = { ...highPensionGoal, psvStartAge: 80 };
        const goal70: RetirementGoal = { ...highPensionGoal, psvStartAge: 70 };
        expect(computeRetirementIncome({ ...baseCtx, age: 69 }, goal80, [baseUser]).psv).toBeCloseTo(0, 6);
        const at70 = computeRetirementIncome({ ...baseCtx, age: 70 }, goal80, [baseUser]);
        expect(at70.psv).toBeGreaterThan(0);
        expect(at70.psv).toBeCloseTo(
            computeRetirementIncome({ ...baseCtx, age: 70 }, goal70, [baseUser]).psv, 6);
        // ×1,36 vs un début à 65 (psvDeferralFactor(60 mois)), GIS neutralisé par highPensionGoal
        const goal65: RetirementGoal = { ...highPensionGoal, psvStartAge: 65 };
        expect(at70.psv / computeRetirementIncome({ ...baseCtx, age: 70 }, goal65, [baseUser]).psv)
            .toBeCloseTo(1.36, 2);
    });
});

describe('computeRetirementIncome — RRQ-PSV-MIN : clamp des estimés négatifs', () => {
    it('un rrqEstimate NÉGATIF est clampé à 0 et ne dégrade pas le `total`', () => {
        // L'output `rrq` est DÉJÀ clampé (l.312), mais `total` (l.303/311) somme le rrq BRUT : sans le
        // clamp d'ENTRÉE, un rrqBaseFamily négatif tirerait `total` sous sa valeur correcte. C'est CE
        // report dans `total` que le test discrimine (pas l'output rrq, déjà protégé).
        const neg = computeRetirementIncome(baseCtx, { ...baseGoal, rrqEstimateMonthly: -500 }, [baseUser]);
        const zero = computeRetirementIncome(baseCtx, { ...baseGoal, rrqEstimateMonthly: 0 }, [baseUser]);
        expect(neg.rrq).toBe(0);
        expect(neg.total).toBeGreaterThan(0);
        expect(neg.total).toBeCloseTo(zero.total, 6); // discriminant : sans clamp, total(neg) < total(0)
    });
});

describe('computeRetirementIncome — FISC-RRQ-PRORATA : prorata de résidence RRQ per-conjoint', () => {
    // Deux conjoints même salaire (ratio gains/MGA identique) → seule la RÉSIDENCE diffère.
    const nativeUser = { name: 'Natif', grossSalary: 5000, birthYear: 1980 } as unknown as User;
    // Immigrant arrivé à 40 ans (2020, né 1980) → années cotisées 18→65 amputées.
    const immigrantUser = { name: 'Immigrant', grossSalary: 5000, birthYear: 1980, isImmigrant: true, canadaArrivalYear: 2020 } as unknown as User;
    const coupleCtx: RetirementIncomeCtx = { ...baseCtx, activeUsersCount: 2, psvResidencyYears: [40, 40] };

    it('SYMÉTRIE : l\'ordre des conjoints ne change PAS la RRQ familiale (discrimine le bug u0-only)', () => {
        // Avant (prorata dérivé de users[0] SEUL) : [immigrant, natif] ≠ [natif, immigrant].
        // Après (moyenne per-conjoint) : les deux sont ÉGAUX. Ce test ÉCHOUE sur l'ancien code.
        const immFirst = computeRetirementIncome(coupleCtx, baseGoal, [immigrantUser, nativeUser]);
        const nativeFirst = computeRetirementIncome(coupleCtx, baseGoal, [nativeUser, immigrantUser]);
        expect(immFirst.rrq).toBeGreaterThan(0);
        expect(immFirst.rrq).toBeCloseTo(nativeFirst.rrq, 4);
        // Le split par conjoint est aussi symétrique (somme == total famille, invariant préservé).
        expect(immFirst.perUser[0].rrq + immFirst.perUser[1].rrq).toBeCloseTo(immFirst.rrq, 4);
    });

    it('un conjoint immigrant tardif RÉDUIT la RRQ familiale (résidence < 1 tire la moyenne)', () => {
        const mixed = computeRetirementIncome(coupleCtx, baseGoal, [nativeUser, immigrantUser]);
        const allNative = computeRetirementIncome(coupleCtx, baseGoal, [nativeUser, { ...nativeUser, name: 'Natif2' }]);
        // L'immigrant a un prorata de résidence partiel (≈25/39) → famille mixte < famille 100 % native.
        expect(mixed.rrq).toBeLessThan(allNative.rrq);
        // Le conjoint immigrant reçoit une PART RRQ plus faible que le natif (poids résidence moindre).
        expect(mixed.perUser[1].rrq).toBeLessThan(mixed.perUser[0].rrq);
    });

    it('couple 100 % natif : prorata résidence = 1 chacun → comportement antérieur inchangé', () => {
        // Garde de non-régression : sans immigrant, rien ne bouge (résidence neutre).
        const allNative = computeRetirementIncome(coupleCtx, baseGoal, [nativeUser, { ...nativeUser, name: 'N2' }]);
        expect(allNative.rrq).toBeGreaterThan(0);
        expect(allNative.perUser[0].rrq).toBeCloseTo(allNative.perUser[1].rrq, 4); // salaires égaux → parts égales
    });
});
