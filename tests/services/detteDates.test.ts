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

    it('sumNotYetStartedDebtsAtMonth exclut une dette DÉJÀ ACTIVE AUJOURD\'HUI, pas encore commencée au mois passé — jamais les « terminée »', () => {
        // Mois 0 = janvier 2026 (« aujourd'hui »). m=-24 = janvier 2024 (mois PASSÉ vérifié).
        const dettes = [
            { balance: 8_000 }, // toujours active → jamais dans le delta d'exclusion
            { balance: 5_000, startDate: '2025-01-01' }, // commencée en 2025 : 'a-venir' en 2024, DÉJÀ active aujourd'hui (2026) → exclue du passé de 2024 (delta)
            { balance: 3_000, termEndDate: '2020-01-01' }, // terme échu, jamais effacée → PAS dans le delta
        ];
        expect(sumNotYetStartedDebtsAtMonth(dettes, 2026, 0, -24)).toBe(5_000);
        // À un mois APRÈS son début (2025) mais toujours dans le passé : plus rien à exclure.
        expect(sumNotYetStartedDebtsAtMonth(dettes, 2026, 0, -6)).toBe(0);
    });

    it('[CRITIQUE, revue #687] une dette qui n\'a PAS ENCORE COMMENCÉ AUJOURD\'HUI n\'est JAMAIS dans le delta, à AUCUN mois passé', () => {
        // Régression trouvée indépendamment par financial-integrity ET code-reviewer : le 1er jet
        // excluait cette dette (balance 10 000 $ retranchée) à CHAQUE mois passé, alors qu'elle n'a
        // jamais fait partie de `currentDebtNonImmo` (le moteur exclut déjà une dette 'a-venir'
        // AUJOURD'HUI de `sumActiveDebts`) — fabriquant 10 000 $ de patrimoine passé.
        const dettes = [{ balance: 10_000, startDate: '2028-01-01' }]; // 2028 : encore À VENIR même aujourd'hui (2026)
        expect(sumNotYetStartedDebtsAtMonth(dettes, 2026, 0, -24)).toBe(0); // PAS 10 000
        expect(sumNotYetStartedDebtsAtMonth(dettes, 2026, 0, -120)).toBe(0); // même 10 ans plus tôt
        expect(sumNotYetStartedDebtsAtAbsoluteMonth(dettes, 2016 * 12, 2026 * 12)).toBe(0);
    });

    it('sanitise comme le moteur (entrée nullish/solde non fini → 0 dans le delta), pour une dette ÉLIGIBLE au delta', () => {
        // Dettes déjà actives AUJOURD'HUI (2025 &lt; 2026) mais pas encore commencées au mois vérifié
        // (2024) — donc bien ÉLIGIBLES au delta, ce qui isole la sanitisation du garde-fou CRITIQUE.
        const dettes = [null, { balance: NaN, startDate: '2025-01-01' }, { balance: 1_000, startDate: '2025-01-01' }] as unknown as Parameters<typeof sumNotYetStartedDebtsAtMonth>[0];
        expect(sumNotYetStartedDebtsAtMonth(dettes, 2026, 0, -24)).toBe(1_000);
        expect(sumNotYetStartedDebtsAtAbsoluteMonth(dettes, 2024 * 12, 2026 * 12)).toBe(1_000);
    });

    it('acceptent undefined/[] → 0 (rien à exclure)', () => {
        expect(sumNotYetStartedDebtsAtMonth(undefined, 2026, 0, 0)).toBe(0);
        expect(sumNotYetStartedDebtsAtMonth([], 2026, 0, 0)).toBe(0);
        expect(sumNotYetStartedDebtsAtAbsoluteMonth(undefined, 2026 * 12, 2026 * 12)).toBe(0);
    });

    it('au mois 0 lui-même (aujourd\'hui), aucune dette DÉJÀ active n\'a besoin d\'être exclue — cas trivial du wrapper 4-arguments', () => {
        // Ce test vérifie seulement que le wrapper (startYear, startMonth, m=0) calcule bien
        // moisAujourdhui == courant dans ce cas particulier — PAS un raccord contre le moteur réel
        // (delta nul ici, quelle que soit la formule : ne prouve pas la non-divergence des $ bruts
        // vs post-amortissement, couverte séparément par le test suivant).
        const dettes = [bail({ startDate: '2026-01-01' })];
        const pts = points(dettes);
        const currentDebtNonImmo = pts[0].DettesNonImmo;
        expect(currentDebtNonImmo - sumNotYetStartedDebtsAtMonth(dettes as never, 2026, 0, 0)).toBe(currentDebtNonImmo);
    });

    it('[MOYEN, revue #687] deux dettes (une active partout, une EFFECTIVEMENT gatée) — résidu borné au paiement mensuel de la dette gatée SEULE, jamais au solde de l\'autre', () => {
        // Régression trouvée par projection-validator (mesuré 371,50 $ sur un exemple similaire) :
        // le delta retranche le solde BRUT du bail (gaté), alors que `currentDebtNonImmo` porte son
        // solde APRÈS le pas d'amortissement du mois 0 du moteur — le clamp (`Math.max(0, …)`, testé
        // séparément dans `buildPastPrefix.test.ts`) ne borne que le côté NÉGATIF (une seule dette,
        // gatée) ; ici, un GROS prêt (jamais gaté) maintient le total largement positif, donc le
        // résidu SURVIT comme argent fantôme borné, plutôt que d'être clampé à 0. Approximation
        // ASSUMÉE (documentée dans `debtSchedule.ts`), fermeture complète routée à
        // `[DEBT-AMORTIZATION]` (solde per-dette publié par le moteur, pas retranché du store).
        // ⚠️ Solde volontairement GROS (200 000 $, pas une carte à faible solde) : une petite dette à
        // taux élevé peut être payée d'un coup par la stratégie BASE si le cash disponible le permet
        // (mesuré : une carte à 15 000 $/19 % tombe à 0 $ dès le mois 0) — un artefact de STRATÉGIE
        // qui aurait rendu ce test vacueux (résidu comparé à 0, pas à la vraie valeur de l'autre dette).
        const grosPret = { id: 'gros', name: 'Prêt perso', balance: 200_000, interestRate: 5, minimumPayment: 1_000, category: 'Personal' };
        const bailGate = bail({ startDate: '2025-12-01' }); // 2 mois avant aujourd'hui (m=-2 = nov 2025)

        const currentDebtNonImmo = points([grosPret, bailGate])[0].DettesNonImmo; // post-amortissement des DEUX
        const pretSeulCurrent = points([grosPret])[0].DettesNonImmo; // valeur CORRECTE attendue au mois -2 (bail exclu)

        const debtNonImmoAvant = currentDebtNonImmo - sumNotYetStartedDebtsAtMonth([grosPret, bailGate] as never, 2026, 0, -2);

        // Résidu borné au paiement mensuel du BAIL SEUL (500 $) + marge — jamais au solde du gros
        // prêt (200 000 $), qui n'est pas touché par le delta et doit rester quasi intact.
        expect(Math.abs(debtNonImmoAvant - pretSeulCurrent)).toBeLessThan(600);
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
