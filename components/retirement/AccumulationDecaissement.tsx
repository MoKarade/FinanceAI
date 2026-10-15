// components/retirement/AccumulationDecaissement.tsx
//
// [S5-REFONTE-RETRAITE] « Accumulation puis décaissement » (maquettes E-retraite / M-retraite) : le
// capital par compte en aires empilées pleines, le patrimoine net en trait blanc, la retraite en
// pointillés avec sa pastille « Retraite · 60 ans ». Axe à droite en repères ronds (à gauche, dans le
// tracé, sur mobile), âges ancrés aux bords. Zoom molette / pincement conservé (G7c), sans l'indice.
import React, { useMemo } from 'react';
import { Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ComposedChart, Line } from 'recharts';
import { maskedTick } from '../../utils/chartPrivacy';
import { formatCompactCAD } from '../../utils/format';
import { reperesRonds } from '../../utils/reperesRonds';
import { ZoomContainer } from '../ui/ZoomContainer';
import { ChartDataTable, type ChartDataColumn } from '../ui/ChartDataTable';
import type { TimeChartZoom } from '../../hooks/useTimeChartZoom';
import type { ProjectionChartPoint } from '../../services/projection/types';

export type PointAnnuel = ProjectionChartPoint & { TotalCapital: number; lockedTotalCapital?: number };

/** Comptes empilés, du bas vers le haut (ordre des maquettes). */
const COMPTES = [
    { cle: 'Liquidites', libelle: 'Liquidités', couleur: '#64748b' },
    { cle: 'NonReg', libelle: 'Non-enregistré', couleur: '#d4a24c' },
    { cle: 'CELI', libelle: 'CELI', couleur: '#34b39a' },
    { cle: 'CELIAPP', libelle: 'CELIAPP', couleur: '#7dd3c0' },
    { cle: 'REER', libelle: 'REER', couleur: '#7c93f2' },
] as const;

interface Props {
    donnees: PointAnnuel[];
    zoom: TimeChartZoom<PointAnnuel>;
    ageRetraite: number;
    /** Courbe verrouillée superposée (PH2-d) : présente seulement si le verrou est actif. */
    verrouillee: boolean;
    colonnes: ChartDataColumn[];
    isPrivacyMode: boolean;
    etroit: boolean;
    infobulle: React.ReactElement;
}

/** Âges repères (maquettes : 35, 45, 55, 65, 75 ans) : le premier, puis de 10 en 10, et le dernier —
 *  un repère intermédiaire à moins de 8 ans du dernier est sauté (libellés qui se chevauchent). */
export function reperesAges(ages: readonly number[]): number[] {
    if (ages.length === 0) return [];
    const premier = ages[0];
    const dernier = ages[ages.length - 1];
    const r = [premier];
    for (let a = premier + 10; a <= dernier - 8; a += 10) r.push(a);
    if (dernier !== premier) r.push(dernier);
    return r;
}

