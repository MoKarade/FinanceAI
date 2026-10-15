// services/sync/syncErrors.ts
// [ARCH-SYNC-SPLIT] Gestion d'erreur commune de la sync : publie un statut d'erreur honnête (par phase)
// + journalise sans crasher. Importé par : syncPush, syncPull, syncLifecycle.

import { logError } from '../errorLogger';
import { setStatus, type SyncStatus } from './syncStatusStore';

/** [DRIVE-ERREUR-SIMPLE] Phrase montrée à l'utilisateur ; le détail technique va dans le journal d'erreurs. */
export const DRIVE_ERREUR_SIMPLE = 'Drive ne répond pas, réessaie dans un instant';

/** @internal — repli d'erreur partagé inter-modules sync. */
export function handleError(phase: NonNullable<SyncStatus['errorPhase']>, e: unknown): void {
    const message = e instanceof Error ? e.message : String(e);
    setStatus({ busy: false, error: DRIVE_ERREUR_SIMPLE, errorPhase: phase });
    logError({
        source: 'storage',
        severity: 'warning',
        message: `Sync Google Drive échouée (${phase})`,
        error: e instanceof Error ? e : new Error(message),
    });
}
