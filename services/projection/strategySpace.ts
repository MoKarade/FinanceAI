// services/projection/strategySpace.ts
// G21 C5 commit 3 — génération de l'espace de recherche à partir de la sélection
// de leviers de l'utilisateur, + traduction config → arguments moteur.
//
// PUR (aucun appel moteur ici) : produit des StrategyConfig[] et des données. Le
// worker (commit 4) injecte runScenario pour exécuter le MC sur chaque config.
// Import SimulationParams en type-only → pas de cycle avec projection.ts.

import type { SimulationParams, AllocationStrategy } from '../projection';
import {
    LEVER_LIBRARY,
    withdrawalOrderToStrategy,
    returnRatesForProfile,
    type StrategyConfig,
    type EngineOverrides,
} from './strategyConfig';

/** Sélection in-app : par levier, le sous-ensemble de valeurs cochées. */
export type LeverSelection = { [K in keyof StrategyConfig]?: ReadonlyArray<StrategyConfig[K]> };

/** Contexte de dédoublonnage : ce qui rend certains axes non pertinents. */
export interface SpaceContext {
    /** Un achat de résidence principale est-il prévu ? Sinon l'axe RAP est inutile. */
    hasPrimaryPurchase: boolean;
    /** Âge actuel : les âges de retraite antérieurs sont absurdes. */
    currentAge: number;
}

const defaultOf = <K extends keyof StrategyConfig>(key: K): StrategyConfig[K] =>
    LEVER_LIBRARY.find(l => l.key === key)!.default as StrategyConfig[K];

/**
 * Valeurs effectives d'un levier après application de la sélection + dédoublonnage :
 * - levier non sélectionné (ou vide) → [valeur par défaut]
 * - retirementAge < âge actuel retiré
 * - skipRap collapse à [défaut] si aucun achat prévu (RAP non pertinent)
 * - doublons supprimés, jamais vide
 */
function effectiveValues<K extends keyof StrategyConfig>(
    key: K,
    selection: LeverSelection,
    ctx: SpaceContext,
): Array<StrategyConfig[K]> {
    const picked = selection[key];
    // Typage interne souple (unknown[]) : l'indexation générique
    // StrategyConfig[K] sur une union hétérogène fait trébucher TS sans gain de
    // sûreté réel ici. On caste au retour.
    let values: unknown[] = picked && picked.length > 0 ? [...picked] : [defaultOf(key)];

    if (key === 'retirementAge') {
        const filtered = (values as number[]).filter(a => a >= ctx.currentAge);
        values = filtered.length > 0 ? filtered : [ctx.currentAge];
    }
    if (key === 'skipRap' && !ctx.hasPrimaryPurchase) {
        values = [defaultOf('skipRap')];
    }

    return Array.from(new Set(values)) as Array<StrategyConfig[K]>;
}

/** Nombre de configurations sans matérialiser le produit (pour l'affichage live UI). */
export function countConfigs(selection: LeverSelection, ctx: SpaceContext): number {
    return LEVER_LIBRARY.reduce((acc, lever) => acc * effectiveValues(lever.key, selection, ctx).length, 1);
}

/** Produit cartésien des leviers → toutes les StrategyConfig à tester. */
export function generateStrategySpace(selection: LeverSelection, ctx: SpaceContext): StrategyConfig[] {
    const axes = LEVER_LIBRARY.map(lever => ({
        key: lever.key,
        values: effectiveValues(lever.key, selection, ctx),
    }));

    let configs: Partial<StrategyConfig>[] = [{}];
    for (const axis of axes) {
        const next: Partial<StrategyConfig>[] = [];
        for (const partial of configs) {
            for (const value of axis.values) {
                next.push({ ...partial, [axis.key]: value });
            }
        }
        configs = next;
    }
    return configs as StrategyConfig[];
}

/** Coût estimé (ms) — costPerSimMs mesuré empiriquement (défaut prudent 2ms). */
export function estimateRuntimeMs(nConfigs: number, iterations: number, costPerSimMs = 2): number {
    return nConfigs * iterations * costPerSimMs;
}

export interface EngineArgs {
    params: SimulationParams;
    strategy: AllocationStrategy;
    delayPensions: boolean;
    overrides: EngineOverrides;
}

/**
 * Bonus de rendement (points de %) appliqué quand le levier assetLocation est actif.
 * Approximation de l'alpha d'une allocation optimale par compte (obligations→REER,
 * croissance→CELI, étranger→NonReg) : elle réduit le drag fiscal global. Appliqué à
 * TOUS les comptes (celi/reer/nonReg), pas seulement le NonReg, car (a) le moteur
 * déplace automatiquement le NonReg vers les comptes enregistrés tant qu'il reste de
 * la place — un bonus NonReg-seul s'évaporerait — et (b) une bonne asset location
 * améliore le rendement après impôt MÉLANGÉ du portefeuille. Ordre de grandeur prudent
 * issu de la littérature (Canadian Couch Potato / PWL ≈ 0,3–0,5 %). Hypothèse de
 * modélisation documentée (ADR-008), pas une donnée plaquée.
 */
export const ASSET_LOCATION_BONUS_PP = 0.4;

/**
 * Traduit une StrategyConfig en arguments pour runScenario : clone immutable de
 * params (âge de retraite, dépenses, coussin, Smith, asset location) + overrides
 * moteur (RAP, cotisation, dettes).
 */
export function configToEngine(config: StrategyConfig, baseParams: SimulationParams): EngineArgs {
    const baseIncome = baseParams.retirementGoal.targetMonthlyIncome ?? 0;
    // PH4-FUT-B — profil de rendement appliqué AVANT le bonus asset-location (presets, ou taux
    // courants si 'balanced'). Même helper que runScenario → recherche et courbe « appliquée » identiques.
    const profileRates = returnRatesForProfile(config.returnRateProfile, baseParams.projection.returnRates);
    const b = ASSET_LOCATION_BONUS_PP;
    const returnRates = config.assetLocation && profileRates
        ? {
            ...profileRates,
            celi: profileRates.celi + b,
            reer: profileRates.reer + b,
            nonReg: profileRates.nonReg + b,
        }
        : profileRates;
    const params: SimulationParams = {
        ...baseParams,
        projection: {
            ...baseParams.projection,
            emergencyFundMonths: config.emergencyFundMonths,
            useSmithManoeuvre: config.smithManoeuvre,
            returnRates,
        },
        retirementGoal: {
            ...baseParams.retirementGoal,
            targetAge: config.retirementAge,
            targetMonthlyIncome: Math.round(baseIncome * config.retirementSpending),
        },
    };
    const overrides: EngineOverrides = {
        skipRapForPurchase: config.skipRap,
        contributionOrder: config.contributionOrder,
        debtFirst: config.debtFirst,
        gainHarvesting: config.gainHarvesting,
    };
    return {
        params,
        strategy: withdrawalOrderToStrategy(config.withdrawalOrder),
        delayPensions: config.delayPensions,
        overrides,
    };
}
