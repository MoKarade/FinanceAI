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
import { fetchPortfolioHistory, MarketDataPoint } from '../services/finance';
import { Sparkles, ArrowRight } from 'lucide-react';
import { ASSET_META } from '../services/assetMeta';
import { useFinanceStore } from '../store/useFinanceStore';
import { EraContextInsights } from './dashboard/EraContextInsights';
import { Tab as TabEnum } from '../types';
import { formatCAD, formatNumber, formatPercent, formatSigned } from '../utils/format';

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
    transactions, assets, initialBalances, realEstateGoals, childGoals = [], debts = [],
    lifeEvents = [], onNavigate, isPrivacyMode = false, calculatedMonthlySavings = 0
}) => {
    const { t } = useTranslation();
    const [marketData, setMarketData] = useState<MarketDataPoint[]>([]);
    const [timeRange, setTimeRange] = useState<TimeRange>('1M');
    const [customStart, setCustomStart] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
    const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);
    const [futureYears, setFutureYears] = useState<number>(5);

    // Wiring 2026-05: lit la vraie projection FutureProjection si dispo, sinon
    // fallback sur formule simple. Garanti d'être sync avec l'onglet projection.
    const lastProjection = useFinanceStore(s => s.lastProjection);
    const navigateWithFocus = useFinanceStore(s => s.navigateWithFocus);

    const calculateFutureValue = (pv: number, pmtMonthly: number, years: number) => {
        // Si on a une projection vivante, on cherche le NW au mois cible.
        if (lastProjection?.chartData && lastProjection.chartData.length > 0) {
            const targetMonth = years * 12;
            const point = lastProjection.chartData.find(p => p.monthIndex === targetMonth)
                || lastProjection.chartData[Math.min(targetMonth, lastProjection.chartData.length - 1)];
            if (point && typeof point.NetWorth === 'number' && point.NetWorth > 0) {
                return point.NetWorth;
            }
        }
        // Fallback: formule simple 5% (avant que l'utilisateur ouvre l'onglet projection).
        const r = 0.05;
        const pmt = pmtMonthly * 12;
        const compoundFactor = Math.pow(1 + r, years);
        return pv * compoundFactor + pmt * ((compoundFactor - 1) / r);
    };

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const data = await fetchPortfolioHistory();
            if (!cancelled) setMarketData(data);
        };
        load();
        return () => { cancelled = true; };
    }, []);

    // --- ENGINE: DATA UNIFICATION & 30-DAY LOOKBACK ---
    const { unifiedHistory, latestTotals, accountKeys, segmentedData, totalMonthlyPassive } = useMemo(() => {
        if (marketData.length === 0) return { unifiedHistory: [], latestTotals: { Total: 0 }, accountKeys: [], segmentedData: { assets: [], cash: [], credit: [] }, totalMonthlyPassive: 0 };

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
        const cashList: any[] = [];
        const creditList: any[] = [];

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
            const point: any = { date: rowDateStr };
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
        const combinedKeys = Array.from(cashAccountsList).concat(['Immobilier', 'CELI', 'REER', 'NonReg', 'Crypto', 'Dettes']).filter(k => lastPoint[k] !== 0);

        return {
            unifiedHistory: filteredHist,
            latestTotals: lastPoint,
            accountKeys: combinedKeys,
            segmentedData: { assets: indAssets, cash: cashList, credit: creditList },
            totalMonthlyPassive: passiveIncome
        };
    }, [marketData, assets, timeRange, customStart, customEnd, transactions, initialBalances, debts]);

    const performance = useMemo(() => {
        if (unifiedHistory.length < 2) return { global: 0, diff: 0 };
        const start = unifiedHistory[0].Total || 0;
        const end = unifiedHistory[unifiedHistory.length - 1].Total || 0;
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

            {/* Hero KPI strip — 4 chiffres clés */}
            <StatGrid cols={4}>
                <KPIStat
                    label={t('dashboard.global_net_worth')}
                    icon="💰"
                    value={formatCAD(latestTotals?.Total || 0)}
                    sublabel={t('dashboard.consolidated', 'Tous comptes')}
                    privacy
                    variant="primary"
                />
                <KPIStat
                    label={`${t('dashboard.global_variation')} (${timeRange})`}
                    icon="📈"
                    value={formatPercent(performance.global)}
                    trend={performance.diff}
                    trendLabel="$"
                    sublabel={formatSigned(performance.diff || 0, { withCurrency: true })}
                    privacy
                    variant={performance.global >= 0 ? 'success' : 'danger'}
                />
                <KPIStat
                    label={t('dashboard.passive_income_month')}
                    icon="✨"
                    value={`+${formatNumber(totalMonthlyPassive)} $`}
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
                        {formatCAD(calculateFutureValue(latestTotals?.Total || 0, calculatedMonthlySavings || 0, futureYears))}
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

            {/* Phase 4 B6/B7 — Insights pré-calculés par Era Context (silencieux si pas de token) */}
            <EraContextInsights />

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
                <div className="w-full h-[380px]">
                    <Suspense fallback={<Skeleton variant="chart" />}>
                        <DashboardEvolutionChart
                            unifiedHistory={unifiedHistory}
                            accountKeys={accountKeys}
                            colors={COLORS}
                            isPrivacyMode={isPrivacyMode}
                        />
                    </Suspense>
                </div>
            </Card>

            {/* 3 SEGMENTED LISTS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Actifs Boursiers */}
                <Card title={t('dashboard.individual_assets')} className="lg:col-span-1">
                    <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                        {segmentedData.assets.map(asset => (
                            <div key={asset.symbol} className="bg-white/5 p-3 rounded-xl border border-white/5 flex justify-between items-center hover:bg-white/10 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded bg-[#1e2330] flex items-center justify-center text-xs font-bold text-gray-300">{asset.symbol.substring(0, 2)}</div>
                                    <div>
                                        <div className="font-bold text-white text-sm">{asset.symbol}</div>
                                        <div className="text-tiny text-gray-500 bg-black/50 px-1.5 rounded inline-block mt-0.5">{asset.accountType}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-mono font-bold text-gray-200 text-sm privacy-blur">{asset.value.toLocaleString('fr-CA', { maximumFractionDigits: 0 })}$</div>
                                    <div className="flex justify-end gap-2 text-tiny mt-0.5 font-bold privacy-blur">
                                        <span className={asset.diffCAD >= 0 ? 'text-green-500' : 'text-red-500'}>
                                            {asset.diffCAD >= 0 ? '+' : ''}{asset.diffCAD.toLocaleString('fr-CA', { maximumFractionDigits: 0 })}$
                                        </span>
                                        <span className="text-yellow-500" title="Revenu Mensuel Estimé (Dividendes)">
                                            +{asset.revMensuel.toFixed(0)}$
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {segmentedData.assets.length === 0 && <div className="text-center py-4 text-gray-500 text-xs">Aucun actif trouvé.</div>}
                    </div>
                </Card>

                {/* Cash & Epargne */}
                <Card title={t('dashboard.cash_savings')} className="lg:col-span-1">
                    <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                        {segmentedData.cash.map(acc => (
                            <div key={acc.name} className="bg-white/5 p-3 rounded-xl border border-white/5 flex justify-between items-center hover:bg-white/10 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded bg-blue-900/30 text-blue-400 flex items-center justify-center text-xs font-bold">🏦</div>
                                    <div className="font-bold text-white text-sm truncate max-w-[120px]">{acc.name}</div>
                                </div>
                                <div className="text-right">
                                    <div className="font-mono font-bold text-blue-100 text-sm privacy-blur">{acc.value.toLocaleString('fr-CA', { maximumFractionDigits: 0 })}$</div>
                                    <div className="flex justify-end gap-2 text-tiny mt-0.5 font-bold privacy-blur">
                                        <span className={acc.diffCAD >= 0 ? 'text-green-500' : 'text-red-500'}>
                                            {acc.diffCAD >= 0 ? '+' : ''}{acc.diffCAD.toLocaleString('fr-CA', { maximumFractionDigits: 0 })}$ (30j)
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {segmentedData.cash.length === 0 && <div className="text-center py-4 text-gray-500 text-xs">Aucun compte créditeur.</div>}
                    </div>
                </Card>

                {/* Dettes & Credit */}
                <Card title={t('dashboard.credit_debts')} className="lg:col-span-1 border-l-2 border-red-500/50">
                    <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                        {segmentedData.credit.map(acc => (
                            <div key={acc.name} className="bg-red-900/10 p-3 rounded-xl border border-red-500/20 flex justify-between items-center hover:bg-red-900/20 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded bg-red-900/50 text-red-400 flex items-center justify-center text-xs font-bold">💳</div>
                                    <div>
                                        <div className="font-bold text-white text-sm truncate max-w-[120px]">{acc.name}</div>
                                        {acc.isManual && <div className="text-tiny text-gray-500">Saisie Manuelle</div>}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-mono font-bold text-red-400 text-sm privacy-blur">{acc.value.toLocaleString('fr-CA', { maximumFractionDigits: 0 })}$</div>
                                    {!acc.isManual && (
                                        <div className="text-tiny mt-0.5 font-bold privacy-blur text-gray-500">
                                            Var: {acc.diffCAD > 0 ? '+' : ''}{acc.diffCAD.toLocaleString('fr-CA', { maximumFractionDigits: 0 })}$
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {segmentedData.credit.length === 0 && <div className="text-center py-4 text-green-500 text-xs">Aucune dette ! Bravo.</div>}
                    </div>
                </Card>

            </div>

            {/* ===== TIMELINE DES JALONS DE VIE ===== */}
            {(() => {
                const now = new Date();
                const nowYear = now.getFullYear() + now.getMonth() / 12;

                type Milestone = { label: string; date: string; icon: string; color: string; tab: Tab; year: number };
                const milestones: Milestone[] = [];

                lifeEvents.forEach(ev => {
                    milestones.push({ label: ev.name, date: ev.date, icon: ev.icon || '🎯', color: '#a855f7', tab: Tab.LIFE_EVENTS, year: new Date(ev.date).getFullYear() + new Date(ev.date).getMonth() / 12 });
                });
                realEstateGoals.filter(g => g.isActive && g.purchaseDate).forEach(g => {
                    const yr = new Date(g.purchaseDate!).getFullYear() + new Date(g.purchaseDate!).getMonth() / 12;
                    if (yr > nowYear - 0.5) milestones.push({ label: g.name || 'Immobilier', date: g.purchaseDate!, icon: '🏡', color: '#ec4899', tab: Tab.REAL_ESTATE, year: yr });
                });
                childGoals.forEach(c => {
                    const yr = new Date(c.birthDate || '').getFullYear() + new Date(c.birthDate || '').getMonth() / 12;
                    if (c.birthDate) milestones.push({ label: c.name || 'Enfant', date: c.birthDate, icon: '👶', color: '#22c55e', tab: Tab.CHILD, year: yr });
                });

                if (milestones.length === 0) return null;

                milestones.sort((a, b) => a.year - b.year);
                const minYear = Math.min(nowYear, milestones[0]?.year ?? nowYear) - 0.5;
                const maxYear = Math.max(nowYear, milestones[milestones.length - 1]?.year ?? nowYear) + 1;
                const totalSpan = maxYear - minYear;
                const getPct = (yr: number) => Math.max(0, Math.min(100, ((yr - minYear) / totalSpan) * 100));
                const todayPct = getPct(nowYear);

                return (
                    <div className="rounded-2xl bg-gradient-to-r from-[#0d0f14]/90 to-[#111520]/90 border border-white/5 p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">🗓️ Timeline des Jalons de Vie</h3>
                            <span className="text-tiny text-gray-600">{milestones.length} événement{milestones.length > 1 ? 's' : ''}</span>
                        </div>

                        <div className="relative h-20 mx-4 select-none">
                            <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10" />

                            <div className="absolute top-0 bottom-0 w-0.5 bg-blue-400/60" style={{ left: `${todayPct}%` }}>
                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-tiny text-blue-400 font-bold whitespace-nowrap">Auj.</div>
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-400 ring-2 ring-blue-400/30" />
                            </div>

                            {milestones.map((m, i) => {
                                const pct = getPct(m.year);
                                const isPast = m.year < nowYear;
                                const above = i % 2 === 0;
                                return (
                                    <div
                                        key={i}
                                        className="absolute flex flex-col items-center cursor-pointer group"
                                        style={{ left: `${pct}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
                                        onClick={() => onNavigate && onNavigate(m.tab)}
                                    >
                                        <div className={`absolute w-px ${above ? 'bottom-full h-6' : 'top-full h-6'}`} style={{ backgroundColor: m.color + '60' }} />

                                        <div
                                            className={`w-7 h-7 rounded-full flex items-center justify-center text-sm border-2 transition-transform group-hover:scale-125 z-10 ${isPast ? 'opacity-40' : ''}`}
                                            style={{ backgroundColor: m.color + '20', borderColor: m.color }}
                                        >
                                            {m.icon}
                                        </div>

                                        <div className={`absolute text-tiny font-bold whitespace-nowrap ${above ? 'bottom-[calc(100%+26px)]' : 'top-[calc(100%+26px)]'}`}
                                            style={{ color: m.color }}>
                                            {m.label}
                                            <br />
                                            <span className="text-gray-500 font-normal">{Math.floor(m.year)}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })()}

        </div>
    );
};
