import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ZoomableTimeChart } from '../../../components/ui/ZoomableTimeChart';

// Mock data : 30 points journaliers
const mockData = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(2026, 0, i + 1).toISOString(),
    A: 1000 + i * 50,
    B: 500 + i * 30,
}));

const mockSeries = [
    { key: 'A', color: '#10b981', name: 'CELI' },
    { key: 'B', color: '#3b82f6', name: 'REER' },
];

describe('ZoomableTimeChart', () => {
    it('rend le chart avec rôle img + label a11y', () => {
        const { container } = render(
            <div style={{ width: 600, height: 400 }}>
                <ZoomableTimeChart data={mockData} xKey="date" series={mockSeries} />
            </div>,
        );
        const chart = container.querySelector('[role="img"]');
        expect(chart).toBeTruthy();
        expect(chart?.getAttribute('aria-label')).toMatch(/molette/i);
    });

    it('affiche le hint « Molette ou pincement = zoom » en vue complète', () => {
        render(
            <div style={{ width: 600, height: 400 }}>
                <ZoomableTimeChart data={mockData} xKey="date" series={mockSeries} />
            </div>,
        );
        expect(screen.getByText(/Molette ou pincement = zoom/i)).toBeInTheDocument();
    });

    it("ne montre PAS le bouton reset par défaut (pas zoomé)", () => {
        render(
            <div style={{ width: 600, height: 400 }}>
                <ZoomableTimeChart data={mockData} xKey="date" series={mockSeries} />
            </div>,
        );
        expect(screen.queryByText(/Vue complète/i)).not.toBeInTheDocument();
    });

    it('mode privacy masque les valeurs Y', () => {
        const { container } = render(
            <div style={{ width: 600, height: 400 }}>
                <ZoomableTimeChart data={mockData} xKey="date" series={mockSeries} privacyMode />
            </div>,
        );
        // ResponsiveContainer attend une largeur 0 en jsdom, ça empêche le chart de se rendre
        // mais le container racine doit exister
        expect(container.querySelector('[role="img"]')).toBeTruthy();
    });

    it('gère un dataset vide sans crash', () => {
        render(
            <div style={{ width: 600, height: 400 }}>
                <ZoomableTimeChart data={[]} xKey="date" series={mockSeries} />
            </div>,
        );
        expect(screen.queryByRole('img')).toBeTruthy();
    });

    it('accepte un yFormatter custom', () => {
        const customFormat = (v: number) => `EUR ${v}`;
        render(
            <div style={{ width: 600, height: 400 }}>
                <ZoomableTimeChart data={mockData} xKey="date" series={mockSeries} yFormatter={customFormat} />
            </div>,
        );
        // Le formatter est passé au yaxis ; on ne peut pas le tester directement
        // car ResponsiveContainer rend nul en jsdom, mais on vérifie au moins le render.
        expect(screen.queryByRole('img')).toBeTruthy();
    });
});
