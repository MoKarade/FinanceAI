/**
 * [RETRAITE-BULLE-FRANCAIS] La bulle du graphique de Retraite affichait « Cashflow », « Depenses (Infl.) »,
 * « Epargne Mensuelle » et « Liquidites » : de l'anglais et des accents manquants.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RetirementTooltip } from '../../components/Retirement';

const point = (over: Record<string, unknown> = {}) => ({
    age: 70,
    RetirementAge: 65,
    NetWorth: 500_000,
    CELI: 100_000,
    REER: 200_000,
    Liquidites: 20_000,
    Income: 4_000,
    Expenses: 3_000,
    Savings: 800,
    ...over,
});

const rendre = (over: Record<string, unknown> = {}) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<RetirementTooltip active payload={[{ payload: point(over) as any }]} />);

describe('[RETRAITE-BULLE-FRANCAIS] libellés de la bulle de Retraite', () => {
    it('en retraite : « Flux net », « Dépenses (avec inflation) », « Liquidités »', () => {
        rendre();
        expect(screen.getByText('Flux net')).toBeInTheDocument();
        expect(screen.getByText('Dépenses (avec inflation)')).toBeInTheDocument();
        expect(screen.getByText('Liquidités')).toBeInTheDocument();
        expect(screen.queryByText('Cashflow')).not.toBeInTheDocument();
        expect(screen.queryByText(/Depenses/)).not.toBeInTheDocument();
    });

    it('en accumulation : « Épargne mensuelle » et « Flux net »', () => {
        rendre({ age: 40 });
        expect(screen.getByText('Épargne mensuelle')).toBeInTheDocument();
        expect(screen.getByText('Flux net')).toBeInTheDocument();
        expect(screen.queryByText(/Epargne/)).not.toBeInTheDocument();
        expect(screen.queryByText('Cashflow')).not.toBeInTheDocument();
    });
});
