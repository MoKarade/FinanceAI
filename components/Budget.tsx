import React, { useMemo, useState } from 'react';
import { Transaction, BudgetConfig, BudgetCategory, Tab as TabEnum } from '../types';
import { Card } from './ui/Card';
import { ConfirmModal } from './ui/ConfirmModal';
import { ProjectionRequired } from './ui/ProjectionRequired';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { showToast } from './ui/Toast';
import { BudgetGroupTable } from './budget/BudgetGroupTable';
import { BudgetAiModal } from './budget/BudgetAiModal';
import { useFinanceStore } from '../store/useFinanceStore';
import { PageHeader } from './ui/PageHeader';
import { Icon } from './ui/Icon';
import { Pill } from './ui/Pill';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { formatCAD } from '../utils/format';
import { DualKPIStat } from './budget/DualKPIStat';
import { calculateFiscalReport } from '../utils/tax';

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
    // Phase D'.6 — navigation périodes : 0 = courante, -1 = mois/trim/année précédent, etc.
    const [periodOffset, setPeriodOffset] = useState(0);
    // Phase D'.4 — filtre personne en mode couple (null = tout combiné)
    const [personFilter, setPersonFilter] = useState<0 | 1 | null>(null);

    const [showAiModal, setShowAiModal] = useState(false);

    // Custom Date State
    const [customStart, setCustomStart] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);

    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();
    const monthProgress = (currentDay / daysInMonth) * 100;

    const getDateRange = () => {
        // Phase D'.6 — applique le periodOffset (négatif = passé, positif = futur)
        if (timeView === 'MONTH') {
            const start = new Date(now.getFullYear(), now.getMonth() + periodOffset, 1);
            const end = new Date(now.getFullYear(), now.getMonth() + periodOffset + 1, 0, 23, 59, 59);
            return { start, end };
        } else if (timeView === 'QUARTER') {
            const currentQuarter = Math.floor(now.getMonth() / 3);
            const startMonth = (currentQuarter + periodOffset) * 3;
            const start = new Date(now.getFullYear(), startMonth, 1);
            const end = new Date(now.getFullYear(), startMonth + 3, 0, 23, 59, 59);
            return { start, end };
        } else if (timeView === 'YEAR') {
            const start = new Date(now.getFullYear() + periodOffset, 0, 1);
            const end = new Date(now.getFullYear() + periodOffset, 11, 31, 23, 59, 59);
            return { start, end };
        } else {
            // Custom : pas de périodes adjacentes, utilise les bornes user.
            return { start: new Date(customStart), end: new Date(customEnd) };
        }
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
        if (item.frequency === 'Quarterly') val = item.target / 3;
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
    const _totalTaxDisplay = totalTaxMonthly * getMultiplier();
    const _totalGrossDisplay = totalGrossIncomeMonthly * getMultiplier();

    const { filteredTransactions: _filteredTransactions, actualsMap, trendMap, monthlyDataMap } = useMemo(() => {
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
    // getDateRange et now sont recréés à chaque render (fonctions locales) ; timeView, customStart,
    // customEnd couvrent déjà les paramètres de getDateRange — ajout explicite éviterait une boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transactions, timeView, budgetItems, customStart, customEnd]);

    const totalBudgetDisplay = budgetItems.reduce((sum, item) => sum + getDisplayTarget(item), 0);
    const totalSpentDisplay = (Object.values(actualsMap) as number[]).reduce((a, b) => a + b, 0);
    const totalRemainingDisplay = totalNetIncomeDisplay - totalSpentDisplay; // Based on Net Income
    const projectedTotalDisplay = timeView === 'MONTH' ? (totalSpentDisplay / (currentDay / daysInMonth)) : totalSpentDisplay;

    // Phase D'.3 — vraie décomposition fiscale (intègre fed + QC + RRQ + AE + RQAP)
    // au lieu de la simple soustraction Brut − Net.
    const fiscalBreakdown = useMemo(() => {
        // grossSalary et netSalary sont MENSUELS dans le store → × 12 pour annuel
        let fedTax = 0;
        let qcTax = 0;
        let rrq = 0;
        let ae = 0;
        let rqap = 0;
        let netIncome = 0;
        let totalGross = 0;
        for (const u of usersIncome) {
            const grossAnnual = u.grossSalary * 12;
            if (grossAnnual <= 0) continue;
            const report = calculateFiscalReport(grossAnnual, 0, 0, new Date().getFullYear(), true);
            fedTax += report.fedTax;
            qcTax += report.qcTax;
            rrq += report.rrq;
            ae += report.ae;
            rqap += report.rqap;
            netIncome += report.netIncome;
            totalGross += grossAnnual;
        }
        const totalTax = fedTax + qcTax + rrq + ae + rqap;
        const multiplier = getMultiplier() / 12; // de annuel → période courante (mois/trim/an)
        return {
            grossDisplay: totalGross * multiplier,
            fedTaxDisplay: fedTax * multiplier,
            qcTaxDisplay: qcTax * multiplier,
            rrqDisplay: rrq * multiplier,
            aeRqapDisplay: (ae + rqap) * multiplier,
            totalTaxDisplay: totalTax * multiplier,
            netDisplay: netIncome * multiplier,
            averageRate: totalGross > 0 ? (totalTax / totalGross) * 100 : 0,
        };
    // getMultiplier est recréé à chaque render ; timeView et customStart/customEnd couvrent
    // déjà ses paramètres — l'ajouter directement causerait une recréation infinie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [usersIncome, timeView, customStart, customEnd]);

    // Phase D'.5 — revenu RÉEL = somme transactions positives (hors transferts) sur la période
    const totalActualIncomeDisplay = useMemo(() => {
        const { start, end } = getDateRange();
        return transactions
            .filter(t => !t.isTransfer && t.amount > 0)
            .filter(t => {
                const d = new Date(t.date);
                return d >= start && d <= end;
            })
            .reduce((sum, t) => sum + t.amount, 0);
    // getDateRange est une fonction locale recréée à chaque render ; ses vraies deps
    // (timeView, customStart, customEnd, periodOffset) sont listées directement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transactions, timeView, customStart, customEnd, periodOffset]);

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
    // inflationSim n'est pas utilisé par getBaseMonthlyTarget (tri par cible de base) ;
    // ESLint le détecte comme superflu mais le conserver ne nuit pas au comportement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // getDisplayTarget et getMultiplier sont recréés à chaque render ; leurs vraies deps
    // (timeView, inflationSim, customStart, customEnd, periodOffset) sont déjà listées explicitement.
    // periodOffset : getMultiplier→getDateRange en dépend → sans lui, les KPIs d'épargne couple
    // restaient figés sur la période courante en navigant vers le passé (cohérent avec le useMemo voisin).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config, usersIncome, budgetItems, timeView, inflationSim, customStart, customEnd, periodOffset]);

    const alerts = useMemo(() => {
        const list: string[] = [];
        budgetItems.forEach(item => {
            const spent = actualsMap[item.name] || 0;
            const target = getDisplayTarget(item);
            // Alerte seulement au-delà de 10% de dépassement (tolérance anti-bruit
            // pour les petits écarts normaux).
            if (target > 0 && spent > target * 1.1) {
                list.push(`${item.name} (${(spent - target).toFixed(0)}$ dépassé)`);
            }
        });
        return list;
    // getDisplayTarget est recréé à chaque render ; ses vraies deps sont déjà dans la liste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [budgetItems, actualsMap, timeView, inflationSim, customStart, customEnd]);

    const setAppState = useFinanceStore(s => s.setAppState);

    const handleUpdateItem = (index: number, field: keyof BudgetCategory, value: BudgetCategory[keyof BudgetCategory]) => {
        const newItems = [...budgetItems];
        const oldItem = newItems[index];
        newItems[index] = { ...oldItem, [field]: value };
        setBudgetItems(newItems);

        // Phase D'.1 — synchro absolue : si rename de catégorie, propage aux
        // transactions qui utilisent l'ancien nom.
        if (field === 'name' && typeof value === 'string' && oldItem.name && oldItem.name !== value) {
            const updatedTransactions = transactions.map(t =>
                t.category === oldItem.name ? { ...t, category: value } : t
            );
            const renamedCount = updatedTransactions.filter((t, i) => t.category !== transactions[i].category).length;
            if (renamedCount > 0) {
                setAppState({ transactions: updatedTransactions });
                showToast(`Catégorie renommée. ${renamedCount} transaction(s) mises à jour.`, 'success');
            }
        }
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
            const itemToDelete = budgetItems.find(i => i.id === confirmDeleteId);
            setBudgetItems(budgetItems.filter(i => i.id !== confirmDeleteId));
            // Phase D'.1 — réassigne les transactions affectées à "Uncategorized"
            // au lieu de les laisser pointer vers une catégorie fantôme.
            if (itemToDelete?.name) {
                const affectedCount = transactions.filter(t => t.category === itemToDelete.name).length;
                if (affectedCount > 0) {
                    const updatedTransactions = transactions.map(t =>
                        t.category === itemToDelete.name ? { ...t, category: 'Uncategorized' } : t
                    );
                    setAppState({ transactions: updatedTransactions });
                    showToast(`Catégorie supprimée. ${affectedCount} transaction(s) déplacée(s) vers "Uncategorized".`, 'info');
                }
            }
            setConfirmDeleteId(null);
        }
    };

    // Phase D'.1 — compte les transactions affectées par la suppression
    // (utilisé dans le message de confirmation).
    const deleteAffectedCount = useMemo(() => {
        if (!confirmDeleteId) return 0;
        const itemToDelete = budgetItems.find(i => i.id === confirmDeleteId);
        if (!itemToDelete?.name) return 0;
        return transactions.filter(t => t.category === itemToDelete.name).length;
    }, [confirmDeleteId, budgetItems, transactions]);

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
            showToast("Clé API Anthropic requise pour le diagnostic IA.", "info");
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
    const navigateWithFocus = useFinanceStore(s => s.navigateWithFocus);
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
    // getMultiplier est recréé à chaque render ; ses deps (timeView, customStart, customEnd)
    // sont implicitement couvertes par coupleAnalysis.totalSavings qui se recalcule avec elles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastProjection, coupleAnalysis.totalSavings]);

    return (
        <div className="space-y-6 stagger-in pb-20">
            <ConfirmModal
                isOpen={!!confirmDeleteId}
                onConfirm={doConfirmDelete}
                onCancel={() => setConfirmDeleteId(null)}
                title="Supprimer la catégorie"
                message={
                    deleteAffectedCount > 0
                        ? `Supprimer définitivement ? ${deleteAffectedCount} transaction(s) seront déplacées vers "Uncategorized".`
                        : "Supprimer cette catégorie de budget définitivement ?"
                }
                confirmLabel="Supprimer"
            />
            <PageHeader
                icon={<Icon name="budget" size={28} />}
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
                        <Button onClick={handleAiDiagnosis} variant="primary" size="sm">
                            Diagnostic
                        </Button>
                        <Pill
                            aria-label="Période"
                            size="sm"
                            value={timeView}
                            onChange={(v) => { setTimeView(v as TimeView); setPeriodOffset(0); }}
                            options={[
                                { value: 'MONTH', label: 'Mois', icon: '📅' },
                                { value: 'QUARTER', label: 'Trim.', icon: '📊' },
                                { value: 'YEAR', label: 'Année', icon: '📆' },
                                { value: 'CUSTOM', label: 'Custom', icon: '🛠️' },
                            ]}
                        />
                        {/* Phase D'.6 — navigation rapide périodes adjacentes */}
                        {timeView !== 'CUSTOM' && (
                            <div className="flex items-center gap-1 bg-white/5 rounded-pill p-0.5 border border-white/10">
                                <button
                                    type="button"
                                    onClick={() => setPeriodOffset(o => o - 1)}
                                    title="Période précédente"
                                    aria-label="Période précédente"
                                    className="px-2 py-1 text-ink-300 hover:text-ink-100 hover:bg-white/10 rounded transition-colors focus-ring"
                                >
                                    ←
                                </button>
                                <span className="px-2 text-tiny text-ink-300 font-mono min-w-[80px] text-center">
                                    {(() => {
                                        const { start } = getDateRange();
                                        if (timeView === 'MONTH') return start.toLocaleDateString('fr-CA', { month: 'short', year: '2-digit' });
                                        if (timeView === 'QUARTER') {
                                            const q = Math.floor(start.getMonth() / 3) + 1;
                                            return `T${q} ${start.getFullYear()}`;
                                        }
                                        return String(start.getFullYear());
                                    })()}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setPeriodOffset(o => Math.min(0, o + 1))}
                                    disabled={periodOffset >= 0}
                                    title={periodOffset >= 0 ? 'Période actuelle' : 'Période suivante'}
                                    aria-label="Période suivante"
                                    className="px-2 py-1 text-ink-300 hover:text-ink-100 hover:bg-white/10 rounded transition-colors focus-ring disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                >
                                    →
                                </button>
                                {periodOffset !== 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setPeriodOffset(0)}
                                        title="Revenir à la période actuelle"
                                        className="px-2 py-1 text-tiny text-info-400 hover:underline focus-ring rounded"
                                    >
                                        Auj.
                                    </button>
                                )}
                            </div>
                        )}
                        {timeView === 'CUSTOM' && (
                            <div className="flex items-center gap-1 bg-white/5 rounded-pill p-1 border border-white/10">
                                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="bg-transparent text-ink-100 text-meta border-none outline-none w-24" aria-label="Date de début" />
                                <span className="text-ink-400">-</span>
                                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="bg-transparent text-ink-100 text-meta border-none outline-none w-24" aria-label="Date de fin" />
                            </div>
                        )}
                        {/* Phase D'.4 — filtre personne en mode couple */}
                        {coupleAnalysis.user2 && (
                            <Pill
                                aria-label="Filtre personne"
                                size="sm"
                                value={personFilter === null ? 'all' : (personFilter === 0 ? 'user1' : 'user2')}
                                onChange={(v) => setPersonFilter(v === 'all' ? null : v === 'user1' ? 0 : 1)}
                                options={[
                                    { value: 'all', label: 'Couple', icon: '👥' },
                                    { value: 'user1', label: coupleAnalysis.user1?.name?.split(' ')[0] || 'P1', icon: '👤' },
                                    { value: 'user2', label: coupleAnalysis.user2?.name?.split(' ')[0] || 'P2', icon: '👤' },
                                ]}
                            />
                        )}
                    </>
                }
            />

            {/* Phase D'.5 — Tuiles fusionnées prévu/réel (doc directives §3) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <DualKPIStat
                    label="Budget"
                    icon={<Icon name="goal" size={16} />}
                    prevu={totalBudgetDisplay}
                    reel={totalSpentDisplay}
                    sublabel={`Cible (×${getMultiplier().toFixed(1)})`}
                    variant="primary"
                />
                <DualKPIStat
                    label="Revenus"
                    icon={<Icon name="money" size={16} />}
                    prevu={totalNetIncomeDisplay}
                    reel={totalActualIncomeDisplay}
                    sublabel="Net (transactions ≥ 0)"
                    variant="success"
                />
                <DualKPIStat
                    label="Dépenses"
                    icon={<Icon name="debt" size={16} />}
                    prevu={totalBudgetDisplay}
                    reel={totalSpentDisplay}
                    sublabel={projectedTotalDisplay > totalBudgetDisplay ? `Projection +${formatCAD(projectedTotalDisplay - totalBudgetDisplay)}` : 'Sous le budget'}
                    variant={totalSpentDisplay > totalBudgetDisplay ? 'danger' : 'info'}
                    invertGoodBad
                />
                <DualKPIStat
                    label="Restant"
                    icon={<Icon name="status" size={16} />}
                    prevu={totalNetIncomeDisplay - totalBudgetDisplay}
                    reel={totalRemainingDisplay}
                    sublabel="Revenu − Dépenses"
                    variant={totalRemainingDisplay < 0 ? 'danger' : 'success'}
                />
            </div>

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

            {/* PROJECTION LINK (Wiring 2026-05) — mode strict */}
            {!projectionSummary && (
                <ProjectionRequired feature="L'impact à long terme du budget" />
            )}
            {projectionSummary && (
                <button
                    type="button"
                    onClick={() => navigateWithFocus(TabEnum.FUTURE)}
                    className="bg-white/[0.03] border border-white/10 rounded-card p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between w-full text-left hover:bg-white/[0.05] transition-colors focus-ring"
                    title="Ouvrir FutureProjection"
                >
                    <div>
                        <div className="text-tiny uppercase font-bold text-info-400 tracking-widest mb-1">🔗 Impact à long terme →</div>
                        <div className="text-2xl font-black text-white privacy-blur">
                            {formatCAD(projectionSummary.estateNetWorth)}
                        </div>
                        <div className="text-tiny text-ink-500 mt-1">
                            Patrimoine successoral projeté en {projectionSummary.finalYear} (FutureProjection actif).
                        </div>
                    </div>
                    <div className="bg-black/30 rounded-xl p-3 border border-white/5">
                        <div className="text-tiny uppercase font-bold text-ink-300 tracking-widest mb-1">Sensibilité</div>
                        <div className="text-base font-bold text-success-400 privacy-blur">
                            +{formatCAD(projectionSummary.per100Boost)}
                        </div>
                        <div className="text-tiny text-ink-500">par +100$/mois d'épargne supplémentaire</div>
                    </div>
                </button>
            )}

            {/* ALERTS BANNER */}
            {timeView === 'MONTH' && alerts.length > 0 && (
                <div className="bg-red-900/10 border border-danger-500/20 rounded-lg p-3 flex items-start gap-3 animate-fade-in">
                    <span className="text-xl">🚨</span>
                    <div>
                        <h4 className="text-body font-bold text-danger-400">Attention : Dépassements détectés</h4>
                        <p className="text-meta text-ink-300 mt-1">
                            {alerts.slice(0, 3).join(', ')} {alerts.length > 3 && `et ${alerts.length - 3} autres.`}
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* LEFT COLUMN: VISUALS */}
                <div className="lg:col-span-1 space-y-6">

                    {/* SAVINGS CAPACITY CARD & EXPENSE BREAKDOWN */}
                    <Card title={coupleAnalysis.isSolo ? "Santé Financière" : "Santé Financière du Couple"} className="bg-gradient-to-br from-[#1e1e1e] to-blue-900/10 border-info-500/20">
                        <div className="space-y-6">

                            {/* Phase D'.3 — Visualisation fiscale détaillée (fed + QC + RRQ + AE + RQAP)
                                au lieu de la simple soustraction Brut − Net. */}
                            <div className="bg-black/30 rounded-lg p-3 border border-white/5 space-y-2">
                                <div className="flex justify-between items-center text-tiny text-ink-300">
                                    <span>Revenus Bruts Totaux</span>
                                    <span className="font-mono">{formatCAD(fiscalBreakdown.grossDisplay)}</span>
                                </div>
                                {/* Barre stackée multi-couleurs des déductions */}
                                <div className="w-full bg-surfaceHighlight h-2 rounded-full overflow-hidden flex">
                                    <div
                                        className="h-full bg-danger-500/80"
                                        style={{ width: `${(fiscalBreakdown.fedTaxDisplay / fiscalBreakdown.grossDisplay) * 100}%` }}
                                        title={`Fédéral : ${formatCAD(fiscalBreakdown.fedTaxDisplay)}`}
                                    />
                                    <div
                                        className="h-full bg-rose-600/80"
                                        style={{ width: `${(fiscalBreakdown.qcTaxDisplay / fiscalBreakdown.grossDisplay) * 100}%` }}
                                        title={`Québec : ${formatCAD(fiscalBreakdown.qcTaxDisplay)}`}
                                    />
                                    <div
                                        className="h-full bg-warning-500/80"
                                        style={{ width: `${(fiscalBreakdown.rrqDisplay / fiscalBreakdown.grossDisplay) * 100}%` }}
                                        title={`RRQ : ${formatCAD(fiscalBreakdown.rrqDisplay)}`}
                                    />
                                    <div
                                        className="h-full bg-yellow-400/80"
                                        style={{ width: `${(fiscalBreakdown.aeRqapDisplay / fiscalBreakdown.grossDisplay) * 100}%` }}
                                        title={`AE + RQAP : ${formatCAD(fiscalBreakdown.aeRqapDisplay)}`}
                                    />
                                </div>
                                {/* Legend détaillé */}
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-tiny">
                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center gap-1 text-red-300">
                                            <span aria-hidden="true" className="w-2 h-2 bg-danger-500/80 rounded-sm" />
                                            Impôt fédéral
                                        </span>
                                        <span className="font-mono">{formatCAD(fiscalBreakdown.fedTaxDisplay)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center gap-1 text-rose-300">
                                            <span aria-hidden="true" className="w-2 h-2 bg-rose-600/80 rounded-sm" />
                                            Impôt QC
                                        </span>
                                        <span className="font-mono">{formatCAD(fiscalBreakdown.qcTaxDisplay)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center gap-1 text-amber-300">
                                            <span aria-hidden="true" className="w-2 h-2 bg-warning-500/80 rounded-sm" />
                                            RRQ
                                        </span>
                                        <span className="font-mono">{formatCAD(fiscalBreakdown.rrqDisplay)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center gap-1 text-yellow-300">
                                            <span aria-hidden="true" className="w-2 h-2 bg-yellow-400/80 rounded-sm" />
                                            AE + RQAP
                                        </span>
                                        <span className="font-mono">{formatCAD(fiscalBreakdown.aeRqapDisplay)}</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center text-tiny text-ink-500 pt-1 border-t border-white/5">
                                    <span>Total déductions ({fiscalBreakdown.averageRate.toFixed(1)}% moyen)</span>
                                    <span className="font-mono text-danger-400">−{formatCAD(fiscalBreakdown.totalTaxDisplay)}</span>
                                </div>
                                <div className="flex justify-between items-center font-bold text-white mt-1 pt-1 border-t border-white/5">
                                    <span>Revenu Net Disponible</span>
                                    <span className="text-success-400 font-mono">{formatCAD(fiscalBreakdown.netDisplay)}</span>
                                </div>
                            </div>

                            {/* User 1 Breakdown */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-body font-bold text-indigo-400">{coupleAnalysis.user1.name}</span>
                                    <div className="flex items-center gap-2">
                                        {coupleAnalysis.splitMode === 'prorata' && (
                                            <span className="text-tiny text-ink-500">{(coupleAnalysis.splitRatio1 * 100).toFixed(0)}% (Net)</span>
                                        )}
                                        <span className="text-meta text-ink-500 bg-white/5 px-2 py-0.5 rounded">
                                            Effort: {coupleAnalysis.user1Income > 0 ? ((coupleAnalysis.user1Contribution / coupleAnalysis.user1Income) * 100).toFixed(0) : 0}%
                                        </span>
                                    </div>
                                </div>

                                <div className="relative h-4 w-full bg-black/50 rounded-full overflow-hidden flex">
                                    <div className="h-full bg-indigo-600" style={{ width: `${(coupleAnalysis.user1ShareCommon / coupleAnalysis.user1Income) * 100}%` }} title={`Commun: ${coupleAnalysis.user1ShareCommon.toFixed(0)}$`}></div>
                                    <div className="h-full bg-indigo-400" style={{ width: `${(coupleAnalysis.user1Personal / coupleAnalysis.user1Income) * 100}%` }} title={`Perso: ${coupleAnalysis.user1Personal.toFixed(0)}$`}></div>
                                    <div className="h-full bg-green-500/50" style={{ flex: 1 }} title={`Épargne: ${coupleAnalysis.user1Savings.toFixed(0)}$`}></div>
                                </div>

                                <div className="flex justify-between text-tiny text-ink-300 px-1">
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
                                        <span className="text-body font-bold text-pink-400">{coupleAnalysis.user2.name}</span>
                                        <div className="flex items-center gap-2">
                                            {coupleAnalysis.splitMode === 'prorata' && (
                                                <span className="text-tiny text-ink-500">{((1 - coupleAnalysis.splitRatio1) * 100).toFixed(0)}% (Net)</span>
                                            )}
                                            <span className="text-meta text-ink-500 bg-white/5 px-2 py-0.5 rounded">
                                                Effort: {coupleAnalysis.user2Income > 0 ? ((coupleAnalysis.user2Contribution / coupleAnalysis.user2Income) * 100).toFixed(0) : 0}%
                                            </span>
                                        </div>
                                    </div>

                                    <div className="relative h-4 w-full bg-black/50 rounded-full overflow-hidden flex">
                                        <div className="h-full bg-pink-600" style={{ width: `${(coupleAnalysis.user2ShareCommon / coupleAnalysis.user2Income) * 100}%` }} title={`Commun: ${coupleAnalysis.user2ShareCommon.toFixed(0)}$`}></div>
                                        <div className="h-full bg-pink-400" style={{ width: `${(coupleAnalysis.user2Personal / coupleAnalysis.user2Income) * 100}%` }} title={`Perso: ${coupleAnalysis.user2Personal.toFixed(0)}$`}></div>
                                        <div className="h-full bg-green-500/50" style={{ flex: 1 }} title={`Épargne: ${coupleAnalysis.user2Savings.toFixed(0)}$`}></div>
                                    </div>

                                    <div className="flex justify-between text-tiny text-ink-300 px-1">
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
                                <div className="text-tiny text-green-200">Potentiel d'épargne combiné (Net)</div>
                            </div>
                        </div>
                    </Card>

                    {/* AMELIORER MON BUDGET & 50/30/20 THEORETICAL */}
                    <Card title="Améliorer mon budget" className="bg-white/[0.03] border-white/10">
                        <div className="flex flex-col gap-4">
                            <button
                                onClick={handleAiDiagnosis}
                                className="w-full py-3 bg-primary/15 border border-primary/40 text-primary hover:bg-primary/25 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors active:scale-95"
                            >
                                Diagnostic
                            </button>

                            <div className="pt-2 border-t border-white/5">
                                <div className="text-meta text-ink-300 text-center mb-2 font-medium">Comparatif visuel 50/30/20</div>
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
