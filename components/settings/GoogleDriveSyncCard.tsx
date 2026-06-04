import React, { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { showToast } from '../ui/Toast';
import {
    getSyncStatus,
    subscribeSyncStatus,
    connectAndSync,
    pushNow,
    pullNow,
    disconnectSync,
    deleteRemoteData,
    resolveConflict,
    removeSyncPassphrase,
    type SyncStatus,
} from '../../services/sync/syncOrchestrator';

/**
 * Carte de synchronisation Google Drive (Réglages → Système).
 * MASQUÉE tant que VITE_GOOGLE_CLIENT_ID n'est pas configuré (`status.configured === false`)
 * → la feature ship « dark », aucun impact tant que Marc n'a pas créé le Client ID OAuth.
 *
 * Données stockées dans le Drive de l'utilisateur (dossier caché appData), sans chiffrement
 * applicatif (choix assumé) — message d'honnêteté affiché.
 */
function useSyncStatus(): SyncStatus {
    const [status, setStatus] = useState<SyncStatus>(getSyncStatus);
    useEffect(() => subscribeSyncStatus(setStatus), []);
    return status;
}

function formatWhen(ts: number): string {
    if (!ts) return 'jamais';
    try {
        return new Date(ts).toLocaleString('fr-CA');
    } catch {
        return '—';
    }
}

/**
 * Bloc passphrase — RÉDUIT à la seule action « retirer » (choix Marc : plus aucune option pour EN
 * créer une). Ne s'affiche QUE si une passphrase est encore active, pour permettre de revenir à
 * « juste mon compte Google » : `removeSyncPassphrase` re-publie le Drive EN CLAIR. Sinon → rien.
 * (Le déverrouillage d'un coffre chiffré existant est géré en plein écran par PassphraseGate.)
 */
const PassphraseSection: React.FC<{ status: SyncStatus }> = ({ status }) => {
    const [busy, setBusy] = useState(false);

    if (!status.passphraseActive) return null; // aucune option pour activer une passphrase

    const onClear = async () => {
        setBusy(true);
        try {
            const r = await removeSyncPassphrase();
            showToast(
                r === 'removed-and-republished'
                    ? 'Passphrase retirée — ta sauvegarde Drive est repassée EN CLAIR (plus de passphrase nulle part).'
                    : 'Passphrase effacée — la prochaine sauvegarde ne sera plus chiffrée.',
                'info',
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="p-3 rounded-card bg-emerald-500/10 border border-emerald-500/30 space-y-2">
            <div className="text-meta font-semibold text-emerald-300">🔒 Chiffrement par passphrase actif</div>
            <p className="text-tiny text-ink-300 leading-snug">
                Tes sauvegardes Drive sont chiffrées avec ta passphrase. Pour revenir à « juste mon compte
                Google » (sans passphrase), retire-la : ta sauvegarde Drive repassera en clair.
            </p>
            <button
                onClick={onClear}
                disabled={status.busy || busy}
                className="text-tiny text-ink-400 underline underline-offset-2 hover:text-ink-200 disabled:opacity-50"
            >
                {busy ? '…' : 'Effacer la passphrase (repasser en clair)'}
            </button>
        </div>
    );
};

export const GoogleDriveSyncCard: React.FC = () => {
    const status = useSyncStatus();
    const [confirmDelete, setConfirmDelete] = useState(false);

    // Ship dark : invisible tant que le Client ID OAuth n'est pas configuré.
    if (!status.configured) return null;

    const onConnect = async () => {
        await connectAndSync();
        if (getSyncStatus().connected) showToast('Google Drive connecté.', 'success');
    };
    const onPush = async () => {
        const result = await pushNow();
        if (result === 'pushed') {
            showToast('Sauvegardé vers Google Drive.', 'success');
        } else if (result === 'skipped-empty') {
            showToast('Rien à sauvegarder : aucune donnée détectée sur cet appareil.', 'info');
        } else if (result === 'skipped-testmode') {
            showToast('Mode test actif — sauvegarde désactivée (sors du mode test d’abord).', 'info');
        }
        // 'error' : message rouge déjà affiché via le statut ; 'not-configured' : carte masquée.
    };
    const onPull = async () => {
        // pullNow réhydrate le store EN PLACE (plus de reload) → on confirme par un toast.
        await pullNow();
        if (!getSyncStatus().error) showToast('Données restaurées depuis Google Drive.', 'success');
    };
    const onDisconnect = () => {
        disconnectSync();
        showToast('Google Drive déconnecté (données locales conservées).', 'info');
    };

    return (
        <Card title="☁️ Synchronisation Google Drive">
            <div className="space-y-4">
                <p className="text-tiny text-gray-400 leading-snug">
                    Sauvegarde tes données dans <strong>ton</strong> Google Drive (dossier privé de l'app) pour
                    les retrouver sur un autre appareil ou en navigation privée, après connexion Google.
                </p>

                {/* Honnêteté : par défaut pas de chiffrement applicatif ; les clés API SONT incluses (sync v2).
                    Une passphrase optionnelle (ci-dessous, une fois connecté) active le chiffrement zéro-knowledge. */}
                {!status.passphraseActive && (
                    <p className="text-tiny text-amber-400/90 leading-snug">
                        Sauvegarde dans <strong>ton</strong> Google Drive privé — tes données et tes clés API y sont
                        incluses pour que tu retrouves tout sur chaque appareil sans rien ressaisir.
                    </p>
                )}

                {status.conflict && (
                    <div className="p-3 rounded-card bg-amber-500/10 border border-amber-500/30 space-y-2">
                        <div className="text-meta font-semibold text-amber-300">Conflit de synchronisation</div>
                        <p className="text-tiny text-ink-300">
                            Cet appareil et Google Drive ont divergé depuis la dernière sync. Que garder ?
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => resolveConflict('local')}
                                className="px-3 py-1.5 rounded-card bg-primary/15 border border-primary/40 text-primary text-meta font-medium hover:bg-primary/25"
                            >
                                Garder cet appareil
                            </button>
                            <button
                                onClick={() => resolveConflict('drive')}
                                className="px-3 py-1.5 rounded-card bg-white/5 border border-white/10 text-ink-200 text-meta font-medium hover:bg-white/10"
                            >
                                Garder Google Drive
                            </button>
                        </div>
                    </div>
                )}

                {!status.connected ? (
                    <button
                        onClick={onConnect}
                        disabled={status.busy}
                        className="px-4 py-2 rounded-card bg-primary/15 border border-primary/40 text-primary text-meta font-medium hover:bg-primary/25 disabled:opacity-50"
                    >
                        {status.busy ? 'Connexion…' : 'Connecter Google Drive'}
                    </button>
                ) : (
                    <div className="space-y-3">
                        <div className="text-meta text-ink-200">
                            Connecté{status.email ? <> : <span className="font-mono">{status.email}</span></> : ''}
                            <span className="block text-tiny text-ink-400">
                                Dernière sync : {formatWhen(status.lastSyncedAt)}
                            </span>
                        </div>

                        {/* Passphrase optionnelle (zéro-knowledge) + invite si un pull a trouvé un blob chiffré. */}
                        <PassphraseSection status={status} />

                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={onPush}
                                disabled={status.busy}
                                className="px-3 py-1.5 rounded-card bg-white/5 border border-white/10 text-ink-200 text-meta font-medium hover:bg-white/10 disabled:opacity-50"
                            >
                                {status.busy ? '…' : 'Sauvegarder maintenant'}
                            </button>
                            <button
                                onClick={onPull}
                                disabled={status.busy}
                                className="px-3 py-1.5 rounded-card bg-white/5 border border-white/10 text-ink-200 text-meta font-medium hover:bg-white/10 disabled:opacity-50"
                            >
                                Restaurer depuis Drive
                            </button>
                            <button
                                onClick={onDisconnect}
                                disabled={status.busy}
                                className="px-3 py-1.5 rounded-card bg-rose-500/10 border border-rose-500/30 text-rose-300 text-meta font-medium hover:bg-rose-500/20 disabled:opacity-50"
                            >
                                Déconnecter
                            </button>
                        </div>

                        {/* Suppression des données cloud — contrôle total de l'utilisateur (2 clics). */}
                        {!confirmDelete ? (
                            <button
                                onClick={() => setConfirmDelete(true)}
                                disabled={status.busy}
                                className="text-tiny text-rose-400/80 underline underline-offset-2 hover:text-rose-300 disabled:opacity-50"
                            >
                                Supprimer mes données de Google Drive
                            </button>
                        ) : (
                            <div className="p-3 rounded-card bg-rose-500/10 border border-rose-500/30 space-y-2">
                                <p className="text-tiny text-ink-300">
                                    Supprimer le fichier de sauvegarde dans <strong>ton</strong> Google Drive ? Tes données
                                    <strong> sur cet appareil</strong> sont conservées. Action irréversible côté Drive.
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={async () => { setConfirmDelete(false); await deleteRemoteData(); }}
                                        disabled={status.busy}
                                        className="px-3 py-1.5 rounded-card bg-rose-500/20 border border-rose-500/40 text-rose-200 text-meta font-medium hover:bg-rose-500/30 disabled:opacity-50"
                                    >
                                        Oui, supprimer de Drive
                                    </button>
                                    <button
                                        onClick={() => setConfirmDelete(false)}
                                        className="px-3 py-1.5 rounded-card bg-white/5 border border-white/10 text-ink-200 text-meta font-medium hover:bg-white/10"
                                    >
                                        Annuler
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {status.error && <p className="text-tiny text-rose-400 italic">{status.error}</p>}
            </div>
        </Card>
    );
};
