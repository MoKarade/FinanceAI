// [INVEST-CIBLES-DEFAUT-MUTEES] Éditer une cible d'allocation réécrivait le MODÈLE PAR DÉFAUT.
//
// Variante ACTIVE de la classe du lot 34 (`[HISTORY-OBJET-VIDE-PARTAGE]`) : quand
// `projection.investmentTargetPcts` est absent, l'état des cibles était initialisé avec la
// constante de module `DEFAULT_TARGET_MODEL` TELLE QUELLE, et l'éditeur faisait `[...targetModel]`
// — un spread qui copie le TABLEAU, jamais ses ÉLÉMENTS — avant d'écrire `newModel[i].targetPct`.
// L'objet muté était donc celui du module, et les « défauts » cessaient d'être les défauts pour
// toute la session : reset de configuration, bascule de persona, import d'une autre config.
//
// ⚠️ Ce que le test observe est le CHEMIN COMPLET, jamais la constante (qui n'est pas exportée) :
// on édite, on démonte, on remonte à neuf avec les MÊMES props et un `setProjection` qui n'écrit
// nulle part. Le seul canal par lequel une valeur éditée pourrait survivre est donc la constante
// elle-même — ce qui rend l'assertion non ambiguë.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Investments } from '../../components/Investments';
import type { ProjectionConfig, BudgetConfig, User, Asset } from '../../types';

vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, PieChart: P, BarChart: P, LineChart: P, AreaChart: P, ComposedChart: P,
        Pie: () => null, Bar: () => null, Area: () => null, Line: () => null, Cell: () => null,
        Legend: () => null, ReferenceLine: () => null,
        XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
    };
});

// ⚠️ SANS `investmentTargetPcts` : c'est la branche qui rendait la constante telle quelle. Avec des
// pourcentages sauvegardés, l'initialisation passait déjà par un `.map` et ne partageait rien —
// la fixture doit donc rester sur cette branche, sinon elle n'observe pas le défaut.
const proj = {
    years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
} as unknown as ProjectionConfig;
const config: BudgetConfig = {
    // `BudgetConfig['users']` est un TUPLE de deux : un seul élément ne typecheck pas.
    users: [
        { name: 'Marc', grossSalary: 7000, netSalary: 5000, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false } as unknown as User,
        { name: 'Anna', grossSalary: 5500, netSalary: 4000, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false } as unknown as User,
    ],
    splitMode: '50/50',
};
// Un actif suffit : la section « Rééquilibrage » n'existe que si l'allocation courante est non vide.
const assets = [
    { id: 'a1', symbol: 'XEQT', name: 'XEQT', sector: 'Index', region: 'world', accountType: 'CELI', currency: 'CAD', quantity: 10, currentPrice: 100, buyPrice: 90, dateBought: '2025-01-01', priceHistory: [] },
] as unknown as Asset[];

const CIBLES_DU_MODELE = '40,30,15,10,5';

const monterEtOuvrirLEditeur = () => {
    render(
        <Investments assets={assets} setAssets={vi.fn()}
            investmentAccounts={[]} setInvestmentAccounts={vi.fn()}
            investmentTransactions={[]} setInvestmentTransactions={vi.fn()}
            apiKey="" transactions={[]} budgetItems={[]}
            config={config} projection={proj} setProjection={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Allocation/i }));
    fireEvent.click(screen.getByText('Modifier Cibles'));
    return screen.getAllByLabelText('Allocation cible (pourcentage)') as HTMLInputElement[];
};
const cibles = () => (screen.getAllByLabelText('Allocation cible (pourcentage)') as HTMLInputElement[]).map(i => i.value).join(',');

describe('[INVEST-CIBLES-DEFAUT-MUTEES] éditer une cible ne réécrit pas le modèle par défaut', () => {
    it('un remontage NEUF retrouve les cibles du modèle après une édition', () => {
        const champs = monterEtOuvrirLEditeur();
        // Anti-vacuité : on part bien du modèle, et l'édition atteint bien l'écran.
        expect(cibles()).toBe(CIBLES_DU_MODELE);
        fireEvent.change(champs[0], { target: { value: '77' } });
        expect(cibles()).toBe('77,30,15,10,5');
        cleanup();

        // Mêmes props, aucune persistance (`setProjection` est un espion qui n'écrit nulle part) :
        // le seul canal possible pour un 77 ici serait la constante de module, mutée en place.
        monterEtOuvrirLEditeur();
        expect(cibles()).toBe(CIBLES_DU_MODELE);
    });

    it('l\'édition d\'une cible ne déplace AUCUNE des autres', () => {
        const champs = monterEtOuvrirLEditeur();
        fireEvent.change(champs[2], { target: { value: '25' } });
        expect(cibles()).toBe('40,30,25,10,5');
    });
});
