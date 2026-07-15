// services/sync/syncPolling.ts
// [ARCH-SYNC-SPLIT] Polling Drive (rafraîchissement « fluide » périodique + au retour sur l'onglet).
// Possède `_pollTimer`. Délègue la décision à runBootSync (syncLifecycle) : sync bidirectionnelle sûre,
// jamais d'écrasement. Importé par : App.tsx (startDrivePolling au montage).

import { getSyncStatus } from './syncStatusStore';
import { runBootSync } from './syncLifecycle';

// ── Polling Drive (rafraîchissement « fluide ») ──────────────────────────────
let _pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Sonde Drive périodiquement + au retour sur l'onglet → l'app reflète SEULE les changements (ex.
 * un document rangé par le connecteur MCP) sans rouvrir/rafraîchir. Réutilise `runBootSync`
 * (decideOnLoad + anti-réentrance) : sync BIDIRECTIONNELLE sûre, jamais d'écrasement (conflit explicite
 * si les deux ont divergé). Ne fait rien tant qu'on n'est pas connecté/occupé/en conflit/passphrase.
 * Renvoie une fonction de nettoyage.
 */
export function startDrivePolling(opts?: { intervalMs?: number }): () => void {
    const intervalMs = opts?.intervalMs ?? 60_000;
    const tick = (): void => {
        const s = getSyncStatus();
        if (s.busy || s.conflict || s.needsPassphrase) return;
        void runBootSync(); // garde anti-perte interne ; no-op si jamais connecté
    };
    const onFocus = (): void => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        tick();
    };
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(tick, intervalMs);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onFocus);
    if (typeof window !== 'undefined') window.addEventListener('focus', onFocus);
    return () => {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onFocus);
        if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
    };
}
