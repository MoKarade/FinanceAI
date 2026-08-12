import React from 'react';
import { BudgetCategory } from '../../types';
import { Icon } from '../ui/Icon';
import { PrivateAmount } from '../ui/PrivateAmount';
import { PrivateNumberInput } from '../ui/PrivateNumberInput';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import { LineChart, Line, YAxis as LYAxis } from 'recharts';
import { formatCAD, formatSigned } from '../../utils/format';

type TimeView = 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';

const Sparkline = ({ data, color }: { data: number[]; color: string }) => {
    const chartData = data.map((val, i) => ({ i, val }));
    return (
        <div style={{ width: '80px', height: '32px' }}>
            <LineChart width={80} height={32} data={chartData}>
                <Line type="monotone" dataKey="val" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
                <LYAxis domain={['dataMin', 'dataMax']} hide />
            </LineChart>
        </div>
    );
};

const getGroupColor = (nature: string) => {
    switch (nature) {
        case 'Besoin': return 'text-green-400 bg-green-400/10 border-green-400/20';
        case 'Envie': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
        case 'Epargne': return 'text-info-400 bg-info-400/10 border-info-400/20';
        default: return 'text-ink-300';
    }
};

interface BudgetGroupTableProps {
    nature: 'Besoin' | 'Envie' | 'Epargne';
    items: BudgetCategory[];
    allItems: BudgetCategory[];
    actualsMap: Record<string, number>;
    trendMap: Record<string, number[]>;
    monthlyDataMap: Record<string, { name: string; value: number }[]>;
    totalBudgetDisplay: number;
    monthProgress: number;
    expandedId: string | null;
    onExpandToggle: (id: string | null) => void;
    getDisplayTarget: (item: BudgetCategory) => number;
    /**
     * [BUDGET-3-VUES] Moyenne mensuelle des 12 derniers mois (mois courant partiel exclu — donc
     * au plus 11 mois pleins), ramenée à la période affichée (même normalisation que la cible).
     * `null` = aucun historique révolu → « — » honnête.
     */
    getDisplayAvg: (item: BudgetCategory) => number | null;
    isSolo: boolean;
    splitRatio1: number;
    userNames: [string, string];
    timeView: TimeView;
    onUpdateItem: (index: number, field: keyof BudgetCategory, value: unknown) => void;
    onDeleteItem: (id: string | undefined) => void;
    onAddItem: (nature: 'Besoin' | 'Envie' | 'Epargne') => void;
    /** [REFONTE-NAV-L5] Cross-link « Voir les transactions » d'un poste (catégorie du même nom). */
    onViewTransactions?: (categoryName: string) => void;
}

