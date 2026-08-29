// [PERF-ENG-LATENT-MC-WASTE] Sous Monte Carlo, le bloc fiscal d'AFFICHAGE n'est plus calculé.
//
// ⚠️ Ce qui était gaspillé : `buildMonthlyDataPoint` ne rend que `{ NetWorth, monthIndex }` sous MC,
// mais l'appelant calculait quand même l'impôt latent, les dividendes, les revenus de placement
// imposables, les taux marginal et effectif et les cumuls REEE — à chaque mois de chaque itération.
//
// ⚠️ CE TEST ESPIONNE L'APPEL, il ne mesure pas un temps. Un test de perf chronométré est instable
// en CI et ne dit pas POURQUOI c'est plus rapide ; l'absence d'appel, elle, est binaire et
// discriminante. Le gain, lui, est mesuré hors CI par `scripts/` et cité dans le commit :
// 18,65 → 16,45 ms/scénario (médiane de 3 exécutions de 80 scénarios), soit −11,8 %.
//
// ⚠️ Et il vérifie les DEUX sens. Un test qui prouverait seulement « pas appelé sous MC » serait
// satisfait par un `computeLatentTax` cassé ou débranché partout : il faut aussi prouver qu'il EST
// appelé quand le point est détaillé — hors MC, et sous MC avec `verboseMonthlyPoints`.
import { describe, it, expect, vi } from 'vitest';

const appels: number[] = [];
vi.mock('../../services/projection/latentTax', async (importOriginal) => {
    const orig = await importOriginal<typeof import('../../services/projection/latentTax')>();
    return {
        ...orig,
        computeLatentTax: (...args: Parameters<typeof orig.computeLatentTax>) => {
            appels.push(1);
            return orig.computeLatentTax(...args);
        },
    };
});

import { __runScenarioForTests, type SimulationParams } from '../../services/projection';
import { getPersonaOrDefault } from '../../services/testPersonas';
import { buildSimulationParamsFromState } from '../../services/projection/buildSimulationParams';
import { INITIAL_PROJECTION } from '../../constants';
import type { AppState } from '../../types';
import type { AllocationStrategy } from '../../services/projection/types';

const params = (): SimulationParams => {
    const etat = getPersonaOrDefault('couple-confort').build() as AppState;
    etat.projection = { ...INITIAL_PROJECTION, years: 10 } as AppState['projection'];
    return buildSimulationParamsFromState(etat) as unknown as SimulationParams;
};

const lancer = (mc: boolean, verbose?: boolean): number => {
    appels.length = 0;
    __runScenarioForTests(
        params(), 'AUTO_MARGINAL' as AllocationStrategy, mc, false, 0, 'BASE', {},
        verbose === undefined ? {} : { verboseMonthlyPoints: verbose },
    );
    return appels.length;
};

describe('[PERF-ENG-LATENT-MC-WASTE] le calcul jeté n\'est plus fait', () => {
    it('sous Monte Carlo : `computeLatentTax` n\'est appelé AUCUNE fois', () => {
        expect(lancer(true)).toBe(0);
    });

    it('hors Monte Carlo : il est appelé à chaque mois — anti-vacuité du cas ci-dessus', () => {
        // Sans ce contrôle, un `computeLatentTax` débranché partout (ou un espion jamais câblé)
        // donnerait exactement le même vert que le test précédent.
        const horsMc = lancer(false);
        expect(horsMc).toBeGreaterThan(100);   // 10 ans × 12 mois, moins la marge des chemins
    });

    it('sous MC AVEC `verboseMonthlyPoints` : il est appelé — le point détaillé garde ses champs', () => {
        // ⚠️ Le cas qui interdit de sauter sur le seul `enableMonteCarlo`. `buildMonthlyDataPoint`
        // construit le point COMPLET quand `verboseMonthlyPoints` est vrai ; sauter le calcul le
        // priverait de ses champs en silence. C'est pour ça que la condition est exportée
        // (`estPointAllege`) et non recopiée.
        expect(lancer(true, true)).toBeGreaterThan(100);
    });
});
