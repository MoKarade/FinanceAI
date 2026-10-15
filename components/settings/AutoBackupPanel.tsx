// P1.3 — Panel UI pour les backups automatiques rolling IndexedDB.
//
// Affiche la liste des backups (du plus récent au plus ancien),
// permet de : restaurer un backup, supprimer, créer un nouveau manuellement,
// vider tout.

import React, { useEffect, useState, useCallback } from 'react';
import { Card } from '../ui/Card';
import { ConfirmModal } from '../ui/ConfirmModal';
import { showToast } from '../ui/Toast';
import { formatDate } from '../../utils/format';
import { Icon } from '../ui/Icon';
import { useFinanceStore } from '../../store/useFinanceStore';
import {
    listBackups, createBackupNow, deleteBackup, clearAllBackups, restoreBackup,
    getBackupStats, type BackupEntry,
} from '../../services/backupAuto';

export const AutoBackupPanel: React.FC = () => {
    const [backups, setBackups] = useState<BackupEntry[]>([]);
    const [stats, setStats] = useState<{ count: number; totalBytes: number; oldest?: number; newest?: number }>({ count: 0, totalBytes: 0 });
    // ⚠️ ABONNEMENT au store, pas une lecture ponctuelle : ce composant reste monté pendant
    // qu'on entre ou sort du mode fictif, et une valeur capturée au montage laisserait le
    // bouton accepter une archive de données fictives après la bascule — sans rien de rouge.
    const donneesFictives = useFinanceStore(s => s.isTestMode === true);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [confirmRestore, setConfirmRestore] = useState<BackupEntry | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<BackupEntry | null>(null);
    const [confirmClearAll, setConfirmClearAll] = useState(false);

    const refresh = useCallback(async () => {
        setIsLoading(true);
        const [list, s] = await Promise.all([listBackups(), getBackupStats()]);
        setBackups(list);
        setStats(s);
        setIsLoading(false);
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const handleCreate = async () => {
        setIsCreating(true);
        // ARCHIVE : c'est le geste « je veux retrouver cet état plus tard ». Refusé sur des
        // données fictives — et le refus s'EXPLIQUE, il ne se confond pas avec une panne : un
        // même message pour « règle métier » et « IndexedDB cassé » enverrait Marc réparer un
        // disque qui va très bien (choix de Marc, 21/09/2026 : refuser plutôt qu'étiqueter).
        const r = await createBackupNow('manual', { intent: 'archive', donneesFictives });
        setIsCreating(false);
        if (r.ok) {
            showToast(`Backup créé (${(r.entry.sizeBytes / 1024).toFixed(1)} KB).`, 'success');
            refresh();
        } else if (r.cause === 'donnees-fictives') {
            showToast("Sauvegarde refusée : l'app affiche des données fictives (mode test / bac à sable). Reviens aux données réelles pour sauvegarder.", 'error');
        } else {
            showToast("Impossible de créer le backup (localStorage vide ou IndexedDB indispo).", 'error');
        }
    };

    const handleRestore = async () => {
        if (!confirmRestore) return;
        const ok = await restoreBackup(confirmRestore.id, donneesFictives);
        setConfirmRestore(null);
        if (!ok) showToast('Restauration échouée.', 'error');
        // Si ok → window.location.reload() est déjà déclenché par restoreBackup
    };

    const handleDelete = async () => {
        if (!confirmDelete) return;
        await deleteBackup(confirmDelete.id);
        setConfirmDelete(null);
        showToast('Backup supprimé.', 'info');
        refresh();
    };

    const handleClearAll = async () => {
        await clearAllBackups();
        setConfirmClearAll(false);
        showToast('Tous les backups supprimés.', 'info');
        refresh();
    };

    return (
        <Card icon={<Icon name="lifebuoy" size={18} />} title="Backups automatiques (IndexedDB rolling 7 jours)">
            <ConfirmModal
                isOpen={!!confirmRestore}
                onConfirm={handleRestore}
                onCancel={() => setConfirmRestore(null)}
                title="Restaurer ce backup ?"
                message={confirmRestore ? `Restaurer le backup du ${formatDate(confirmRestore.timestamp)} ? L'état actuel sera écrasé. Un backup auto de l'état courant sera créé avant la restauration. La page va recharger.` : ''}
                confirmLabel="Restaurer"
            />
            <ConfirmModal
                isOpen={!!confirmDelete}
                onConfirm={handleDelete}
                onCancel={() => setConfirmDelete(null)}
                title="Supprimer ce backup ?"
                message={confirmDelete ? `Supprimer le backup du ${formatDate(confirmDelete.timestamp)} ? Cette action est irréversible.` : ''}
                confirmLabel="Supprimer"
            />
            <ConfirmModal
                isOpen={confirmClearAll}
                onConfirm={handleClearAll}
                onCancel={() => setConfirmClearAll(false)}
                title="Vider tous les backups ?"
                message={`Supprimer définitivement les ${backups.length} backup(s) ? Action irréversible.`}
                confirmLabel="Vider"
            />

            <div className="space-y-4">
                <p className="text-tiny text-ink-300 leading-snug">
                    1 backup auto/jour en local (rolling 7 jours). Jamais envoyé.
                </p>

                {/* Stats + actions */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="bg-white/5 rounded-sm p-2 border border-white/10">
                        <div className="text-tiny text-ink-400 uppercase">Backups</div>
                        <div className="text-base font-bold text-white">{stats.count}</div>
                    </div>
                    <div className="bg-white/5 rounded-sm p-2 border border-white/10">
                        <div className="text-tiny text-ink-400 uppercase">Taille totale</div>
                        <div className="text-base font-bold text-white">{(stats.totalBytes / 1024).toFixed(1)} KB</div>
                    </div>
                    <div className="bg-white/5 rounded-sm p-2 border border-white/10">
                        <div className="text-tiny text-ink-400 uppercase">Plus récent</div>
                        <div className="text-base font-bold text-white">{stats.newest ? formatDate(stats.newest) : '—'}</div>
                    </div>
                    <div className="bg-white/5 rounded-sm p-2 border border-white/10">
                        <div className="text-tiny text-ink-400 uppercase">Plus ancien</div>
                        <div className="text-base font-bold text-white">{stats.oldest ? formatDate(stats.oldest) : '—'}</div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={handleCreate}
                        disabled={isCreating}
                        className="px-3 py-1.5 bg-primary/15 hover:bg-primary/25 border border-primary/40 text-primary text-tiny font-bold rounded-card transition-colors focus-ring disabled:opacity-50"
                    >
                        {isCreating ? 'Création…' : '+ Backup maintenant'}
                    </button>
                    <button
                        type="button"
                        onClick={refresh}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-ink-300 text-tiny font-bold rounded-card transition-colors focus-ring"
                    >
                        ↻ Rafraîchir
                    </button>
                    {backups.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setConfirmClearAll(true)}
                            className="ml-auto px-3 py-1.5 bg-danger-500/15 hover:bg-danger-500/25 border border-danger-500/30 text-red-300 text-tiny font-bold rounded-card transition-colors focus-ring"
                        >
                            Vider tout
                        </button>
                    )}
                </div>

                {/* Liste */}
                {isLoading ? (
                    <div className="text-meta text-ink-400 py-4 text-center">Chargement…</div>
                ) : backups.length === 0 ? (
                    <div className="text-meta text-ink-400 py-4 text-center italic">
                        Aucun backup encore. Un sera créé automatiquement au prochain boot.
                    </div>
                ) : (
                    <div className="space-y-1 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                        {backups.map(entry => (
                            <div key={entry.id} className="flex items-center gap-3 p-2 bg-white/5 rounded-sm border border-white/5 text-meta">
                                <Icon name={entry.source === 'auto' ? 'settings' : 'users'} size={14} className="shrink-0 text-ink-400" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-ink-100 font-mono">{formatDate(entry.timestamp)} {new Date(entry.timestamp).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}</div>
                                    <div className="text-tiny text-ink-400">{(entry.sizeBytes / 1024).toFixed(1)} KB · {entry.source === 'auto' ? 'auto' : 'manuel'}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setConfirmRestore(entry)}
                                    className="px-2 py-1 text-tiny bg-info-500/15 hover:bg-info-500/25 border border-info-500/30 rounded-sm text-info-400 transition-colors focus-ring"
                                    title="Restaurer ce backup (reload)"
                                >
                                    ↻ Restaurer
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setConfirmDelete(entry)}
                                    className="px-2 py-1.5 text-tiny text-danger-400 hover:text-red-300 transition-colors focus-ring rounded-sm"
                                    title="Supprimer ce backup"
                                    aria-label={`Supprimer le backup du ${formatDate(entry.timestamp)}`}
                                >
                                    <Icon name="trash" size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Card>
    );
};
