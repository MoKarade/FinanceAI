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
    /**
     * C3 — distingue une FAÇON DE GÉRER (strategy, monde réaliste BASE, comparable
     * entre elles pour « la meilleure façon ») d'un STRESS-TEST de monde (inflation,
     * krach…). L'optimiseur ne classe que les `strategy`. Absent = 'stress'.
     */
    kind?: 'strategy' | 'stress';
}

export const SCENARIO_DEFINITIONS: ScenarioDefinition[] = [
    {
        stratType: 'BASE',
        strategy: 'AUTO_MARGINAL',
        strategyName: 'Le Plan de Base',
        stratDescription: "Votre trajectoire actuelle basée sur les paramètres standards (Inflation 2%, Retraite 65 ans).",
        pros: ['Équilibre réaliste', 'Stabilité fiscale'],
        cons: ['Dépendance aux marchés standards'],
        icon: '📊',
        delayPensions: false,
        kind: 'strategy',
    },
    // C3 — variantes de GESTION sous le même monde réaliste (BASE) : seules
    // comparables entre elles pour recommander « la meilleure façon de gérer ».
    {
        stratType: 'BASE',
        strategy: 'PRIO_CELI',
        strategyName: "Gestion : CELI d'abord",
        stratDescription: "Cotise et retire en priorité du CELI (libre d'impôt) avant le REER. Réduit l'impôt à court terme.",
        pros: ['Souplesse', "Moins d'impôt immédiat"],
        cons: ['Espace REER moins exploité tôt'],
        icon: '🟢',
        delayPensions: false,
        kind: 'strategy',
    },
    {
        stratType: 'BASE',
        strategy: 'PRIO_REER',
        strategyName: "Gestion : REER d'abord",
        stratDescription: 'Maximise le REER tôt (déduction au taux marginal élevé) et décaisse pendant le pont fiscal. Limite le RRIF forcé.',
        pros: ['Déduction maximale', 'Pont fiscal optimisé'],
        cons: ["Moins de liquidité libre d'impôt"],
        icon: '🔵',
        delayPensions: false,
        kind: 'strategy',
    },
    {
        stratType: 'BASE',
        strategy: 'MELTDOWN_REER',
        strategyName: 'Gestion : fonte du REER',
        stratDescription: "Décaisse agressivement le REER aux années à faible taux pour minimiser l'impôt à vie et l'impôt latent.",
        pros: ['Impôt à vie minimisé', "Moins d'impôt latent"],
        cons: ['Demande de la discipline', 'Revenu imposable plus tôt'],
        icon: '🫠',
        delayPensions: false,
        kind: 'strategy',
    },
    // C3 suite — variante : achat immobilier avec CELIAPP + CELI, sans RAP.
    // Répond à la question : l'obligation de remboursement RAP en vaut-elle le coup
    // face à simplement vider le CELI ? Même monde BASE, même cashflow post-retraite
    // qu'un PRIO_CELI — seule différence : aucun retrait RAP à l'achat.
    {
        stratType: 'BASE',
        strategy: 'PRIO_CELI_NO_RAP',
        strategyName: 'Achat : CELI sans RAP',
        stratDescription: "À l'achat immobilier : CELIAPP + CELI en priorité, pas de RAP (pas de remboursement 15 ans). Cashflow post-retraite identique à CELI d'abord.",
        pros: ['Zéro obligation de remboursement', 'REER intact pour la retraite'],
        cons: ['Utilise plus de room CELI', 'Peut ralentir la croissance si CELI petit'],
        icon: '🏡',
        delayPensions: false,
        kind: 'strategy',
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
    // Phase 4 #4 — Compound stress (le pire du pire)
    {
        stratType: 'COMPOUND_STRESS',
        strategy: 'AUTO_MARGINAL',
        strategyName: "Tempête Parfaite",
        stratDescription: "Cumul: inflation 5%+, croissance faible (équivalent ECONOMIC_WINTER) ET soins de longue durée à 75 ans. Test de résilience extrême.",
        pros: ['Identifie les vulnérabilités', 'Justifie une marge de sécurité plus large'],
        cons: ['Probabilité combinée faible mais non nulle', 'Anxiogène à regarder'],
        icon: '⛈️',
        delayPensions: false,
    },
    // Phase 4 #4 — Héritage tardif (test pont fiscal long)
    {
        stratType: 'LATE_INHERITANCE',
        strategy: 'AUTO_MARGINAL',
        strategyName: "Héritage Tardif",
        stratDescription: "Injection de 250 000$ tard (vers 20 ans plutôt que 5 ans). Teste si vous tenez le pont financier en attendant.",
        pros: ['Réaliste pour parents qui vivent longtemps', "Montre la nécessité d'autonomie"],
        cons: ['Long délai à supporter sans aide'],
        icon: '⏳',
        delayPensions: false,
    },
];

// [UI-SCEN] (2026-06-09) — vues dérivées de SCENARIO_DEFINITIONS :
// les 5 FAÇONS DE GÉRER alimentent le sélecteur « Stratégie de retrait » (Paramètres),
// les 6 STRESS-TESTS sont calculés À LA DEMANDE (panneau de l'onglet Optimisation).
export const STRATEGY_DEFS: ScenarioDefinition[] = SCENARIO_DEFINITIONS.filter(d => d.kind === 'strategy');
export const STRESS_DEFS: ScenarioDefinition[] = SCENARIO_DEFINITIONS.filter(d => d.kind !== 'strategy');
export const STRESS_STRAT_TYPES: FutureScenarioType[] = STRESS_DEFS.map(d => d.stratType);

/** La définition correspondant à la stratégie choisie (défaut : la 1re = AUTO_MARGINAL). */
export const strategyDefFor = (strategy: AllocationStrategy | undefined): ScenarioDefinition =>
    STRATEGY_DEFS.find(d => d.strategy === strategy) ?? STRATEGY_DEFS[0];
