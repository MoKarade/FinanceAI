import React, { useMemo, useState } from 'react';
import { Transaction, BudgetConfig, BudgetCategory } from '../types';
import { Card } from './ui/Card';
import { ConfirmModal } from './ui/ConfirmModal';
import { LineChart, Line, ResponsiveContainer, YAxis, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, CartesianGrid, ReferenceLine } from 'recharts';
import { showToast } from './ui/Toast';
import { analyzeBudgetAI } from '../services/gemini';

interface BudgetProps {
    transactions: Transaction[];
    config: BudgetConfig;
    budgetItems: BudgetCategory[];
    setBudgetItems: (items: BudgetCategory[]) => void;
    apiKey: string;
}

const Sparkline = ({ data, color }: { data: number[], color: string }) => {
    const chartData = data.map((val, i) => ({ i, val }));
    return (
        <div style={{ width: '80px', height: '32px' }}>
            <LineChart width={80} height={32} data={chartData}>
                <Line type="monotone" dataKey="val" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
                <YAxis domain={['dataMin', 'dataMax']} hide />
            </LineChart>
        </div>
    );
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82ca9d', '#ffc658'];

const getGroupColor = (nature: string) => {
    switch (nature) {
        case 'Besoin': return 'text-green-400 bg-green-400/10 border-green-400/20';
        case 'Envie': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
        case 'Epargne': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
        default: return 'text-gray-400';
    }
};

type TimeView = 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';

export const Budget: React.FC<BudgetProps> = ({ transactions, config, budgetItems, setBudgetItems, apiKey }) => {
    const [timeView, setTimeView] = useState<TimeView>('MONTH');
    const [inflationSim, setInflationSim] = useState(0);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null); // Pour le modal

    // AI State
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiRecommendations, setAiRecommendations] = useState<string[]>([]);
    const [showAiModal, setShowAiModal] = useState(false);

    // Custom Date State
    const [customStart, setCustomStart] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);

    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();
    const monthProgress = (currentDay / daysInMonth) * 100;

    const getDateRange = () => {
        const end = new Date();
        const start = new Date();

        if (timeView === 'MONTH') {
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
        } else if (timeView === 'QUARTER') {
            start.setDate(start.getDate() - 90);
            start.setHours(0, 0, 0, 0);
        } else if (timeView === 'YEAR') {
            start.setFullYear(start.getFullYear() - 1);
            start.setHours(0, 0, 0, 0);
        } else {
            // Custom
            return { start: new Date(customStart), end: new Date(customEnd) };
        }
        return { start, end };
    };

    const getMultiplier = () => {
        switch (timeView) {
            case 'QUARTER': return 3;
            case 'YEAR': return 12;
            case 'CUSTOM': {
                const { start, end } = getDateRange();
                const diffTime = Math.abs(end.getTime() - start.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                // Normalize to months (approx 30.44 days)
                return Math.max(0.1, diffDays / 30.44);
            }
            default: return 1;
        }
    };

    const getBaseMonthlyTarget = (item: BudgetCategory): number => {
        let val = item.target;
        if (item.frequency === 'Yearly') val = item.target / 12;
        if (item.frequency === 'Weekly') val = item.target * 4.33;
        if (item.frequency === 'Quarterly' as any) val = item.target / 3;
        return val;
    };

    const getDisplayTarget = (item: BudgetCategory): number => {
        const baseMonthly = getBaseMonthlyTarget(item);
        let multiplier = getMultiplier();

        if (item.nature !== 'Epargne' && inflationSim > 0) {
            multiplier *= (1 + inflationSim / 100);
        }

        return baseMonthly * multiplier;
    };

    // --- INCOME CALCULATION (EXPLICIT INPUTS) ---
    const usersIncome = useMemo(() => {
        return config.users.map(u => {
            const monthlyGross = u.grossSalary || 0;
            const monthlyNet = u.netSalary || u.salary || 0; // Fallback to old salary field
            return {
                ...u,
                grossSalary: monthlyGross,
                netSalary: monthlyNet,
                taxDeduction: Math.max(0, monthlyGross - monthlyNet)
            };
        });
    }, [config.users]);

    const totalGrossIncomeMonthly = usersIncome.reduce((sum, u) => sum + u.grossSalary, 0);
    const totalNetIncomeMonthly = usersIncome.reduce((sum, u) => sum + u.netSalary, 0);
    const totalTaxMonthly = usersIncome.reduce((sum, u) => sum + u.taxDeduction, 0);

    // Display values based on time view
    const totalNetIncomeDisplay = totalNetIncomeMonthly * getMultiplier();
    const totalTaxDisplay = totalTaxMonthly * getMultiplier();
    const totalGrossDisplay = totalGrossIncomeMonthly * getMultiplier();

    const { filteredTransactions, actualsMap, trendMap, monthlyDataMap } = useMemo(() => {
        const { start, end } = getDateRange();
        // Ensure end date includes the full day
        const endInclusive = new Date(end);
        endInclusive.setHours(23, 59, 59, 999);

        const startStr = start.toISOString().split('T')[0];
        const endStr = endInclusive.toISOString().split('T')[0];

        const filtered = transactions.filter(t => {
            return t.date >= startStr && t.date <= endStr && t.amount < 0 && !t.isTransfer && !t.isDuplicate;
        });

        const map: Record<string, number> = {};
        filtered.forEach(t => {
            let match = budgetItems.find(b => b.name === t.category);
            if (!match) {
                match = budgetItems.find(b => b.name.toLowerCase().includes(t.category.toLowerCase()) || t.category.toLowerCase().includes(b.name.toLowerCase()));
            }
            const key = match ? match.name : t.category;
            map[key] = (map[key] || 0) + Math.abs(t.amount);
        });

        const trends: Record<string, number[]> = {};
        const detailedMonthly: Record<string, { name: string, value: number }[]> = {};

        budgetItems.forEach(item => {
            const history = [];
            const detailedHist = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const mStr = d.toISOString().substring(0, 7);
                const monthName = d.toLocaleDateString('fr-CA', { month: 'short' });

                const total = transactions
                    .filter(t => t.date.startsWith(mStr) && (t.category === item.name) && t.amount < 0 && !t.isTransfer)
                    .reduce((s, t) => s + Math.abs(t.amount), 0);

                history.push(total);
                detailedHist.push({ name: monthName, value: total });
            }
            trends[item.name] = history;
            detailedMonthly[item.name] = detailedHist;
        });

        return { filteredTransactions: filtered, actualsMap: map, trendMap: trends, monthlyDataMap: detailedMonthly };
    }, [transactions, timeView, budgetItems, customStart, customEnd]);

    const totalBudgetDisplay = budgetItems.reduce((sum, item) => sum + getDisplayTarget(item), 0);
    const totalSpentDisplay = (Object.values(actualsMap) as number[]).reduce((a, b) => a + b, 0);
    const totalRemainingDisplay = totalNetIncomeDisplay - totalSpentDisplay; // Based on Net Income
    const projectedTotalDisplay = timeView === 'MONTH' ? (totalSpentDisplay / (currentDay / daysInMonth)) : totalSpentDisplay;

    // --- 2. GROUPING LOGIC ---
    const groupedItems = useMemo(() => {
        const groups = { 'Besoin': [] as BudgetCategory[], 'Envie': [] as BudgetCategory[], 'Epargne': [] as BudgetCategory[] };
        budgetItems.forEach(item => {
            const nature = item.nature || 'Envie';
            if (groups[nature]) groups[nature].push(item);
            else groups['Envie'].push(item);
        });
        Object.keys(groups).forEach(key => {
            groups[key as keyof typeof groups].sort((a, b) => getBaseMonthlyTarget(b) - getBaseMonthlyTarget(a));
        });
        return groups;
    }, [budgetItems, inflationSim]);

    // --- 3. COUPLE SPLIT & SAVINGS CAPACITY ---
    const coupleAnalysis = useMemo(() => {
        // USE NET SALARIES FOR SPLIT ANALYSIS
        const user1 = usersIncome[0];
        const user2 = usersIncome.length > 1 ? usersIncome[1] : null;

        // Explicitly use Net Salary for ratio calculation
        const totalNet = user1.netSalary + (user2 ? user2.netSalary : 0);

        let ratio1 = 1; // Solo user takes 100%
        if (user2) {
            if (config.splitMode === 'prorata' && totalNet > 0) ratio1 = user1.netSalary / totalNet;
            else if (config.splitMode === 'custom') ratio1 = (config.customSplit || 50) / 100;
        }
        const ratio2 = 1 - ratio1;

        let commonExpenses = 0;
        let user1Personal = 0;
        let user2Personal = 0;

        budgetItems.forEach(item => {
            const amount = getDisplayTarget(item);
            if (item.nature !== 'Epargne') {
                if (item.type === 'Commun') commonExpenses += amount;
                else if (item.type === 'Perso 1') user1Personal += amount;
                else if (item.type === 'Perso 2') user2Personal += amount;
            }
        });

        const user1IncomeDisplay = user1.netSalary * getMultiplier();
        const user2IncomeDisplay = user2 ? user2.netSalary * getMultiplier() : 0;

        const user1ShareCommon = commonExpenses * ratio1;
        const user2ShareCommon = commonExpenses * ratio2;

        const user1Contribution = user1ShareCommon + user1Personal;
        const user2Contribution = user2ShareCommon + user2Personal;

        const user1Savings = user1IncomeDisplay - user1Contribution;
        const user2Savings = user2IncomeDisplay - user2Contribution;
        const totalSavings = user1Savings + user2Savings;

        return {
            user1, user2,
            user1Savings, user2Savings, totalSavings,
            user1Income: user1IncomeDisplay, user2Income: user2IncomeDisplay,
            user1Contribution, user2Contribution,
            user1ShareCommon, user2ShareCommon,
            user1Personal, user2Personal,
            splitRatio1: ratio1,
            splitMode: config.splitMode,
            isSolo: !user2
        };
    }, [config, usersIncome, budgetItems, timeView, inflationSim, customStart, customEnd]);

    const alerts = useMemo(() => {
        const list: string[] = [];
        budgetItems.forEach(item => {
            const spent = actualsMap[item.name] || 0;
            const target = getDisplayTarget(item);
            if (target > 0 && spent > target * 1.1) {
                list.push(`${item.name} (${(spent - target).toFixed(0)}$ dépassé)`);
            }
        });
        return list;
    }, [budgetItems, actualsMap, timeView, inflationSim, customStart, customEnd]);

    const handleUpdateItem = (index: number, field: keyof BudgetCategory, value: any) => {
        const newItems = [...budgetItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setBudgetItems(newItems);
    };

    const handleAddItem = (nature: 'Besoin' | 'Envie' | 'Epargne' = 'Envie') => {
        const newId = `cat_${Date.now()}`;
        setBudgetItems([...budgetItems, {
            id: newId,
            name: 'Nouvelle Catégorie',
            target: 0,
            frequency: 'Monthly',
            type: 'Commun',
            nature: nature
        }]);
    };

    const handleDeleteItem = (idToDelete: string | undefined) => {
        if (!idToDelete) return;
        // ✅ Fix : ConfirmModal non-bloquant au lieu de window.confirm()
        setConfirmDeleteId(idToDelete);
    };

    const doConfirmDelete = () => {
        if (confirmDeleteId) {
            setBudgetItems(budgetItems.filter(i => i.id !== confirmDeleteId));
            setConfirmDeleteId(null);
        }
    };

    const handleAiDiagnosis = async () => {
        if (!apiKey) {
            showToast("Clé API Gemini requise pour le diagnostic IA.", "info");
            return;
        }
        setIsAnalyzing(true);
        setShowAiModal(true);
        setAiRecommendations([]);

        const payload = {
            totalNetIncome: totalNetIncomeDisplay,
            totalBudget: totalBudgetDisplay,
            totalSpent: totalSpentDisplay,
            alerts: alerts,
            categories: budgetItems.map(item => ({
                name: item.name,
                nature: item.nature || 'Inconnu',
                target: getDisplayTarget(item),
                spent: actualsMap[item.name] || 0
            }))
        };

        const recos = await analyzeBudgetAI(payload, apiKey);
        setAiRecommendations(recos);
        setIsAnalyzing(false);
    };

    const renderGroup = (nature: 'Besoin' | 'Envie' | 'Epargne', items: BudgetCategory[]) => {
        if (items.length === 0) return null;

        const groupTotalTarget = items.reduce((sum, i) => sum + getDisplayTarget(i), 0);
        const groupTotalSpent = items.reduce((sum, i) => sum + (actualsMap[i.name] || 0), 0);

        const labelPeriod = timeView === 'YEAR' ? '12 Mois' :
            timeView === 'QUARTER' ? 'Trimestre' :
                timeView === 'CUSTOM' ? 'Période' : 'Mois';

        return (
            <div className="mb-8 last:mb-0 animate-slide-up">
                <div className={`flex items-center justify-between px-4 py-2 rounded-t-lg border-b border-white/5 ${getGroupColor(nature)} bg-opacity-10`}>
                    <div className="flex items-center gap-2">
                        <span className="font-bold uppercase tracking-wider text-xs">{nature}</span>
                        <span className="text-[10px] opacity-70">({items.length})</span>
                    </div>
                    <div className="text-xs font-mono">
                        <span className={groupTotalSpent > groupTotalTarget ? 'text-red-400' : 'opacity-80'}>
                            {groupTotalSpent.toLocaleString()}$
                        </span>
                        <span className="opacity-50"> / {groupTotalTarget.toLocaleString()}$</span>
                    </div>
                </div>

                <div className="bg-[#1a1a1a] rounded-b-lg border border-white/5 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-black/20 text-[10px] text-gray-500 uppercase">
                            <tr>
                                <th className="p-3 font-normal">Catégorie</th>
                                <th className="p-3 font-normal hidden sm:table-cell">Tendance (6m)</th>
                                <th className="p-3 font-normal text-right">
                                    Cible ({labelPeriod})
                                </th>
                                <th className="p-3 font-normal text-right text-[9px] w-16">
                                    % Budget
                                </th>
                                <th className="p-3 font-normal text-right hidden sm:table-cell">
                                    Répartition
                                </th>
                                <th className="p-3 font-normal text-right">
                                    Réel ({labelPeriod})
                                </th>
                                <th className="p-3 font-normal text-right hidden md:table-cell">Écart</th>
                                <th className="p-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="text-sm divide-y divide-white/5">
                            {items.map((item) => {
                                const idx = budgetItems.findIndex(i => i.id === item.id);
                                const displayTarget = getDisplayTarget(item);
                                const spent = actualsMap[item.name] || 0;
                                const remaining = displayTarget - spent;
                                const isOver = spent > displayTarget;
                                const percentageOfBudget = totalBudgetDisplay > 0 ? (displayTarget / totalBudgetDisplay) * 100 : 0;
                                const isExpanded = expandedId === item.id;
                                const percentSpent = displayTarget > 0 ? (spent / displayTarget) * 100 : 0;

                                // Calculate Split Amount
                                let splitDisplay = '';
                                if (coupleAnalysis.isSolo) {
                                    splitDisplay = `${config.users[0].name}: ${displayTarget.toFixed(0)}$`;
                                } else {
                                    if (item.type === 'Commun') {
                                        const u1Share = displayTarget * coupleAnalysis.splitRatio1;
                                        const u2Share = displayTarget * (1 - coupleAnalysis.splitRatio1);
                                        splitDisplay = `${config.users[0].name.substring(0, 3)}:${u1Share.toFixed(0)}$ / ${config.users[1].name.substring(0, 3)}:${u2Share.toFixed(0)}$`;
                                    } else if (item.type === 'Perso 1') {
                                        splitDisplay = `${config.users[0].name}: ${displayTarget.toFixed(0)}$`;
                                    } else {
                                        splitDisplay = `${config.users[1].name}: ${displayTarget.toFixed(0)}$`;
                                    }
                                }

                                return (
                                    <React.Fragment key={item.id}>
                                        <tr
                                            className={`hover:bg-white/5 transition-colors group cursor-pointer ${isExpanded ? 'bg-white/5' : ''}`}
                                            onClick={() => setExpandedId(isExpanded ? null : item.id!)}
                                        >
                                            <td className="p-3">
                                                <input
                                                    type="text"
                                                    value={item.name}
                                                    onChange={(e) => handleUpdateItem(idx, 'name', e.target.value)}
                                                    className="bg-transparent text-white font-medium focus:border-primary outline-none w-full text-sm placeholder-gray-600"
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                                <div className="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <select
                                                        value={item.frequency}
                                                        onChange={(e) => handleUpdateItem(idx, 'frequency', e.target.value)}
                                                        className="text-[9px] text-gray-500 bg-black border border-white/10 rounded px-1 outline-none cursor-pointer hover:text-white"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <option value="Weekly">Hebdo</option>
                                                        <option value="Monthly">Mensuel</option>
                                                        <option value="Quarterly">Trimestre</option>
                                                        <option value="Yearly">Annuel</option>
                                                    </select>
                                                    <select
                                                        value={item.type}
                                                        onChange={(e) => handleUpdateItem(idx, 'type', e.target.value)}
                                                        className="text-[9px] text-gray-500 bg-black border border-white/10 rounded px-1 outline-none cursor-pointer hover:text-white"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <option value="Commun">Commun</option>
                                                        <option value="Perso 1">Perso 1</option>
                                                        <option value="Perso 2">Perso 2</option>
                                                    </select>
                                                </div>
                                            </td>
                                            <td className="p-3 hidden sm:table-cell">
                                                <Sparkline
                                                    data={trendMap[item.name] || []}
                                                    color={isOver ? '#ef4444' : '#0f9d58'}
                                                />
                                            </td>
                                            <td className="p-3 text-right">
                                                <div className="flex flex-col items-end">
                                                    <div className="flex items-center justify-end">
                                                        <input
                                                            type="number"
                                                            value={item.target}
                                                            onChange={(e) => handleUpdateItem(idx, 'target', parseFloat(e.target.value) || 0)}
                                                            className={`bg-transparent text-right w-20 outline-none font-mono privacy-blur ${timeView !== 'MONTH' ? 'text-gray-500 text-xs' : 'text-white'}`}
                                                            title="Modifier le montant de base"
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                        <span className="text-gray-600 text-xs ml-1">{item.frequency === 'Monthly' ? '/m' : item.frequency === 'Yearly' ? '/an' : ''}</span>
                                                    </div>
                                                    <span className={`text-xs font-bold ${inflationSim > 0 ? 'text-orange-400' : 'text-gray-400'}`}>
                                                        = {displayTarget.toLocaleString()}$
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-3 text-right">
                                                <div className="text-[10px] text-gray-500 font-mono">
                                                    {percentageOfBudget.toFixed(1)}%
                                                </div>
                                            </td>
                                            <td className="p-3 text-right hidden sm:table-cell">
                                                <div className="text-[10px] text-gray-400 font-mono whitespace-nowrap">
                                                    {splitDisplay}
                                                </div>
                                            </td>
                                            <td className="p-3 text-right">
                                                <div className={`font-mono font-bold ${isOver ? 'text-red-400' : 'text-gray-200'} privacy-blur`}>
                                                    {spent.toLocaleString()}$
                                                </div>
                                                {timeView === 'MONTH' && displayTarget > 0 && (
                                                    <div className="w-full bg-gray-800 h-1.5 rounded-full mt-1 overflow-hidden relative">
                                                        <div
                                                            className="absolute top-0 bottom-0 w-0.5 bg-white z-10 opacity-50"
                                                            style={{ left: `${monthProgress}%` }}
                                                            title="Aujourd'hui"
                                                        ></div>
                                                        <div
                                                            className={`h-full transition-all duration-500 ${isOver ? 'bg-red-500' : (percentSpent > monthProgress ? 'bg-orange-400' : 'bg-green-500')}`}
                                                            style={{ width: `${Math.min(100, percentSpent)}%` }}
                                                        ></div>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-3 text-right hidden md:table-cell">
                                                <div className={`font-mono ${remaining < 0 ? 'text-red-500' : 'text-green-500'} opacity-80 privacy-blur`}>
                                                    {remaining > 0 ? '+' : ''}{remaining.toLocaleString()}$
                                                </div>
                                            </td>
                                            <td className="p-3 text-center">
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteItem(item.id); }}
                                                    className="text-gray-600 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    title="Supprimer la catégorie"
                                                >
                                                    ✕
                                                </button>
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr className="bg-black/30 border-b border-white/5 animate-fade-in">
                                                <td colSpan={8} className="p-4">
                                                    <div className="flex flex-col gap-2">
                                                        <div className="text-xs font-bold text-gray-400 uppercase">Historique (6 derniers mois)</div>
                                                        <div style={{ width: '100%', height: '150px' }}>
                                                            <ResponsiveContainer width="100%" height="100%">
                                                                <BarChart data={monthlyDataMap[item.name] || []}>
                                                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                                                    <XAxis dataKey="name" stroke="#666" tick={{ fontSize: 10 }} />
                                                                    <YAxis stroke="#666" tick={{ fontSize: 10 }} width={30} />
                                                                    <Tooltip
                                                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                                                        contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333' }}
                                                                        formatter={(val: number) => val.toFixed(0) + ' $'}
                                                                    />
                                                                    <ReferenceLine y={getDisplayTarget(item)} stroke="#666" strokeDasharray="3 3" label={{ position: 'right', value: 'Cible', fill: '#666', fontSize: 10 }} />
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
                    <button
                        onClick={() => handleAddItem(nature)}
                        className="w-full py-2 text-[10px] text-gray-500 hover:text-white hover:bg-white/5 transition-colors border-t border-white/5"
                    >
                        + Ajouter une ligne dans {nature}
                    </button>
                </div>
            </div>
        );
    };

    const goldenRuleData = [
        { name: 'Besoins', value: groupedItems['Besoin'].reduce((s, i) => s + getDisplayTarget(i), 0), fill: '#4ade80' },
        { name: 'Envies', value: groupedItems['Envie'].reduce((s, i) => s + getDisplayTarget(i), 0), fill: '#facc15' },
        { name: 'Épargne Théorique', value: Math.max(0, coupleAnalysis.totalSavings), fill: '#60a5fa' }
    ];

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <ConfirmModal
                isOpen={!!confirmDeleteId}
                onConfirm={doConfirmDelete}
                onCancel={() => setConfirmDeleteId(null)}
                title="Supprimer la catégorie"
                message="Supprimer cette catégorie de budget définitivement ? Les transactions associées ne seront pas effacées."
                confirmLabel="Supprimer"
            />
            {/* HEADER CONTROLS */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">Pilotage Budget</h2>
                    <p className="text-xs text-gray-400">
                        {timeView === 'MONTH' ? 'Vision tactique (Mois en cours)' :
                            timeView === 'QUARTER' ? 'Vision trimestrielle (Objectifs x3)' :
                                timeView === 'YEAR' ? 'Vision stratégique (Objectifs x12)' :
                                    'Période Personnalisée'}
                    </p>
                    {/* BUDGET HEALTH INDICATOR */}
                    <div className={`mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border ${totalNetIncomeDisplay >= totalBudgetDisplay ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                        <span>{totalNetIncomeDisplay >= totalBudgetDisplay ? '✅ Budget Excédentaire' : '⚠️ Budget Déficitaire'}</span>
                        <span>{(totalNetIncomeDisplay - totalBudgetDisplay).toLocaleString()}$</span>
                    </div>
                </div>

                <div className="flex gap-2 items-center flex-wrap">
                    <button
                        onClick={handleAiDiagnosis}
                        className="px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white border border-indigo-500/30 flex items-center gap-1"
                    >
                        ✨ Diagnostic IA
                    </button>
                    <div className="bg-black/40 rounded-lg p-1 border border-white/10 flex">
                        <button onClick={() => setTimeView('MONTH')} className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${timeView === 'MONTH' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>
                            📅 Mois
                        </button>
                        <button onClick={() => setTimeView('QUARTER')} className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${timeView === 'QUARTER' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>
                            📊 Trimestre
                        </button>
                        <button onClick={() => setTimeView('YEAR')} className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${timeView === 'YEAR' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>
                            📆 Année
                        </button>
                        <button onClick={() => setTimeView('CUSTOM')} className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${timeView === 'CUSTOM' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>
                            🛠️ Custom
                        </button>
                    </div>

                    {timeView === 'CUSTOM' && (
                        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1 border border-white/10">
                            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="bg-transparent text-white text-[10px] border-none outline-none w-24" />
                            <span className="text-gray-500">-</span>
                            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="bg-transparent text-white text-[10px] border-none outline-none w-24" />
                        </div>
                    )}
                </div>
            </div>

            {/* SUMMARY CARDS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative">
                <Card className="!p-4 bg-surface border-l-4 border-l-indigo-500 relative overflow-hidden group">
                    <div className="text-[10px] text-gray-500 uppercase font-bold">Budget Prévu</div>
                    <div className="text-2xl font-bold text-white privacy-blur">{totalBudgetDisplay.toLocaleString()}$</div>
                    <div className="text-[10px] text-gray-500 mt-1">Cible Ajustée (x{getMultiplier().toFixed(1)})</div>

                    {/* INFLATION SIMULATOR */}
                    <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-sm z-10 p-2 text-center">
                        <span className="text-xs text-orange-400 font-bold uppercase mb-1">Simulateur Inflation</span>
                        <input
                            type="range" min="0" max="20" step="1"
                            value={inflationSim} onChange={e => setInflationSim(Number(e.target.value))}
                            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                        />
                        <div className="text-white font-bold mt-1">+{inflationSim}%</div>
                    </div>
                    {inflationSim > 0 && (
                        <div className="absolute top-2 right-2 text-xs bg-orange-500 text-black font-bold px-1.5 rounded">+{inflationSim}% Infl.</div>
                    )}
                </Card>

                <Card className="!p-4 bg-surface border-l-4 border-l-blue-500">
                    <div className="text-[10px] text-gray-500 uppercase font-bold">Dépenses Réelles</div>
                    <div className="text-2xl font-bold text-white privacy-blur">{totalSpentDisplay.toLocaleString()}$</div>
                    <div className="text-[10px] text-gray-500 mt-1">
                        Sur la période sélectionnée
                    </div>
                </Card>

                <Card className="!p-4 bg-surface border-l-4 border-l-green-500">
                    <div className="text-[10px] text-gray-500 uppercase font-bold">Reste Disponible (Net)</div>
                    <div className={`text-2xl font-bold ${totalRemainingDisplay < 0 ? 'text-red-400' : 'text-green-400'} privacy-blur`}>{totalRemainingDisplay.toLocaleString()}$</div>
                    <div className="text-[10px] text-gray-500 mt-1">Revenu Net - Réel</div>
                </Card>

                <Card className="!p-4 bg-surface border-l-4 border-l-yellow-500">
                    <div className="text-[10px] text-gray-500 uppercase font-bold">Projection Fin Période</div>
                    <div className="text-2xl font-bold text-yellow-400 privacy-blur">{projectedTotalDisplay.toLocaleString()}$</div>
                    <div className="text-[10px] text-gray-500 mt-1">
                        {projectedTotalDisplay > totalBudgetDisplay ? `+${(projectedTotalDisplay - totalBudgetDisplay).toFixed(0)}$ vs Budget` : 'Dans les clous'}
                    </div>
                </Card>
            </div>

            {/* ALERTS BANNER */}
            {timeView === 'MONTH' && alerts.length > 0 && (
                <div className="bg-red-900/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-3 animate-fade-in">
                    <span className="text-xl">🚨</span>
                    <div>
                        <h4 className="text-sm font-bold text-red-400">Attention : Dépassements détectés</h4>
                        <p className="text-xs text-gray-400 mt-1">
                            {alerts.slice(0, 3).join(', ')} {alerts.length > 3 && `et ${alerts.length - 3} autres.`}
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* LEFT COLUMN: VISUALS */}
                <div className="lg:col-span-1 space-y-6">

                    {/* SAVINGS CAPACITY CARD & EXPENSE BREAKDOWN */}
                    <Card title={coupleAnalysis.isSolo ? "Santé Financière" : "Santé Financière du Couple"} className="bg-gradient-to-br from-[#1e1e1e] to-blue-900/10 border-blue-500/20">
                        <div className="space-y-6">

                            {/* NEW: VISUALISATION FISCALE */}
                            <div className="bg-black/30 rounded-lg p-3 border border-white/5 space-y-2">
                                <div className="flex justify-between items-center text-[10px] text-gray-400">
                                    <span>Revenus Bruts Totaux</span>
                                    <span>{totalGrossDisplay.toLocaleString()}$</span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] text-red-400">
                                    <span>Déductions Source (Impôts/Ass.)</span>
                                    <span>-{totalTaxDisplay.toLocaleString()}$</span>
                                </div>
                                <div className="w-full bg-gray-800 h-1 rounded-full">
                                    <div className="h-full bg-red-500/50" style={{ width: `${(totalTaxDisplay / totalGrossDisplay) * 100}%` }}></div>
                                </div>
                                <div className="flex justify-between items-center font-bold text-white mt-1 pt-1 border-t border-white/5">
                                    <span>Revenu Net Disponible</span>
                                    <span className="text-green-400">{totalNetIncomeDisplay.toLocaleString()}$</span>
                                </div>
                            </div>

                            {/* User 1 Breakdown */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-bold text-indigo-400">{coupleAnalysis.user1.name}</span>
                                    <div className="flex items-center gap-2">
                                        {coupleAnalysis.splitMode === 'prorata' && (
                                            <span className="text-[9px] text-gray-500">{(coupleAnalysis.splitRatio1 * 100).toFixed(0)}% (Net)</span>
                                        )}
                                        <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded">
                                            Effort: {coupleAnalysis.user1Income > 0 ? ((coupleAnalysis.user1Contribution / coupleAnalysis.user1Income) * 100).toFixed(0) : 0}%
                                        </span>
                                    </div>
                                </div>

                                <div className="relative h-4 w-full bg-black/50 rounded-full overflow-hidden flex">
                                    <div className="h-full bg-indigo-600" style={{ width: `${(coupleAnalysis.user1ShareCommon / coupleAnalysis.user1Income) * 100}%` }} title={`Commun: ${coupleAnalysis.user1ShareCommon.toFixed(0)}$`}></div>
                                    <div className="h-full bg-indigo-400" style={{ width: `${(coupleAnalysis.user1Personal / coupleAnalysis.user1Income) * 100}%` }} title={`Perso: ${coupleAnalysis.user1Personal.toFixed(0)}$`}></div>
                                    <div className="h-full bg-green-500/50" style={{ flex: 1 }} title={`Épargne: ${coupleAnalysis.user1Savings.toFixed(0)}$`}></div>
                                </div>

                                <div className="flex justify-between text-[10px] text-gray-400 px-1">
                                    <div className="flex flex-col">
                                        <span>Sorties: <span className="text-white font-bold">{coupleAnalysis.user1Contribution.toLocaleString()}$</span></span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span>Épargne: <span className="text-green-400 font-bold">{coupleAnalysis.user1Savings.toLocaleString()}$</span></span>
                                    </div>
                                </div>
                            </div>

                            {/* User 2 Breakdown */}
                            {!coupleAnalysis.isSolo && coupleAnalysis.user2 && (
                                <div className="space-y-2 pt-2 border-t border-white/5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-bold text-pink-400">{coupleAnalysis.user2.name}</span>
                                        <div className="flex items-center gap-2">
                                            {coupleAnalysis.splitMode === 'prorata' && (
                                                <span className="text-[9px] text-gray-500">{((1 - coupleAnalysis.splitRatio1) * 100).toFixed(0)}% (Net)</span>
                                            )}
                                            <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded">
                                                Effort: {coupleAnalysis.user2Income > 0 ? ((coupleAnalysis.user2Contribution / coupleAnalysis.user2Income) * 100).toFixed(0) : 0}%
                                            </span>
                                        </div>
                                    </div>

                                    <div className="relative h-4 w-full bg-black/50 rounded-full overflow-hidden flex">
                                        <div className="h-full bg-pink-600" style={{ width: `${(coupleAnalysis.user2ShareCommon / coupleAnalysis.user2Income) * 100}%` }} title={`Commun: ${coupleAnalysis.user2ShareCommon.toFixed(0)}$`}></div>
                                        <div className="h-full bg-pink-400" style={{ width: `${(coupleAnalysis.user2Personal / coupleAnalysis.user2Income) * 100}%` }} title={`Perso: ${coupleAnalysis.user2Personal.toFixed(0)}$`}></div>
                                        <div className="h-full bg-green-500/50" style={{ flex: 1 }} title={`Épargne: ${coupleAnalysis.user2Savings.toFixed(0)}$`}></div>
                                    </div>

                                    <div className="flex justify-between text-[10px] text-gray-400 px-1">
                                        <div className="flex flex-col">
                                            <span>Sorties: <span className="text-white font-bold">{coupleAnalysis.user2Contribution.toLocaleString()}$</span></span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span>Épargne: <span className="text-green-400 font-bold">{coupleAnalysis.user2Savings.toLocaleString()}$</span></span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="pt-2 text-center bg-green-500/10 rounded-lg py-2 border border-green-500/20">
                                <div className="text-2xl font-bold text-green-400 privacy-blur">
                                    +{coupleAnalysis.totalSavings.toLocaleString()} $
                                </div>
                                <div className="text-[10px] text-green-200">Potentiel d'épargne combiné (Net)</div>
                            </div>
                        </div>
                    </Card>

                    {/* AMELIORER MON BUDGET & 50/30/20 THEORETICAL */}
                    <Card title="Améliorer mon budget" className="bg-gradient-to-br from-indigo-900/10 to-purple-900/10 border-indigo-500/20">
                        <div className="flex flex-col gap-4">
                            <button
                                onClick={() => {
                                    if (apiKey) handleAiDiagnosis();
                                    else showToast("Clé API Gemini requise dans Paramètres.", "error");
                                }}
                                disabled={isAnalyzing}
                                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95"
                            >
                                {isAnalyzing ? <span className="animate-spin">⚙️</span> : <span>✨</span>}
                                {isAnalyzing ? 'Analyse en cours...' : 'Diagnostic IA'}
                            </button>

                            <div className="pt-2 border-t border-white/5">
                                <div className="text-xs text-gray-400 text-center mb-2 font-medium">Comparatif visuel 50/30/20</div>
                                <div style={{ width: '100%', height: '180px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={goldenRuleData}
                                                cx="50%" cy="50%" innerRadius={40} outerRadius={60}
                                                dataKey="value"
                                            >
                                                {goldenRuleData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />
                                                ))}
                                            </Pie>
                                            <Legend verticalAlign="bottom" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                                            <Tooltip contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333' }} formatter={(val: number) => val.toLocaleString() + '$'} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* RIGHT COLUMN: THE TABLE */}
                <div className="lg:col-span-2 space-y-6">
                    {renderGroup('Besoin', groupedItems['Besoin'])}
                    {renderGroup('Envie', groupedItems['Envie'])}
                    {renderGroup('Epargne', groupedItems['Epargne'])}
                </div>
            </div>

            {/* AI DIAGNOSIS MODAL */}
            {showAiModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-[#1e1e1e] border border-indigo-500/30 rounded-xl max-w-lg w-full overflow-hidden shadow-2xl">
                        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-indigo-900/10">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <span className="text-xl">✨</span> Diagnostic IA du Budget
                            </h3>
                            <button onClick={() => setShowAiModal(false)} className="text-gray-400 hover:text-white transition-colors">✕</button>
                        </div>
                        <div className="p-6">
                            {isAnalyzing ? (
                                <div className="flex flex-col items-center justify-center py-8">
                                    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-sm text-gray-400 mt-4 animate-pulse">L'IA de FinanceAI parcourt vos lignes de budget...</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {aiRecommendations.map((reco, idx) => (
                                        <div key={idx} className="bg-white/5 border border-white/10 rounded-lg p-4 flex gap-3 animate-slide-up" style={{ animationDelay: `${idx * 100}ms` }}>
                                            <div className="text-indigo-400 mt-0.5">•</div>
                                            <p className="text-sm text-gray-200 leading-relaxed">{reco}</p>
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => setShowAiModal(false)}
                                        className="w-full mt-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition-colors"
                                    >
                                        Fermer le diagnostic
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
