import { describe, it, expect } from 'vitest';
import { buildLockedByMonth, pointTotalCapital } from '../../utils/lockedCurveOverlay';
import type { ProjectionChartPoint } from '../../services/projection/types';

const pt = (o: Partial<ProjectionChartPoint>): ProjectionChartPoint =>
    ({ monthIndex: 0, year: 2026, ...o } as ProjectionChartPoint);

describe('lockedCurveOverlay (PH2-d)', () => {
    describe('buildLockedByMonth', () => {
        const locked = { chartData: [pt({ monthIndex: 0, NetWorth: 100 }), pt({ monthIndex: 12, NetWorth: 200 })] };
        const metric = (p: ProjectionChartPoint) => p.NetWorth ?? NaN;

        it('non verrouillé → null (aucune 2e courbe)', () => {
            expect(buildLockedByMonth(locked, false, metric)).toBeNull();
        });

        it('verrouillé mais pas de données → null', () => {
            expect(buildLockedByMonth({ chartData: [] }, true, metric)).toBeNull();
            expect(buildLockedByMonth(null, true, metric)).toBeNull();
        });

        it('verrouillé → index monthIndex→valeur via la métrique', () => {
            const m = buildLockedByMonth(locked, true, metric);
            expect(m).not.toBeNull();
            expect(m!.get(0)).toBe(100);
            expect(m!.get(12)).toBe(200);
            expect(m!.size).toBe(2);
        });

        it('ignore les valeurs non finies (NetWorth absent au passé) ; null si tout est ignoré', () => {
            const withGaps = { chartData: [pt({ monthIndex: -1, NetWorth: undefined }), pt({ monthIndex: 0, NetWorth: 50 })] };
            const m = buildLockedByMonth(withGaps, true, metric);
            expect(m!.has(-1)).toBe(false);
            expect(m!.get(0)).toBe(50);
            const allGaps = { chartData: [pt({ monthIndex: -1, NetWorth: undefined })] };
            expect(buildLockedByMonth(allGaps, true, metric)).toBeNull();
        });
    });

    describe('pointTotalCapital', () => {
        it('somme CELI+REER+NonReg+Liquidites+CELIAPP (champs absents comptés 0)', () => {
            expect(pointTotalCapital(pt({ CELI: 10, REER: 20, NonReg: 30, Liquidites: 5, CELIAPP: 5 }))).toBe(70);
            expect(pointTotalCapital(pt({ CELI: 10 }))).toBe(10);
            expect(pointTotalCapital(pt({}))).toBe(0);
        });
    });
});
