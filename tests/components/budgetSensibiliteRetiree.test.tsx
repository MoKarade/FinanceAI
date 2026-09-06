// tests/components/budgetSensibiliteRetiree.test.tsx
//
// [BUDGET-SENSIBILITE-FORMULE-5PCT] → [BUDGET-SENSIBILITE-MOTEUR] — TEST DE LIMITE **INVERSÉ** (lot 198,
// 2026-09-06). Il garde son nom (« Retirée ») et son histoire.
//
// La tuile « Sensibilité » de l'onglet Budget recalculait localement un patrimoine long terme (valeur
// future d'une rente, rendement réel 5 % EN DUR), ce qui viole le non-négociable « Future = source
// unique ». Elle a été SUPPRIMÉE au lot 89, pas corrigée, et la mesure disait pourquoi le taux
// n'était pas le problème :
//   · la formule ne dépendait QUE de l'horizon → **145 648 $ pour les SEPT personas**, quels que
//     soient revenus, dettes, âge de retraite et fiscalité ;
//   · la vraie réponse du moteur (dépenses −100 $/mois, tout le reste égal) va de **18 495 $** à
//     **307 118 $** selon le ménage — un rapport de **16,6×** ;
//   · le rapport formule/moteur va de **0,47× à 7,88×**. Ce n'est pas un biais qu'on corrige en
//     changeant un taux, c'est la FORME qui est fausse.
// Depuis le lot 198, le MOTEUR répond (`ProjectionResult.savingsSensitivity`, second scénario BASE à
// dépenses − 100 $/mois, coût mesuré +2,5 à 4,1 %) et Budget le LIT. Ce fichier vérifie donc les
// deux sens : la sensibilité s'affiche quand le moteur l'a publiée, et JAMAIS quand il ne l'a pas
// (no-fake-data : `null` → rien, pas un 0) — et toujours aucune capitalisation locale.
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
const projectionVivante = (savingsSensitivity: { extraMonthlySavings: number; deltaEstateNetWorth: number; deltaFinalNetWorth: number } | null) => ({
    estateNetWorth: 1234567,
    savingsSensitivity,
    chartData: Array.from({ length: 360 }, (_, i) => ({ NetWorth: 1000 + i, year: 2026 + Math.floor(i / 12), monthIndex: i })),
});
const SENS = { extraMonthlySavings: 100, deltaEstateNetWorth: 87654, deltaFinalNetWorth: 65432 };
const norm = (t: string | null | undefined) => (t ?? '').replace(/&nbsp;|\u00a0|\u202f/g, ' ');

beforeEach(() => {
    _resetViewContextForTests();
});

describe('[BUDGET-SENSIBILITE-MOTEUR] la sensibilité vient du moteur, ou ne vient pas', () => {
    it('ÉCRAN : publiée par le moteur → affichée, avec le delta du moteur (pas une formule)', () => {
        useFinanceStore.setState({ isPrivacyMode: false, lastProjection: projectionVivante(SENS) } as never);
        const { container } = render(<Budget {...props} />);
        expect(screen.getByText(/Impact à long terme/)).toBeTruthy(); // anti-vacuité
        const texte = norm(container.textContent);
        expect(texte).toContain('Sensibilité');
        expect(texte).toContain('+87 654 $'); // le delta PUBLIÉ, tel quel
        expect(texte).toContain('calculé par la projection');
    });

    it('ÉCRAN : non publiée (`null`) → RIEN, jamais un 0 crédible (no-fake-data)', () => {
        useFinanceStore.setState({ isPrivacyMode: false, lastProjection: projectionVivante(null) } as never);
        const { container } = render(<Budget {...props} />);
        expect(screen.getByText(/Impact à long terme/)).toBeTruthy(); // la carte reste, la ligne non
        expect(norm(container.textContent)).not.toContain('Sensibilité');
    });

    it('MODE DISCRET : le delta est masqué', () => {
        useFinanceStore.setState({ isPrivacyMode: true, lastProjection: projectionVivante(SENS) } as never);
        const { container } = render(<Budget {...props} />);
        expect(norm(container.textContent)).not.toContain('87 654');
    });

    it('CONTEXTE IA : la carte « Sensibilité (moteur) » part avec sa provenance, et seulement si publiée', () => {
        useFinanceStore.setState({ isPrivacyMode: false, lastProjection: projectionVivante(SENS) } as never);
        render(<Budget {...props} />);
        const detail = getViewContext()?.detail as BudgetViewDetail | undefined;
        expect(detail?.kind).toBe('budget');
        const carte = (detail?.cards ?? []).find(c => c.label === 'Sensibilité (moteur)');
        expect(carte, 'carte absente alors que le moteur a publié').toBeTruthy();
        expect(norm(carte!.value)).toContain('+87 654 $');
        expect(carte!.note).toContain('lastProjection.savingsSensitivity');

        _resetViewContextForTests();
        useFinanceStore.setState({ isPrivacyMode: false, lastProjection: projectionVivante(null) } as never);
        render(<Budget {...props} />);
        const labels = ((getViewContext()?.detail as BudgetViewDetail | undefined)?.cards ?? []).map(c => c.label);
        expect(labels, 'anti-vacuité : la carte long terme doit toujours être publiée').toContain('Impact à long terme');
        expect(labels).not.toContain('Sensibilité (moteur)');
    });

    it('SOURCE : toujours aucune capitalisation locale dans l\'onglet Budget', () => {
        // ⚠️ Lecture DÉCOMMENTÉE obligatoire : le commentaire qui explique la suppression cite la
        // formule et le taux — une garde d'absence lue sur la source brute matcherait sa PROPRE
        // explication (`UNE-GARDE-ECRITE-A-COTE-DE-SON-SUJET-LIT-SON-PROPRE-COMMENTAIRE`).
        // `Math.pow` est un PROXY fidèle du fait défendu (« cet écran ne reprojette pas le long
        // terme ») : il n'y en avait qu'UNE occurrence, celle retirée au lot 89. Le vrai calcul vit
        // dans le moteur et arrive par `lastProjection` — « Future = source unique ».
        const brut = readFileSync(resolve(__dirname, '../../components/Budget.tsx'), 'utf8');
        const code = stripCommentsJsx(brut);
        expect(code).toContain('lastProjection.savingsSensitivity'); // la LECTURE, pas un recalcul
        expect(code.replace(/\s/g, '').length).toBeGreaterThan(10000);
        expect(code).not.toContain('Math.pow');
    });
});
