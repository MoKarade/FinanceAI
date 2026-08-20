import { describe, it, expect } from 'vitest';
import { processJanuaryReset, type JanuaryContext, type JanuaryHelpers } from '../../services/projection/taxJanuary';
import { processDecemberTaxFiling, type DecemberContext } from '../../services/projection/taxDecember';
import {
    calculateFiscalReport, getMarginalRate, calculateDividendTax,
    FHSA_ANNUAL_LIMIT_PER_USER, FHSA_LIFETIME_LIMIT_PER_USER, RAMQ_MAX_PREMIUM_2026,
    type FiscalReport,
} from '../../utils/tax';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionResult, ProjectionChartPoint } from '../../services/projection/types';
import type { BudgetConfig, User } from '../../types';

/**
 * [CELIAPP-DOUBLE-RECHARGE] · [RAMQ-ACTIF-HORS-RETRAITS] — audit de santé 2026-08-19, vague 1b.
 *
 * Deux défauts du même fichier, de la même famille : **une grandeur annuelle écrite par deux
 * endroits qui s'ignorent** pour le premier, **une assiette asymétrique entre deux branches** pour
 * le second.
 *
 * PREUVE DE DISCRIMINATION, mesurée (`git apply -R`) : **5 cas sur 13** échouent sur le code
 * d'avant — les 3 de la CHAÎNE CELIAPP et les 2 de la RAMQ. Les autres sont des gardes de contrat
 * ou de rétrocompat, signalées comme telles à leur emplacement.
 *
 * ⚠️ **Deux de mes premières versions de test étaient FAUSSES, et c'est instructif** :
 *  1. les cas visant `processJanuaryReset` en direct passaient des deux côtés — le contrat de
 *     janvier était déjà bon, le défaut vivait chez son APPELANT
 *     (`TEST-AU-CONTRAT-NE-VOIT-PAS-L-APPELANT`) ;
 *  2. mon premier test de chaîne accusait le code sur un scénario SANS cotisation, où le report
 *     maximal est parfaitement légitime — le test avait tort, pas le moteur. Un test qui échoue
 *     n'a pas forcément raison.
 */

// ─── CELIAPP ──────────────────────────────────────────────────────────────────

const janHelpers: JanuaryHelpers = {
    RRIF_RATES: { 72: 0.054, 80: 0.0682 },
    calculateFiscalReport: () => ({ marginalRate: 0.30, netIncome: 50000 } as unknown as FiscalReport),
};

const janCtx = (o: Partial<JanuaryContext> = {}): JanuaryContext => ({
    m: 12, startYear: 2026, simInflation: 2, age: 40, isRetired: false,
    activeUsersCount: 2, oasClawbackNextPeriod: 0, hasPurchasedPrimary: false,
    celiappOpeningYear: 2026, fhsaEligibleUsersCount: 2,
    users: [{ birthYear: 1986 }, { birthYear: 1988 }],
    celiapp: 0, reer: 100000, liquid: 50000, nonReg: 0, crypto: 0, celi: 0,
    accRetraitsReerYearOld: 0, incomeRetirementMonthly: 0,
    fhsaRoomCurrent: 0, fhsaLifetimeContrib: 0, celiRoomCurrent: 0, rrspRoomCurrent: 0,
    taxCurrentYearGains: 0, prevPortfolioNW: 0, loopYear: 2027, reerByUser: [100000],
    // [FISC-RRSP-ROOM-PER-USER] couple à revenus égaux : 160 000 réparti 80/80 (Σ == scalaire).
    accGrossIncomeYearByUser: [80000, 80000],
    ...o,
});

const ANNUEL_COUPLE = FHSA_ANNUAL_LIMIT_PER_USER * 2;

// Fixtures d'INTÉGRATION (calquées sur `tests/services/coupleTaxation.test.ts`) : le seul moyen de
// voir l'effet d'un défaut situé chez l'APPELANT de `processJanuaryReset`.
function mkUser(name: string, grossMonthly: number, netMonthly: number): User {
    return {
        name, grossSalary: grossMonthly, netSalary: netMonthly, color: '#10b981',
        age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false,
    } as unknown as User;
}

