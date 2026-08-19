import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionChartPoint } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal } from '../../types';

/**
 * [ENG-MC-CONSERVATION-BLIND] — audit de santé 2026-08-19, vague 1c.
 *
 * TOUTE la branche stochastique du moteur (divorce, décès du conjoint, invalidité longue durée,
 * maladie grave, soins de longue durée, perte d'emploi, héritage, bootstrap historique) n'existe
 * QUE sous `enableMonteCarlo`. Or l'API publique `calculateFutureProjection` appelle TOUJOURS
 * `runScenario(..., false, ...)` : le `chartData` publié est toujours DÉTERMINISTE. Ces chemins
 * étaient donc hors de portée de `projection.moneyConservation` ET de `projection.fuzzConservation`
 * — les deux gardes les plus fortes du dépôt ne les ont jamais parcourus une seule fois.
 *
 * ⚠️ Deux verrous rendaient la mesure impossible, et il a fallu les deux :
 *   1. `__runScenarioForTests` — le hook TEST-ONLY qui permet `enableMonteCarlo = true` ;
 *   2. `diagnostics.verboseMonthlyPoints` — sans lui, `buildMonthlyDataPoint` ne rend que
 *      `{ NetWorth, monthIndex }` sous MC (optimisation), donc AUCUNE ventilation d'actifs à
 *      reconstruire. C'est cette réduction qui rendait le bilan invérifiable, pas le hasard.
 *
 * RÉSULTAT MESURÉ (60 itérations × 361 mois = 20 365 points) : l'identité de bilan TIENT, pire
 * écart **0,02 $** (arrondi au cent), zéro champ non fini, zéro actif négatif. Ce fichier n'a donc
 * corrigé aucun défaut — il transforme un angle mort en garde. C'est le résultat attendu d'une
 * extension de couverture, et il fallait le MESURER pour pouvoir l'écrire.
 *
 * ⚠️ Ce que ce fichier NE couvre PAS : la forme-FLUX (« toute variation est expliquée par un flux
 * publié »). Elle ÉCHOUE sous MC — le partage de divorce mute CELI/REER/Crypto/NonReg sans publier
 * de `NetTransfer*` (**mesuré 2 130 681 $ sur le REER**). Impact utilisateur NUL aujourd'hui,
 * puisque les points MC sont réduits avant publication ; ce sera un vrai défaut le jour où une
 * surface affichera la ventilation d'un run stochastique. → `[ENG-DIVORCE-FLUX-MUET]`.
 */

const ITERATIONS = 60;

const users = (age: number) => ([
    { name: 'Marc', grossSalary: 8200, netSalary: 5620, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false },
    { name: 'Anna', grossSalary: 7100, netSalary: 4995, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false },
]);

/**
 * TOUS les drapeaux stochastiques armés en même temps. Les probabilités sont volontairement
 * RELEVÉES au-dessus des défauts de prod : l'objectif n'est pas de simuler une vie plausible mais
 * de faire EMPRUNTER chaque chemin assez souvent pour que la garde ait quelque chose à garder.
 * La couverture obtenue est assertée plus bas — elle n'est pas supposée.
 */
