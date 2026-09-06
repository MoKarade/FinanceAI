import React, { useMemo } from 'react';
import { formatCAD, formatSigned } from '../../../utils/format';
import { ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceDot } from 'recharts';
import { useTimeChartZoom } from '../../../hooks/useTimeChartZoom';
import { splitEventIcon, ClickableEventIcon } from '../ProjectionTooltip';
import { Icon } from '../../ui/Icon';
import { PrivateAmount } from '../../ui/PrivateAmount';
import { ChartDataTable, type ChartDataColumn } from '../../ui/ChartDataTable';
import { MASKED_AMOUNT_LABEL } from '../../../utils/privacyAria';
import type { ProjectionChartPoint } from '../../../services/projection/types';
import { type AccountDef, type AccountPoint, computeRoomByYear, explainMovement, REASON_TONE_CLASS, fmtMoney } from './comptes';

/**
 * [GODFILE-FUTUREDETAILMODAL] Vue « drill-down » d'un compte (mini-graphe zoomable, moments clés,
 * espace de cotisation), extraite telle quelle de FutureDetailModal.tsx (lot 154). Toutes les
 * dérivations qui n'existaient QUE pour cette vue (série du compte, zoom, moments clés, marqueurs,
 * espace par année) ont déménagé avec elle — le panneau parent n'en consommait aucune.
 */
// [GODFILE-FUTUREDETAILMODAL] Infobulle du drill-down, extraite telle quelle de
// FutureDetailModal.tsx (lot 154).
interface AccountDrillTooltipProps {
    active?: boolean;
    payload?: Array<{ payload: AccountPoint }>;
    accountLabel: string;
}

