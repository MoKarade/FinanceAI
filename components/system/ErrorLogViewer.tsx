// P1.1 — UI consultation des erreurs loggées.
//
// Affiche la table des erreurs avec filtres par source/severity + boutons
// pour exporter en JSON (téléchargement) ou vider le journal.

import React, { useState, useMemo, useCallback } from 'react';
import { Card } from '../ui/Card';
import { getErrors, clearErrors, getErrorStats, exportErrorsAsJSON, type LoggedError, type ErrorSource, type ErrorSeverity } from '../../services/errorLogger';
import { ConfirmModal } from '../ui/ConfirmModal';
import { showToast } from '../ui/Toast';
import { Icon } from '../ui/Icon';

const SOURCE_ICONS: Record<ErrorSource, string> = {
    ai: '✨',
    projection: '🔮',
    ui: '🖥️',
    network: '🌐',
    storage: '💾',
    unknown: '❓',
};

const SEVERITY_COLORS: Record<ErrorSeverity, string> = {
    info: 'text-info-400 bg-info-500/10 border-info-500/30',
    warning: 'text-warning-400 bg-warning-500/10 border-warning-500/30',
    error: 'text-danger-400 bg-danger-500/10 border-danger-500/30',
    critical: 'text-red-200 bg-red-700/30 border-danger-500/50',
};

