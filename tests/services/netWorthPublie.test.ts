// tests/services/netWorthPublie.test.ts
//
// [ENG-W5-BUSINESS-NON-PUBLIE] (audit 2026-09-07, lot 214) — la garde STRUCTURELLE qui manquait.
//
// La valeur d'une entreprise privée est entrée dans `NetWorthParts` le 2026-08-19 (signe +1, formule
// littérale, test croisé « littéral == Σ signe × valeur ») — et n'a été PUBLIÉE nulle part : aucun champ
// de `chartData`, absente de `NET_WORTH_DAILY_ASSETS` et des `ASSET_KEYS` des harnais. Mesuré le
// 2026-09-07 : `NetWorth − Σ 8 actifs publiés + DettesNonImmo` = 900 000 $ EXACTEMENT sur 100 % des
// mois de la fixture, 5 747 tests verts. Un invariant de cohérence ne voit pas ce qui est ABSENT ; la
// seule fixture W5 du harnais posait `estimatedValue: 0`.
//
// Ce fichier ancre le FAIT à sa source : CHAQUE terme du sign-map a un champ publié, et la liste des
// actifs quotidiens se DÉRIVE du sign-map — un dixième terme ajouté à `NetWorthParts` sans champ publié
// rougit ici (le `Record<keyof NetWorthParts, …>` le refuse même au typecheck).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import { NET_WORTH_SIGN, type NetWorthParts } from '../../services/projection/netWorth';
import { NET_WORTH_DAILY_ASSETS, FIELD_KIND } from '../../services/projection/dailyLedger';
import type { ProjectionResult, ProjectionChartPoint } from '../../services/projection/types';
import type { BudgetConfig, User } from '../../types';

/** Terme du patrimoine → champ PUBLIÉ dans `chartData`. Les trois dettes sont sommées dans `DettesNonImmo`. */
const PUBLIE_PAR_TERME: Record<keyof NetWorthParts, string> = {
    liquid: 'Liquidites', celi: 'CELI', celiapp: 'CELIAPP', reer: 'REER', nonReg: 'NonReg', crypto: 'Crypto',
    reee: 'REEE', realEstateEquity: 'Immobilier', privateBusinessValue: 'Entreprise',
    liquidDebt: 'DettesNonImmo', smithManoeuvreDebt: 'DettesNonImmo', activeDebtsTotal: 'DettesNonImmo',
};
const ACTIFS_PUBLIES = [...new Set(
    (Object.keys(NET_WORTH_SIGN) as (keyof NetWorthParts)[]).filter(k => NET_WORTH_SIGN[k] === 1).map(k => PUBLIE_PAR_TERME[k]),
)].sort();

const mkUser = (): User => ({
    name: 'Marc', grossSalary: 8200, netSalary: 5620, color: '#10b981',
    age: 45, birthYear: 1981, canadaArrivalYear: 1981, hasOwnedPropertyLast4Years: false,
} as unknown as User);

const ENTREPRISE = { id: 'b1', name: 'Ma CCPC', ownershipPct: 100, estimatedValue: 900_000, retainedEarnings: 0 };

const params = (over: Record<string, unknown> = {}): SimulationParams => ({
    projection: {
        years: 25, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
    },
    calculatedStartingCash: 100_000,
    liveCSVBalances: { CELI: 50_000, CELIAPP: 0, REER: 80_000, NON_ENREG: 30_000, CRYPTO: 5_000, REEE: 0 },
    realEstateGoals: [], childGoals: [], travelGoals: [], lifeEvents: [],
    // Une dette et une entreprise : tous les termes du sign-map sont non nuls sauf Smith/découvert.
    debts: [{ id: 'd1', name: 'Auto', balance: 22_000, rate: 7, monthlyPayment: 450, isActive: true }] as unknown as SimulationParams['debts'],
    rentalProperties: [], privateBusinesses: [ENTREPRISE],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 4_000, governmentPension: 1_500, lifeExpectancy: 92 } as unknown as SimulationParams['retirementGoal'],
    config: { users: [mkUser()] as unknown as BudgetConfig['users'], splitMode: '50/50' },
    baseGrossAnnual: 98_400, baseNetAnnual: 67_440, currentRentExpense: 1_500,
    baseMonthlyExpenses: 3_000, startYear: 2026, startMonth: 0,
    ...over,
} as SimulationParams);