// G13 — infobulle du drill-down : valeur du mois + le « pourquoi » (gain marché,
// apport/retrait + origine) + événements. Niveau module → recharts y injecte
// `active`/`payload`, on lui passe `accountLabel` en prop. Le masquage des montants
// (mode discret) est géré par `<PrivateAmount>` (lit le store directement).
const AccountDrillTooltip: React.FC<AccountDrillTooltipProps> = ({ active, payload, accountLabel }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as AccountPoint;
    const reasons = explainMovement(d);
    return (
        <div className="bg-[#11161f] border border-white/15 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] p-3 w-56 text-meta">
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="font-bold text-white">{d.dateLabel || d.year}</span>
                <span className="text-tiny text-ink-400">{accountLabel}</span>
            </div>
            <PrivateAmount as="div" className="font-mono text-base font-black text-white mb-2">{fmtMoney(d.value)}</PrivateAmount>
            {reasons.length > 0 ? (
                <div className="space-y-1">
                    <div className="text-tiny uppercase tracking-wide text-ink-400 font-bold">Ce mois</div>
                    {reasons.map((r, i) => (
                        <div key={i} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded font-mono ${REASON_TONE_CLASS[r.tone]}`}>
                            <Icon name={r.icon} size={12} />{r.libelle}{' '}
                            <PrivateAmount>{formatSigned(r.montant, { withCurrency: true })}</PrivateAmount>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-tiny text-ink-400">Équité = capital d’hypothèque remboursé + valorisation</div>
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

interface DrillDownCompteProps {
    selected: AccountDef;
    point: ProjectionChartPoint;
    chartData: ProjectionChartPoint[];
    isPrivacyMode: boolean;
    onRetour: () => void;
}

export const DrillDownCompte: React.FC<DrillDownCompteProps> = ({
    selected, point, chartData, isPrivacyMode, onRetour,
}) => {
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


    const fmt = (n: number) => formatCAD(n);

    // [A11Y-CHARTS] (LOT 3) — colonnes de la table sr-only du mini-graphe de drill-down d'un compte
    // (série temporelle de sa valeur, opaque aux lecteurs d'écran). Année (axe X via monthIndex,
    // visible) + valeur du compte ($, masquée en mode privé — `isPrivacyMode` arrive en prop ici,
    // pas du store). N'affichée que lorsqu'un compte est sélectionné (drill-down ouvert).
    const accountSeriesColumns: ChartDataColumn[] = [
        { key: 'year', label: 'Année', format: (v) => v != null ? String(v) : '' },
        { key: 'value', label: selected ? selected.label : 'Valeur', format: (v) => isPrivacyMode ? MASKED_AMOUNT_LABEL : fmt(Number(v) || 0) },
    ];

    return (
        <>
                        {/* Drill-down compte */}
                        <button
                            type="button"
                            onClick={onRetour}
                            className="text-tiny font-bold text-ink-300 hover:text-white mb-3 focus-ring rounded"
                        >
                            ‹ Retour aux comptes
                        </button>
                        <div className="flex items-center gap-2 mb-3">
                            <span className="w-3 h-3 rounded-full" style={{ background: selected.color }} />
                            <span className="font-bold text-white">{selected.label}</span>
                            <PrivateAmount className="ml-auto font-mono text-body text-white">{fmt(Number(point[selected.key]) || 0)}</PrivateAmount>
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
                                        className={`px-2 py-0.5 text-tiny font-bold rounded transition-colors focus-ring ${active ? 'bg-primary text-dark' : 'text-ink-300 hover:text-dark hover:bg-white/10'}`}
                                    >
                                        {y} ans
                                    </button>
                                );
                            })}
                            <button
                                type="button"
                                onClick={zoom.reset}
                                className={`px-2 py-0.5 text-tiny font-bold rounded transition-colors focus-ring ${!zoom.isZoomed ? 'bg-primary text-dark' : 'text-ink-300 hover:text-dark hover:bg-white/10'}`}
                            >
                                Tout
                            </button>
                        </div>

                        <div
                            ref={zoom.containerRef}
                            {...zoom.handlers}
                            role="img"
                            aria-label={`Historique de la valeur du compte ${selected.label} dans le temps, année par année.`}
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
                                        content={<AccountDrillTooltip accountLabel={selected.label} />}
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
                        <p className="text-tiny text-ink-400 mt-2 text-center">Molette = zoom · glisser = défiler · double-clic = reset</p>
                        {/* [A11Y-CHARTS] (LOT 3) — alternative TEXTUELLE (sr-only) au mini-graphe de
                            drill-down : valeur du compte par année en table accessible (donnée complète
                            `accountSeries`, pas la vue zoomée). */}
                        <ChartDataTable
                            caption={`Historique de la valeur du compte ${selected.label} par année`}
                            columns={accountSeriesColumns}
                            rows={accountSeries as unknown as ReadonlyArray<Record<string, unknown>>}
                        />

                        {/* G13 — pourquoi la valeur bouge : plus gros mouvements + raison */}
                        {keyMoments.length > 0 && (
                            <div className="mt-4 border-t border-white/10 pt-3">
                                <div className="text-tiny uppercase tracking-widest text-ink-400 font-bold mb-1">
                                    Pourquoi ça bouge — moments clés
                                </div>
                                <p className="text-tiny text-ink-400 mb-2 leading-snug">
                                    La <span className="text-ink-300 font-semibold">variation</span> d'un mois = rendement de tes placements (marché)
                                    + tes dépôts − tes retraits. Détail ci-dessous.
                                </p>
                                <ul className="space-y-2">
                                    {keyMoments.map((d) => {
                                        const reasons = explainMovement(d);
                                        return (
                                            <li key={d.monthIndex} className="bg-white/[0.03] rounded-lg p-2.5">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <span className="text-meta font-bold text-white">{d.dateLabel || d.year}</span>
                                                    <PrivateAmount className={`font-mono text-meta font-bold ${d.delta >= 0 ? 'text-green-400' : 'text-danger-400'}`}>
                                                        {d.delta > 0 ? '+' : ''}{fmtMoney(d.delta)}
                                                    </PrivateAmount>
                                                </div>
                                                {reasons.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {reasons.map((r, i) => (
                                                            <span key={i} className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-tiny font-mono ${REASON_TONE_CLASS[r.tone]}`}>
                                                                <Icon name={r.icon} size={11} />{r.libelle}{' '}
                                                                <PrivateAmount>{formatSigned(r.montant, { withCurrency: true })}</PrivateAmount>
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-tiny text-ink-400">Équité immobilière (capital remboursé + valorisation)</div>
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
                                <p className="text-tiny text-ink-400 mb-2 leading-snug">
                                    Droits {selected.label} qui s'ajoutent chaque année (et ré-ajout de l'espace après un retrait, pour le CELI).
                                </p>
                                <div className="max-h-52 overflow-y-auto rounded-lg border border-white/10">
                                    <table className="w-full text-meta">
                                        <thead className="sticky top-0 bg-dark">
                                            <tr className="text-tiny uppercase tracking-wide text-ink-400">
                                                <th className="text-left font-bold px-2.5 py-1.5">Année</th>
                                                <th className="text-right font-bold px-2.5 py-1.5">Espace gagné</th>
                                                <th className="text-right font-bold px-2.5 py-1.5">Espace dispo.</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {roomByYear.map((r) => (
                                                <tr key={r.year} className="border-t border-white/5">
                                                    <td className="px-2.5 py-1.5 text-ink-200 font-semibold">{r.year}</td>
                                                    <td className={`px-2.5 py-1.5 text-right font-mono ${r.gained === null ? 'text-ink-400' : r.gained > 0 ? 'text-green-300' : 'text-ink-400'}`}>
                                                        <PrivateAmount>{r.gained === null ? '—' : `+${fmtMoney(r.gained)}`}</PrivateAmount>
                                                    </td>
                                                    <td className="px-2.5 py-1.5 text-right font-mono text-ink-300"><PrivateAmount>{fmtMoney(r.avail)}</PrivateAmount></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
    );
};
