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
import { calculateFiscalReport, AE_MAX_INCOME } from '../../utils/tax';
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
        // [AE-PLAFOND-MANQUANT] la vraie fonction fiscale : les tests AE asserte le NET réel de la
        // prestation (un stub plat aurait la forme du défaut — cf. UN-STUB-QUI-A-LA-FORME-DU-DEFAUT).
        loopYear: 2026,
        simInflation: 2,
        calculateFiscalReport,
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

// [AE-PLAFOND-MANQUANT] Prestation AE attendue : 55 % du BRUT plafonné (68 900 $ en 2026), nette
// d'impôt à assiette de cotisation NULLE (règle sourcée, FISCAL_REFERENCE §2). Dérivée ici par la
// MÊME fonction fiscale que le module — ce que ces tests prouvent est le CÂBLAGE (plafond, 55 %,
// employmentIncome: 0, remplacement du net), les ancres négatives excluent les anciens chemins.
const aeNetMonthly = (grossAnnual: number, year = 2026): number =>
    calculateFiscalReport(Math.min(grossAnnual, AE_MAX_INCOME) * 0.55, 0, 0, year, false, undefined, 0).netIncome / 12;

describe('computeActiveIncome — perte d\'emploi (prestation AE par le brut plafonné)', () => {
    it('chômage en cours → prestation = net(min(brut, plafond) × 55 %), PAS net × 0,55', () => {
        const r = computeActiveIncome(baseCtx({ unemployedMonthsRemaining: 4 }), proj(), plainUsers);
        expect(r.incomeMarc).toBeCloseTo(aeNetMonthly(100_000), 4);
        // Ancres négatives — les trois anciens chemins sont EXCLUS :
        expect(r.incomeMarc).not.toBeCloseTo(5000 * 0.55, 0);                       // net × 0,55
        expect(r.incomeMarc).not.toBeCloseTo((100_000 * 0.55) / 12, 0);             // brut SANS plafond
        expect(r.incomeMarc).not.toBeCloseTo(
            calculateFiscalReport(68_900 * 0.55, 0, 0, 2026, false).netIncome / 12, 2); // avec cotisations
    });

    it('la prestation ne dépend PAS du salaire NET saisi (elle vient du brut assurable)', () => {
        const a = computeActiveIncome(baseCtx({ unemployedMonthsRemaining: 4 }), proj(), plainUsers);
        const b = computeActiveIncome(baseCtx({ unemployedMonthsRemaining: 4, incomeMarcNetMonthly: 9_999 }), proj(), plainUsers);
        expect(b.incomeMarc).toBeCloseTo(a.incomeMarc, 6);
    });

    it('le PLAFOND mord : brut 200 k$ → même prestation que brut 100 k$ (tous deux au-dessus)', () => {
        const a = computeActiveIncome(baseCtx({ unemployedMonthsRemaining: 4 }), proj(), plainUsers);
        const b = computeActiveIncome(baseCtx({ unemployedMonthsRemaining: 4, grossMarcBaseAnnual: 200_000 }), proj(), plainUsers);
        expect(b.incomeMarc).toBeCloseTo(a.incomeMarc, 6);
    });

    it('SOUS le plafond : brut 40 k$ → prestation proportionnelle, plus basse', () => {
        const r = computeActiveIncome(baseCtx({ unemployedMonthsRemaining: 4, grossMarcBaseAnnual: 40_000 }), proj(), plainUsers);
        expect(r.incomeMarc).toBeCloseTo(aeNetMonthly(40_000), 4);
        expect(r.incomeMarc).toBeLessThan(aeNetMonthly(100_000));
    });

    it('l\u2019ANNÉE fiscale est celle du mois courant, pas 2026 figé — discriminant', () => {
        // ⚠️ Perturbation de revue : figer `ctx.loopYear` à 2026 laissait 45/45 verts
        // (`CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE`). Ce test passe une année lointaine dont le
        // barème indexé diffère : si le module ignorait `loopYear`, les deux membres divergeraient.
        const r = computeActiveIncome(baseCtx({ unemployedMonthsRemaining: 4, loopYear: 2030 }), proj(), plainUsers);
        expect(r.incomeMarc).toBeCloseTo(aeNetMonthly(100_000, 2030), 4);
        expect(r.incomeMarc).not.toBeCloseTo(aeNetMonthly(100_000, 2026), 2);
    });

    it('brut ABSENT (donnée legacy) : repli documenté sur net × 0,55 — jamais une prestation à 0', () => {
        const r = computeActiveIncome(baseCtx({ unemployedMonthsRemaining: 4, grossMarcBaseAnnual: 0 }), proj(), plainUsers);
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
        // m = 12 → yearsElapsed = 1 : le PLAFOND est projeté d'un an (inflation simulée 2 % + 0,5 pt,
        // patron MGA partagé avec rqapCapProjected) — 68 900 × 1,025 = 70 622,50 $.
        const capAn1 = 68_900 * 1.025;
        expect(r.incomeMarc).toBeCloseTo(
            calculateFiscalReport(Math.min(100_000, capAn1) * 0.55, 0, 0, 2026, false, undefined, 0).netIncome / 12, 4);
        // [JOBLOSS-DUREE-N-PLUS-1] Attendait `8` et figeait le défaut — deuxième site à le faire,
        // après `stochasticEvents.test.ts`. Le mois du déclenchement est DÉJÀ servi à 55 % (c'est
        // l'assertion `incomeMarc` juste au-dessus), donc il reste 7 mois après lui pour une durée
        // de 8. Les deux tests étaient cohérents entre eux et faux ensemble : chacun vérifiait que
        // le compteur valait ce que le code y mettait, sans jamais compter les mois VÉCUS.
        expect(r.newUnemployedMonths).toBe(7);
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
        // La prestation AE puis le facteur LTD — cumul multiplicatif conservé de l'ancien modèle.
        expect(r.incomeMarc).toBeCloseTo(aeNetMonthly(100_000) * 0.6, 4);
    });
});

