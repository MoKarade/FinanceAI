import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useTimeChartZoom } from '../../hooks/useTimeChartZoom';
import { splitEventIcon } from './ProjectionTooltip';

/**
 * G9 P1 — fenêtre détaillée du graphique Futur (clic sur la courbe).
 *
 * Rendue via createPortal(document.body) pour échapper à l'ancêtre transformé
 * (`animate-fade-in`) qui piège position:fixed. Montre, pour le mois cliqué :
 * la valeur nette, tous les comptes (valeur + variation du mois), les flux
 * revenus/dépenses et le détail des événements. Clic sur un compte → son
 * historique (mini-graph zoomable réutilisant `useTimeChartZoom`).
 *
 * Phase 2 (à venir) : contribution-vs-gain + flèches de transfert (nécessite
 * une extension du moteur).
 */

interface AccountDef {
    key: string;
    label: string;
    color: string;
}

const ACCOUNTS: AccountDef[] = [
    { key: 'Liquidites', label: 'Cash (Coussin)', color: '#4b5563' },
    { key: 'CELI', label: 'CELI', color: '#10b981' },
    { key: 'REER', label: 'REER', color: '#3b82f6' },
    { key: 'REEE', label: 'REEE (Études)', color: '#06b6d4' },
    { key: 'NonReg', label: 'Non-Enregistré', color: '#f59e0b' },
    { key: 'Crypto', label: 'Crypto', color: '#a855f7' },
    { key: 'Immobilier', label: 'Immobilier', color: '#ec4899' },
];

interface FutureDetailModalProps {
    point: any;
    chartData: any[];
    userName1?: string;
    userName2?: string;
    isPrivacyMode?: boolean;
    onClose: () => void;
}

