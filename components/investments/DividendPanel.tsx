import React, { useMemo, useState } from 'react';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { PrivateAmount } from '../ui/PrivateAmount';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatCAD, formatSigned } from '../../utils/format';
import { ChartDataTable, type ChartDataColumn } from '../ui/ChartDataTable';
import { MASKED_AMOUNT_LABEL } from '../../utils/privacyAria';
import { useFinanceStore } from '../../store/useFinanceStore';
import { maskedTick } from '../../utils/chartPrivacy';

interface DividendItem {
    id: string;
    name: string;
    amountPerPayout: number;
    freq: number;
    nextPayout: string;
}

interface AllocationItem {
    value: number;
    dividendYearly?: number;
}

interface DividendPanelProps {
    dividendCalendar: DividendItem[];
    totalAnnualDividends: number;
    currentAllocation: AllocationItem[];
    isLoading: boolean;
}

export const DividendPanel: React.FC<DividendPanelProps> = ({
    dividendCalendar,
    totalAnnualDividends,
    currentAllocation,
    isLoading,
}) => {
    const [dripEnabled, setDripEnabled] = useState(false);
    const [divGrowthRate, setDivGrowthRate] = useState(5);
    // [A11Y-CHARTS] (LOT 3) — mode discret : masque les montants de la table de données sr-only
    // (parité avec les <PrivateAmount> du panneau).
    const isPrivacyMode = useFinanceStore(s => s.isPrivacyMode);

    const dividendProjectionData = useMemo(() => {
        if (dividendCalendar.length === 0) return [];

        let currentPortfolioValue = currentAllocation.reduce((s, a) => s + a.value, 0);
        let monthlyIncome = totalAnnualDividends / 12;

        const data: Array<{ month: string; Revenu: number; Accumulé: number }> = [];
        const today = new Date();

        for (let i = 0; i < 12; i++) {
            const date = new Date(today.getFullYear(), today.getMonth() + i, 1);
            const monthLabel = date.toLocaleDateString('fr-CA', { month: 'short', year: '2-digit' }).replace('.', '');

            monthlyIncome = monthlyIncome * (1 + (divGrowthRate / 100 / 12));

            if (dripEnabled && currentPortfolioValue > 0) {
                const avgYield = totalAnnualDividends / currentPortfolioValue;
                const newAddedDividendsPerYear = monthlyIncome * avgYield;
                monthlyIncome += (newAddedDividendsPerYear / 12);
                currentPortfolioValue += monthlyIncome;
            }

            data.push({
                month: monthLabel,
                Revenu: monthlyIncome,
                Accumulé: monthlyIncome + (i > 0 ? data[i - 1].Accumulé : 0)
            });
        }
        return data;
    }, [dividendCalendar, totalAnnualDividends, currentAllocation, dripEnabled, divGrowthRate]);

    // [A11Y-CHARTS] (LOT 3) — colonnes de la table sr-only (alternative texte au BarChart de
    // projection des dividendes, opaque aux lecteurs d'écran). Mois (axe X, déjà formaté = visible)
    // + revenu mensuel + cumul annuel. Mode privé masque les MONTANTS (pas le mois).
    const dividendColumns = useMemo<ChartDataColumn[]>(() => {
        const money = (v: unknown) => isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(Number(v) || 0);
        return [
            { key: 'month', label: 'Mois', format: (v) => String(v ?? '') },
            { key: 'Revenu', label: 'Revenu mensuel', format: money },
            { key: 'Accumulé', label: 'Cumul annuel', format: money },
        ];
    }, [isPrivacyMode]);

    return (
        <Card title="Calendrier des Revenus Passifs" className="animate-premium-in" style={{ animationDelay: '0.2s' }}>
            <div className="flex justify-between items-center mb-6 bg-white/[0.03] p-5 rounded-2xl border border-white/10 shadow-lg shadow-black/20">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center shadow-inner border border-white/10"><Icon name="cash" size={26} className="text-ink-200" /></div>
                    <div>
                        <div className="text-tiny uppercase font-bold text-ink-400 tracking-widest mb-1">Rente Annuelle Estimée</div>
                        <PrivateAmount as="div" className="text-3xl font-black text-white tracking-tight">{formatCAD(totalAnnualDividends)}</PrivateAmount>
                    </div>
                </div>
                <div className="text-right hidden sm:block">
                    <div className="text-tiny uppercase font-bold text-ink-400 tracking-widest mb-1">Moyenne mensuelle</div>
                    <div className="text-xl font-bold text-ink-200">{formatCAD(totalAnnualDividends / 12)} / mois</div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {isLoading ? (
                    Array(4).fill(0).map((_, i) => (
                        <div key={i} className="bg-white/[0.03] p-4 rounded-xl border border-white/5 h-24 flex flex-col gap-3">
                            <div className="flex justify-between">
                                <div className="w-10 h-10 skeleton-box rounded-full"></div>
                                <div className="w-20 h-4 skeleton-box rounded"></div>
                            </div>
                            <div className="w-full h-4 skeleton-box rounded"></div>
                        </div>
                    ))
                ) : (
                    dividendCalendar.map((item, i) => (
                        <div key={i} className="premium-card p-4 rounded-xl flex flex-col justify-between hover:border-success-500/30 transition-all group">
                            <div className="flex justify-between items-start mb-2 relative z-10">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-meta font-bold text-white shadow-inner group-hover:bg-success-500/10 transition-colors">
                                        {item.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="font-bold text-white text-body tracking-tight">{item.name}</div>
                                        <div className="text-tiny text-ink-400">{item.id.split(':')[0]}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-success-400 font-bold text-body">{formatSigned(item.amountPerPayout, { withCurrency: true })}</div>
                                    <div className="text-tiny text-ink-400 font-medium">{item.freq === 4 ? 'Trimestriel' : 'Annuel'}</div>
                                </div>
                            </div>
                            <div className="mt-3 pt-2 border-t border-white/5 flex justify-between items-center relative z-10">
                                <span className="text-tiny text-ink-400 font-medium">Prochain paiement</span>
                                <span className="text-tiny font-bold text-white bg-success-500/20 px-2.5 py-1 rounded-lg border border-success-500/10 text-emerald-300">
                                    {item.nextPayout}
                                </span>
                            </div>
                        </div>
                    ))
                )}
                {!isLoading && dividendCalendar.length === 0 && (
                    <div className="col-span-full text-center text-ink-400 py-10 italic">
                        Aucune action à dividende détectée.
                    </div>
                )}
            </div>

            {dividendCalendar.length > 0 && (
                <div className="mt-8 pt-6 border-t border-success-500/10">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                        <div>
                            <h4 className="text-body font-bold text-white flex items-center gap-2">
                                <Icon name="investments" size={16} className="text-ink-300" /> Projection sur 12 mois
                            </h4>
                        </div>

                        <div className="flex items-center gap-6 bg-black/40 p-3 rounded-xl border border-white/5 w-full sm:w-auto">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div className={`w-8 h-4 rounded-full transition-colors relative ${dripEnabled ? 'bg-success-500' : 'bg-surfaceHighlight'}`}>
                                    <div className={`w-3 h-3 bg-white rounded-full absolute top-[2px] transition-all ${dripEnabled ? 'left-4 translate-x-0.5' : 'left-0.5'}`}></div>
                                </div>
                                <input type="checkbox" className="hidden" checked={dripEnabled} onChange={(e) => setDripEnabled(e.target.checked)} />
                                <span className="text-tiny font-bold text-ink-200 group-hover:text-white transition-colors">DRIP (Réinvestir)</span>
                            </label>

                            <div className="w-px h-6 bg-white/10 hidden sm:block"></div>

                            <div className="flex items-center gap-2 flex-1 sm:flex-none">
                                <span className="text-tiny text-ink-300 whitespace-nowrap">Croissance des div. :</span>
                                <input
                                    type="number"
                                    min="0"
                                    max="50"
                                    value={divGrowthRate}
                                    onChange={(e) => setDivGrowthRate(Number(e.target.value))}
                                    className="bg-black/50 border border-white/10 rounded px-2 py-0.5 text-meta text-white font-bold w-14 outline-none focus:border-success-500 transition-colors text-center"
                                />
                                <span className="text-tiny text-ink-300">% / an</span>
                            </div>
                        </div>
                    </div>

                    <div
                        className="h-[250px] w-full"
                        role="img"
                        aria-label="Projection des revenus de dividendes sur 12 mois — revenu mensuel estimé selon le taux de croissance et l'option de réinvestissement (DRIP)."
                    >
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={dividendProjectionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                <XAxis dataKey="month" stroke="#ffffff50" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                                <YAxis stroke="#ffffff50" fontSize={10} tickLine={false} axisLine={false} tickFormatter={maskedTick(isPrivacyMode, (val: number) => formatCAD(val))} />
                                <ReTooltip
                                    cursor={{ fill: '#ffffff05' }}
                                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
                                    itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                                    labelStyle={{ color: '#9ca3af', fontSize: '10px', marginBottom: '4px' }}
                                    formatter={(val: number) => [isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(val || 0), 'Revenu Mensuel']}
                                />
                                <Bar dataKey="Revenu" fill="#4f9d86" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                    {dividendProjectionData.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={index === 11 ? '#3f8470' : '#4f9d8680'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    {/* [A11Y-CHARTS] (LOT 3) — alternative TEXTUELLE (sr-only) au BarChart de projection
                        des dividendes : mêmes données (revenu + cumul par mois) en table accessible. */}
                    <ChartDataTable
                        caption="Projection des revenus de dividendes sur 12 mois"
                        columns={dividendColumns}
                        rows={dividendProjectionData}
                    />
                </div>
            )}
        </Card>
    );
};
