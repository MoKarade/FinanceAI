// tests/services/projection.engineOrder.test.ts
//
// [ENGINE-IMPLICIT-ORDER] L'ordre de la boucle mensuelle de runScenario n'était documenté que par
// des commentaires « Phase N » — la classe de fragilité du meltdown REER (2026-07-31). Ce fichier
// garde les couples MESURÉS comme sensibles, et documente le couple que le ticket nommait À TORT.
//
// ⚠️ CE QUE LA MESURE A RÉFUTÉ (banc scratchpad `mesureOrdre.ts` + `inverser.py`, re-mesuré à la
// main le 2026-09-04, deux exécutions indépendantes) : la paire « taxApril ↔ taxDecember » du
// ticket est INERTE en intra-mois — échange littéral des deux blocs, 5 fixtures, sortie
// bit-identique (`diff` VIDE). Les deux blocs ne co-tirent jamais (mois 3 vs mois 11) et leur seul
// lien est le tampon `taxPreviousYear` écrit en décembre N et consommé l'avril N+1 — qu'aucun
// réordonnancement intra-mois ne peut casser. AUCUNE assertion d'ordre avril↔décembre ici, et
// c'est un choix documenté : elle serait vacueuse (`UNE-FIXTURE-QUI-SATURE…` version ordre).
//
// Ce qui est GARDÉ, chacun avec sa mesure (inversion chirurgicale sur copie du moteur, grandeurs
// PUBLIÉES seulement — commande en fin d'en-tête) :
//  1. computeRetirementIncome AVANT processReerMeltdown — le meltdown lit `incomeRetirement`,
//     remis à 0 CHAQUE mois avant la phase revenus : déplacé au-dessus, il lit 0 (pas une valeur
//     périmée — 0, sans garde) et sur-tire. Mesuré : totalTaxesPaid +7 387,01 $ (sonde
//     incomeRetirement→0 au seul site d'appel) / +8 373,73 $ (bloc déplacé), fixture retraités
//     MELTDOWN_REER ; contrôles AUTO_MARGINAL/actifs/PRIO_REER à 0,00 EXACT.
//  2. processDecemberTaxFiling APRÈS processCashflowAllocation ET processReerMeltdown — INVERSÉ le
//     2026-09-05 (`[FISC-DEC-FLUX-ASSIETTE-TIMING]`, décision Marc 15 : CORRIGER). Jusque-là le
//     dépôt fiscal de décembre lisait les accumulateurs annuels AVANT que la cascade, le meltdown,
//     l'immobilier et les objectifs du même décembre ne les alimentent, et janvier les effaçait :
//     les retraits REER de décembre n'entraient dans l'assiette d'AUCUNE année. Ce test figeait
//     l'ordre fautif en attendant la décision — il s'inverse au même endroit, il ne se supprime pas
//     (`UN-TEST-DE-LIMITE-S-INVERSE-IL-NE-SE-SUPPRIME-PAS`). Mesuré (clef `dec_fin_de_mois`, re-mesuré
//     2026-09-05 sur le banc COMMITTÉ) : totalTaxesPaid +25 568,08 $ (retraités AUTO), +14 750,81 $
//     (MELTDOWN), +14 579,44 $ (MELTDOWN + locatif), −2 990,55 $ (couple actif : les cotisations REER
//     de décembre sont enfin déduites l'année où elles sont faites), +12 $ (droits saturants).
//  3. processAprilSettlement AVANT processCashflowAllocation — avril débite le liquide et publie
//     `contribNonReg`, que l'allocation puis la croissance de mi-mois consomment. Déplacé après :
//     finalNetWorth +438,02 $ (couple actif + locatif), ±293 $ (retraités).
//
// Re-mesurer (banc COMMITTÉ — les chiffres ci-dessus sont DATÉS, la commande est la référence) :
//   npx tsx scripts/mesureOrdreBoucle.ts services/projection.ts > base.json
//   python3 scripts/inverserOrdreBoucle.py <clef>   # prépare une copie inversée hors dépôt (voir son en-tête)
//   npx tsx scripts/mesureOrdreBoucle.ts /tmp/ordre-inv/services/projection.ts > apres.json
//   diff base.json apres.json    # clefs : melt_avant_revenus | sonde_income0 | dec_fin_de_mois | avril_apres_alloc | avril_dec (INERTE)
//
// DEUX gardes complémentaires, aucune ne suffit seule :
//  - le SCAN d'ordre (source décommentée) attrape le déplacement d'un APPEL dans l'orchestrateur —
//    la seule protection qui marche pour un appelant enfoui dans une boucle moteur
//    (`CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE`) ; mais il ne voit pas une inversion SÉMANTIQUE
//    (recopier la valeur avant, passer un autre argument) ;
//  - l'ESPION comportemental prouve que le meltdown VOIT le revenu du mois COURANT — il rougit
//    autant sur le déplacement que sur la sonde `incomeRetirement: 0` (perturbation prouvée le
//    2026-09-04 : seul ce test rougit, le scan reste vert — deux perturbations, deux gardes).

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripComments } from '../../utils/stripComments';
import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import { processReerMeltdown, type MeltdownCtx } from '../../services/projection/meltdownReer';
import type { BudgetConfig, ProjectionConfig, RetirementGoal } from '../../types';

