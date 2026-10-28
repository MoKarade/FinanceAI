import { describe, it, expect } from 'vitest';
import { computePurchaseStats, addPurchase, removePurchase, getEffectivePurchases } from '../../utils/assetPurchases';
import type { Asset } from '../../types';

const baseAsset: Asset = {
    symbol: 'AAPL',
    quantity: 0,
    currency: 'USD',
    currentPrice: 200,
    name: 'Apple Inc.',
    performance: 0,
    dateBought: '',
};

describe('getEffectivePurchases', () => {
    it('returns purchases[] when set and non-empty', () => {
        const asset: Asset = { ...baseAsset, quantity: 10, purchases: [{ date: '2024-01-01', quantity: 10, price: 150 }] };
        expect(getEffectivePurchases(asset)).toHaveLength(1);
    });

    it('synthesizes from legacy fields when purchases is empty', () => {
        const asset: Asset = { ...baseAsset, quantity: 5, dateBought: '2023-06-15', buyPrice: 120 };
        const p = getEffectivePurchases(asset);
        expect(p).toEqual([{ date: '2023-06-15', quantity: 5, price: 120 }]);
    });

    it('returns empty array if no purchase data', () => {
        const asset: Asset = { ...baseAsset, quantity: 0, dateBought: '' };
        expect(getEffectivePurchases(asset)).toEqual([]);
    });
});

describe('computePurchaseStats — DCA scenario', () => {
    it('computes weighted average cost across multiple purchases', () => {
        // 10 @ 100 + 10 @ 200 = 20 unités, coût moyen 150
        const asset: Asset = {
            ...baseAsset,
            quantity: 20,
            currentPrice: 250,
            purchases: [
                { date: '2023-01-01', quantity: 10, price: 100 },
                { date: '2024-06-01', quantity: 10, price: 200 },
            ],
        };
        const stats = computePurchaseStats(asset);
        expect(stats.totalQuantity).toBe(20);
        expect(stats.averageCost).toBe(150);
        expect(stats.totalCost).toBe(3000);
        expect(stats.currentValue).toBe(5000);
        expect(stats.totalGain).toBe(2000);
        expect(stats.gainPct).toBeCloseTo(66.67, 1);
        expect(stats.purchaseCount).toBe(2);
    });

    it('handles single legacy purchase via fallback', () => {
        const asset: Asset = { ...baseAsset, quantity: 5, currentPrice: 200, dateBought: '2023-01-01', buyPrice: 100 };
        const stats = computePurchaseStats(asset);
        expect(stats.totalCost).toBe(500);
        expect(stats.totalGain).toBe(500);
        expect(stats.gainPct).toBe(100);
    });

    it('returns zero stats for empty asset', () => {
        const asset: Asset = { ...baseAsset, quantity: 0, dateBought: '' };
        const stats = computePurchaseStats(asset);
        expect(stats.totalCost).toBe(0);
        expect(stats.gainPct).toBe(0);
    });
});

describe('addPurchase', () => {
    it('adds a purchase and updates quantity + averaged buyPrice', () => {
        const asset: Asset = { ...baseAsset, quantity: 10, dateBought: '2024-01-01', buyPrice: 100 };
        const updated = addPurchase(asset, { date: '2024-06-01', quantity: 10, price: 200 });
        expect(updated.purchases).toHaveLength(2);
        expect(updated.quantity).toBe(20);
        expect(updated.buyPrice).toBe(150); // weighted avg
    });

    it('keeps purchases sorted by date', () => {
        const asset: Asset = { ...baseAsset, quantity: 0, dateBought: '' };
        const a1 = addPurchase(asset, { date: '2024-06-01', quantity: 5, price: 150 });
        const a2 = addPurchase(a1, { date: '2024-01-01', quantity: 10, price: 100 });
        expect(a2.purchases?.[0].date).toBe('2024-01-01');
        expect(a2.purchases?.[1].date).toBe('2024-06-01');
    });
});

describe('removePurchase', () => {
    it('removes a purchase and recomputes totals', () => {
        const asset: Asset = {
            ...baseAsset,
            quantity: 20,
            purchases: [
                { date: '2024-01-01', quantity: 10, price: 100 },
                { date: '2024-06-01', quantity: 10, price: 200 },
            ],
            dateBought: '2024-01-01',
            buyPrice: 150,
        };
        const updated = removePurchase(asset, 1);
        expect(updated.purchases).toHaveLength(1);
        expect(updated.quantity).toBe(10);
        expect(updated.buyPrice).toBe(100);
    });

    it('handles removing the last purchase (quantity goes to 0)', () => {
        const asset: Asset = {
            ...baseAsset,
            quantity: 5,
            purchases: [{ date: '2024-01-01', quantity: 5, price: 100 }],
        };
        const updated = removePurchase(asset, 0);
        expect(updated.purchases).toEqual([]);
        expect(updated.quantity).toBe(0);
    });
});
