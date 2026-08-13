// tests/services/projection.divorceMechanisms.test.ts
//
// [ENG-DIVORCE, panel #613] UN TEST PAR MÉCANISME.
//
// ⚠️ POURQUOI CE FICHIER EXISTE. La première livraison du divorce n'avait que des tests GLOBAUX
// (patrimoine médian et taux de survie avec/sans divorce). Ils étaient discriminants — et pourtant
// ils ont laissé passer CINQ défauts ÉLEVÉ, parce qu'ils étaient tous dominés par la phase SALAIRE :
// dès que le revenu fantôme du conjoint disparaissait, le chiffre global bougeait fort, et j'en ai
// déduit à tort que chaque mécanisme fonctionnait. Mesure a posteriori : après correction des 5
// ÉLEVÉ, le P50 global ne bouge que de 0,2 % — les mécanismes fiscaux et de rentes sont
// INVISIBLES à ce niveau d'observation.
// Règle qui en découle : un test global ne prouve rien sur un mécanisme particulier ; il faut viser
// la grandeur que le mécanisme produit.
import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import { computeRetirementIncome } from '../../services/projection/retirementIncome';
import { processReerMeltdown, MELTDOWN_TARGET_BASE } from '../../services/projection/meltdownReer';
import { GIS_MAX_MONTHLY_SINGLE_2026 } from '../../utils/tax';
import type { AllocationStrategy } from '../../services/projection/types';
import type { ProjectionConfig, BudgetConfig, RetirementGoal, User } from '../../types';

