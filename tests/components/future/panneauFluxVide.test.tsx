/**
 * [PANNEAU-FLUX-COLONNE-MUETTE] Une journée calme (aucun revenu, aucune dépense) laissait la
 * colonne « Entrées / sorties » du panneau VIDE, ce qui se lit comme une donnée manquante.
 * Elle doit le dire, comme ses sœurs (« Aucun mouvement · marché seul »).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionFlux, type PointJour } from '../../../components/projection/panneauJour/sections';

const point = (over: Partial<PointJour> = {}): PointJour => ({
    monthIndex: 3,
    dateLabel: '18 sept. 2026',
    age: 41,
    NetWorth: 100_000,
    ...over,
} as PointJour);

describe('[PANNEAU-FLUX-COLONNE-MUETTE] SectionFlux sans mouvement', () => {
    it('dit explicitement « Aucune entrée ni sortie » quand tout est à zéro', () => {
        render(<SectionFlux data={point()} />);
        expect(screen.getByText(/Aucune entrée ni sortie/)).toBeInTheDocument();
    });

    it('le précise pour un jour du calendrier (point quotidien)', () => {
        render(<SectionFlux data={point({ isDailyPoint: true })} />);
        expect(screen.getByText(/Aucune entrée ni sortie ce jour-là/)).toBeInTheDocument();
    });

    it('le précise pour un point mensuel', () => {
        render(<SectionFlux data={point()} />);
        expect(screen.getByText(/Aucune entrée ni sortie ce mois-là/)).toBeInTheDocument();
    });

    it("n'affiche PAS le message quand une dépense existe", () => {
        render(<SectionFlux data={point({ Expenses: 1_234 })} />);
        expect(screen.queryByText(/Aucune entrée ni sortie/)).not.toBeInTheDocument();
        expect(screen.getByText('Dépenses')).toBeInTheDocument();
    });

    it('une dépense NON FINIE ne se lit pas comme « aucun flux » : le panneau le dit', () => {
        render(<SectionFlux data={point({ Expenses: Number.NaN })} />);
        expect(screen.queryByText(/Aucune entrée ni sortie/)).not.toBeInTheDocument();
        expect(screen.getByText(/Flux illisibles/)).toBeInTheDocument();
    });

    it.each([
        ['IncomeMarc', { IncomeMarc: 3_000 }],
        ['RetraitREER', { RetraitREER: 500 }],
        ['ImpotLatent seul', { ImpotLatent: 900 }],
        ['remboursement (FluxImpots négatif)', { FluxImpots: -700 }],
    ])('%s supprime le message', (_nom, over) => {
        render(<SectionFlux data={point(over as Partial<PointJour>)} />);
        expect(screen.queryByText(/Aucune entrée ni sortie/)).not.toBeInTheDocument();
    });

    it.each([
        ['impôt sous le seuil (0,4 $)', { FluxImpots: 0.4 }],
        ['dépense négative', { Expenses: -5 }],
    ])('%s : le message reste affiché (aucune ligne ne se rend)', (_nom, over) => {
        render(<SectionFlux data={point(over as Partial<PointJour>)} />);
        expect(screen.getByText(/Aucune entrée ni sortie/)).toBeInTheDocument();
    });

    it("n'affiche PAS le message quand seul un impôt est dû", () => {
        render(<SectionFlux data={point({ FluxImpots: 800 })} />);
        expect(screen.queryByText(/Aucune entrée ni sortie/)).not.toBeInTheDocument();
    });
});
