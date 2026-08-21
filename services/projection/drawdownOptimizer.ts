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

import { STRATEGY_DEFS } from './scenarios';
import { calculateFutureProjection, type SimulationParams } from '../projection';
import { logError } from '../errorLogger';

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
    // [UI-SCEN] — le moteur ne produit plus qu'UN scénario par défaut : on lance UNE
    // simulation PAR façon de gérer (withdrawalStrategy paramétré), puis on compare.
    // (L'ancien appel unique ne comparait plus rien : 1 ligne, écart 0 $ — placebo.)
    const allResults = STRATEGY_DEFS.map((def) => calculateFutureProjection({
        ...params,
        projection: { ...params.projection, withdrawalStrategy: def.strategy as SimulationParams['projection']['withdrawalStrategy'] },
    }).allResults?.[0]).filter((x): x is NonNullable<typeof x> => x != null);

    // FIX silent-failure cycle 2 (MEDIUM): allResults vide → signal explicite.
    if (allResults.length === 0) {
        logError({ source: 'projection', severity: 'warning', message: "compareLifeScenarios: allResults vide — le moteur n'a produit aucun scénario." });
        return {
            bestScenario: '—',
            bestEstateNetWorth: 0,
            results: [],
            explanation: '⚠️ Aucun scénario calculable. Vérifie tes paramètres (capital initial, années, salaire).',
        };
    }

    const baseEstate = allResults[0]?.estateNetWorth ?? 0; // AUTO_MARGINAL = référence
    const results = allResults.map(s => ({
        scenarioType: s.stratType ?? '—',
        strategyName: s.strategyName ?? s.stratType ?? '—',
        estateNetWorth: s.estateNetWorth ?? 0,
        finalNetWorth: s.finalNetWorth ?? 0,
        // [ENG-TTP-UNSETTLED-PROPAGATE, corrigé revue #683] compteur NU assumé. ⚠️ Ce module
        // N'EST PAS orphelin : `compareLifeScenarios` est appelé par GoalSeekerCard (bouton
        // « Optimiser ordre de décaissement »). Un premier commentaire l'affirmait orphelin sur un
        // grep qui ratait l'ALIAS `optimizeDrawdownOrder` par lequel il passait alors — alias
        // supprimé depuis (`[DETTE-DEPRECATED-DRAWDOWN]`), donc ce grep-là ne peut plus mentir.
        // MAIS ce champ précis n'est PAS
        // affiché par la carte (strategyName + estateNetWorth seulement) et le tri porte sur
        // estateNetWorth : le nu est sans effet UI aujourd'hui. Si le champ devient affiché,
        // utiliser lifetimeTaxTotal (source unique).
        totalTaxesPaid: s.totalTaxesPaid ?? 0,
        gainVsBase: (s.estateNetWorth ?? 0) - baseEstate,
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
            ? `Meilleur avenir: ${best.strategyName}. Écart entre le meilleur et le pire: ${Math.round(gain).toLocaleString('fr-CA')}\$ (+${gainPct.toFixed(1)}%).`
            : 'Aucun résultat disponible.',
    };
}

// [DETTE-DEPRECATED-DRAWDOWN] L'alias `optimizeDrawdownOrder` est SUPPRIMÉ (2026-08-21).
//
// Il existait « pour ne pas casser les consumers » — mais il n'a jamais protégé personne : le seul
// consommateur du dépôt (`GoalSeekerCard`) l'utilisait, donc l'alias ne faisait que MAINTENIR un
// second nom pour la même fonction, marqué `@deprecated` et pourtant vivant en production.
//
// Son coût réel était une DÉSINFORMATION : un grep sur `compareLifeScenarios` ne trouvait aucun
// appelant et faisait conclure « module orphelin » — conclusion FAUSSE écrite noir sur blanc dans
// un commentaire de ce fichier (voir plus haut, corrigé au même commit). Un alias déprécié rend le
// code cherchable par deux noms, donc introuvable par un seul.
//
// Le renommage est bit-identique : l'alias était une simple affectation (`= compareLifeScenarios`),
// pas une adaptation de signature.
