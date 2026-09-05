// tests/services/projection.renewalRate.test.ts
//
// [ENG-RENEWAL-SAISIE] + [ENG-RENEWAL-RATE-MISMATCH] (décision Marc 2026-09-04, livrés ENSEMBLE)
//
// Le taux au renouvellement hypothécaire vient d'une SAISIE (`goal.renewalRateProjection`, le champ
// que le Studio immobilier écrivait déjà et que le moteur IGNORAIT — l'ancien « choc » dérivé de
// `id.charCodeAt(0)` valait zéro pour tout identifiant atteignable). Défaut = taux courant ⇒
// comportement inchangé sans saisie. Et la PAIRE : au renouvellement, PMT ET intérêt mensuel
// suivent le nouveau taux (`pState.currentRatePct`) — avant, seul le PMT bougeait, donc un
// renouvellement à taux plus bas AFFAMAIT le capital (mesuré panel #552 : 4,5 % → 3 %, solde
// encore 211 569 $ après 10 ans sur un prêt censé s'éteindre à 240 mois).
//
// Fixture : bien acheté au mois 0, croissance de valeur 0 % — la valeur reste au prix d'achat,
// donc `Immobilier` (équité publiée) lit directement l'hypothèque restante : équité = prix − solde.
import { describe, it, expect } from 'vitest';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, RealEstateGoal } from '../../types';
import type { ProjectionResult, ProjectionChartPoint } from '../../services/projection/types';

const PRIX = 400_000;
const AMORTISSEMENT_ANS = 25;

const goal = (overrides: Partial<RealEstateGoal> = {}): RealEstateGoal => ({
    id: 'prop_renew',
    name: 'Maison Renouvellement',
    isActive: true,
    isPrimaryResidence: true,
    price: PRIX,
    downPayment: 80_000,
    totalClosingCosts: 5_000,
    unrecoverableMonthly: 0,
    mortgageRate: 4.5,
    amortization: AMORTISSEMENT_ANS,
    purchaseDate: '2026-01-15',
    propertyGrowthRate: 0,
    monthlyPayment: 0,
    ...overrides,
});

