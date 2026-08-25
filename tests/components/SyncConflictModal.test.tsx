import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SyncStatus } from '../../services/sync/syncOrchestrator';

// Statut pilotable + resolveConflict espionné (on teste le rendu/les choix, pas la sync réelle).
let mockStatus: SyncStatus;
const resolveConflictMock = vi.fn(async (_keep: 'local' | 'drive') => {});
vi.mock('../../services/sync/syncOrchestrator', () => ({
    getSyncStatus: () => mockStatus,
    subscribeSyncStatus: (cb: (s: SyncStatus) => void) => { cb(mockStatus); return () => {}; },
    resolveConflict: (keep: 'local' | 'drive') => resolveConflictMock(keep),
}));

import { SyncConflictModal } from '../../components/sync/SyncConflictModal';

const baseStatus = (over: Partial<SyncStatus> = {}): SyncStatus => ({
    configured: true, connected: true, email: 'm@x.co', lastSyncedAt: 0, busy: false,
    conflict: false, error: null, errorPhase: null, needsPassphrase: false, passphraseActive: false,
    conflictSummary: null, resumeSettled: true, ...over,
});

beforeEach(() => { resolveConflictMock.mockClear(); });

describe('SyncConflictModal', () => {
    it('ne rend RIEN hors conflit', () => {
        mockStatus = baseStatus({ conflict: false });
        const { container } = render(<SyncConflictModal />);
        expect(container.firstChild).toBeNull();
    });

    it('Drive CHIFFRÉ : affiche « contenu inconnu », JAMAIS « 0 placement » (ni dans le résumé ni à la confirmation)', () => {
        mockStatus = baseStatus({
            conflict: true,
            conflictSummary: {
                local: { assets: 5, transactions: 10 },
                drive: { assets: 0, transactions: 0, updatedAt: 1_700_000_000_000, encrypted: true },
            },
        });
        render(<SyncConflictModal />);
        expect(screen.getAllByText(/contenu inconnu/i).length).toBeGreaterThan(0);
        expect(screen.queryByText(/0 placement/i)).toBeNull();
        // Même à l'étape de confirmation destructrice, pas de « 0 placement » trompeur.
        fireEvent.click(screen.getByRole('button', { name: /Restaurer depuis Drive/ }));
        expect(screen.queryByText(/0 placement/i)).toBeNull();
    });

    it('« Garder cet appareil » → resolveConflict("local")', () => {
        mockStatus = baseStatus({
            conflict: true,
            conflictSummary: { local: { assets: 5, transactions: 10 }, drive: { assets: 1, transactions: 2, updatedAt: 1, encrypted: false } },
        });
        render(<SyncConflictModal />);
        fireEvent.click(screen.getByRole('button', { name: /Garder cet appareil/ }));
        expect(resolveConflictMock).toHaveBeenCalledWith('local');
    });

    it('« Restaurer depuis Drive » : confirmation en 2 temps → resolveConflict("drive")', () => {
        mockStatus = baseStatus({
            conflict: true,
            conflictSummary: { local: { assets: 5, transactions: 10 }, drive: { assets: 1, transactions: 2, updatedAt: 1, encrypted: false } },
        });
        render(<SyncConflictModal />);
        // 1er clic = révèle la confirmation ; 2e clic = confirme la restauration destructrice.
        fireEvent.click(screen.getByRole('button', { name: /Restaurer depuis Drive/ }));
        expect(resolveConflictMock).not.toHaveBeenCalled(); // pas encore : confirmation requise
        fireEvent.click(screen.getByRole('button', { name: /Oui, restaurer Drive/ }));
        expect(resolveConflictMock).toHaveBeenCalledWith('drive');
    });
});
