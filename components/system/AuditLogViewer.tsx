// P1.7 — Viewer pour le journal d'audit (changements de state).
//
// Pattern identique à ErrorLogViewer : table, filtres, export, clear.

import React, { useState, useMemo, useCallback } from 'react';
import { Card } from '../ui/Card';
import { ConfirmModal } from '../ui/ConfirmModal';
import { showToast } from '../ui/Toast';
import { getAuditLog, clearAuditLog, getAuditStats, exportAuditLogAsJSON, type AuditEntry } from '../../services/auditLog';

const OP_COLORS: Record<AuditEntry['operation'], string> = {
    add: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/5',
    remove: 'text-red-300 border-red-500/30 bg-red-500/5',
    update: 'text-info-300 border-info-500/30 bg-info-500/5',
    replace: 'text-amber-300 border-amber-500/30 bg-amber-500/5',
};

const OP_ICONS: Record<AuditEntry['operation'], string> = {
    add: '➕',
    remove: '➖',
    update: '✏️',
    replace: '🔄',
};

export const AuditLogViewer: React.FC = () => {
    const [fieldFilter, setFieldFilter] = useState<string>('all');
    const [opFilter, setOpFilter] = useState<AuditEntry['operation'] | 'all'>('all');
    const [confirmClear, setConfirmClear] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    // refreshKey force le recalcul volontairement (incrémenté par le bouton Rafraîchir et handleClear).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const entries = useMemo(() => getAuditLog(), [refreshKey]);
    // refreshKey force le recalcul volontairement (incrémenté par le bouton Rafraîchir et handleClear).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const stats = useMemo(() => getAuditStats(), [refreshKey]);
    const allFields = useMemo(() => Array.from(new Set(entries.map(e => e.field))).sort(), [entries]);

    const filtered = useMemo(() => entries.filter(e => {
        if (fieldFilter !== 'all' && e.field !== fieldFilter) return false;
        if (opFilter !== 'all' && e.operation !== opFilter) return false;
        return true;
    }), [entries, fieldFilter, opFilter]);

    const handleExport = useCallback(() => {
        const url = exportAuditLogAsJSON();
        const a = document.createElement('a');
        a.href = url;
        a.download = `financeai-audit-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast(`${entries.length} entrée(s) exportée(s).`, 'success');
    }, [entries.length]);

    const handleClear = useCallback(() => {
        clearAuditLog();
        setRefreshKey(k => k + 1);
        setConfirmClear(false);
        showToast("Journal d'audit vidé.", 'info');
    }, []);

    return (
        <Card title="📋 Journal d'audit (changements de state)">
            <ConfirmModal
                isOpen={confirmClear}
                onConfirm={handleClear}
                onCancel={() => setConfirmClear(false)}
                title="Vider le journal d'audit"
                message={`Supprimer définitivement les ${entries.length} entrée(s) d'audit ?`}
                confirmLabel="Vider"
            />
            <div className="space-y-4">
                <p className="text-tiny text-gray-400 leading-snug">
                    Trace les changements importants du state (ajouts, suppressions, mises à jour).
                    Rolling buffer 500 entrées en localStorage. Aucune donnée envoyée.
                </p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="bg-white/5 rounded p-2 border border-white/10">
                        <div className="text-tiny text-ink-400 uppercase">Total</div>
                        <div className="text-base font-bold text-white">{stats.total}</div>
                    </div>
                    <div className="bg-white/5 rounded p-2 border border-white/10">
                        <div className="text-tiny text-ink-400 uppercase">24h</div>
                        <div className="text-base font-bold text-white">{stats.last24h}</div>
                    </div>
                    <div className="bg-emerald-500/10 rounded p-2 border border-emerald-500/30">
                        <div className="text-tiny text-emerald-400 uppercase">Adds</div>
                        <div className="text-base font-bold text-emerald-300">{stats.byOperation.add ?? 0}</div>
                    </div>
                    <div className="bg-red-500/10 rounded p-2 border border-red-500/30">
                        <div className="text-tiny text-red-400 uppercase">Removes</div>
                        <div className="text-base font-bold text-red-300">{stats.byOperation.remove ?? 0}</div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    <label className="text-tiny text-ink-400">Champ :</label>
                    <select
                        aria-label="Filtrer par champ modifié"
                        value={fieldFilter}
                        onChange={e => setFieldFilter(e.target.value)}
                        className="bg-dark border border-white/10 rounded px-2 py-1 text-meta text-white"
                    >
                        <option value="all">Tous</option>
                        {allFields.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <label className="text-tiny text-ink-400 ml-2">Opération :</label>
                    <select
                        aria-label="Filtrer par type d'opération"
                        value={opFilter}
                        onChange={e => setOpFilter(e.target.value as AuditEntry['operation'] | 'all')}
                        className="bg-dark border border-white/10 rounded px-2 py-1 text-meta text-white"
                    >
                        <option value="all">Toutes</option>
                        <option value="add">add</option>
                        <option value="remove">remove</option>
                        <option value="update">update</option>
                        <option value="replace">replace</option>
                    </select>
                    <div className="ml-auto flex gap-2">
                        <button type="button" onClick={() => setRefreshKey(k => k + 1)} className="px-3 py-1 text-tiny bg-white/5 hover:bg-white/10 rounded text-ink-300 focus-ring">↻ Rafraîchir</button>
                        <button type="button" onClick={handleExport} disabled={entries.length === 0} className="px-3 py-1 text-tiny bg-info-500/15 hover:bg-info-500/25 border border-info-500/30 rounded text-info-300 focus-ring disabled:opacity-50">📤 Exporter</button>
                        <button type="button" onClick={() => setConfirmClear(true)} disabled={entries.length === 0} className="px-3 py-1 text-tiny bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 rounded text-red-300 focus-ring disabled:opacity-50">🗑️ Vider</button>
                    </div>
                </div>

                {filtered.length === 0 ? (
                    <div className="text-center py-6 text-meta text-ink-400 italic">
                        {entries.length === 0
                            ? "Aucun changement enregistré. Le journal se remplira au fur et à mesure des modifications importantes."
                            : 'Aucune entrée ne correspond aux filtres actuels.'}
                    </div>
                ) : (
                    <div className="space-y-1 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                        {filtered.map(e => {
                            const colors = OP_COLORS[e.operation];
                            const date = new Date(e.timestamp).toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'medium' });
                            return (
                                <div key={e.id} className={`text-tiny rounded border px-3 py-2 ${colors}`}>
                                    <div className="flex items-center gap-2">
                                        <span aria-hidden="true">{OP_ICONS[e.operation]}</span>
                                        <span className="font-mono opacity-60 shrink-0">{date}</span>
                                        <span className="font-bold shrink-0 uppercase text-tiny opacity-80">{e.field}</span>
                                        <span className="flex-1 min-w-0 truncate">{e.description}</span>
                                        {e.countBefore !== undefined && e.countAfter !== undefined && (
                                            <span className="font-mono opacity-60 shrink-0">
                                                {e.countBefore} → {e.countAfter}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Card>
    );
};
