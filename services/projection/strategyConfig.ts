// services/projection/strategyConfig.ts
// G21 C5 — modèle d'une « stratégie » comme combinaison de leviers orthogonaux.
//
// Découple les décisions que l'ancien enum AllocationStrategy confondait (ordre de
// retrait + RAP) en axes indépendants. L'optimiseur génère le produit cartésien des
// leviers activés, puis traduit chaque StrategyConfig en appel moteur.
//
// AUCUNE dépendance vers ../projection ici (évite le cycle) : types purs + données.

import type { AllocationStrategy } from './types';
import type { ProjectionConfig, RetirementGoal } from '../../types';

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
    /** Récolte de gains : réaliser des gains non-enreg dans les années à faible revenu (remplir le 1er palier). */
    gainHarvesting?: boolean;
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
    /** Récolte de gains en capital dans les années à faible revenu (timing de réalisation). */
    gainHarvesting: boolean;
    /** PH4-FUT-B — profil de rendement : presets de `returnRates` (conservateur/équilibré/agressif).
     *  'balanced' = garde les taux actuels (non-régression + respecte les taux édités à la main). */
    returnRateProfile: 'conservative' | 'balanced' | 'aggressive';
    /** PH4-FUT-B — fractionnement de pension 65+ : true = actif (défaut, comportement historique),
     *  false = désactivé (compare l'impact de NE PAS fractionner). */
    pensionSplitting: boolean;
    /** PH4-FUT-B — multiplicateur du taux d'épargne (1 = inchangé ; 1.2 = épargner 20 % de plus). */
    savingsMultiplier: number;
    /** PH4-FUT-B — downsizing immo à la retraite : false = aucun (défaut) ; true = vendre la résidence
     *  principale à l'âge de retraite et racheter plus petit (libère une fraction de l'équité). */
    downsize: boolean;
}

/** Type des taux de rendement par compte (= ProjectionConfig.returnRates non-null). */
type ReturnRates = NonNullable<ProjectionConfig['returnRates']>;

// PH4-FUT-B — presets de rendement annuel nominal par compte. HYPOTHÈSES DE MODÈLE (pas des données
// sourcées) : encadrent le défaut « équilibré » (constants.ts : celi 7 / reer 6,5 / nonReg 6,5 /
// crypto 10 / cash 3). Conservateur = allocation obligataire-lourde ; agressif = actions-lourde.
// 'balanced' n'a PAS de preset : il garde les `returnRates` courants (défaut OU édités à la main).
export const RETURN_RATE_PRESETS: Record<'conservative' | 'aggressive', ReturnRates> = {
    conservative: { celi: 4.5, reer: 4.5, nonReg: 4.5, crypto: 6, cash: 3 },
    aggressive:   { celi: 9,   reer: 8.5, nonReg: 8.5, crypto: 14, cash: 3 },
};

/**
 * Taux de rendement effectifs pour un profil. 'conservative'/'aggressive' → preset ; 'balanced'
 * (ou absent) → `baseRates` INCHANGÉS (non-régression, respecte un réglage manuel). Helper PARTAGÉ
 * par les 2 chemins (configToEngine pour la recherche, runScenario pour la courbe « appliquée ») →
 * zéro divergence recherche↔courbe.
 */
export function returnRatesForProfile(
    profile: StrategyConfig['returnRateProfile'] | undefined,
    baseRates: ReturnRates | undefined,
): ReturnRates | undefined {
    if (profile === 'conservative') return RETURN_RATE_PRESETS.conservative;
    if (profile === 'aggressive') return RETURN_RATE_PRESETS.aggressive;
    return baseRates; // 'balanced' | undefined → inchangé
}

// Bibliothèque des leviers sélectionnables in-app. `values` = valeurs candidates ;
// l'utilisateur en coche un sous-ensemble par lancement. `key` = champ de StrategyConfig.
interface LeverDef<K extends keyof StrategyConfig = keyof StrategyConfig> {
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
    {
        key: 'gainHarvesting', label: 'Récolte de gains (timing)', default: false,
        options: [
            { value: false, label: 'Non' },
            { value: true, label: 'Oui (réaliser au palier bas)' },
        ],
    },
    {
        key: 'returnRateProfile', label: 'Profil de rendement', default: 'balanced',
        options: [
            { value: 'conservative', label: 'Conservateur' },
            { value: 'balanced', label: 'Équilibré' },
            { value: 'aggressive', label: 'Agressif' },
        ],
    },
    {
        key: 'pensionSplitting', label: 'Fractionnement de pension', default: true,
        options: [
            { value: true, label: 'Actif' },
            { value: false, label: 'Inactif' },
        ],
    },
    {
        key: 'savingsMultiplier', label: "Taux d'épargne", default: 1,
        options: [
            { value: 0.9, label: '−10 %' },
            { value: 1, label: 'Base' },
            { value: 1.2, label: '+20 %' },
        ],
    },
    {
        key: 'downsize', label: 'Downsizing à la retraite', default: false,
        options: [
            { value: false, label: 'Non' },
            { value: true, label: 'Oui (résidence principale)' },
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

/** État à écrire pour « appliquer » une StrategyConfig aux paramètres réels du Futur. */
interface AppliedSettings {
    projection: ProjectionConfig;
    retirementGoal: RetirementGoal;
    /** = withdrawalOrder ; sert à sélectionner le scénario correspondant dans l'UI. */
    strategy: AllocationStrategy;
    delayPensions: boolean;
}

/**
 * Traduit une StrategyConfig en mises à jour d'état réel (G21 C5 « Appliquer »).
 * PUR : retourne les objets à passer aux setters, ne mute rien. Les leviers
 * orthogonaux (RAP, cotisation, dettes, asset location) deviennent des champs
 * `applied*` de ProjectionConfig ; âge/dépenses → retirementGoal ; coussin/Smith →
 * projection ; withdrawalOrder/delayPensions → sélection de scénario (retournés à
 * part). Idempotent pour l'asset location : on stocke le flag, le bonus de rendement
 * est appliqué à la volée par le moteur (pas cumulé dans returnRates).
 */
export function applyConfigToSettings(
    config: StrategyConfig,
    currentProjection: ProjectionConfig,
    currentRetirementGoal: RetirementGoal,
): AppliedSettings {
    const baseIncome = currentRetirementGoal.targetMonthlyIncome ?? 0;
    return {
        projection: {
            ...currentProjection,
            emergencyFundMonths: config.emergencyFundMonths,
            useSmithManoeuvre: config.smithManoeuvre,
            appliedContributionOrder: config.contributionOrder,
            appliedDebtFirst: config.debtFirst,
            appliedSkipRap: config.skipRap,
            appliedAssetLocation: config.assetLocation,
            appliedGainHarvesting: config.gainHarvesting,
            appliedReturnProfile: config.returnRateProfile,
            appliedPensionSplitting: config.pensionSplitting,
            appliedSavingsMultiplier: config.savingsMultiplier,
            appliedDownsize: config.downsize,
        },
        retirementGoal: {
            ...currentRetirementGoal,
            targetAge: config.retirementAge,
            targetMonthlyIncome: Math.round(baseIncome * config.retirementSpending),
        },
        strategy: withdrawalOrderToStrategy(config.withdrawalOrder),
        delayPensions: config.delayPensions,
    };
}
