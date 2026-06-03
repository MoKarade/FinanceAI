/**
 * Couverture (audit) — services/projection/childCosts.ts :: getAnnualChildCost.
 *
 * Cette fonction PURE réplique la logique de tranches d'âge de ChildPlanning.tsx
 * (0 / 1-4 / 5-11 / 12-17 / 18 / 18+uni.years / 25+) et constitue la source
 * unique du coût brut par âge. Les bornes d'âge n'étaient pas testées ; ces
 * cas verrouillent les transitions critiques :
 *   - 16 ans → coût ponctuel de 500$ (ex. permis/équipement) en plus du palier 12-17,
 *   - 12-17 ans → réduction d'allocations `Math.max(0, govBenefits - 100) * 12`,
 *   - 18 ans + cadeau voiture → coût voiture (oneOff) + 1re année d'études,
 *   - bornes hautes (université, puis 25+ = plus aucun coût parental).
 *
 * Les valeurs scalaires (diapers/food/clothing) sont mises à 0 sauf mention,
 * pour isoler la logique de palier. multiplier = 1 et parentalLeaveCostYear0 = 0
 * sauf test dédié.
 */
import { describe, it, expect } from 'vitest';
import { getAnnualChildCost } from '../../services/projection/childCosts';
import {
    DAYCARE_INFO,
    SCHOOL_INFO,
    ACTIVITIES_INFO,
    UNI_INFO,
    CAR_INFO,
} from '../../services/projection/childCosts';
import type { ChildGoal } from '../../types';

function makeChild(overrides: Partial<ChildGoal> = {}): ChildGoal {
    return {
        id: 'c1',
        name: 'Enfant',
        isActive: true,
        birthDate: '2020-01-01',
        initialCost: 0,
        monthlyDiapers: 0,
        monthlyFood: 0,
        monthlyClothing: 0,
        monthlyDaycare: 0,
        governmentBenefits: 0,
        parentalLeaveIncomeDrop: 0,
        // Choix de vie = défauts documentés du module (cpe / publique / legeres /
        // uni_local / non) ; on les fixe explicitement pour des assertions stables.
        daycareType: 'cpe',
        schoolType: 'publique',
        activitiesLevel: 'legeres',
        universityType: 'uni_local',
        carGift: 'non',
        ...overrides,
    };
}

