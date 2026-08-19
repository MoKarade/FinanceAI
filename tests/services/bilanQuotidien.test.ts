import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import { buildDailyLedger, NET_WORTH_DAILY_ASSETS, FIELD_KIND } from '../../services/projection/dailyLedger';
import type { ProjectionResult, ProjectionChartPoint } from '../../services/projection/types';
import type { BudgetConfig, User } from '../../types';

/**
 * [JOUR-BILAN-ROMPU-SOUS-HYPOTHEQUE] — audit de santé 2026-08-19, vague 1d.
 *
 * Au JOUR, `NetWorth` était interpolé POUR LUI-MÊME : il recevait ses propres deltas datés et
 * étalait son résidu uniformément, tandis que `DettesNonImmo` étalait le sien en cadence
 * hebdomadaire et que `Liquidites` encaissait en plus les remboursements de dette. Trois formes
 * d'étalement pour des grandeurs liées par une identité comptable → l'identité se rompait en
 * intra-mois et ne se refermait qu'au dernier jour.
 *
 * MESURÉ, pire écart `NetWorth − (Σ actifs − DettesNonImmo)` sur 1 461 jours :
 *   socle salarié            89,01 $  → **0,00 $**
 *   hypothèque + prêt auto  −76,62 $  → **0,00 $**
 * (l'audit initial mesurait jusqu'à −1 408,37 $, soit 0,28 % du patrimoine, sur un profil plus gros)
 *
 * ⚠️ ARBITRAGE au DERNIER jour du mois : la valeur du MOTEUR prime et n'est pas dérivée. Le moteur
 * arrondit chaque composant à 2 décimales, donc la somme des arrondis diffère de l'arrondi de la
 * somme — mesuré 0,01 $. Le test de raccord (`dailyLedger.test.ts`) exige une égalité stricte avec
 * le point mensuel, et il a raison : `cur.NetWorth` EST la source de vérité. Un cent le dernier
 * jour contre une dérive structurelle les 30 autres.
 */

const mkUser = (name: string, grossMonthly: number, netMonthly: number): User => ({
    name, grossSalary: grossMonthly, netSalary: netMonthly, color: '#10b981',
    age: 40, birthYear: 1986, canadaArrivalYear: 1986, hasOwnedPropertyLast4Years: true,
} as unknown as User);

const params = (over: Partial<SimulationParams> = {}): SimulationParams => ({
    projection: {
        years: 4, returnRate: 6, inflationRate: 2, savingsMode: 'manual',
        manualContribution: 0, usePortfolioRate: false,
        returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 3,
    },
    calculatedStartingCash: 60000,
    liveCSVBalances: { CELI: 30000, CELIAPP: 0, REER: 60000, NON_ENREG: 25000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 4000, governmentPension: 1500 } as unknown as SimulationParams['retirementGoal'],
    config: { users: [mkUser('A', 8000, 5700)] as unknown as BudgetConfig['users'], splitMode: '50/50' },
    baseGrossAnnual: 96000, baseNetAnnual: 68400,
    currentRentExpense: 1500, baseMonthlyExpenses: 3200,
    startYear: 2026, startMonth: 0,
    ...over,
} as SimulationParams);

/** Le scénario qui CASSAIT : hypothèque (étalement hebdo) + prêt auto (deltas datés). */
const AVEC_DETTES: Partial<SimulationParams> = {
    realEstateGoals: [{
        id: 'p1', name: 'Maison', isActive: true, purchaseDate: '2026-03-01',
        price: 480000, downPayment: 96000, mortgageRate: 5, amortization: 25,
        totalClosingCosts: 0, monthlyPayment: 0, unrecoverableMonthly: 0, isPrimaryResidence: true,
    }] as unknown as SimulationParams['realEstateGoals'],
    debts: [{ id: 'd1', name: 'Auto', balance: 22000, rate: 7, monthlyPayment: 450, isActive: true }] as unknown as SimulationParams['debts'],
};

type Jour = Record<string, number>;

/** ⚠️ `dated` est OBLIGATOIRE : sans lui, `buildDailyLedger` jette sur `payDayOfWeek`. */
const jours = (over: Partial<SimulationParams> = {}): Jour[] => {
    const r = calculateFutureProjection(params(over));
    const base = (r.allResults as ProjectionResult[]).find((x) => x.stratType === 'BASE')!;
    const months = base.chartData as readonly ProjectionChartPoint[];
    return buildDailyLedger({
        months, startYear: 2026, startMonth: 0,
        dated: { recurring: [], monthlyNetSalary: 5700, monthlyDebtPayment: 450 },
    }) as unknown as Jour[];
};

