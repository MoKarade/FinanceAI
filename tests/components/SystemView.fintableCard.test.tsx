// [FINTABLE-3] Carte "Sync Fintable" de SystemView — rend l'état honnête (jamais synchronisé,
// succès, échec) sans crash. Zéro montant $ dans ce rapport → pas de gate mode discret à tester.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SystemView } from '../../components/SystemView';
import { buildDefaultAppState } from '../../mcp/state/appStateDefaults';
import type { AppState, FintableSyncReport } from '../../types';

function baseReport(over: Partial<FintableSyncReport> = {}): FintableSyncReport {
    return {
        at: Date.now(), cutoverDateUsed: '2026-07-08', accountsSeen: 3, accountsWithoutRole: 0,
        transactionsAdded: 12, transfersDetected: 1, cashUpdated: true, debtsUpdated: [],
        investmentReferenceCount: 2, warnings: [], error: null,
        ...over,
    };
}

describe('SystemView — carte Sync Fintable', () => {
    it('jamais synchronisé → état honnête, aucun compteur fabriqué', () => {
        const state = buildDefaultAppState() as AppState;
        render(<SystemView state={state} />);
        expect(screen.getByText(/Aucune sync automatique n'a encore eu lieu/)).toBeInTheDocument();
    });

    it('succès → statut OK + compteurs affichés', () => {
        const state = { ...buildDefaultAppState(), fintableSyncReport: baseReport() } as AppState;
        render(<SystemView state={state} />);
        expect(screen.getByText('OK')).toBeInTheDocument();
        expect(screen.getByText('2026-07-08')).toBeInTheDocument();
        expect(screen.getByText('12')).toBeInTheDocument();
        expect(screen.getByText('mises à jour')).toBeInTheDocument();
    });

    it('échec → statut Échec + message d\'erreur affiché, compteurs à zéro non maquillés', () => {
        const state = {
            ...buildDefaultAppState(),
            fintableSyncReport: baseReport({
                error: '[AUTH] jeton révoqué', transactionsAdded: 0, cashUpdated: false, transfersDetected: 0,
            }),
        } as AppState;
        render(<SystemView state={state} />);
        expect(screen.getByText('Échec')).toBeInTheDocument();
        expect(screen.getByText(/jeton révoqué/)).toBeInTheDocument();
        expect(screen.getByText('inchangées')).toBeInTheDocument();
    });

    it('dettes mises à jour : liste les NOMS (saisis par Marc, pas des montants)', () => {
        const state = {
            ...buildDefaultAppState(),
            fintableSyncReport: baseReport({ debtsUpdated: ['Desjardins Cash Back Mastercard'] }),
        } as AppState;
        render(<SystemView state={state} />);
        expect(screen.getByText('Desjardins Cash Back Mastercard')).toBeInTheDocument();
    });

    it('comptes sans rôle : avertissement visible', () => {
        const state = {
            ...buildDefaultAppState(),
            fintableSyncReport: baseReport({ accountsSeen: 4, accountsWithoutRole: 1 }),
        } as AppState;
        render(<SystemView state={state} />);
        expect(screen.getByText(/1 sans rôle/)).toBeInTheDocument();
    });
});