export const ErrorLogViewer: React.FC = () => {
    const [sourceFilter, setSourceFilter] = useState<ErrorSource | 'all'>('all');
    const [severityFilter, setSeverityFilter] = useState<ErrorSeverity | 'all'>('all');
    const [confirmClear, setConfirmClear] = useState(false);
    // Force re-render quand on clear/refresh (errors lives in localStorage hors React)
    const [refreshKey, setRefreshKey] = useState(0);

    // refreshKey force le recalcul volontairement (incrémenté par le bouton Rafraîchir et handleClear).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const errors = useMemo(() => getErrors(), [refreshKey]);
    // refreshKey force le recalcul volontairement (incrémenté par le bouton Rafraîchir et handleClear).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const stats = useMemo(() => getErrorStats(), [refreshKey]);

    const filtered = useMemo(() => {
        return errors.filter(e => {
            if (sourceFilter !== 'all' && e.source !== sourceFilter) return false;
            if (severityFilter !== 'all' && e.severity !== severityFilter) return false;
            return true;
        });
    }, [errors, sourceFilter, severityFilter]);

    const handleExport = useCallback(() => {
        const url = exportErrorsAsJSON();
        const a = document.createElement('a');
        a.href = url;
        a.download = `financeai-errors-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Le revoke est différé pour donner au browser le temps de déclencher le download
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast(`${errors.length} erreur(s) exportée(s) en JSON.`, 'success');
    }, [errors.length]);

    const handleClear = useCallback(() => {
        clearErrors();
        setRefreshKey(k => k + 1);
        setConfirmClear(false);
        showToast('Journal des erreurs vidé.', 'info');
    }, []);

    const allSources: Array<ErrorSource | 'all'> = ['all', 'ai', 'projection', 'ui', 'network', 'storage', 'unknown'];
    const allSeverities: Array<ErrorSeverity | 'all'> = ['all', 'info', 'warning', 'error', 'critical'];

    return (
        <Card icon={<Icon name="shield" size={18} />} title="Journal d'erreurs (local)">
            <ConfirmModal
                isOpen={confirmClear}
                onConfirm={handleClear}
                onCancel={() => setConfirmClear(false)}
                title="Vider le journal"
                message={`Supprimer définitivement les ${errors.length} entrée(s) du journal d'erreurs ?`}
                confirmLabel="Vider"
            />
            <div className="space-y-4">
                <p className="text-tiny text-ink-300 leading-snug">
                    Captures locales des erreurs IA / projection / UI. Rolling buffer 100 entrées en
                    localStorage. <strong>Aucune donnée envoyée sur le réseau.</strong>
                </p>

                {/* Stats synthèse */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="bg-white/5 rounded p-2 border border-white/10">
                        <div className="text-tiny text-ink-400 uppercase">Total</div>
                        <div className="text-base font-bold text-white">{stats.total}</div>
                    </div>
                    <div className="bg-white/5 rounded p-2 border border-white/10">
                        <div className="text-tiny text-ink-400 uppercase">24h</div>
                        <div className="text-base font-bold text-white">{stats.last24h}</div>
                    </div>
                    <div className="bg-danger-500/10 rounded p-2 border border-danger-500/30">
                        <div className="text-tiny text-danger-400 uppercase">Errors</div>
                        <div className="text-base font-bold text-red-300">{(stats.bySeverity.error ?? 0) + (stats.bySeverity.critical ?? 0)}</div>
                    </div>
                    <div className="bg-warning-500/10 rounded p-2 border border-warning-500/30">
                        <div className="text-tiny text-warning-400 uppercase">Warnings</div>
                        <div className="text-base font-bold text-amber-300">{stats.bySeverity.warning ?? 0}</div>
                    </div>
                </div>

                {/* Filtres */}
                <div className="flex flex-wrap gap-2 items-center">
                    <label className="text-tiny text-ink-400">Source :</label>
                    <select
                        aria-label="Filtrer par source d'erreur"
                        value={sourceFilter}
                        onChange={e => setSourceFilter(e.target.value as ErrorSource | 'all')}
                        className="bg-dark border border-white/10 rounded px-2 py-1 text-meta text-white"
                    >
                        {allSources.map(s => (
                            <option key={s} value={s}>{s === 'all' ? 'Toutes' : `${SOURCE_ICONS[s]} ${s}`}</option>
                        ))}
                    </select>
                    <label className="text-tiny text-ink-400 ml-2">Severity :</label>
                    <select
                        aria-label="Filtrer par niveau de severity"
                        value={severityFilter}
                        onChange={e => setSeverityFilter(e.target.value as ErrorSeverity | 'all')}
                        className="bg-dark border border-white/10 rounded px-2 py-1 text-meta text-white"
                    >
                        {allSeverities.map(s => (
                            <option key={s} value={s}>{s === 'all' ? 'Toutes' : s}</option>
                        ))}
                    </select>
                    <div className="ml-auto flex gap-2">
                        <button
                            type="button"
                            onClick={() => setRefreshKey(k => k + 1)}
                            className="px-3 py-1 text-tiny bg-white/5 hover:bg-white/10 rounded text-ink-300 transition-colors focus-ring"
                            title="Rafraîchir la liste"
                        >
                            ↻ Rafraîchir
                        </button>
                        <button
                            type="button"
                            onClick={handleExport}
                            disabled={errors.length === 0}
                            className="px-3 py-1 text-tiny bg-info-500/15 hover:bg-info-500/25 border border-info-500/30 rounded text-info-300 transition-colors focus-ring disabled:opacity-50"
                        >
                            📤 Exporter JSON
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmClear(true)}
                            disabled={errors.length === 0}
                            className="px-3 py-1 text-tiny bg-danger-500/15 hover:bg-danger-500/25 border border-danger-500/30 rounded text-red-300 transition-colors focus-ring disabled:opacity-50"
                        >
                            🗑️ Vider
                        </button>
                    </div>
                </div>

                {/* Liste */}
                {filtered.length === 0 ? (
                    <div className="text-center py-6 text-meta text-emerald-300 bg-success-500/5 rounded-card border border-success-500/20">
                        {errors.length === 0
                            ? 'Aucune erreur enregistrée. Tout va bien.'
                            : 'Aucune erreur ne correspond aux filtres actuels.'}
                    </div>
                ) : (
                    <div className="space-y-1 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                        {filtered.map(err => <ErrorRow key={err.id} err={err} />)}
                    </div>
                )}
            </div>
        </Card>
    );
};

const ErrorRow: React.FC<{ err: LoggedError }> = ({ err }) => {
    const [expanded, setExpanded] = useState(false);
    const severityClass = SEVERITY_COLORS[err.severity];
    const date = new Date(err.timestamp);
    const dateStr = date.toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'medium' });

    return (
        <div className={`text-tiny rounded border ${severityClass}`}>
            <button
                type="button"
                onClick={() => setExpanded(e => !e)}
                aria-expanded={expanded}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors text-left"
            >
                <span aria-hidden="true">{SOURCE_ICONS[err.source]}</span>
                <span className="font-mono uppercase text-tiny opacity-80 w-20 shrink-0">{err.severity}</span>
                <span className="font-mono opacity-60 shrink-0">{dateStr}</span>
                <span className="flex-1 min-w-0 truncate">{err.message}</span>
                <span aria-hidden="true" className="opacity-50">{expanded ? '−' : '+'}</span>
            </button>
            {expanded && (
                <div className="border-t border-white/10 px-3 py-2 space-y-2 font-mono">
                    {err.stack && (
                        <div>
                            <div className="text-tiny opacity-70 uppercase mb-1">Stack</div>
                            <pre className="text-tiny whitespace-pre-wrap break-all max-h-32 overflow-y-auto bg-black/30 p-2 rounded">{err.stack}</pre>
                        </div>
                    )}
                    {err.context && Object.keys(err.context).length > 0 && (
                        <div>
                            <div className="text-tiny opacity-70 uppercase mb-1">Context</div>
                            <pre className="text-tiny whitespace-pre-wrap bg-black/30 p-2 rounded">{JSON.stringify(err.context, null, 2)}</pre>
                        </div>
                    )}
                    {err.url && (
                        <div className="text-tiny opacity-60">URL : {err.url}</div>
                    )}
                </div>
            )}
        </div>
    );
};
