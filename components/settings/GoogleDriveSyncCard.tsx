import React, { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
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
    removeSyncPassphrase,
    type SyncStatus,
} from '../../services/sync/syncOrchestrator';
import { getPassphrase } from '../../services/sync/passphraseStore';
import { getValidAccessToken, isGoogleAuthConfigured as isDriveConfigured } from '../../services/googleDrive/gisAuth';
import { countPlaintextBackups, deletePlaintextBackups } from '../../services/googleDrive/backupCleanup';
import { isDeviceRemembered, forgetDevice } from '../../services/deviceKeyStore';
import { PassphraseCreate, telechargerCarte } from './PassphraseCreate';

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
 * [CHIFFREMENT-PHASE1] Bloc passphrase — RÉTABLIT le chemin de création (§4) retiré en juin, en plus
 * de « retirer » (déjà là). Inactive → bouton « Créer une phrase secrète » (ouvre le modal 3 étapes).
 * Active → rappel permanent (C-fin §4), état de mémorisation par appareil (§3, « Oublier cet
 * appareil »), lien pour revoir la carte de récupération, et le nettoyage des anciennes sauvegardes
 * en clair (§5.5) — ce dernier visible dans LES DEUX cas (des `.bak.json` en clair peuvent exister
 * même avant la toute première activation).
 */
