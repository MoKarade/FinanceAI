import { describe, it, expect } from 'vitest';
import { deriveMilestoneIcons } from '../../services/projection/milestoneIcons';
import type { ProjectionChartPoint } from '../../services/projection/types';

// [FUTUR-ICONS-RICH] Jalons dérivés des champs chartData (présentation pure). Détections one-time
// (RRQ/PSV/retraits/locatif) + récurrente (impôt). Jamais retraite/FIRE (émis par le moteur).

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
        const { lifeMilestones } = deriveMilestoneIcons(cd);
        expect(labels(lifeMilestones).filter((l) => l.includes('RRQ'))).toEqual(['🏛️ Début RRQ']);
        expect(lifeMilestones[0].monthIndex).toBe(1);
        expect(lifeMilestones[0].val).toBe(100_000); // sur la courbe (NetWorth)
    });

    it('retraits REER/CELI + PSV : 1er mois positif chacun', () => {
        const cd = [
            pt({ monthIndex: 0 }),
            pt({ monthIndex: 12, RetraitREER: 2000, pensionPSV: 700 }),
            pt({ monthIndex: 24, RetraitCELI: 500 }),
        ];
        const { lifeMilestones } = deriveMilestoneIcons(cd);
        expect(labels(lifeMilestones)).toEqual(
            expect.arrayContaining(['📤 1er retrait REER', '🏛️ Début PSV', '📤 1er retrait CELI']),
        );
    });

    it('revenu locatif DÉJÀ actif au mois 0 → aucun jalon (finding architect)', () => {
        const cd = [pt({ monthIndex: 0, RentalIncome: 1500 }), pt({ monthIndex: 12, RentalIncome: 1600 })];
        expect(labels(deriveMilestoneIcons(cd).lifeMilestones).some((l) => l.includes('locatif'))).toBe(false);
    });

    it('revenu locatif qui DÉMARRE plus tard → jalon au 1er mois positif', () => {
        const cd = [pt({ monthIndex: 0, RentalIncome: 0 }), pt({ monthIndex: 36, RentalIncome: 1500 })];
        const ms = deriveMilestoneIcons(cd).lifeMilestones.filter((l) => l.label.includes('locatif'));
        expect(ms).toHaveLength(1);
        expect(ms[0].monthIndex).toBe(36);
    });

    it('impôt : une pastille flow par mois où |FluxImpots| dépasse le seuil (~1/an, avril)', () => {
        const cd = [
            pt({ monthIndex: 3, FluxImpots: -1200 }),  // remboursement avril an 1
            pt({ monthIndex: 4, FluxImpots: 0.2 }),     // sous le seuil → ignoré
            pt({ monthIndex: 15, FluxImpots: 3400 }),  // solde à payer avril an 2
        ];
        const { flowMilestones } = deriveMilestoneIcons(cd);
        expect(flowMilestones).toHaveLength(2);
        expect(flowMilestones.every((m) => m.label === '💸 Règlement d\'impôt')).toBe(true);
        expect(flowMilestones.map((m) => m.monthIndex)).toEqual([3, 15]);
    });

    it('ne dérive JAMAIS retraite ni FIRE (anti-doublon structurel)', () => {
        const cd = [pt({ monthIndex: 0, isRetired: true, pensionRRQ: 1000, FluxImpots: -500 })];
        const all = [...deriveMilestoneIcons(cd).lifeMilestones, ...deriveMilestoneIcons(cd).flowMilestones];
        expect(labels(all).some((l) => /retraite|fire/i.test(l))).toBe(false);
    });

    it('ignore le passé reconstruit (monthIndex < 0)', () => {
        const cd = [pt({ monthIndex: -2, pensionRRQ: 1000 }), pt({ monthIndex: 0 })];
        expect(deriveMilestoneIcons(cd).lifeMilestones).toHaveLength(0);
    });

    it('[non-vacuité] un persona retraité produit RRQ + retrait + impôt (le module SERT à qqch)', () => {
        const cd = [
            pt({ monthIndex: 0 }),
            pt({ monthIndex: 60, isRetired: true, pensionRRQ: 1300, RetraitREER: 2500 }),
            pt({ monthIndex: 63, FluxImpots: -800 }),
        ];
        const { lifeMilestones, flowMilestones } = deriveMilestoneIcons(cd);
        expect(labels(lifeMilestones)).toEqual(expect.arrayContaining(['🏛️ Début RRQ', '📤 1er retrait REER']));
        expect(flowMilestones.length).toBeGreaterThanOrEqual(1);
    });

    it('chartData vide → aucun jalon', () => {
        expect(deriveMilestoneIcons([])).toEqual({ lifeMilestones: [], flowMilestones: [] });
    });
});
