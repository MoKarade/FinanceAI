// services/sync/syncOrchestrator.ts
// [ARCH-SYNC-SPLIT] BARREL de compatibilité. L'orchestration de la sync Google Drive a été éclatée en
// modules à responsabilité unique (« un état mutable = un module propriétaire »), mais l'API PUBLIQUE
// historique est préservée ICI verbatim → aucun site appelant (App.tsx, composants, tests, MCP) n'a
// bougé. Les helpers INTERNES (setStatus, getLocalPayload, currentMeta, readDrive, resolveSub,
// handleError, applyPulledPayload) restent volontairement HORS de ce barrel : ce sont des rouages
// inter-modules, pas de l'API publique (ne les exposer nulle part).
//
// Graphe de dépendances (racine → feuilles) :
//   syncStatusStore (état statut, 0 dep) → syncTypes → syncErrors/syncMeta/syncSnapshot
//   → syncPush / syncPull → syncLifecycle → syncPolling ; syncPassphrase branche push+pull.
//
// INERTE tant que VITE_GOOGLE_CLIENT_ID n'est pas configuré (cf gisAuth.isGoogleAuthConfigured).

// ── Statut observable + abonnement (syncStatusStore) ─────────────────────────
export { getSyncStatus, subscribeSyncStatus, subscribeSyncNotice, type SyncStatus, type SyncNotice } from './syncStatusStore';

// ── Types partagés (syncTypes) ───────────────────────────────────────────────
export type { ConflictSideCounts, ConflictSummary } from './syncTypes';

// ── Snapshot local + helpers purs testables (syncSnapshot) ───────────────────
export { stripApiKeys, computeIsEmpty, summarizeForConflict } from './syncSnapshot';

// ── Push (syncPush) ──────────────────────────────────────────────────────────
export { pushNow, schedulePush, flushPush, markApiKeysHydrated, type PushResult } from './syncPush';

// ── Pull (syncPull) ──────────────────────────────────────────────────────────
export { pullNow } from './syncPull';

// ── Cycle de vie : boot/connexion/décision/conflit/déconnexion (syncLifecycle) ─
export {
    initSync,
    connectAndSync,
    gateSilentResume,
    runBootSync,
    resolveConflict,
    disconnectSync,
    deleteRemoteData,
    hasConnectedBefore,
    handleInactivityLogout,
} from './syncLifecycle';

// ── Déconnexion auto après inactivité (inactivityLogout) ─────────────────────
export { startInactivityWatch, INACTIVITY_LIMIT_MS } from './inactivityLogout';

// ── Polling Drive (syncPolling) ──────────────────────────────────────────────
export { startDrivePolling } from './syncPolling';

// ── Passphrase optionnelle zéro-knowledge (syncPassphrase) ───────────────────
export {
    MIN_PASSPHRASE_LENGTH,
    setSyncPassphrase,
    clearSyncPassphrase,
    removeSyncPassphrase,
    type SetPassphraseResult,
    type RemovePassphraseResult,
} from './syncPassphrase';
