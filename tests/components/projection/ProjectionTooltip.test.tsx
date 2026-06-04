// Bloc « Impôts » de l'infobulle Futur (demande Marc) : impôt dormant (latent) +
// régularisation d'avril. On vérifie l'étiquetage honnête et les signes.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExpertTooltip } from '../../../components/projection/ProjectionTooltip';
import type { ProjectionChartPoint } from '../../../services/projection/types';

const pt = (over: Partial<ProjectionChartPoint>): ProjectionChartPoint => ({
    monthIndex: 0,
    dateLabel: 'janv. 2030',
    age: 40,
    NetWorth: 500000,
    ...over,
} as ProjectionChartPoint);

const renderTip = (over: Partial<ProjectionChartPoint>) =>
    render(<ExpertTooltip active payload={[{ payload: pt(over) }]} />);

describe('ExpertTooltip — bloc Impôts (impôt dormant + régularisation)', () => {
    it("affiche l'impôt dormant en valeur ABSOLUE (ImpotLatent est négatif dans le moteur)", () => {
        renderTip({ ImpotLatent: -50000 });
        expect(screen.getByText('Impôts')).toBeInTheDocument();
        const row = screen.getByText(/Impôt dormant/).parentElement;
        expect(row).toBeTruthy();
        // jamais de signe « − » : on montre la magnitude, pas l'obligation signée.
        expect(row?.textContent).not.toContain('-');
        expect(row?.textContent).toContain('50');
    });

    it('régularisation positive = solde à payer (libellé « avril », signe −)', () => {
        renderTip({ FluxImpots: 1200 });
        const row = screen.getByText(/Solde d'impôt \(avril\)/).parentElement;
        expect(row?.textContent).toContain('-');
        expect(screen.queryByText(/Remboursement d'impôt/)).toBeNull();
    });

    it('régularisation négative = remboursement (signe +)', () => {
        renderTip({ FluxImpots: -800 });
        const row = screen.getByText(/Remboursement d'impôt/).parentElement;
        expect(row?.textContent).toContain('+');
        expect(screen.queryByText(/Solde d'impôt/)).toBeNull();
    });

    it('aucun bloc Impôts quand dormant et régularisation sont nuls/absents', () => {
        renderTip({ ImpotLatent: 0, FluxImpots: 0 });
        expect(screen.queryByText('Impôts')).toBeNull();
    });

    it('les deux lignes coexistent (dormant + régularisation au même point)', () => {
        renderTip({ ImpotLatent: -120000, FluxImpots: 3400 });
        expect(screen.getByText(/Impôt dormant/)).toBeInTheDocument();
        expect(screen.getByText(/Solde d'impôt \(avril\)/)).toBeInTheDocument();
    });
});
