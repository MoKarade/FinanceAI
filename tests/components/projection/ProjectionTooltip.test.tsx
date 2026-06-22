// Bloc « Impôts » de l'infobulle Futur (demande Marc) : impôt dormant (latent) +
// régularisation d'avril. On vérifie l'étiquetage honnête et les signes.
// [R3] ExpertTooltip prend désormais `data` en prop DIRECTE (découplé de Recharts).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    render(<ExpertTooltip data={pt(over)} />);

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

// [R3] Pied de page selon l'état figé/survol + bouton « Détail complet ».
describe('ExpertTooltip — figeage (R3)', () => {
    it('au SURVOL (non figé) : invite à figer, aucun bouton « Détail complet »', () => {
        render(<ExpertTooltip data={pt({})} />);
        expect(screen.getByText(/Clique pour figer/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Détail complet/ })).toBeNull();
    });

    it('FIGÉ : affiche le bouton « Détail complet » et déclenche onOpenDetail au clic', () => {
        const onOpenDetail = vi.fn();
        render(<ExpertTooltip data={pt({})} frozen onOpenDetail={onOpenDetail} />);
        const btn = screen.getByRole('button', { name: /Détail complet/ });
        expect(btn).toBeInTheDocument();
        expect(screen.queryByText(/Clique pour figer/)).toBeNull();
        fireEvent.click(btn);
        expect(onOpenDetail).toHaveBeenCalledTimes(1);
    });
});
