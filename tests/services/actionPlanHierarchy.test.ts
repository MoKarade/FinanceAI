import { describe, it, expect } from 'vitest';
import { buildRootBucket, getChildBuckets, type PlanBucket } from '../../services/projection/actionPlanHierarchy';

// chartData synthétique : N mois, flux net CELI +500/mois, REER -100/mois (retrait).
// year = 2026 + floor(monthIndex/12). NetWorth croissant.
const makePoints = (months: number, opts: { startPast?: number } = {}) => {
    const pts = [];
    const past = opts.startPast ?? 0;
    for (let i = -past; i < months; i++) {
        const monthOfYear = ((i % 12) + 12) % 12;
        pts.push({
            monthIndex: i,
            year: 2026 + Math.floor(i / 12),
            age: 40 + Math.floor(i / 12),
            isRetired: false,
            dateLabel: `m${monthOfYear} ${2026 + Math.floor(i / 12)}`,
            NetWorth: 100_000 + i * 1000,
            NetTransferCELI: 500,
            NetTransferREER: -100,
        });
    }
    return pts;
};

const child = (data: Record<string, unknown>[], parent: PlanBucket, label?: string): PlanBucket => {
    const kids = getChildBuckets(data, parent);
    return label ? kids.find((k) => k.label.includes(label)) ?? kids[0] : kids[0];
};

describe('actionPlanHierarchy', () => {
    it('bucket racine global couvre tout l\'horizon futur', () => {
        const data = makePoints(24);
        const root = buildRootBucket(data)!;
        expect(root.level).toBe('global');
        expect(root.monthCount).toBe(24);
        expect(root.startYear).toBe(2026);
        expect(root.endYear).toBe(2027);
        expect(root.flows.CELI).toBe(500 * 24);
        expect(root.flows.REER).toBe(-100 * 24);
        expect(root.deposited).toBe(12_000);
        expect(root.withdrawn).toBe(2_400);
        expect(root.hasChildren).toBe(true);
    });

    it('ignore le passé réel (monthIndex < 0)', () => {
        const data = makePoints(12, { startPast: 6 });
        const root = buildRootBucket(data)!;
        expect(root.monthCount).toBe(12); // 6 mois passés exclus
        expect(root.startMonthIndex).toBe(0);
    });

    it('liste vide → racine null', () => {
        expect(buildRootBucket([])).toBeNull();
    });

    it('drill complet : global → décennie → 3 ans → année → semestre → trimestre → mois', () => {
        const data = makePoints(24);
        const root = buildRootBucket(data)!;

        const decade = child(data, root);
        expect(decade.level).toBe('decade');
        expect(decade.monthCount).toBe(24); // < 120 → une seule décennie

        const triennium = child(data, decade);
        expect(triennium.level).toBe('triennium');
        expect(triennium.monthCount).toBe(24); // < 36 → un seul bloc

        const years = getChildBuckets(data, triennium);
        expect(years).toHaveLength(2); // 2026, 2027
        expect(years[0].level).toBe('year');
        expect(years[0].flows.CELI).toBe(6_000);
        expect(years[0].flows.REER).toBe(-1_200);

        const semesters = getChildBuckets(data, years[0]);
        expect(semesters).toHaveLength(2); // 12 mois → 2 semestres de 6
        expect(semesters[0].flows.CELI).toBe(3_000);

        const quarters = getChildBuckets(data, semesters[0]);
        expect(quarters).toHaveLength(2); // 6 mois → 2 trimestres de 3
        expect(quarters[0].flows.CELI).toBe(1_500);

        const monthsB = getChildBuckets(data, quarters[0]);
        expect(monthsB).toHaveLength(3);
        expect(monthsB[0].level).toBe('month');
        expect(monthsB[0].flows.CELI).toBe(500);
        expect(monthsB[0].hasChildren).toBe(false);
        expect(getChildBuckets(data, monthsB[0])).toHaveLength(0); // feuille
    });

    it('conseils : reflètent les flux réels (cotisation CELI + retrait REER)', () => {
        const data = makePoints(12);
        const root = buildRootBucket(data)!;
        const adviceText = root.advice.join(' | ');
        expect(adviceText).toMatch(/Cotise.*CELI/i);
        expect(adviceText).toMatch(/Retire.*REER/i);
    });

    it('découpe une décennie en blocs de 3 ans', () => {
        const data = makePoints(120); // 10 ans pile
        const root = buildRootBucket(data)!;
        const decade = child(data, root);
        const trienniums = getChildBuckets(data, decade);
        // 120 mois / 36 = 4 blocs (36+36+36+12)
        expect(trienniums).toHaveLength(4);
        expect(trienniums[0].monthCount).toBe(36);
        expect(trienniums[3].monthCount).toBe(12);
    });
});
