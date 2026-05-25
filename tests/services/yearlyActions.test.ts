import { describe, it, expect } from 'vitest';
import { computeYearlyActions } from '../../services/projection/yearlyActions';

describe('computeYearlyActions', () => {
    it('somme les flux nets par compte et par année', () => {
        const chartData = [
            { monthIndex: 0, year: 2026, age: 35, NetTransferCELI: 500, NetTransferREER: 300 },
            { monthIndex: 1, year: 2026, age: 35, NetTransferCELI: 500, NetTransferREER: 300 },
            { monthIndex: 12, year: 2027, age: 36, NetTransferCELI: 600, NetTransferCELIAPP: 8000 },
        ];
        const r = computeYearlyActions(chartData);
        expect(r).toHaveLength(2);
        expect(r[0].year).toBe(2026);
        expect(r[0].flows.CELI).toBe(1000); // 500 + 500
        expect(r[0].flows.REER).toBe(600);
        expect(r[0].deposited).toBe(1600);
        expect(r[1].year).toBe(2027);
        expect(r[1].flows.CELIAPP).toBe(8000);
    });

    it('distingue dépôts (positif) et retraits (négatif)', () => {
        const chartData = [
            { monthIndex: 0, year: 2050, age: 60, isRetired: true, NetTransferREER: -2000, NetTransferCELI: -500 },
            { monthIndex: 1, year: 2050, age: 60, isRetired: true, NetTransferREER: -2000 },
        ];
        const r = computeYearlyActions(chartData);
        expect(r[0].isRetired).toBe(true);
        expect(r[0].flows.REER).toBe(-4000); // retrait
        expect(r[0].withdrawn).toBe(4500); // 4000 + 500
        expect(r[0].deposited).toBe(0);
    });

    it('ignore le passé réel (monthIndex < 0)', () => {
        const chartData = [
            { monthIndex: -3, year: 2025, age: 34, NetTransferCELI: 9999 }, // passé → ignoré
            { monthIndex: 0, year: 2026, age: 35, NetTransferCELI: 500 },
        ];
        const r = computeYearlyActions(chartData);
        expect(r).toHaveLength(1);
        expect(r[0].year).toBe(2026);
        expect(r[0].flows.CELI).toBe(500);
    });

    it('chartData vide → []', () => {
        expect(computeYearlyActions([])).toHaveLength(0);
    });
});
