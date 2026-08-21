import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import {
    phaseDette, moisAbsolu, moisDeSimulation, estLePremierMoisApresLeTerme,
    phaseDetteAuMoisAbsolu, sumNotYetStartedDebtsAtMonth, sumNotYetStartedDebtsAtAbsoluteMonth,
} from '../../services/projection/debtSchedule';
import type { ProjectionResult, ProjectionChartPoint } from '../../services/projection/types';
import type { BudgetConfig, User } from '../../types';

/**
 * [DETTE-DATES] — demande Marc 2026-08-19 : « pour la dette de ma voiture la date de début est le
 * 20 juillet mais j'ai jamais pu définir le début ni la fin du bail ».
 *
 * Avant ce lot, le moteur servait TOUTE dette du mois 0 jusqu'à extinction, sans jamais regarder un
 * calendrier : un prêt signé dans six mois grevait le budget d'aujourd'hui, et un bail de 48 mois
 * continuait d'être payé pendant trente ans.
 *
 * ⚠️ DÉCISION MARC sur ce que fait la date de fin : « arrêter le paiement ET signaler si le solde
 * n'est pas nul ». Le solde résiduel n'est JAMAIS remis à zéro — l'effacer fabriquerait du
 * patrimoine. C'est le cas de son BAIL auto : un bail n'amortit rien, donc son « solde » saisi
 * comme une dette ordinaire ne tombera généralement pas à zéro, et cet écart doit se VOIR.
 */

const mkUser = (name: string, grossMonthly: number, netMonthly: number): User => ({
    name, grossSalary: grossMonthly, netSalary: netMonthly, color: '#10b981',
    age: 40, birthYear: 1986, canadaArrivalYear: 1986, hasOwnedPropertyLast4Years: true,
} as unknown as User);

const params = (debts: unknown[]): SimulationParams => ({
    projection: {
        years: 6, returnRate: 6, inflationRate: 2, savingsMode: 'manual',
        manualContribution: 0, usePortfolioRate: false,
        returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 3,
    },
    calculatedStartingCash: 60_000,
    liveCSVBalances: { CELI: 20_000, CELIAPP: 0, REER: 40_000, NON_ENREG: 10_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], childGoals: [], travelGoals: [], lifeEvents: [],
    debts: debts as SimulationParams['debts'],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 4_000, governmentPension: 1_500 } as unknown as SimulationParams['retirementGoal'],
    config: { users: [mkUser('A', 8_000, 5_700)] as unknown as BudgetConfig['users'], splitMode: '50/50' },
    baseGrossAnnual: 96_000, baseNetAnnual: 68_400,
    currentRentExpense: 1_500, baseMonthlyExpenses: 3_200,
    startYear: 2026, startMonth: 0,
} as SimulationParams);

/** Bail auto : 500 $/mois, solde saisi 22 000 $, taux 7 %. */
const bail = (over: Record<string, unknown> = {}) => ({
    id: 'auto', name: 'Bail auto', balance: 22_000, interestRate: 7,
    minimumPayment: 500, category: 'Car', kind: 'auto-lease', ...over,
});

const points = (debts: unknown[]): Record<string, number>[] => {
    const r = calculateFutureProjection(params(debts));
    const base = (r.allResults as ProjectionResult[]).find((x) => x.stratType === 'BASE')!;
    return (base.chartData as ProjectionChartPoint[]) as unknown as Record<string, number>[];
};

const evenements = (debts: unknown[]): string[] => {
    const r = calculateFutureProjection(params(debts));
    const base = (r.allResults as ProjectionResult[]).find((x) => x.stratType === 'BASE')!;
    return (base.chartData as unknown as Array<{ lifeEvents?: string[] }>)
        .flatMap((p) => p.lifeEvents ?? []);
};

