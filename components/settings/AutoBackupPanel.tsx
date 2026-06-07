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
import {
    listBackups, createBackupNow, deleteBackup, clearAllBackups, restoreBackup,
    getBackupStats, type BackupEntry,
} from '../../services/backupAuto';

export const AutoBackupPanel: React.FC = () => {
    const [backups, setBackups] = useState<BackupEntry[]>([]);
    const [stats, setStats] = useState<{ count: number; totalBytes: number; oldest?: number; newest?: number }>({ count: 0, totalBytes: 0 });
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
        const entry = await createBackupNow('manual');
        setIsCreating(false);
        if (entry) {
            showToast(`Backup créé (${(entry.sizeBytes / 1024).toFixed(1)} KB).`, 'success');
            refresh();
        } else {
            showToast("Impossible de créer le backup (localStorage vide ou IndexedDB indispo).", 'error');
        }
    };

    const handleRestore = async () => {
        if (!confirmRestore) return;
        const ok = await restoreBackup(confirmRestore.id);
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
                    L'app crée 1 backup automatique par jour dans le IndexedDB local. Rolling 7 jours
                    (les plus anciens sont supprimés). Stocké uniquement sur ton appareil — jamais envoyé.
                </p>

                {/* Stats + actions */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="bg-white/5 rounded p-2 border border-white/10">
                        <div className="text-tiny text-ink-400 uppercase">Backups</div>
                        <div className="text-base font-bold text-white">{stats.count}</div>
                    </div>
                    <div className="bg-white/5 rounded p-2 border border-white/10">
                        <div className="text-tiny text-ink-400 uppercase">Taille totale</div>
                        <div className="text-base font-bold text-white">{(stats.totalBytes / 1024).toFixed(1)} KB</div>
                    </div>
                    <div className="bg-white/5 rounded p-2 border border-white/10">
                        <div className="text-tiny text-ink-400 uppercase">Plus récent</div>
                        <div className="text-base font-bold text-white">{stats.newest ? formatDate(stats.newest) : '—'}</div>
                    </div>
                    <div className="bg-white/5 rounded p-2 border border-white/10">
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
                        {isCreating ? '⏳ Création…' : '+ Backup maintenant'}
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
                            🗑️ Vider tout
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
                            <div key={entry.id} className="flex items-center gap-3 p-2 bg-white/5 rounded border border-white/5 text-meta">
                                <span aria-hidden="true" className="shrink-0">{entry.source === 'auto' ? '⚙️' : '✋'}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-ink-100 font-mono">{formatDate(entry.timestamp)} {new Date(entry.timestamp).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}</div>
                                    <div className="text-tiny text-ink-500">{(entry.sizeBytes / 1024).toFixed(1)} KB · {entry.source === 'auto' ? 'auto' : 'manuel'}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setConfirmRestore(entry)}
                                    className="px-2 py-1 text-tiny bg-info-500/15 hover:bg-info-500/25 border border-info-500/30 rounded text-info-300 transition-colors focus-ring"
                                    title="Restaurer ce backup (reload)"
                                >
                                    ↻ Restaurer
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setConfirmDelete(entry)}
                                    className="px-2 py-1 text-tiny text-danger-400 hover:text-red-300 transition-colors focus-ring rounded"
                                    title="Supprimer ce backup"
                                    aria-label={`Supprimer le backup du ${formatDate(entry.timestamp)}`}
                                >
                                    🗑️
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Card>
    );
};
