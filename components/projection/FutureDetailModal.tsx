import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceDot } from 'recharts';
import { useTimeChartZoom } from '../../hooks/useTimeChartZoom';
import { splitEventIcon, ClickableEventIcon } from './ProjectionTooltip';
import { ProjectionChartPoint } from '../../services/projection/types';

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
    /** Champ chartData du gain marché du mois (P2). */
    gainKey?: string;
    /** Champ chartData du flux net du mois (apport − retrait) (P2). */
    flowKey?: string;
    /** Champ chartData « espace + solde » (CELIMax/REERMax) — comptes enregistrés. */
    roomMaxKey?: string;
    /** Champ chartData des cotisations du mois (G19). */
    contribKey?: string;
}

const ACCOUNTS: AccountDef[] = [
    { key: 'Liquidites', label: 'Cash (Coussin)', color: '#4b5563', gainKey: 'MarketGrowthLiquid', flowKey: 'NetTransferLiquid' },
    { key: 'CELI', label: 'CELI', color: '#10b981', gainKey: 'MarketGrowthCELI', flowKey: 'NetTransferCELI', roomMaxKey: 'CELIMax', contribKey: 'ContribCELI' },
    { key: 'CELIAPP', label: 'CELIAPP (FHSA)', color: '#2dd4bf', gainKey: 'MarketGrowthCELIAPP', flowKey: 'NetTransferCELIAPP', roomMaxKey: 'CELIAPPMax', contribKey: 'ContribCELIAPP' },
    { key: 'REER', label: 'REER', color: '#3b82f6', gainKey: 'MarketGrowthREER', flowKey: 'NetTransferREER', roomMaxKey: 'REERMax', contribKey: 'ContribREER' },
    { key: 'REEE', label: 'REEE (Études)', color: '#06b6d4', gainKey: 'MarketGrowthREEE', flowKey: 'NetTransferREEE' },
    { key: 'NonReg', label: 'Non-Enregistré', color: '#f59e0b', gainKey: 'MarketGrowthNonReg', flowKey: 'NetTransferNonReg' },
    { key: 'Crypto', label: 'Crypto', color: '#a855f7', gainKey: 'MarketGrowthCrypto', flowKey: 'NetTransferCrypto' },
    { key: 'Immobilier', label: 'Immobilier', color: '#ec4899' },
];

// G19 — espace de cotisation gagné par année (CELI/REER). Dérivation par
// conservation : espace_gagné(Y) = espace_dispo(fin Y) − espace_dispo(fin Y−1)
// + cotisations(Y). L'espace dispo = Max (espace + solde) − solde. Capture aussi
// le réajout d'espace CELI après retrait. Année 1 : pas de référence → gained=null.
interface RoomYear { year: number; gained: number | null; avail: number }
function computeRoomByYear(chartData: ProjectionChartPoint[], balanceKey: string, maxKey: string, contribKey: string): RoomYear[] {
    const byYear = new Map<number, { availLast: number; contribs: number }>();
    for (const d of chartData) {
        const avail = (Number(d[maxKey]) || 0) - (Number(d[balanceKey]) || 0);
        const yr = d.year ?? 0;
        const cur = byYear.get(yr) || { availLast: 0, contribs: 0 };
        cur.availLast = avail; // dernier mois vu = décembre
        cur.contribs += Number(d[contribKey]) || 0;
        byYear.set(yr, cur);
    }
    const years = [...byYear.keys()].sort((a, b) => a - b);
    return years.map((y, i) => {
        const e = byYear.get(y)!;
        const prev = i > 0 ? byYear.get(years[i - 1])!.availLast : null;
        return { year: y, gained: prev === null ? null : (e.availLast - prev + e.contribs), avail: e.availLast };
    });
}

// G13 — point enrichi du drill-down : la valeur du compte + les composantes qui
// expliquent son mouvement (toutes issues du moteur, aucune invention).
interface AccountPoint {
    monthIndex: number;
    year: number;
    dateLabel?: string;
    value: number;
    gain: number;        // MarketGrowthX — gain/perte marché du mois
    flow: number;        // NetTransferX — apport net (dépôts − retraits)
    events: string[];    // libellés exacts du moteur = la VRAIE cause d'un mouvement
    hasDecomp: boolean;  // false pour l'Immobilier (pas de gain/flow émis)
}

type ReasonTone = 'pos' | 'neg' | 'in' | 'out';
interface MovementReason { icon: string; text: string; tone: ReasonTone; }

const fmtMoney = (n: number) => `${Math.round(n).toLocaleString('fr-CA')} $`;

