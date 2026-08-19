import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionResult, ProjectionChartPoint } from '../../services/projection/types';
import type { BudgetConfig, User } from '../../types';

/**
 * [REVENUS-NON-VENTILES-AFFICHAGE] — audit de santé 2026-08-19, vague 1d.
 *
 * `Income` (le revenu du mois publié par le moteur) contient AUSSI le revenu locatif, les
 * prestations pour enfants et les paiements REEE. La ventilation montrée à l'utilisateur
 * (`FutureDetailModal`, `ProjectionTooltip`) ne listait que paye 1 / paye 2 / rentes /
 * décaissement — le reste disparaissait sans un mot.
 *
 * MESURÉ avant correctif : résidu `Income − (IncomeMarc + IncomeAnna + IncomeRetirement)` de
 * **3 551 $/mois** (scénario locatif) et **550 $/mois** (scénario 1 enfant), et ce résidu valait
 * EXACTEMENT `RentalIncome` / `childBenefits`.
 *
 * ⚠️ Ce test vise le MOTEUR, pas le composant : il vérifie que les champs nécessaires à une
 * ventilation complète sont bien émis et qu'ils expliquent tout le résidu. C'est ce qui rend la
 * correction d'affichage possible ET démontrable — un test de rendu prouverait qu'on affiche une
 * ligne, pas qu'il ne manque plus rien.
 *
 * ⚠️ Les fixtures ont dû être corrigées : `rentalIncomeMonthly` + `isRented` (pas `monthlyRent`) et
 * un `ChildGoal` complet avec `birthDate`/`governmentBenefits`. Avec des champs approximatifs, les
 * trois scénarios rendaient un résidu de 0 et le test aurait été VERT sans rien mesurer.
 */

const mkUser = (name: string, grossMonthly: number, netMonthly: number): User => ({
    name, grossSalary: grossMonthly, netSalary: netMonthly, color: '#10b981',
    age: 40, birthYear: 1986, canadaArrivalYear: 1986, hasOwnedPropertyLast4Years: true,
} as unknown as User);

const params = (over: Partial<SimulationParams> = {}): SimulationParams => ({
    projection: {
        years: 12, returnRate: 6, inflationRate: 2, savingsMode: 'manual',
        manualContribution: 0, usePortfolioRate: false,
        returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 3,
    },
    calculatedStartingCash: 50000,
    liveCSVBalances: { CELI: 20000, CELIAPP: 0, REER: 50000, NON_ENREG: 20000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 4000, governmentPension: 1500 } as unknown as SimulationParams['retirementGoal'],
    config: { users: [mkUser('A', 7000, 5000)] as unknown as BudgetConfig['users'], splitMode: '50/50' },
    baseGrossAnnual: 84000, baseNetAnnual: 60000,
    currentRentExpense: 1500, baseMonthlyExpenses: 3000,
    startYear: 2026, startMonth: 0,
    ...over,
} as SimulationParams);

const LOCATIF: Partial<SimulationParams> = {
    realEstateGoals: [{
        id: 'r1', name: 'Duplex', isActive: true, purchaseDate: '2026-02-01',
        price: 450000, downPayment: 120000, mortgageRate: 5, amortization: 25,
        totalClosingCosts: 0, monthlyPayment: 0, unrecoverableMonthly: 0,
        isPrimaryResidence: false, isRented: true, rentalIncomeMonthly: 2800,
    }] as unknown as SimulationParams['realEstateGoals'],
};

const ENFANT: Partial<SimulationParams> = {
    childGoals: [{
        id: 'c1', name: 'Enfant', isActive: true, birthDate: '2027-06-01',
        initialCost: 3000, monthlyDiapers: 100, monthlyFood: 150, monthlyClothing: 80,
        monthlyDaycare: 200, governmentBenefits: 550, parentalLeaveIncomeDrop: 0,
    }] as unknown as SimulationParams['childGoals'],
};

type Pt = Record<string, number>;

const points = (over: Partial<SimulationParams>): Pt[] => {
    const r = calculateFutureProjection(params(over));
    const base = (r.allResults as ProjectionResult[]).find((x) => x.stratType === 'BASE')!;
    return (base.chartData as ProjectionChartPoint[]) as unknown as Pt[];
};

/** Ce que la ventilation AFFICHAIT : paye 1 + paye 2 + rentes. */
const ancienneVentilation = (p: Pt): number =>
    (p.IncomeMarc || 0) + (p.IncomeAnna || 0) + (p.IncomeRetirement || 0);

/** Ce qu'elle affiche MAINTENANT : + loyers + allocations + REEE. */
const nouvelleVentilation = (p: Pt): number =>
    ancienneVentilation(p) + (p.RentalIncome || 0) + (p.childBenefits || 0) + (p.ReeePayout || 0);

