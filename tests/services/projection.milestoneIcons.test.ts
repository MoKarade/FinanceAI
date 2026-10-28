import { describe, it, expect } from 'vitest';
import { deriveMilestoneIcons } from '../../services/projection/milestoneIcons';
import type { ProjectionChartPoint } from '../../services/projection/types';

// [FUTUR-ICONS-RICH] Jalons dérivés des champs chartData (présentation pure). Détections one-time
// (RRQ/PSV/1er retrait REER-CELI/locatif). JAMAIS retraite/FIRE/impôt (émis par le moteur → anti-doublon).

const pt = (o: Partial<ProjectionChartPoint> & { monthIndex: number }): ProjectionChartPoint =>
    ({ NetWorth: 100_000, year: 2030, age: 60, dateLabel: '2030-01', ...o } as ProjectionChartPoint);

const labels = (arr: { label: string }[]) => arr.map((m) => m.label);

describe('[FUTUR-ICONS-RICH] deriveMilestoneIcons', () => {
    it('détecte UNE SEULE occurrence par transition même si le champ oscille', () => {
        const cd = [
            pt({ monthIndex: 0 }),
            pt({ monthIndex: 1, pensionRRQ: 1200 }),   // 1re RRQ
            pt({ monthIndex: 2, pensionRRQ: 0 }),       // retombe à 0
            pt({ monthIndex: 3, pensionRRQ: 1200 }),   // re-positif → PAS un 2e jalon
        ];
        const ms = deriveMilestoneIcons(cd);
        expect(labels(ms).filter((l) => l.includes('RRQ'))).toEqual(['🏛️ Début RRQ']);
        expect(ms[0].monthIndex).toBe(1);
        expect(ms[0].val).toBe(100_000); // sur la courbe (NetWorth)
        expect(ms[0].kind).toBe('life');
    });

    it('retraits REER/CELI + PSV : 1er mois positif chacun', () => {
        const cd = [
            pt({ monthIndex: 0 }),
            pt({ monthIndex: 12, RetraitREER: 2000, pensionPSV: 700 }),
            pt({ monthIndex: 24, RetraitCELI: 500 }),
        ];
        expect(labels(deriveMilestoneIcons(cd))).toEqual(
            expect.arrayContaining(['📤 1er retrait REER', '🏛️ Début PSV', '📤 1er retrait CELI']),
        );
    });

    it('[garde déjà-actif] un flux DÉJÀ actif au mois 0 → aucun jalon « début/1er » (RRQ, REER, locatif…)', () => {
        // Un déjà-retraité (RRQ + retrait REER + locatif dès le mois 0) ne doit PAS voir « 1er retrait » au mois 0.
        const cd = [
            pt({ monthIndex: 0, pensionRRQ: 1300, RetraitREER: 2500, RentalIncome: 1500 }),
            pt({ monthIndex: 12, pensionRRQ: 1300, RetraitREER: 2500 }),
        ];
        expect(deriveMilestoneIcons(cd)).toHaveLength(0);
    });

    it('revenu locatif qui DÉMARRE plus tard → jalon au 1er mois positif', () => {
        const cd = [pt({ monthIndex: 0, RentalIncome: 0 }), pt({ monthIndex: 36, RentalIncome: 1500 })];
        const ms = deriveMilestoneIcons(cd).filter((l) => l.label.includes('locatif'));
        expect(ms).toHaveLength(1);
        expect(ms[0].monthIndex).toBe(36);
    });

    it('ne dérive JAMAIS retraite, FIRE ni IMPÔT (anti-doublon structurel — le moteur les émet)', () => {
        const cd = [pt({ monthIndex: 0 }), pt({ monthIndex: 6, isRetired: true, pensionRRQ: 1000, FluxImpots: -5000 })];
        expect(labels(deriveMilestoneIcons(cd)).some((l) => /retraite|fire|impôt/i.test(l))).toBe(false);
    });

    it('ignore le passé reconstruit (monthIndex < 0)', () => {
        const cd = [pt({ monthIndex: -2, pensionRRQ: 1000 }), pt({ monthIndex: 0 })];
        expect(deriveMilestoneIcons(cd)).toHaveLength(0);
    });

    it('[non-vacuité] un persona retraité produit RRQ + 1er retrait (le module SERT à qqch)', () => {
        const cd = [
            pt({ monthIndex: 0 }),
            pt({ monthIndex: 60, isRetired: true, pensionRRQ: 1300, RetraitREER: 2500 }),
        ];
        expect(labels(deriveMilestoneIcons(cd))).toEqual(
            expect.arrayContaining(['🏛️ Début RRQ', '📤 1er retrait REER']),
        );
    });

    it('chartData vide → aucun jalon', () => {
        expect(deriveMilestoneIcons([])).toEqual([]);
    });
});
