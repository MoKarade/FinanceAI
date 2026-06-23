import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Budget } from '../../components/Budget';
import type { BudgetConfig, BudgetCategory, User } from '../../types';

// Mock recharts (jsdom n'a pas SVG dimensions)
vi.mock('recharts', async () => {
    const React = await import('react');
    const Passthrough = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: Passthrough,
        PieChart: Passthrough,
        Pie: () => null,
        Cell: () => null,
        Tooltip: () => null,
        Legend: () => null,
        BarChart: Passthrough,
        Bar: () => null,
        XAxis: () => null,
        YAxis: () => null,
        CartesianGrid: () => null,
        ReferenceLine: () => null,
        LineChart: Passthrough,
        Line: () => null,
    };
});

const defaultConfig: BudgetConfig = {
    users: [
        { name: 'Marc', grossSalary: 7000, netSalary: 5000, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
        { name: 'Anna', grossSalary: 5500, netSalary: 4000, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
    ],
    splitMode: '50/50',
};

const defaultBudget: BudgetCategory[] = [
    { id: 'cat1', name: 'Loyer', target: 1500, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
    { id: 'cat2', name: 'Restaurants', target: 200, frequency: 'Monthly', type: 'Commun', nature: 'Envie' },
    { id: 'cat3', name: 'CELI', target: 500, frequency: 'Monthly', type: 'Commun', nature: 'Epargne' },
];

const baseProps = {
    transactions: [],
    config: defaultConfig,
    budgetItems: defaultBudget,
    setBudgetItems: () => {},
    apiKey: '',
};

describe('Budget — refonte UI (Phase C3)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('se rend sans crash avec props minimales', () => {
        const { container } = render(<Budget {...baseProps} />);
        expect(container.firstChild).toBeTruthy();
    });

    it('affiche le PageHeader "Pilotage Budget"', () => {
        const { container } = render(<Budget {...baseProps} />);
        expect(container.textContent).toContain('Pilotage Budget');
    });

    it('Phase D\'.5 — affiche les 4 tuiles dual prévu/réel (Budget / Revenus / Dépenses / Restant)', () => {
        const { container } = render(<Budget {...baseProps} />);
        const text = container.textContent || '';
        expect(text).toContain('Budget');
        expect(text).toContain('Revenus');
        expect(text).toContain('Dépenses');
        expect(text).toContain('Restant');
        // Les tuiles affichent toutes le label "Réel / Prévu"
        expect(text.match(/Réel \/ Prévu/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    });

    it('affiche le badge Excédentaire/Déficitaire', () => {
        const { container } = render(<Budget {...baseProps} />);
        const text = container.textContent || '';
        // Soit l'un soit l'autre — dépend des montants
        expect(text.match(/Excédentaire|Déficitaire/)).toBeTruthy();
    });

    it('[PH4E-OWNER-EDIT] mode COUPLE (user2 nommé) : section « Santé Financière du Couple » présente', () => {
        const { container } = render(<Budget {...baseProps} />);
        expect(container.textContent || '').toContain('du Couple');
    });

    it('[PH4E-OWNER-EDIT] mode SOLO (user2 SANS nom) : section « du Couple » ABSENTE (isSolo basé sur le nom, pas length)', () => {
        // Régression : `config.users` est un tuple [User,User] → length toujours 2 → isSolo était toujours faux,
        // la section couple s'affichait en solo (et un ownerId orphelin y montrait un montant inexpliqué).
        const soloConfig: BudgetConfig = { ...defaultConfig, users: [defaultConfig.users[0], { ...defaultConfig.users[1], name: '' } as User] };
        const { container } = render(<Budget {...baseProps} config={soloConfig} />);
        const text = container.textContent || '';
        expect(text).toContain('Santé Financière'); // la carte existe (titre solo)
        expect(text).not.toContain('du Couple');     // mais pas la variante couple
    });
});
