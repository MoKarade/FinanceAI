// [BUDGET-EFFORT-NOMMER-LA-BASE] Décision de Marc (2026-09-03) : le badge « Effort » garde la
// paie déclarée comme dénominateur et NOMME sa base. Le « Revenu Net Disponible » affiché plus
// haut dans la même carte est un calcul fiscal sur le brut : un pourcentage calculé sur une autre
// base que le montant affiché juste au-dessus se signale, sinon il se lit comme s'il portait sur
// lui (`UN-CHIFFRE-QUI-SERT-DE-DENOMINATEUR-N-EST-PAS-UN-CHIFFRE-AFFICHE` : l'écart entre les
// deux bases change de SIGNE selon la paire brut/net saisie, −0,3 % à +3,5 % mesuré).
//
// « Aucun chiffre ne bouge » fait partie de la décision : le pourcentage attendu est dérivé À LA
// MAIN de la fixture (jamais recopié du code — un test qui contient l'expression du code testé
// teste sa copie).
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

// Nets ASYMÉTRIQUES (5 000 / 4 000) + une dépense PERSO 2 : au prorata, l'effort sur le commun
// seul est IDENTIQUE pour les deux conjoints par construction (commun/totalNet) — sans le poste
// perso, les deux badges porteraient le même pourcentage et une inversion user1/user2 serait
// invisible.
// ⚠️ `splitMode: 'prorata'` et pas '50/50' : le mode 50/50 a un défaut PRÉEXISTANT (aucune branche
// de coupleAnalysis ne le traite, ratio1 reste 1 → tout le commun va au conjoint 1) — routé au
// BACKLOG sous [BUDGET-SPLIT-5050-RATIO-1], hors périmètre de ce lot.
const config: BudgetConfig = {
    users: [
        { name: 'Marc', grossSalary: 7000, netSalary: 5000 } as unknown as User,
        { name: 'Anna', grossSalary: 5500, netSalary: 4000 } as unknown as User,
    ],
    splitMode: 'prorata',
};
// Dérivé à la main (jamais recopié du code) : ratio1 = 5000/9000. Marc porte 1500 × 5/9 = 833,33 $
// → 833,33/5000 = 16,7 % → « 17% ». Anna porte 1500 × 4/9 = 666,67 $ + 400 $ perso = 1 066,67 $
// → 1066,67/4000 = 26,7 % → « 27% ».
const items: BudgetCategory[] = [
    { id: 'c1', name: 'Loyer', target: 1500, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' } as BudgetCategory,
    { id: 'c2', name: 'Gym Anna', target: 400, frequency: 'Monthly', type: 'Perso 2', nature: 'Envie' } as BudgetCategory,
];

const renderBudget = () => render(
    <Budget transactions={[]} config={config} budgetItems={items} setBudgetItems={() => {}} apiKey="" />,
);

describe('[BUDGET-EFFORT-NOMMER-LA-BASE] le badge Effort nomme sa base', () => {
    it('chaque badge porte son pourcentage (dérivé à la main) ET la mention « de la paie déclarée »', () => {
        const { container } = renderBudget();
        const texte = (container.textContent ?? '').replace(/\s+/g, ' ');
        // La mention est COLLÉE au pourcentage — pas quelque part ailleurs sur la page.
        expect(texte).toContain('Effort: 17% de la paie déclarée');
        expect(texte).toContain('Effort: 27% de la paie déclarée');
    });

    it('la mention apparaît EXACTEMENT deux fois — une par conjoint, pas du décor répété', () => {
        // Une mention d'avertissement répétée devient du décor qu'on cesse de lire : son compte
        // s'asserte (même règle que la mention « estimée » du TaxCenter).
        const { container } = renderBudget();
        const n = (container.textContent ?? '').split('de la paie déclarée').length - 1;
        expect(n).toBe(2);
    });

    it('l\'infobulle explique la DISTINCTION avec le « Revenu Net Disponible » affiché au-dessus', () => {
        const { container } = renderBudget();
        const badges = [...container.querySelectorAll('[title]')]
            .filter((el) => (el.getAttribute('title') ?? '').includes('paie déclarée'));
        expect(badges.length).toBe(2);
        for (const b of badges) {
            expect(b.getAttribute('title')).toContain('Revenu Net Disponible');
        }
    });
});
