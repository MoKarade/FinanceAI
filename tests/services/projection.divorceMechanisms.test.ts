// tests/services/projection.divorceMechanisms.test.ts
//
// [ENG-DIVORCE, panel #613] UN TEST PAR MÉCANISME.
//
// ⚠️ POURQUOI CE FICHIER EXISTE. La première livraison du divorce n'avait que des tests GLOBAUX
// (patrimoine médian et taux de survie avec/sans divorce). Ils étaient discriminants — et pourtant
// ils ont laissé passer CINQ défauts ÉLEVÉ, parce qu'ils étaient tous dominés par la phase SALAIRE :
// dès que le revenu fantôme du conjoint disparaissait, le chiffre global bougeait fort, et j'en ai
// déduit à tort que chaque mécanisme fonctionnait. Mesure a posteriori : après correction des 5
// ÉLEVÉ, le P50 global ne bouge que de 0,2 % — les mécanismes fiscaux et de rentes sont
// INVISIBLES à ce niveau d'observation.
// Règle qui en découle : un test global ne prouve rien sur un mécanisme particulier ; il faut viser
// la grandeur que le mécanisme produit.
import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import { computeRetirementIncome } from '../../services/projection/retirementIncome';
import type { AllocationStrategy } from '../../services/projection/types';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';

const users = (age = 30): User[] => ([
    { name: 'Marc', grossSalary: 8200, netSalary: 5620, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 7100, netSalary: 4995, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const goal: RetirementGoal = { targetAge: 60, targetMonthlyIncome: 5500, governmentPension: 1850, lifeExpectancy: 92, dbPensionMonthly: 4000 } as unknown as RetirementGoal;

// ── MÉCANISME 1 — les rentes du conjoint partent avec lui ────────────────────
describe('[ENG-DIVORCE ÉLEVÉ-1] le divorce RÉDUIT les rentes', () => {
    const ctx = (over: Record<string, unknown> = {}) => ({
        m: 0, age: 65, simInflation: 0, activeUsersCount: 2, baseGrossAnnual: 183_600,
        delayPensions: false, survivorMode: false, monthlyOasReduction: 0,
        dbSurvivorPct: 0.6, rrqSurvivorPct: 0.6, psvResidencyYears: [40, 40], startYear: 2026,
        ...over,
    } as never);

    it('rentes du divorcé ≈ la MOITIÉ de celles du couple (et non l\'identique)', () => {
        const couple = computeRetirementIncome(ctx(), goal, users(65));
        // Reproduit EXACTEMENT ce que fait le moteur au divorce.
        const divorce = computeRetirementIncome(ctx({ householdPensionShare: 0.5 }), goal, users(65).slice(0, 1));

        expect(couple.total).toBeGreaterThan(0);
        // Le test qui manquait : le premier correctif donnait Δ = 0,00 $ EXACT ici.
        expect(divorce.total, 'les rentes n\'ont pas bougé — le divorce est resté inerte')
            .toBeLessThan(couple.total * 0.75);
        // La DB est un montant MÉNAGE que rien ne divise : sans facteur explicite, elle restait
        // ENTIÈRE chez le divorcé.
        expect(divorce.privee, 'la pension d\'employeur du couple a été conservée en entier')
            .toBeCloseTo(couple.privee / 2, 2);
    });

    it('NE PAS toucher `activeUsersCount` : c\'est un DIVISEUR, pas un compteur de têtes', () => {
        // Le piège exact du 1er correctif, épinglé pour qu'il ne revienne pas : réduire AUSSI
        // `activeUsersCount` annule la réduction, parce que le `/N` s'applique à un agrégat ménage.
        const correct = computeRetirementIncome(ctx({ householdPensionShare: 0.5 }), goal, users(65).slice(0, 1));
        const piege = computeRetirementIncome(ctx({ activeUsersCount: 1, householdPensionShare: 0.5 }), goal, users(65).slice(0, 1));
        expect(piege.rrq + piege.psv, 'réduire activeUsersCount ANNULE la réduction des rentes')
            .toBeGreaterThan(correct.rrq + correct.psv);
    });
});

// ── MÉCANISME 2 — le compte REER de l'ex ne se repeuple pas ──────────────────
describe('[ENG-DIVORCE ÉLEVÉ-2] le registre REER per-conjoint reste consolidé', () => {
    // ⚠️ FIXTURE CALIBRÉE, et ça n'a rien d'accessoire : il a fallu TROIS tentatives pour rendre
    // ce test discriminant. Les deux premières passaient au vert sur le code CASSÉ — donc ne
    // prouvaient rien — parce qu'aucune cotisation REER n'avait lieu :
    //   • espace CELI disponible ⇒ la cascade envoie tout au CELI ;
    //   • REER de départ élevé ⇒ `rrspRoom` ≈ 0 ⇒ plus de place pour cotiser ;
    //   • horizon dépassant la retraite ⇒ le REER est intégralement décaissé, l'état final est
    //     [0, 0] des deux côtés.
    // Il faut donc : espace CELI ÉPUISÉ, REER de départ FAIBLE (donc beaucoup d'espace), et un
    // horizon qui s'arrête AVANT la retraite. C'est la cotisation qui repeuple le slot de l'ex.
    const params = (proj: Partial<ProjectionConfig>): SimulationParams => ({
        projection: {
            years: 10, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 3_000,
            usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
            emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3, ...proj,
        } as ProjectionConfig,
        calculatedStartingCash: 60_000,
        liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 20_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
        realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
        retirementGoal: { ...goal, targetAge: 62 } as RetirementGoal,
        config: {
            users: users(45).map((u) => ({ ...u, celiContributed: 300_000 })),
            splitMode: '50/50',
        } as BudgetConfig,
        baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 1_800,
        baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
    } as unknown as SimulationParams);

    it('après un divorce, la part de l\'ex reste à 0 sur tout l\'horizon', () => {
        // `enableMonteCarlo` : le divorce n'existe que là. Probabilité 1 ⇒ déclenché au 1er janvier.
        const r = __runScenarioForTests(
            params({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 }),
            'AUTO_MARGINAL' as AllocationStrategy, true, false,
        ) as unknown as { reerByUserFinal?: number[] };

        const byUser = r.reerByUserFinal ?? [];
        expect(byUser.length, 'registre per-conjoint absent — test vacueux').toBeGreaterThan(1);
        // Avant : les PARTS restaient celles du couple, donc chaque cotisation repeuplait le slot
        // de l'ex (mesuré jusqu'à 342 658 $), qui repartait ensuite en FERR obligatoire à SON âge.
        expect(byUser[1], 'le compte REER de l\'ex s\'est repeuplé après le divorce').toBeCloseTo(0, 2);
    });

    it('sans divorce, les DEUX parts vivent (le test ci-dessus discrimine bien)', () => {
        const r = __runScenarioForTests(
            params({ divorceEnabled: false }),
            'AUTO_MARGINAL' as AllocationStrategy, true, false,
        ) as unknown as { reerByUserFinal?: number[] };
        const byUser = r.reerByUserFinal ?? [];
        expect(byUser[1], 'sans divorce la part du conjoint doit être NON nulle').toBeGreaterThan(0);
    });
});
