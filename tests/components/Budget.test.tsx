import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import { Budget } from '../../components/Budget';
import type { BudgetConfig, BudgetCategory, User, Transaction } from '../../types';
import { formatCAD } from '../../utils/format';

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

    it('[BUDGET-MONTH-NAV] naviguer vers le mois précédent RECALCULE les dépenses RÉELLES (régression periodOffset)', () => {
        // Bug Marc 2026-07-16 : le memo `actualsMap` (dépenses réelles par poste) omettait `periodOffset`
        // dans ses deps → naviguer vers un autre mois NE recalculait pas les réels (« ça s'actualise pas »).
        // Discriminant : on scope la RÉEL de la tuile « Dépenses » (pas la prévu = moyenne passée). Sur
        // l'ancien code, la réel reste figée sur le mois courant (1000) après clic ; le fix la passe à 9999.
        const now = new Date();
        const iso = (d: Date) => d.toISOString().split('T')[0];
        const curDate = iso(new Date(now.getFullYear(), now.getMonth(), 1));       // mois courant
        const prevDate = iso(new Date(now.getFullYear(), now.getMonth() - 1, 15)); // mois précédent
        const tx = (id: string, date: string, amount: number): Transaction =>
            ({ id, date, description: 'Resto', category: 'Restaurants', amount } as unknown as Transaction);
        const transactions = [tx('c1', curDate, -1000), tx('p1', prevDate, -9999)];

        const { container, getByLabelText } = render(<Budget {...baseProps} transactions={transactions} />);

        // La RÉEL de la tuile « Dépenses » = premier montant (.text-kpi), la prévu = second (moy. passée).
        // On cible la tuile KPI via `.kpi-label` (« Dépenses » apparaît aussi ailleurs : en-tête du grand livre).
        const reelDigits = (): string => {
            const label = (Array.from(container.querySelectorAll('.kpi-label')) as HTMLElement[])
                .find((l) => (l.textContent ?? '').includes('Dépenses'));
            const tile = label!.closest('.rounded-card') as HTMLElement;
            const reel = tile.querySelector('.text-kpi') as HTMLElement;
            return (reel.textContent ?? '').replace(/[^\d]/g, '');
        };

        expect(reelDigits()).toBe('1000'); // mois courant : 1000 dépensé

        fireEvent.click(getByLabelText('Période précédente')); // periodOffset → -1

        expect(reelDigits()).toBe('9999'); // mois précédent : le memo a bien recalculé (échoue sur l'ancien code)
    });

    it('[BUDGET-3-VUES] la colonne « Moy. 12m » câble le VRAI calcul (ledger → cellule) et suit la période (×12 en Année)', () => {
        // Finding panel PR #500 : les tests de BudgetGroupTable MOCKENT getDisplayAvg → le câblage
        // réel de Budget.tsx (lookup avg12ByItem + × getMultiplier) n'était exercé par aucun test.
        const now = new Date();
        const iso = (d: Date) => d.toISOString().split('T')[0];
        const prevDate = iso(new Date(now.getFullYear(), now.getMonth() - 1, 15)); // mois précédent (1 mois plein)
        const transactions = [
            { id: 'p1', date: prevDate, description: 'Resto', category: 'Restaurants', amount: -123 } as unknown as Transaction,
        ];
        const { getByDisplayValue, getByText } = render(<Budget {...baseProps} transactions={transactions} />);

        // 1 mois plein d'historique → moyenne mensuelle = 123 $, rendue dans la LIGNE du poste.
        // NB : getByText(string) compare l'attendu BRUT au texte DOM NORMALISÉ (les espaces
        // insécables de formatCAD deviennent des espaces simples) → normaliser l'attendu pareil.
        const cad = (n: number) => formatCAD(n).replace(/[  ]/g, ' ');
        const row = () => getByDisplayValue('Restaurants').closest('tr') as HTMLElement;
        expect(within(row()).getByText(cad(123))).toBeInTheDocument();

        // Vue Année : la moyenne suit la MÊME normalisation de période que la cible (×12).
        // Échoue si le multiplicateur n'est pas appliqué à la moyenne (câblage getMultiplier).
        fireEvent.click(getByText('Année'));
        expect(within(row()).getByText(cad(123 * 12))).toBeInTheDocument();
    });

    it('[BUDGET-INCOME-REAL] Revenus = vraies transactions salaire+divers (pas les positifs non-revenu), avec ventilation', () => {
        // Bug Marc 2026-07-16 : le revenu doit venir des vraies rentrées (paie Robovic + revenus divers),
        // ventilé, et NE PAS compter un positif non-revenu (remboursement). Discriminant : l'ancien code
        // sommait TOUS les positifs → 2600 ; le fix restreint aux catégories de revenu → 2500.
        const now = new Date();
        const cur = new Date(now.getFullYear(), now.getMonth(), 3).toISOString().split('T')[0];
        const tx = (id: string, amount: number, category: string): Transaction =>
            ({ id, date: cur, payee: 'X', amount, category } as unknown as Transaction);
        const transactions = [
            tx('s1', 2000, 'Salaire'),         // paie
            tx('d1', 500, 'Revenus divers'),   // divers
            tx('r1', 100, 'Remboursement'),    // positif MAIS pas un revenu → NE doit PAS compter
            tx('e1', -300, 'Restaurants'),     // dépense
        ];
        const { container } = render(<Budget {...baseProps} transactions={transactions} />);

        const label = (Array.from(container.querySelectorAll('.kpi-label')) as HTMLElement[])
            .find((l) => (l.textContent ?? '').includes('Revenus'));
        const tile = label!.closest('.rounded-card') as HTMLElement;
        const reel = (tile.querySelector('.text-kpi') as HTMLElement).textContent?.replace(/[^\d]/g, '');
        expect(reel).toBe('2500'); // 2000 + 500, PAS 2600 (remboursement exclu)
        // Ventilation salaire / divers visible
        expect(tile.textContent).toMatch(/Salaire/);
        expect(tile.textContent).toMatch(/Divers/);
    });
});