export const FutureDetailModal: React.FC<FutureDetailModalProps> = ({
    point, chartData, userName1, userName2, isPrivacyMode = false, onClose,
}) => {
    const [selected, setSelected] = useState<AccountDef | null>(null);

    const idx = useMemo(
        () => chartData.findIndex((d) => d.monthIndex === point.monthIndex),
        [chartData, point.monthIndex],
    );
    const prev = idx > 0 ? chartData[idx - 1] : null;

    const accounts = ACCOUNTS.map((a) => {
        const value = point[a.key] || 0;
        const variation = value - (prev ? (prev[a.key] || 0) : value);
        return { ...a, value, variation };
    }).filter((a) => a.value !== 0 || a.variation !== 0);

    // Série temporelle du compte sélectionné (drill-down).
    const accountSeries = useMemo(() => {
        if (!selected) return [] as any[];
        return chartData.map((d) => ({ monthIndex: d.monthIndex, year: d.year, value: d[selected.key] || 0 }));
    }, [chartData, selected]);
    const zoom = useTimeChartZoom<any>(accountSeries);
    const lastMonth = accountSeries.length ? accountSeries[accountSeries.length - 1].monthIndex : 0;
    const idxForYears = (yrs: number) => {
        const i = accountSeries.findIndex((d) => d.monthIndex >= yrs * 12);
        return i === -1 ? accountSeries.length - 1 : i;
    };

    const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-CA')} $`;
    const blur = isPrivacyMode ? 'privacy-blur' : '';

    const portfolioOutflow = (point.RetraitREER || 0) + (point.RetraitCELI || 0);
    const incomes = ([
        [`Paye ${userName1 || 'Util. 1'}`, point.IncomeMarc || 0],
        [`Paye ${userName2 || 'Util. 2'}`, point.IncomeAnna || 0],
        ['Rentes / Retraite', point.IncomeRetirement || 0],
        ['Décaissement portfolio', portfolioOutflow],
    ] as Array<[string, number]>).filter((entry) => entry[1] > 0);

    return createPortal(
        <div
            className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Détail du mois"
        >
            <div
                className="bg-[#0B0E14] border border-white/15 rounded-2xl shadow-[0_20px_70px_rgba(0,0,0,0.85)] w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5"
                onClick={(e) => e.stopPropagation()}
            >
                {/* En-tête */}
                <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b border-white/15">
                    <div>
                        <div className="text-lg font-black text-white tracking-tight">{point.dateLabel || point.year || '—'}</div>
                        <div className="text-tiny text-ink-400 mt-0.5">Âge {point.age ?? '—'}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-tiny uppercase tracking-widest text-ink-400 font-bold">Valeur nette</div>
                        <div className={`text-2xl font-black text-white font-mono leading-none mt-0.5 ${blur}`}>{fmt(point.NetWorth || 0)}</div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Fermer"
                        className="shrink-0 text-ink-400 hover:text-white text-lg leading-none p-1 -m-1 rounded focus-ring"
                    >
                        ✕
                    </button>
                </div>

                {!selected ? (
                    <>
                        {/* Comptes */}
                        <div className="text-tiny uppercase tracking-widest text-ink-400 font-bold mb-2">
                            Comptes — clique pour l'historique
                        </div>
                        <div className="space-y-1.5 mb-5">
                            {accounts.map((a) => (
                                <button
                                    key={a.key}
                                    type="button"
                                    onClick={() => setSelected(a)}
                                    className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 transition-colors text-left focus-ring"
                                >
                                    <span className="flex items-center gap-2 min-w-0">
                                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: a.color }} />
                                        <span className="text-sm text-white truncate">{a.label}</span>
                                    </span>
                                    <span className="flex items-center gap-2.5 shrink-0">
                                        <span className={`font-mono text-sm text-white ${blur}`}>{fmt(a.value)}</span>
                                        <span className={`font-mono text-tiny px-1.5 py-0.5 rounded ${a.variation >= 0 ? 'text-green-300 bg-green-500/10' : 'text-red-300 bg-red-500/10'} ${blur}`}>
                                            {a.variation > 0 ? '+' : ''}{fmt(a.variation)}
                                        </span>
                                        <span className="text-ink-500" aria-hidden="true">›</span>
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Flux du mois */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
                            {incomes.map(([label, v]) => (
                                <div key={label} className="flex justify-between text-xs bg-white/[0.03] rounded-lg px-2.5 py-1.5">
                                    <span className="text-ink-400">{label}</span>
                                    <span className={`font-mono text-green-400 ${blur}`}>+{fmt(v)}</span>
                                </div>
                            ))}
                            {(point.Expenses || 0) > 0 && (
                                <div className="flex justify-between text-xs bg-white/[0.03] rounded-lg px-2.5 py-1.5">
                                    <span className="text-ink-400">Dépenses</span>
                                    <span className={`font-mono text-red-400 ${blur}`}>-{fmt(point.Expenses || 0)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-xs font-bold bg-white/[0.05] rounded-lg px-2.5 py-1.5">
                                <span className="text-ink-200">Variation nette (mois)</span>
                                <span className={`font-mono ${(point.diffNW || 0) >= 0 ? 'text-green-400' : 'text-red-400'} ${blur}`}>
                                    {(point.diffNW || 0) > 0 ? '+' : ''}{fmt(point.diffNW || 0)}
                                </span>
                            </div>
                        </div>

                        {/* Événements */}
                        {(point.lifeEvents?.length > 0 || point.flowEvents?.length > 0) && (
                            <div className="border-t border-white/10 pt-3">
                                <div className="text-tiny uppercase tracking-widest text-yellow-500 font-bold mb-2">Événements ce mois</div>
                                <ul className="space-y-1.5">
                                    {[...(point.lifeEvents || []), ...(point.flowEvents || [])].map((e: string, i: number) => {
                                        const { icon, text } = splitEventIcon(e);
                                        return (
                                            <li key={i} className="flex items-start gap-2 text-sm text-ink-100">
                                                <span className="shrink-0" aria-hidden="true">{icon}</span>
                                                <span className="flex-1 break-words">{text}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        {/* Drill-down compte */}
                        <button
                            type="button"
                            onClick={() => setSelected(null)}
                            className="text-tiny font-bold text-ink-300 hover:text-white mb-3 focus-ring rounded"
                        >
                            ‹ Retour aux comptes
                        </button>
                        <div className="flex items-center gap-2 mb-3">
                            <span className="w-3 h-3 rounded-full" style={{ background: selected.color }} />
                            <span className="font-bold text-white">{selected.label}</span>
                            <span className={`ml-auto font-mono text-sm text-white ${blur}`}>{fmt(point[selected.key] || 0)}</span>
                        </div>

                        {/* Sélecteur de période */}
                        <div className="flex gap-0.5 p-0.5 rounded-card bg-black/30 border border-white/5 w-fit mb-2">
                            {[5, 10, 20, 30].filter((y) => y * 12 < lastMonth).map((y) => {
                                const active = !!zoom.range && zoom.range[0] === 0 && zoom.range[1] === idxForYears(y);
                                return (
                                    <button
                                        key={y}
                                        type="button"
                                        onClick={() => zoom.showRange(0, idxForYears(y))}
                                        className={`px-2 py-0.5 text-tiny font-bold rounded transition-colors focus-ring ${active ? 'bg-primary text-white' : 'text-ink-300 hover:text-white hover:bg-white/10'}`}
                                    >
                                        {y} ans
                                    </button>
                                );
                            })}
                            <button
                                type="button"
                                onClick={zoom.reset}
                                className={`px-2 py-0.5 text-tiny font-bold rounded transition-colors focus-ring ${!zoom.isZoomed ? 'bg-primary text-white' : 'text-ink-300 hover:text-white hover:bg-white/10'}`}
                            >
                                Tout
                            </button>
                        </div>

                        <div
                            ref={zoom.containerRef}
                            {...zoom.handlers}
                            className={`relative w-full h-[300px] select-none ${zoom.isZoomed && zoom.isPanning ? 'cursor-grabbing' : zoom.isZoomed ? 'cursor-grab' : 'cursor-default'}`}
                        >
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={zoom.visibleData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="acct-grad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={selected.color} stopOpacity={0.6} />
                                            <stop offset="95%" stopColor={selected.color} stopOpacity={0.03} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                                    <XAxis
                                        dataKey="monthIndex"
                                        stroke="#666"
                                        tick={{ fontSize: 10 }}
                                        minTickGap={40}
                                        tickFormatter={(v) => { const m = accountSeries.find((d) => d.monthIndex === v); return m ? `${m.year}` : `${v}`; }}
                                    />
                                    <YAxis stroke="#666" tick={{ fontSize: 10 }} width={50} tickFormatter={(v) => isPrivacyMode ? '***' : `${(v / 1000).toFixed(0)}k`} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#11161f', borderColor: '#333', borderRadius: 8, fontSize: 12 }}
                                        formatter={(v: number) => [isPrivacyMode ? '*** $' : fmt(v), selected.label]}
                                        labelFormatter={(v) => { const m = chartData.find((d) => d.monthIndex === v); return m ? (m.dateLabel || m.year) : v; }}
                                    />
                                    <Area type="monotone" dataKey="value" stroke={selected.color} strokeWidth={2} fill="url(#acct-grad)" isAnimationActive={false} name={selected.label} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-tiny text-ink-600 mt-2 text-center">Molette = zoom · glisser = défiler · double-clic = reset</p>
                    </>
                )}
            </div>
        </div>,
        document.body,
    );
};
