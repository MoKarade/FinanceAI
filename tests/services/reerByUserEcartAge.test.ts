// tests/services/reerByUserEcartAge.test.ts
//
// [TEST-REERBYUSER-COUPLE-MEME-AGE] Le registre REER PAR CONJOINT n'était testé que sur des couples
// du MÊME ÂGE — et sur un couple du même âge, il est mathématiquement ÉPINGLÉ à la clé salariale.
//
// ⚠️ COMMENT CE TROU A ÉTÉ TROUVÉ, ET POURQUOI IL FAUT LE DIRE. En livrant
// `[ENG-CELIAPP-TRANSFERT-FLUX-MUET]`, j'ai perturbé `stepReerByUser(..., { contribution: 0 })` —
// donc caché au registre TOUTES les cotisations REER de tous les mois — et rien n'a bougé : 29 tests
// per-conjoint verts, `reerByUserFinal` bit-identique. J'en ai conclu, et PUBLIÉ, que l'arithmétique
// de flux du registre était « décorative ». **C'était trop large, et faux.**
//
// La vraie raison est dans la fixture, pas dans le module :
//   • le registre est SEMÉ par `splitByShares(reer, reerShares)` — il PART donc exactement à la clé ;
//   • un retrait est réparti AU PRORATA du solde, une cotisation SELON `shares`, et
//     `reconcileToPool` met à l'échelle : ces trois opérations PRÉSERVENT le rapport ;
//   • `reerShares` est calculé une fois et ne change qu'au décès ou au divorce.
// Sur un couple du même âge, le rapport ne quitte donc JAMAIS la clé : rien de ce qu'on fait aux flux
// ne peut s'observer. **MESURÉ** (45/45) : part du conjoint 0 = **0,535948**, exactement
// `8 200 / (8 200 + 7 100)`.
//
// Ce qui casse l'épinglage est le seul flux NON proportionnel du moteur : la FERR, retirée de la part
// EXACTE de chaque conjoint selon le facteur de SON âge (`ferrGrossByUser`, [ITEM-2C]). Il faut donc
// un ÉCART D'ÂGE pour que le registre porte la moindre information.
// **MESURÉ** : 45/58 → part 0 = **0,906412** · 50/65 → **0,962539**, contre une clé de 0,535948.
//
// ⚠️ Et ce n'est pas qu'un registre d'affichage : sous écart d'âge, cacher les cotisations au registre
// déplace le REER FINAL du ménage (la part de chacun conditionne SA FERR de l'année suivante) —
// **1 220 204,75 $ → 1 236 327,88 $, soit +16 123,13 $** sur le couple 50/65. Les 29 tests
// per-conjoint restent VERTS pendant ce mouvement. C'est le trou que ce fichier ferme.

import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const SALAIRE_0 = 8_200;
const SALAIRE_1 = 7_100;
/** La clé salariale : c'est la valeur à laquelle un couple du même âge reste collé pour toujours. */
const CLE_SALARIALE = SALAIRE_0 / (SALAIRE_0 + SALAIRE_1);