describe('computeActiveIncome — espace REER pendant chômage/invalidité (revenu non gagné)', () => {
    // Au Québec/Canada, les prestations d'assurance-emploi (AE) et d'assurance-
    // invalidité ne sont PAS du « revenu gagné » au sens de l'art. 146(1) LIR :
    // elles ne génèrent aucun droit de cotisation REER. accGrossAdd alimente
    // accGrossIncomeYear → newRrspRoom = 18 % (taxJanuary.ts). Le salaire d'emploi
    // de base de Marc doit donc être EXCLU de accGrossAdd pendant ces mois.
    it('chômage en cours → brut de base de Marc exclu de accGrossAdd (= brutAnna / 12)', () => {
        const r = computeActiveIncome(baseCtx({ unemployedMonthsRemaining: 4 }), proj(), plainUsers);
        expect(r.accGrossAdd).toBeCloseTo(80000 / 12, 6);
    });

    it('invalidité LTD en cours → brut de base de Marc exclu de accGrossAdd (= brutAnna / 12)', () => {
        const r = computeActiveIncome(baseCtx({ ltdMonthsRemaining: 12 }), proj(), plainUsers);
        expect(r.accGrossAdd).toBeCloseTo(80000 / 12, 6);
    });

    it('chômage + survivorMode (Anna décédée) → aucun brut gagné → accGrossAdd = 0', () => {
        const r = computeActiveIncome(
            baseCtx({ unemployedMonthsRemaining: 4, survivorMode: true }),
            proj(),
            plainUsers,
        );
        expect(r.accGrossAdd).toBeCloseTo(0, 6);
    });

    it('contre-épreuve : seul le brut de Marc disparaît, celui d\'Anna reste plein', () => {
        const normal = computeActiveIncome(baseCtx(), proj(), plainUsers);
        const marcUnemployed = computeActiveIncome(baseCtx({ unemployedMonthsRemaining: 4 }), proj(), plainUsers);
        expect(normal.accGrossAdd - marcUnemployed.accGrossAdd).toBeCloseTo(100000 / 12, 6);
    });
});

describe('computeActiveIncome — bonus/RSU stoppés pendant chômage/LTD (B-AUDIT-1)', () => {
    // Réalisme : bonus et RSU sont du revenu d'EMPLOI → cessent quand Marc quitte
    // l'employeur (chômage/invalidité), dans le net ET le brut REER. Le side income
    // (travail autonome) CONTINUE et reste du « revenu gagné ».
    const bonusUser: User[] = [user({ bonusPctOfGross: 10 }), user()];
    const rsuUser: User[] = [user({ rsuVestingPerYear: 24000, rsuYearsRemaining: 5 }), user()];
    const sideUser: User[] = [user({ sideIncomeAnnual: 12000 }), user()];

    it('chômage → bonus de Marc EXCLU du revenu net (= la prestation AE seule)', () => {
        const r = computeActiveIncome(baseCtx({ unemployedMonthsRemaining: 4 }), proj(), bonusUser);
        expect(r.incomeMarc).toBeCloseTo(aeNetMonthly(100_000), 4);
    });

    it('chômage → RSU de Marc EXCLU du revenu net', () => {
        const r = computeActiveIncome(baseCtx({ unemployedMonthsRemaining: 4 }), proj(), rsuUser);
        expect(r.incomeMarc).toBeCloseTo(aeNetMonthly(100_000), 4);
    });

    it('LTD → bonus de Marc EXCLU du revenu net (= base × 0.60)', () => {
        const r = computeActiveIncome(baseCtx({ ltdMonthsRemaining: 12 }), proj(), bonusUser);
        expect(r.incomeMarc).toBeCloseTo(5000 * 0.6, 6);
    });

    it('chômage → side income (autonome) CONSERVÉ dans le revenu net', () => {
        const r = computeActiveIncome(baseCtx({ unemployedMonthsRemaining: 4 }), proj(), sideUser);
        // prestation AE + side income (travail autonome, CONSERVÉ) au proxy marginal ×0,55.
        expect(r.incomeMarc).toBeCloseTo(aeNetMonthly(100_000) + 1000 * 0.55, 4);
    });

    it('chômage → bonus EXCLU de accGrossAdd (espace REER) → brut = Anna seule', () => {
        const r = computeActiveIncome(baseCtx({ unemployedMonthsRemaining: 4 }), proj(), bonusUser);
        expect(r.accGrossAdd).toBeCloseTo(80000 / 12, 6);
    });

    it('chômage → side income CONSERVÉ dans accGrossAdd (revenu gagné)', () => {
        const r = computeActiveIncome(baseCtx({ unemployedMonthsRemaining: 4 }), proj(), sideUser);
        expect(r.accGrossAdd).toBeCloseTo((12000 + 80000) / 12, 6); // baseMarc=0, side 12k + Anna 80k
    });

    it('employé (sans chômage) → bonus toujours pris en compte (non-régression)', () => {
        const r = computeActiveIncome(baseCtx(), proj(), bonusUser);
        const bonusNet = (100000 * 0.10 / 12) * 0.55;
        expect(r.incomeMarc).toBeCloseTo(5000 + bonusNet, 6);
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