vi.mock('../../services/projection/meltdownReer', async (importOriginal) => {
    const mod = await importOriginal<typeof import('../../services/projection/meltdownReer')>();
    return { ...mod, processReerMeltdown: vi.fn(mod.processReerMeltdown) };
});

const proj = (o: Partial<ProjectionConfig> = {}): ProjectionConfig => ({
    years: 25, returnRate: 5, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 6, cash: 1 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3, ...o,
});
const user = (name: string, age: number, color: string) => ({
    name, grossSalary: 0, netSalary: 0, color, age, birthYear: 2026 - age,
    canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0,
});

// Fixture « F_MELT » du banc — contraintes SATURANTES écrites ici, sans elles la mesure est
// aveugle (`UNE-FIXTURE-QUI-SATURE-LA-CONTRAINTE-REND-LA-MESURE-AVEUGLE`) :
//  · couple DÉJÀ retraité (62 ans), AUCUN salaire ⇒ la phase revenus produit un revenu de
//    RETRAITE non nul dès le début (RRQ/PSV/rente cible ≈ 4 500 $/mois ménage) ;
//  · REER 900 000 $ ⇒ jamais épuisé sur 25 ans ⇒ le plafond `Math.min(reer, …)` ne sature pas ;
//  · revenu ≈ 54 k$/an ménage, STRICTEMENT sous la cible du meltdown ⇒ il tire tous les mois.
const paramsMelt = (): SimulationParams => ({
    projection: proj(),
    calculatedStartingCash: 20_000,
    liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 900_000, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
    realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
    retirementGoal: { targetAge: 60, targetMonthlyIncome: 4_500, governmentPension: 1_500, lifeExpectancy: 95 } as RetirementGoal,
    config: { users: [user('Marc', 62, '#10b981'), user('Anna', 62, '#3b82f6')], splitMode: '50/50' } as BudgetConfig,
    baseGrossAnnual: 0, baseNetAnnual: 0, currentRentExpense: 0, baseMonthlyExpenses: 3_800,
    startYear: 2026, startMonth: 0,
} as unknown as SimulationParams);

describe('[ENGINE-IMPLICIT-ORDER] le meltdown VOIT le revenu de retraite du mois courant (espion)', () => {
    it('sous MELTDOWN_REER, chaque appel reçoit le revenu COURANT (jamais le 0 du reset mensuel)', () => {
        const spy = vi.mocked(processReerMeltdown);
        spy.mockClear();
        __runScenarioForTests(paramsMelt(), 'MELTDOWN_REER', true, false, 0, 'BASE', {});

        // Anti-vacuité 1 — l'espion est bien câblé sur le vrai moteur : ~300 mois d'appels.
        expect(spy.mock.calls.length).toBeGreaterThan(250);
        // Anti-vacuité 2 — le LEVIER agit : le meltdown tire réellement (sinon l'assertion sur ses
        // entrées serait satisfaite par un module jamais sollicité pour de vrai).
        const totalTire = spy.mock.results.reduce((s, r) => {
            const v = r.type === 'return' ? (r.value as { reerDrawn?: number } | null) : null;
            return s + (v?.reerDrawn ?? 0);
        }, 0);
        expect(totalTire).toBeGreaterThan(100_000);

        // LE FAIT (l'ordre observable) : `incomeRetirement` est remis à 0 au DÉBUT de chaque mois
        // et recalculé par la phase revenus AVANT le meltdown. Si l'appel remontait au-dessus de
        // cette phase (ou si l'argument était débranché), l'espion verrait 0 sur TOUS les mois.
        // MESURÉ (sonde 2026-09-04) : la fixture voit 0,00 les mois 0-35 (le couple a 62 ans,
        // RRQ/PSV démarrent à 65 — un vrai zéro, pas un défaut d'ordre), puis 557 → 3 120 $/mois
        // sans aucun retour à 0. L'assertion vise donc les mois ≥ 40 (marge après 65 ans), avec un
        // plancher de 100 $ ≪ 557 $ mesurés — pas un ratio deviné.
        const apres65 = spy.mock.calls
            .map((c) => c[0] as MeltdownCtx)
            .filter((ctx) => ctx.m >= 40);
        expect(apres65.length).toBeGreaterThan(200);
        expect(apres65.every((ctx) => ctx.incomeRetirement > 100),
            'un appel du meltdown après 65 ans a vu un revenu nul — l\'appel est-il remonté au-dessus de la phase revenus ?').toBe(true);
        expect(spy.mock.calls.every((c) => Number.isFinite((c[0] as MeltdownCtx).incomeRetirement))).toBe(true);
        // Perturbation prouvée (2026-09-04) : sonde `incomeRetirement: 0` au site d'appel → ce test
        // rougit (ratio 0), le scan d'ordre ci-dessous reste VERT — c'est pour ça qu'il y a DEUX gardes.
    });

    it('contrôle : sous AUTO_MARGINAL le meltdown est appelé mais ne tire JAMAIS (garde de stratégie)', () => {
        // C'est le contrôle négatif des mesures d'en-tête (0,00 EXACT sous AUTO) : la porte
        // `strategy !== MELTDOWN_REER → null` vit DANS le module, l'orchestrateur appelle toujours.
        const spy = vi.mocked(processReerMeltdown);
        spy.mockClear();
        __runScenarioForTests(paramsMelt(), 'AUTO_MARGINAL', true, false, 0, 'BASE', {});
        expect(spy.mock.calls.length).toBeGreaterThan(250);
        expect(spy.mock.results.every((r) => r.type === 'return' && r.value === null)).toBe(true);
    });
});