const users = (a1: number, a2: number): User[] => ([
    { name: 'Marc', grossSalary: SALAIRE_0, netSalary: 5_620, color: '#10b981', age: a1, birthYear: 2026 - a1, canadaArrivalYear: 2026 - a1, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: SALAIRE_1, netSalary: 4_995, color: '#3b82f6', age: a2, birthYear: 2026 - a2, canadaArrivalYear: 2026 - a2, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const params = (a1: number, a2: number): SimulationParams => ({
    projection: {
        // 40 ans : il FAUT dépasser 71 ans pour que la FERR s'applique. Une fixture plus courte ne
        // verrait jamais le seul flux non proportionnel du moteur — et retomberait dans l'angle mort
        // que ce fichier documente.
        years: 40, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 1_500,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
    } as ProjectionConfig,
    calculatedStartingCash: 40_000,
    liveCSVBalances: { CELI: 90_000, CELIAPP: 0, REER: 300_000, NON_ENREG: 60_000, CRYPTO: 25_000, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 1_500, lifeExpectancy: 95, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: { users: users(a1, a2), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 1_800,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

const run = (a1: number, a2: number) => __runScenarioForTests(
    params(a1, a2), 'AUTO_MARGINAL' as AllocationStrategy, true, false, 0, 'BASE', {},
    { verboseMonthlyPoints: true },
) as unknown as { chartData: Array<Record<string, number>>; reerByUserFinal?: number[] };

/** Part du conjoint 0 dans le registre REER final. */
const part0 = (a1: number, a2: number): { part: number; somme: number; pool: number } => {
    const r = run(a1, a2);
    const f = r.reerByUserFinal ?? [];
    expect(f, 'reerByUserFinal absent — rien à mesurer').toHaveLength(2);
    const somme = (f[0] ?? 0) + (f[1] ?? 0);
    expect(somme, 'registre per-conjoint VIDE : la fixture ne mesure rien').toBeGreaterThan(100_000);
    const cd = r.chartData;
    return { part: (f[0] ?? 0) / somme, somme, pool: Number(cd[cd.length - 1]?.REER ?? NaN) };
};

describe('[TEST-REERBYUSER-COUPLE-MEME-AGE] le registre per-conjoint n\'est observable qu\'avec un écart d\'âge', () => {
    /**
     * L'angle mort, écrit noir sur blanc : à âge égal, le registre EST la clé salariale. C'est ce
     * test qui explique pourquoi 29 tests per-conjoint ne pouvaient rien voir — et pourquoi il ne
     * faut PAS écrire une garde de plus sur une fixture à âge égal.
     */
    it('couple du MÊME ÂGE : le registre reste collé à la clé salariale, pour toujours', () => {
        const { part } = part0(45, 45);
        expect(part, 'le registre a quitté la clé alors qu\'aucun flux non proportionnel n\'existe')
            .toBeCloseTo(CLE_SALARIALE, 6);
    });

    // ── LE test discriminant : la FERR retire la part EXACTE de chaque conjoint selon SON âge. ──
    it('ÉCART D\'ÂGE : le registre s\'écarte franchement de la clé salariale', () => {
        const { part } = part0(50, 65);
        // Mesuré : 0,962539 contre une clé de 0,535948. Bande LARGE (> 0,30) et non ancrée : le
        // montant exact bougera au premier changement de barème FERR, le MÉCANISME non.
        expect(Math.abs(part - CLE_SALARIALE), `part mesurée ${part.toFixed(6)}, clé ${CLE_SALARIALE.toFixed(6)}`)
            .toBeGreaterThan(0.30);
    });

    /**
     * Le LEVIER : plus l'écart d'âge est grand, plus le registre s'éloigne de la clé. Une assertion
     * de levier rougit exactement quand la mesure devient vacueuse — contrairement à un seuil sur un
     * seul point, elle ne peut pas être satisfaite par un registre gelé.
     */
    it('plus l\'écart d\'âge est grand, plus le registre s\'éloigne de la clé', () => {
        const ecarts = [part0(45, 45).part, part0(45, 58).part, part0(50, 65).part]
            .map((p) => Math.abs(p - CLE_SALARIALE));
        // Mesuré : 0,000000 · 0,370464 · 0,426591 — strictement croissant.
        expect(ecarts[1], 'un écart de 13 ans ne déplace pas plus le registre qu\'un âge égal')
            .toBeGreaterThan(ecarts[0]);
        expect(ecarts[2], 'un écart de 15 ans ne déplace pas plus le registre qu\'un écart de 13')
            .toBeGreaterThan(ecarts[1]);
    });

    it('l\'invariant Σ(reerByUser) == REER du ménage tient dans les trois cas', () => {
        for (const [a1, a2] of [[45, 45], [45, 58], [50, 65]] as const) {
            const { somme, pool } = part0(a1, a2);
            expect(pool, `REER du ménage non mesurable à ${a1}/${a2}`).toBeGreaterThan(100_000);
            expect(somme, `Σ(reerByUser) ≠ REER à ${a1}/${a2}`).toBeCloseTo(pool, 2);
        }
    });
});
