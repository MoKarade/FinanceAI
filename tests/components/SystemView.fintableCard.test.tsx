// [FINTABLE-3] Carte "Sync Fintable" de SystemView — rend l'état honnête (jamais synchronisé,
// succès, échec) sans crash. Zéro montant $ dans ce rapport → pas de gate mode discret à tester.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SystemView } from '../../components/SystemView';
import { buildDefaultAppState } from '../../mcp/state/appStateDefaults';
import type { AppState, FintableSyncReport } from '../../types';

const logErrorMock = vi.hoisted(() => vi.fn());
vi.mock('../../services/errorLogger', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../services/errorLogger')>();
    return { ...actual, logError: logErrorMock };
});

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

    // [finding silent-failure-hunter, PR #531] `fintableSyncReport` traverse une frontière de
    // sync/persistance SANS validation Zod — une forme corrompue (état Drive ancien, futur bug) ne
    // doit JAMAIS planter le render. Discriminant : un `debtsUpdated`/`warnings` malformé (non-tableau).
    it('forme corrompue (debtsUpdated/warnings non-tableau) : rend SANS planter, rabat à vide, trace l\'anomalie', () => {
        logErrorMock.mockClear();
        const corrupted = {
            ...baseReport(),
            debtsUpdated: undefined, warnings: null,
        } as unknown as FintableSyncReport;
        const state = { ...buildDefaultAppState(), fintableSyncReport: corrupted } as AppState;

        expect(() => render(<SystemView state={state} />)).not.toThrow();
        expect(screen.getByText('aucune')).toBeInTheDocument(); // rabattu à [] → "Dettes mises à jour : aucune"
        expect(logErrorMock).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warning' }));
    });
});
