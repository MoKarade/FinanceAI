// tests/components/budgetSensibiliteRetiree.test.tsx
//
// [BUDGET-SENSIBILITE-FORMULE-5PCT] La tuile « Sensibilité » de l'onglet Budget recalculait
// localement un patrimoine long terme (valeur future d'une rente, rendement réel 5 % EN DUR), ce qui
// viole le non-négociable « Future = source unique ». Elle est SUPPRIMÉE, pas corrigée, et la mesure
// dit pourquoi le taux n'était pas le problème :
//   · la formule ne dépendait QUE de l'horizon → **145 648 $ pour les SEPT personas**, quels que
//     soient revenus, dettes, âge de retraite et fiscalité ;
//   · la vraie réponse du moteur (dépenses −100 $/mois, tout le reste égal) va de **18 495 $** à
//     **307 118 $** selon le ménage — un rapport de **16,6×** ;
//   · le rapport formule/moteur va de **0,47× à 7,88×**. Ce n'est pas un biais qu'on corrige en
//     changeant un taux, c'est la FORME qui est fausse.
// Une sensibilité identique pour tout le monde n'est pas une sensibilité. La question reste
// légitime — elle est routée en `[BUDGET-SENSIBILITE-MOTEUR]`, où le moteur y répondra vraiment.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { Budget } from '../../components/Budget';
import { getViewContext, _resetViewContextForTests, type BudgetViewDetail } from '../../services/aiChat/viewContext';
import { useFinanceStore } from '../../store/useFinanceStore';
import { stripCommentsJsx } from '../../utils/stripComments';
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

const config: BudgetConfig = {
    users: [
        { name: 'Marc', grossSalary: 7000, netSalary: 5000, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
        { name: '', grossSalary: 0, netSalary: 0, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
    ],
    splitMode: '50/50',
};
const budgetItems: BudgetCategory[] = [
    { id: 'cat1', name: 'Épicerie', target: 600, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
];
const props = { transactions: [], config, budgetItems, setBudgetItems: () => {}, apiKey: '' };

/** Projection minimale : de quoi faire APPARAÎTRE la carte « Impact à long terme ». */
const projectionVivante = () => ({
    estateNetWorth: 1234567,
    chartData: Array.from({ length: 360 }, (_, i) => ({ NetWorth: 1000 + i, year: 2026 + Math.floor(i / 12), monthIndex: i })),
});

beforeEach(() => {
    _resetViewContextForTests();
    useFinanceStore.setState({ isPrivacyMode: false, lastProjection: projectionVivante() } as never);
});

describe('[BUDGET-SENSIBILITE-FORMULE-5PCT] plus aucune sensibilité fabriquée', () => {
    it('ÉCRAN : la carte long terme est là (anti-vacuité), la tuile « Sensibilité » n\'y est plus', () => {
        render(<Budget {...props} />);
        // Anti-vacuité : sans cette assertion, un écran qui ne rendrait plus RIEN passerait le test.
        expect(screen.getByText(/Impact à long terme/)).toBeTruthy();
        expect(screen.queryByText('Sensibilité')).toBeNull();
        expect(screen.queryByText(/par \+100\$\/mois/)).toBeNull();
    });

    it('CONTEXTE IA : la carte « Sensibilité » ne part plus dans le prompt', () => {
        // Surface la plus dangereuse des deux : un chiffre faux transmis au modèle hérite de
        // l'autorité de la source unique, et le chat l'expliquera avec aplomb.
        render(<Budget {...props} />);
        const detail = getViewContext()?.detail as BudgetViewDetail | undefined;
        expect(detail?.kind).toBe('budget');
        const labels = (detail?.cards ?? []).map(c => c.label);
        expect(labels, 'anti-vacuité : la carte long terme doit toujours être publiée').toContain('Impact à long terme');
        expect(labels).not.toContain('Sensibilité');
    });

    it('SOURCE : plus aucune capitalisation locale dans l\'onglet Budget', () => {
        // ⚠️ Lecture DÉCOMMENTÉE obligatoire : le commentaire qui explique la suppression cite la
        // formule et le taux — une garde d'absence lue sur la source brute matcherait sa PROPRE
        // explication (`UNE-GARDE-ECRITE-A-COTE-DE-SON-SUJET-LIT-SON-PROPRE-COMMENTAIRE`).
        // ⚠️ `Math.pow` est un PROXY du fait défendu (« cet écran ne reprojette pas le long terme »),
        // et c'en est un fidèle : il n'y en avait qu'UNE seule occurrence dans tout le fichier, celle
        // qui est retirée. Le vrai calcul long terme vit dans le moteur et arrive par
        // `lastProjection` — c'est le non-négociable « Future = source unique ».
        const brut = readFileSync(resolve(__dirname, '../../components/Budget.tsx'), 'utf8');
        const code = stripCommentsJsx(brut);
        // Anti-vacuité du décommentage : il doit rester du VRAI code, et un jeton connu de ce fichier.
        expect(code).toContain('lastProjection');
        expect(code.replace(/\s/g, '').length).toBeGreaterThan(10000);
        expect(code).not.toContain('Math.pow');
    });
});
