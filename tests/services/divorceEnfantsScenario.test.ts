/**
 * [ENG-DIVORCE-CHILDREN-NO-SCENARIO-TEST] Divorce × ENFANTS, au niveau SCÉNARIO.
 *
 * ⚠️ POURQUOI CE FICHIER EXISTE, et c'est la leçon la plus chère du lot. La garde 50/50 a été
 * livrée avec 4 262 tests VERTS et DEUX défauts d'argent dedans — mesurés ensuite par deux agents
 * indépendants. Aucun test ne pouvait les voir :
 *   • tous les tests de divorce déclarent `childGoals: []` — le divorce et les enfants ne se
 *     rencontraient jamais ;
 *   • le fuzz a des enfants mais n'active pas `enableMonteCarlo`, or `tryDivorce` n'existe QUE
 *     là — il ne tirait donc jamais ;
 *   • `childrenGardePartagee` teste `processOneChild` EN ISOLATION : il prouve la partition à la
 *     source et ne touche AUCUN registre en aval.
 * Une garde qui vérifie le producteur ne dit rien de la chaîne. Celle-ci vise les grandeurs que
 * le moteur PUBLIE, après tout le pipeline.
 *
 * ⚠️ Les deux défauts qu'il verrouille :
 *   1. les ALLOCATIONS étaient encaissées à 100 % (`monthlyIncomeDelta` jamais partagé) mais
 *      publiées à 50 % — mesuré 332 $/mois contre 166 $ affichés ;
 *   2. le DÉCAISSEMENT REEE d'études restait ENTIER face à une dépense partagée — trésorerie née
 *      de nulle part, régime de l'enfant vidé 2× trop vite.
 */
import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { AllocationStrategy } from '../../services/projection/types';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User, ChildGoal } from '../../types';