const pts = (over: Record<string, unknown> = {}): Record<string, number>[] => {
    const r = calculateFutureProjection(params(over));
    const base = (r.allResults as ProjectionResult[]).find((x) => x.stratType === 'BASE')!;
    return (base.chartData as ProjectionChartPoint[]) as unknown as Record<string, number>[];
};
const ecart = (p: Record<string, number>) =>
    p.NetWorth - ACTIFS_PUBLIES.reduce((s, k) => s + (p[k] || 0), 0) + (p.DettesNonImmo || 0);

describe('[ENG-W5-BUSINESS-NON-PUBLIE] chaque terme du patrimoine a un champ PUBLIÉ', () => {
    it('tous les champs mappés existent sur un point RÉEL du moteur (aucun terme fantôme)', () => {
        const p0 = pts()[0];
        for (const k of new Set(Object.values(PUBLIE_PAR_TERME))) {
            expect(k in p0, `${k} doit être publié dans chartData`).toBe(true);
            expect(Number.isFinite(p0[k]), `${k} doit être un nombre`).toBe(true);
        }
        // Anti-vacuité : l'entreprise est bien là, à sa valeur, et la dette n'est pas nulle.
        expect(p0.Entreprise).toBe(900_000);
        expect(p0.DettesNonImmo).toBeGreaterThan(20_000);
    });

    it('identité PUBLIÉE : NetWorth == Σ actifs publiés − DettesNonImmo, à chaque mois (mesuré : 900 000 $ d’écart AVANT)', () => {
        const avec = pts();
        expect(avec.length).toBeGreaterThan(200);
        let pire = 0;
        for (const p of avec) pire = Math.max(pire, Math.abs(ecart(p)));
        // Arrondi par composant (2 décimales × 9 termes) : quelques cents, jamais un dollar.
        expect(pire).toBeLessThan(0.1);
    });

    it('contrôle — sans entreprise : `Entreprise` publié à 0 et identité intacte (rétrocompat bit-identique du NetWorth)', () => {
        const a = pts({ privateBusinesses: [] });
        const b = pts({ privateBusinesses: undefined });
        expect(a[0].Entreprise).toBe(0);
        for (let i = 0; i < a.length; i++) {
            expect(Math.abs(ecart(a[i]))).toBeLessThan(0.1);
            expect(b[i].NetWorth).toBe(a[i].NetWorth);
        }
    });

    it('la valeur reste CONSTANTE sur l’horizon (aucune croissance inventée) et suit le prorata', () => {
        const avec = pts();
        expect(new Set(avec.map(p => p.Entreprise))).toEqual(new Set([900_000]));
        expect(pts({ privateBusinesses: [{ ...ENTREPRISE, ownershipPct: 40 }] })[0].Entreprise).toBe(360_000);
    });
});

describe('[ENG-W5-BUSINESS-NON-PUBLIE] les listes DÉRIVENT du sign-map, elles ne le recopient pas', () => {
    it('NET_WORTH_DAILY_ASSETS == les champs publiés des termes +1 (le grand livre quotidien ne peut pas en oublier un)', () => {
        expect([...NET_WORTH_DAILY_ASSETS].sort()).toEqual(ACTIFS_PUBLIES);
    });

    it('chaque actif publié est un STOCK du grand livre (sinon il disparaît de la vue au jour, sans message)', () => {
        for (const k of ACTIFS_PUBLIES) expect(FIELD_KIND[k], k).toBe('stock');
    });

    it('CURVE_FIELDS (la vraie courbe, ventilation allégée) contient CHAQUE actif publié — sinon la recomposition au jour s’ABSTIENT en prod', () => {
        // `[CORRECTIF-VERT-EN-TEST-INERTE-EN-PROD]` : le test ventile tout, la courbe passe `fields`.
        const src = readFileSync(join(__dirname, '../../components/FutureProjection.tsx'), 'utf-8');
        const bloc = src.match(/const CURVE_FIELDS[^=]*= new Set\(\[([\s\S]*?)\]\)/);
        if (!bloc) throw new Error('CURVE_FIELDS introuvable dans FutureProjection.tsx');
        const champs = new Set([...bloc[1].matchAll(/'([A-Za-z0-9]+)'/g)].map(m => m[1]));
        for (const k of ACTIFS_PUBLIES) expect(champs.has(k), `${k} manque à CURVE_FIELDS`).toBe(true);
        expect(champs.has('DettesNonImmo')).toBe(true);
    });
});
