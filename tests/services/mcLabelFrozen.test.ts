// tests/services/mcLabelFrozen.test.ts
//
// [MC-LABEL-FROZEN] Le libellé « Monte Carlo (N itér.) » décrit le calcul AFFICHÉ, pas la config.
//
// ⚠️ LE DÉFAUT. Le KPI « Taux de succès » lisait `effectiveMcIterations(config.monteCarloIterations)`
// — la configuration VIVANTE — alors que `results` peut être GELÉ : bouger le curseur d'itérations
// sans relancer la projection faisait annoncer un nombre qui n'avait jamais servi au calcul montré.
// Un chiffre d'écran qui décrit autre chose que ce qu'on regarde est pire qu'une absence de chiffre.
//
// ⚠️ Le correctif fait voyager le compte AVEC le résultat (`iterationsRun`, puis `mcIterationsRun`
// dans la sortie de projection) et le libellé le lit là. Le cas nouveau est le TROISIÈME : un
// résultat sans compte (projection d'avant ce lot) n'emprunte PAS le nombre à la config — il
// s'affiche sans chiffre (no-fake-data).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mcSublabel, runMonteCarlo } from '../../services/projection/monteCarlo';
import type { SimulationParams } from '../../services/projection';

describe('[MC-LABEL-FROZEN] le libellé lit le résultat, pas la configuration', () => {
    it('MC désactivé : invitation, sans chiffre', () => {
        expect(mcSublabel(false, 500)).toBe('Active MC pour calculer');
    });

    it('résultat AVEC son compte : le compte du résultat est annoncé', () => {
        expect(mcSublabel(true, 250)).toBe('Monte Carlo (250 itér.)');
    });

    it('résultat SANS compte : « Monte Carlo » nu, jamais un nombre emprunté ailleurs', () => {
        for (const absent of [undefined, null, 0, Number.NaN]) {
            expect(mcSublabel(true, absent as number | null | undefined), `valeur ${String(absent)}`)
                .toBe('Monte Carlo');
        }
    });

    it('le composant ne lit PLUS la configuration vivante pour ce libellé', () => {
        // Garde de source : le défaut n'est pas dans le helper mais dans ce qu'on lui passe. Un
        // retour à `effectiveMcIterations(projection.…)` dans le JSX reproduirait exactement le
        // mensonge, sans qu'aucun test de rendu ne s'en aperçoive.
        const src = readFileSync(resolve(__dirname, '../../components/FutureProjection.tsx'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        expect(src).not.toMatch(/effectiveMcIterations\s*\(\s*projection\./);
        expect(src).toMatch(/mcSublabel\(\s*runMC\s*,\s*results\?\.mcIterationsRun/);
    });
});

describe('[MC-LABEL-FROZEN] le moteur publie ce qu\'il a VRAIMENT exécuté', () => {
    // Scénario factice : le MC n'a besoin que d'une poignée de champs par run. Le but n'est pas de
    // mesurer une projection mais de compter des tours.
    let appels = 0;
    const runScenarioStub = () => {
        appels++;
        return {
            chartData: [{ NetWorth: 1000 }, { NetWorth: 1100 }],
            finalNetWorth: 1100, estateNetWorth: 1100, totalTaxesPaid: 10,
            unsettledTaxAtHorizon: 0, totalGrowth: 100, totalExpenses: 50,
            shortfallRate: 0, minNetWorth: 900,
        };
    };
    // `runMonteCarlo` lit aussi le patrimoine de départ (soldes par compte) pour ses scores :
    // une fixture minimale qui les omet plante — c'est le module qui dit ce dont il a besoin.
    const params = {
        projection: { years: 1 },
        calculatedStartingCash: 1000,
        liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
        retirementGoal: { targetAge: 65 },
        config: { users: [{ age: 40 }] },
    } as unknown as SimulationParams;

    it('`iterationsRun` vaut le nombre de tours réellement faits', () => {
        appels = 0;
        const r = runMonteCarlo(runScenarioStub as never, params, 'AUTO_MARGINAL' as never, false, 7);
        // Les deux moitiés de la preuve : le compteur du résultat ET le nombre d'appels observés.
        // Asserter le seul champ reviendrait à croire le module sur parole.
        expect(r.iterationsRun).toBe(7);
        expect(appels).toBe(7);
    });

    it('le libellé du résultat suit ce compte, pas un autre', () => {
        const r = runMonteCarlo(runScenarioStub as never, params, 'AUTO_MARGINAL' as never, false, 3);
        expect(mcSublabel(true, r.iterationsRun)).toBe('Monte Carlo (3 itér.)');
    });

    it('la chaîne moteur→sortie est câblée (scan : le champ ne se perd pas en route)', () => {
        // ⚠️ Un scan prouve la présence d'un jeton, pas l'acheminement d'une valeur — il est ici le
        // COMPLÉMENT des deux tests ci-dessus, pas leur remplaçant : ils couvrent les deux bouts
        // (le moteur produit, le libellé consomme), le scan couvre le maillon du milieu, qui exige
        // sinon de faire tourner une projection complète.
        const src = readFileSync(resolve(__dirname, '../../services/projection.ts'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        expect(src).toMatch(/mcIterationsRun\s*=\s*mcResult\.iterationsRun/);
        expect(src).toMatch(/^\s*mcIterationsRun,\s*$/m);
    });
});
