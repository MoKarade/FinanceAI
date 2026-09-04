// [BUDGET-SPLIT-5050-RATIO-1] Le mode « 50 / 50 » du sélecteur des réglages n'avait AUCUNE
// branche dans coupleAnalysis : ratio1 restait à 1 → 100 % des dépenses communes au conjoint 1,
// 0 % au conjoint 2 — toute la carte couple mentait dans ce mode (bug préexistant découvert au
// lot 120 par la dérivation MANUELLE des attendus ; les six personas de test sont à '50/50').
//
// Attendus dérivés À LA MAIN (jamais recopiés du code) : nets 5 000/4 000, commun 1 500 $.
//   50/50  → chacun porte 750 $  → Effort Marc 15 %, Anna 18,75 % → « 19% ».
//   custom 70 → Marc 1 050 $ (21 %), Anna 450 $ (11,25 % → « 11% ») — contrôle : la branche
//   custom, elle, marchait déjà ; elle ne doit pas bouger.
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Budget } from '../../components/Budget';
import type { BudgetConfig, BudgetCategory, User } from '../../types';

vi.mock('recharts', async () => {
    const React = await import('react');
    const Passthrough = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: Passthrough, PieChart: Passthrough, Pie: () => null, Cell: () => null,
        Tooltip: () => null, Legend: () => null, BarChart: Passthrough, Bar: () => null,
        XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, ReferenceLine: () => null,
        LineChart: Passthrough, Line: () => null,
    };
});

const config = (over: Partial<BudgetConfig> = {}): BudgetConfig => ({
    users: [
        { name: 'Marc', grossSalary: 7000, netSalary: 5000 } as unknown as User,
        { name: 'Anna', grossSalary: 5500, netSalary: 4000 } as unknown as User,
    ],
    splitMode: '50/50',
    ...over,
} as BudgetConfig);

const items: BudgetCategory[] = [
    { id: 'c1', name: 'Loyer', target: 1500, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' } as BudgetCategory,
];

const rendu = (c: BudgetConfig) => {
    const { container } = render(
        <Budget transactions={[]} config={c} budgetItems={items} setBudgetItems={() => {}} apiKey="" />,
    );
    return (container.textContent ?? '').replace(/\s+/g, ' ');
};

describe('[BUDGET-SPLIT-5050-RATIO-1] le mode 50/50 partage vraiment en deux', () => {
    it('50/50 : chaque conjoint porte la MOITIÉ du commun (Effort 15 % / 19 %, dérivé à la main)', () => {
        const t = rendu(config());
        expect(t).toContain('Effort: 15%');
        expect(t).toContain('Effort: 19%');
        // Le symptôme historique, en toutes lettres : plus jamais 30 %/0 % sur cette fixture.
        expect(t).not.toContain('Effort: 30%');
        expect(t).not.toContain('Effort: 0%');
    });

    it('contrôle : le mode custom (70 %) n\'a pas bougé — sa branche marchait déjà', () => {
        const t = rendu(config({ splitMode: 'custom', customSplit: 70 } as Partial<BudgetConfig>));
        expect(t).toContain('Effort: 21%');
        expect(t).toContain('Effort: 11%');
    });

    it('solo (user2 sans nom) : 50/50 ne change rien — le solo porte toujours 100 %', () => {
        const c = config();
        (c.users[1] as User).name = '';
        const t = rendu(c);
        // 1 500 / 5 000 = 30 % pour l'unique utilisateur — la carte couple n'existe pas, mais le
        // ratio1 = 1 du solo ne doit pas être avalé par la nouvelle branche.
        expect(t).not.toContain('du Couple');
    });
});