const users = (age = 30): User[] => ([
    { name: 'Marc', grossSalary: 8200, netSalary: 5620, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 7100, netSalary: 4995, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

const goal: RetirementGoal = { targetAge: 60, targetMonthlyIncome: 5500, governmentPension: 1850, lifeExpectancy: 92, dbPensionMonthly: 4000 } as unknown as RetirementGoal;

// ── MÉCANISME 1 — les rentes du conjoint partent avec lui ────────────────────
describe('[ENG-DIVORCE ÉLEVÉ-1] le divorce RÉDUIT les rentes', () => {
    const ctx = (over: Record<string, unknown> = {}) => ({
        m: 0, age: 65, simInflation: 0, activeUsersCount: 2, baseGrossAnnual: 183_600,
        delayPensions: false, survivorMode: false, monthlyOasReduction: 0,
        dbSurvivorPct: 0.6, rrqSurvivorPct: 0.6, psvResidencyYears: [40, 40], startYear: 2026,
        ...over,
    } as never);

    it('rentes du divorcé ≈ la MOITIÉ de celles du couple (et non l\'identique)', () => {
        const couple = computeRetirementIncome(ctx(), goal, users(65));
        // Reproduit EXACTEMENT ce que fait le moteur au divorce.
        const divorce = computeRetirementIncome(ctx({ householdPensionShare: 0.5 }), goal, users(65).slice(0, 1));

        expect(couple.total).toBeGreaterThan(0);
        // Le test qui manquait : le premier correctif donnait Δ = 0,00 $ EXACT ici.
        expect(divorce.total, 'les rentes n\'ont pas bougé — le divorce est resté inerte')
            .toBeLessThan(couple.total * 0.75);
        // La DB est un montant MÉNAGE que rien ne divise : sans facteur explicite, elle restait
        // ENTIÈRE chez le divorcé.
        expect(divorce.privee, 'la pension d\'employeur du couple a été conservée en entier')
            .toBeCloseTo(couple.privee / 2, 2);
    });

    it('NE PAS toucher `activeUsersCount` : c\'est un DIVISEUR, pas un compteur de têtes', () => {
        // Le piège exact du 1er correctif, épinglé pour qu'il ne revienne pas : réduire AUSSI
        // `activeUsersCount` annule la réduction, parce que le `/N` s'applique à un agrégat ménage.
        const correct = computeRetirementIncome(ctx({ householdPensionShare: 0.5 }), goal, users(65).slice(0, 1));
        const piege = computeRetirementIncome(ctx({ activeUsersCount: 1, householdPensionShare: 0.5 }), goal, users(65).slice(0, 1));
        expect(piege.rrq + piege.psv, 'réduire activeUsersCount ANNULE la réduction des rentes')
            .toBeGreaterThan(correct.rrq + correct.psv);
    });

    // ── Le SRG : la prestation que NI le diviseur NI la liste d'users n'atteignaient ──
    // Trouvé par le panel APRÈS le correctif ÉLEVÉ-1 : `gisHeads` et `hasSpouseWithOAS` lisent
    // `activeUsersCount` (resté 2, à raison) et ne bouclent pas sur `users` (raccourci, sans effet).
    // Un divorcé était donc testé au barème COUPLE sur le revenu FAMILIAL, puis recevait sa
    // prestation ×2 têtes — le divorce ENRICHISSAIT, dans la fonction même que le lot corrigeait.
    describe('le SRG passe au barème CÉLIBATAIRE et ne se verse qu\'une fois', () => {
        // ⚠️ FIXTURE CALIBRÉE : le SRG est une prestation de DERNIER RECOURS, nulle dès que le
        // revenu monte. Le `goal` du fichier (1 850 $ de rentes + 4 000 $ de DB) le mettrait à
        // zéro des deux côtés — un test vert qui ne mesurerait rien. D'où un ménage sans DB et à
        // rentes faibles, seul régime où le SRG existe et où l'écart est observable.
        const pauvre: RetirementGoal = {
            targetAge: 65, targetMonthlyIncome: 1500, governmentPension: 300,
            lifeExpectancy: 92, dbPensionMonthly: 0,
        } as unknown as RetirementGoal;

        it('la prestation d\'un divorcé ne dépasse pas le MAXIMUM LÉGAL d\'un célibataire', () => {
            // ⚠️ NE PAS écrire « le divorcé touche moins que le couple » : ce serait FAUX comme
            // spécification. Mesuré en écrivant ce test — un célibataire pauvre PEUT légitimement
            // encaisser plus qu'un couple, parce que le maximum célibataire (1 105 $/mois) est
            // très supérieur au maximum par adulte en couple (662 $). C'est le programme qui est
            // ainsi fait, pas un bug.
            // La borne HONNÊTE est donc le plafond légal : avant le correctif, le moteur rendait
            // 1 219,28 $/mois à un divorcé — une valeur que la loi ne permet à personne.
            const divorce = computeRetirementIncome(
                ctx({ householdPensionShare: 0.5, householdAdults: 1 }), pauvre, users(65).slice(0, 1),
            );
            expect(divorce.gis, 'fixture non calibrée : le SRG est nul, le test ne mesure rien')
                .toBeGreaterThan(0);
            // `simInflation: 0` ⇒ aucune indexation : le plafond nominal est la constante elle-même.
            expect(divorce.gis, 'SRG supérieur au maximum légal d\'un célibataire')
                .toBeLessThanOrEqual(GIS_MAX_MONTHLY_SINGLE_2026);
        });

        it('sans le compteur de têtes, le divorcé garde le barème COUPLE (le défaut mesuré)', () => {
            // Reproduit l'appel d'AVANT (aucun `householdAdults`) : c'est ce que le moteur faisait.
            const sansTetes = computeRetirementIncome(
                ctx({ householdPensionShare: 0.5 }), pauvre, users(65).slice(0, 1),
            );
            const avecTetes = computeRetirementIncome(
                ctx({ householdPensionShare: 0.5, householdAdults: 1 }), pauvre, users(65).slice(0, 1),
            );
            expect(sansTetes.gis, 'le barème couple ne surévaluait plus rien — vérifier la fixture')
                .toBeGreaterThan(avecTetes.gis);
        });

        it('le défaut vaut `activeUsersCount` : un couple intact est INCHANGÉ', () => {
            // Rétrocompat bit-identique — ces deux lignes sont sur le chemin de TOUS les couples
            // retraités à bas revenu, pas seulement des divorcés.
            const implicite = computeRetirementIncome(ctx(), pauvre, users(65));
            const explicite = computeRetirementIncome(ctx({ householdAdults: 2 }), pauvre, users(65));
            expect(implicite.gis).toBe(explicite.gis);
            expect(implicite.total).toBe(explicite.total);
        });
    });
});

// ── MÉCANISME 2 — le compte REER de l'ex ne se repeuple pas ──────────────────
describe('[ENG-DIVORCE ÉLEVÉ-2] le registre REER per-conjoint reste consolidé', () => {
    // ⚠️ FIXTURE CALIBRÉE, et ça n'a rien d'accessoire : il a fallu TROIS tentatives pour rendre
    // ce test discriminant. Les deux premières passaient au vert sur le code CASSÉ — donc ne
    // prouvaient rien — parce qu'aucune cotisation REER n'avait lieu :
    //   • espace CELI disponible ⇒ la cascade envoie tout au CELI ;
    //   • REER de départ élevé ⇒ `rrspRoom` ≈ 0 ⇒ plus de place pour cotiser ;
    //   • horizon dépassant la retraite ⇒ le REER est intégralement décaissé, l'état final est
    //     [0, 0] des deux côtés.
    // Il faut donc : espace CELI ÉPUISÉ, REER de départ FAIBLE (donc beaucoup d'espace), et un
    // horizon qui s'arrête AVANT la retraite. C'est la cotisation qui repeuple le slot de l'ex.
    const params = (proj: Partial<ProjectionConfig>): SimulationParams => ({
        projection: {
            years: 10, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 3_000,
            usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
            emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3, ...proj,
        } as ProjectionConfig,
        calculatedStartingCash: 60_000,
        liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 20_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
        realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
        retirementGoal: { ...goal, targetAge: 62 } as RetirementGoal,
        config: {
            users: users(45).map((u) => ({ ...u, celiContributed: 300_000 })),
            splitMode: '50/50',
        } as BudgetConfig,
        baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 1_800,
        baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
    } as unknown as SimulationParams);

    it('après un divorce, la part de l\'ex reste à 0 sur tout l\'horizon', () => {
        // `enableMonteCarlo` : le divorce n'existe que là. Probabilité 1 ⇒ déclenché au 1er janvier.
        const r = __runScenarioForTests(
            params({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 }),
            'AUTO_MARGINAL' as AllocationStrategy, true, false,
        ) as unknown as { reerByUserFinal?: number[] };

        const byUser = r.reerByUserFinal ?? [];
        expect(byUser.length, 'registre per-conjoint absent — test vacueux').toBeGreaterThan(1);
        // Avant : les PARTS restaient celles du couple, donc chaque cotisation repeuplait le slot
        // de l'ex (mesuré jusqu'à 342 658 $), qui repartait ensuite en FERR obligatoire à SON âge.
        expect(byUser[1], 'le compte REER de l\'ex s\'est repeuplé après le divorce').toBeCloseTo(0, 2);
    });

    it('sans divorce, les DEUX parts vivent (le test ci-dessus discrimine bien)', () => {
        const r = __runScenarioForTests(
            params({ divorceEnabled: false }),
            'AUTO_MARGINAL' as AllocationStrategy, true, false,
        ) as unknown as { reerByUserFinal?: number[] };
        const byUser = r.reerByUserFinal ?? [];
        expect(byUser[1], 'sans divorce la part du conjoint doit être NON nulle').toBeGreaterThan(0);
    });
});

// ── MÉCANISME 3 — le meltdown REER vise le bon nombre de DÉCLARATIONS ────────
describe('[ENG-DIVORCE] la cible du meltdown suit le nombre de DÉCLARANTS', () => {
    // Trouvé par le panel : le premier correctif a basculé `taxFilers` à 1 au dépôt fiscal, mais
    // `processReerMeltdown` recevait toujours `activeUsersCount` (= 2). Avant, les deux disaient
    // « couple » — faux, mais COHÉRENT. Après, le moteur retirait un revenu de deux têtes pour
    // l'empiler sur UNE déclaration : mesuré 140 000 $/an de retraits REER imposables en trop.
    // Une correction partielle d'une règle dupliquée est PIRE que l'erreur d'origine.
    const meltCtx = (taxFilers: number) => ({
        m: 0, isRetired: true, simSalaryGrowth: 0, taxFilers,
        incomeRetirement: 1_000, accRetraitsReerYear: 0, accRentesYear: 0,
        grossMarcBaseAnnual: 0, grossAnnaBaseAnnual: 0,
        reer: 800_000, nonReg: 100_000, celi: 50_000, realEstateEquity: 0,
    });

    it('un déclarant vise MOINS qu\'un couple — la cible est par DÉCLARATION', () => {
        const solo = processReerMeltdown(meltCtx(1), 'MELTDOWN_REER' as AllocationStrategy);
        const couple = processReerMeltdown(meltCtx(2), 'MELTDOWN_REER' as AllocationStrategy);
        expect(solo, 'fixture non calibrée : aucun meltdown déclenché').not.toBeNull();
        expect(couple).not.toBeNull();
        // Le retrait mensuel brut du couple doit être STRICTEMENT plus gros : c'est la cible ×2.
        expect(couple!.reerDrawn).toBeGreaterThan(solo!.reerDrawn);
        // Ancrage MESURÉ : la cible est proportionnelle au nombre de déclarations. Patrimoine
        // 950 k$ → SOUS le palier MID (1 M$), donc cible de BASE = 90 000 $/déclarant ; l'écart de
        // retrait ANNUEL vaut exactement une cible de plus.
        expect((couple!.reerDrawn - solo!.reerDrawn) * 12).toBeCloseTo(90_000, 2);
    });

    it('le salaire d\'un ex-conjoint ne reste pas dans l\'assiette à remplir', () => {
        // Le moteur passe désormais `grossAnnaBaseAnnual: soloHousehold ? 0 : …` (même motif qu'au
        // dépôt fiscal de décembre). Ici on vérifie que ce champ pèse bien sur la décision : avec
        // le salaire de l'ex encore compté, la cible est déjà atteinte et le meltdown ne part pas.
        const actif = { ...meltCtx(1), isRetired: false, grossMarcBaseAnnual: 40_000, grossAnnaBaseAnnual: 0 };
        const avecEx = { ...actif, grossAnnaBaseAnnual: 200_000 };
        expect(processReerMeltdown(actif, 'MELTDOWN_REER' as AllocationStrategy)).not.toBeNull();
        expect(
            processReerMeltdown(avecEx, 'MELTDOWN_REER' as AllocationStrategy),
            'le salaire de l\'ex sature la cible et supprime le meltdown',
        ).toBeNull();
    });
});

// ── MÉCANISME 3 bis — le CÂBLAGE, pas seulement la fonction ──────────────────
describe('[ENG-DIVORCE] le moteur PASSE bien le nombre de déclarants au meltdown', () => {
    // ⚠️ Le test précédent porte sur `processReerMeltdown` en ISOLATION : il prouve que la fonction
    // distingue 1 déclarant de 2, PAS que le moteur lui envoie la bonne valeur. C'est exactement le
    // trou qui a produit le NO-GO précédent — un correctif posé à un endroit dont l'appelant
    // continuait de passer l'ancienne grandeur.
    //
    // ⚠️ POURQUOI ON N'OBSERVE PAS `chartData.RetraitREER` ICI, malgré l'évidence : le divorce
    // n'existe QUE sous `enableMonteCarlo` (`tryDivorce` le gate), et sous MC `buildMonthlyDataPoint`
    // renvoie volontairement un point ALLÉGÉ — `{ NetWorth, monthIndex }`, rien d'autre, par
    // performance. Aucun flux mensuel n'est observable pendant un divorce. La seule prise reste
    // donc une grandeur AGRÉGÉE du retour de scénario. (Même racine que le constat « le splitter
    // n'est vu par aucune garde de conservation » : ces gardes tournent en déterministe.)
    const params = (proj: Partial<ProjectionConfig>): SimulationParams => ({
        projection: {
            years: 6, returnRate: 5, inflationRate: 0, savingsMode: 'manual', manualContribution: 0,
            usePortfolioRate: false, returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 5, cash: 2 },
            emergencyFundMonths: 6, salaryGrowth: 0, propertyGrowthRate: 0, ...proj,
        } as ProjectionConfig,
        calculatedStartingCash: 40_000,
        // Patrimoine total sous 1 M$ ⇒ palier de BASE : une seule cible par déclarant.
        liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 600_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
        realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
        // Ménage DÉJÀ retraité : le meltdown vise le revenu de retraite, pas des salaires.
        retirementGoal: {
            targetAge: 60, targetMonthlyIncome: 3_000, governmentPension: 700,
            lifeExpectancy: 92, dbPensionMonthly: 0,
        } as unknown as RetirementGoal,
        config: { users: users(66), splitMode: '50/50' } as BudgetConfig,
        baseGrossAnnual: 0, baseNetAnnual: 0, currentRentExpense: 1_500,
        baseMonthlyExpenses: 3_000, startYear: 2026, startMonth: 0,
    } as unknown as SimulationParams);

    const ttp = (proj: Partial<ProjectionConfig>): number => {
        const r = __runScenarioForTests(
            params(proj), 'MELTDOWN_REER' as AllocationStrategy, true, false,
        ) as unknown as { totalTaxesPaid: number };
        return r.totalTaxesPaid;
    };

    // Mesures effectuées sur CETTE fixture, en réintroduisant chirurgicalement le défaut.
    const TTP_CABLAGE_CORRECT = 54_736;   // `taxFilers` = 1
    const TTP_ANCIEN_CABLAGE = 79_716;    // `activeUsersCount` = 2 → +24 980 $ d'impôt à vie
    const BORNE_TTP_SEUIL = (TTP_CABLAGE_CORRECT + TTP_ANCIEN_CABLAGE) / 2;

    it('après divorce, l\'impôt à vie reflète une cible d\'UN déclarant', () => {
        const divorce = ttp({ divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 });
        expect(divorce, 'aucun impôt — fixture non calibrée, le test ne mesure rien').toBeGreaterThan(0);
        // Borne MESURÉE sur cette fixture exacte, en réintroduisant le défaut :
        //   • câblage correct (`taxFilers` = 1)      → BORNE_TTP_CORRIGE
        //   • ancien câblage (`activeUsersCount` = 2) → BORNE_TTP_DEFAUT
        // Le seuil est posé à mi-chemin : assez serré pour tomber sur le défaut, assez lâche pour
        // ne pas casser sur une variation fiscale mineure. S'il casse un jour, RE-MESURER les deux
        // bornes avant de le déplacer — ne jamais l'élargir « pour faire passer ».
        expect(divorce, 'le meltdown vise encore un revenu de DEUX déclarants')
            .toBeLessThan(BORNE_TTP_SEUIL);
    });
});

// ── Effet HORS divorce, mesuré et ASSUMÉ ─────────────────────────────────────
describe('[ENG-DIVORCE] le VEUF bénéficie du même correctif de meltdown', () => {
    // ⚠️ La baseline n'est PAS restée intacte, et il faut le dire : `taxFilers` vaut 1 dès que le
    // ménage est solo — donc AUSSI après un décès, pas seulement après un divorce. Batterie de 9
    // combinaisons (3 stratégies × déterministe / MC / décès) : 8 bit-identiques, une seule bouge.
    //
    //   décès + MELTDOWN_REER :  patrimoine final  989 214 $ → 1 082 135 $  (+92 921)
    //                            impôt à vie       188 604 $ →   112 848 $  (−75 756)
    //
    // C'est un CORRECTIF, pas une régression : un veuf est UN déclarant, le meltdown ne doit pas
    // viser un revenu de deux têtes à empiler sur sa seule déclaration. La direction est la même
    // que pour le divorce, et elle vaut 75 k$ d'impôt à vie sur ce scénario.
    it('après un décès, le meltdown vise une cible d\'UN déclarant', () => {
        const p = (proj: Partial<ProjectionConfig>): SimulationParams => ({
            projection: {
                years: 8, returnRate: 5, inflationRate: 2, savingsMode: 'manual', manualContribution: 500,
                usePortfolioRate: false, returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 5, cash: 2 },
                emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3, ...proj,
            } as ProjectionConfig,
            calculatedStartingCash: 50_000,
            liveCSVBalances: { CELI: 20_000, CELIAPP: 0, REER: 500_000, NON_ENREG: 30_000, CRYPTO: 0, REEE: 0 },
            realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
            retirementGoal: {
                targetAge: 62, targetMonthlyIncome: 4_000, governmentPension: 1_200,
                lifeExpectancy: 92, dbPensionMonthly: 1_000,
            } as unknown as RetirementGoal,
            // Conjointe de 88 ans : la mortalité stochastique la fait partir tôt dans l'horizon.
            config: {
                users: [users(60)[0], { ...users(60)[1], age: 88, birthYear: 1938 }],
                splitMode: '50/50',
            } as unknown as BudgetConfig,
            baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 1_800,
            baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
        } as unknown as SimulationParams);

        const r = __runScenarioForTests(
            p({ modelSurvivor: true }), 'MELTDOWN_REER' as AllocationStrategy, true, false,
        ) as unknown as { totalTaxesPaid: number };
        // Mesuré : 112 848 $ avec le correctif, 188 604 $ avec l'ancien câblage. Seuil à mi-chemin.
        expect(r.totalTaxesPaid).toBeLessThan((112_848 + 188_604) / 2);
    });
});