describe('[ENGINE-IMPLICIT-ORDER] ordre des appels dans la boucle (scan de source — appelant enfoui)', () => {
    // Source DÉCOMMENTÉE et SANS lignes d'import : les jetons `nom(` ne matchent que les APPELS.
    const src = stripComments(readFileSync('services/projection.ts', 'utf8'))
        .split('\n').filter((l) => !/^\s*import\b/.test(l)).join('\n');
    expect(src.replace(/\s/g, '').length).toBeGreaterThan(50_000); // anti-vacuité du décommentage

    const idx = (jeton: string): number => {
        const i = src.indexOf(jeton);
        expect(i, `${jeton} introuvable — l'appel a changé de nom : re-dériver cette garde`).toBeGreaterThan(-1);
        return i;
    };

    it('unicité des sites (le scan ordonne des appels UNIQUES, pas des occurrences au hasard)', () => {
        for (const jeton of ['computeRetirementIncome(', 'processAprilSettlement(', 'processDecemberTaxFiling(', 'processReerMeltdown(']) {
            expect(src.split(jeton).length - 1, `${jeton} : nombre de sites d'appel inattendu`).toBe(1);
        }
        // `processCashflowAllocation(` a DEUX sites : l'allocation principale + le sauvetage PV-6.
        // L'ordre se juge sur le PREMIER (l'allocation du mois) ; le compte est épinglé pour que
        // l'apparition d'un 3e site force à re-juger cette garde.
        expect(src.split('processCashflowAllocation(').length - 1).toBe(2);
    });

    it('les trois couples MESURÉS gardent leur ordre (chiffres et commande en tête de fichier)', () => {
        const alloc = idx('processCashflowAllocation(');
        expect(idx('computeRetirementIncome('), 'meltdown avant la phase revenus : il lirait un revenu à 0 (mesuré +7 387 $ d\'impôt)')
            .toBeLessThan(idx('processReerMeltdown('));
        // [FISC-DEC-FLUX-ASSIETTE-TIMING] INVERSÉE (voir l'en-tête, point 2) : décembre se dépose APRÈS
        // le dernier producteur d'assiette du mois — l'allocation ET le meltdown. Le remettre au-dessus
        // rouvrirait la fuite (+25 568 $ d'impôt éludés sur la fixture retraités AUTO) en silence.
        expect(idx('processDecemberTaxFiling('), 'dépôt fiscal de décembre AVANT la cascade du mois : fuite d\'assiette rouverte (mesuré +25 568 $)')
            .toBeGreaterThan(alloc);
        expect(idx('processDecemberTaxFiling('), 'dépôt fiscal de décembre AVANT le meltdown : ses retraits échapperaient à l\'assiette')
            .toBeGreaterThan(idx('processReerMeltdown('));
        expect(idx('processAprilSettlement('), 'règlement d\'avril après l\'allocation (mesuré +438 $ de patrimoine)')
            .toBeLessThan(alloc);
        // ⚠️ PAS d'assertion avril↔décembre : leur inversion intra-mois est MESURÉE bit-identique
        // (deux exécutions indépendantes) — une garde ici serait vacueuse et apprendrait à être ignorée.
    });
});
