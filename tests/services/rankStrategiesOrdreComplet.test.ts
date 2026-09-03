/**
 * [ENG-RANKING-ORDER-PIN] L'ORDRE complet du classement de stratégies, épinglé bout en bout.
 *
 * POURQUOI. `rankStrategies` décide quelle façon de décaisser est présentée comme « la meilleure ».
 * Ses scores sont des normalisations min-max sur l'ensemble comparé : changer une grandeur d'un seul
 * scénario déplace l'échelle de TOUS les autres. Le conseil affiché peut donc basculer sans qu'aucun
 * test unitaire de la fonction ne bronche — ceux qui existent (`strategyRanking.test.ts`) la
 * vérifient sur des scénarios SYNTHÉTIQUES, ce qui ne dit rien de l'ordre que produisent les vrais
 * résultats du moteur.
 *
 * ⚠️ CETTE GARDE EST FAITE POUR ROUGIR, et c'est sa valeur : un lot qui déplace de l'argent PEUT
 * légitimement changer l'ordre. Ce qu'elle interdit, c'est que ça arrive en SILENCE. Devant un
 * rouge, ne pas re-baser mécaniquement : mesurer le nouvel ordre, vérifier qu'il est explicable par
 * le lot en cours, et l'écrire ici avec sa cause — exactement comme les goldens de valeur du dépôt.
 *
 * ⚠️ MESURÉ le 2026-09-03 (célibataire 58 ans, retraite à 62, 450 k$ REER / 150 k$ non-enregistré /
 * 120 k$ CELI, horizon 32 ans) — les quatre objectifs donnent quatre ordres DIFFÉRENTS, ce qui est
 * précisément ce qui rend le pin utile :
 *   tax      : AUTO_MARGINAL > PRIO_REER > DEBT_FIRST > MELTDOWN_REER > PRIO_CELI
 *   balanced : MELTDOWN_REER > DEBT_FIRST > PRIO_CELI > PRIO_REER > AUTO_MARGINAL
 *   wealth   : MELTDOWN_REER > PRIO_CELI > DEBT_FIRST > PRIO_REER > AUTO_MARGINAL
 *   fire     : DEBT_FIRST > MELTDOWN_REER > PRIO_CELI > PRIO_REER > AUTO_MARGINAL
 *
 * ⚠️ LE TICKET DONNAIT UN ORDRE, ET IL ÉTAIT PÉRIMÉ. Il annonçait « balanced : MELTDOWN >
 * PRIO_REER > AUTO » comme « LA baseline à pinner ». Mesuré, `balanced` intercale DEBT_FIRST et
 * PRIO_CELI entre les deux, et PRIO_REER passe derrière PRIO_CELI. Un ordre écrit dans un ticket
 * est une photo prise à une date : il se RE-MESURE, il ne se recopie pas — d'autant que ce dépôt a
 * livré depuis des lots qui déplacent `estateNetWorth` et l'impôt total (dont `[FISC-DIV-ACB-STEPUP]`
 * le jour même).
 *
 * ⚠️ Ce qui est épinglé est l'ORDRE, jamais les SCORES : un score bouge au centième à chaque
 * correctif fiscal, l'ordre est la seule chose que l'utilisateur voit.
 */
