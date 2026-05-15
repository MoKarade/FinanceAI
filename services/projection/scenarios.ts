// services/projection/scenarios.ts
// Cycle 7 split: metadata des 5 "Avenirs de Vie" (Distinct Futures).
// Données statiques extraites de calculateFutureProjection — facilite la
// modification des labels, descriptions, pros/cons sans toucher au moteur.

import type { AllocationStrategy, FutureScenarioType } from '../projection';

export interface ScenarioDefinition {
    stratType: FutureScenarioType;
    strategy: AllocationStrategy;
    strategyName: string;
    stratDescription: string;
    pros: string[];
    cons: string[];
    icon: string;
    delayPensions: boolean;
}

export const SCENARIO_DEFINITIONS: ScenarioDefinition[] = [
    {
        stratType: 'BASE',
        strategy: 'AUTO_MARGINAL',
        strategyName: 'Le Plan de Base',
        stratDescription: 'Votre trajectoire actuelle basée sur les paramètres standards (Inflation 2%, Retraite 65 ans).',
        pros: ['Équilibre réaliste', 'Stabilité fiscale'],
        cons: ['Dépendance aux marchés standards'],
        icon: '📊',
        delayPensions: false,
    },
    {
        stratType: 'LIBERTE_55',
        strategy: 'PRIO_REER',
        strategyName: 'Liberté 55',
        stratDescription: "Simule un arrêt de travail précoce à 55 ans en maximisant le REER pour combler le pont fiscal.",
        pros: ['Retraite anticipée', 'Pont fiscal optimisé'],
        cons: ['Nécessite une épargne agressive dès maintenant'],
        icon: '🌅',
        delayPensions: false,
    },
    {
        stratType: 'HYPER_INFLATION',
        strategy: 'AUTO_MARGINAL',
        strategyName: "Le Choc d'Inflation",
        stratDescription: "Scénario catastrophe avec une inflation soutenue à 5.5% (type années 70-80).",
        pros: ['Test de résilience'],
        cons: ["Érosion massive du pouvoir d'achat"],
        icon: '🔥',
        delayPensions: false,
    },
    {
        stratType: 'WINDFALL',
        strategy: 'AUTO_MARGINAL',
        strategyName: "L'Héritage Inattendu",
        stratDescription: "Simule une injection de 250,000$ (héritage ou gain) après 5 ans.",
        pros: ['Accélération massive', 'Liberté financière soudaine'],
        cons: ['Incertitude sur le timing réel'],
        icon: '🎁',
        delayPensions: false,
    },
    {
        stratType: 'ECONOMIC_WINTER',
        strategy: 'AUTO_MARGINAL',
        strategyName: "L'Hiver Économique",
        stratDescription: "Une décennie de croissance faible (3% Bourse, 1% Cash) combinée à une inflation persistante.",
        pros: ['Scénario prudent'],
        cons: ['Croissance du patrimoine très lente'],
        icon: '❄️',
        delayPensions: false,
    },
];