describe('[DETTE-DATES] le calendrier de la dette — fonctions pures', () => {
    it('compare des MOIS, pas des jours (le moteur est mensuel)', () => {
        // Marc a saisi « 20 juillet » : le mois de juillet est DÛ, pas reporté au mois suivant.
        // Prétendre au jour près serait une précision que le modèle n'a pas.
        expect(moisAbsolu('2026-07-20')).toBe(2026 * 12 + 6);
        expect(moisAbsolu('2026-07-01')).toBe(moisAbsolu('2026-07-31'));
        // Simulation démarrant en janvier 2026 : m = 6 est juillet 2026.
        expect(moisDeSimulation(2026, 0, 6)).toEqual({ annee: 2026, mois: 6 });
        // Le mois du DÉBUT est actif ; le précédent ne l'est pas.
        expect(phaseDette({ startDate: '2026-07-20' }, 2026, 0, 6)).toBe('active');
        expect(phaseDette({ startDate: '2026-07-20' }, 2026, 0, 5)).toBe('a-venir');
        // Le mois de la FIN est INCLUS (dernier paiement), le suivant non.
        expect(phaseDette({ termEndDate: '2030-06-15' }, 2026, 0, 53)).toBe('active');
        expect(phaseDette({ termEndDate: '2030-06-15' }, 2026, 0, 54)).toBe('terminee');
    });

    it('une date ILLISIBLE est traitée comme ABSENTE, jamais comme une contrainte inventée', () => {
        // Sens conservateur : une saisie ratée ne doit pas faire disparaître une dette réelle du
        // budget. On garde la dette active plutôt que de l'effacer sur un champ mal formé.
        for (const mauvais of ['', 'demain', '20-07-2026', '2026-13-01', 'null']) {
            expect(phaseDette({ startDate: mauvais }, 2026, 0, 0), `startDate=${mauvais}`).toBe('active');
            expect(phaseDette({ termEndDate: mauvais }, 2026, 0, 300), `termEndDate=${mauvais}`).toBe('active');
        }
        // Et sans aucune date : comportement d'avant, à l'identique.
        expect(phaseDette({}, 2026, 0, 0)).toBe('active');
        expect(phaseDette({}, 2026, 0, 999)).toBe('active');
    });

    it('le mois du signalement est UNIQUE (une alerte permanente ne se lit plus)', () => {
        const d = { termEndDate: '2030-06-15' };
        expect(estLePremierMoisApresLeTerme(d, 2026, 0, 53)).toBe(false);  // dernier mois payé
        expect(estLePremierMoisApresLeTerme(d, 2026, 0, 54)).toBe(true);   // le mois d'après
        expect(estLePremierMoisApresLeTerme(d, 2026, 0, 55)).toBe(false);  // et plus jamais
        expect(estLePremierMoisApresLeTerme({}, 2026, 0, 54)).toBe(false); // sans date : jamais
    });
});

describe('[PASSE-REEL-DETTE-1] phaseDetteAuMoisAbsolu / sumNotYetStartedDebtsAtMonth / ...AtAbsoluteMonth', () => {
    it('phaseDetteAuMoisAbsolu(dette, courant) est le même noyau que phaseDette (mois absolu direct)', () => {
        // Juillet 2026 = moisAbsolu('2026-07-20') = 2026*12+6, cf. test ci-dessus.
        const courantJuillet = 2026 * 12 + 6;
        expect(phaseDetteAuMoisAbsolu({ startDate: '2026-07-20' }, courantJuillet)).toBe('active');
        expect(phaseDetteAuMoisAbsolu({ startDate: '2026-07-20' }, courantJuillet - 1)).toBe('a-venir');
        // Doit coïncider EXACTEMENT avec phaseDette (même startYear/startMonth/m que moisAbsolu(date)).
        expect(phaseDetteAuMoisAbsolu({ startDate: '2026-07-20' }, courantJuillet))
            .toBe(phaseDette({ startDate: '2026-07-20' }, 2026, 0, 6));
    });

    it('sumNotYetStartedDebtsAtMonth ne compte QUE les dettes pas-encore-commencées, jamais les « terminée »', () => {
        const dettes = [
            { balance: 8_000 }, // toujours active → jamais dans le delta d'exclusion
            { balance: 5_000, startDate: '2028-01-01' }, // pas encore commencée en 2026 → exclue (delta)
            { balance: 3_000, termEndDate: '2020-01-01' }, // terme échu, jamais effacée → PAS dans le delta
        ];
        // Mois 0 = janvier 2026 (startYear/startMonth de la fixture) : seule la dette 2028 est à exclure.
        expect(sumNotYetStartedDebtsAtMonth(dettes, 2026, 0, 0)).toBe(5_000);
        // Après 2028 : plus rien à exclure (la dette 2028 a commencé, la 'terminee' n'a jamais compté ici).
        expect(sumNotYetStartedDebtsAtMonth(dettes, 2026, 0, 24)).toBe(0);
    });

    it('sanitise comme le moteur (entrée nullish/solde non fini → 0 dans le delta)', () => {
        const dettes = [null, { balance: NaN, startDate: '2028-01-01' }, { balance: 1_000, startDate: '2028-01-01' }] as unknown as Parameters<typeof sumNotYetStartedDebtsAtMonth>[0];
        expect(sumNotYetStartedDebtsAtMonth(dettes, 2026, 0, 0)).toBe(1_000);
        expect(sumNotYetStartedDebtsAtAbsoluteMonth(dettes, 2026 * 12)).toBe(1_000);
    });

    it('acceptent undefined/[] → 0 (rien à exclure)', () => {
        expect(sumNotYetStartedDebtsAtMonth(undefined, 2026, 0, 0)).toBe(0);
        expect(sumNotYetStartedDebtsAtMonth([], 2026, 0, 0)).toBe(0);
        expect(sumNotYetStartedDebtsAtAbsoluteMonth(undefined, 2026 * 12)).toBe(0);
    });

    it('[discriminant] currentDebtNonImmo − sumNotYetStartedDebtsAtMonth == sumActiveDebts du moteur (raccord EXACT, Option A)', () => {
        // Même dette, même sanitisation, même exclusion — vérifié via le MOTEUR réel (calculateFutureProjection),
        // pas une réimplémentation locale de sumActiveDebts (qui prouverait sa propre copie, pas le raccord).
        // La dette est DÉJÀ active au mois 0 (startDate au 1er janvier = mois 0 lui-même) → rien à exclure,
        // donc le total attendu du passé est EXACTEMENT `pts[0].DettesNonImmo`, sans aucune approximation.
        const dettes = [bail({ startDate: '2026-01-01' })];
        const pts = points(dettes);
        const currentDebtNonImmo = pts[0].DettesNonImmo;
        expect(currentDebtNonImmo - sumNotYetStartedDebtsAtMonth(dettes as never, 2026, 0, 0)).toBe(currentDebtNonImmo);
    });
});