import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import { rankStrategies, type RankableScenario, type OptimizeObjective } from '../../services/projection/strategyRanking';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const users: User[] = [
    { name: 'Marc', grossSalary: 9_000, netSalary: 6_000, color: '#10b981', age: 58, birthYear: 1968, canadaArrivalYear: 1968, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[];

const params = (): SimulationParams => ({
    projection: {
        years: 32, inflationRate: 2, savingsMode: 'manual', manualContribution: 1_500,
        usePortfolioRate: false, returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 5, cash: 1 },
        emergencyFundMonths: 0, salaryGrowth: 2, propertyGrowthRate: 0,
    } as unknown as ProjectionConfig,
    calculatedStartingCash: 60_000,
    liveCSVBalances: { CELI: 120_000, CELIAPP: 0, REER: 450_000, NON_ENREG: 150_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 4_500, governmentPension: 1_500, lifeExpectancy: 90, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: { users, splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 108_000, baseNetAnnual: 72_000, currentRentExpense: 1_500,
    baseMonthlyExpenses: 3_800, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

const STRATEGIES: AllocationStrategy[] = ['AUTO_MARGINAL', 'PRIO_REER', 'PRIO_CELI', 'MELTDOWN_REER', 'DEBT_FIRST'];

/** Les cinq scénarios RÉELS du moteur, calculés une fois pour tout le fichier. */
const scenarios: RankableScenario[] = STRATEGIES.map((st) => {
    const r = __runScenarioForTests(
        params(), st, true, false, 0, 'BASE', {}, { verboseMonthlyPoints: true },
    ) as unknown as Record<string, unknown>;
    return { ...(r as object), strategyName: st, kind: 'strategy' } as unknown as RankableScenario;
});

const ordre = (objectif: OptimizeObjective): string[] =>
    rankStrategies(scenarios, objectif).ranked.map((r) => r.strategyName);

const ORDRES_ATTENDUS: Record<OptimizeObjective, string[]> = {
    tax: ['AUTO_MARGINAL', 'PRIO_REER', 'DEBT_FIRST', 'MELTDOWN_REER', 'PRIO_CELI'],
    balanced: ['MELTDOWN_REER', 'DEBT_FIRST', 'PRIO_CELI', 'PRIO_REER', 'AUTO_MARGINAL'],
    wealth: ['MELTDOWN_REER', 'PRIO_CELI', 'DEBT_FIRST', 'PRIO_REER', 'AUTO_MARGINAL'],
    fire: ['DEBT_FIRST', 'MELTDOWN_REER', 'PRIO_CELI', 'PRIO_REER', 'AUTO_MARGINAL'],
};

describe('[ENG-RANKING-ORDER-PIN] ordre complet du classement, sur les résultats RÉELS du moteur', () => {
    it('anti-vacuité : les cinq stratégies produisent bien des résultats distincts', () => {
        // Sans ça, cinq scénarios identiques donneraient un ordre stable et parfaitement vide de
        // sens — le tri de départage (patrimoine, puis index) suffirait à le figer.
        const estates = scenarios.map((s) => Math.round(s.estateNetWorth));
        expect(new Set(estates).size).toBe(STRATEGIES.length);
    });

    it.each(Object.entries(ORDRES_ATTENDUS))('objectif « %s » : ordre épinglé', (objectif, attendu) => {
        expect(ordre(objectif as OptimizeObjective)).toEqual(attendu);
    });

    it('anti-vacuité : les objectifs ne rendent PAS tous le même ordre', () => {
        // C'est ce qui donne sa valeur au pin par objectif. Si les quatre coïncidaient, un seul
        // suffirait et cette garde surveillerait quatre fois la même chose.
        const distincts = new Set(Object.keys(ORDRES_ATTENDUS).map((o) => ordre(o as OptimizeObjective).join('>')));
        expect(distincts.size).toBeGreaterThanOrEqual(3);
    });

    it('le contraste le plus fort tient : AUTO_MARGINAL est 1er en « impôt », DERNIER en « patrimoine »', () => {
        // Un pin de liste peut se re-baser sans qu'on comprenne ce qui a bougé. Ce cas nomme le
        // FAIT que le classement doit préserver : la stratégie qui minimise l'impôt payé n'est pas
        // celle qui maximise la succession — si ces deux-là se rejoignaient, c'est la normalisation
        // ou une grandeur d'entrée qui aurait cassé, pas seulement « l'ordre qui a bougé ».
        const parImpot = ordre('tax');
        const parPatrimoine = ordre('wealth');
        expect(parImpot[0]).toBe('AUTO_MARGINAL');
        expect(parPatrimoine[parPatrimoine.length - 1]).toBe('AUTO_MARGINAL');
    });
});
