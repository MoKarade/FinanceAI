import React, { useMemo, useState } from 'react';
import { Transaction, BudgetConfig, BudgetCategory } from '../types';
import { Card } from './ui/Card';
import { ConfirmModal } from './ui/ConfirmModal';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { showToast } from './ui/Toast';
import { BudgetGroupTable } from './budget/BudgetGroupTable';
import { BudgetAiModal } from './budget/BudgetAiModal';
import { useFinanceStore } from '../store/useFinanceStore';
import { PageHeader } from './ui/PageHeader';
import { KPIStat } from './ui/KPIStat';
import { StatGrid } from './ui/StatGrid';
import { Pill } from './ui/Pill';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

interface BudgetProps {
    transactions: Transaction[];
    config: BudgetConfig;
    budgetItems: BudgetCategory[];
    setBudgetItems: (items: BudgetCategory[]) => void;
    apiKey: string;
}

type TimeView = 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';

export const Budget: React.FC<BudgetProps> = ({ transactions, config, budgetItems, setBudgetItems, apiKey }) => {
    const [timeView, setTimeView] = useState<TimeView>('MONTH');
    const [inflationSim, setInflationSim] = useState(0);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null); // Pour le modal

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

    const buildAiPayload = () => ({
        totalNetIncome: totalNetIncomeDisplay,
        totalBudget: totalBudgetDisplay,
        totalSpent: totalSpentDisplay,
        alerts,
        categories: budgetItems.map(item => ({
            name: item.name,
            nature: item.nature || 'Inconnu',
            target: getDisplayTarget(item),
            spent: actualsMap[item.name] || 0,
        })),
    });

    const handleAiDiagnosis = () => {
        if (!apiKey) {
            showToast("Clé API Gemini requise pour le diagnostic IA.", "info");
            return;
        }
        setShowAiModal(true);
    };
    const goldenRuleData = [
        { name: 'Besoins', value: groupedItems['Besoin'].reduce((s, i) => s + getDisplayTarget(i), 0), fill: '#4ade80' },
        { name: 'Envies', value: groupedItems['Envie'].reduce((s, i) => s + getDisplayTarget(i), 0), fill: '#facc15' },
        { name: 'Épargne Théorique', value: Math.max(0, coupleAnalysis.totalSavings), fill: '#60a5fa' }
    ];

    // Wiring 2026-05: snapshot final de la projection vivante.
    // Permet de relier "épargne théorique mensuelle" → "patrimoine fin vie".
    const lastProjection = useFinanceStore(s => s.lastProjection);
    const projectionSummary = useMemo(() => {
        if (!lastProjection?.chartData?.length) return null;
        const last = lastProjection.chartData[lastProjection.chartData.length - 1];
        const monthlyTotalSavings = coupleAnalysis.totalSavings / getMultiplier(); // ramène mensuel
        // Sensibilité: estimation linéaire grossière "+100$/mo → +Δ patrimoine".
        // On utilise l'horizon de la projection et un rendement réel net ~5%.
        const horizonYears = lastProjection.chartData.length / 12;
        const realRate = 0.05;
        const factor = ((Math.pow(1 + realRate, horizonYears) - 1) / realRate) * 12; // FV d'une rente
        const per100 = 100 * factor; // impact patrimoine si +100$/mo
        return {
            estateNetWorth: lastProjection.estateNetWorth ?? last?.NetWorth ?? 0,
            finalYear: last?.year ?? new Date().getFullYear() + Math.round(horizonYears),
            per100Boost: per100,
            currentMonthlySavings: monthlyTotalSavings,
        };
    }, [lastProjection, coupleAnalysis.totalSavings]);

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
            <PageHeader
                icon="⚖️"
                title="Pilotage Budget"
                subtitle={
                    timeView === 'MONTH' ? 'Vision tactique (Mois en cours)' :
                    timeView === 'QUARTER' ? 'Vision trimestrielle (Objectifs ×3)' :
                    timeView === 'YEAR' ? 'Vision stratégique (Objectifs ×12)' :
                    'Période personnalisée'
                }
                badge={
                    <Badge variant={totalNetIncomeDisplay >= totalBudgetDisplay ? 'success' : 'danger'} size="md">
                        {totalNetIncomeDisplay >= totalBudgetDisplay ? '✅ Excédentaire' : '⚠️ Déficitaire'}
                        <span className="ml-1 tabular-nums">{(totalNetIncomeDisplay - totalBudgetDisplay).toLocaleString()}$</span>
                    </Badge>
                }
                actions={
                    <>
                        <Button onClick={handleAiDiagnosis} variant="primary" size="sm" icon="✨">
                            Diagnostic IA
                        </Button>
                        <Pill
                            aria-label="Période"
                            size="sm"
                            value={timeView}
                            onChange={(v) => setTimeView(v as TimeView)}
                            options={[
                                { value: 'MONTH', label: 'Mois', icon: '📅' },
                                { value: 'QUARTER', label: 'Trim.', icon: '📊' },
                                { value: 'YEAR', label: 'Année', icon: '📆' },
                                { value: 'CUSTOM', label: 'Custom', icon: '🛠️' },
                            ]}
                        />
                        {timeView === 'CUSTOM' && (
                            <div className="flex items-center gap-1 bg-white/5 rounded-pill p-1 border border-white/10">
                                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="bg-transparent text-ink-100 text-meta border-none outline-none w-24" aria-label="Date de début" />
                                <span className="text-ink-400">-</span>
                                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="bg-transparent text-ink-100 text-meta border-none outline-none w-24" aria-label="Date de fin" />
                            </div>
                        )}
                    </>
                }
            />

            {/* Hero KPI strip */}
            <StatGrid cols={4}>
                <KPIStat
                    label="Budget Prévu"
                    icon="🎯"
                    value={`${totalBudgetDisplay.toLocaleString()}$`}
                    sublabel={`Cible Ajustée (×${getMultiplier().toFixed(1)})${inflationSim > 0 ? ` · +${inflationSim}% infl.` : ''}`}
                    privacy
                    variant="primary"
                />
                <KPIStat
                    label="Dépenses Réelles"
                    icon="💸"
                    value={`${totalSpentDisplay.toLocaleString()}$`}
                    sublabel="Sur la période"
                    privacy
                    variant="info"
                />
                <KPIStat
                    label="Reste Disponible (Net)"
                    icon="💰"
                    value={`${totalRemainingDisplay.toLocaleString()}$`}
                    sublabel="Revenu Net − Réel"
                    privacy
                    variant={totalRemainingDisplay < 0 ? 'danger' : 'success'}
                />
                <KPIStat
                    label="Projection Fin Période"
                    icon="📈"
                    value={`${projectedTotalDisplay.toLocaleString()}$`}
                    sublabel={projectedTotalDisplay > totalBudgetDisplay ? `+${(projectedTotalDisplay - totalBudgetDisplay).toFixed(0)}$ vs Budget` : 'Dans les clous'}
                    privacy
                    variant={projectedTotalDisplay > totalBudgetDisplay ? 'warning' : 'success'}
                />
            </StatGrid>

            {/* Simulateur d'inflation — toggle inline (avant: caché en hover sur Card 1) */}
            <details className="bg-surface/40 rounded-card border border-white/5 group">
                <summary className="cursor-pointer px-4 py-2 text-meta text-ink-300 hover:text-ink-50 transition-colors flex items-center justify-between focus-ring">
                    <span>🔥 Simulateur d'inflation {inflationSim > 0 && <Badge variant="warning" size="sm" className="ml-2">+{inflationSim}%</Badge>}</span>
                    <span className="text-ink-400 group-open:rotate-180 transition-transform" aria-hidden="true">▾</span>
                </summary>
                <div className="px-4 pb-4 pt-2 border-t border-white/5">
                    <label className="flex justify-between text-meta text-ink-300 mb-2">
                        <span>Hausse des dépenses simulée</span>
                        <span className="text-warning-400 font-bold">+{inflationSim}%</span>
                    </label>
                    <input
                        type="range" min="0" max="20" step="1"
                        value={inflationSim} onChange={e => setInflationSim(Number(e.target.value))}
                        className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-warning-500"
                        aria-label="Simulateur d'inflation"
                    />
                    <p className="text-tiny text-ink-400 mt-2">Applique un multiplicateur sur les cibles non-Épargne pour estimer l'impact de l'inflation.</p>
                </div>
            </details>

            {/* PROJECTION LINK (Wiring 2026-05) */}
            {projectionSummary && (
                <div className="bg-gradient-to-br from-blue-900/10 to-indigo-900/10 border border-blue-500/20 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div>
                        <div className="text-[10px] uppercase font-bold text-blue-300 tracking-widest mb-1">🔗 Impact à long terme</div>
                        <div className="text-2xl font-black text-white privacy-blur">
                            {projectionSummary.estateNetWorth.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1">
                            Patrimoine successoral projeté en {projectionSummary.finalYear} (FutureProjection actif).
                        </div>
                    </div>
                    <div className="bg-black/30 rounded-xl p-3 border border-white/5">
                        <div className="text-[10px] uppercase font-bold text-gray-400 tracking-widest mb-1">Sensibilité</div>
                        <div className="text-base font-bold text-emerald-400 privacy-blur">
                            +{projectionSummary.per100Boost.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-[10px] text-gray-500">par +100$/mois d'épargne supplémentaire</div>
                    </div>
                </div>
            )}

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
                                onClick={handleAiDiagnosis}
                                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95"
                            >
                                <span>✨</span> Diagnostic IA
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
                    {(['Besoin', 'Envie', 'Epargne'] as const).map(nature => (
                        <BudgetGroupTable
                            key={nature}
                            nature={nature}
                            items={groupedItems[nature]}
                            allItems={budgetItems}
                            actualsMap={actualsMap}
                            trendMap={trendMap}
                            monthlyDataMap={monthlyDataMap}
                            totalBudgetDisplay={totalBudgetDisplay}
                            monthProgress={monthProgress}
                            expandedId={expandedId}
                            onExpandToggle={setExpandedId}
                            getDisplayTarget={getDisplayTarget}
                            isSolo={coupleAnalysis.isSolo}
                            splitRatio1={coupleAnalysis.splitRatio1}
                            userNames={[config.users[0].name, config.users[1]?.name ?? '']}
                            timeView={timeView}
                            onUpdateItem={handleUpdateItem}
                            onDeleteItem={handleDeleteItem}
                            onAddItem={handleAddItem}
                        />
                    ))}
                </div>
            </div>

            {showAiModal && (
                <BudgetAiModal
                    apiKey={apiKey}
                    payload={buildAiPayload()}
                    onClose={() => setShowAiModal(false)}
                />
            )}
        </div>
    );
};
