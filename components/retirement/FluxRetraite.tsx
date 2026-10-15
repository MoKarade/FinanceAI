// components/retirement/FluxRetraite.tsx
//
// [S5-REFONTE-RETRAITE] « Flux à la retraite, par mois » (maquettes E-retraite / M-retraite) : le
// besoin mensuel (inflation comprise) en trait rouge face aux rentes RRQ + PSV en barres, une barre
// par année de retraite ; trois jalons chiffrés dessous (départ, 65 ans, dernière année).
import React, { useMemo } from 'react';
import { Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart } from 'recharts';
import { CHART_TOOLTIP_STYLE } from '../../utils/chartTooltip';
import { MASKED_AMOUNT_LABEL } from '../../utils/privacyAria';
import { formatCAD } from '../../utils/format';
import { PrivateAmount } from '../ui/PrivateAmount';
import { ZoomContainer } from '../ui/ZoomContainer';
import { ChartDataTable, type ChartDataColumn } from '../ui/ChartDataTable';
import type { TimeChartZoom } from '../../hooks/useTimeChartZoom';
import type { PointAnnuel } from './AccumulationDecaissement';

interface Props {
    donnees: PointAnnuel[];
    zoom: TimeChartZoom<PointAnnuel>;
    colonnes: ChartDataColumn[];
    isPrivacyMode: boolean;
    etroit: boolean;
}

/** Âges des jalons : le départ, 65 ans (rentes pleines) s'il tombe entre les deux, la dernière année. */
export function agesJalons(ages: readonly number[]): number[] {
    if (ages.length === 0) return [];
    const premier = ages[0];
    const dernier = ages[ages.length - 1];
    const r = [premier];
    if (premier < 65 && dernier > 65 && ages.includes(65)) r.push(65);
    else if (dernier - premier >= 10) {
        const milieu = ages.find((a) => a >= (premier + dernier) / 2);
        if (milieu !== undefined && milieu !== dernier) r.push(milieu);
    }
    if (dernier !== premier) r.push(dernier);
    return r;
}

export const FluxRetraite: React.FC<Props> = ({ donnees, zoom, colonnes, isPrivacyMode, etroit }) => {
    const jalons = useMemo(() => agesJalons(donnees.map((d) => d.age ?? 0))
        .map((age) => donnees.find((d) => d.age === age))
        .filter((d): d is PointAnnuel => d !== undefined), [donnees]);

    return (
        <section aria-labelledby="flux-retraite-titre" className="rounded-2xl bg-surface border border-white/6 p-4 sm:px-6 sm:py-5 flex flex-col gap-3.5 min-w-0">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                    <h2 id="flux-retraite-titre" className="text-[17px] lg:text-[18px] font-semibold text-ink-50">Flux à la retraite, par mois</h2>
                    <p className="text-meta lg:text-[13px] text-ink-400">Ce que coûte ta vie (inflation comprise) face aux rentes RRQ et PSV ; l'écart vient de tes placements</p>
                </div>
                <ul className="flex flex-wrap gap-x-3.5 gap-y-2 text-meta text-ink-300 shrink-0" aria-hidden="true">
                    <li className="flex items-center gap-1.5"><span className="w-3 h-[3px] rounded-sm bg-[#f87171]" />Besoin mensuel</li>
                    <li className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-[#34b39a]" />Rentes RRQ + PSV</li>
                </ul>
            </div>
            <div
                role="img"
                aria-label="Graphique des flux à la retraite — besoin mensuel (ajusté à l'inflation) et rentes RRQ + PSV selon l'âge, de la retraite jusqu'à l'espérance de vie ; détail chiffré dans le tableau de données."
            >
                <ZoomContainer zoom={zoom} hint={false} className="w-full" style={{ height: etroit ? 150 : 180 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={zoom.visibleData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }} barCategoryGap="30%">
                            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="age" hide />
                            <YAxis hide domain={[0, 'dataMax']} />
                            <Tooltip
                                contentStyle={CHART_TOOLTIP_STYLE}
                                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                labelFormatter={(age) => `${age} ans`}
                                formatter={(val: number | string, nom: string) => [isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(Number(val)), nom]}
                            />
                            <Bar dataKey="IncomeRetirement" name="Rentes RRQ + PSV" fill="#34b39a" fillOpacity={0.75} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                            <Line type="linear" dataKey="Expenses" name="Besoin mensuel" stroke="#f87171" strokeWidth={2} dot={false} isAnimationActive={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </ZoomContainer>
            </div>
            {/* Jalons : ligne unique au bureau, un par ligne sur mobile (maquettes). */}
            <ul className="flex flex-col lg:flex-row lg:justify-between gap-1 font-mono text-meta lg:text-[11px] text-ink-400">
                {jalons.map((d, i) => (
                    <li key={d.age} className="flex justify-between gap-3 lg:block">
                        <span className="font-sans lg:font-mono text-[13px] lg:text-[11px]">{d.age} ans</span>
                        <span className="text-ink-100 lg:text-ink-400">
                            <span className="hidden lg:inline"> · </span>
                            {i === 0 && 'besoin '}<PrivateAmount>{formatCAD(d.Expenses)}</PrivateAmount>
                            {' · '}
                            {i === 0 && 'rentes '}<PrivateAmount>{formatCAD(d.IncomeRetirement)}</PrivateAmount>
                        </span>
                    </li>
                ))}
            </ul>
            {/* [A11Y-CHARTS] (LOT 3) — alternative TEXTUELLE (sr-only) : rente, revenu total et besoin par âge. */}
            <ChartDataTable caption="Flux à la retraite par âge — rente gouvernementale, revenu total et besoin mensuel" columns={colonnes} rows={donnees} />
        </section>
    );
};