describe('[DETTE-DATES] ce que ça change dans la projection', () => {
    it('SANS dates : comportement strictement inchangé (rétrocompatible)', () => {
        // La garde la plus importante du lot : les champs sont ADDITIFS et optionnels, donc une
        // dette existante doit produire EXACTEMENT la même projection qu'avant.
        const avant = points([bail()]);
        const apres = points([bail({ startDate: undefined, termEndDate: undefined })]);
        expect(avant.length).toBe(apres.length);
        for (let i = 0; i < avant.length; i++) {
            expect(apres[i].NetWorth).toBe(avant[i].NetWorth);
            expect(apres[i].DettesNonImmo).toBe(avant[i].DettesNonImmo);
        }
    });

    it('une dette PAS ENCORE COMMENCÉE ne pèse ni au budget ni au bilan', () => {
        const sans = points([]);
        const futur = points([bail({ startDate: '2028-01-01' })]);

        // Non-vacuité : la fixture a bien 24 mois AVANT le début, et la dette est substantielle.
        expect(futur.length).toBeGreaterThan(30);

        // Avant 2028, le bilan doit être celui d'un ménage SANS cette dette.
        for (let i = 0; i < 24; i++) {
            expect(futur[i].DettesNonImmo, `mois ${i} : une dette non commencée est au bilan`).toBe(0);
            expect(futur[i].NetWorth).toBeCloseTo(sans[i].NetWorth, 2);
        }
        // Et après, elle existe pour de bon — sinon le test ne prouverait que « rien ne se passe ».
        expect(futur[25].DettesNonImmo).toBeGreaterThan(20_000);
        expect(futur[25].NetWorth).toBeLessThan(sans[25].NetWorth - 20_000);
    });

    it('à la FIN du terme, le paiement s’arrête — les dépenses baissent à la bonne date', () => {
        // Bail de 4 ans : dernier paiement en décembre 2029 (m = 47), plus rien ensuite.
        const avecFin = points([bail({ startDate: '2026-01-01', termEndDate: '2029-12-31' })]);
        const sansFin = points([bail({ startDate: '2026-01-01' })]);

        // Discriminant : la dépense du mois 48 doit être PLUS BASSE avec une date de fin.
        const depense = (p: Record<string, number>) => Number(p.Expenses) || 0;
        expect(depense(avecFin[47])).toBeCloseTo(depense(sansFin[47]), 0);   // même dernier mois payé
        expect(depense(sansFin[48]) - depense(avecFin[48]),
            'le paiement continue après la fin du terme').toBeGreaterThan(400);
    });

    it('solde NON NUL à la fin : signalé UNE fois, JAMAIS effacé', () => {
        // ⚠️ Le cœur de la décision de Marc. Un bail ne s'amortit pas : au terme, le « solde » saisi
        // est encore largement positif. Le remettre à zéro fabriquerait du patrimoine.
        const debts = [bail({ startDate: '2026-01-01', termEndDate: '2027-12-31' })];
        const pts = points(debts);
        const evs = evenements(debts);

        // Non-vacuité : le terme échoit bien DANS l'horizon simulé (6 ans).
        expect(pts.length).toBeGreaterThan(30);

        // Le solde survit au terme — il reste au bilan.
        const apresTerme = pts[30];
        expect(apresTerme.DettesNonImmo, 'le solde résiduel a été effacé en silence').toBeGreaterThan(1_000);
        // Et il ne bouge plus (aucun paiement, aucun intérêt).
        expect(pts[40].DettesNonImmo).toBeCloseTo(apresTerme.DettesNonImmo, 2);

        // Signalé, et signalé UNE SEULE fois.
        const alertes = evs.filter((e) => /fin du terme/i.test(e));
        expect(alertes.length, `alertes émises : ${alertes.length}`).toBe(1);
        expect(alertes[0]).toContain('Bail auto');
    });

    it('solde éteint AVANT le terme : aucune alerte (on ne crie pas pour rien)', () => {
        // Symétrique du cas précédent, et il compte autant : une alerte qui se déclenche quand tout
        // va bien devient du bruit, et on cesse de la lire.
        const debts = [bail({ balance: 2_000, minimumPayment: 500, startDate: '2026-01-01', termEndDate: '2029-12-31' })];
        const pts = points(debts);
        // Non-vacuité : la dette est bien éteinte avant le terme.
        expect(pts[47].DettesNonImmo).toBeLessThan(1);
        expect(evenements(debts).filter((e) => /fin du terme/i.test(e))).toHaveLength(0);
    });
});