function paramsForUsers(users: User[], avecAchat = false): SimulationParams {
    const grossMonthly = users.reduce((s, u) => s + (u.grossSalary || 0), 0);
    const netMonthly = users.reduce((s, u) => s + (u.netSalary || 0), 0);
    return {
        projection: {
            years: 7, returnRate: 6, inflationRate: 2, savingsMode: 'manual',
            manualContribution: 0, usePortfolioRate: false,
            returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
            emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 3,
        },
        calculatedStartingCash: 30000,
        liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
        realEstateGoals: avecAchat ? [{
            id: 'p1', name: 'Maison', isActive: true, purchaseDate: '2032-01-01',
            price: 500000, downPayment: 100000, mortgageRate: 5, amortization: 25,
            totalClosingCosts: 0, monthlyPayment: 0, unrecoverableMonthly: 0, isPrimaryResidence: true,
        }] as unknown as SimulationParams['realEstateGoals'] : [],
        debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
        retirementGoal: { targetAge: 65, targetMonthlyIncome: 4000, governmentPension: 1500 } as unknown as SimulationParams['retirementGoal'],
        config: { users: users as unknown as BudgetConfig['users'], splitMode: '50/50' },
        baseGrossAnnual: grossMonthly * 12,
        baseNetAnnual: netMonthly * 12,
        currentRentExpense: 1800,
        baseMonthlyExpenses: 4000,
        startYear: 2026,
        startMonth: 0,
    } as SimulationParams;
}

/**
 * ⚠️ Les cas ci-dessous testent le CONTRAT de `processJanuaryReset`, qui était DÉJÀ correct : le
 * défaut vivait chez son APPELANT (décembre écrasait `fhsaRoom` juste avant que janvier ne le lise).
 * Mesuré : **aucun de ces cas n'échoue** sur le code d'avant. Ils gardent le contrat contre une
 * régression, ils ne prouvent PAS le correctif — c'est exactement le piège
 * `TEST-AU-CONTRAT-NE-VOIT-PAS-L-APPELANT` déjà indexé dans `CLAUDE.md`, et je suis tombé dedans
 * en écrivant ce fichier. La vraie garde est le `describe` suivant, qui vise la CHAÎNE.
 */
describe('[CELIAPP-DOUBLE-RECHARGE] contrat de janvier : le report suit le résiduel qu’on lui donne', () => {
    it('tout cotisé (résiduel 0) ⇒ le nouvel espace vaut l’annuel, PAS le double', () => {
        const r = processJanuaryReset(0, janCtx({ fhsaRoomCurrent: 0 }), janHelpers)!;
        // Discriminant : AVANT, décembre remettait `fhsaRoom` au plein annuel juste avant que
        // janvier ne le lise comme « résiduel de l'an passé ». Le report était donc TOUJOURS
        // maximal — ce cas rendait 32 000 $ au lieu de 16 000 $.
        expect(r.fhsaRoomNew).toBe(ANNUEL_COUPLE);
    });

    it('rien cotisé (résiduel = annuel) ⇒ report MAXIMAL, légitime cette fois', () => {
        const r = processJanuaryReset(0, janCtx({ fhsaRoomCurrent: ANNUEL_COUPLE }), janHelpers)!;
        // Le report existe bel et bien dans la loi (jusqu'à 8 000 $/personne d'années antérieures,
        // déduction max 16 000 $/an). Ce qui était faux, c'est le RÉSIDUEL qu'on lui donnait.
        expect(r.fhsaRoomNew).toBe(ANNUEL_COUPLE * 2);
    });

    it('moitié cotisée ⇒ report PROPORTIONNEL (la preuve que le résiduel est bien lu)', () => {
        const r = processJanuaryReset(0, janCtx({ fhsaRoomCurrent: ANNUEL_COUPLE / 2 }), janHelpers)!;
        expect(r.fhsaRoomNew).toBe(ANNUEL_COUPLE + ANNUEL_COUPLE / 2);
        // Anti-vacuité : les trois cas ci-dessus doivent donner trois valeurs DISTINCTES. Avec le
        // bug, ils rendaient tous la même (le double de l'annuel) — un test à un seul cas serait
        // passé au vert sans rien prouver.
        const tousCotise = processJanuaryReset(0, janCtx({ fhsaRoomCurrent: 0 }), janHelpers)!.fhsaRoomNew;
        const rienCotise = processJanuaryReset(0, janCtx({ fhsaRoomCurrent: ANNUEL_COUPLE }), janHelpers)!.fhsaRoomNew;
        expect(new Set([tousCotise, r.fhsaRoomNew, rienCotise]).size).toBe(3);
    });

    it('le plafond à VIE borne toujours le nouvel espace', () => {
        const presqueAuMax = FHSA_LIFETIME_LIMIT_PER_USER * 2 - 3000;
        const r = processJanuaryReset(0, janCtx({
            fhsaRoomCurrent: ANNUEL_COUPLE, fhsaLifetimeContrib: presqueAuMax,
        }), janHelpers)!;
        expect(r.fhsaRoomNew).toBe(3000);
    });

    it('le plafond à vie met 5 ans à être atteint, pas 3', () => {
        // Scénario : le couple cotise TOUT son espace chaque année (résiduel 0 transmis).
        const plafondVie = FHSA_LIFETIME_LIMIT_PER_USER * 2;
        let cumule = 0, annees = 0, espace = ANNUEL_COUPLE;
        while (cumule < plafondVie && annees < 15) {
            annees++;
            cumule += espace;
            espace = processJanuaryReset(0, janCtx({
                fhsaRoomCurrent: 0, fhsaLifetimeContrib: cumule,
            }), janHelpers)!.fhsaRoomNew;
        }
        // Discriminant chiffré : avec le bug (32 000 $/an), 80 000 $ tombaient en 3 ans.
        expect(cumule).toBe(plafondVie);
        expect(annees).toBe(5);
    });
});

