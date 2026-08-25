// tests/services/divorceFluxPublie.test.ts
//
// [ENG-DIVORCE-FLUX-MUET] Le partage de divorce multipliait `liquid`/`celi`/`celiapp`/`reer`/
// `nonReg`/`crypto`/`reee` par `keep` **sans publier le moindre flux**. La forme-flux —
// « solde(m) − solde(m−1) == MarketGrowth<compte>(m) + NetTransfer<compte>(m) » — était donc violée
// sur tous les comptes à la fois, au mois du divorce.
//
// ⚠️ POURQUOI LA GARDE EXISTANTE NE LE VOYAIT PAS. `projection.fluxForm.test.ts` pose le BON
// invariant, mais en mode DÉTERMINISTE — et `tryDivorce` exige `enableMonteCarlo`. Invariant juste,
// aveugle à une branche entière. Même famille que
// `UN-INVARIANT-JUSTE-PEUT-ETRE-AVEUGLE-A-UNE-STRATEGIE-ENTIERE`, sur l'axe Monte-Carlo cette fois.
// D'où `__runScenarioForTests` (UN scénario, déterministe) + `verboseMonthlyPoints`.
//
// ── CE QUI A ÉTÉ MESURÉ (fixture ci-dessous, partage 50 %, divorce certain au mois 12) ─────────
// Résiduel inexpliqué AU MOIS DU DIVORCE, avant correctif :
//     CELI 119 007,53 $ · REER 91 679,66 $ · Crypto 15 599,16 $ · Liquidités 12 492,83 $ ·
//     REEE 9 088,89 $ · CELIAPP (voir ci-dessous)
// Après : 0,01 $ partout (arrondi au cent des champs du point).
//
// ⚠️ Le ticket nommait QUATRE comptes (`celi`/`reer`/`crypto`/`nonReg`). Mesuré, le divorce en
// touche SIX — et `nonReg` n'en fait PAS partie ici (voir l'exclusion déclarée plus bas). Compter
// les comptes réellement mutés par le callback bat la liste écrite dans le ticket.
//
// ⚠️ LE CORRECTIF NE DÉPLACE AUCUN ARGENT, et c'est VÉRIFIÉ, pas supposé : patrimoine final, REER
// final et CELI final sont **bit-identiques** avec et sans lui (331 014,12 $ / 175 685,09 $ /
// 113 506,31 $). C'est attendu — les accumulateurs `withdrawal*` ne sont lus que par
// `buildMonthlyDataPoint`… à UNE exception près, traitée dans le code : `withdrawalREER` alimente
// AUSSI `stepReerByUser`. La part cédée en est exclue (`divorceReerWithdrawalMois`).
//
// ⚠️ Cette exclusion est aujourd'hui INERTE, et il faut le dire plutôt que prétendre la garder :
// après un divorce, le callback consolide `reerByUser = [reer, 0]` et `reconcileToPool` ramène de
// toute façon la somme à `poolEnd`. Mesuré : `reerByUserFinal` identique au centième avec et sans
// l'exclusion, et retirer l'exclusion ne fait rougir AUCUN des 29 tests per-conjoint existants.
// Elle reste écrite parce qu'elle devient nécessaire dès que `reerShares` cesse d'être `[1, 0]` —
// une ligne non testable s'ÉCRIT comme telle plutôt que d'être couverte par une fixture absurde.
//
// ── DEUX DÉFAUTS PRÉ-EXISTANTS DÉCOUVERTS EN MESURANT (hors périmètre, routés au BACKLOG) ───────
//   • `[ENG-CELIAPP-TRANSFERT-FLUX-MUET]` : au mois 168, **9 092,54 $** passent du CELIAPP au REER
//     sans qu'aucun des deux flux ne soit publié (le résiduel est le MÊME des deux côtés).
//   • `[ENG-LIQUID-FLUX-FORM]` : le compte Liquidités n'est PAS conforme à la forme-flux en régime
//     ordinaire — **7 638,44 $** au mois 324, et de petits résiduels ailleurs. C'est pour ça qu'il
//     n'entre pas dans le balayage « tout l'horizon » ci-dessous.
// Aucun des deux n'est ASSERTÉ ici : figer leur montant rendrait rouge le correctif qui les règle.