export const BudgetGroupTable: React.FC<BudgetGroupTableProps> = ({
    nature, items, allItems, actualsMap, trendMap, monthlyDataMap,
    totalBudgetDisplay, monthProgress, expandedId, onExpandToggle,
    getDisplayTarget, getDisplayAvg, isSolo, splitRatio1, userNames, timeView,
    onUpdateItem, onDeleteItem, onAddItem, onViewTransactions,
}) => {
    // NB : on ne masque PLUS les groupes vides. Sinon le bouton « + Ajouter »
    // (ci-dessous) disparaissait avec eux → impossible de créer la 1re catégorie
    // d'un groupe (bloquant total pour un nouvel utilisateur, INITIAL_BUDGET=[]).
    const isEmpty = items.length === 0;

    const groupTotalTarget = items.reduce((sum, i) => sum + getDisplayTarget(i), 0);
    const groupTotalSpent = items.reduce((sum, i) => sum + (actualsMap[i.name] || 0), 0);
    // [BUDGET-3-VUES] Total moyenne du groupe = Σ des moyennes ; null (« — ») quand aucun
    // historique révolu (jamais un faux 0 — no-fake-data). TOUT-OU-RIEN par construction :
    // la disponibilité vient de `coveredFullMonths`, GLOBAL au ledger → tous les postes sont
    // `null` ou aucun (prouvé par le panel financial-integrity, PR #500) — jamais de somme
    // PARTIELLE silencieuse. Le `.filter` ne sert que de ceinture si un futur refactor
    // désalignait les listes poste/ledger.
    const groupAvgs = items.map(i => getDisplayAvg(i)).filter((v): v is number => v !== null);
    const groupTotalAvg = groupAvgs.length > 0 ? groupAvgs.reduce((s, v) => s + v, 0) : null;

    const labelPeriod = timeView === 'YEAR' ? '12 Mois' :
        timeView === 'QUARTER' ? 'Trimestre' :
            timeView === 'CUSTOM' ? 'Période' : 'Mois';

    return (
        <div className="mb-8 last:mb-0 animate-slide-up">
            <div className={`flex items-center justify-between px-4 py-2 rounded-t-lg border-b border-white/5 ${getGroupColor(nature)} bg-opacity-10`}>
                <div className="flex items-center gap-2">
                    <span className="font-bold uppercase tracking-wider text-meta">{nature}</span>
                    <span className="text-tiny opacity-70">({items.length})</span>
                </div>
                <div className="text-meta font-mono" title="Réel · moyenne 12 mois · cible">
                    <PrivateAmount className={groupTotalSpent > groupTotalTarget ? 'text-danger-400' : 'opacity-80'}>
                        {formatCAD(groupTotalSpent)}
                    </PrivateAmount>
                    <span className="opacity-50"> · moy. </span>
                    {groupTotalAvg === null
                        ? (
                            <span className="opacity-50">
                                <span aria-hidden="true">—</span>
                                <span className="sr-only">Moyenne du groupe indisponible (aucun mois plein d'historique)</span>
                            </span>
                        )
                        : <PrivateAmount className="opacity-70">{formatCAD(groupTotalAvg)}</PrivateAmount>}
                    <span className="opacity-50"> / </span>
                    <PrivateAmount className="opacity-50">{formatCAD(groupTotalTarget)}</PrivateAmount>
                </div>
            </div>

            <div className="bg-[#1a1a1a] rounded-b-lg border border-white/5 overflow-hidden">
                {isEmpty && (
                    <div className="px-4 py-6 text-center text-tiny text-ink-400">
                        Aucune catégorie dans « {nature} » pour l'instant. Clique ci-dessous pour en créer une.
                    </div>
                )}
                {!isEmpty && (
                <table className="w-full text-left border-collapse">
                    <thead className="bg-black/20 text-tiny text-ink-400 uppercase">
                        <tr>
                            <th className="p-3 font-normal">Catégorie</th>
                            <th className="p-3 font-normal hidden sm:table-cell">Tendance (6m)</th>
                            <th className="p-3 font-normal text-right">Cible ({labelPeriod})</th>
                            <th className="p-3 font-normal text-right text-tiny w-16">% Budget</th>
                            <th className="p-3 font-normal text-right hidden sm:table-cell">Répartition</th>
                            <th
                                className="p-3 font-normal text-right hidden sm:table-cell"
                                title="Moyenne mensuelle des 12 derniers mois (mois courant, partiel, exclu), ramenée à la période affichée"
                            >
                                Moy. 12m
                            </th>
                            <th className="p-3 font-normal text-right">Réel ({labelPeriod})</th>
                            <th className="p-3 font-normal text-right hidden md:table-cell">Écart</th>
                            <th className="p-3 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="text-body divide-y divide-white/5">
                        {items.map((item) => {
                            const idx = allItems.findIndex(i => i.id === item.id);
                            const displayTarget = getDisplayTarget(item);
                            const displayAvg = getDisplayAvg(item);
                            const spent = actualsMap[item.name] || 0;
                            const remaining = displayTarget - spent;
                            const isOver = spent > displayTarget;
                            const percentageOfBudget = totalBudgetDisplay > 0 ? (displayTarget / totalBudgetDisplay) * 100 : 0;
                            const isExpanded = expandedId === item.id;
                            const percentSpent = displayTarget > 0 ? (spent / displayTarget) * 100 : 0;

                            let splitDisplay = '';
                            if (isSolo) {
                                splitDisplay = `${userNames[0]}: ${formatCAD(displayTarget)}`;
                            } else {
                                if (item.type === 'Commun') {
                                    const u1Share = displayTarget * splitRatio1;
                                    const u2Share = displayTarget * (1 - splitRatio1);
                                    splitDisplay = `${userNames[0].substring(0, 3)}:${formatCAD(u1Share)} / ${userNames[1].substring(0, 3)}:${formatCAD(u2Share)}`;
                                } else if (item.type === 'Perso 1') {
                                    splitDisplay = `${userNames[0]}: ${formatCAD(displayTarget)}`;
                                } else {
                                    splitDisplay = `${userNames[1]}: ${formatCAD(displayTarget)}`;
                                }
                            }

                            return (
                                <React.Fragment key={item.id}>
                                    <tr
                                        // [REFONTE-NAV-L5] Ancre du deep-link Transactions → Budget (« Voir au budget »
                                        // sur une catégorie) : usePendingFocus scrolle vers `poste:<nom>`.
                                        data-focus-section={`poste:${item.name}`}
                                        className={`hover:bg-white/5 transition-colors group cursor-pointer ${isExpanded ? 'bg-white/5' : ''}`}
                                        onClick={() => onExpandToggle(isExpanded ? null : (item.id ?? null))}
                                    >
                                        <td className="p-3">
                                            <input
                                                type="text"
                                                value={item.name}
                                                onChange={(e) => onUpdateItem(idx, 'name', e.target.value)}
                                                className="bg-transparent text-white font-medium focus:border-primary outline-none w-full text-body placeholder-ink-400"
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                            <div className="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                                <select
                                                    value={item.frequency}
                                                    onChange={(e) => onUpdateItem(idx, 'frequency', e.target.value)}
                                                    className="text-tiny text-ink-400 bg-black border border-white/10 rounded px-1 outline-none cursor-pointer hover:text-white"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <option value="Weekly">Hebdo</option>
                                                    <option value="Monthly">Mensuel</option>
                                                    <option value="Quarterly">Trimestre</option>
                                                    <option value="Yearly">Annuel</option>
                                                </select>
                                                <select
                                                    value={item.type}
                                                    onChange={(e) => onUpdateItem(idx, 'type', e.target.value)}
                                                    className="text-tiny text-ink-400 bg-black border border-white/10 rounded px-1 outline-none cursor-pointer hover:text-white"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <option value="Commun">Commun</option>
                                                    <option value="Perso 1">Perso 1</option>
                                                    <option value="Perso 2">Perso 2</option>
                                                </select>
                                            </div>
                                        </td>
                                        <td className="p-3 hidden sm:table-cell">
                                            <Sparkline data={trendMap[item.name] || []} color={isOver ? '#ef4444' : '#0f9d58'} />
                                        </td>
                                        <td className="p-3 text-right">
                                            <div className="flex flex-col items-end">
                                                <div className="flex items-center justify-end">
                                                    <PrivateNumberInput
                                                        type="number"
                                                        value={item.target}
                                                        onChange={(e) => onUpdateItem(idx, 'target', parseFloat(e.target.value) || 0)}
                                                        className={`bg-transparent text-right w-20 outline-none font-mono ${timeView !== 'MONTH' ? 'text-ink-400 text-meta' : 'text-white'}`}
                                                        title="Modifier le montant de base"
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                    <span className="text-ink-400 text-meta ml-1">
                                                        {item.frequency === 'Monthly' ? '/m' : item.frequency === 'Yearly' ? '/an' : ''}
                                                    </span>
                                                </div>
                                                <span className="text-meta font-bold text-ink-300 tabular-nums">= {formatCAD(displayTarget)}</span>
                                            </div>
                                        </td>
                                        <td className="p-3 text-right">
                                            <div className="text-tiny text-ink-400 font-mono">{percentageOfBudget.toFixed(1)}%</div>
                                        </td>
                                        <td className="p-3 text-right hidden sm:table-cell">
                                            <div className="text-tiny text-ink-300 font-mono whitespace-nowrap">{splitDisplay}</div>
                                        </td>
                                        <td className="p-3 text-right hidden sm:table-cell">
                                            {displayAvg === null ? (
                                                <span
                                                    className="text-ink-400 font-mono"
                                                    title="Aucun mois plein d'historique — moyenne indisponible"
                                                >
                                                    <span aria-hidden="true">—</span>
                                                    <span className="sr-only">Moyenne indisponible (aucun mois plein d'historique)</span>
                                                </span>
                                            ) : (
                                                <PrivateAmount as="div" className="font-mono text-ink-300">
                                                    {formatCAD(displayAvg)}
                                                </PrivateAmount>
                                            )}
                                        </td>
                                        <td className="p-3 text-right">
                                            <PrivateAmount as="div" className={`font-mono font-bold ${isOver ? 'text-danger-400' : 'text-ink-100'}`}>
                                                {formatCAD(spent)}
                                            </PrivateAmount>
                                            {timeView === 'MONTH' && displayTarget > 0 && (
                                                <div className="w-full bg-surfaceHighlight h-1.5 rounded-full mt-1 overflow-hidden relative">
                                                    <div
                                                        className="absolute top-0 bottom-0 w-0.5 bg-white z-10 opacity-50"
                                                        style={{ left: `${monthProgress}%` }}
                                                        title="Aujourd'hui"
                                                    />
                                                    <div
                                                        className={`h-full transition-all duration-500 ${isOver ? 'bg-danger-500' : (percentSpent > monthProgress ? 'bg-orange-400' : 'bg-green-500')}`}
                                                        style={{ width: `${Math.min(100, percentSpent)}%` }}
                                                    />
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-3 text-right hidden md:table-cell">
                                            <PrivateAmount as="div" className={`font-mono ${remaining < 0 ? 'text-danger-500' : 'text-green-500'} opacity-80`}>
                                                {formatSigned(remaining, { withCurrency: true })}
                                            </PrivateAmount>
                                        </td>
                                        <td className="p-3 text-center">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteItem(item.id); }}
                                                className="inline-flex text-ink-500 hover:text-danger-500 p-1 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                                                title="Supprimer la catégorie"
                                                aria-label="Supprimer la catégorie"
                                            >
                                                <Icon name="close" size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr className="bg-black/30 border-b border-white/5 animate-fade-in">
                                            <td colSpan={9} className="p-4">
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="text-meta font-bold text-ink-300 uppercase">Historique (6 derniers mois)</div>
                                                        {/* [REFONTE-NAV-L5] Cross-link sobre vers les transactions de la catégorie. */}
                                                        {onViewTransactions && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); onViewTransactions(item.name); }}
                                                                // `touch-target` (index.css) : 44×44 min au doigt sans changer le
                                                                // rendu visuel — l'audit 2026-08-12 a compté ces écarts, on n'en
                                                                // rajoute pas un neuf. `-my-3` neutralise la hauteur ajoutée.
                                                                className="touch-target inline-flex items-center text-tiny text-info-400 hover:underline focus-ring rounded px-1 -my-3 whitespace-nowrap"
                                                                aria-label={`Voir les transactions de la catégorie ${item.name}`}
                                                            >
                                                                Voir les transactions →
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div style={{ width: '100%', height: '150px' }}>
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <BarChart data={monthlyDataMap[item.name] || []}>
                                                                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                                                <XAxis dataKey="name" stroke="#666" tick={{ fontSize: 10 }} />
                                                                <YAxis stroke="#666" tick={{ fontSize: 10 }} width={30} />
                                                                <Tooltip
                                                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                                                    contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333' }}
                                                                    formatter={(val: number) => formatCAD(val)}
                                                                />
                                                                <ReferenceLine
                                                                    y={displayTarget}
                                                                    stroke="#666"
                                                                    strokeDasharray="3 3"
                                                                    label={{ position: 'right', value: 'Cible', fill: '#666', fontSize: 10 }}
                                                                />
                                                                <Bar dataKey="value" fill={isOver ? '#ef4444' : '#0f9d58'} radius={[4, 4, 0, 0]} maxBarSize={40} />
                                                            </BarChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
                )}
                <button
                    type="button"
                    onClick={() => onAddItem(nature)}
                    className="w-full py-2 text-tiny text-ink-400 hover:text-white hover:bg-white/5 transition-colors border-t border-white/5"
                >
                    + Ajouter une ligne dans {nature}
                </button>
            </div>
        </div>
    );
};
