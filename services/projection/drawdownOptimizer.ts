// services/projection/drawdownOptimizer.ts
// W2.6 — Comparateur de scénarios de vie/stratégies.
//
// FIX agents (3× signalé silent-failure + code-reviewer + perf):
//   La version précédente lançait calculateFutureProjection() 5 fois avec
//   exactement les mêmes paramètres, puis associait chaque "stratégie" à un
//   scénario prédéfini via un mapping arbitraire — placebo perf et sémantique.
//
//   Le moteur calculateFutureProjection génère NATIVEMENT 5 scénarios
//   (BASE/LIBERTE_55/HYPER_INFLATION/WINDFALL/ECONOMIC_WINTER) avec des
//   stratégies internes. On expose ces 5 résultats avec un classement honnête,
//   en 1 seul appel.

import { calculateFutureProjection, type SimulationParams } from '../projection';

export interface ScenarioComparison {
    bestScenario: string;
    bestEstateNetWorth: number;
    results: Array<{
        scenarioType: string;
        strategyName: string;
        estateNetWorth: number;
        finalNetWorth: number;
        totalTaxesPaid: number;
        gainVsBase: number;
        pros: string[];
        cons: string[];
        icon: string;
    }>;
    explanation: string;
}

export function compareLifeScenarios(params: SimulationParams): ScenarioComparison {
    // UN SEUL appel — le moteur produit déjà les 5 scénarios.
    const r = calculateFutureProjection(params) as any;
    const allResults = (r.allResults || []) as any[];

    const results = allResults.map(s => ({
        scenarioType: s.stratType,
        strategyName: s.strategyName ?? s.stratType,
        estateNetWorth: s.estateNetWorth ?? 0,
        finalNetWorth: s.finalNetWorth ?? 0,
        totalTaxesPaid: s.totalTaxesPaid ?? 0,
        gainVsBase: s.gainVsAuto ?? 0,
        pros: s.pros ?? [],
        cons: s.cons ?? [],
        icon: s.icon ?? '📊',
    }));

    const sorted = [...results].sort((a, b) => b.estateNetWorth - a.estateNetWorth);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const gain = best ? best.estateNetWorth - worst.estateNetWorth : 0;
    const gainPct = worst && worst.estateNetWorth > 0 ? (gain / worst.estateNetWorth * 100) : 0;

    return {
        bestScenario: best?.strategyName ?? '—',
        bestEstateNetWorth: best?.estateNetWorth ?? 0,
        results,
        explanation: best
            ? `Meilleur avenir: ${best.icon} ${best.strategyName}. Écart entre le meilleur et le pire: ${Math.round(gain).toLocaleString('fr-CA')}\$ (+${gainPct.toFixed(1)}%).`
            : 'Aucun résultat disponible.',
    };
}

// Backward compat: l'API précédente s'appelait optimizeDrawdownOrder.
// On garde l'export sous ce nom pour ne pas casser les consumers, en
// le déclarant deprecated dans la doc.
/** @deprecated Utiliser compareLifeScenarios. La version précédente était un placebo. */
export const optimizeDrawdownOrder = compareLifeScenarios;