describe('[CELIAPP-DOUBLE-RECHARGE] la CHAÎNE : ce que la projection PUBLIE vraiment', () => {
    /**
     * Le SEUL bloc qui discrimine. Les cas de contrat ci-dessus passent des deux côtés parce que le
     * défaut était chez l'appelant : il faut donc traverser décembre PUIS janvier pour le voir.
     *
     * ⚠️ Et le scénario doit faire COTISER le couple. Sans achat immobilier prévu,
     * `cashflowAllocation` ne verse rien au CELIAPP (`hasFuturePurchase` requis), le résiduel reste
     * plein, et le report maximal est alors parfaitement LÉGITIME — mon premier test échouait sur
     * ce cas-là en accusant le code, alors que c'est le test qui avait tort.
     */
    const soldesDecembre = (avecAchat: boolean): number[] => {
        const users = [mkUser('A', 8000, 5800), mkUser('B', 8000, 5800)];
        const r = calculateFutureProjection(paramsForUsers(users, avecAchat));
        const base = (r.allResults as ProjectionResult[]).find((x) => x.stratType === 'BASE')!;
        return (base.chartData as ProjectionChartPoint[])
            .filter((_, i) => i % 12 === 11)
            .map((p) => (p as unknown as Record<string, number>).CELIAPP ?? 0);
    };

    it('la 1re année ne cotise pas plus que le plafond annuel LÉGAL du couple', () => {
        const soldes = soldesDecembre(true);
        expect(soldes.length).toBeGreaterThan(3);            // non-vacuité de la série
        expect(soldes[0]).toBeGreaterThan(1000);             // le couple cotise bien (sinon vacueux)

        // Discriminant MESURÉ : 16 926 $ après correctif contre 32 962 $ avant — soit plus du
        // DOUBLE du plafond annuel de 16 000 $ pour le couple. La tolérance couvre la croissance
        // intra-année (6 %/an) sans laisser passer un facteur 2.
        expect(soldes[0]).toBeLessThanOrEqual(ANNUEL_COUPLE * 1.15);
    });

    it('le rythme d’accumulation reste sous le plafond annuel + croissance', () => {
        const soldes = soldesDecembre(true);
        // Aucune ANNÉE ne doit ajouter plus que le plafond légal (marge pour le rendement du
        // portefeuille CELIAPP). Avant : +34 729 $ entre l'an 1 et l'an 2 (67 691 − 32 962).
        for (let i = 1; i < soldes.length; i++) {
            const ajout = soldes[i] - soldes[i - 1];
            if (soldes[i] === 0) break;                      // année de l'achat : le solde est vidé
            expect(ajout).toBeLessThanOrEqual(ANNUEL_COUPLE * 1.35);
        }
    });

    it('sans cotisation, les droits reportés sont bien PUBLIÉS (l’ancien code les sous-estimait)', () => {
        const users = [mkUser('A', 6000, 4200), mkUser('B', 6000, 4200)];
        const r = calculateFutureProjection(paramsForUsers(users, false));
        const base = (r.allResults as ProjectionResult[]).find((x) => x.stratType === 'BASE')!;
        const vals = (base.chartData as ProjectionChartPoint[]).map((d) => d.CELIAPPMax ?? 0);
        expect(vals.length).toBeGreaterThan(24);

        // Effet SYMÉTRIQUE du même bug : janvier posait bien 32 000 $ (report légitime), puis
        // décembre RETOMBAIT à 16 000 $ en écrasant — la « dent de scie » du ticket. Le MAX était
        // donc identique des deux côtés : c'est la CHUTE qu'il faut viser, pas le sommet.
        // ⚠️ Mon premier essai assertait sur `Math.max` et ne discriminait pas. Mesuré : une chute
        // 32 000 → 16 000 chaque mois de décembre avant, aucune après.
        const chutes = vals.slice(1).filter((v, i) => vals[i] > 0 && v < vals[i] * 0.75);
        expect(vals.some((v) => v > ANNUEL_COUPLE)).toBe(true);   // non-vacuité : le report existe
        expect(chutes).toHaveLength(0);
    });
});

