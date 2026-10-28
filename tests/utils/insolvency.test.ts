// tests/utils/insolvency.test.ts — [PROJ-INSOLVENCY-BADGE]
import { describe, it, expect } from 'vitest';
import { findInsolvencyPoint } from '../../utils/insolvency';
import type { ProjectionChartPoint } from '../../services/projection/types';

// Fabrique un point minimal (seuls monthIndex/NetWorth/age comptent ici).
const pt = (monthIndex: number, NetWorth: number, age: number): ProjectionChartPoint =>
    ({ monthIndex, NetWorth, age } as ProjectionChartPoint);

describe('findInsolvencyPoint', () => {
    it('retourne null si le patrimoine net reste ≥ 0 partout', () => {
        const data = [pt(0, 100_000, 40), pt(12, 50_000, 41), pt(24, 0, 42)];
        expect(findInsolvencyPoint(data)).toBeNull();
    });

    it('retourne le PREMIER point où NetWorth < 0 (âge + monthIndex)', () => {
        const data = [pt(0, 50_000, 40), pt(12, 10_000, 41), pt(24, -5_000, 42), pt(36, -80_000, 43)];
        expect(findInsolvencyPoint(data)).toEqual({ age: 42, monthIndex: 24 });
    });

    it('ignore le passé reconstruit (monthIndex < 0)', () => {
        // un point passé négatif (improbable) ne doit pas déclencher l'insolvabilité projetée.
        const data = [pt(-6, -1_000, 39), pt(0, 20_000, 40), pt(12, 30_000, 41)];
        expect(findInsolvencyPoint(data)).toBeNull();
    });

    it('ignore les points sans NetWorth numérique (mode Monte-Carlo réduit / NaN)', () => {
        const data = [
            { monthIndex: 0, age: 40 } as ProjectionChartPoint, // NetWorth absent
            pt(12, NaN, 41),
            pt(24, -3_000, 42),
        ];
        expect(findInsolvencyPoint(data)).toEqual({ age: 42, monthIndex: 24 });
    });

    it('seuil STRICT : NetWorth == 0 n’est PAS insoutenable (≥ 0)', () => {
        expect(findInsolvencyPoint([pt(0, 0, 40)])).toBeNull();
        expect(findInsolvencyPoint([pt(0, -0.01, 40)])).toEqual({ age: 40, monthIndex: 0 });
    });

    it('chartData vide → null', () => {
        expect(findInsolvencyPoint([])).toBeNull();
    });

    it('âge absent sur le point → null (le badge affichera un message générique, pas « vers 0 ans »)', () => {
        const data = [{ monthIndex: 12, NetWorth: -100 } as ProjectionChartPoint];
        expect(findInsolvencyPoint(data)).toEqual({ age: null, monthIndex: 12 });
    });
});
