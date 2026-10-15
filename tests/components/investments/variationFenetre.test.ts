import { describe, it, expect } from 'vitest';
import { variationFenetre } from '../../../components/investments/PerformanceComparee';
import type { MarketDataPoint } from '../../../services/finance';

// [S5-REFONTE-PLACEMENTS] La variation d'une étiquette = le bout de sa courbe base 100.
describe('variationFenetre', () => {
    const rows: MarketDataPoint[] = [
        { date: '2025-09-21', TOTAL: 100, CELI: 0 },
        { date: '2025-10-21', TOTAL: 110 },
        { date: '2025-11-21', TOTAL: 97.6, CELI: 50 },
    ];

    it('premier → dernier point valorisé de la fenêtre (lignes éparses, zéros ignorés)', () => {
        expect(variationFenetre(rows, 'TOTAL')).toBeCloseTo(-2.4, 5);
        // CELI n'a qu'un point valorisé : pas de variation mesurable → « — ».
        expect(variationFenetre(rows, 'CELI')).toBeNull();
        expect(variationFenetre(rows, 'REER')).toBeNull();
    });

    it('deux bornes synthétiques (prix figé) → null, jamais un 0 % trompeur', () => {
        const synth = (d: string) => d === '2025-09-21' || d === '2025-11-21';
        expect(variationFenetre(rows, 'TOTAL', synth)).toBeNull();
        // Une seule borne synthétique : le mouvement est réel.
        expect(variationFenetre(rows, 'TOTAL', (d) => d === '2025-11-21')).toBeCloseTo(-2.4, 5);
    });
});
