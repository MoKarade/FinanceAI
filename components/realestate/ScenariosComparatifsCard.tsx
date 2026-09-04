import React from 'react';
import { CHART_TOOLTIP_STYLE } from '../../utils/chartTooltip';
import { formatCAD } from '../../utils/format';
import { Card } from '../ui/Card';
import { ProjectionRequired } from '../ui/ProjectionRequired';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useTimeChartZoom } from '../../hooks/useTimeChartZoom';
import { ZoomContainer } from '../ui/ZoomContainer';
import { ChartDataTable, type ChartDataColumn } from '../ui/ChartDataTable';
import { MASKED_AMOUNT_LABEL } from '../../utils/privacyAria';
import { RealEstateGoal, Tab as TabEnum } from '../../types';
import { useFinanceStore } from '../../store/useFinanceStore';
import { Icon } from '../ui/Icon';
import { Badge } from '../ui/Badge';
import { PrivateAmount } from '../ui/PrivateAmount';
import type { LigneScenario } from './calculsImmoLocaux';

/**
 * [GODFILE-REALESTATE-CMP] Carte « Scénarios comparatifs » (Acheter vs Louer vs Locatif vs
 * Bourse), extraite telle quelle de RealEstateWorkspace.tsx (lot 153). L'ÉTAT (loyer, rendement,
 * appréciation) reste chez le parent : la carte-conseil IA en bas de page lit les mêmes valeurs.
 * La carte lit elle-même le store pour le mode discret et la navigation (aucune donnée nouvelle).
 */
export interface ScenariosComparatifsCardProps {
    activeGoal: RealEstateGoal;
    amortization: number;
    projectedEquityAtAmortEnd: number | null;
    combinedData: LigneScenario[];
    netYield: number;
    netAnnualIncome: number;
    currentRent: number;
    setCurrentRent: (v: number) => void;
    marketReturn: number;
    setMarketReturn: (v: number) => void;
    marketReturnOverridden: boolean;
    setMarketReturnOverridden: (v: boolean) => void;
    globalReturnRate: number | undefined;
    setLocalStockReturn: (v: number) => void;
    localRentalAppreciation: number;
    setLocalRentalAppreciation: (v: number) => void;
}

