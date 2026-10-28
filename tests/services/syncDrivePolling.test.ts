/**
 * @vitest-environment jsdom
 *
 * Polling Drive « fluide » : on teste le CÂBLAGE (écouteurs focus/visibilitychange + cleanup) sans
 * déclencher de tick réseau (intervalle énorme). Le travail réel (runBootSync + garde anti-perte) est
 * déjà couvert par les autres tests de l'orchestrateur.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { startDrivePolling } from '../../services/sync/syncOrchestrator';

describe('startDrivePolling — câblage', () => {
    afterEach(() => vi.restoreAllMocks());

    it('renvoie un cleanup, pose les écouteurs focus/visibilitychange, et les retire au cleanup', () => {
        const addWin = vi.spyOn(window, 'addEventListener');
        const addDoc = vi.spyOn(document, 'addEventListener');
        const remWin = vi.spyOn(window, 'removeEventListener');
        const remDoc = vi.spyOn(document, 'removeEventListener');

        const stop = startDrivePolling({ intervalMs: 10_000_000 }); // intervalle énorme → aucun tick réseau
        expect(typeof stop).toBe('function');
        expect(addWin).toHaveBeenCalledWith('focus', expect.any(Function));
        expect(addDoc).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

        stop();
        expect(remWin).toHaveBeenCalledWith('focus', expect.any(Function));
        expect(remDoc).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });
});
