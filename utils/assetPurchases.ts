// Phase E.8 — Helpers DCA multi-achat.
// Calcule les métriques agrégées (quantité totale, coût moyen, gain) à partir
// du tableau `purchases[]`. Si purchases vide → fallback sur les champs legacy
// (dateBought + buyPrice + quantity) pour rétrocompat.

import type { Asset, AssetPurchase } from '../types';

export interface PurchaseStats {
    totalQuantity: number;
    /** Coût moyen pondéré par quantité (= dollar cost average) */
    averageCost: number;
    /** Coût total investi (somme de qty × price) */
    totalCost: number;
    /** Valeur actuelle (totalQuantity × currentPrice) */
    currentValue: number;
    /** Gain absolu : currentValue - totalCost */
    totalGain: number;
    /** Gain en pourcentage : totalGain / totalCost × 100 */
    gainPct: number;
    /** Nombre d'achats distincts */
    purchaseCount: number;
}

/**
 * Retourne les purchases effectives d'un asset.
 * - Si `purchases[]` existe et non-vide → renvoie tel quel
 * - Sinon → construit un purchase synthétique depuis legacy fields
 * - Sinon → tableau vide
 */
export function getEffectivePurchases(asset: Asset): AssetPurchase[] {
    if (asset.purchases && asset.purchases.length > 0) return asset.purchases;
    if (asset.dateBought && typeof asset.buyPrice === 'number' && asset.buyPrice > 0 && asset.quantity > 0) {
        return [{ date: asset.dateBought, quantity: asset.quantity, price: asset.buyPrice }];
    }
    return [];
}

export function computePurchaseStats(asset: Asset): PurchaseStats {
    const purchases = getEffectivePurchases(asset);
    const totalQuantity = purchases.reduce((s, p) => s + p.quantity, 0);
    const totalCost = purchases.reduce((s, p) => s + p.quantity * p.price, 0);
    const averageCost = totalQuantity > 0 ? totalCost / totalQuantity : 0;
    // Note : on utilise totalQuantity calculé depuis purchases (peut différer
    // de asset.quantity legacy si l'utilisateur a fait des sells). Si l'asset
    // n'a pas de purchases, totalQuantity = asset.quantity via fallback.
    const effectiveQty = totalQuantity > 0 ? totalQuantity : asset.quantity;
    const currentValue = effectiveQty * asset.currentPrice;
    const totalGain = currentValue - totalCost;
    const gainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
    return {
        totalQuantity: effectiveQty,
        averageCost,
        totalCost,
        currentValue,
        totalGain,
        gainPct,
        purchaseCount: purchases.length,
    };
}

/**
 * Mise à jour : ajoute un purchase à un asset.
 * Synchronise aussi `asset.quantity` (somme des purchases) et garde
 * dateBought/buyPrice legacy pour rétrocompat.
 */
export function addPurchase(asset: Asset, newPurchase: AssetPurchase): Asset {
    const purchases = [...getEffectivePurchases(asset), newPurchase].sort(
        (a, b) => a.date.localeCompare(b.date),
    );
    const totalQty = purchases.reduce((s, p) => s + p.quantity, 0);
    const totalCost = purchases.reduce((s, p) => s + p.quantity * p.price, 0);
    return {
        ...asset,
        purchases,
        quantity: totalQty,
        // Met à jour les champs legacy : dateBought = date du PREMIER achat,
        // buyPrice = coût moyen pondéré (cohérent avec gain calculation)
        dateBought: purchases[0].date,
        buyPrice: totalQty > 0 ? totalCost / totalQty : 0,
    };
}

export function removePurchase(asset: Asset, index: number): Asset {
    const purchases = getEffectivePurchases(asset).filter((_, i) => i !== index);
    if (purchases.length === 0) {
        return { ...asset, purchases: [], quantity: 0, buyPrice: 0 };
    }
    const totalQty = purchases.reduce((s, p) => s + p.quantity, 0);
    const totalCost = purchases.reduce((s, p) => s + p.quantity * p.price, 0);
    return {
        ...asset,
        purchases,
        quantity: totalQty,
        dateBought: purchases[0].date,
        buyPrice: totalCost / totalQty,
    };
}
