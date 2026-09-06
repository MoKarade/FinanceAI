// tests/services/divorcePmtPartagee.test.ts
//
// [ENG-DIVORCE-PMT-NON-PARTAGEE] Au divorce, le partage divisait `currentValue` et `mortgage` de
// chaque bien de `propertiesState`, mais PAS `calculatedPmt` (la mensualité). Le divorcé payait
// donc la mensualité ENTIÈRE sur une hypothèque réduite de moitié.
//
// ⚠️ OBSERVABILITÉ — le divorce n'existe QUE sous Monte-Carlo (`tryDivorce` exige
// `enableMonteCarlo`), et sous MC le point mensuel est réduit à `{NetWorth, monthIndex}`. D'où
// `__runScenarioForTests` (UN scénario, déterministe) + `diagnostics.verboseMonthlyPoints`, le
// couple déjà employé par `divorceTaxDebtSplit.test.ts`.
//
// ⚠️ POURQUOI CE FICHIER EXISTE ALORS QUE 4 788 TESTS ÉTAIENT VERTS. Le correctif ne fait rougir
// AUCUN test existant — et ce n'est pas parce qu'il est sans effet (voir les mesures ci-dessous),
// c'est parce que **TOUTES** les fixtures de divorce du dépôt portent `realEstateGoals: []`. Le
// ticket annonçait « re-basera des goldens » : mesuré, il n'en re-base aucun. C'est la classe
// « aucun golden n'a bougé est un résultat à EXPLIQUER » — ici, ça mesurait l'absence de
// COUVERTURE, pas l'absence d'effet.
//
// ── CE QUI A ÉTÉ MESURÉ (maison 500 000 $, mise 100 000 $, 5 % / 25 ans, achetée en 2021,
//    divorce CERTAIN au m=12 à 50 %, horizon 30 ans) ──────────────────────────────────────────
//
//  • Mensualité : 2 338,36 $ avant le divorce. AVEC le correctif elle passe à 1 169,18 $ (moitié,
//    comme la dette : 341 920,06 $ → 170 960,03 $). SANS, elle reste à 2 338,36 $ pendant
//    **48 mois** — jusqu'au renouvellement (m=60), qui la recalcule enfin sur le solde réel.
//    Sur-paiement cumulé sur la fenêtre : **56 121 $** (112 241 $ versés au lieu de 56 120 $).
//  • L'amortissement, lui, ne « déraille » PAS jusqu'au bout : le renouvellement ré-ancre la
//    mensualité sur le solde restant et sur l'échéance d'origine, donc le mois de solde nul est
//    239 dans les DEUX cas. Le ticket disait « le prêt s'amortit ~2× trop vite » — vrai
//    uniquement ENTRE le divorce et le renouvellement suivant.
//  • ⚠️ **Le patrimoine final BAISSE avec le correctif dans la plupart des scénarios**, et le
//    signe CHANGE avec le rendement (patrimoine à 30 ans, correctif − défaut) :
//        3 % : −93 546 $ · 5 % : −82 643 $ · 6 % : −66 989 $ · 8 % : −20 351 $ · 10 % : +54 003 $
//    Mécanisme : le défaut équivaut à un DÉSENDETTEMENT FORCÉ au taux de l'hypothèque (5 %), donc
//    il « enrichit » tant que le rendement après impôt reste sous ~9 %. Le SIGNE du correctif est
//    une propriété de l'ÉCART DE TAUX de la fixture, pas un argument sur sa justesse : la question
//    n'est pas « quel chiffre est le plus gros » mais « le divorcé doit-il encore la mensualité
//    ENTIÈRE sur un prêt réduit de moitié ». Non — et le chemin LOCATIF, trois lignes plus bas dans
//    le même bloc, partage déjà sa mensualité (`rs.monthlyPayment *= keep`).
//  • Aucune de ces valeurs n'est ancrée dans une assertion : à 30 ans elles bougeraient au premier
//    changement de barème. Les assertions visent la RELATION (mensualité ∝ dette), qui est vraie
//    indépendamment des taux.
//
// Chemin DÉCÈS : vérifié, RIEN à partager. `trySpouseMortality` ne fait que lever `spouseAlive` /
// `survivorMode` — le survivant hérite, aucun actif n'est multiplié par un facteur.

