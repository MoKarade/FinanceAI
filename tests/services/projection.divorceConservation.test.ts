// tests/services/projection.divorceConservation.test.ts
//
// [ENG-DIVORCE-NO-CONSERVATION-GUARD] — la garde qui manquait, et POURQUOI elle manquait.
//
// `projection.moneyConservation` et `projection.fuzzConservation` appellent tous deux
// `calculateFutureProjection(p)` SANS `runMC`. Or `tryDivorce` exige `enableMonteCarlo` : **zéro
// mois de divorce n'était vu par le harnais d'invariants.** Le splitter mute pourtant 15+ variables
// locales, dont les dettes et DEUX registres per-conjoint — une régression y serait silencieuse.
//
// Ce n'était pas un oubli mais un MUR technique : sous MC, `buildMonthlyDataPoint` ne rendait que
// `{ NetWorth, monthIndex }` (choix de performance), donc aucun solde n'était observable pour
// reconstruire un bilan. `[ENG-MC-OBSERVABILITY]` ouvre ce mur avec `verboseMonthlyPoints`, réservé
// aux tests — et cette garde est la première à en profiter.

import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionChartPoint } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User, Debt } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';
import { maisonDetenue } from '../helpers/menageProprietaire';

const users = (age: number): User[] => ([
    { name: 'Marc', grossSalary: 8_200, netSalary: 5_620, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 7_100, netSalary: 4_995, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

// Des DETTES au scénario : c'est le volet le plus récent du splitter (les dettes se partagent
// désormais comme les actifs) et donc le plus exposé à une régression.
const debts: Debt[] = ([
    { id: 'd1', name: 'Auto', balance: 28_000, interestRate: 6.5, minimumPayment: 520, type: 'auto' },
    { id: 'd2', name: 'Étudiant', balance: 14_000, interestRate: 4.0, minimumPayment: 180, type: 'student' },
] as unknown as Debt[]);

const params = (proj: Partial<ProjectionConfig>, avecMaison = false): SimulationParams => ({
    projection: {
        years: 12, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 1_500,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3, ...proj,
    } as ProjectionConfig,
    calculatedStartingCash: 70_000,
    liveCSVBalances: { CELI: 50_000, CELIAPP: 0, REER: 90_000, NON_ENREG: 40_000, CRYPTO: 10_000, REEE: 0 },
    // [TEST-DIVORCE-SANS-IMMOBILIER] `avecMaison` : la maison DÉTENUE (hypothèque comprise) entre
    // dans le scénario — les 16 fixtures de divorce du dépôt n'en avaient aucune, cette garde incluse.
    realEstateGoals: avecMaison ? [maisonDetenue()] : [], debts, childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: {
        targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 1_500,
        lifeExpectancy: 92, dbPensionMonthly: 0,
    } as unknown as RetirementGoal,
    config: { users: users(45), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: avecMaison ? 0 : 1_800,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

/** Scénario MC avec points COMPLETS — c'est ce que `verboseMonthlyPoints` rend possible. */
const runVerbose = (proj: Partial<ProjectionConfig>, avecMaison = false): ProjectionChartPoint[] => {
    const r = __runScenarioForTests(
        params(proj, avecMaison), 'AUTO_MARGINAL' as AllocationStrategy, true, false, 0, 'BASE', {},
        { verboseMonthlyPoints: true },
    ) as unknown as { chartData: ProjectionChartPoint[] };
    return r.chartData;
};

describe('[ENG-MC-OBSERVABILITY] le point mensuel COMPLET est disponible sous Monte-Carlo', () => {
    it('sans le drapeau, le point MC reste ALLÉGÉ (le défaut de production est intact)', () => {
        const r = __runScenarioForTests(
            params({}), 'AUTO_MARGINAL' as AllocationStrategy, true, false,
        ) as unknown as { chartData: Array<Record<string, unknown>> };
        const p = r.chartData[12] ?? {};
        expect(Object.keys(p).sort(), 'le point MC n\'est plus allégé : la perf de production régresse')
            .toEqual(['NetWorth', 'monthIndex']);
    });

    it('avec le drapeau, les soldes sont là', () => {
        const p = runVerbose({})[12] as unknown as Record<string, unknown>;
        for (const k of ['CELI', 'REER', 'NonReg', 'Liquidites', 'DetteTotale']) {
            expect(p[k], `champ ${k} absent : le point n'est pas complet`).toBeTypeOf('number');
        }
    });
});

describe('[ENG-DIVORCE-NO-CONSERVATION-GUARD] le splitter est enfin sous invariant', () => {
    // Ces trois assertions sont celles que le harnais existant applique en déterministe. Elles
    // n'avaient JAMAIS vu un seul mois de divorce.
    // ⚠️ PORTÉE HONNÊTE DE CE PREMIER TEST : `NetWorth` est RECALCULÉ depuis ces mêmes soldes
    // (`computeRawNetWorth`), donc l'identité est en partie structurelle — elle ne peut PAS
    // détecter un changement de modèle qui reste conservatif. Vérifié : retirer le partage des
    // dettes le laisse VERT. Ce qu'il attrape réellement : un solde muté mais NON exposé dans
    // `chartData` (divergence affichage/état), et un `NetWorth` non fini.
    // L'invariant qui MORD sur le splitter lui-même est le suivant (ratio de partage).
    it('le patrimoine reste RECONSTRUCTIBLE depuis les soldes affichés, divorce compris', () => {
        const data = runVerbose({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 });
        expect(data.length, 'aucun point : le scénario n\'a pas tourné').toBeGreaterThan(24);

        let worst = 0;
        let worstAt = -1;
        for (let i = 0; i < data.length; i++) {
            const p = data[i] as unknown as Record<string, number>;
            const actifs = (Number(p.Liquidites) || 0) + (Number(p.CELI) || 0) + (Number(p.CELIAPP) || 0)
                + (Number(p.REER) || 0) + (Number(p.NonReg) || 0) + (Number(p.Crypto) || 0)
                + (Number(p.REEE) || 0) + (Number(p.Immobilier) || 0);
            const residual = Math.abs(actifs - (Number(p.DetteTotale) || 0) - (Number(p.NetWorth) || 0));
            if (residual > worst) { worst = residual; worstAt = i; }
        }
        // 1 $ : les champs du point sont arrondis au CENT, plusieurs termes s'additionnent.
        expect(worst, `patrimoine non reconstructible au mois ${worstAt}`).toBeLessThan(1);
    });

    it('aucun compte ne devient NÉGATIF au passage du divorce', () => {
        const data = runVerbose({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 });
        for (let i = 0; i < data.length; i++) {
            const p = data[i] as unknown as Record<string, number>;
            for (const k of ['CELI', 'CELIAPP', 'REER', 'NonReg', 'Crypto', 'REEE']) {
                expect(Number(p[k]) || 0, `${k} négatif au mois ${i}`).toBeGreaterThanOrEqual(0);
            }
        }
    });

    // ── L'invariant qui MORD : le ratio de partage, mesuré sur les DETTES. ──
    // Non circulaire : la dette totale n'est pas dérivée du patrimoine, c'est une grandeur
    // INDÉPENDANTE. Si le splitter cesse de partager les dettes (le volet le plus récent, ajouté
    // par le lot divorce), ce ratio remonte vers 1 et le test tombe — vérifié par régression
    // chirurgicale.
    it('au mois du divorce, les DETTES suivent le même partage que les actifs', () => {
        const data = runVerbose({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 });
        // `divorceAnnualProbability: 1` ⇒ déclenchement au 1er janvier suivant le départ, soit m=12
        // (`tryDivorce` exige `currentMonthIndex === 0 && m > 0`).
        const avant = (data[11] as unknown as Record<string, number>);
        const apres = (data[12] as unknown as Record<string, number>);
        const detteAvant = Number(avant.DetteTotale) || 0;
        const detteApres = Number(apres.DetteTotale) || 0;

        expect(detteAvant, 'aucune dette avant le divorce : la fixture ne mesure rien').toBeGreaterThan(1_000);
        // Mesuré : 35 816 $ → 17 642 $, ratio 0,4926. L'écart au 0,50 exact est le remboursement
        // du mois, pas un défaut de partage — d'où une fenêtre, pas une égalité.
        const ratio = detteApres / detteAvant;
        expect(ratio, `les dettes ne suivent plus le partage (ratio ${ratio.toFixed(4)})`).toBeGreaterThan(0.44);
        expect(ratio, `les dettes ne suivent plus le partage (ratio ${ratio.toFixed(4)})`).toBeLessThan(0.56);
    });

    it('un split à 100 % ne fabrique NI actif fantôme NI dette négative', () => {
        // Le cas extrême : tout part. C'est là que les signes se retournent si le splitter dérape
        // (le bornage de `divorceSplitPct` a montré qu'un `keep` négatif transforme les dettes en
        // actif — ici on vérifie le bord LÉGITIME de l'intervalle).
        const data = runVerbose({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 100 });
        for (let i = 0; i < data.length; i++) {
            const p = data[i] as unknown as Record<string, number>;
            expect(Number(p.DetteTotale) || 0, `dette NÉGATIVE au mois ${i} (actif fantôme)`)
                .toBeGreaterThanOrEqual(0);
            expect(Number.isFinite(Number(p.NetWorth)), `NetWorth non fini au mois ${i}`).toBe(true);
        }
    });
});

// ── [TEST-DIVORCE-SANS-IMMOBILIER] les MÊMES invariants, avec une maison DÉTENUE ──────────────
//
// #748 a couvert le partage du bien lui-même (équité, dette, intérêt, mensualité). Restait la moitié
// que le ticket nommait en dernier : « passer la fixture aux gardes de conservation existantes ».
// Ce n'est pas une répétition : avec une hypothèque, la reconstruction du patrimoine CHANGE de
// formule — `Immobilier` est l'ÉQUITÉ, déjà nette d'hypothèque, donc c'est `DettesNonImmo` qu'il
// faut soustraire et jamais `DetteTotale` (`[JOUR-BILAN-ROMPU-SOUS-HYPOTHEQUE]`). La garde
// ci-dessus, écrite sans maison, soustrait `DetteTotale` : elle serait FAUSSE sur cette fixture, et
// elle ne pouvait pas le savoir. Livré au lot 197 (2026-09-06).
describe('[TEST-DIVORCE-SANS-IMMOBILIER] le splitter reste sous invariant avec une maison DÉTENUE', () => {
    const DIVORCE_50 = { divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 };
    const num = (p: ProjectionChartPoint, k: string): number => Number((p as unknown as Record<string, unknown>)[k]) || 0;

    it('la fixture MESURE bien quelque chose : maison, hypothèque, dettes hors immo, divorce', () => {
        const data = runVerbose(DIVORCE_50, true);
        const avant = data[11];
        const apres = data[12];
        expect(num(avant, 'Immobilier'), 'aucune équité : la maison n\'est pas dans le scénario').toBeGreaterThan(100_000);
        expect(num(avant, 'DetteTotale') - num(avant, 'DettesNonImmo'), 'aucune hypothèque : la moitié qui change la formule est absente').toBeGreaterThan(100_000);
        expect(num(avant, 'DettesNonImmo'), 'aucune dette hors immo : DettesNonImmo et DetteTotale seraient confondues').toBeGreaterThan(1_000);
        expect(num(apres, 'Immobilier'), 'le divorce n\'a pas eu lieu').toBeLessThan(num(avant, 'Immobilier') * 0.6);
    });

    it('le patrimoine reste RECONSTRUCTIBLE — avec `DettesNonImmo`, pas `DetteTotale`', () => {
        const data = runVerbose(DIVORCE_50, true);
        let worst = 0;
        let worstAt = -1;
        let worstNaif = 0;
        for (let i = 0; i < data.length; i++) {
            const p = data[i];
            const actifs = ['Liquidites', 'CELI', 'CELIAPP', 'REER', 'NonReg', 'Crypto', 'REEE', 'Immobilier']
                .reduce((s, k) => s + num(p, k), 0);
            const residual = Math.abs(actifs - num(p, 'DettesNonImmo') - num(p, 'NetWorth'));
            const residualNaif = Math.abs(actifs - num(p, 'DetteTotale') - num(p, 'NetWorth'));
            if (residual > worst) { worst = residual; worstAt = i; }
            if (residualNaif > worstNaif) worstNaif = residualNaif;
        }
        expect(worst, `patrimoine non reconstructible au mois ${worstAt}`).toBeLessThan(1);
        // Contre-épreuve : la formule SANS maison (soustraire `DetteTotale`) re-soustrait l'hypothèque
        // d'une équité qui en est déjà nette — l'écart EST l'hypothèque. C'est ce qui prouve que
        // cette fixture exerce bien la moitié que la garde d'origine ne voyait pas.
        expect(worstNaif, 'la formule naïve tient : l\'hypothèque n\'est pas dans le scénario').toBeGreaterThan(100_000);
    });

    it('aucun compte ne devient NÉGATIF au passage du divorce', () => {
        const data = runVerbose(DIVORCE_50, true);
        for (let i = 0; i < data.length; i++) {
            for (const k of ['CELI', 'CELIAPP', 'REER', 'NonReg', 'Crypto', 'REEE']) {
                expect(num(data[i], k), `${k} négatif au mois ${i}`).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it('au mois du divorce, hypothèque ET dettes hors immo suivent le même partage que les actifs', () => {
        const data = runVerbose(DIVORCE_50, true);
        const avant = data[11];
        const apres = data[12];
        const hypoAvant = num(avant, 'DetteTotale') - num(avant, 'DettesNonImmo');
        const hypoApres = num(apres, 'DetteTotale') - num(apres, 'DettesNonImmo');
        const ratioHypo = hypoApres / hypoAvant;
        const ratioAutres = num(apres, 'DettesNonImmo') / num(avant, 'DettesNonImmo');
        expect(hypoAvant, 'aucune hypothèque avant le divorce : la fixture ne mesure rien').toBeGreaterThan(100_000);
        // Mesuré 2026-09-06 : hypothèque 343 736 $ → ratio 0,4987 (l'écart au 0,50 exact est le
        // capital remboursé du mois) ; dettes hors immo 35 816 $ → ratio 0,4926 (cf. la garde sans
        // maison, 0,4926 aussi). Fenêtres, jamais des égalités : le remboursement du mois bouge.
        expect(ratioHypo, `l'hypothèque ne suit plus le partage (ratio ${ratioHypo.toFixed(4)})`).toBeGreaterThan(0.48);
        expect(ratioHypo).toBeLessThan(0.52);
        expect(ratioAutres, `les dettes hors immo ne suivent plus le partage (ratio ${ratioAutres.toFixed(4)})`).toBeGreaterThan(0.44);
        expect(ratioAutres).toBeLessThan(0.56);
    });

    it('un split à 100 % ne fabrique NI actif fantôme NI dette négative, maison comprise', () => {
        const data = runVerbose({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 100 }, true);
        for (let i = 0; i < data.length; i++) {
            expect(num(data[i], 'DetteTotale'), `dette NÉGATIVE au mois ${i}`).toBeGreaterThanOrEqual(0);
            expect(num(data[i], 'DettesNonImmo'), `dette hors immo NÉGATIVE au mois ${i}`).toBeGreaterThanOrEqual(0);
            expect(Number.isFinite(num(data[i], 'NetWorth')), `NetWorth non fini au mois ${i}`).toBe(true);
        }
    });
});
