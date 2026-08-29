// [A11Y-REBALANCE-CIBLES] Trois défauts d'accessibilité du bloc « Rééquilibrage », PRÉ-EXISTANTS
// depuis le 2026-07-31 et routés par le panel du lot 35.
//
// Ils ont en commun d'être des oublis LOCAUX, pas des conventions manquantes : le dépôt applique
// déjà les trois patrons ailleurs — `role="status"` quelques lignes plus haut dans la MÊME
// fonction (`justificationsError`), et `aria-pressed` quatre fois dans ce même fichier. C'est la
// classe `PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`, celle où le risque était connu, traité une fois,
// et le site d'à côté oublié.
//
// ⚠️ Ce que ce fichier NE teste pas : le contraste et le mouvement. `animate-pulse` est neutralisé
// par la règle globale `@media (prefers-reduced-motion: reduce)` d'`index.css` — vérifié, il n'y
// avait rien à corriger de ce côté, et l'affirmer ici en dupliquerait la garde.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

const proj = {
    years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
} as unknown as ProjectionConfig;
const config: BudgetConfig = {
    users: [
        { name: 'Marc', grossSalary: 7000, netSalary: 5000, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false } as unknown as User,
        { name: 'Anna', grossSalary: 5500, netSalary: 4000, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false } as unknown as User,
    ],
    splitMode: '50/50',
};
const assets = [
    { id: 'a1', symbol: 'XEQT', name: 'XEQT', sector: 'Index', region: 'world', accountType: 'CELI', currency: 'CAD', quantity: 10, currentPrice: 100, buyPrice: 90, dateBought: '2025-01-01', priceHistory: [] },
] as unknown as Asset[];

const monter = () => {
    render(
        <Investments assets={assets} setAssets={vi.fn()}
            investmentAccounts={[]} setInvestmentAccounts={vi.fn()}
            investmentTransactions={[]} setInvestmentTransactions={vi.fn()}
            apiKey="" transactions={[]} budgetItems={[]}
            config={config} projection={proj} setProjection={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Allocation/i }));
    return screen.getByRole('button', { name: /Modifier Cibles/ });
};

describe('[A11Y-REBALANCE-CIBLES] le bloc Rééquilibrage', () => {
    it('donne à chaque champ de cible un nom accessible DISTINCT (SC 2.4.6)', () => {
        fireEvent.click(monter());
        const noms = (screen.getAllByLabelText(/^Allocation cible pour /) as HTMLInputElement[])
            .map(i => i.getAttribute('aria-label'));
        // Anti-vacuité : on regarde bien les cinq champs du modèle, pas un sous-ensemble.
        expect(noms).toHaveLength(5);
        // Le cœur du finding : cinq noms IDENTIQUES rendaient les champs indistinguables en mode
        // formulaire. Un `Set` de taille 5 est la seule formulation qui rougisse sur ce défaut —
        // vérifier la simple PRÉSENCE d'un nom passait déjà avant.
        expect(new Set(noms).size).toBe(5);
        // Et le nom doit porter le secteur, pas un numéro d'ordre : c'est ce que l'utilisateur entend.
        expect(noms).toContain('Allocation cible pour Technologie (pourcentage)');
    });

    it('annonce l\'alerte du total aux lecteurs d\'écran (SC 4.1.3)', () => {
        const bascule = monter();
        fireEvent.click(bascule);
        // ⚠️ L'écran porte d'AUTRES `role="status"` : chercher le rôle seul rendrait « plusieurs
        // éléments trouvés ». On filtre donc les régions annoncées par leur texte — ce qui teste
        // bien la même chose, puisqu'un `div` sans rôle n'entre jamais dans cette liste.
        const alerteDuTotal = () => screen.getAllByRole('status')
            .find(el => /total des cibles doit être de 100%/.test(el.textContent ?? ''));

        // Le modèle par défaut somme à 100 : pas d'alerte tant qu'on n'a rien cassé.
        expect(alerteDuTotal()).toBeUndefined();

        // ⚠️ Mais le CONTENEUR, lui, doit déjà être là — vidé, pas démonté. Un nœud portant
        // `role="status"` inséré au moment où il doit annoncer n'est pas annoncé de façon fiable,
        // et c'est précisément la PREMIÈRE transition qui compte ici. Cette assertion est ce qui
        // empêche un futur refactor de re-conditionner le montage sans rien faire rougir : sans
        // elle, la version « montée seulement quand le total est faux » passe aussi.
        const regionsAvant = screen.getAllByRole('status').length;

        const champs = screen.getAllByLabelText(/^Allocation cible pour /) as HTMLInputElement[];
        fireEvent.change(champs[0], { target: { value: '77' } });

        // Sans `role="status"`, ce texte existe à l'écran mais n'est annoncé à personne : c'est
        // exactement ce que la requête PAR RÔLE distingue d'une requête par texte.
        // Le nombre de régions annoncées n'a PAS bougé : c'est la même région, remplie.
        expect(screen.getAllByRole('status')).toHaveLength(regionsAvant);
        const alerte = alerteDuTotal();
        expect(alerte).toBeDefined();
        expect(alerte!.textContent).toMatch(/137/); // 77 + 30 + 15 + 10 + 5
    });

    it('expose l\'état de la bascule « Modifier Cibles » (SC 4.1.2)', () => {
        const bascule = monter();
        // L'état ne doit pas tenir au seul TEXTE du bouton : les deux sens sont vérifiés, sinon un
        // `aria-pressed` figé à `false` passerait.
        expect(bascule).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(bascule);
        expect(screen.getByRole('button', { name: /Terminer/ })).toHaveAttribute('aria-pressed', 'true');
    });
});
