// tests/components/TaxCenter.netResidual.test.tsx
//
// [ENG-NET-MODEL-RESIDUAL] Le diagnostic « écart net déclaré ↔ net du modèle » à l'écran :
//  - SOLO : la vue « all » est la SEULE vue (le sélecteur de profil n'existe qu'en couple) →
//    le diagnostic doit y être ATTEIGNABLE (classe UX-UNREACHABLE-FEATURE) ;
//  - COUPLE : par personne (vue individuelle), jamais sommé en vue globale ;
//  - population « brut déduit » ou écart sous le seuil : RIEN (pas de 0 $ décoratif).
// Le libellé sert de sélecteur ; le montant est un nœud PrivateAmount (mode discret).

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaxCenter } from '../../components/TaxCenter';
import type { BudgetConfig, User } from '../../types';

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, BarChart: P, ComposedChart: P, PieChart: P, LineChart: P,
        Bar: () => null, Area: () => null, Line: () => null, Pie: () => null, Cell: () => null,
        Legend: () => null, ReferenceLine: () => null,
        XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
    };
});

const LIBELLE = /Écart net déclaré ↔ net du modèle/;

// Brut SAISI 8 200 $/mois (98,4 k$/an — la fixture du ticket) ; net déclaré 5 000 $/mois
// (60 k$/an) contre un net modèle mesuré ≈ 67 254 $ (2026-09-04) → écart ≈ +12 %, largement
// au-dessus du seuil de 1 %. La valeur EXACTE n'est pas épinglée (elle bouge avec les barèmes) ;
// le test épingle la PRÉSENCE, la garde du seuil vit dans taxResidual.test.ts.
const userSaisiEcart = { name: 'Marc', grossSalary: 8200, netSalary: 5000, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User;
// Brut NON saisi (déduit du net) : écart nul par construction → rien à montrer.
const userDeduit = { name: 'Anna', grossSalary: 0, netSalary: 4000, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User;

const solo = (u: User): BudgetConfig => ({ users: [u], splitMode: '50/50' } as unknown as BudgetConfig);

describe('[ENG-NET-MODEL-RESIDUAL] TaxCenter — diagnostic à l\'écran', () => {
    it('SOLO brut saisi avec écart : le diagnostic est visible dans la seule vue qui existe', () => {
        render(<TaxCenter config={solo(userSaisiEcart)} assets={[]} />);
        expect(screen.getByText(LIBELLE)).toBeInTheDocument();
        // La phrase d'explication accompagne la ligne (elle dit le SENS, sans montant).
        expect(screen.getByText(/les projections encaissent le net DÉCLARÉ/)).toBeInTheDocument();
    });

    it('SOLO brut déduit : rien — pas de ligne, pas de phrase', () => {
        render(<TaxCenter config={solo(userDeduit)} assets={[]} />);
        expect(screen.queryByText(LIBELLE)).toBeNull();
        expect(screen.queryByText(/les projections encaissent le net DÉCLARÉ/)).toBeNull();
    });

    it('COUPLE : rien en vue globale (pas de somme d\'écarts), visible dans la vue du conjoint concerné', () => {
        render(<TaxCenter config={{ users: [userSaisiEcart, userDeduit], splitMode: '50/50' } as BudgetConfig} assets={[]} />);
        expect(screen.queryByText(LIBELLE)).toBeNull(); // vue « Global (Couple) » par défaut

        fireEvent.click(screen.getByRole('button', { name: 'Marc' }));
        expect(screen.getByText(LIBELLE)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Anna' }));
        expect(screen.queryByText(LIBELLE)).toBeNull(); // brut déduit → rien chez elle
    });
});
