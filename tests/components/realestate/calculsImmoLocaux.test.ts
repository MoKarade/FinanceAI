// [GODFILE-REALESTATE-CMP] (lot 153) — les deux calculs d'écran extraits de
// RealEstateWorkspace.tsx. Extraction VERBATIM : ces tests épinglent les RELATIONS du calcul
// (jamais des montants en dollars, qui se re-baseraient à la première hypothèse changée) —
// c'est la garde d'équivalence qui manquait au monolithe, où aucun test ne lisait ces valeurs.
import { describe, it, expect } from 'vitest';
import {
    construireAmortissement,
    construireComparaisonScenarios,
    type ParamsAmortissement,
} from '../../../components/realestate/calculsImmoLocaux';

const base: ParamsAmortissement = {
    totalMortgage: 320_000,
    rate: 4.5,
    renewalRate: 6.0, // ≠ rate, sinon le renouvellement est invisible (fixture qui coïncide)
    monthlyMortgage: (() => {
        const r = 4.5 / 100 / 12;
        const n = 25 * 12;
        const f = Math.pow(1 + r, n);
        return (r * 320_000 * f) / (f - 1);
    })(),
    amortization: 25,
    price: 400_000,
    propertyGrowthRate: 3,
    initialRenovations: 10_000,
    maxValue: 0,
    targetDate: '2020-06-01',
    yearlyRenovations: 2_000,
};

describe('construireAmortissement — relations de la table locale', () => {
    const res = construireAmortissement(base);

    it('rend une ligne par année d\'amortissement, et le solde meurt à la dernière', () => {
        expect(res.data).toHaveLength(base.amortization);
        // Le renouvellement à 6 % recalcule la mensualité sur le solde restant : la dette
        // s'éteint quand même au terme (c'est le contrat d'un amortissement).
        expect(res.data[base.amortization - 1].Solde).toBe(0);
    });

    it('le solde est strictement décroissant tant qu\'il est positif', () => {
        for (let i = 1; i < res.data.length; i++) {
            if (res.data[i - 1].Solde > 0) {
                expect(res.data[i].Solde).toBeLessThan(res.data[i - 1].Solde);
            }
        }
    });

    it('Équité = Valeur − Solde (à l\'arrondi près), sur chaque ligne', () => {
        for (const row of res.data) {
            expect(Math.abs(row.Équité - (row.ValeuréPropriété - row.Solde))).toBeLessThanOrEqual(1);
        }
    });

    it('le renouvellement quinquennal change le taux affiché (année 6, jamais avant)', () => {
        // (year − 1) % 5 === 0 et year > 1 ⇒ premier renouvellement à year = 6.
        expect(res.data[0].TauxEnVigueur).toBe('4.5%');
        expect(res.data[4].TauxEnVigueur).toBe('4.5%');
        expect(res.data[5].TauxEnVigueur).toBe('6.0%');
    });

    it('la valeur du bien reste (prix + rénos initiales) × croissance — jamais le principal', () => {
        // Perturbation naturelle de UNE-MESURE-AVANT-APRES-PAR-RACCOURCI-DE-PARAMETRE : si un
        // refactor faisait dépendre la valeur du bien du financement, cette relation rougit.
        const attendu = (base.price + base.initialRenovations)
            * Math.pow(1 + base.propertyGrowthRate / 100, base.amortization);
        expect(res.finalValue).toBeCloseTo(attendu, 4);
        expect(res.data[0].ValeuréPropriété).toBe(
            Math.round((base.price + base.initialRenovations) * (1 + base.propertyGrowthRate / 100)));
    });

    it('l\'année calendrier part de la date d\'achat', () => {
        expect(res.data[0].calendarYear).toBe(2021);
    });

    it('maxValue plafonne la valeur du bien (et l\'équité avec elle)', () => {
        const plafonne = construireAmortissement({ ...base, maxValue: 450_000 });
        expect(Math.max(...plafonne.data.map(r => r.ValeuréPropriété))).toBeLessThanOrEqual(450_000);
        // Contrôle négatif : sans plafond, la valeur dépasse 450 k$ (sinon le cas ne teste rien).
        expect(Math.max(...res.data.map(r => r.ValeuréPropriété))).toBeGreaterThan(450_000);
    });
});

describe('construireComparaisonScenarios — relations des quatre scénarios', () => {
    const amort = construireAmortissement(base);
    const params = {
        amortization: base.amortization,
        totalCashNeeded: 100_000,
        currentRent: 1_600,
        netMonthlyCost: 2_200,
        maintenanceMonthly: 333,
        marketReturn: 7,
        price: base.price,
        localRentalAppreciation: 3,
        localStockReturn: 7,
        netAnnualIncome: 5_000,
        amortissement: amort.data,
    };
    const rows = construireComparaisonScenarios(params);

    it('une ligne par année, « Acheter » suit l\'équité de la table d\'amortissement', () => {
        expect(rows).toHaveLength(base.amortization);
        rows.forEach((r, i) => {
            expect(r['Acheter (Résidence)']).toBe(Math.round(amort.data[i].Équité));
        });
    });

    it('« Bourse » et « Valeur Propriété » sont des capitalisations pures de leurs bases', () => {
        rows.forEach((r, i) => {
            const yr = i + 1;
            expect(r['Bourse (Placer Cash Initial)'])
                .toBe(Math.round(params.totalCashNeeded * Math.pow(1.07, yr)));
            expect(r['Valeur Propriété'])
                .toBe(Math.round(params.price * Math.pow(1.03, yr)));
        });
    });

    it('« Louer + Investir » croît d\'une année à l\'autre (rendement positif + surplus investi)', () => {
        for (let i = 1; i < rows.length; i++) {
            expect(rows[i]['Louer + Investir Reste']).toBeGreaterThan(rows[i - 1]['Louer + Investir Reste']);
        }
    });

    it('le levier « rendement boursier » change le scénario Louer (anti-vacuité)', () => {
        const plusHaut = construireComparaisonScenarios({ ...params, marketReturn: 10 });
        expect(plusHaut[10]['Louer + Investir Reste']).toBeGreaterThan(rows[10]['Louer + Investir Reste']);
    });
});