// G13 — décompose le mouvement d'un compte en composantes EXACTES : gain marché
// (MarketGrowthX) vs apport/retrait net (NetTransferX). On ne devine PAS la cause
// d'un retrait (un retrait CELI peut être un achat immo via RAP, pas forcément la
// retraite) : la cause précise vient des événements du mois, affichés à part.
function explainMovement(d: AccountPoint): MovementReason[] {
    if (!d.hasDecomp) return [];
    const out: MovementReason[] = [];
    if (d.gain > 0.5) out.push({ icon: '📈', text: `Rendement placements +${fmtMoney(d.gain)}`, tone: 'pos' });
    else if (d.gain < -0.5) out.push({ icon: '📉', text: `Perte de marché ${fmtMoney(d.gain)}`, tone: 'neg' });
    if (d.flow > 0.5) out.push({ icon: '💰', text: `Dépôt (argent ajouté) +${fmtMoney(d.flow)}`, tone: 'in' });
    else if (d.flow < -0.5) out.push({ icon: '🏧', text: `Retrait (argent sorti) ${fmtMoney(d.flow)}`, tone: 'out' });
    return out;
}

const REASON_TONE_CLASS: Record<ReasonTone, string> = {
    pos: 'text-green-300 bg-green-500/10',
    neg: 'text-red-300 bg-danger-500/10',
    in: 'text-sky-300 bg-sky-500/10',
    out: 'text-orange-300 bg-orange-500/10',
};

interface AccountDrillTooltipProps {
    active?: boolean;
    payload?: Array<{ payload: AccountPoint }>;
    accountLabel: string;
    isPrivacyMode: boolean;
}