export const ScenariosComparatifsCard: React.FC<ScenariosComparatifsCardProps> = ({
    activeGoal, amortization, projectedEquityAtAmortEnd, combinedData, netYield, netAnnualIncome,
    currentRent, setCurrentRent, marketReturn, setMarketReturn, marketReturnOverridden,
    setMarketReturnOverridden, globalReturnRate, setLocalStockReturn,
    localRentalAppreciation, setLocalRentalAppreciation,
}) => {
    const navigateWithFocus = useFinanceStore(s => s.navigateWithFocus);
    const formatCurrency = (val: number) => formatCAD(val);

    const zoom = useTimeChartZoom<LigneScenario>(combinedData);

    // [A11Y-CHARTS] table de données sr-only pour le graphe « Scénarios comparatifs » (Recharts opaque
    // aux lecteurs d'écran). Colonnes $ masquées en mode privé (parité avec PrivateAmount/blur) ; l'axe X
    // (année) reste visible. Mêmes séries que l'AreaChart ; le graphe n'affiche que les scénarios pertinents
    // selon le type de propriété, mais la table les liste tous (lecture exhaustive = signal plus riche au SR).
    const isPrivacyMode = useFinanceStore(s => s.isPrivacyMode);
    const money = (v: unknown) => isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(Number(v) || 0);
    const scenariosColumns: ChartDataColumn[] = [
        { key: 'year', label: 'Année', format: (v) => `An ${v}` },
        { key: 'Acheter (Résidence)', label: 'Acheter (Résidence)', format: money },
        { key: 'Louer + Investir Reste', label: 'Louer + Investir Reste', format: money },
        { key: 'Investissement Locatif (Équité+Loyer)', label: 'Investissement Locatif (Équité+Loyer)', format: money },
        { key: 'Bourse (Placer Cash Initial)', label: 'Bourse (Placer Cash Initial)', format: money },
        { key: 'Valeur Propriété', label: 'Valeur Propriété', format: money },
    ];

    return (
        <Card icon={<Icon name="chart" size={18} />} title="Scénarios comparatifs" action={
            projectedEquityAtAmortEnd !== null && projectedEquityAtAmortEnd > 0 ? (
                <Badge
                    variant="info"
                    size="sm"
                    onClick={() => navigateWithFocus(TabEnum.FUTURE)}
                    title={`Équité immo projetée par FutureProjection à l'année ${amortization} — clic pour ouvrir`}
                >
                    Projection: <PrivateAmount>{formatCurrency(projectedEquityAtAmortEnd)}</PrivateAmount>
                </Badge>
            ) : <ProjectionRequired variant="inline" feature="l'équité immo projetée" />
        }>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 p-4 bg-black/30 rounded-xl border border-white/5">
                <div>
                    <label htmlFor="rew-currentRent" className="text-tiny text-purple-400 font-bold uppercase block mb-1">
                        Loyer actuel (scénario Louer)
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            id="rew-currentRent"
                            type="number"
                            step="50"
                            value={currentRent}
                            onChange={e => setCurrentRent(Number(e.target.value))}
                            className="w-full bg-purple-500/10 border border-purple-500/30 rounded px-2 py-1.5 text-purple-300 text-body font-bold focus:outline-none focus:border-purple-400"
                        />
                        <span className="text-meta text-ink-400">$/m</span>
                    </div>
                </div>
                <div>
                    <label className="flex justify-between text-tiny text-success-400 font-bold uppercase mb-1">
                        <span className="flex items-center gap-1">
                            Rendement Boursier
                            {!marketReturnOverridden && globalReturnRate !== undefined && (
                                <span title="Synchronisé avec hypothèse globale (Futur)" className="inline-flex text-ink-400"><Icon name="link" size={12} /></span>
                            )}
                        </span>
                        <span className="flex items-center gap-2">
                            <span className="text-white">{marketReturn}%</span>
                            {marketReturnOverridden && globalReturnRate !== undefined && (
                                <button
                                    type="button"
                                    onClick={() => { setMarketReturnOverridden(false); setMarketReturn(globalReturnRate); setLocalStockReturn(globalReturnRate); }}
                                    className="text-tiny text-info-400 hover:underline font-normal normal-case"
                                    title={`Resynchroniser avec la projection globale (${globalReturnRate}%)`}
                                >
                                    ↺ sync
                                </button>
                            )}
                        </span>
                    </label>
                    <input
                        type="range"
                        aria-label="Rendement Boursier"
                        min="3"
                        max="15"
                        step="0.5"
                        value={marketReturn}
                        onChange={e => {
                            setMarketReturn(Number(e.target.value));
                            setLocalStockReturn(Number(e.target.value));
                            setMarketReturnOverridden(true);
                        }}
                        className="w-full h-1.5 bg-dark rounded-lg appearance-none cursor-pointer accent-success-500 mt-2"
                    />
                    {!marketReturnOverridden && globalReturnRate !== undefined && (
                        <p className="text-tiny text-info-400/70 italic mt-1">
                            Phase F.7 — coût d'opportunité hérité de Futur ({globalReturnRate}%). Bouge le slider pour override.
                        </p>
                    )}
                </div>
                <div>
                    <label className="flex justify-between text-tiny text-pink-400 font-bold uppercase mb-1">
                        <span>Appréciation Immo</span>
                        <span className="text-white">{localRentalAppreciation}%</span>
                    </label>
                    <input
                        type="range"
                        aria-label="Appréciation Immo"
                        min="0" max="10" step="0.5"
                        value={localRentalAppreciation}
                        onChange={e => setLocalRentalAppreciation(Number(e.target.value))}
                        className="w-full h-1.5 bg-dark rounded-lg appearance-none cursor-pointer accent-pink-500 mt-2"
                    />
                </div>
                <div className={`p-2 rounded-lg border flex flex-col justify-center ${netYield > 0 ? 'bg-green-900/20 border-green-500/20' : 'bg-red-900/20 border-danger-500/20'}`}>
                    <div className="text-tiny uppercase font-bold text-ink-300">Si location (Cash-Flow)</div>
                    <div className={`text-lg font-black ${netYield > 0 ? 'text-green-400' : 'text-danger-400'}`}>
                        <PrivateAmount>{formatCurrency(netAnnualIncome)}</PrivateAmount><span className="text-tiny font-normal text-ink-400">/an</span>
                    </div>
                </div>
            </div>

            <div role="img" aria-label="Graphique des scénarios comparatifs immobiliers (Acheter, Louer + Investir, Investissement locatif, Bourse) par année">
            <ZoomContainer zoom={zoom} className="h-[300px] w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={zoom.visibleData}>
                        <XAxis dataKey="year" tick={{ fontSize: 10 }} tickFormatter={v => `An ${v}`} />
                        <YAxis hide />
                        <Tooltip formatter={(v: number) => isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCurrency(v)} contentStyle={CHART_TOOLTIP_STYLE} />
                        <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11, fontWeight: 'bold' }} />

                        {(activeGoal.isPrimaryResidence || !activeGoal.isRented) && (
                            <Area type="monotone" dataKey="Acheter (Résidence)" stroke="#4f9d86" fill="#4f9d86" fillOpacity={0.1} strokeWidth={3} />
                        )}

                        {(activeGoal.isPrimaryResidence || !activeGoal.isRented) && (
                            <Area type="monotone" dataKey="Louer + Investir Reste" stroke="#8a7cc0" fill="#8a7cc0" fillOpacity={0.1} strokeWidth={3} />
                        )}

                        {(!activeGoal.isPrimaryResidence && activeGoal.isRented) && (
                            <Area type="monotone" dataKey="Investissement Locatif (Équité+Loyer)" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.1} strokeWidth={3} />
                        )}

                        {(!activeGoal.isPrimaryResidence && activeGoal.isRented) && (
                            <Area type="monotone" dataKey="Bourse (Placer Cash Initial)" stroke="#c2974f" fill="#c2974f" fillOpacity={0.1} strokeWidth={3} />
                        )}
                    </AreaChart>
                </ResponsiveContainer>
            </ZoomContainer>
            </div>
            <ChartDataTable
                caption="Scénarios comparatifs immobiliers par année (équité ou patrimoine net selon le scénario)"
                columns={scenariosColumns}
                rows={combinedData}
            />
            <p className="text-tiny text-ink-400 mt-3 text-center">
                Note: Le graphique affiche automatiquement les scénarios pertinents (Habiter vs Louer) selon le type de propriété que vous avez configuré (Résidence Principale ou Propriété Locative).
            </p>
        </Card>
    );
};
