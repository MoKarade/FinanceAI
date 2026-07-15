// services/sync/syncErrors.ts
// [ARCH-SYNC-SPLIT] Gestion d'erreur commune de la sync : publie un statut d'erreur honnête (par phase)
// + journalise sans crasher. Importé par : syncPush, syncPull, syncLifecycle.

import { logError } from '../errorLogger';
import { setStatus, type SyncStatus } from './syncStatusStore';

/** @internal — repli d'erreur partagé inter-modules sync. */
export function handleError(phase: NonNullable<SyncStatus['errorPhase']>, e: unknown): void {
    const message = e instanceof Error ? e.message : String(e);
    setStatus({ busy: false, error: `Sync (${phase}) : ${message}`, errorPhase: phase });
    logError({
        source: 'storage',
        severity: 'warning',
        message: `Sync Google Drive échouée (${phase})`,
        error: e instanceof Error ? e : new Error(message),
    });
}