// ─── RAMQ ─────────────────────────────────────────────────────────────────────

const decHelpers = { calculateFiscalReport, getMarginalRate, calculateDividendTax };

const decCtx = (over: Partial<DecemberContext> = {}): DecemberContext => ({
    m: 11, loopYear: 2026, isRetired: false, activeUsersCount: 1,
    inflationFactor: 1, enableMonteCarlo: false, optimizeSourceDeductions: false,
    simSalaryGrowth: 0, yearsElapsed: 0,
    grossMarcBaseAnnual: 20000, grossAnnaBaseAnnual: 0,
    incomeRetirementMonthly: 0, incomeRetirementGisMonthly: 0,
    nonReg: 0, baseNonRegRate: 0,
    accRrspYear: 0, accFhsaYear: 0, smithInterestDeductibleYear: 0,
    accRentesYear: 0, accRetraitsReerYear: 0, accCapitalGainsYear: 0,
    ...over,
} as DecemberContext);

const zeroBucket = () => ({ revenu: 0, gains: 0, divers: 0, reer: 0, donCredit: 0 });
/** `.divers` porte la prime RAMQ (et le FSS des retraités). */
const primeRamq = (ctx: DecemberContext): number =>
    processDecemberTaxFiling(11, ctx, decHelpers, zeroBucket()).newTaxCurrentYear.divers;

describe('[RAMQ-ACTIF-HORS-RETRAITS] un retrait REER entre dans l’assiette de la prime, en actif aussi', () => {
    it('un salarié modeste qui retire de son REER voit sa prime AUGMENTER', () => {
        const sans = primeRamq(decCtx({ accRetraitsReerYear: 0 }));
        const avec = primeRamq(decCtx({ accRetraitsReerYear: 40000 }));

        // Discriminant : AVANT, l'assiette active valait « salaire brut − déductions » et ignorait
        // les retraits REER — alors que la branche RETRAITÉE, 20 lignes plus haut, les incluait.
        // Les deux valeurs étaient donc identiques.
        expect(avec).toBeGreaterThan(sans);
        // Non-vacuité : le cas de base ne doit pas déjà être au plafond, sinon l'écart serait
        // impossible à observer et le test ne prouverait rien.
        expect(sans).toBeLessThan(RAMQ_MAX_PREMIUM_2026);
    });

    it('les gains en capital réalisés y entrent aussi (symétrie avec la branche retraitée)', () => {
        const sans = primeRamq(decCtx({ accCapitalGainsYear: 0 }));
        const avec = primeRamq(decCtx({ accCapitalGainsYear: 60000 }));
        expect(avec).toBeGreaterThan(sans);
    });

    it('la prime reste bornée par son plafond légal', () => {
        const enorme = primeRamq(decCtx({ accRetraitsReerYear: 500000 }));
        // `.divers` ne contient que la RAMQ ici (le FSS est réservé aux retraités, et il n'y a ni
        // dividende ni autre poste dans ce contexte).
        expect(enorme).toBeLessThanOrEqual(RAMQ_MAX_PREMIUM_2026 * 1.001);
    });

    it('sans retrait ni gain, la prime est INCHANGÉE (rétrocompat du salarié pur)', () => {
        // ⚠️ NON DISCRIMINANT par construction — un test de rétrocompat doit passer des deux côtés.
        const salaireSeul = primeRamq(decCtx({ grossMarcBaseAnnual: 90000 }));
        expect(salaireSeul).toBeGreaterThan(0);
        expect(salaireSeul).toBeLessThanOrEqual(RAMQ_MAX_PREMIUM_2026 * 1.001);
    });

    it('le FSS reste réservé aux retraités — ne PAS le corriger par symétrie', () => {
        // Garde d'intention : le FSS ne s'applique pas aux salariés par CHOIX documenté (couverture
        // par la cotisation de l'employeur), pas par oubli. Un futur agent qui « harmoniserait » les
        // deux branches par symétrie casserait ce choix — ce test le lui dira.
        const actifAvecGrosRetrait = primeRamq(decCtx({ accRetraitsReerYear: 300000 }));
        expect(actifAvecGrosRetrait).toBeLessThanOrEqual(RAMQ_MAX_PREMIUM_2026 * 1.001);
    });
});
