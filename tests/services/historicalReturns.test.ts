// tests/services/historicalReturns.test.ts
// Couverture de buildHistoricalSequence et buildReplaySequence :
// longueur de séquence, wrap-around, replay d'année connue/inconnue.

import { describe, it, expect } from 'vitest';
import {
    buildHistoricalSequence,
    buildReplaySequence,
} from '../../services/projection/historicalReturns';
import { mulberry32 } from '../../services/projection/helpers';

describe('buildHistoricalSequence', () => {
    it('retourne exactement le nombre d\'années demandé', () => {
        // Arrange
        const rng = mulberry32(42);

        // Act
        const seq = buildHistoricalSequence(rng, 30, 10);

        // Assert
        expect(seq.length).toBe(30);
    });

    it('retourne une séquence de 1 an (cas limite bas)', () => {
        // Arrange
        const rng = mulberry32(1);

        // Act
        const seq = buildHistoricalSequence(rng, 1, 5);

        // Assert
        expect(seq.length).toBe(1);
    });

    it('chaque entrée a les champs attendus', () => {
        // Arrange
        const rng = mulberry32(99);

        // Act
        const seq = buildHistoricalSequence(rng, 5, 3);

        // Assert
        for (const yr of seq) {
            expect(typeof yr.year).toBe('number');
            expect(typeof yr.sp500TotalReturn).toBe('number');
            expect(typeof yr.bondReturn).toBe('number');
            expect(typeof yr.inflationRate).toBe('number');
        }
    });

    it('produit des séquences différentes avec des seeds différents', () => {
        // Arrange
        const rng1 = mulberry32(1);
        const rng2 = mulberry32(9999);

        // Act
        const seq1 = buildHistoricalSequence(rng1, 20, 5);
        const seq2 = buildHistoricalSequence(rng2, 20, 5);

        // Assert — au moins un point doit différer (très probable avec seeds différents)
        const allSame = seq1.every((yr, i) => yr.year === seq2[i].year);
        expect(allSame).toBe(false);
    });
});

describe('buildReplaySequence', () => {
    it('commence bien par l\'année demandée', () => {
        // Arrange — replay depuis 2008 (crise financière)

        // Act
        const seq = buildReplaySequence(2008, 5);

        // Assert
        expect(seq[0].year).toBe(2008);
        expect(seq[0].sp500TotalReturn).toBeCloseTo(-36.55, 1);
    });

    it('retourne exactement le nombre d\'années demandé', () => {
        // Arrange

        // Act
        const seq = buildReplaySequence(2000, 30);

        // Assert
        expect(seq.length).toBe(30);
    });

    it('wrap-around : après la dernière année connue, recommence au début', () => {
        // Arrange — départ en 2022, on demande 10 ans → dépasse 2024
        const seq = buildReplaySequence(2022, 10);

        // Assert — les 3 premières années sont 2022, 2023, 2024
        expect(seq[0].year).toBe(2022);
        expect(seq[1].year).toBe(2023);
        expect(seq[2].year).toBe(2024);
        // Après wrap, la séquence continue du début du dataset
        expect(seq[3].year).toBe(1928);
    });

    it('fallback si l\'année de départ est inconnue (hors dataset)', () => {
        // Arrange — année 1900, pas dans le dataset

        // Act — doit retourner les premières années du dataset sans crasher
        const seq = buildReplaySequence(1900, 5);

        // Assert
        expect(seq.length).toBe(5);
        // Commence au début du dataset (1928)
        expect(seq[0].year).toBe(1928);
    });

    it('capture le krach de 1929 quand on rejoue depuis 1929', () => {
        // Arrange

        // Act
        const seq = buildReplaySequence(1929, 3);

        // Assert — 1929 était -8.30%, 1930 était -25.12%
        expect(seq[0].sp500TotalReturn).toBeCloseTo(-8.30, 1);
        expect(seq[1].sp500TotalReturn).toBeCloseTo(-25.12, 1);
    });
});