import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const users = (age: number): User[] => ([
    { name: 'Marc', grossSalary: 8_200, netSalary: 5_620, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 7_100, netSalary: 4_995, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const params = (proj: Partial<ProjectionConfig>): SimulationParams => ({
    projection: {
        years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 1_500,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3, ...proj,
    } as ProjectionConfig,
    calculatedStartingCash: 40_000,
    // CELIAPP et REEE sont SEMÉS à dessein : sans eux, deux des six comptes touchés par le partage
    // resteraient à zéro et la garde les couvrirait sans rien mesurer.
    liveCSVBalances: { CELI: 90_000, CELIAPP: 12_000, REER: 150_000, NON_ENREG: 60_000, CRYPTO: 25_000, REEE: 18_000 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 1_500, lifeExpectancy: 92, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: { users: users(45), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 1_800,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

const run = (proj: Partial<ProjectionConfig>) => __runScenarioForTests(
    params(proj), 'AUTO_MARGINAL' as AllocationStrategy, true, false, 0, 'BASE', {},
    { verboseMonthlyPoints: true },
) as unknown as { chartData: Array<Record<string, number>> };

const n = (o: Record<string, number> | undefined, k: string): number => Number(o?.[k] ?? NaN);

/** Nom du solde dans le point → suffixe de ses flux. Ils DIFFÈRENT pour les liquidités. */
const FLUX: Record<string, string> = {
    CELI: 'CELI', REER: 'REER', Crypto: 'Crypto', CELIAPP: 'CELIAPP', REEE: 'REEE', Liquidites: 'Liquid',
};
/**
 * Les comptes que le callback de partage multiplie, dont le point publie un flux, ET qui sont
 * conformes à la forme-flux AU MOIS DU DIVORCE.
 * ⚠️ `Liquidites` en est ABSENT alors que le partage le touche bel et bien (résiduel mesuré
 * 12 492,83 $ avant correctif, 1 182,45 $ après — le correctif fait donc son travail). Ce qui reste
 * est `[ENG-LIQUID-FLUX-FORM]`, PRÉ-EXISTANT : le compte n'est pas conforme non plus SANS divorce
 * (50,85 $ au même mois, mesuré). L'y inclure ferait rougir cette garde pour un défaut qu'elle ne
 * corrige pas — et le déclarer ici vaut mieux qu'un périmètre borné en silence.
 */
const COMPTES_PARTAGES = ['CELI', 'REER', 'Crypto', 'CELIAPP', 'REEE'] as const;
/**
 * Comptes conformes à la forme-flux sur TOUT l'horizon une fois le divorce publié — donc balayables
 * de bout en bout. `REER` et `CELIAPP` en sont absents à cause de `[ENG-CELIAPP-TRANSFERT-FLUX-MUET]`
 * (mois 168), `Liquidites` à cause de `[ENG-LIQUID-FLUX-FORM]` : deux défauts PRÉ-EXISTANTS, mesurés
 * et routés, pas introduits ici.
 */
const COMPTES_PROPRES = ['CELI', 'Crypto', 'REEE'] as const;

const M_DIVORCE = 12;
/** Les champs du point sont arrondis au cent (`toFixed(2)`) : deux arrondis par compte et par mois. */
const TOLERANCE_ARRONDI = 1;

const residuel = (cd: Array<Record<string, number>>, k: string, m: number): number => {
    const delta = n(cd[m], k) - n(cd[m - 1], k);
    const explique = n(cd[m], `MarketGrowth${FLUX[k]}`) + n(cd[m], `NetTransfer${FLUX[k]}`);
    return Math.abs(delta - explique);
};

describe('[ENG-DIVORCE-FLUX-MUET] la part cédée au divorce est publiée comme un flux', () => {
    it('la fixture MESURE bien quelque chose : les six comptes sont garnis et le divorce a eu lieu', () => {
        const r = run({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 });
        for (const k of COMPTES_PARTAGES) {
            expect(n(r.chartData[M_DIVORCE - 1], k), `${k} est VIDE avant le divorce : la garde ne mesure rien sur ce compte`)
                .toBeGreaterThan(1_000);
        }
        // ⚠️ `nonReg` est EXCLU, et c'est déclaré : mesuré 0 sur les 360 mois de cette fixture (le
        // moteur le vide vers les comptes enregistrés dès le mois 0, sur les quatre stratégies
        // essayées). Un flux de 0 $ ne prouverait rien — mieux vaut l'écrire que le laisser croire.
        expect(n(r.chartData[M_DIVORCE - 1], 'NonReg'), 'NonReg est devenu non nul : le retirer des exclusions')
            .toBe(0);
        const avant = n(r.chartData[M_DIVORCE - 1], 'NetWorth');
        const apres = n(r.chartData[M_DIVORCE], 'NetWorth');
        expect(apres, 'le patrimoine n\'a pas chuté : le divorce ne s\'est pas déclenché').toBeLessThan(avant * 0.75);
    });

    // ── LE test discriminant : il ÉCHOUE sur le code d'avant, sur les SIX comptes. ──
    it('au mois du divorce, aucun compte ne bouge sans flux publié', () => {
        const r = run({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 });
        const fautifs = COMPTES_PARTAGES
            .map((k) => ({ k, res: residuel(r.chartData, k, M_DIVORCE) }))
            .filter((x) => x.res > TOLERANCE_ARRONDI);
        expect(fautifs.map((x) => `${x.k}=${x.res.toFixed(2)} $`), 'mouvement non expliqué au mois du divorce')
            .toEqual([]);
    });

    it('le correctif ne déplace pas le problème ailleurs : horizon complet propre sur les comptes conformes', () => {
        const r = run({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 });
        let pire = 0, ou = '(aucun)';
        for (let m = 1; m < r.chartData.length; m++) {
            for (const k of COMPTES_PROPRES) {
                const res = residuel(r.chartData, k, m);
                if (res > pire) { pire = res; ou = `${k} au mois ${m}`; }
            }
        }
        expect(r.chartData.length, 'horizon trop court pour un balayage utile').toBeGreaterThan(300);
        expect(pire, `mouvement non expliqué — ${ou}`).toBeLessThan(TOLERANCE_ARRONDI);
    });

    /**
     * ⚠️ **Un partage à 50 % ne peut PAS distinguer `keep` de `1 − keep`** : les deux valent 0,5, et
     * un correctif qui publierait la part CONSERVÉE au lieu de la part CÉDÉE passerait le test
     * discriminant ci-dessus sans broncher. Il faut un partage ASYMÉTRIQUE pour que la garde ait un
     * sens — 75 % ici, où les deux lectures diffèrent d'un facteur 3.
     */
    it('un partage ASYMÉTRIQUE (75 %) reste expliqué — `keep` et `1 − keep` ne sont plus confondus', () => {
        const r = run({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 75 });
        const avant = n(r.chartData[M_DIVORCE - 1], 'CELI');
        expect(avant, 'CELI vide avant le divorce').toBeGreaterThan(1_000);
        const fautifs = COMPTES_PARTAGES
            .map((k) => ({ k, res: residuel(r.chartData, k, M_DIVORCE) }))
            .filter((x) => x.res > TOLERANCE_ARRONDI);
        expect(fautifs.map((x) => `${x.k}=${x.res.toFixed(2)} $`), 'mouvement non expliqué à 75 %')
            .toEqual([]);
    });

    it('sans divorce, la forme-flux est déjà propre aux mêmes mois (le test ne mesure pas autre chose)', () => {
        const r = run({ divorceEnabled: false });
        for (const k of COMPTES_PARTAGES) {
            expect(residuel(r.chartData, k, M_DIVORCE), `${k} bouge sans flux SANS divorce : le discriminant vise le mauvais mécanisme`)
                .toBeLessThan(TOLERANCE_ARRONDI);
        }
    });
});