const users = (age = 40): User[] => ([
    { name: 'Marc', grossSalary: 8200, netSalary: 5620, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 7100, netSalary: 4995, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const goal: RetirementGoal = { targetAge: 62, targetMonthlyIncome: 5500, governmentPension: 1850, lifeExpectancy: 92, dbPensionMonthly: 0 } as unknown as RetirementGoal;

/** Enfant NÉ AVANT la projection : il a déjà son âge, donc pas de congé parental parasite. */
const enfant = (o: Partial<ChildGoal> = {}): ChildGoal => ({
    id: 'e1', name: 'Enfant', isActive: true, birthDate: '2020-01-01',
    initialCost: 0, monthlyDiapers: 0, monthlyFood: 200, monthlyClothing: 50,
    daycareType: 'cpe', schoolType: 'publique', activitiesLevel: 'legeres',
    universityType: 'uni_local', carGift: 'non', governmentBenefits: 500,
    ...o,
}) as unknown as ChildGoal;

const params = (over: {
    divorce?: boolean; childGoals?: ChildGoal[]; years?: number; reee?: number;
}): SimulationParams => ({
    projection: {
        years: over.years ?? 10, returnRate: 6, inflationRate: 0, savingsMode: 'manual',
        manualContribution: 0, usePortfolioRate: false,
        returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 0,
        // `enableMonteCarlo` n'est PAS un détail : `tryDivorce` n'existe QUE dans cette branche.
        // C'est précisément ce que le fuzz ne faisait pas, d'où son angle mort.
        ...(over.divorce ? { divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 } : {}),
    } as ProjectionConfig,
    calculatedStartingCash: 200_000,
    liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: over.reee ?? 0 },
    realEstateGoals: [], debts: [], childGoals: over.childGoals ?? [], travelGoals: [], lifeEvents: [],
    retirementGoal: goal,
    config: { users: users(40), splitMode: '50/50' } as BudgetConfig,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 1_800,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

type Pt = Record<string, number | undefined>;

/**
 * ⚠️ DEUX réglages non évidents, et c'est exactement pourquoi ce test n'existait pas :
 *   • `enableMonteCarlo = true` (3e argument) — `tryDivorce` n'est appelé QUE dans cette branche.
 *     C'est l'angle mort du fuzz : il a des enfants, mais appelle le moteur sans MC, donc son
 *     divorce ne se déclenche JAMAIS.
 *   • `verboseMonthlyPoints` (diagnostics, 8e argument) — en mode MC, le moteur réduit chaque
 *     point à `{ NetWorth, monthIndex }` pour la mémoire. Sans ce drapeau, TOUS les champs
 *     observés ici sont `undefined`… et un test qui lit `Number(undefined ?? 0)` compare des
 *     zéros : il serait VERT sur n'importe quel code. Le piège se referme silencieusement.
 * D'où les assertions « scénario vacueux » partout en dessous : elles prouvent que la grandeur
 * mesurée existe VRAIMENT avant de la comparer.
 */
const run = (o: Parameters<typeof params>[0]): Pt[] => {
    const r = __runScenarioForTests(
        params(o), 'AUTO_MARGINAL' as AllocationStrategy, true, false,
        0, 'BASE' as never, {}, { verboseMonthlyPoints: true } as never,
    ) as unknown as { chartData?: Pt[] };
    const pts = r.chartData ?? [];
    if (pts.length === 0) throw new Error('chartData vide — scénario dégénéré, le test serait vacueux');
    return pts;
};

const at = (pts: Pt[], m: number): Pt => {
    const p = pts.find((x) => Number(x.monthIndex) === m);
    if (!p) throw new Error(`mois ${m} absent de la série (longueur ${pts.length})`);
    return p;
};

describe('[ENG-DIVORCE-BENEFITS-FLUX] allocations : l’encaisse et le registre disent la MÊME chose', () => {
    /**
     * ⚠️ La MESURE, et pourquoi elle est construite ainsi. On compare deux scénarios identiques à
     * une seule chose près — le montant d'allocation — et on regarde DEUX grandeurs :
     *   • `Income`         : ce que la caisse encaisse réellement ;
     *   • `childBenefits`  : ce que le moteur PUBLIE.
     * Le défaut se lisait exactement dans leur ÉCART : Δ Income = 2 × Δ childBenefits. Comparer
     * une seule des deux grandeurs à une valeur attendue n'aurait rien vu — c'est leur COHÉRENCE
     * qui est l'invariant.
     */
    const ecart = (divorce: boolean, mois: number) => {
        const avec = run({ divorce, childGoals: [enfant({ governmentBenefits: 500 })] });
        const sans = run({ divorce, childGoals: [enfant({ governmentBenefits: 0 })] });
        return {
            dIncome: Number(at(avec, mois).Income ?? 0) - Number(at(sans, mois).Income ?? 0),
            dBenefits: Number(at(avec, mois).childBenefits ?? 0) - Number(at(sans, mois).childBenefits ?? 0),
        };
    };

    it.each([[12], [36], [60]])('mois %i, APRÈS divorce : Δ encaissé === Δ publié', (mois) => {
        const { dIncome, dBenefits } = ecart(true, mois as number);
        expect(dBenefits, 'scénario vacueux : aucune allocation ne circule').toBeGreaterThan(0);
        // Sur le code d'avant : dIncome = 332, dBenefits = 166.
        expect(dIncome).toBeCloseTo(dBenefits, 2);
    });

    it('hors divorce aussi (le correctif ne doit pas casser le cas nominal)', () => {
        const { dIncome, dBenefits } = ecart(false, 36);
        expect(dBenefits).toBeGreaterThan(0);
        expect(dIncome).toBeCloseTo(dBenefits, 2);
    });

    // ⚠️ Anti-sur-correctif : la cohérence ci-dessus serait aussi verte si le divorce ne partageait
    // plus RIEN (les deux à 100 %). Il faut donc prouver que le partage a bien lieu.
    // [ENG-DIVORCE-ALLOC-ASSIETTE] RE-BASÉ SCIEMMENT le 2026-09-05 (décision Marc 14, « comme
    // mesuré ») : cette assertion disait `div ≈ cpl / 2` (166 $), parce que la récupération des
    // allocations se calculait encore sur les DEUX salaires après le divorce. L'assiette est
    // désormais celle du ménage qui reste : Marc seul gagne 98 400 $ < 150 000 $, donc plus de
    // récupération, et le parent reçoit sa moitié PLEINE — 500 × 0,5 = 250 $. Le couple, lui, reste
    // récupéré (183 600 $ → ratio 0,664 → 332 $) : la relation `div > cpl / 2` est la signature du
    // correctif, et `div < cpl` prouve que le divorce partage toujours.
    it('le divorce partage VRAIMENT les allocations, sur l’assiette du parent qui RESTE (250 $, pas 166 $)', () => {
        const div = ecart(true, 36).dBenefits;
        const cpl = ecart(false, 36).dBenefits;
        expect(cpl).toBeCloseTo(500 * (1 - (183_600 - 150_000) / 100_000), 0); // 332 : le couple est récupéré
        expect(div).toBeCloseTo(500 * 0.5, 0);                                     // 250 : le solo ne l'est plus
        expect(div).toBeGreaterThan(cpl / 2);                                       // > 166 — l'ex n'est plus dans l'assiette
        expect(div).toBeLessThan(cpl);                                              // le divorce partage toujours
    });

    // ⚠️ Contrôle négatif de la RÈGLE : `soloHousehold` change l'ASSIETTE, pas la récupération elle-même.
    // Un parent seul qui gagne 168 000 $ reste récupéré sur SON revenu (ratio 0,82 → 500 × 0,82 × 0,5
    // = 205 $), alors qu'en couple (253 200 $) tout était récupéré (0 $). Perturbation : retirer la
    // récupération pour un solo donnerait 250 ; remettre l'ex dans l'assiette donnerait 0.
    it('un parent seul au-dessus du seuil reste récupéré sur SON revenu (205 $, ni 250 ni 0)', () => {
        const riche = (divorce: boolean, benefits: number) => {
            const p = params({ divorce, childGoals: [enfant({ governmentBenefits: benefits })] });
            (p.config as BudgetConfig).users[0] = { ...(p.config as BudgetConfig).users[0], grossSalary: 14_000, netSalary: 8_900 } as User;
            const r = __runScenarioForTests(p, 'AUTO_MARGINAL' as AllocationStrategy, true, false, 0, 'BASE' as never, {}, { verboseMonthlyPoints: true } as never) as unknown as { chartData?: Pt[] };
            return Number(at(r.chartData ?? [], 36).childBenefits ?? 0);
        };
        const div = riche(true, 500) - riche(true, 0);
        const cpl = riche(false, 500) - riche(false, 0);
        expect(cpl).toBeCloseTo(0, 0);
        expect(div).toBeCloseTo(500 * (1 - (168_000 - 150_000) / 100_000) * 0.5, 0);
    });
});

describe('[ENG-DIVORCE-STUDIES-PAYOUT] le retrait REEE finance la dépense qu’il couvre', () => {
    /**
     * L'enfant a 18 ans au départ : les études commencent immédiatement.
     * ⚠️ ET LE REEE EST DOTÉ — sans ça le test est VACUEUX, et je m'y suis fait prendre : un
     * enfant de 18 ans ne cotise plus (la branche REEE est bornée à `< 18 ans`), donc avec un
     * solde de départ nul le régime est vide, `ReeePayout` reste à 0 et « payout ≤ gross » passe
     * au vert sur le code CASSÉ. C'est la garde `payout > 0` ci-dessous qui l'a révélé.
     */
    const etudiant = () => enfant({
        birthDate: '2008-01-01', universityType: 'uni_local', governmentBenefits: 0,
    });

    /**
     * ⚠️ `depuis` existe parce que le divorce ne tombe PAS au mois 0 : `tryDivorce` est évalué au
     * 1er janvier suivant, soit m≈12 ici. Comparer les totaux sur TOUT l'horizon mélangerait donc
     * des mois de couple et des mois de divorcé, et le rapport attendu ne serait plus 1/2 (mesuré
     * 0,62). Le mois exact du 1er retrait dépendant du calendrier interne, on somme sur une
     * FENÊTRE franchement postérieure au divorce plutôt que de viser un mois précis.
     */
    const auxEtudes = (divorce: boolean, depuis = 0) => {
        const pts = run({ divorce, childGoals: [etudiant()], years: 4, reee: 200_000 });
        let payout = 0;
        let gross = 0;
        for (const p of pts) {
            if (Number(p.monthIndex) < depuis) continue;
            payout += Number(p.ReeePayout ?? 0);
            gross += Number(p.childGross ?? 0);
        }
        return { payout, gross };
    };

    it('le décaissement d’études ne dépasse pas le coût porté', () => {
        const div = auxEtudes(true);
        expect(div.gross, 'scénario vacueux : aucun coût d’études').toBeGreaterThan(0);
        // ⚠️ LA garde anti-vacuité qui manquait : sans REEE doté, `payout` vaut 0 et l'assertion
        // suivante est satisfaite par un régime VIDE, pas par un correctif.
        expect(div.payout, 'scénario vacueux : le REEE ne décaisse rien').toBeGreaterThan(0);
        // Sur le code d'avant : payout ≈ 2 × gross (retrait entier, dépense à 50 %).
        expect(div.payout).toBeLessThanOrEqual(div.gross * 1.01);
    });

    it('divorcé : le coût d’études porté vaut ≈ la moitié de celui du couple', () => {
        // Prouve que le partage a lieu — sinon le test ci-dessus passerait aussi sur un moteur
        // qui aurait simplement cessé de partager quoi que ce soit.
        const div = auxEtudes(true, 24).gross;
        const cpl = auxEtudes(false, 24).gross;
        expect(cpl, 'scénario vacueux : aucun coût sur la fenêtre observée').toBeGreaterThan(0);
        // ⚠️ Fourchette, pas égalité : en mode Monte Carlo l'inflation est TIRÉE, et le tirage du
        // divorce décale la séquence du RNG — les deux runs n'ont donc pas exactement le même
        // `expenseMultiplier` (écart mesuré ≈ 2 %). Viser 0,50 au centième rendrait ce test
        // instable pour une raison sans rapport avec le partage. Ce qu'il doit prouver, c'est
        // « moitié et pas entier » : une fourchette large le fait, et échoue toujours sur le code
        // d'avant (ratio 1,00).
        expect(div / cpl).toBeGreaterThan(0.45);
        expect(div / cpl).toBeLessThan(0.55);
    });
});

describe('[ENG-DIVORCE-CHILDREN-REEE] les deux registres de coût ne divergent plus', () => {
    // `childCost` et `childGross` reçoivent des incréments IDENTIQUES dans `processOneChild` ;
    // n'en partager qu'un les faisait diverger d'un facteur 2 après divorce, sur un registre
    // classé `'flow'` dans `dailyLedger` (donc réparti au jour dans l'infobulle Futur).
    it.each([[12], [36], [60]])('mois %i : childCost === childGross', (mois) => {
        const pts = run({ divorce: true, childGoals: [enfant()] });
        const p = at(pts, mois as number);
        expect(Number(p.childGross ?? 0), 'scénario vacueux : aucun coût d’enfant').toBeGreaterThan(0);
        expect(Number(p.childCost ?? 0)).toBeCloseTo(Number(p.childGross ?? 0), 2);
    });
});
