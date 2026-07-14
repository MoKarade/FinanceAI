import React, { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import { showToast } from '../ui/Toast';
import {
    getSyncStatus,
    subscribeSyncStatus,
    connectAndSync,
    pushNow,
    type SyncStatus,
} from '../../services/sync/syncOrchestrator';
import { useFinanceStore } from '../../store/useFinanceStore';
import { hasMeaningfulData } from '../../utils/onboarding';

/**
 * Bannière PERSISTANTE de statut de sync Drive (rendue EN FLUX, pas `position:fixed` → elle pousse
 * le contenu au lieu de le recouvrir ; évite le piège « bannière fixe qui intercepte les clics »,
 * cf leçon TOOLTIP-CLICK-BANNER).
 *
 * Deux alertes, dès que la sync est CONFIGURÉE (sinon ship dark → rien) et hors mode test :
 *  - PAS connecté à Drive alors que l'appareil a des données réelles → « tes changements ne sont PAS
 *    sauvegardés » + bouton Reconnecter (Marc : « propose de me connecter dès que je ne le suis pas »).
 *  - Une erreur de push est survenue alors qu'on est connecté → « échec de sauvegarde » + Réessayer
 *    (sinon une sauvegarde qui échoue en silence donnerait une fausse impression de sécurité).
 *
 * Le conflit (`status.conflict`) est géré par SyncConflictModal (overlay bloquant) → on s'efface pour
 * ne pas doubler l'alerte.
 */
export const SyncStatusBanner: React.FC = () => {
    const [status, setStatus] = useState<SyncStatus>(getSyncStatus);
    const [busy, setBusy] = useState(false);
    useEffect(() => subscribeSyncStatus(setStatus), []);

    // Réactif au store : « a des données à risque ? » doit re-rendre quand l'utilisateur saisit ses
    // premières données (sinon l'alerte n'apparaîtrait qu'au prochain changement de statut sync).
    const hasData = useFinanceStore((s) => hasMeaningfulData(s));
    const isTestMode = useFinanceStore((s) => s.isTestMode === true);

    if (!status.configured || isTestMode) return null;
    if (status.conflict) return null; // le modal de conflit prend le relais

    const disconnected = !status.connected && hasData;
    // N'affiche l'alerte « sauvegarde échouée » (dont le bouton Réessayer POUSSE) que pour une vraie
    // erreur de PUSH — jamais pour un pull/boot/connect, sinon « Réessayer » pousserait un local
    // peut-être périmé par-dessus un Drive qu'on n'a justement pas su lire (finding silent-failure 2026-07-14).
    const pushError = status.errorPhase === 'push' && Boolean(status.error) && status.connected;
    if (!disconnected && !pushError) return null;

    const reconnect = async () => {
        setBusy(true);
        try {
            await connectAndSync();
            if (getSyncStatus().connected && !getSyncStatus().conflict) {
                showToast('Google Drive reconnecté — sauvegarde réactivée.', 'success');
            }
        } finally {
            setBusy(false);
        }
    };

    const retry = async () => {
        setBusy(true);
        try {
            const r = await pushNow();
            if (r === 'pushed') showToast('Sauvegardé vers Google Drive.', 'success');
        } finally {
            setBusy(false);
        }
    };

    const isDisconnected = disconnected; // priorité : la déconnexion prime sur l'erreur de push

    return (
        <div
            role="alert"
            className="w-full bg-rose-600 text-white px-4 py-2.5 flex items-center gap-3 text-meta shadow-md"
        >
            <Icon name="alert" size={18} className="shrink-0" />
            <span className="flex-1 leading-snug font-medium">
                {isDisconnected ? (
                    <>Non connecté à Google Drive — <strong>tes changements ne sont PAS sauvegardés</strong> (ni visibles quand tu parles à Claude).</>
                ) : (
                    <>Échec de la dernière sauvegarde vers Google Drive — tes changements récents ne sont pas encore à l'abri.</>
                )}
            </span>
            <button
                type="button"
                onClick={isDisconnected ? reconnect : retry}
                disabled={busy}
                aria-busy={busy}
                className="shrink-0 px-3 py-1.5 rounded-card bg-white text-rose-700 hover:bg-rose-50 text-tiny font-bold disabled:opacity-60 focus-ring"
            >
                {isDisconnected ? (busy ? 'Reconnexion…' : 'Reconnecter') : (busy ? 'Envoi…' : 'Réessayer')}
            </button>
        </div>
    );
};