const params = (g: RealEstateGoal): SimulationParams => ({
    projection: {
        years: AMORTISSEMENT_ANS + 2,
        returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 1500,
        usePortfolioRate: false,
        returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
    } as ProjectionConfig,
    calculatedStartingCash: 200_000,
    liveCSVBalances: { CELI: 30_000, CELIAPP: 0, REER: 50_000, NON_ENREG: 10_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [g],
    debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 4500, governmentPension: 1500 } as RetirementGoal,
    config: {
        users: [
            { name: 'T1', grossSalary: 5000, netSalary: 3500, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
            { name: 'T2', grossSalary: 4500, netSalary: 3200, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
        ],
        splitMode: '50/50',
    } as BudgetConfig,
    baseGrossAnnual: 114_000,
    baseNetAnnual: 80_400,
    currentRentExpense: 1500,
    baseMonthlyExpenses: 5000,
    startYear: 2026,
    startMonth: 0,
});

const runBase = (g: RealEstateGoal): ProjectionResult => {
    const r = calculateFutureProjection(params(g));
    const base = r.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE');
    expect(base).toBeDefined();
    return base!;
};

const immobilierAu = (r: ProjectionResult, mois: number): number => {
    const p = r.chartData[mois] as ProjectionChartPoint;
    expect(p).toBeDefined();
    return Number(p.Immobilier ?? 0);
};

describe('[ENG-RENEWAL-SAISIE] le taux de renouvellement SAISI pilote enfin le moteur', () => {
    it('anti-vacuité : l\'achat a bien lieu (équité non nulle dès le premier mois détenu)', () => {
        const r = runBase(goal());
        expect(immobilierAu(r, 1)).toBeGreaterThan(50_000);
    });

    it('LEVIER : un taux de renouvellement plus haut change l\'équité mi-parcours ET le patrimoine (rouge quand le champ est inerte)', () => {
        // Avant ce lot, `renewalRateProjection` n'était lu par AUCUN chemin moteur : les deux runs
        // étaient bit-identiques. C'est l'assertion qui rougit sur le code d'avant.
        const sans = runBase(goal());
        const dur = runBase(goal({ renewalRateProjection: 9 }));
        // À taux plus haut dès le 1er renouvellement (mois 60), le capital avance plus lentement
        // → équité plus basse à mi-amortissement…
        expect(immobilierAu(dur, 180)).toBeLessThan(immobilierAu(sans, 180) - 5_000);
        // …et l'intérêt payé en plus ampute le patrimoine final.
        expect(dur.finalNetWorth!).toBeLessThan(sans.finalNetWorth! - 10_000);
    });

    it('[ENG-RENEWAL-RATE-MISMATCH] PMT et intérêt suivent ENSEMBLE : le prêt s\'éteint à l\'échéance même quand le taux BAISSE', () => {
        // Le cas sentinelle du bug d'avant : PMT recalculé au taux bas mais intérêt facturé à
        // l'ancien taux ⇒ capital affamé, solde énorme à l'échéance. Corrigé, l'annuité recalculée
        // à chaque renouvellement vise toujours le même mois d'extinction : à la fin de
        // l'amortissement, l'équité vaut le prix du bien (croissance 0), à l'arrondi près.
        const bas = runBase(goal({ renewalRateProjection: 2 }));
        const finAmortissement = AMORTISSEMENT_ANS * 12 + 1;
        expect(immobilierAu(bas, finAmortissement)).toBeGreaterThan(PRIX - 2_000);
        // Contrôle symétrique : à taux plus haut aussi (l'annuité vise l'échéance, pas plus tard).
        const dur = runBase(goal({ renewalRateProjection: 9 }));
        expect(immobilierAu(dur, finAmortissement)).toBeGreaterThan(PRIX - 2_000);
    });

    it('la marge Smith suit AUSSI le taux renouvelé (différence-en-différences sur le patrimoine)', () => {
        // [SMITH-HELOC-TAUX-FIGE] dit « la marge suit le taux du prêt » — après un renouvellement,
        // le taux du prêt est le taux RENOUVELÉ. Isolation du canal marge : le coût d'un
        // renouvellement à 9 % sur le patrimoine final est mesuré AVEC et SANS levier Smith ; la
        // différence des deux coûts ne peut venir que de l'intérêt de la marge (les retombées du
        // PMT plus cher sont présentes dans les deux paires et s'annulent au premier ordre).
        const nwFinal = (smith: boolean, renewal?: number): number => {
            const g = goal(renewal === undefined ? {} : { renewalRateProjection: renewal });
            const p = params(g);
            (p.projection as ProjectionConfig & { useSmithManoeuvre?: boolean }).useSmithManoeuvre = smith;
            const r = calculateFutureProjection(p);
            const base = r.allResults!.find((s: ProjectionResult) => s.stratType === 'BASE')!;
            return base.finalNetWorth!;
        };
        const coutAvecSmith = nwFinal(true) - nwFinal(true, 9);
        const coutSansSmith = nwFinal(false) - nwFinal(false, 9);
        // Anti-vacuité : le renouvellement à 9 % coûte quelque chose dans les DEUX mondes.
        expect(coutSansSmith).toBeGreaterThan(1_000);
        // Le canal marge : avec le levier, le même renouvellement coûte STRICTEMENT plus cher.
        // ⚠️ Seuil MESURÉ des deux côtés (2026-09-05) : 135 399 $ avec la marge au taux renouvelé,
        // 38 416 $ si la marge reste au taux d'origine (le canal « moins de capital remboursé →
        // moins de dette Smith » existe dans les deux cas et ne discrimine PAS le taux de la
        // marge). 80 000 sépare les deux : rouge exactement quand la marge cesse de suivre.
        expect(coutAvecSmith - coutSansSmith).toBeGreaterThan(80_000);
    });

    it('DÉFAUT NEUTRE : sans saisie (ou saisie 0 = champ vidé), comportement identique au taux courant', () => {
        // `Number('')` vaut 0 côté formulaire : un champ vidé écrit 0, que le moteur traite comme
        // une absence (0 % n'est pas un taux de renouvellement). Les trois runs coïncident.
        const sans = runBase(goal());
        const zero = runBase(goal({ renewalRateProjection: 0 }));
        const explicite = runBase(goal({ renewalRateProjection: 4.5 }));
        expect(zero.finalNetWorth!).toBeCloseTo(sans.finalNetWorth!, 2);
        expect(explicite.finalNetWorth!).toBeCloseTo(sans.finalNetWorth!, 2);
    });
});