const PassphraseSection: React.FC<{ status: SyncStatus }> = ({ status }) => {
    const [busy, setBusy] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [remembered, setRemembered] = useState(false);
    const [cleanup, setCleanup] = useState<{ count: number | null; confirming: boolean; busy: boolean }>({
        count: null,
        confirming: false,
        busy: false,
    });

    useEffect(() => {
        void isDeviceRemembered().then(setRemembered);
    }, [status.passphraseActive]);

    const onClear = async () => {
        setBusy(true);
        try {
            const r = await removeSyncPassphrase();
            if (r === 'removed-republish-pending') {
                // Drive porte ENCORE le blob chiffré : ne pas annoncer « en clair ». La passphrase reste
                // nécessaire pour lire cette copie tant que la sauvegarde n'est pas repartie.
                showToast(
                    'Passphrase retirée sur cet appareil, mais ta sauvegarde Drive est ENCORE chiffrée : elle n\'a pas pu être republiée (voir le message affiché). Garde ta passphrase tant que ce n\'est pas réglé.',
                    'error',
                );
                return;
            }
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

    const onVoirCarte = () => {
        const phrase = getPassphrase();
        if (!phrase) { showToast('Passphrase indisponible dans cette session.', 'error'); return; }
        telechargerCarte(phrase);
    };

    const onOublierAppareil = async () => {
        await forgetDevice();
        setRemembered(false);
        showToast('Appareil oublié — la phrase sera redemandée ici la prochaine fois.', 'info');
    };

    const onCompterBackups = async () => {
        if (!isDriveConfigured()) return;
        setCleanup((c) => ({ ...c, busy: true }));
        try {
            const token = await getValidAccessToken();
            const n = await countPlaintextBackups(token);
            setCleanup({ count: n, confirming: n > 0, busy: false });
            if (n === 0) showToast('Aucune ancienne sauvegarde en clair trouvée.', 'info');
        } catch {
            showToast('Impossible de vérifier les anciennes sauvegardes (connecte Google Drive).', 'error');
            setCleanup({ count: null, confirming: false, busy: false });
        }
    };

    const onSupprimerBackups = async () => {
        setCleanup((c) => ({ ...c, busy: true }));
        try {
            const token = await getValidAccessToken();
            const n = await deletePlaintextBackups(token);
            showToast(`${n} ancienne(s) sauvegarde(s) en clair supprimée(s) de Google Drive.`, 'success');
        } catch {
            showToast('Suppression impossible.', 'error');
        } finally {
            setCleanup({ count: null, confirming: false, busy: false });
        }
    };

    const cleanupBlock = (
        <div className="pt-2 border-t border-white/10 space-y-2">
            {!cleanup.confirming ? (
                <button
                    onClick={onCompterBackups}
                    disabled={cleanup.busy}
                    className="text-tiny text-ink-400 underline underline-offset-2 hover:text-ink-200 disabled:opacity-50"
                >
                    {cleanup.busy ? '…' : 'Nettoyer les anciennes sauvegardes non chiffrées'}
                </button>
            ) : (
                <div className="p-2 rounded-card bg-rose-500/10 border border-rose-500/30 space-y-2">
                    <p className="text-tiny text-ink-200">
                        {cleanup.count} fichier(s) de sauvegarde EN CLAIR trouvé(s) dans ton Google Drive
                        (antérieurs au chiffrement). Les supprimer ?
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={onSupprimerBackups}
                            disabled={cleanup.busy}
                            className="px-3 py-1.5 rounded-card bg-rose-500/20 border border-rose-500/40 text-rose-200 text-tiny font-medium hover:bg-rose-500/30 disabled:opacity-50"
                        >
                            {cleanup.busy ? '…' : `Oui, supprimer les ${cleanup.count}`}
                        </button>
                        <button
                            onClick={() => setCleanup({ count: null, confirming: false, busy: false })}
                            className="px-3 py-1.5 rounded-card bg-white/5 border border-white/40 text-ink-200 text-tiny font-medium hover:bg-white/10"
                        >
                            Annuler
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

    if (!status.passphraseActive) {
        return (
            <div className="p-3 rounded-card border border-white/10 bg-black/20 space-y-2">
                <p className="text-tiny text-ink-300 leading-snug">
                    Par défaut, ta sauvegarde Drive n'est PAS chiffrée applicativement. Crée une phrase secrète
                    pour activer un chiffrement zéro-connaissance (illisible même par Google).
                </p>
                <button
                    onClick={() => setCreateOpen(true)}
                    className="px-3 py-1.5 rounded-card bg-primary/15 border border-primary/40 text-primary text-meta font-medium hover:bg-primary/25"
                >
                    Créer une phrase secrète
                </button>
                {cleanupBlock}
                <PassphraseCreate isOpen={createOpen} onClose={() => setCreateOpen(false)} onActivated={() => setCreateOpen(false)} />
            </div>
        );
    }

    return (
        <div className="p-3 rounded-card bg-success-500/10 border border-success-500/30 space-y-2">
            <div className="text-meta font-semibold text-emerald-300">Chiffrement par passphrase actif</div>
            <p className="text-tiny text-ink-300 leading-snug">
                Tes sauvegardes Drive sont chiffrées avec ta passphrase. Pour revenir à « juste mon compte
                Google » (sans passphrase), retire-la : ta sauvegarde Drive repassera en clair.
            </p>
            <p className="text-tiny text-ink-400">
                {remembered
                    ? 'Mémorisée sur cet appareil (déverrouillage biométrique requis à chaque usage).'
                    : 'Non mémorisée sur cet appareil : redemandée à chaque session.'}
            </p>
            <div className="flex flex-wrap gap-3">
                <button
                    onClick={onVoirCarte}
                    className="text-tiny text-ink-400 underline underline-offset-2 hover:text-ink-200"
                >
                    Voir la carte de récupération
                </button>
                {remembered && (
                    <button
                        onClick={() => void onOublierAppareil()}
                        className="text-tiny text-ink-400 underline underline-offset-2 hover:text-ink-200"
                    >
                        Oublier cet appareil
                    </button>
                )}
                <button
                    onClick={onClear}
                    disabled={status.busy || busy}
                    className="text-tiny text-ink-400 underline underline-offset-2 hover:text-ink-200 disabled:opacity-50"
                >
                    {busy ? '…' : 'Effacer la passphrase (repasser en clair)'}
                </button>
            </div>
            {cleanupBlock}
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
        // 'error' : message rouge déjà affiché via le statut ; 'not-configured' : carte masquée ;
        // 'conflict' : le modal global de conflit (SyncConflictModal) prend le relais.
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
        <Card icon={<Icon name="cloud" size={18} />} title="Synchronisation Google Drive">
            <div className="space-y-4">
                <p className="text-tiny text-ink-300 leading-snug">
                    Sauvegarde dans <strong>ton</strong> Google Drive privé — retrouve tout sur chaque appareil.
                </p>

                {/* Honnêteté : par défaut pas de chiffrement applicatif ; les clés API SONT incluses (sync v2).
                    Une passphrase optionnelle (ci-dessous, une fois connecté) active le chiffrement zéro-knowledge. */}
                {!status.passphraseActive && (
                    <p className="text-tiny text-warning-400/90 leading-snug">
                        Sauvegarde dans <strong>ton</strong> Google Drive privé — tes données et tes clés API y sont
                        incluses pour que tu retrouves tout sur chaque appareil sans rien ressaisir.
                    </p>
                )}

                {/* La résolution de conflit vit désormais dans le modal GLOBAL `SyncConflictModal`
                    (overlay, monté au niveau App, avec résumé « cet appareil vs Drive » + distinction
                    chiffré/clair) → surgit au premier plan quel que soit l'onglet. L'ancienne UI inline
                    ici était redondante (mêmes boutons, sans les compteurs) — retirée 2026-07-14. */}

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
                            <span className="block text-tiny text-ink-400">
                                Synchronisation automatique active · sauvegarde manuelle ci-dessous.
                            </span>
                        </div>

                        {/* Passphrase optionnelle (zéro-knowledge) + invite si un pull a trouvé un blob chiffré. */}
                        <PassphraseSection status={status} />

                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={onPush}
                                disabled={status.busy}
                                className="px-3 py-1.5 rounded-card bg-white/5 border border-white/40 text-ink-200 text-meta font-medium hover:bg-white/10 disabled:opacity-50"
                            >
                                {status.busy ? '…' : 'Sauvegarder maintenant'}
                            </button>
                            <button
                                onClick={onPull}
                                disabled={status.busy}
                                className="px-3 py-1.5 rounded-card bg-white/5 border border-white/40 text-ink-200 text-meta font-medium hover:bg-white/10 disabled:opacity-50"
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
                                        className="px-3 py-1.5 rounded-card bg-white/5 border border-white/40 text-ink-200 text-meta font-medium hover:bg-white/10"
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
