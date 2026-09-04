// [GODFILE-REALESTATE-CMP] (lot 153) — preuve de CÂBLAGE : le workspace consomme bien le module
// extrait, avec les paramètres du bien affiché, et rend ce que le module RETOURNE. On OBSERVE
// par espion (vi.mock qui enveloppe le vrai module) — jamais en reconstruisant le calcul dans le
// test (leçon « le test écrit pour fermer un trou peut re-commettre le trou »). L'attendu du DOM
// vient du RÉSULTAT capturé par l'espion, pas d'une seconde exécution du calcul.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RealEstate } from '../../../components/RealEstate';
import { formatCAD } from '../../../utils/format';
import * as calculs from '../../../components/realestate/calculsImmoLocaux';
import type { RealEstateGoal } from '../../../types';

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, AreaChart: P,
        Area: () => null, Legend: () => null,
        XAxis: () => null, YAxis: () => null, Tooltip: () => null,
    };
});

vi.mock('../../../components/realestate/calculsImmoLocaux', async () => {
    const reel = await vi.importActual<typeof calculs>('../../../components/realestate/calculsImmoLocaux');
    return {
        ...reel,
        construireAmortissement: vi.fn(reel.construireAmortissement),
        construireComparaisonScenarios: vi.fn(reel.construireComparaisonScenarios),
    };
});

const bien: RealEstateGoal = {
    id: 'owned',
    name: 'Maison Détenue 2019',
    isActive: true,
    purchaseDate: '2019-06-01',
    price: 400_000,
    downPayment: 80_000,
    mortgageRate: 4,
    amortization: 25,
    totalClosingCosts: 0,
    monthlyPayment: 0,
    unrecoverableMonthly: 0,
    isPrimaryResidence: true,
};

describe('[GODFILE-REALESTATE-CMP] câblage workspace → calculsImmoLocaux', () => {
    it('le workspace appelle le module avec les paramètres du bien et rend son résultat', () => {
        render(<RealEstate availableCash={50_000} goals={[bien]} setGoals={vi.fn()} />);

        const spyAmort = vi.mocked(calculs.construireAmortissement);
        expect(spyAmort).toHaveBeenCalled();
        const args = spyAmort.mock.calls[0][0];
        expect(args.price).toBe(400_000);
        expect(args.totalMortgage).toBe(320_000);
        expect(args.amortization).toBe(25);
        expect(args.targetDate).toBe('2019-06-01');

        // Le DOM porte ce que le module a RETOURNÉ (KPI « Valeur à terme ») — attendu composé
        // avec le formateur depuis le résultat CAPTURÉ, pas recalculé ici. ⚠️ Le normaliseur de
        // testing-library ramène les insécables de formatCAD à des espaces ORDINAIRES côté DOM,
        // mais ne touche PAS la chaîne attendue : on la normalise donc pareil, sinon l'assertion
        // est fausse sur un rendu correct (miroir de la leçon sur l'insécable).
        const resultat = spyAmort.mock.results[0]?.value as calculs.ResultatAmortissement;
        expect(resultat.data.length).toBe(25);
        const attendu = formatCAD(resultat.finalValue).replace(/\s/g, ' ');
        expect(screen.getAllByText(attendu).length).toBeGreaterThan(0);

        // La comparaison de scénarios reçoit la table d'amortissement du MÊME appel.
        const spyScen = vi.mocked(calculs.construireComparaisonScenarios);
        expect(spyScen).toHaveBeenCalled();
        expect(spyScen.mock.calls[0][0].amortissement).toBe(resultat.data);
    });
});
