// services/taxEstimate.ts
//
// [TAX-APP-MCP-BASE] Estimation du revenu de placement IMPOSABLE (non-enregistré + crypto), source
// UNIQUE partagée par l'onglet Impôt (app) ET get_tax_situation (MCP) — sinon les deux calculent
// l'impôt sur des assiettes DIFFÉRENTES (l'app ajoutait le placement, le MCP non → divergence pour un
// détenteur de non-enregistré). Pur, réutilise assetValueCad (FX + garde NaN, source unique).

import type { Asset } from '../types';
import { assetValueCad } from './portfolio';
import { CAPITAL_GAINS_INCLUSION_STANDARD } from '../utils/tax';
import { assetsToHoldings, netWorthByOwner } from './couple/netWorthByOwner';

/** Rendement en dividendes estimé (~2 %/an) — hypothèse affichée dans l'onglet Impôt. */
export const EST_DIVIDEND_YIELD = 0.02;
/** Gains en capital réalisés estimés (~7 %/an). */
export const EST_CAPITAL_GAINS_YIELD = 0.07;

/**
 * Revenu de placement IMPOSABLE estimé sur le non-enregistré + crypto :
 * dividendes (100 % imposables) + portion imposable des gains en capital réalisés (50 %).
 * Le REER/CELI/CELIAPP/REEE est exclu (à l'abri de l'impôt). Retourne 0 si aucun avoir taxable.
 */
export function estimateTaxableInvestmentIncome(
    assets: readonly Asset[],
    fxRates: Record<string, number> | undefined,
): number {
    // assetValueCad garde déjà NaN/Infinity (→ 0, logué) mais PAS le signe : un prix/quantité négatif
    // (donnée corrompue) donnerait un revenu de placement négatif qui SOUS-évaluerait l'impôt en silence.
    // Cette source fiscale partagée clampe à 0 — un revenu de placement imposable n'est jamais négatif.
    const nonRegValue = Math.max(0, assets
        .filter((a) => a.accountType === 'NON-ENREG' || a.accountType === 'CRYPTO')
        .reduce((sum, a) => sum + assetValueCad(a, fxRates), 0));
    const estDividends = nonRegValue * EST_DIVIDEND_YIELD;
    const estCapitalGains = nonRegValue * EST_CAPITAL_GAINS_YIELD;
    return estDividends + estCapitalGains * CAPITAL_GAINS_INCLUSION_STANDARD;
}

/** Revenu de placement imposable estimé pour une valeur non enregistrée donnée (même formule que le total). */
function revenuImposableEstime(valeurNonEnregistree: number): number {
    const v = Math.max(0, valeurNonEnregistree);
    return v * EST_DIVIDEND_YIELD + v * EST_CAPITAL_GAINS_YIELD * CAPITAL_GAINS_INCLUSION_STANDARD;
}

interface RevenuPlacementParProprietaire {
    user1: number;
    user2: number;
}

/**
 * [FISC-SOLO-INVEST-SPLIT] Revenu de placement IMPOSABLE estimé réparti par DÉTENTION RÉELLE
 * (`Asset.owner`), source unique de l'onglet Impôt ET de get_tax_situation (MCP) :
 * - `user1` / `user2` : l'actif est imposé chez son détenteur ;
 * - `joint` (ou `owner` absent — défaut du non-enregistré et de la crypto) : moitié-moitié en couple ;
 * - hors couple (`isCouple = false`) : tout revient à user1, quel que soit `owner`.
 * Avant ce lot, les deux sites divisaient le total par le NOMBRE de conjoints : la part d'un conjoint
 * sans salaire tombait sous son BPA (app) ou sortait du payload (MCP) — sous-imposition mesurée
 * 2 342 $/an sur un couple mono-salarié à 200 k$ de non-enregistré.
 * Invariant : `user1 + user2 == estimateTaxableInvestmentIncome(...)` dès que les valeurs sont ≥ 0
 * (le clamp à 0 se fait par propriétaire — un revenu imposable n'est jamais négatif).
 */
export function estimateTaxableInvestmentIncomeByOwner(
    assets: readonly Asset[],
    fxRates: Record<string, number> | undefined,
    isCouple: boolean,
): RevenuPlacementParProprietaire {
    const nonReg = assets.filter((a) => a.accountType === 'NON-ENREG' || a.accountType === 'CRYPTO');
    const bd = netWorthByOwner(assetsToHoldings(nonReg, fxRates ?? {}), isCouple);
    const moitieCommun = bd.joint / 2;
    return {
        user1: revenuImposableEstime(bd.user1 + moitieCommun),
        user2: revenuImposableEstime(bd.user2 + moitieCommun),
    };
}
