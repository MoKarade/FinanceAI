// services/couple/netWorthByOwner.ts
//
// CI-1000x — Phase 1 (axe B « propriété & vue par personne »).
// Répartit le patrimoine entre les deux conjoints (user1 / user2) et le commun
// (joint). Fondation pour les axes A (impôt par conjoint), C (partage à la
// séparation) et D (optimisation conjugale).
//
// Pur (aucun effet de bord) → entièrement testable.

import type { Asset, AssetOwner, RegisteredAccountType } from '../../types';

export interface OwnerBreakdown {
    user1: number;
    user2: number;
    joint: number;
    total: number;
}

export interface OwnableHolding {
    value: number;
    accountType?: RegisteredAccountType;
    owner?: AssetOwner;
}

/**
 * Propriétaire par défaut quand `owner` est absent.
 * Les comptes enregistrés (CELI/REER/CELIAPP/REEE) sont INDIVIDUELS par la loi
 * canadienne → attribués à user1 par défaut (l'utilisateur peut corriger).
 * Le non-enregistré, le cash, la crypto et la marge peuvent être conjoints
 * → `joint` par défaut.
 */
export function defaultOwner(accountType?: RegisteredAccountType): AssetOwner {
    switch (accountType) {
        case 'CELI':
        case 'REER':
        case 'CELIAPP':
        case 'REEE':
            return 'user1';
        default:
            return 'joint';
    }
}

/**
 * Agrège une liste d'avoirs par propriétaire.
 * @param holdings Avoirs avec leur valeur, type de compte et propriétaire.
 * @param isCouple En mode individuel, tout est attribué à user1 (pas de « commun »).
 */
export function netWorthByOwner(holdings: readonly OwnableHolding[], isCouple = true): OwnerBreakdown {
    const out: OwnerBreakdown = { user1: 0, user2: 0, joint: 0, total: 0 };
    for (const h of holdings) {
        const v = Number(h.value) || 0;
        if (v === 0) continue;
        out.total += v;
        if (!isCouple) {
            out.user1 += v; // mode individuel : aucun « commun »
            continue;
        }
        const owner = h.owner ?? defaultOwner(h.accountType);
        out[owner] += v;
    }
    return out;
}

/** Convertit des Asset (placements) en avoirs valorisés (prix courant × quantité). */
export function assetsToHoldings(assets: readonly Asset[]): OwnableHolding[] {
    return assets.map((a) => ({
        value: (Number(a.currentPrice) || 0) * (Number(a.quantity) || 0),
        accountType: a.accountType,
        owner: a.owner,
    }));
}

/**
 * Répartit le patrimoine total (placements + cash) entre conjoints.
 * Le cash (liquidités) est considéré comme conjoint par défaut.
 */
export function computeNetWorthByOwner(
    assets: readonly Asset[],
    cashJoint = 0,
    isCouple = true,
): OwnerBreakdown {
    const holdings = assetsToHoldings(assets);
    if (cashJoint > 0) holdings.push({ value: cashJoint, owner: 'joint' });
    return netWorthByOwner(holdings, isCouple);
}
