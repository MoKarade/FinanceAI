import React, { useMemo, useState } from 'react';
import { Transaction, BudgetConfig, BudgetCategory, Tab as TabEnum } from '../types';
import { Card } from './ui/Card';
import { ConfirmModal } from './ui/ConfirmModal';
import { ProjectionRequired } from './ui/ProjectionRequired';
import { PrivateAmount } from './ui/PrivateAmount';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { showToast } from './ui/Toast';
import { BudgetGroupTable } from './budget/BudgetGroupTable';
import { BudgetAiModal } from './budget/BudgetAiModal';
import { useFinanceStore } from '../store/useFinanceStore';
import { PageHeader } from './ui/PageHeader';
import { ProjectionStaleBanner } from './ui/ProjectionStaleBanner';
import { Icon } from './ui/Icon';
import { Pill } from './ui/Pill';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { formatCAD, formatSigned, formatPercent } from '../utils/format';
import { computeBudgetParity, matchTransactionToCategory, computeGoldenSplit, GOLDEN_IDEAL, computeActualByOwner, type OrphanCategory } from '../utils/budget';
import { DualKPIStat } from './budget/DualKPIStat';
import { calculateFiscalReport } from '../utils/tax';
import { ChartDataTable, type ChartDataColumn } from './ui/ChartDataTable';
import { MASKED_AMOUNT_LABEL } from '../utils/privacyAria';

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

    const { actualsMap, totalSpent, trendMap, monthlyDataMap, orphanCategories, itemsWithoutTransactions, actualByOwner } = useMemo(() => {
        const { start, end } = getDateRange();
        // Ensure end date includes the full day
        const endInclusive = new Date(end);
        endInclusive.setHours(23, 59, 59, 999);

        const startStr = start.toISOString().split('T')[0];
        const endStr = endInclusive.toISOString().split('T')[0];

        const filtered = transactions.filter(t => {
            return t.date >= startStr && t.date <= endStr && t.amount < 0 && !t.isTransfer && !t.isDuplicate;
        });

        // [PH4-A] Réels + catégories orphelines (fenêtre) + postes sans dépense (TOUT
        // l'historique → un poste annuel rapproché une fois n'est pas « sans dépense »).
        const allSpend = transactions.filter(t => t.amount < 0 && !t.isTransfer && !t.isDuplicate);
        const parity = computeBudgetParity(filtered, budgetItems, allSpend);

        // [PH4-E] Dépense RÉELLE par conjoint sur la fenêtre (auto par type de poste, override par ownerId).
        const actualByOwner = computeActualByOwner(filtered, budgetItems);

        // Tendances 6 mois : MÊME règle de rapprochement que les réels (avant : nom
        // EXACT seul → un substring-match comptait dans le réel mais pas la tendance ;
        // et les doublons `isDuplicate` gonflaient la tendance mais PAS le réel — désormais
        // exclus des DEUX). Cache par catégorie + un seul passage sur les transactions (perf).
        const matchCache = new Map<string, string | undefined>();
        const matchedName = (cat: string): string | undefined => {
            if (!matchCache.has(cat)) matchCache.set(cat, matchTransactionToCategory(cat, budgetItems)?.name);
            return matchCache.get(cat);
        };
        const months: { mStr: string; monthName: string }[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({ mStr: d.toISOString().substring(0, 7), monthName: d.toLocaleDateString('fr-CA', { month: 'short' }) });
        }
        const trends: Record<string, number[]> = {};
        const detailedMonthly: Record<string, { name: string, value: number }[]> = {};
        budgetItems.forEach(item => {
            trends[item.name] = months.map(() => 0);
            detailedMonthly[item.name] = months.map(m => ({ name: m.monthName, value: 0 }));
        });
        for (const t of transactions) {
            if (t.amount >= 0 || t.isTransfer || t.isDuplicate) continue;
            const mi = months.findIndex(m => t.date.startsWith(m.mStr));
            if (mi < 0) continue;
            const name = matchedName(t.category);
            if (!name || !trends[name]) continue;
            const abs = Math.abs(t.amount);
            trends[name][mi] += abs;
            detailedMonthly[name][mi].value += abs;
        }

        return {
            actualsMap: parity.actualsMap,
            totalSpent: parity.totalSpent,
            trendMap: trends,
            monthlyDataMap: detailedMonthly,
            orphanCategories: parity.orphanCategories,
            itemsWithoutTransactions: parity.itemsWithoutTransactions,
            actualByOwner,
        };
    // getDateRange et now sont recréés à chaque render (fonctions locales) ; timeView, customStart,
    // customEnd couvrent déjà les paramètres de getDateRange — ajout explicite éviterait une boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transactions, timeView, budgetItems, customStart, customEnd]);

    const totalBudgetDisplay = budgetItems.reduce((sum, item) => sum + getDisplayTarget(item), 0);
    // [PH4-A/F1] Total dépensé = TOUTES les dépenses (postes rapprochés + orphelins), via
    // `totalSpent` — préserve le total d'AVANT le refactor (les orphelins comptent dans le réel).
    // `actualsMap` ne contient plus les orphelins → on NE somme PLUS ses valeurs ici.
    const totalSpentDisplay = totalSpent;
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
            // [PH4-E] Dépense RÉELLE par conjoint (transactions auto-attribuées par type de poste,
            // override par ownerId) — distincte du split PLANIFIÉ ci-dessus (cibles budgétées).
            user1Actual: actualByOwner.owner0,
            user2Actual: actualByOwner.owner1,
            communActual: actualByOwner.commun,
            splitRatio1: ratio1,
            splitMode: config.splitMode,
            isSolo: !user2
        };
    // getDisplayTarget et getMultiplier sont recréés à chaque render ; leurs vraies deps
    // (timeView, inflationSim, customStart, customEnd, periodOffset) sont déjà listées explicitement.
    // periodOffset : getMultiplier→getDateRange en dépend → sans lui, les KPIs d'épargne couple
    // restaient figés sur la période courante en navigant vers le passé (cohérent avec le useMemo voisin).
    // actualByOwner.* en SCALAIRES (pas l'objet) : `coupleAnalysis` ne se recalcule que si une valeur change,
    // pas à chaque nouvelle réf de l'objet (le useMemo de parité en recrée un à chaque recalcul).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config, usersIncome, budgetItems, timeView, inflationSim, customStart, customEnd, periodOffset, actualByOwner.owner0, actualByOwner.owner1, actualByOwner.commun]);

    const alerts = useMemo(() => {
        const list: string[] = [];
        budgetItems.forEach(item => {
            const spent = actualsMap[item.name] || 0;
            const target = getDisplayTarget(item);
            // Alerte seulement au-delà de 10% de dépassement (tolérance anti-bruit
            // pour les petits écarts normaux).
            if (target > 0 && spent > target * 1.1) {
                list.push(`${item.name} (${formatCAD(spent - target)} dépassé)`);
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
        { name: 'Besoins', value: groupedItems['Besoin'].reduce((s, i) => s + getDisplayTarget(i), 0), fill: '#5fa88f' },
        { name: 'Envies', value: groupedItems['Envie'].reduce((s, i) => s + getDisplayTarget(i), 0), fill: '#d8c06a' },
        { name: 'Épargne Théorique', value: Math.max(0, coupleAnalysis.totalSavings), fill: '#7ba0cf' }
    ];

    // [A11Y-CHARTS] table de données sr-only pour le donut 50/30/20 (Recharts opaque aux lecteurs d'écran).
    // Colonne Catégorie visible ; colonne Montant $ masquée en mode privé (parité avec PrivateAmount/blur).
    const isPrivacyMode = useFinanceStore(s => s.isPrivacyMode);
    const goldenTotal = goldenRuleData.reduce((s, d) => s + d.value, 0) || 1;
    const goldenRuleColumns: ChartDataColumn[] = [
        { key: 'name', label: 'Catégorie' },
        { key: 'value', label: 'Montant', format: (v) => isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(Number(v) || 0) },
        { key: 'value', label: 'Part', format: (v) => `${((Number(v) || 0) / goldenTotal * 100).toFixed(1)}%` },
    ];

    // [PH4-B] Répartition 50/30/20 RÉELLE (dépenses rapprochées) à comparer au THÉORIQUE
    // (cibles, goldenRuleData) et à l'idéal 50/30/20. Besoins/Envies réels = Σ des réels par
    // poste du groupe ; Épargne réelle = revenu réel − dépenses réelles (totalSpentDisplay inclut
    // les orphelins → toute dépense réduit bien l'épargne, même non rapprochée à un poste).
    const goldenTheo = computeGoldenSplit(goldenRuleData[0].value, goldenRuleData[1].value, goldenRuleData[2].value);
    const realBesoins = groupedItems['Besoin'].reduce((s, i) => s + (actualsMap[i.name] ?? 0), 0);
    const realEnvies = groupedItems['Envie'].reduce((s, i) => s + (actualsMap[i.name] ?? 0), 0);
    // < 0 = dépenses > revenu sur la période. On clampe l'épargne du donut à 0 (un segment
    // négatif n'a pas de sens), MAIS on le SIGNALE (sinon « 0 % épargne » masque un déficit réel).
    const realDeficit = totalActualIncomeDisplay - totalSpentDisplay;
    const realEpargne = Math.max(0, realDeficit);
    const goldenReal = computeGoldenSplit(realBesoins, realEnvies, realEpargne);
    const hasRealData = goldenReal.total > 0;
    const goldenRealData = [
        { name: 'Besoins', value: goldenReal.besoins, fill: '#5fa88f' },
        { name: 'Envies', value: goldenReal.envies, fill: '#d8c06a' },
        { name: 'Épargne réelle', value: goldenReal.epargne, fill: '#7ba0cf' },
    ];
    const goldenRealColumns: ChartDataColumn[] = [
        { key: 'name', label: 'Catégorie' },
        { key: 'value', label: 'Montant', format: (v) => isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(Number(v) || 0) },
        { key: 'value', label: 'Part', format: (v) => `${((Number(v) || 0) / (goldenReal.total || 1) * 100).toFixed(1)}%` },
    ];
    // Lignes de comparaison Réel · Cible (budget) · Idéal (50/30/20). `goodWhenHigher` : pour
    // l'épargne, dépasser l'idéal est BON ; pour besoins/envies, le dépasser est à surveiller.
    const goldenCompare = [
        { label: 'Besoins', real: goldenReal.pct.besoins, theo: goldenTheo.pct.besoins, ideal: GOLDEN_IDEAL.besoins, goodWhenHigher: false },
        { label: 'Envies', real: goldenReal.pct.envies, theo: goldenTheo.pct.envies, ideal: GOLDEN_IDEAL.envies, goodWhenHigher: false },
        { label: 'Épargne', real: goldenReal.pct.epargne, theo: goldenTheo.pct.epargne, ideal: GOLDEN_IDEAL.epargne, goodWhenHigher: true },
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
            {/* [PH2-c-2] — signal inter-onglets : dernier recalcul de projection échoué. */}
            <ProjectionStaleBanner />
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
                        {totalNetIncomeDisplay >= totalBudgetDisplay ? 'Excédentaire' : 'Déficitaire'}
                        <span className="ml-1 tabular-nums">{formatCAD(totalNetIncomeDisplay - totalBudgetDisplay)}</span>
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
                                { value: 'MONTH', label: 'Mois' },
                                { value: 'QUARTER', label: 'Trim.' },
                                { value: 'YEAR', label: 'Année' },
                                { value: 'CUSTOM', label: 'Custom' },
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
                                    <Icon name="chevron-left" size={15} />
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
                                    <Icon name="chevron-right" size={15} />
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
                                    { value: 'all', label: 'Couple' },
                                    { value: 'user1', label: coupleAnalysis.user1?.name?.split(' ')[0] || 'P1' },
                                    { value: 'user2', label: coupleAnalysis.user2?.name?.split(' ')[0] || 'P2' },
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
                    <span>Simulateur d'inflation {inflationSim > 0 && <Badge variant="warning" size="sm" className="ml-2">+{inflationSim}%</Badge>}</span>
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
                        <div className="text-tiny uppercase font-bold text-info-400 tracking-widest mb-1">Impact à long terme →</div>
                        <PrivateAmount as="div" className="text-2xl font-black text-white">
                            {formatCAD(projectionSummary.estateNetWorth)}
                        </PrivateAmount>
                        <div className="text-tiny text-ink-500 mt-1">
                            Patrimoine successoral projeté, avec rentes RRQ/PSV, en {projectionSummary.finalYear} (FutureProjection actif).
                        </div>
                    </div>
                    <div className="bg-black/30 rounded-xl p-3 border border-white/5">
                        <div className="text-tiny uppercase font-bold text-ink-300 tracking-widest mb-1">Sensibilité</div>
                        <PrivateAmount as="div" className="text-base font-bold text-success-400">
                            +{formatCAD(projectionSummary.per100Boost)}
                        </PrivateAmount>
                        <div className="text-tiny text-ink-500">par +100$/mois d'épargne supplémentaire</div>
                    </div>
                </button>
            )}

            {/* ALERTS BANNER */}
            {timeView === 'MONTH' && alerts.length > 0 && (
                <div className="bg-red-900/10 border border-danger-500/20 rounded-lg p-3 flex items-start gap-3 animate-fade-in">
                    <Icon name="alert" size={18} className="text-warning-400 shrink-0" />
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
                                    <div className="h-full bg-indigo-600" style={{ width: `${(coupleAnalysis.user1ShareCommon / coupleAnalysis.user1Income) * 100}%` }} title={`Commun: ${formatCAD(coupleAnalysis.user1ShareCommon)}`}></div>
                                    <div className="h-full bg-indigo-400" style={{ width: `${(coupleAnalysis.user1Personal / coupleAnalysis.user1Income) * 100}%` }} title={`Perso: ${formatCAD(coupleAnalysis.user1Personal)}`}></div>
                                    <div className="h-full bg-green-500/50" style={{ flex: 1 }} title={`Épargne: ${formatCAD(coupleAnalysis.user1Savings)}`}></div>
                                </div>

                                <div className="flex justify-between text-tiny text-ink-300 px-1">
                                    <div className="flex flex-col">
                                        <span>Sorties: <span className="text-white font-bold">{formatCAD(coupleAnalysis.user1Contribution)}</span></span>
                                        {/* [PH4-E] dépense RÉELLE perso attribuée (vs « Sorties » = part PLANIFIÉE). Masqué en solo (toujours 0). */}
                                        {!coupleAnalysis.isSolo && (
                                            <span className="text-ink-400" title="Dépenses réelles attribuées à ce conjoint (postes Perso, override possible)">Perso réel: <span className="text-white font-semibold">{formatCAD(coupleAnalysis.user1Actual)}</span></span>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span>Épargne: <span className="text-green-400 font-bold">{formatCAD(coupleAnalysis.user1Savings)}</span></span>
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
                                        <div className="h-full bg-pink-600" style={{ width: `${(coupleAnalysis.user2ShareCommon / coupleAnalysis.user2Income) * 100}%` }} title={`Commun: ${formatCAD(coupleAnalysis.user2ShareCommon)}`}></div>
                                        <div className="h-full bg-pink-400" style={{ width: `${(coupleAnalysis.user2Personal / coupleAnalysis.user2Income) * 100}%` }} title={`Perso: ${formatCAD(coupleAnalysis.user2Personal)}`}></div>
                                        <div className="h-full bg-green-500/50" style={{ flex: 1 }} title={`Épargne: ${formatCAD(coupleAnalysis.user2Savings)}`}></div>
                                    </div>

                                    <div className="flex justify-between text-tiny text-ink-300 px-1">
                                        <div className="flex flex-col">
                                            <span>Sorties: <span className="text-white font-bold">{formatCAD(coupleAnalysis.user2Contribution)}</span></span>
                                            {/* [PH4-E] dépense RÉELLE perso attribuée (vs « Sorties » = part PLANIFIÉE) */}
                                            <span className="text-ink-400" title="Dépenses réelles attribuées à ce conjoint (postes Perso, override possible)">Perso réel: <span className="text-white font-semibold">{formatCAD(coupleAnalysis.user2Actual)}</span></span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span>Épargne: <span className="text-green-400 font-bold">{formatCAD(coupleAnalysis.user2Savings)}</span></span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="pt-2 text-center bg-green-500/10 rounded-lg py-2 border border-green-500/20">
                                <PrivateAmount as="div" className="text-2xl font-bold text-green-400">
                                    {formatSigned(coupleAnalysis.totalSavings, { withCurrency: true })}
                                </PrivateAmount>
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
                                <div style={{ width: '100%', height: '180px' }} role="img" aria-label="Donut comparatif 50/30/20 du budget (Besoins, Envies, Épargne théorique)">
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
                                            <Tooltip contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333' }} formatter={(val: number) => formatCAD(val)} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <ChartDataTable
                                    caption="Répartition budgétaire 50/30/20 (Besoins, Envies, Épargne théorique)"
                                    columns={goldenRuleColumns}
                                    rows={goldenRuleData}
                                />
                            </div>

                            {/* [PH4-B] RÉEL vs théorique : donut des dépenses réelles + comparaison
                                aux 3 références (Réel · Cible budgétée · Idéal 50/30/20). */}
                            <div className="pt-2 border-t border-white/5">
                                <div className="text-meta text-ink-300 text-center mb-2 font-medium">Ta répartition réelle</div>
                                {hasRealData ? (
                                    <>
                                        <div style={{ width: '100%', height: '180px' }} role="img" aria-label="Donut de ta répartition réelle (Besoins, Envies, Épargne réelle)">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie data={goldenRealData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value">
                                                        {goldenRealData.map((entry, index) => (
                                                            <Cell key={`real-cell-${index}`} fill={entry.fill} stroke="none" />
                                                        ))}
                                                    </Pie>
                                                    <Legend verticalAlign="bottom" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                                                    <Tooltip contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333' }} formatter={(val: number) => formatCAD(val)} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <table className="w-full text-tiny mt-1">
                                            <caption className="sr-only">Comparaison de ta répartition réelle, de ta cible budgétée et de l'idéal 50/30/20, par catégorie.</caption>
                                            <thead>
                                                <tr className="text-ink-400 uppercase tracking-widest">
                                                    <th scope="col" className="text-left font-bold pb-1">Catégorie</th>
                                                    <th scope="col" className="text-right font-bold pb-1">Réel</th>
                                                    <th scope="col" className="text-right font-bold pb-1">Cible</th>
                                                    <th scope="col" className="text-right font-bold pb-1">Idéal</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {goldenCompare.map(row => {
                                                    const ecart = row.real - row.ideal;
                                                    const onTrack = row.goodWhenHigher ? ecart >= -2 : ecart <= 2; // ±2 pts de tolérance
                                                    return (
                                                        <tr key={row.label} className="border-t border-white/5">
                                                            <th scope="row" className="text-left font-medium text-ink-200 py-1">{row.label}</th>
                                                            <td className={`text-right tabular-nums py-1 font-bold ${onTrack ? 'text-green-400' : 'text-warning-400'}`}>{formatPercent(row.real, 0)}</td>
                                                            <td className="text-right tabular-nums py-1 text-ink-300">{formatPercent(row.theo, 0)}</td>
                                                            <td className="text-right tabular-nums py-1 text-ink-400">{formatPercent(row.ideal, 0)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        {realDeficit < 0 && (
                                            <p className="text-tiny text-warning-400 mt-1.5 font-medium">Déficit réel de {formatCAD(Math.abs(realDeficit))} sur la période : tu as dépensé plus que ton revenu — l'épargne est ramenée à 0 dans ce graphe.</p>
                                        )}
                                        <p className="text-tiny text-ink-400 mt-1.5">« Réel » = tes dépenses rapprochées à un poste ; l'épargne réelle = revenu − dépenses. Vert = proche de l'idéal 50/30/20 (±2 pts) ; orange = écart à surveiller.</p>
                                        <ChartDataTable
                                            caption="Ta répartition réelle (Besoins, Envies, Épargne réelle)"
                                            columns={goldenRealColumns}
                                            rows={goldenRealData}
                                        />
                                    </>
                                ) : (
                                    <p className="text-meta text-ink-400 text-center py-4">Pas encore de dépenses rapprochées sur la période — ta répartition réelle s'affichera dès que des transactions correspondront à tes postes.</p>
                                )}
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

                    {/* [PH4-A] Parité Budget ↔ Transactions : trous de rapprochement (règle unique
                        `matchTransactionToCategory`). Empty-state honnête si tout est rapproché. */}
                    {(orphanCategories.length > 0 || itemsWithoutTransactions.length > 0) ? (
                        <div className="premium-card rounded-2xl p-4 sm:p-5 border border-white/5">
                            <div className="flex items-center gap-2 mb-3">
                                <Icon name="transactions" size={16} />
                                <h2 className="text-h2 font-bold text-white">Parité Budget ↔ Transactions</h2>
                            </div>
                            {orphanCategories.length > 0 && (
                                <div className="mb-4">
                                    <h3 className="text-tiny uppercase tracking-widest text-ink-400 font-bold mb-1.5">
                                        Catégories de transactions sans poste ({orphanCategories.length})
                                    </h3>
                                    <ul className="space-y-1">
                                        {orphanCategories.map((o: OrphanCategory) => (
                                            <li key={o.category} className="flex items-center justify-between gap-2 text-meta">
                                                <span className="text-ink-200 truncate">{o.category}</span>
                                                <PrivateAmount className="font-mono text-warning-400 shrink-0">{formatCAD(o.total)}</PrivateAmount>
                                            </li>
                                        ))}
                                    </ul>
                                    <p className="text-tiny text-ink-400 mt-1.5">Crée un poste du même nom (ou renomme la catégorie) pour suivre ces dépenses.</p>
                                </div>
                            )}
                            {itemsWithoutTransactions.length > 0 && (
                                <div>
                                    <h3 className="text-tiny uppercase tracking-widest text-ink-400 font-bold mb-1.5">
                                        Postes jamais rapprochés à une dépense ({itemsWithoutTransactions.length})
                                    </h3>
                                    <ul className="flex flex-wrap gap-1.5">
                                        {itemsWithoutTransactions.map(i => (
                                            <li key={i.id ?? i.name} className="text-tiny px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-ink-200">{i.name}</li>
                                        ))}
                                    </ul>
                                    <p className="text-tiny text-ink-400 mt-1.5">Aucune transaction (tout l'historique) ne correspond à ce poste — nom différent des catégories de transactions, ou poste inutilisé&nbsp;? (l'épargne par virement n'est pas comptée ici)</p>
                                </div>
                            )}
                        </div>
                    ) : budgetItems.length > 0 && (
                        <div className="text-meta text-ink-400 flex items-center gap-2 px-1">
                            <span aria-hidden="true">✓</span>
                            <span>Parité complète : chaque dépense est rapprochée à un poste, et chaque poste a des dépenses.</span>
                        </div>
                    )}
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
