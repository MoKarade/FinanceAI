/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectionExplains } from '../../components/projection/ProjectionExplains';
import type { ProjectionChartPoint } from '../../services/projection/types';

const months: ProjectionChartPoint[] = [
    {
        monthIndex: 0, NetWorth: 100000, year: 2026, age: 35, dateLabel: 'Jan 2026',
        CELI: 50000, ContribCELI: 500, MarketGrowthCELI: 80,
        flowEvents: ['💰 ↳ Surplus placé dans le CELI : +500 $'],
    },
    {
        monthIndex: 2, NetWorth: 90000, year: 2026, age: 35, dateLabel: 'Mar 2026',
        Liquidites: 5000,
        lifeEvents: ["🏠 Achat de la propriété : -103 135 $ (argent sorti de tes comptes)"],
    },
    {
        monthIndex: 12, NetWorth: 120000, year: 2027, age: 36, dateLabel: 'Jan 2027',
        CELI: 60000, MarketGrowthCELI: 120,
    },
];

describe('ProjectionExplains', () => {
    it('affiche un état vide sans projection', () => {
        render(<ProjectionExplains chartData={[]} />);
        expect(screen.getByText(/Lance d'abord une simulation/i)).toBeTruthy();
    });

    it('groupe par année', () => {
        render(<ProjectionExplains chartData={months} />);
        expect(screen.getByText('2026')).toBeTruthy();
        expect(screen.getByText('2027')).toBeTruthy();
    });

    it('ouvre une année pour voir les événements mensuels', () => {
        render(<ProjectionExplains chartData={months} />);
        // 2026 fermée par défaut → on l'ouvre
        fireEvent.click(screen.getByText('2026'));
        expect(screen.getByText(/Achat de la propriété/)).toBeTruthy();
    });

    it('la recherche filtre les années et compte les mois', () => {
        render(<ProjectionExplains chartData={months} />);
        const input = screen.getByLabelText(/Rechercher dans les explications/i);
        fireEvent.change(input, { target: { value: 'propriété' } });
        expect(screen.getByText(/1 mois trouvé/)).toBeTruthy();
        // 2027 ne matche pas → masquée
        expect(screen.queryByText('2027')).toBeNull();
    });

    it('affiche le détail chiffré par compte', () => {
        render(<ProjectionExplains chartData={months} />);
        fireEvent.click(screen.getByText('2026'));
        // Le mois de janvier montre CELI avec cotisation + marché
        expect(screen.getAllByText(/CELI/).length).toBeGreaterThan(0);
        expect(screen.getByText(/cotisé/)).toBeTruthy();
    });
});
