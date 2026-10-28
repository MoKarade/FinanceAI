import { describe, it, expect, beforeEach, vi } from 'vitest';

// IDB mockée : le module de persistance est best-effort et appelle indexedDB (absent en jsdom).
// On vérifie ICI le câblage store→module + l'état ; le round-trip crypto est couvert par secureKeyStore.
vi.mock('../../services/lockedProjectionStore', () => ({
    saveLockedProjection: vi.fn().mockResolvedValue(true),
    clearLockedProjection: vi.fn().mockResolvedValue(undefined),
    loadLockedProjection: vi.fn().mockResolvedValue({ status: 'empty' }),
}));

import { useFinanceStore } from '../../store/useFinanceStore';
import { saveLockedProjection, clearLockedProjection } from '../../services/lockedProjectionStore';
import type { ProjectionResult } from '../../services/projection/types';

const sample = { chartData: [{ monthIndex: 0 }], fireNumber: 1000, allResults: [] } as unknown as ProjectionResult;

describe('store — verrou de projection (PH2-d)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useFinanceStore.setState({ lockedProjection: null, isProjectionLocked: false });
    });

    it('lockProjection : pose le snapshot en mémoire + persiste en IndexedDB', () => {
        useFinanceStore.getState().lockProjection(sample);
        const s = useFinanceStore.getState();
        expect(s.lockedProjection).toBe(sample);
        expect(s.isProjectionLocked).toBe(true);
        expect(saveLockedProjection).toHaveBeenCalledWith(sample);
    });

    it('unlockProjection : efface le snapshot mémoire ET l\'entrée IndexedDB', () => {
        useFinanceStore.getState().lockProjection(sample);
        useFinanceStore.getState().unlockProjection();
        const s = useFinanceStore.getState();
        expect(s.lockedProjection).toBeNull();
        expect(s.isProjectionLocked).toBe(false);
        expect(clearLockedProjection).toHaveBeenCalledTimes(1);
    });

    it('setLockedProjection (boot restore) : réconcilie le booléen avec le contenu réel', () => {
        // IDB rend une courbe → verrouillé ; IDB vide (null) → on retombe déverrouillé.
        useFinanceStore.getState().setLockedProjection(sample);
        expect(useFinanceStore.getState().isProjectionLocked).toBe(true);
        useFinanceStore.getState().setLockedProjection(null);
        expect(useFinanceStore.getState().isProjectionLocked).toBe(false);
        // setLockedProjection ne RÉ-écrit pas l'IDB (le blob en vient).
        expect(saveLockedProjection).not.toHaveBeenCalled();
    });

    it('partialize : le gros blob lockedProjection N\'EST PAS persisté ; le booléen isProjectionLocked OUI', () => {
        useFinanceStore.getState().lockProjection(sample);
        const persisted = JSON.parse(localStorage.getItem('financeai-storage') || '{}');
        expect(persisted.state?.lockedProjection).toBeUndefined(); // blob → IndexedDB, pas localStorage
        expect(persisted.state?.isProjectionLocked).toBe(true);     // booléen additif → persisté
    });
});
