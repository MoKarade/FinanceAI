// services/projection/strategyConfig.ts
// G21 C5 — modèle d'une « stratégie » comme combinaison de leviers orthogonaux.
//
// Découple les décisions que l'ancien enum AllocationStrategy confondait (ordre de
// retrait + RAP) en axes indépendants. L'optimiseur génère le produit cartésien des
// leviers activés, puis traduit chaque StrategyConfig en appel moteur.
//
// AUCUNE dépendance vers ../projection ici (évite le cycle) : types purs + données.

import type { AllocationStrategy } from './types';

export type WithdrawalOrder = 'AUTO_MARGINAL' | 'PRIO_REER' | 'PRIO_CELI' | 'MELTDOWN_REER';
export type ContributionOrder = 'REER_FIRST' | 'CELI_FIRST';

/**
 * Surcharges moteur indépendantes de l'enum AllocationStrategy. Passées en option à
 * runScenario ; toutes absentes ⇒ comportement historique inchangé (non-régression).
 */
export interface EngineOverrides {
    /** Saute le retrait RAP à l'achat (généralise PRIO_CELI_NO_RAP à tous les ordres). */
    skipRapForPurchase?: boolean;
    /** Ordre de cotisation en accumulation, découplé de l'ordre de retrait. */
    contributionOrder?: ContributionOrder;
    /** Rembourser TOUTES les dettes avant d'investir (vs seulement les toxiques >7%). */
    debtFirst?: boolean;
}

/** Une combinaison complète de leviers = une « stratégie » testable. */
export interface StrategyConfig {
    withdrawalOrder: WithdrawalOrder;
    delayPensions: boolean;
    retirementAge: number;
    skipRap: boolean;
    contributionOrder: ContributionOrder;
    /** Multiplicateur des dépenses/revenu cible à la retraite (0.9 / 1 / 1.1). */
    retirementSpending: number;
    smithManoeuvre: boolean;
    debtFirst: boolean;
    emergencyFundMonths: number;
    assetLocation: boolean;
}

// Bibliothèque des leviers sélectionnables in-app. `values` = valeurs candidates ;
// l'utilisateur en coche un sous-ensemble par lancement. `key` = champ de StrategyConfig.
export interface LeverDef<K extends keyof StrategyConfig = keyof StrategyConfig> {
    key: K;
    label: string;
    /** Valeurs proposées + libellé court pour l'UI. */
    options: ReadonlyArray<{ value: StrategyConfig[K]; label: string }>;
    /** Valeur par défaut = comportement actuel du moteur (sert de référence). */
    default: StrategyConfig[K];
}

export const LEVER_LIBRARY: ReadonlyArray<LeverDef> = [
    {
        key: 'withdrawalOrder', label: 'Ordre de retrait', default: 'AUTO_MARGINAL',
        options: [
            { value: 'AUTO_MARGINAL', label: 'Auto (taux marginal)' },
            { value: 'PRIO_REER', label: "REER d'abord" },
            { value: 'PRIO_CELI', label: "CELI d'abord" },
            { value: 'MELTDOWN_REER', label: 'Fonte du REER' },
        ],
    },
    {
        key: 'delayPensions', label: 'Rentes gouvernementales', default: false,
        options: [
            { value: false, label: '65 ans' },
            { value: true, label: '70 ans (bonifiées)' },
        ],
    },
    {
        key: 'retirementAge', label: 'Âge de retraite', default: 65,
        options: [55, 58, 60, 63, 65].map(a => ({ value: a, label: `${a} ans` })),
    },
    {
        key: 'skipRap', label: 'Achat immobilier', default: false,
        options: [
            { value: false, label: 'Utiliser le RAP' },
            { value: true, label: 'CELI sans RAP' },
        ],
    },
    {
        key: 'contributionOrder', label: 'Ordre de cotisation', default: 'CELI_FIRST',
        options: [
            { value: 'REER_FIRST', label: "REER d'abord" },
            { value: 'CELI_FIRST', label: "CELI d'abord" },
        ],
    },
    {
        key: 'retirementSpending', label: 'Dépenses à la retraite', default: 1,
        options: [
            { value: 0.9, label: '−10 %' },
            { value: 1, label: 'Base' },
            { value: 1.1, label: '+10 %' },
        ],
    },
    {
        key: 'smithManoeuvre', label: 'Smith Manoeuvre', default: false,
        options: [
            { value: false, label: 'Non' },
            { value: true, label: 'Oui (levier hypothécaire)' },
        ],
    },
    {
        key: 'debtFirst', label: 'Priorité dettes', default: false,
        options: [
            { value: false, label: 'Toxiques only (>7 %)' },
            { value: true, label: 'Toutes les dettes' },
        ],
    },
    {
        key: 'emergencyFundMonths', label: "Coussin d'urgence", default: 6,
        options: [3, 6, 12].map(m => ({ value: m, label: `${m} mois` })),
    },
    {
        key: 'assetLocation', label: 'Placement par compte', default: false,
        options: [
            { value: false, label: 'Tel quel' },
            { value: true, label: 'Optimisé' },
        ],
    },
];

/** Ordre de retrait (axe) → enum AllocationStrategy attendu par le moteur. */
export function withdrawalOrderToStrategy(order: WithdrawalOrder): AllocationStrategy {
    return order; // les 4 valeurs coïncident avec l'enum existant
}

/** Libellé humain d'un levier (ex: 'retirementAge' → 'Âge de retraite'). */
export function leverLabel(key: keyof StrategyConfig): string {
    return LEVER_LIBRARY.find(l => l.key === key)?.label ?? String(key);
}

/** Libellé humain d'une valeur de levier (ex: ('skipRap', true) → 'CELI sans RAP'). */
export function leverValueLabel(key: keyof StrategyConfig, value: unknown): string {
    const lever = LEVER_LIBRARY.find(l => l.key === key);
    const opt = lever?.options.find(o => o.value === value);
    return opt?.label ?? String(value);
}