const bilanDuJour = (d: Jour): number =>
    NET_WORTH_DAILY_ASSETS.reduce((s, k) => s + (Number(d[k]) || 0), 0) - (Number(d.DettesNonImmo) || 0);

describe('[JOUR-BILAN-ROMPU-SOUS-HYPOTHEQUE] le patrimoine au jour EST son bilan', () => {
    it('sous hypothèque + prêt auto : identité exacte tous les jours sauf le dernier du mois', () => {
        const days = jours(AVEC_DETTES);

        // Non-vacuité en trois temps : la série existe, elle porte de vraies valeurs, et le
        // scénario active BIEN les deux formes d'étalement qui divergeaient (dette + immobilier).
        expect(days.length).toBeGreaterThan(1000);
        expect(days.some((d) => (Number(d.DettesNonImmo) || 0) > 0)).toBe(true);
        expect(days.some((d) => (Number(d.Immobilier) || 0) > 0)).toBe(true);

        // Discriminant MESURÉ : pire écart −76,62 $ avant, 0,00 $ après (et jusqu'à −1 408 $ sur un
        // profil plus gros). On tolère le cent d'arrondi du dernier jour du mois — et UNIQUEMENT lui.
        let pireHorsFinMois = 0;
        let pireFinMois = 0;
        for (let i = 0; i < days.length; i++) {
            const d = days[i];
            const ecart = (Number(d.NetWorth) || 0) - bilanDuJour(d);
            const finDeMois = i + 1 >= days.length || days[i + 1].dayOfMonth === 1;
            if (finDeMois) pireFinMois = Math.max(pireFinMois, Math.abs(ecart));
            else pireHorsFinMois = Math.max(pireHorsFinMois, Math.abs(ecart));
        }
        expect(pireHorsFinMois).toBeLessThanOrEqual(0.005);
        // L'arbitrage est BORNÉ, et le test le prouve : si l'écart de fin de mois dépassait le
        // cent, ce ne serait plus de l'arrondi mais un vrai défaut.
        expect(pireFinMois).toBeLessThanOrEqual(0.02);
    });

    it('socle salarié : identité exacte aussi (le défaut n’était pas réservé aux endettés)', () => {
        const days = jours();
        expect(days.length).toBeGreaterThan(1000);
        const pire = Math.max(...days.slice(0, -1).map((d, i) =>
            days[i + 1]?.dayOfMonth === 1 ? 0 : Math.abs((Number(d.NetWorth) || 0) - bilanDuJour(d)),
        ));
        // Mesuré : 89,01 $ avant, 0,00 $ après.
        expect(pire).toBeLessThanOrEqual(0.005);
    });

    it('la liste des composants COUVRE ce que le moteur additionne', () => {
        // Garde anti-dérive : si un actif était ajouté au moteur sans être ajouté à
        // `NET_WORTH_DAILY_ASSETS`, le patrimoine au jour l'oublierait EN SILENCE — et le premier
        // test ci-dessus se mettrait à échouer sans dire pourquoi. Celui-ci nomme la cause.
        for (const k of NET_WORTH_DAILY_ASSETS) {
            expect(FIELD_KIND[k], `${k} doit être un stock connu du grand livre`).toBe('stock');
        }
        // Et l'inverse : `DettesNonImmo` (jamais `DetteTotale`, qui double-compterait l'hypothèque
        // puisque `Immobilier` porte déjà l'ÉQUITÉ nette).
        expect(NET_WORTH_DAILY_ASSETS).not.toContain('DetteTotale');
        expect(NET_WORTH_DAILY_ASSETS).not.toContain('DettesNonImmo');
        expect(NET_WORTH_DAILY_ASSETS).toContain('Immobilier');
    });

    // ── [CURVE-FIELDS-DETTE-MANQUANTE] Ce que les trois cas ci-dessus NE prouvaient PAS. ──
    //
    // Ils appellent `buildDailyLedger` SANS `fields` : la ventilation est alors COMPLÈTE, tous les
    // termes du bilan sont présents et la recomposition s'exécute. La vraie courbe, elle, passe
    // `fields: CURVE_FIELDS` — une ventilation ALLÉGÉE (~100 ms au lieu de ~500 ms sur 30 ans).
    // `DettesNonImmo` n'y figurait pas, parce qu'aucune AIRE ne la trace. Or la recomposition
    // s'abstient dès qu'un terme manque (choix délibéré : une somme partielle serait un patrimoine
    // faux et crédible). Résultat : le correctif était **vert en test et INERTE en production**.
    //
    // Trouvé par une revue automatique sur la PR #657, APRÈS merge. Ma garde visait le CONTRAT de
    // `buildDailyLedger`, pas la configuration de son APPELANT — `TEST-AU-CONTRAT-NE-VOIT-PAS-
    // L-APPELANT`, sur mon propre correctif. Ce cas-ci rejoue la ventilation avec le set EXACT lu
    // dans le source du composant : il échoue si quelqu'un retire `DettesNonImmo` de `CURVE_FIELDS`.
    const curveFieldsDuComposant = (): Set<string> => {
        const src = readFileSync(join(__dirname, '../../components/FutureProjection.tsx'), 'utf-8');
        const bloc = src.match(/const CURVE_FIELDS[^=]*= new Set\(\[([\s\S]*?)\]\)/);
        if (!bloc) throw new Error('CURVE_FIELDS introuvable dans FutureProjection.tsx');
        return new Set([...bloc[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
    };

    it('[CURVE-FIELDS-DETTE-MANQUANTE] la recomposition s’exécute avec le set de champs de la VRAIE courbe', () => {
        const fields = curveFieldsDuComposant();

        // Anti-vacuité du scan : si la regex ne matchait plus (renommage, reformatage), le set
        // serait vide et tout ce qui suit deviendrait trivialement satisfait.
        expect(fields.size).toBeGreaterThan(10);
        expect(fields.has('NetWorth')).toBe(true);

        // La condition NÉCESSAIRE, nommée : chaque terme du bilan doit être ventilé.
        for (const k of NET_WORTH_DAILY_ASSETS) {
            expect(fields.has(k), `${k} absent de CURVE_FIELDS : la recomposition s'abstiendra`).toBe(true);
        }
        expect(fields.has('DettesNonImmo'),
            'DettesNonImmo absent de CURVE_FIELDS : la recomposition ne s\'exécutera JAMAIS en prod').toBe(true);

        // Et la preuve par l'EFFET, pas seulement par la liste : on rejoue la ventilation avec ce
        // set exact et on vérifie que l'identité tient vraiment.
        const r = calculateFutureProjection(params(AVEC_DETTES));
        const base = (r.allResults as ProjectionResult[]).find((x) => x.stratType === 'BASE')!;
        const months = base.chartData as readonly ProjectionChartPoint[];
        const days = buildDailyLedger({
            months, startYear: 2026, startMonth: 0, fields,
            dated: { recurring: [], monthlyNetSalary: 5700, monthlyDebtPayment: 450 },
        }) as unknown as Jour[];

        expect(days.length).toBeGreaterThan(1000);
        expect(days.some((d) => (Number(d.DettesNonImmo) || 0) > 0)).toBe(true);
        let pire = 0;
        for (let i = 0; i < days.length; i++) {
            if (i + 1 < days.length && days[i + 1].dayOfMonth !== 1) {
                pire = Math.max(pire, Math.abs((Number(days[i].NetWorth) || 0) - bilanDuJour(days[i])));
            }
        }
        expect(pire, 'la courbe RÉELLE dérive encore : la recomposition ne s\'applique pas').toBeLessThanOrEqual(0.005);
    });

    it('le raccord au point mensuel reste EXACT (la garde existante n’est pas affaiblie)', () => {
        // Le correctif aurait pu être « écrit » en relâchant la tolérance du test de raccord.
        // Ce cas-ci verrouille l'inverse : le dernier jour vaut TOUJOURS la valeur du moteur.
        const r = calculateFutureProjection(params(AVEC_DETTES));
        const base = (r.allResults as ProjectionResult[]).find((x) => x.stratType === 'BASE')!;
        const months = base.chartData as readonly ProjectionChartPoint[];
        const days = jours(AVEC_DETTES);

        let verifies = 0;
        for (let i = 0; i < days.length; i++) {
            const finDeMois = i + 1 >= days.length || days[i + 1].dayOfMonth === 1;
            if (!finDeMois) continue;
            const mois = months.find((m) => Number(m.monthIndex) === Number(days[i].monthIndex));
            if (!mois) continue;
            expect(Number(days[i].NetWorth)).toBeCloseTo(Number(mois.NetWorth), 6);
            verifies++;
        }
        expect(verifies).toBeGreaterThan(40);   // non-vacuité : on a bien comparé des fins de mois
    });
});