describe('[REVENUS-NON-VENTILES-AFFICHAGE] les DEUX surfaces consomment les champs', () => {
    // Scan de SOURCE — patron déjà utilisé dans ce dépôt (`chartPrivacyScan`, `privateTitleGuard`)
    // quand ce qu'on veut garder n'est pas observable depuis le contrat d'une fonction.
    //
    // ⚠️ Pourquoi il faut CE test EN PLUS de ceux qui suivent : les cas ci-dessous visent le
    // MOTEUR, qui n'a pas changé — ils prouvent que le résidu existait et que les champs le
    // comblent, mais ils passeraient AUSSI sur le code d'avant. Le correctif, lui, vit dans les
    // deux composants d'affichage. C'est ce bloc-ci qui discrimine.
    const surfaces = [
        'components/projection/FutureDetailModal.tsx',
        'components/projection/ProjectionTooltip.tsx',
    ];

    for (const chemin of surfaces) {
        it(`${chemin} ventile loyers, allocations et REEE`, async () => {
            const fs = await import('node:fs/promises');
            const path = await import('node:path');
            const src = await fs.readFile(path.resolve(process.cwd(), chemin), 'utf-8');
            // Anti-vacuité du scan : si le fichier était vide ou mal résolu, `toContain` échouerait
            // pour la mauvaise raison. On prouve d'abord qu'on lit bien le bon fichier.
            expect(src.length).toBeGreaterThan(1000);
            expect(src).toContain('IncomeRetirement');
            for (const champ of ['RentalIncome', 'childBenefits', 'ReeePayout']) {
                expect(src, `${chemin} doit consommer ${champ}`).toContain(champ);
            }
        });
    }
});

describe('[REVENUS-NON-VENTILES-AFFICHAGE] la ventilation explique tout le revenu', () => {
    it('scénario LOCATIF : le loyer était le résidu, et le moteur l’émet bien', () => {
        const pts = points(LOCATIF);
        const avecLoyer = pts.filter((p) => (p.RentalIncome || 0) > 0);

        // Non-vacuité : sans ça, un scénario mal ficelé rendrait 0 partout et le test serait vert
        // sans rien prouver. C'est exactement ce qui est arrivé à ma première fixture
        // (`monthlyRent` au lieu de `rentalIncomeMonthly` + `isRented`).
        expect(avecLoyer.length).toBeGreaterThan(50);
        expect(Math.max(...avecLoyer.map((p) => p.RentalIncome))).toBeGreaterThan(2000);

        // Discriminant : l'ancienne ventilation laisse un trou de la taille du loyer (3 551 $/mois
        // mesuré), la nouvelle le comble.
        const pireAncien = Math.max(...avecLoyer.map((p) => (p.Income || 0) - ancienneVentilation(p)));
        expect(pireAncien).toBeGreaterThan(1000);
        for (const p of avecLoyer) {
            expect(Math.abs((p.Income || 0) - nouvelleVentilation(p))).toBeLessThanOrEqual(0.05);
        }
    });

    it('scénario ENFANT : les allocations étaient le résidu', () => {
        const pts = points(ENFANT);
        const avecAlloc = pts.filter((p) => (p.childBenefits || 0) > 0);
        expect(avecAlloc.length).toBeGreaterThan(20);

        const pireAncien = Math.max(...avecAlloc.map((p) => (p.Income || 0) - ancienneVentilation(p)));
        expect(pireAncien).toBeGreaterThan(100);   // mesuré : 550 $/mois
        for (const p of avecAlloc) {
            expect(Math.abs((p.Income || 0) - nouvelleVentilation(p))).toBeLessThanOrEqual(0.05);
        }
    });

    it('scénario SOCLE : aucun résidu ni avant ni après (pas de régression)', () => {
        const pts = points({});
        expect(pts.length).toBeGreaterThan(100);
        for (const p of pts) {
            // Sur un salarié pur, l'ancienne ventilation était DÉJÀ complète — le correctif ne doit
            // rien y ajouter (les trois nouveaux champs valent 0).
            expect(Math.abs((p.Income || 0) - ancienneVentilation(p))).toBeLessThanOrEqual(0.05);
            expect(Math.abs((p.Income || 0) - nouvelleVentilation(p))).toBeLessThanOrEqual(0.05);
        }
    });

    it('les trois champs consommés existent dans la sortie du moteur', () => {
        // Garde de CONTRAT : si un renommage côté moteur faisait disparaître un de ces champs,
        // l'affichage retomberait silencieusement à `|| 0` et le trou reviendrait sans bruit.
        const p = points(LOCATIF).find((x) => (x.RentalIncome || 0) > 0)!;
        expect(p).toBeDefined();
        for (const cle of ['RentalIncome', 'childBenefits', 'ReeePayout'] as const) {
            expect(Object.prototype.hasOwnProperty.call(p, cle)).toBe(true);
            expect(Number.isFinite(p[cle])).toBe(true);
        }
    });
});
