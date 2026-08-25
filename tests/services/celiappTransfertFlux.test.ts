// tests/services/celiappTransfertFlux.test.ts
//
// [ENG-CELIAPP-TRANSFERT-FLUX-MUET] À la fermeture du CELIAPP (fin des 15 ans, ou 71 ans atteint),
// le solde est TRANSFÉRÉ au REER. Le moteur faisait `reer += X; celiapp = 0;` sans publier le
// moindre flux : la forme-flux (« solde(m) − solde(m−1) == MarketGrowth + NetTransfer ») était
// violée des DEUX côtés, du MÊME montant — signature d'un transfert muet.
//
// MESURÉ sur la fixture ci-dessous : résiduel **10 470,25 $ au mois 168**, identique sur `REER` et
// sur `CELIAPP`. Après : 0,01 $ (arrondi au cent des champs du point).
//
// ⚠️ Trouvé en BALAYANT l'horizon pour un autre ticket (`[ENG-DIVORCE-FLUX-MUET]`), pas en le
// cherchant. Un invariant qu'on étend révèle des offenders sans rapport avec l'étiquette du ticket
// qui l'a motivé.
//
// ── CE QUI A ÉTÉ VÉRIFIÉ AVANT DE PUBLIER `contribREER` ────────────────────────────────────────
// `contribREER` n'est pas qu'un registre d'affichage : il est passé à `stepReerByUser` (registre
// REER par conjoint). Le risque était donc de DÉPLACER de l'argent, ou l'attribution entre conjoints.
// Mesuré, il n'en déplace aucun :
//   • patrimoine final **4 121 381,96 $** et REER final **1 998 348,85 $** — identiques au centième
//     avec et sans le correctif ;
//   • `reerByUserFinal` identique à ~3 × 10⁻¹⁰ $ près (bruit d'ordre des opérations en virgule
//     flottante), y compris sur un couple **très** asymétrique (20 000 $ contre 2 000 $ de salaire
//     mensuel, soit des parts 10:1) — cas choisi exprès parce qu'un couple équilibré ne pourrait
//     PAS distinguer une répartition d'une autre.
//   • ⚠️ Et `contribREER` n'alimente PAS l'exclusion de croissance de mi-mois : `growthApplication`
//     l'applique à `contribNonReg` et `contribREEE`, mais le REER passe par `prevREER`. Vérifié dans
//     la source, parce que c'est exactement ce piège qui avait rendu
//     `[ENG-APRIL-REFUND-NONREG-UNPUBLISHED]` non neutre en argent.
//
// ⚠️ DÉCOUVERTE en mesurant, routée (`[ENG-REERBYUSER-FLUX-DECORATIF]`) : forcer
// `stepReerByUser(..., { contribution: 0 })` ne fait rougir **aucun** des 29 tests per-conjoint ET
// laisse `reerByUserFinal` bit-identique. Dans ce scénario, `reconcileToPool` détermine seul la
// répartition à partir de `shares` — l'arithmétique de flux du registre y est décorative. C'est
// pourquoi la garde ci-dessous vise la forme-flux PUBLIÉE, jamais le registre per-conjoint.

