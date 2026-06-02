import React, { useMemo, useState, useEffect, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
// Phase 7.A.1 — DashboardEvolutionChart lazy-load pour différer le chunk recharts (~445KB)
// hors du premier paint au boot (Dashboard = tab par défaut).
const DashboardEvolutionChart = React.lazy(() => import('./dashboard/DashboardEvolutionChart'));
import { Transaction, Asset, BudgetCategory, RealEstateGoal, BudgetConfig, ChildGoal, TravelGoal, LifeEvent, RetirementGoal, Tab, Debt } from '../types';
import { Card } from './ui/Card';
import { PageHeader } from './ui/PageHeader';
import { KPIStat } from './ui/KPIStat';
import { StatGrid } from './ui/StatGrid';
import { Skeleton } from './ui/Skeleton';
import { MarketDataPoint } from '../services/finance';
import { usePortfolioHistory } from '../hooks/usePortfolioHistory';
import { ASSET_META } from '../services/assetMeta';
import { useFinanceStore } from '../store/useFinanceStore';
import { HealthIndicator } from './dashboard/HealthIndicator';
import { StockComparisonModal } from './dashboard/StockComparisonModal';
import { Tab as TabEnum } from '../types';
import { formatCAD, formatPercent, formatSigned } from '../utils/format';
import { ProjectionRequired } from './ui/ProjectionRequired';

interface DashboardProps {
    transactions: Transaction[];
    assets: Asset[];
    initialBalances: Record<string, number>;
    budgetItems: BudgetCategory[];
    realEstateGoals: RealEstateGoal[];
    childGoals?: ChildGoal[];
    travelGoals: TravelGoal[];
    lifeEvents: LifeEvent[];
    retirementGoal: RetirementGoal;
    debts?: Debt[]; // NEW
    config: BudgetConfig;
    apiKey?: string;
    calculatedMonthlySavings?: number;
    onNavigate?: (tab: Tab) => void;
    isPrivacyMode?: boolean;
}

type TimeRange = '1M' | '3M' | 'YTD' | '1Y' | 'ALL' | 'CUSTOM';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4', '#84cc16', '#6366f1'];

// ✅ FIX #6 : Utiliser ASSET_META centralisé au lieu d'une copie locale désynchronisée
const ASSET_YIELDS: Record<string, number> = {};
Object.entries(ASSET_META).forEach(([k, v]) => {
    ASSET_YIELDS[k] = v.yield;
});

export const Dashboard: React.FC<DashboardProps> = ({
    transactions, assets, initialBalances, realEstateGoals, childGoals: _childGoals = [], debts = [],
    lifeEvents: _lifeEvents = [], onNavigate: _onNavigate, isPrivacyMode = false, calculatedMonthlySavings = 0,
    config,
}) => {
    const { t } = useTranslation();
    const [marketData, setMarketData] = useState<MarketDataPoint[]>([]);
    const [timeRange, setTimeRange] = useState<TimeRange>('1M');
    const [customStart, setCustomStart] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
    const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);
    const [futureYears, setFutureYears] = useState<number>(5);

    // Phase D.3 — multi-comptes : chaque compte peut être masqué/affiché ; un
    // bouton "Total" superpose une ligne d'agrégat. Persistance localStorage.
    const [hiddenAccounts, setHiddenAccounts] = useState<Set<string>>(() => {
        try {
            const raw = localStorage.getItem('dashboard:hiddenAccounts:v1');
            return raw ? new Set(JSON.parse(raw)) : new Set();
        } catch { return new Set(); }
    });
    const [showTotalLine, setShowTotalLine] = useState<boolean>(() => {
        try { return localStorage.getItem('dashboard:showTotal:v1') === 'true'; } catch { return false; }
    });
    const toggleAccount = (key: string) => {
        setHiddenAccounts(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            try { localStorage.setItem('dashboard:hiddenAccounts:v1', JSON.stringify([...next])); } catch {/* */}
            return next;
        });
    };
    const toggleTotal = () => {
        setShowTotalLine(prev => {
            const next = !prev;
            try { localStorage.setItem('dashboard:showTotal:v1', String(next)); } catch {/* */}
            return next;
        });
    };

    // Phase D.4 — sélection de stocks pour comparaison superposée
    const [selectedStockSymbols, setSelectedStockSymbols] = useState<Set<string>>(new Set());
    const [showComparisonModal, setShowComparisonModal] = useState(false);
    const toggleStockSelection = (symbol: string) => {
        setSelectedStockSymbols(prev => {
            const next = new Set(prev);
            if (next.has(symbol)) next.delete(symbol); else next.add(symbol);
            return next;
        });
    };

    // Wiring 2026-05: lit la vraie projection FutureProjection si dispo, sinon
    // fallback sur formule simple. Garanti d'être sync avec l'onglet projection.
    const lastProjection = useFinanceStore(s => s.lastProjection);
    const navigateWithFocus = useFinanceStore(s => s.navigateWithFocus);

    // Mode strict : retourne null si pas de projection. Aucune invention
    // (avant : fallback formule 5% qui divergeait silencieusement de Future).
    const calculateFutureValue = (_pv: number, _pmtMonthly: number, years: number): number | null => {
        if (!lastProjection?.chartData || lastProjection.chartData.length === 0) return null;
        const targetMonth = years * 12;
        const point = lastProjection.chartData.find(p => p.monthIndex === targetMonth)
            || lastProjection.chartData[Math.min(targetMonth, lastProjection.chartData.length - 1)];
        if (point && typeof point.NetWorth === 'number' && point.NetWorth > 0) {
            return point.NetWorth;
        }
        return null;
    };

    // Sprint 3B M3 — usePortfolioHistory hook avec cache singleton.
    // Avant : fetch redondant à chaque mount Dashboard (et chaque autre tab
    // qui en a besoin). Maintenant : un seul fetch global mis en cache pour
    // toute la session.
    const { history: portfolioHistory } = usePortfolioHistory();
    useEffect(() => {
        setMarketData(portfolioHistory);
    }, [portfolioHistory]);

    // --- ENGINE: DATA UNIFICATION & 30-DAY LOOKBACK ---
    // Phase D.8 — Active Income (mensuel) = somme des netSalary du couple.
    // `netSalary` est en MENSUEL dans le store (convention Budget.tsx).
    const totalMonthlyActiveIncome = useMemo(
        () => (config?.users || []).reduce((sum, u) => sum + (u.netSalary || u.salary || 0), 0),
        [config],
    );

    const { unifiedHistory, latestTotals, accountKeys, segmentedData, totalMonthlyPassive } = useMemo(() => {
        // Bug fix test-mode : si marketData (CSV historique externe) vide, on
        // calcule quand même un latestTotals.Total à partir de initialBalances +
        // transactions (cash) + assets (portfolio courant) pour que NetWorth
        // s'affiche correctement en mode test ou pour user sans CSV.
        if (marketData.length === 0) {
            let cash = 0;
            (Object.values(initialBalances) as number[]).forEach(v => cash += v);
            transactions.forEach((t) => {
                if (!t.isDuplicate && !t.isTransfer) cash += t.amount;
            });
            const portfolio = assets.reduce((sum, a) => sum + (a.quantity || 0) * (a.currentPrice || 0), 0);
            return {
                unifiedHistory: [],
                latestTotals: { date: new Date().toISOString().split('T')[0], Total: cash + portfolio } as MarketDataPoint,
                accountKeys: [],
                segmentedData: { assets: [], cash: [], credit: [] },
                totalMonthlyPassive: 0,
            };
        }

        // 1. Transaction Timeline & Balances
        const sortedTxs = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const cashAccountsList = new Set<string>();
        Object.keys(initialBalances).forEach(k => cashAccountsList.add(k));
        sortedTxs.forEach(t => { if (t.accountName && t.accountName !== 'Unknown') cashAccountsList.add(t.accountName) });

        let runningCash: Record<string, number> = { ...initialBalances };
        cashAccountsList.forEach(acc => { if (runningCash[acc] === undefined) runningCash[acc] = 0; });

        const thirtyDaysAgoDate = new Date();
        thirtyDaysAgoDate.setDate(thirtyDaysAgoDate.getDate() - 30);
        const thirtyDaysAgoStr = thirtyDaysAgoDate.toISOString().split('T')[0];

        // Calculate balances 30 days ago for LM accounts
        let cash30DaysAgo: Record<string, number> = { ...initialBalances };
        sortedTxs.forEach(t => {
            if (!t.isDuplicate && !t.isTransfer && t.accountName && t.accountName !== 'Unknown') {
                if (t.date <= thirtyDaysAgoStr) {
                    cash30DaysAgo[t.accountName] = (cash30DaysAgo[t.accountName] || 0) + t.amount;
                }
                runningCash[t.accountName] = (runningCash[t.accountName] || 0) + t.amount;
            }
        });

        // 2. Segmented Data Lists
        const lastMarketRow = marketData[marketData.length - 1];
        const marketRow30DaysAgo = marketData.find(d => new Date(d.date) >= thirtyDaysAgoDate) || marketData[0];

        let passiveIncome = 0;

        // A) Actifs Boursiers
        const indAssets = Object.keys(lastMarketRow)
            .filter(k => k !== 'date' && k !== 'Date' && !k.startsWith('Taux') && !k.includes('TOTAL'))
            .map(k => {
                const val = Number(lastMarketRow[k]) || 0;
                const prevVal = Number(marketRow30DaysAgo[k]) || 0;
                const diffCAD = val - prevVal;
                const perf = prevVal > 0 ? (diffCAD / prevVal) * 100 : 0;

                const cleanSymbol = k.replace('NASDAQ:', '').replace('NYSE:', '').replace('EPA:', '');
                const mappedAsset = assets.find(a => k.includes(a.symbol));

                const estYield = ASSET_YIELDS[cleanSymbol] || 0;
                const revMensuel = val * (estYield / 100) / 12;
                passiveIncome += revMensuel;

                return {
                    symbol: cleanSymbol,
                    value: val,
                    diffCAD,
                    performance: perf,
                    accountType: mappedAsset?.accountType || 'Non-Enreg',
                    revMensuel
                };
            }).sort((a, b) => b.value - a.value);

        // B & C) Cash & Crédit
        type CashEntry = { name: string; value: number; diffCAD: number; revMensuel?: number; isManual?: boolean };
        const cashList: CashEntry[] = [];
        const creditList: CashEntry[] = [];

        Object.keys(runningCash).forEach(acc => {
            const val = runningCash[acc];
            const prevVal = cash30DaysAgo[acc] || 0;
            const diffCAD = val - prevVal;

            if (val >= 0) {
                // ✅ FIX ERR-05 : Pas de faux 3% sur le cash — le cash génère 0$ de revenu passif
                cashList.push({ name: acc, value: val, diffCAD, revMensuel: 0 });
            } else {
                creditList.push({ name: acc, value: val, diffCAD });
            }
        });

        // Add manual debts to creditList
        debts.forEach(d => {
            creditList.push({ name: d.name, value: -d.balance, diffCAD: 0, isManual: true });
        });

        cashList.sort((a, b) => b.value - a.value);
        creditList.sort((a, b) => a.value - b.value);

        // 3. Chart History Building
        let txIdx = 0;
        let rc: Record<string, number> = { ...initialBalances };
        const keyToAccount: Record<string, string> = {};
        assets.forEach(a => {
            const fullKey = Object.keys(marketData[0]).find(k => k.includes(a.symbol));
            if (fullKey) keyToAccount[fullKey] = a.accountType || 'Non-Enreg';
        });

        const currentRealEstateEquity = realEstateGoals.reduce((sum, g) => sum + (g.currentValue || 0) - (g.mortgageBalance || 0), 0);
        const currentDebts = debts.reduce((sum, d) => sum + d.balance, 0);

        const hist = marketData.map(row => {
            const rowDateStr = row.date as string;
            const rowDate = new Date(rowDateStr);
            while (txIdx < sortedTxs.length && new Date(sortedTxs[txIdx].date) <= rowDate) {
                const t = sortedTxs[txIdx];
                if (!t.isDuplicate && !t.isTransfer && t.accountName && t.accountName !== 'Unknown') {
                    rc[t.accountName] = (rc[t.accountName] || 0) + t.amount;
                }
                txIdx++;
            }
            const point: Record<string, number | string> = { date: rowDateStr };
            let total = 0;
            cashAccountsList.forEach(acc => { point[acc] = rc[acc]; total += rc[acc]; });

            const invMap: Record<string, number> = { CELI: 0, REER: 0, NonReg: 0, Crypto: 0 };
            Object.keys(row).forEach(key => {
                if (key === 'date' || key === 'Date' || key.includes('Taux') || key.includes('TOTAL')) return;
                const val = Number(row[key]) || 0;
                const type = keyToAccount[key] || 'NonReg';
                if (type === 'CELI') invMap.CELI += val;
                else if (type === 'REER') invMap.REER += val;
                else if (type === 'CRYPTO') invMap.Crypto += val;
                else invMap.NonReg += val;
            });
            point.CELI = invMap.CELI; point.REER = invMap.REER; point.NonReg = invMap.NonReg; point.Crypto = invMap.Crypto;
            point.Immobilier = currentRealEstateEquity;
            point.Dettes = -currentDebts;

            total += invMap.CELI + invMap.REER + invMap.NonReg + invMap.Crypto + currentRealEstateEquity - currentDebts;
            point.Total = total;
            return point;
        });

        const now = new Date();
        let startDate = new Date(marketData[0].date);
        let endDate = new Date();
        switch (timeRange) {
            case '1M': startDate = new Date(); startDate.setMonth(now.getMonth() - 1); break;
            case '3M': startDate = new Date(); startDate.setMonth(now.getMonth() - 3); break;
            case 'YTD': startDate = new Date(now.getFullYear(), 0, 1); break;
            case '1Y': startDate = new Date(); startDate.setFullYear(now.getFullYear() - 1); break;
            case 'CUSTOM': startDate = new Date(customStart); endDate = new Date(customEnd); break;
        }
        const filteredHist = hist.filter(d => {
            const dDate = new Date(d.date); return dDate >= startDate && dDate <= endDate;
        });
        const lastPoint = filteredHist[filteredHist.length - 1] || hist[hist.length - 1] || { Total: 0 };
        // Clés UNIQUES : un compte cash peut porter le même nom qu'une catégorie
        // d'investissement (ex. persona « Diane & Robert » → soldes cash CELI/REER).
        // Sans `new Set`, 'CELI'/'REER' apparaissent deux fois → warning React
        // « same key » dans les chips de bascule + les séries recharts (rendu non
        // garanti). Le dataset ne porte qu'UNE valeur par clé (point.CELI/REER), le
        // dédoublonnage est donc correct ; l'ordre (cash d'abord) est préservé.
        const combinedKeys = Array.from(new Set([
            ...cashAccountsList,
            'Immobilier', 'CELI', 'REER', 'NonReg', 'Crypto', 'Dettes',
        ])).filter(k => lastPoint[k] !== 0);

        return {
            unifiedHistory: filteredHist,
            latestTotals: lastPoint,
            accountKeys: combinedKeys,
            segmentedData: { assets: indAssets, cash: cashList, credit: creditList },
            totalMonthlyPassive: passiveIncome
        };
    }, [marketData, assets, timeRange, customStart, customEnd, transactions, initialBalances, debts, realEstateGoals]);

    const performance = useMemo(() => {
        if (unifiedHistory.length < 2) return { global: 0, diff: 0 };
        const start = Number(unifiedHistory[0].Total) || 0;
        const end = Number(unifiedHistory[unifiedHistory.length - 1].Total) || 0;
        const diff = end - start;
        const pct = start > 0 ? (diff / start) * 100 : 0;
        return { global: pct, diff };
    }, [unifiedHistory]);

    return (
        <div className="space-y-6 animate-fade-in pb-10">

            <PageHeader
                icon="📊"
                title={t('dashboard.title', "Vue d'ensemble")}
                subtitle={t('dashboard.subtitle', "Patrimoine consolidé et tendance")}
            />

            {/* Hero KPI strip — Phase D.8 : 5 KPIs incluant Active Income */}
            <StatGrid cols={5}>
                <KPIStat
                    label={t('dashboard.global_net_worth')}
                    icon="💰"
                    value={formatCAD(Number(latestTotals?.Total) || 0)}
                    sublabel={t('dashboard.consolidated', 'Tous comptes')}
                    privacy
                    variant="primary"
                />
                <KPIStat
                    label={`${t('dashboard.global_variation')} (${timeRange})`}
                    icon="📈"
                    value={formatPercent(performance.global)}
                    sublabel={formatSigned(performance.diff || 0, { withCurrency: true, decimals: 2 })}
                    privacy
                    variant={performance.global >= 0 ? 'success' : 'danger'}
                />
                {/* Phase D.8 — Active Income (salaire net mensuel cumulé du couple).
                    `netSalary` est en MENSUEL dans le store (cf Budget.tsx). */}
                <KPIStat
                    label="Revenu actif"
                    icon="💼"
                    value={formatCAD(totalMonthlyActiveIncome)}
                    sublabel="/ mois (net)"
                    privacy
                    variant="info"
                />
                <KPIStat
                    label={t('dashboard.passive_income_month')}
                    icon="✨"
                    value={`+${formatCAD(totalMonthlyPassive)}`}
                    sublabel="/ mois"
                    privacy
                    variant="warning"
                />
                {/* Indicateur Futur — custom car contient un input année */}
                <div className="bg-info-bg backdrop-blur-sm rounded-card p-4 border-l-4 border-l-info-500 border-r border-t border-b border-white/5 flex flex-col gap-1 hover:bg-info-500/15 transition-colors group">
                    <div className="flex items-center justify-between">
                        <span className="kpi-label">{t('dashboard.future_predictor', 'Indicateur Futur')}</span>
                        <button
                            type="button"
                            onClick={() => navigateWithFocus(TabEnum.FUTURE)}
                            className="text-meta text-info-400 opacity-0 group-hover:opacity-100 focus-ring rounded transition-opacity"
                            title="Ouvrir la projection future"
                            aria-label="Aller à FutureProjection"
                        >
                            🎯 →
                        </button>
                    </div>
                    <div className="text-kpi text-ink-50 privacy-blur tabular-nums">
                        {(() => {
                            const projected = calculateFutureValue(Number(latestTotals?.Total) || 0, calculatedMonthlySavings || 0, futureYears);
                            return projected != null
                                ? formatCAD(projected)
                                : <ProjectionRequired variant="inline" feature="cette projection" />;
                        })()}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-meta">
                        <div className="flex items-center gap-1.5">
                            <span className="text-ink-400">Dans</span>
                            <input
                                type="number"
                                className="w-12 bg-dark border border-white/15 rounded px-1.5 py-0.5 text-meta text-center font-bold text-ink-50 focus-ring"
                                value={futureYears}
                                onChange={(e) => setFutureYears(Math.max(1, Math.min(50, Number(e.target.value))))}
                                min={1} max={50}
                                aria-label="Horizon en années"
                            />
                            <span className="text-ink-400">ans</span>
                        </div>
                        {lastProjection?.chartData && lastProjection.chartData.length > 0 && (
                            <button
                                type="button"
                                onClick={() => navigateWithFocus(TabEnum.FUTURE)}
                                className="text-tiny text-info-400 font-bold hover:underline focus-ring rounded"
                                title="Ouvrir la projection future"
                            >
                                🔗 Sync
                            </button>
                        )}
                    </div>
                </div>
            </StatGrid>

            {/* Phase D.6 — Indicateur santé financière paramétrable (remplace
                temporairement les anciens KPIs Cash/Saving/Dette retirés en D.5) */}
            <HealthIndicator />

            {/* CHART */}
            <Card title={t('dashboard.detailed_evolution')} className="w-full min-h-[450px]"
                action={
                    <div className="flex flex-col items-end gap-2">
                        <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/10">
                            {(['1M', '3M', 'YTD', '1Y', 'ALL', 'CUSTOM'] as TimeRange[]).map(r => (
                                <button key={r} onClick={() => setTimeRange(r)} className={`px-3 py-1 text-tiny font-bold rounded transition-all ${timeRange === r ? 'bg-white text-black shadow' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>{r}</button>
                            ))}
                        </div>
                        {timeRange === 'CUSTOM' && (
                            <div className="flex items-center gap-1.5">
                                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="bg-black/40 border border-white/10 rounded px-2 py-1 text-tiny text-white focus:border-white/30 outline-none" />
                                <span className="text-gray-500 text-tiny">→</span>
                                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="bg-black/40 border border-white/10 rounded px-2 py-1 text-tiny text-white focus:border-white/30 outline-none" />
                            </div>
                        )}
                    </div>
                }
            >
                {/* Phase D.3 — chips toggle pour chaque compte + "Total" overlay */}
                {accountKeys.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mb-3">
                        <span className="text-tiny text-ink-500 uppercase tracking-widest font-bold mr-1">Affichage :</span>
                        {accountKeys.map((key, idx) => {
                            const isHidden = hiddenAccounts.has(key);
                            const color = COLORS[idx % COLORS.length];
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => toggleAccount(key)}
                                    aria-pressed={!isHidden}
                                    title={isHidden ? `Afficher ${key}` : `Masquer ${key}`}
                                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-tiny font-medium border transition-colors focus-ring ${
                                        isHidden
                                            ? 'bg-white/[0.02] text-ink-500 border-white/5 hover:bg-white/5'
                                            : 'bg-white/10 text-ink-100 border-white/15 hover:bg-white/15'
                                    }`}
                                >
                                    <span
                                        aria-hidden="true"
                                        className={`w-2 h-2 rounded-full ${isHidden ? 'opacity-30' : ''}`}
                                        style={{ backgroundColor: color }}
                                    />
                                    {key}
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            onClick={toggleTotal}
                            aria-pressed={showTotalLine}
                            title={showTotalLine ? 'Masquer la ligne Total' : 'Afficher la ligne Total'}
                            className={`ml-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-tiny font-bold border transition-colors focus-ring ${
                                showTotalLine
                                    ? 'bg-white text-black border-white'
                                    : 'bg-white/[0.02] text-ink-400 border-white/10 hover:bg-white/5'
                            }`}
                        >
                            <span aria-hidden="true">∑</span>
                            Total
                        </button>
                    </div>
                )}
                <div className="w-full h-[380px]">
                    <Suspense fallback={<Skeleton variant="chart" />}>
                        <DashboardEvolutionChart
                            unifiedHistory={unifiedHistory}
                            accountKeys={accountKeys}
                            colors={COLORS}
                            isPrivacyMode={isPrivacyMode}
                            hiddenAccounts={hiddenAccounts}
                            showTotalLine={showTotalLine}
                        />
                    </Suspense>
                </div>
            </Card>

            {/* Phase D.5 — Cash/Saving/Dette/Jalons retirés (doc directives §2).
                Phase D.4 — Checkbox + clic → drawer chart, multi-check → overlay comparatif. */}
            <Card
                title={t('dashboard.individual_assets')}
                action={
                    selectedStockSymbols.size > 0 ? (
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setShowComparisonModal(true)}
                                className="px-3 py-1.5 bg-primary/15 hover:bg-primary/25 border border-primary/40 text-primary text-tiny font-bold rounded-card transition-colors focus-ring"
                            >
                                📈 {selectedStockSymbols.size === 1 ? 'Voir courbe' : `Comparer (${selectedStockSymbols.size})`}
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedStockSymbols(new Set())}
                                className="px-2 py-1 text-tiny text-ink-400 hover:text-ink-200 transition-colors focus-ring rounded"
                                title="Tout désélectionner"
                            >
                                ✕
                            </button>
                        </div>
                    ) : (
                        <span className="text-tiny text-ink-500 italic">Coche pour comparer</span>
                    )
                }
            >
                <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                    {segmentedData.assets.map(asset => {
                        const isSelected = selectedStockSymbols.has(asset.symbol);
                        // Phase D.4 — gain $/% depuis achat si dateBought + buyPrice connus
                        const ownedAsset = assets.find(a => a.symbol === asset.symbol);
                        const buyPrice = ownedAsset?.buyPrice;
                        const quantity = ownedAsset?.quantity || 0;
                        const currentPrice = ownedAsset?.currentPrice || 0;
                        const hasPurchaseData = buyPrice && buyPrice > 0 && quantity > 0;
                        const gainAbs = hasPurchaseData ? (currentPrice - buyPrice) * quantity : null;
                        const gainPct = hasPurchaseData ? ((currentPrice - buyPrice!) / buyPrice!) * 100 : null;
                        return (
                            <div
                                key={asset.symbol}
                                className={`p-3 rounded-xl border transition-colors cursor-pointer flex justify-between items-center group ${
                                    isSelected
                                        ? 'bg-primary/10 border-primary/40 hover:bg-primary/15'
                                        : 'bg-white/5 border-white/5 hover:bg-white/10'
                                }`}
                                onClick={() => toggleStockSelection(asset.symbol)}
                                role="button"
                                tabIndex={0}
                                aria-pressed={isSelected}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        toggleStockSelection(asset.symbol);
                                    }
                                }}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div
                                        aria-hidden="true"
                                        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                                            isSelected ? 'bg-primary border-primary' : 'border-white/20 group-hover:border-white/40'
                                        }`}
                                    >
                                        {isSelected && <span className="text-tiny text-white font-bold">✓</span>}
                                    </div>
                                    <div className="w-8 h-8 rounded bg-[#1e2330] flex items-center justify-center text-xs font-bold text-gray-300 shrink-0">{asset.symbol.substring(0, 2)}</div>
                                    <div className="min-w-0">
                                        <div className="font-bold text-white text-sm truncate">{asset.symbol}</div>
                                        <div className="text-tiny text-gray-500 bg-black/50 px-1.5 rounded inline-block mt-0.5">{asset.accountType}</div>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="font-mono font-bold text-gray-200 text-sm privacy-blur">{formatCAD(asset.value)}</div>
                                    <div className="flex justify-end gap-2 text-tiny mt-0.5 font-bold privacy-blur">
                                        <span className={asset.diffCAD >= 0 ? 'text-green-500' : 'text-red-500'}>
                                            {formatSigned(asset.diffCAD, { withCurrency: true })}
                                        </span>
                                        <span className="text-yellow-500" title="Revenu mensuel estimé (dividendes)">
                                            +{formatCAD(asset.revMensuel)}
                                        </span>
                                    </div>
                                    {hasPurchaseData && gainAbs !== null && gainPct !== null ? (
                                        <div className="text-tiny mt-0.5 privacy-blur" title="Gain total depuis l'achat (cours actuel vs prix d'achat)">
                                            <span className={`font-mono ${gainAbs >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                Achat : {formatSigned(gainAbs, { withCurrency: true })} ({formatSigned(gainPct, { decimals: 2 })}%)
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="text-tiny mt-0.5 text-ink-600 italic">
                                            Date/prix d'achat manquant ·{' '}
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); navigateWithFocus(TabEnum.SETTINGS, 'profile-user1-card'); }}
                                                className="text-info-400 hover:underline focus-ring rounded"
                                            >
                                                Configurer →
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {segmentedData.assets.length === 0 && <div className="text-center py-4 text-gray-500 text-xs">Aucun actif trouvé.</div>}
                </div>
            </Card>

            <StockComparisonModal
                symbols={Array.from(selectedStockSymbols)}
                isOpen={showComparisonModal}
                onClose={() => setShowComparisonModal(false)}
                isPrivacyMode={isPrivacyMode}
            />

        </div>
    );
};