export const AccumulationDecaissement: React.FC<Props> = ({ donnees, zoom, ageRetraite, verrouillee, colonnes, isPrivacyMode, etroit, infobulle }) => {
    const visibles = zoom.visibleData;
    const valeurs = useMemo(() => visibles.flatMap((d) => [d.NetWorth, d.TotalCapital, d.lockedTotalCapital ?? 0]), [visibles]);
    const reperes = useMemo(() => {
        const r = reperesRonds(valeurs);
        return etroit && r ? r.filter((_, i) => i % 2 === 0) : r;
    }, [valeurs, etroit]);
    const domaine: [number, number] = [Math.min(0, ...valeurs.filter(Number.isFinite)), Math.max(0, ...valeurs.filter(Number.isFinite))];
    const ages = useMemo(() => reperesAges(visibles.map((d) => d.age ?? 0)), [visibles]);

    const TickAge = (props: { x?: number; y?: number; payload?: { value: number }; index?: number; visibleTicksCount?: number }) => {
        const { x = 0, y = 0, payload, index = 0, visibleTicksCount = 1 } = props;
        const bord = index === 0 || index === visibleTicksCount - 1;
        return (
            <text x={x} y={y + 12} textAnchor={index === 0 ? 'start' : index === visibleTicksCount - 1 ? 'end' : 'middle'} fill="#8896a8" fontSize={etroit ? 10 : 11} fontFamily="JetBrains Mono">
                {etroit && !bord ? payload?.value : `${payload?.value} ans`}
            </text>
        );
    };
    const PastilleRetraite = (props: { viewBox?: { x?: number; y?: number } }) => {
        const x = props.viewBox?.x ?? 0;
        const texte = `Retraite · ${ageRetraite} ans`;
        const largeur = texte.length * (etroit ? 6.2 : 6.8) + (etroit ? 20 : 24);
        const hauteur = etroit ? 22 : 24;
        return (
            <g>
                <rect x={x - largeur / 2} y={2} width={largeur} height={hauteur} rx={hauteur / 2} fill="#0E1014" stroke="rgba(255,255,255,0.18)" />
                <text x={x} y={2 + hauteur / 2 + 4} textAnchor="middle" fill="#e2e8f0" fontSize={etroit ? 11 : 12} fontWeight={600}>{texte}</text>
            </g>
        );
    };

    return (
        <section aria-labelledby="accumulation-titre" className="rounded-2xl bg-surface border border-white/6 p-4 sm:px-6 sm:py-5 flex flex-col gap-3.5 min-w-0">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                    <h2 id="accumulation-titre" className="text-[17px] lg:text-[18px] font-semibold text-ink-50">Accumulation puis décaissement</h2>
                    <p className="text-meta lg:text-[13px] text-ink-400">Capital par compte et patrimoine net, par âge</p>
                </div>
                <ul className="flex flex-wrap gap-x-3.5 gap-y-2 text-meta text-ink-300" aria-hidden="true">
                    {COMPTES.map((c) => (
                        <li key={c.cle} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: c.couleur }} />{c.libelle}</li>
                    ))}
                    <li className="flex items-center gap-1.5"><span className="w-3 h-[3px] rounded-sm bg-ink-50" />Patrimoine net</li>
                    {verrouillee && <li className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed border-[#fbbf24]" />Verrouillée</li>}
                </ul>
            </div>
            <div
                role="img"
                aria-label="Graphique d'accumulation et de décaissement — capital placé par compte et patrimoine net selon l'âge, de maintenant jusqu'à l'espérance de vie ; détail chiffré dans le tableau de données."
            >
                <ZoomContainer zoom={zoom} hint={false} className="w-full" style={{ height: etroit ? 240 : 340 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={visibles} margin={{ top: 34, right: 0, left: 0, bottom: 0 }}>
                            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="age" type="number" domain={['dataMin', 'dataMax']} ticks={ages} interval={0} tick={<TickAge />} tickLine={false} axisLine={false} />
                            <YAxis
                                orientation={etroit ? 'left' : 'right'} mirror={etroit} ticks={reperes} domain={domaine}
                                stroke="#8896a8" tick={{ fontSize: etroit ? 10 : 11, fontFamily: 'JetBrains Mono', dy: etroit ? -8 : 0 }}
                                tickLine={false} axisLine={false} width={60}
                                tickFormatter={maskedTick(isPrivacyMode, (v: number) => formatCompactCAD(v, { repere: true }))}
                            />
                            <Tooltip content={infobulle} cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1 }} />
                            {COMPTES.map((c) => (
                                <Area key={c.cle} type="monotone" dataKey={c.cle} stackId="comptes" name={c.libelle} fill={c.couleur} fillOpacity={0.8} stroke="none" isAnimationActive={false} />
                            ))}
                            <Line type="monotone" dataKey="NetWorth" name="Patrimoine net" stroke="#f8fafc" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                            {/* PH2-d — capital VERROUILLÉ (référence figée), superposé à l'aperçu live. */}
                            {verrouillee && <Line type="monotone" dataKey="lockedTotalCapital" stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 3" dot={false} name="Verrouillée" isAnimationActive={false} />}
                            <ReferenceLine x={ageRetraite} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 4" label={<PastilleRetraite />} ifOverflow="hidden" />
                        </ComposedChart>
                    </ResponsiveContainer>
                </ZoomContainer>
            </div>
            {/* [A11Y-CHARTS] — alternative TEXTUELLE (sr-only) : mêmes données en table accessible. */}
            <ChartDataTable caption="Capital placé et patrimoine net par âge (accumulation puis décaissement)" columns={colonnes} rows={donnees} />
        </section>
    );
};
