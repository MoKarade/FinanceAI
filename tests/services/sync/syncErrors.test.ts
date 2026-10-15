// [DRIVE-ERREUR-SIMPLE] L'erreur de synchro Google Drive montrée à l'utilisateur est une phrase simple,
// sans jargon ni message brut ; le détail technique reste dans le journal d'erreurs.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logError = vi.fn();
vi.mock('../../../services/errorLogger', () => ({ logError: (...a: unknown[]) => logError(...a), logErrorThrottled: vi.fn() }));

import { handleError, DRIVE_ERREUR_SIMPLE } from '../../../services/sync/syncErrors';
import { getSyncStatus } from '../../../services/sync/syncStatusStore';

describe('handleError — phrase simple pour l\'utilisateur', () => {
    beforeEach(() => logError.mockClear());

    it.each(['pull', 'push', 'boot', 'connect', 'delete'] as const)(
        'phase %s : phrase simple, phase conservée, détail journalisé',
        (phase) => {
            handleError(phase, new Error('HTTP 503 Service Unavailable at googleapis'));
            const s = getSyncStatus();
            expect(s.error).toBe('Drive ne répond pas, réessaie dans un instant');
            expect(s.error).toBe(DRIVE_ERREUR_SIMPLE);
            expect(s.error).not.toMatch(/Sync \(|HTTP|503|googleapis/);
            expect(s.errorPhase).toBe(phase);
            expect(s.busy).toBe(false);
            expect(logError).toHaveBeenCalledTimes(1);
            expect(logError.mock.calls[0][0].error.message).toContain('503');
        },
    );

    it('une valeur non-Error est aussi traitée', () => {
        handleError('pull', 'boom');
        expect(getSyncStatus().error).toBe(DRIVE_ERREUR_SIMPLE);
        expect(logError.mock.calls[0][0].error.message).toBe('boom');
    });
});