import { describe, it, expect } from 'vitest';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import type { ProjectionConfig, BudgetConfig, RetirementGoal } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';
import { usersCouple, maisonDetenue } from '../helpers/menageProprietaire';

const params = (proj: Partial<ProjectionConfig>): SimulationParams => ({
    projection: {
        years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 1_500,
        usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3, ...proj,
    } as ProjectionConfig,
    calculatedStartingCash: 70_000,
    liveCSVBalances: { CELI: 50_000, CELIAPP: 0, REER: 90_000, NON_ENREG: 40_000, CRYPTO: 0, REEE: 0 },
    // ⚠️ `debts: []` À DESSEIN : sans autre dette, `DetteTotale` EST la dette hypothécaire (le point
    // mensuel ne publie pas de champ dédié). L'assertion d'anti-vacuité vérifie `DettesNonImmo === 0`
    // plutôt que de le supposer.
    realEstateGoals: [maisonDetenue()], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 62, targetMonthlyIncome: 5_000, governmentPension: 1_500, lifeExpectancy: 92, dbPensionMonthly: 0 } as unknown as RetirementGoal,
    config: { users: usersCouple(45), splitMode: '50/50' } as unknown as BudgetConfig,
    baseGrossAnnual: 183_600, baseNetAnnual: 127_380, currentRentExpense: 0,
    baseMonthlyExpenses: 4_500, startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

const run = (proj: Partial<ProjectionConfig>) => __runScenarioForTests(
    params(proj), 'AUTO_MARGINAL' as AllocationStrategy, true, false, 0, 'BASE', {},
    { verboseMonthlyPoints: true },
) as unknown as { chartData: Array<Record<string, number>> };

const n = (o: Record<string, number> | undefined, k: string): number => Number(o?.[k] ?? NaN);

/** Divorce CERTAIN : `tryDivorce` ne se déclenche qu'au 1er janvier suivant, donc m = 12. */
const DIVORCE_50 = { divorceEnabled: true, divorceAnnualProbability: 1, divorceSplitPct: 50 };
const M_AVANT = 11;
const M_APRES = 13;
/** Premier renouvellement après le divorce — au-delà, la mensualité est ré-ancrée de toute façon. */
const M_RENOUVELLEMENT = 60;

describe('[ENG-DIVORCE-PMT-NON-PARTAGEE] la mensualité suit le partage', () => {
    it('la fixture MESURE bien quelque chose : maison, hypothèque et divorce sont tous présents', () => {
        const d = run(DIVORCE_50);
        expect(n(d.chartData[M_AVANT], 'Immobilier'), 'aucune équité immobilière : la maison n\'est pas dans le scénario')
            .toBeGreaterThan(100_000);
        expect(n(d.chartData[M_AVANT], 'ImmoHypo'), 'aucune mensualité avant le divorce : rien à partager')
            .toBeGreaterThan(1_000);
        expect(n(d.chartData[M_AVANT], 'DettesNonImmo'), 'une dette NON immobilière fausserait DetteTotale comme proxy de l\'hypothèque')
            .toBe(0);
        expect(n(d.chartData[M_APRES], 'DetteTotale'), 'le divorce n\'a pas réduit la dette : il n\'a pas eu lieu')
            .toBeLessThan(n(d.chartData[M_AVANT], 'DetteTotale') * 0.6);
    });

    // ── LE test discriminant : il ÉCHOUE sur le code d'avant. ──
    it('un partage à 50 % divise la mensualité par deux, comme la dette', () => {
        const d = run(DIVORCE_50);
        const avant = n(d.chartData[M_AVANT], 'ImmoHypo');
        const apres = n(d.chartData[M_APRES], 'ImmoHypo');
        // Mesuré sans le correctif : 2 338,36 $ avant ET après, sur une dette pourtant divisée.
        expect(apres, 'la mensualité n\'a pas suivi le partage').toBeCloseTo(avant / 2, 2);
    });

    /**
     * L'assertion qui porte le SENS du ticket, et qui ne dépend d'aucun montant : partager une
     * hypothèque, c'est partager le CONTRAT (solde ET versement), pas seulement le solde. Le
     * rapport versement/solde est l'échéancier ; il doit traverser le divorce inchangé.
     * Sans le correctif il DOUBLE — le divorcé rembourse au rythme d'un prêt deux fois plus gros.
     */
    it('le rapport mensualité/dette — l\'échéancier — traverse le divorce inchangé', () => {
        const d = run(DIVORCE_50);
        const ratioAvant = n(d.chartData[M_AVANT], 'ImmoHypo') / n(d.chartData[M_AVANT], 'DetteTotale');
        const ratioApres = n(d.chartData[M_APRES], 'ImmoHypo') / n(d.chartData[M_APRES], 'DetteTotale');
        expect(ratioAvant, 'ratio avant non mesurable').toBeGreaterThan(0);
        // ⚠️ Bande de 2 %, PAS `toBeCloseTo(1, 2)` : entre m=11 et m=13 le prêt s'amortit deux mois
        // de plus, ce qui fait naturellement monter le rapport de **0,53 %** (mesuré). Une tolérance
        // plus serrée que ce mouvement-là serait rouge sans aucun défaut. La marge reste énorme :
        // sans le correctif l'écart mesuré vaut **1,0386** (le rapport DOUBLE) — 52 fois la bande.
        expect(Math.abs(ratioApres / ratioAvant - 1), 'l\'échéancier a changé : le versement ne correspond plus au solde')
            .toBeLessThan(0.02);
    });

    /**
     * La fenêtre du défaut, mois par mois. Un seul point de mesure aurait raté ce qui coûte
     * vraiment : le sur-paiement a duré **48 mois** (m=12 → m=59), jusqu'au renouvellement qui
     * recalcule la mensualité sur le solde réel. C'est l'assertion qui aurait attrapé le défaut
     * même si le divorce était tombé un autre mois.
     */
    it('aucun mois de sur-paiement entre le divorce et le renouvellement suivant', () => {
        const d = run(DIVORCE_50);
        const plafond = n(d.chartData[M_AVANT], 'ImmoHypo') / 2;
        const fautifs: number[] = [];
        for (let m = 12; m < M_RENOUVELLEMENT; m++) {
            if (n(d.chartData[m], 'ImmoHypo') > plafond * 1.01) fautifs.push(m);
        }
        // Mesuré sans le correctif : 48 mois fautifs, 56 121 $ versés en trop.
        expect(fautifs, `mois où le divorcé paie plus que sa moitié de mensualité : ${fautifs.length}`)
            .toEqual([]);
    });

    /**
     * Contre-épreuve : sans divorce, la mensualité ne bouge PAS entre m=11 et m=13. Sans elle, un
     * renouvellement qui tomberait par hasard au m=12 rendrait le test discriminant vert pour la
     * mauvaise raison — il mesurerait le calendrier de renouvellement, pas le partage.
     */
    it('sans divorce, la mensualité ne bouge pas aux mêmes mois', () => {
        const sansDivorce = run({ divorceEnabled: false });
        const avant = n(sansDivorce.chartData[M_AVANT], 'ImmoHypo');
        // ⚠️ Sans ce plancher, deux mensualités ABSENTES (NaN, ou une fixture sans maison) se
        // « ressembleraient » et le test serait vert en ne mesurant rien.
        expect(avant, 'aucune mensualité à comparer : la contre-épreuve ne mesure rien').toBeGreaterThan(1_000);
        expect(n(sansDivorce.chartData[M_APRES], 'ImmoHypo'), 'la mensualité a changé SANS divorce : le test discriminant ne mesure pas le partage')
            .toBeCloseTo(avant, 2);
    });
});
