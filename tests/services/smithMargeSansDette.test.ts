// tests/services/smithMargeSansDette.test.ts
//
// [SMITH-MARGE-SANS-DETTE] Une marge qu'on n'a jamais tirée ne peut pas être appelée — et un appel
// ne rembourse jamais plus que ce que la marge PORTE.
//
// SIGNALÉ PAR MARC le 2026-09-18 : « la dette ne s'arrête pas, ça me met 112k à 44 ans ». Sa seule
// dette est un bail auto de 46 934 $ à taux 0, éteint en ~46 mois.
//
// MESURÉ sur sa projection réelle (MCP, 20 ans) AVANT correctif — `dettesNonImmo` par âge :
//   26 → 34 731 · 27 → 22 528 · **28 → −88 234** · 29 à 33 → **−98 560** (plateau) · 34 → −99 043
//   · 39 → −3 072 · 40 → +21 639 · **44 → +128 234** · 46 → +159 370
// Une DETTE NÉGATIVE pendant douze ans, donc un patrimoine net FAUX À LA HAUSSE du même montant
// (`DettesNonImmo` est soustrait : `NetWorth = Σ actifs − DettesNonImmo`).
// Et la vente forcée qui la creuse est visible dans la même série, l'année de l'achat :
// non-enregistré **194 681 → 91 922 $**, CELI **48 656 → 1 991 $**.
//
// CAUSE, lue dans `realEstateMonth.ts` : le bloc « LTV margin call » vivait HORS du
// `if (useSmithManoeuvre)` qui le précède. Sa condition — `smithManoeuvreDebt + mortgage >
// currentValue * 0.65` — est vraie À L'ACHAT pour toute hypothèque ordinaire (il faudrait 35 % de
// mise de fonds pour y échapper), donc **sans le moindre levier Smith**. Le montant vendu était
// ensuite soustrait d'un `smithManoeuvreDebt` à ZÉRO, qui passait négatif d'autant.
//
// ⚠️ La fixture ci-dessous a 20 % de mise de fonds : 384 000 $ d'hypothèque sur 480 000 $ = 80 %
// de la valeur. C'est le cas ORDINAIRE, pas un cas limite — et c'est ce qui rend le défaut
// atteignable par n'importe quel dossier avec une maison.
import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const users = (): User[] => ([
    { name: 'Marc', grossSalary: 8_200, netSalary: 5_620, color: '#10b981', age: 30, birthYear: 1996, canadaArrivalYear: 1996, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const params = (smith: boolean): SimulationParams => ({
    projection: {
        years: 20, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 1_000,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
        useSmithManoeuvre: smith,
    } as unknown as ProjectionConfig,
    calculatedStartingCash: 150_000,
    // ⚠️ Un non-enregistré NON NUL est indispensable : l'appel de marge ne vend que s'il y a quelque
    // chose à vendre (`state.nonReg > 0`). À zéro, le défaut existe et reste strictement invisible.
    liveCSVBalances: { CELI: 20_000, CELIAPP: 0, REER: 20_000, NON_ENREG: 120_000, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [{
        id: 'p1', name: 'Maison', isActive: true, purchaseDate: '2027-03-01',
        price: 480_000, downPayment: 96_000, mortgageRate: 5, amortization: 25,
        totalClosingCosts: 0, monthlyPayment: 0, unrecoverableMonthly: 0, isPrimaryResidence: true,
    }] as unknown as SimulationParams['realEstateGoals'],
    debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 4_000, governmentPension: 1_200, lifeExpectancy: 92, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: { users: users(), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 98_400, baseNetAnnual: 67_440, currentRentExpense: 1_500,
    baseMonthlyExpenses: 3_000, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

const run = (smith: boolean) => __runScenarioForTests(
    params(smith), 'AUTO_MARGINAL' as AllocationStrategy, true, false, 0, 'BASE', {},
    { verboseMonthlyPoints: true },
) as unknown as { chartData: Array<Record<string, number>> };

const serie = (cd: Array<Record<string, number>>, k: string): number[] =>
    cd.map(p => Number(p[k])).filter(v => Number.isFinite(v));

describe('[SMITH-MARGE-SANS-DETTE] une dette publiée ne peut pas être négative', () => {
    it('anti-vacuité : la fixture ACHÈTE bien, et son hypothèque dépasse le seuil de 65 %', () => {
        // Sans ça, « aucune dette négative » serait vrai d'une projection sans maison — donc vrai
        // pour la mauvaise raison, et la garde ne protégerait rien.
        const { chartData } = run(false);
        const immo = serie(chartData, 'Immobilier');
        expect(Math.max(...immo), 'la maison entre bien au bilan').toBeGreaterThan(0);
        // 384 000 $ d'hypothèque sur 480 000 $ = 80 % > 65 % : la condition de l'appel de marge est
        // VRAIE dès l'achat, ce qui est exactement le chemin que ce lot ferme.
        expect(384_000 / 480_000).toBeGreaterThan(0.65);
        // Et il y a bien quelque chose à vendre : sinon la branche fautive ne s'exécutait pas.
        expect(Math.max(...serie(chartData, 'NonReg')), 'un non-enregistré à vendre').toBeGreaterThan(0);
    });

    it('SANS levier Smith : aucun point ne publie une dette hors hypothèque NÉGATIVE', () => {
        const { chartData } = run(false);
        const dettes = serie(chartData, 'DettesNonImmo');
        expect(dettes.length, 'le champ est bien publié').toBeGreaterThan(12);
        const negatifs = dettes.filter(v => v < -0.01);
        expect(
            negatifs.length,
            `dette hors hypothèque NÉGATIVE sur ${negatifs.length} point(s) — la pire à `
            + `${Math.min(...dettes, 0).toFixed(2)} $. Une dette négative est soustraite d'un `
            + 'patrimoine net, donc elle le GONFLE du même montant.',
        ).toBe(0);
    });

    it('AVEC levier Smith : l’appel de marge peut tirer, mais jamais sous zéro', () => {
        // ⚠️ C'est CE cas qui prouve le correctif : la marge est RÉELLEMENT tirée, et le surplus de
        // LTV dépasse largement ce qu'elle porte — sans le plafond, la soustraction passe sous zéro.
        // ⚠️⚠️ Et la perturbation l'a recadré : retirer la garde d'entrée `smithManoeuvreDebt > 0`
        // laisse les TROIS cas verts (mesuré). C'est le PLAFOND seul qui répare les deux branches —
        // l'entrée est une redondance qui énonce l'intention, pas une seconde protection. Une
        // perturbation muette sur son propre ajout mesure d'abord sa REDONDANCE.
        const { chartData } = run(true);
        const dettes = serie(chartData, 'DettesNonImmo');
        expect(dettes.length).toBeGreaterThan(12);
        expect(Math.min(...dettes), 'aucune dette négative').toBeGreaterThanOrEqual(-0.01);
        // Anti-vacuité de CE cas : le levier crée bien une dette, sinon on testerait une série nulle.
        expect(Math.max(...dettes), 'le levier Smith crée bien une dette').toBeGreaterThan(0);
    });
});