// G13 — infobulle du drill-down : valeur du mois + le « pourquoi » (gain marché,
// apport/retrait + origine) + événements. Niveau module → recharts y injecte
// `active`/`payload`, on lui passe `accountLabel`/`isPrivacyMode` en props.
const AccountDrillTooltip: React.FC<AccountDrillTooltipProps> = ({ active, payload, accountLabel, isPrivacyMode }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as AccountPoint;
    const reasons = explainMovement(d);
    const blur = isPrivacyMode ? 'privacy-blur' : '';
    return (
        <div className="bg-[#11161f] border border-white/15 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] p-3 w-56 text-xs">
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="font-bold text-white">{d.dateLabel || d.year}</span>
                <span className="text-tiny text-ink-400">{accountLabel}</span>
            </div>
            <div className={`font-mono text-base font-black text-white mb-2 ${blur}`}>{fmtMoney(d.value)}</div>
            {reasons.length > 0 ? (
                <div className="space-y-1">
                    <div className="text-tiny uppercase tracking-wide text-ink-500 font-bold">Ce mois</div>
                    {reasons.map((r, i) => (
                        <div key={i} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded font-mono ${REASON_TONE_CLASS[r.tone]} ${blur}`}>
                            <span aria-hidden="true">{r.icon}</span><span>{r.text}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-tiny text-ink-500">Équité = capital d’hypothèque remboursé + valorisation</div>
            )}
            {d.events.length > 0 && (
                <div className="mt-2 pt-1.5 border-t border-white/10 space-y-1">
                    {d.events.map((e, i) => {
                        const { icon, text } = splitEventIcon(e);
                        return (
                            <div key={i} className="flex items-start gap-1.5 text-tiny text-yellow-200">
                                <span aria-hidden="true">{icon}</span><span className="flex-1">{text}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

interface FutureDetailModalProps {
    point: ProjectionChartPoint;
    chartData: ProjectionChartPoint[];
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
        const value = Number(point[a.key]) || 0;
        const variation = value - (prev ? (Number(prev[a.key]) || 0) : value);
        const gain: number | null = a.gainKey ? (Number(point[a.gainKey]) || 0) : null;   // croissance marché du mois
        const flow: number | null = a.flowKey ? (Number(point[a.flowKey]) || 0) : null;   // apport net (dépôt − retrait)
        return { ...a, value, variation, gain, flow };
    }).filter((a) => a.value !== 0 || a.variation !== 0);

    // Série temporelle du compte sélectionné (drill-down), enrichie des
    // composantes qui expliquent chaque mouvement (G13).
    const accountSeries = useMemo<AccountPoint[]>(() => {
        if (!selected) return [];
        const hasDecomp = !!(selected.gainKey || selected.flowKey);
        return chartData.map((d) => ({
            monthIndex: d.monthIndex,
            year: d.year ?? 0,
            dateLabel: d.dateLabel,
            value: Number(d[selected.key]) || 0,
            gain: selected.gainKey ? (Number(d[selected.gainKey]) || 0) : 0,
            flow: selected.flowKey ? (Number(d[selected.flowKey]) || 0) : 0,
            events: [...(d.lifeEvents || []), ...(d.flowEvents || [])],
            hasDecomp,
        }));
    }, [chartData, selected]);
    const zoom = useTimeChartZoom<AccountPoint>(accountSeries);

    // G13 — « moments clés » : les plus gros mouvements mois-à-mois du compte,
    // avec leur explication. Triés par ampleur puis réordonnés chronologiquement.
    const keyMoments = useMemo(() => {
        if (!selected || accountSeries.length < 2) return [];
        const withDelta = accountSeries.map((d, i) => ({
            ...d,
            delta: i > 0 ? d.value - accountSeries[i - 1].value : 0,
        }));
        return withDelta
            .filter((d) => Math.abs(d.delta) > 1)
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
            .slice(0, 5)
            .sort((a, b) => a.monthIndex - b.monthIndex);
    }, [accountSeries, selected]);
    const lastMonth = accountSeries.length ? accountSeries[accountSeries.length - 1].monthIndex : 0;
    const idxForYears = (yrs: number) => {
        const i = accountSeries.findIndex((d) => d.monthIndex >= yrs * 12);
        return i === -1 ? accountSeries.length - 1 : i;
    };

    // G16 — marqueurs d'événements sur le mini-graph (retraits, dépôts, achats…).
    // On exclut le bruit récurrent (« régénération de l'espace ») et on plafonne
    // la densité pour ne pas surcharger le petit graphique.
    const eventMarkers = selected ? (() => {
        const NOISE = /r[ée]g[ée]n[ée]ration|espace de cotis/i;
        const all = zoom.visibleData
            .filter((d) => d.events.some((e) => !NOISE.test(e)))
            .map((d) => ({ monthIndex: d.monthIndex, value: d.value, label: d.events.find((e) => !NOISE.test(e)) || d.events[0] }));
        const step = Math.max(1, Math.ceil(all.length / 12));
        return all.filter((_, i) => i % step === 0);
    })() : [];

    // G19 — espace de cotisation gagné par année (CELI/REER uniquement).
    const roomByYear = selected?.roomMaxKey && selected.contribKey
        ? computeRoomByYear(chartData, selected.key, selected.roomMaxKey, selected.contribKey)
        : [];

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
                className="bg-dark border border-white/15 rounded-2xl shadow-[0_20px_70px_rgba(0,0,0,0.85)] w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5"
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
                                    className="w-full p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 transition-colors text-left focus-ring"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="flex items-center gap-2 min-w-0">
                                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: a.color }} />
                                            <span className="text-sm text-white truncate">{a.label}</span>
                                        </span>
                                        <span className="flex items-center gap-2 shrink-0">
                                            <span className={`font-mono text-sm text-white ${blur}`}>{fmt(a.value)}</span>
                                            <span className="text-ink-500" aria-hidden="true">›</span>
                                        </span>
                                    </div>
                                    {/* P2 — apport (ce que je mets) vs gain (croissance marché) */}
                                    {(a.flow !== null || a.gain !== null) ? (
                                        <div className="flex items-center gap-2 mt-1.5 pl-[18px] text-tiny font-mono">
                                            {a.flow !== null && (
                                                <span className={`px-1.5 py-0.5 rounded ${a.flow >= 0 ? 'text-sky-300 bg-sky-500/10' : 'text-orange-300 bg-orange-500/10'} ${blur}`}>
                                                    Apport {a.flow > 0 ? '+' : ''}{fmt(a.flow)}
                                                </span>
                                            )}
                                            {a.gain !== null && (
                                                <span className={`px-1.5 py-0.5 rounded ${a.gain >= 0 ? 'text-green-300 bg-green-500/10' : 'text-red-300 bg-danger-500/10'} ${blur}`}>
                                                    Gain {a.gain > 0 ? '+' : ''}{fmt(a.gain)}
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="mt-1.5 pl-[18px] text-tiny font-mono">
                                            <span className={`px-1.5 py-0.5 rounded ${a.variation >= 0 ? 'text-green-300 bg-green-500/10' : 'text-red-300 bg-danger-500/10'} ${blur}`}>
                                                {a.variation > 0 ? '+' : ''}{fmt(a.variation)} ce mois
                                            </span>
                                        </div>
                                    )}
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
                                    <span className={`font-mono text-danger-400 ${blur}`}>-{fmt(point.Expenses || 0)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-xs font-bold bg-white/[0.05] rounded-lg px-2.5 py-1.5">
                                <span className="text-ink-200">Variation nette (mois)</span>
                                <span className={`font-mono ${(point.diffNW || 0) >= 0 ? 'text-green-400' : 'text-danger-400'} ${blur}`}>
                                    {(point.diffNW || 0) > 0 ? '+' : ''}{fmt(point.diffNW || 0)}
                                </span>
                            </div>
                        </div>

                        {/* Événements */}
                        {((point.lifeEvents?.length ?? 0) > 0 || (point.flowEvents?.length ?? 0) > 0) && (
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
                            <span className={`ml-auto font-mono text-sm text-white ${blur}`}>{fmt(Number(point[selected.key]) || 0)}</span>
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
                                        cursor={{ stroke: selected.color, strokeOpacity: 0.4 }}
                                        content={<AccountDrillTooltip accountLabel={selected.label} isPrivacyMode={isPrivacyMode} />}
                                    />
                                    <Area type="monotone" dataKey="value" stroke={selected.color} strokeWidth={2} fill="url(#acct-grad)" isAnimationActive={false} name={selected.label} />
                                    {eventMarkers.map((mk, i) => (
                                        <ReferenceDot
                                            key={`evt-${mk.monthIndex}-${i}`}
                                            x={mk.monthIndex}
                                            y={mk.value}
                                            r={2}
                                            shape={<ClickableEventIcon kind="flow" payload={{ label: mk.label }} />}
                                        />
                                    ))}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-tiny text-ink-600 mt-2 text-center">Molette = zoom · glisser = défiler · double-clic = reset</p>

                        {/* G13 — pourquoi la valeur bouge : plus gros mouvements + raison */}
                        {keyMoments.length > 0 && (
                            <div className="mt-4 border-t border-white/10 pt-3">
                                <div className="text-tiny uppercase tracking-widest text-ink-400 font-bold mb-1">
                                    Pourquoi ça bouge — moments clés
                                </div>
                                <p className="text-tiny text-ink-500 mb-2 leading-snug">
                                    La <span className="text-ink-300 font-semibold">variation</span> d'un mois = rendement de tes placements (marché)
                                    + tes dépôts − tes retraits. Détail ci-dessous.
                                </p>
                                <ul className="space-y-2">
                                    {keyMoments.map((d) => {
                                        const reasons = explainMovement(d);
                                        return (
                                            <li key={d.monthIndex} className="bg-white/[0.03] rounded-lg p-2.5">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <span className="text-xs font-bold text-white">{d.dateLabel || d.year}</span>
                                                    <span className={`font-mono text-xs font-bold ${d.delta >= 0 ? 'text-green-400' : 'text-danger-400'} ${blur}`}>
                                                        {d.delta > 0 ? '+' : ''}{fmtMoney(d.delta)}
                                                    </span>
                                                </div>
                                                {reasons.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {reasons.map((r, i) => (
                                                            <span key={i} className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-tiny font-mono ${REASON_TONE_CLASS[r.tone]} ${blur}`}>
                                                                <span aria-hidden="true">{r.icon}</span>{r.text}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-tiny text-ink-500">Équité immobilière (capital remboursé + valorisation)</div>
                                                )}
                                                {d.events.length > 0 && (
                                                    <div className="mt-1.5 space-y-0.5">
                                                        {d.events.map((e, i) => {
                                                            const { icon, text } = splitEventIcon(e);
                                                            return (
                                                                <div key={i} className="flex items-start gap-1.5 text-tiny text-yellow-200/90">
                                                                    <span aria-hidden="true">{icon}</span><span className="flex-1">{text}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}

                        {/* G19 — espace de cotisation gagné par année (CELI/REER) */}
                        {roomByYear.length > 0 && (
                            <div className="mt-4 border-t border-white/10 pt-3">
                                <div className="text-tiny uppercase tracking-widest text-ink-400 font-bold mb-1">
                                    Espace de cotisation gagné par année
                                </div>
                                <p className="text-tiny text-ink-500 mb-2 leading-snug">
                                    Droits {selected.label} qui s'ajoutent chaque année (et ré-ajout de l'espace après un retrait, pour le CELI).
                                </p>
                                <div className="max-h-52 overflow-y-auto rounded-lg border border-white/10">
                                    <table className="w-full text-xs">
                                        <thead className="sticky top-0 bg-dark">
                                            <tr className="text-tiny uppercase tracking-wide text-ink-500">
                                                <th className="text-left font-bold px-2.5 py-1.5">Année</th>
                                                <th className="text-right font-bold px-2.5 py-1.5">Espace gagné</th>
                                                <th className="text-right font-bold px-2.5 py-1.5">Espace dispo.</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {roomByYear.map((r) => (
                                                <tr key={r.year} className="border-t border-white/5">
                                                    <td className="px-2.5 py-1.5 text-ink-200 font-semibold">{r.year}</td>
                                                    <td className={`px-2.5 py-1.5 text-right font-mono ${blur} ${r.gained === null ? 'text-ink-600' : r.gained > 0 ? 'text-green-300' : 'text-ink-400'}`}>
                                                        {r.gained === null ? '—' : `+${fmtMoney(r.gained)}`}
                                                    </td>
                                                    <td className={`px-2.5 py-1.5 text-right font-mono text-ink-300 ${blur}`}>{fmtMoney(r.avail)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>,
        document.body,
    );
};