describe('getAnnualChildCost — bornes d\'âge', () => {
    it('16 ans : ajoute un coût ponctuel de 500$ (oneOff) au palier 12-17', () => {
        const r = getAnnualChildCost(makeChild({ governmentBenefits: 300 }), 16, 1, 0);
        expect(r.oneOff).toBe(500);
        // Palier 12-17 : careAndSchool = école publique (500) + activités légères (1500).
        expect(r.careAndSchool).toBe(SCHOOL_INFO.publique.yearlyExtra + ACTIVITIES_INFO.legeres.yearlyExtra);
        expect(r.careAndSchool).toBe(2000);
        // base = (food*1.2 + clothing*1.5 + 150) * 12 = 150*12 = 1800 (scalaires à 0).
        expect(r.base).toBe(1800);
    });

    it('15 ans (12-17, hors 16) : aucun coût ponctuel', () => {
        const r = getAnnualChildCost(makeChild({ governmentBenefits: 300 }), 15, 1, 0);
        expect(r.oneOff).toBe(0);
        expect(r.careAndSchool).toBe(2000);
    });

    it('12-17 ans : réduction d\'allocations = Math.max(0, govBenefits - 100) * 12', () => {
        // gov = 300 → benefits = (300 - 100) * 12 = 2400.
        const r = getAnnualChildCost(makeChild({ governmentBenefits: 300 }), 14, 1, 0);
        expect(r.benefits).toBe((300 - 100) * 12);
        expect(r.benefits).toBe(2400);
        // netTotal = base(1800) + care(2000) + 0 + 0 − 2400 = 1400.
        expect(r.netTotal).toBe(1400);
    });

    it('12-17 ans : allocation faible (< 100) → clamp à 0 (jamais négatif)', () => {
        const r = getAnnualChildCost(makeChild({ governmentBenefits: 50 }), 14, 1, 0);
        expect(r.benefits).toBe(0); // Math.max(0, 50 - 100) * 12 = 0
        expect(r.netTotal).toBe(1800 + 2000); // aucune déduction
    });

    it('18 ans + cadeau voiture neuve : coût voiture en oneOff + 1re année d\'études, benefits = 0', () => {
        const r = getAnnualChildCost(makeChild({ carGift: 'neuve', governmentBenefits: 300 }), 18, 1, 0);
        expect(r.oneOff).toBe(CAR_INFO.neuve.cost);
        expect(r.oneOff).toBe(25000);
        // uni_local : 4 ans → 1re année d'études dès 18 ans.
        expect(r.studies).toBe(UNI_INFO.uni_local.yearlyCost);
        expect(r.studies).toBe(5000);
        expect(r.benefits).toBe(0); // plus d'allocation à 18 ans
        expect(r.netTotal).toBe(25000 + 5000);
    });

    it('18 ans + voiture usagée : oneOff = 10 000$', () => {
        const r = getAnnualChildCost(makeChild({ carGift: 'usagee' }), 18, 1, 0);
        expect(r.oneOff).toBe(CAR_INFO.usagee.cost);
        expect(r.oneOff).toBe(10000);
    });

    it('18 ans sans voiture ni université : oneOff = 0, studies = 0', () => {
        const r = getAnnualChildCost(makeChild({ carGift: 'non', universityType: 'aucune' }), 18, 1, 0);
        expect(r.oneOff).toBe(0);
        expect(r.studies).toBe(0);
        expect(r.benefits).toBe(0);
        expect(r.netTotal).toBe(0);
    });

    it('année universitaire (20 ans, uni_local 4 ans) : studies = coût annuel, pas de voiture', () => {
        const r = getAnnualChildCost(makeChild({ governmentBenefits: 300 }), 20, 1, 0);
        expect(r.studies).toBe(UNI_INFO.uni_local.yearlyCost);
        expect(r.oneOff).toBe(0);
        expect(r.benefits).toBe(0);
        expect(r.netTotal).toBe(5000);
    });

    it('25 ans (après université) : plus aucun coût parental', () => {
        const r = getAnnualChildCost(makeChild({ governmentBenefits: 300 }), 25, 1, 0);
        expect(r).toMatchObject({ base: 0, careAndSchool: 0, oneOff: 0, studies: 0, benefits: 0, netTotal: 0 });
    });

    it('année 0 : base + garderie + initialCost + congé parental (oneOff)', () => {
        const child = makeChild({
            monthlyDiapers: 80, monthlyFood: 100, monthlyClothing: 50,
            initialCost: 1000, governmentBenefits: 300,
        });
        const r = getAnnualChildCost(child, 0, 1, 5000);
        // base = (80 + 100 + 50) * 12 = 2760.
        expect(r.base).toBe((80 + 100 + 50) * 12);
        // careAndSchool = garderie CPE 215 * 12 = 2580.
        expect(r.careAndSchool).toBe(DAYCARE_INFO.cpe.monthly * 12);
        // oneOff = initialCost(1000) + congé parental(5000) = 6000.
        expect(r.oneOff).toBe(6000);
        // benefits = 300 * 12 = 3600 (palier plein avant 12 ans).
        expect(r.benefits).toBe(3600);
    });

    it('parent au foyer : aucun frais de garde (careAndSchool = 0) en années garderie', () => {
        const r = getAnnualChildCost(makeChild({ daycareType: 'parent_foyer' }), 2, 1, 0);
        expect(r.careAndSchool).toBe(0);
    });

    it('expenseMultiplier applique l\'inflation aux coûts mais PAS aux allocations', () => {
        const r = getAnnualChildCost(makeChild({ governmentBenefits: 300 }), 16, 1.1, 0);
        // base 1800 * 1.1 = 1980 ; care 2000 * 1.1 = 2200 ; oneOff 500 * 1.1 = 550.
        expect(r.base).toBe(Math.round(1800 * 1.1));
        expect(r.careAndSchool).toBe(Math.round(2000 * 1.1));
        expect(r.oneOff).toBe(Math.round(500 * 1.1));
        // benefits NON inflatés : Math.max(0, 300 - 100) * 12 = 2400.
        expect(r.benefits).toBe(2400);
    });

    it('netTotal ne devient jamais négatif (allocation > coûts)', () => {
        // gov énorme à un âge à faibles coûts → déduction > coûts, mais clamp à 0.
        const r = getAnnualChildCost(makeChild({ governmentBenefits: 100000 }), 8, 1, 0);
        expect(r.netTotal).toBe(0);
    });
});