const params = (): SimulationParams => ({
    projection: {
        years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 2_000,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
        useStochasticMortality: true, modelSurvivor: true,
        ltcEnabled: true, ltcMonthlyCost: 5_000,
        divorceEnabled: true, divorceAnnualProbability: 0.05, divorceSplitPct: 50, divorceAlimonyMonthly: 800,
        ltdEnabled: true, ltdAnnualProbability: 0.02,
        criticalIllnessEnabled: true, ciAnnualProbability: 0.02, ciPayoutAmount: 50_000, ciExtraMonthlyExpense: 900,
        inheritanceEnabled: true, inheritanceExpectedAmount: 300_000, inheritanceExpectedAtAge: 60,
        inheritanceUncertaintyYears: 5, inheritanceProbability: 0.5,
        jobLossEnabled: true, jobLossAnnualProbability: 0.08, jobLossDurationMonths: 8,
        useHistoricalBootstrap: true, bootstrapBlockSize: 24,
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

/** Actifs affichés. `Immobilier` = équité DÉJÀ nette d'hypothèque → on retranche `DettesNonImmo`. */
const ASSET_KEYS = ['Liquidites', 'CELI', 'CELIAPP', 'REER', 'REEE', 'NonReg', 'Crypto', 'Immobilier'] as const;
/** Un découvert va en `LiquidDebt`, jamais en actif négatif (INV-6). `Immobilier` exclu : l'équité
 *  peut légitimement passer sous l'eau. */
const NON_NEGATIVE = ['Liquidites', 'CELI', 'CELIAPP', 'REER', 'REEE', 'NonReg', 'Crypto'] as const;

// Tolérance : chaque champ du point est arrondi au cent (`toFixed(2)`) — 9 arrondis se composent.
// 1 $ reste très en deçà d'une vraie fuite (qui casse par milliers) tout en ignorant l'arrondi.
const EPS = 1;

/** Un run MC seedé, en points COMPLETS. `mcIterationIndex` est la seule source d'aléa. */
const runMc = (iteration: number): ProjectionChartPoint[] => {
    const r = __runScenarioForTests(
        params(), 'AUTO_MARGINAL' as never, true, false, iteration, 'BASE', {},
        { verboseMonthlyPoints: true },
    );
    return r.chartData as ProjectionChartPoint[];
};

/** Tous les runs, calculés UNE fois (60 × 361 mois : ~4 s, inutile de les refaire par cas). */
const ALL_RUNS: ProjectionChartPoint[][] = Array.from({ length: ITERATIONS }, (_, i) => runMc(i));
const ALL_POINTS = ALL_RUNS.flat() as unknown as Record<string, unknown>[];

describe('[ENG-MC-CONSERVATION-BLIND] la branche stochastique respecte les invariants de bilan', () => {
    it('la fixture EMPRUNTE bien chaque chemin stochastique (anti-vacuité)', () => {
        // ⚠️ CE cas d'abord : sans lui, tous les suivants seraient satisfaits par une simulation où
        // rien ne se déclenche. Un drapeau renommé, une probabilité remise à zéro, une gate d'âge
        // déplacée — et la garde deviendrait verte en ne gardant plus rien, EN SILENCE.
        // Les planchers sont posés SOUS les valeurs mesurées (le RNG est seedé, donc reproductible),
        // avec de la marge pour absorber une dérive mineure sans devenir décoratifs.
        const runsAvec = (motif: RegExp): number => ALL_RUNS.filter(
            (run) => run.some((p) => ((p as unknown as { lifeEvents?: string[] }).lifeEvents ?? []).some((e) => motif.test(e))),
        ).length;

        const couverture: Array<[string, RegExp, number]> = [
            ['divorce', /Divorce/i, 20],
            ['perte d\'emploi', /Perte d.emploi/i, 25],
            ['maladie grave', /Maladie grave/i, 12],
            ['héritage', /Héritage/i, 12],
            ['invalidité longue durée', /Invalidité longue durée/i, 6],
            ['soins de longue durée', /Soins de longue durée/i, 3],
            ['décès du conjoint', /Décès du conjoint/i, 1],
            ['retraite atteinte', /Début Retraite/i, 30],
        ];
        for (const [nom, motif, plancher] of couverture) {
            const n = runsAvec(motif);
            expect(n, `chemin « ${nom} » emprunté par ${n} run(s) sur ${ITERATIONS} — sous le plancher`)
                .toBeGreaterThanOrEqual(plancher);
        }

        // Et la simulation doit vraiment produire des points, pas 60 séries vides.
        expect(ALL_POINTS.length).toBeGreaterThan(15_000);
    });

    it('INV-9 reconstructibilité : NetWorth == Σ actifs − DettesNonImmo, à chaque mois de chaque run', () => {
        // Mesuré : pire écart 0,02 $ sur 20 365 points. C'est la classe MONEY-PHANTOM — un chemin
        // qui bouge le patrimoine sans bouger un actif affiché (ou l'inverse). Le divorce, le décès
        // du conjoint et le LTC sont exactement le genre de chemin capable de la produire.
        let pire = 0;
        let ou = '(aucun)';
        for (let run = 0; run < ALL_RUNS.length; run++) {
            for (let m = 0; m < ALL_RUNS[run].length; m++) {
                const p = ALL_RUNS[run][m] as unknown as Record<string, number | undefined>;
                const nw = Number(p.NetWorth);
                const bilan = ASSET_KEYS.reduce((s, k) => s + (Number(p[k]) || 0), 0) - (Number(p.DettesNonImmo) || 0);
                const ecart = Math.abs(nw - bilan);
                if (ecart > pire) {
                    pire = ecart;
                    ou = `run ${run}, mois ${m} : NetWorth=${nw.toFixed(2)} $ vs bilan=${bilan.toFixed(2)} $`;
                }
            }
        }
        expect(pire, `patrimoine non reconstructible sous Monte Carlo — ${ou}`).toBeLessThan(EPS);
    });

    // ⚠️ CE QUE CETTE ASSERTION ATTRAPE, ET CE QU'ELLE N'ATTRAPE PAS — vérifié par PERTURBATION,
    // pas par raisonnement (un invariant qui ne trouve rien doit prouver qu'il POURRAIT trouver) :
    //
    //   • perturbation « fantôme » — publier `CELI × 0,999` dans `monthlyOutput` (l'actif AFFICHÉ
    //     diverge de la base qui sert à calculer `NetWorth`) → ÉCHOUE, écart 6 892 $ au run 42.
    //     C'est bien la classe MONEY-PHANTOM, et c'est ce que INV-9 doit voir.
    //   • perturbation « plan différent » — `reer *= keep × 0,999` dans le partage de divorce →
    //     PASSE, et c'est CORRECT : `NetWorth` est DÉRIVÉ des mêmes soldes, les deux côtés bougent
    //     ensemble. Un invariant de bilan ne peut pas, par construction, juger si le montant est le
    //     BON — seulement s'il est COHÉRENT. Le montant relève d'un test de comportement du
    //     divorce, pas d'ici. Confondre les deux, c'est croire cette garde plus forte qu'elle
    //     n'est (famille `GARDE-CIRCULAIRE`).


    it('aucun champ monétaire non fini (lecture STRICTE, pas de NaN silencé en 0)', () => {
        // ⚠️ Un `Number(x) || 0` permissif rendrait le cas précédent FAUX-VERT : `NaN > EPS` vaut
        // `false`. Un actif corrompu passerait donc pour un bilan parfait. Ce cas-ci lit en strict.
        const fautifs: string[] = [];
        for (let run = 0; run < ALL_RUNS.length && fautifs.length < 5; run++) {
            for (let m = 0; m < ALL_RUNS[run].length; m++) {
                const p = ALL_RUNS[run][m] as unknown as Record<string, unknown>;
                for (const k of [...ASSET_KEYS, 'NetWorth', 'DettesNonImmo', 'DetteTotale'] as const) {
                    const raw = p[k];
                    if (raw === undefined) continue;   // champ non applicable : convention du moteur
                    if (!Number.isFinite(Number(raw))) fautifs.push(`run ${run} mois ${m} : ${k}=${String(raw)}`);
                }
            }
        }
        expect(fautifs, `champs non finis sous Monte Carlo : ${fautifs.slice(0, 5).join(' | ')}`).toHaveLength(0);
    });

    it('INV-6 : aucun actif négatif (un découvert va en LiquidDebt) et l\'hypothèque n\'est pas double-comptée', () => {
        let pireNeg = 0;
        let ouNeg = '(aucun)';
        let pireDette = 0;
        let ouDette = '(aucun)';
        for (let run = 0; run < ALL_RUNS.length; run++) {
            for (let m = 0; m < ALL_RUNS[run].length; m++) {
                const p = ALL_RUNS[run][m] as unknown as Record<string, number | undefined>;
                for (const k of NON_NEGATIVE) {
                    const v = Number(p[k]) || 0;
                    if (v < pireNeg) { pireNeg = v; ouNeg = `run ${run} mois ${m} : ${k}=${v.toFixed(2)} $`; }
                }
                // `DetteTotale` inclut l'hypothèque, `DettesNonImmo` non → l'écart ne peut être négatif.
                const ecart = (Number(p.DetteTotale) || 0) - (Number(p.DettesNonImmo) || 0);
                if (ecart < pireDette) { pireDette = ecart; ouDette = `run ${run} mois ${m} : écart=${ecart.toFixed(2)} $`; }
            }
        }
        expect(pireNeg, `actif négatif sous Monte Carlo — ${ouNeg}`).toBeGreaterThan(-EPS);
        expect(pireDette, `DetteTotale < DettesNonImmo (hypothèque mal comptée) — ${ouDette}`).toBeGreaterThan(-EPS);
    });
});