import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const users = (age: number): User[] => ([
    { name: 'Marc', grossSalary: 8_200, netSalary: 5_620, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 7_100, netSalary: 4_995, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const params = (): SimulationParams => ({
    projection: {
        // 30 ans : la fermeture des 15 ans du CELIAPP tombe au mois 168. Une fixture plus courte ne
        // l'atteindrait jamais — l'invariant ne dit rien des mois qu'il ne parcourt pas.
        years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 1_500,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
    } as ProjectionConfig,
    calculatedStartingCash: 40_000,
    // CELIAPP SEMÉ non nul : c'est lui qu'on ferme. À zéro, la branche de transfert n'est jamais
    // prise (`ctx.celiapp > 0`) et toute la garde serait vacueuse.
    liveCSVBalances: { CELI: 90_000, CELIAPP: 12_000, REER: 150_000, NON_ENREG: 60_000, CRYPTO: 25_000, REEE: 18_000 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 1_500, lifeExpectancy: 92, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: { users: users(45), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 1_800,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

const run = () => __runScenarioForTests(
    params(), 'AUTO_MARGINAL' as AllocationStrategy, true, false, 0, 'BASE', {},
    { verboseMonthlyPoints: true },
) as unknown as { chartData: Array<Record<string, number>> };

const n = (o: Record<string, number> | undefined, k: string): number => Number(o?.[k] ?? NaN);
const residuel = (cd: Array<Record<string, number>>, k: string, m: number): number => {
    const delta = n(cd[m], k) - n(cd[m - 1], k);
    return Math.abs(delta - (n(cd[m], `MarketGrowth${k}`) + n(cd[m], `NetTransfer${k}`)));
};

/** Le mois où le CELIAPP se vide — trouvé, pas supposé : un littéral se périmerait au moindre réglage. */
const moisDeFermeture = (cd: Array<Record<string, number>>): number => {
    for (let m = 1; m < cd.length; m++) {
        if (n(cd[m - 1], 'CELIAPP') > 1 && n(cd[m], 'CELIAPP') <= 0.01) return m;
    }
    return -1;
};

const TOLERANCE_ARRONDI = 1;

describe('[ENG-CELIAPP-TRANSFERT-FLUX-MUET] la fermeture du CELIAPP publie ses deux flux', () => {
    it('la fixture MESURE bien quelque chose : le CELIAPP existe puis se ferme, sur un vrai montant', () => {
        const cd = run().chartData;
        const m = moisDeFermeture(cd);
        expect(m, 'aucune fermeture de CELIAPP sur l\'horizon : la garde ne mesure rien').toBeGreaterThan(0);
        expect(n(cd[m - 1], 'CELIAPP'), 'le solde transféré est trop petit pour discriminer quoi que ce soit')
            .toBeGreaterThan(1_000);
        expect(n(cd[m], 'CELIAPP'), 'le CELIAPP n\'a pas été vidé').toBeLessThanOrEqual(0.01);
    });

    // ── LE test discriminant : il ÉCHOUE sur le code d'avant, des DEUX côtés du transfert. ──
    it('au mois de la fermeture, ni le CELIAPP ni le REER ne bougent sans flux publié', () => {
        const cd = run().chartData;
        const m = moisDeFermeture(cd);
        const fautifs = (['CELIAPP', 'REER'] as const)
            .map((k) => ({ k, res: residuel(cd, k, m) }))
            .filter((x) => x.res > TOLERANCE_ARRONDI);
        // Mesuré sans le correctif : 10 470,25 $ des DEUX côtés, au même mois.
        expect(fautifs.map((x) => `${x.k}=${x.res.toFixed(2)} $`), 'transfert muet au mois de fermeture')
            .toEqual([]);
    });

    /**
     * Les deux flux doivent être ÉGAUX et de signes opposés : un transfert ne crée ni ne détruit
     * d'argent. Sans cette assertion, publier un seul des deux côtés (ou deux montants différents)
     * passerait le test ci-dessus dès que l'autre côté est masqué par un flux du même mois.
     */
    it('le montant sorti du CELIAPP est exactement celui entré au REER', () => {
        const cd = run().chartData;
        const m = moisDeFermeture(cd);
        const transfere = n(cd[m - 1], 'CELIAPP');
        // Le CELIAPP n'a pas d'autre flux ce mois-là : son NetTransfer EST le transfert.
        expect(-n(cd[m], 'NetTransferCELIAPP'), 'le flux sortant ne correspond pas au solde transféré')
            .toBeCloseTo(transfere, 0);
        // Le REER, lui, reçoit AUSSI ses cotisations du mois : on vérifie qu'il a au moins reçu le
        // transfert, sans exiger l'égalité stricte (ce serait faux et fragile).
        expect(n(cd[m], 'NetTransferREER'), 'le REER n\'a pas reçu le transfert')
            .toBeGreaterThanOrEqual(transfere - TOLERANCE_ARRONDI);
    });

    it('le correctif ne déplace pas le problème ailleurs : horizon complet propre', () => {
        const cd = run().chartData;
        let pire = 0, ou = '(aucun)';
        for (let m = 1; m < cd.length; m++) {
            for (const k of ['CELI', 'REER', 'Crypto', 'CELIAPP', 'REEE'] as const) {
                const res = residuel(cd, k, m);
                if (res > pire) { pire = res; ou = `${k} au mois ${m}`; }
            }
        }
        expect(cd.length, 'horizon trop court pour un balayage utile').toBeGreaterThan(300);
        expect(pire, `mouvement non expliqué — ${ou}`).toBeLessThan(TOLERANCE_ARRONDI);
    });
});
