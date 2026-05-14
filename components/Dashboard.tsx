
import React, { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Brush } from 'recharts';
import { Transaction, Asset, BudgetCategory, RealEstateGoal, BudgetConfig, ChildGoal, TravelGoal, LifeEvent, RetirementGoal, Tab, Debt } from '../types';
import { Card } from './ui/Card';
import { fetchPortfolioHistory, MarketDataPoint } from '../services/finance';
import { Sparkles, ArrowRight } from 'lucide-react';
import { ASSET_META } from '../services/assetMeta';

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

    const calculateFutureValue = (pv: number, pmtMonthly: number, years: number) => {
        const r = 0.05; // 5% real return assumption
        const pmt = pmtMonthly * 12;
        const compoundFactor = Math.pow(1 + r, years);
        return pv * compoundFactor + pmt * ((compoundFactor - 1) / r);
    };

    useEffect(() => {
        const load = async () => {
            const data = await fetchPortfolioHistory();
            setMarketData(data);
        };
        load();
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
                // (à moins que l'utilisateur ait un compte épargne à taux élevé, non traçable ici)
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
        creditList.sort((a, b) => a.value - b.value); // Sort negatives

        // 3. Chart History Building (Simplified for brevity, similar to before but grouped)
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

            {/* HEADER */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-2 premium-card p-6 rounded-2xl glow-primary relative overflow-hidden group shadow-2xl animate-premium-in">
                    <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all duration-700"></div>
                    <div className="text-[10px] uppercase font-bold text-gray-500 mb-1 tracking-widest opacity-80">{t('dashboard.global_net_worth')}</div>
                    <div className="text-4xl font-black text-white privacy-blur tracking-tight">
                        {(latestTotals?.Total || 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-white/5">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>
                            <div>
                                <div className="text-[10px] text-yellow-500 uppercase font-bold">{t('dashboard.passive_income_month')}</div>
                                <div className="text-sm font-bold text-yellow-400 privacy-blur">+{totalMonthlyPassive.toLocaleString('fr-CA', { maximumFractionDigits: 0 })}$</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="premium-card p-6 rounded-2xl flex flex-col justify-center animate-premium-in" style={{ animationDelay: '0.1s' }}>
                    <div className="text-[10px] uppercase font-bold text-gray-500 mb-1 tracking-widest opacity-80">{t('dashboard.global_variation')} ({timeRange})</div>
                    <div className={`text-4xl font-black ${performance.global >= 0 ? 'text-green-400' : 'text-red-400'} privacy-blur tracking-tight`}>
                        {performance.global > 0 ? '+' : ''}{performance.global.toFixed(2)}%
                    </div>
                    <div className={`text-sm mt-1 font-bold ${performance.diff >= 0 ? 'text-green-500/70' : 'text-red-500/70'} privacy-blur`}>
                        {(performance.diff > 0 ? '+' : '') + (performance.diff || 0).toLocaleString() + ' $'}
                    </div>
                </div>

                <div className="bg-gradient-to-br from-indigo-900/20 to-blue-900/20 p-6 rounded-2xl border border-indigo-500/20 relative overflow-hidden group flex flex-col justify-center">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="text-[10px] uppercase font-bold text-gray-500 mb-2 tracking-widest">{t('dashboard.future_predictor', 'Indicateur Futur (Potentiel)')}</div>
                    <div className="flex items-center gap-2 mb-2 z-10">
                        <span className="text-xs text-gray-400 font-bold">Dans</span>
                        <input
                            type="number"
                            className="w-16 bg-black/50 border border-white/20 rounded px-2 py-1 text-sm text-center font-bold text-white focus:outline-none focus:border-blue-500 transition-colors"
                            value={futureYears}
                            onChange={(e) => setFutureYears(Math.max(1, Math.min(50, Number(e.target.value))))}
                            min={1} max={50}
                        />
                        <span className="text-xs text-gray-400 font-bold">ans</span>
                    </div>
                    <div className="text-3xl font-black text-blue-400 tracking-tight privacy-blur z-10">
                        {calculateFutureValue(latestTotals?.Total || 0, calculatedMonthlySavings || 0, futureYears).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-[9px] text-gray-500 mt-2 font-bold z-10">
                        Basé sur {(calculatedMonthlySavings || 0).toLocaleString()}$/mo d'épargne avec 5% de rendement.
                    </div>
                </div>
            </div>

            {/* CHART */}
            <Card title={t('dashboard.detailed_evolution')} className="w-full min-h-[450px]"
                action={
                    <div className="flex flex-col md:flex-row items-end gap-2">
                        <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/10">
                            {(['1M', '3M', 'YTD', '1Y', 'ALL'] as TimeRange[]).map(r => (
                                <button key={r} onClick={() => setTimeRange(r)} className={`px-3 py-1 text-[10px] font-bold rounded transition-all ${timeRange === r ? 'bg-white text-black shadow' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>{r}</button>
                            ))}
                        </div>
                    </div>
                }
            >
                <div className="w-full h-[380px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={unifiedHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                {accountKeys.map((key, idx) => (
                                    <linearGradient key={key} id={`color${idx}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0.8} />
                                        <stop offset="95%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0.1} />
                                    </linearGradient>
                                ))}
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                            <XAxis dataKey="date" stroke="#555" tick={{ fontSize: 10 }} minTickGap={50} tickFormatter={(str) => new Date(str).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })} />
                            <YAxis stroke="#555" tick={{ fontSize: 10 }} width={45} domain={['auto', 'auto']} tickFormatter={(val) => isPrivacyMode ? '***' : `${(val / 1000).toFixed(0)}k`} />
                            <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px', fontSize: '12px' }} itemStyle={{ color: '#fff' }} formatter={(val: number, name: string) => [isPrivacyMode ? '*** $' : (val || 0).toLocaleString() + ' $', name]} labelFormatter={(label) => new Date(label).toLocaleDateString()} />
                            <Legend verticalAlign="top" iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                            {accountKeys.map((key, idx) => (
                                <Area key={key} type="monotone" dataKey={key} stackId="1" stroke={COLORS[idx % COLORS.length]} fill={`url(#color${idx})`} name={key} />
                            ))}
                            <Brush dataKey="date" height={20} stroke="#444" fill="#111" tickFormatter={() => ''} />
                        </AreaChart>
                    </ResponsiveContainer>
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
                                        <div className="text-[9px] text-gray-500 bg-black/50 px-1.5 rounded inline-block mt-0.5">{asset.accountType}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-mono font-bold text-gray-200 text-sm privacy-blur">{asset.value.toLocaleString('fr-CA', { maximumFractionDigits: 0 })}$</div>
                                    <div className="flex justify-end gap-2 text-[10px] mt-0.5 font-bold privacy-blur">
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
                                    <div className="flex justify-end gap-2 text-[10px] mt-0.5 font-bold privacy-blur">
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
                                        {acc.isManual && <div className="text-[9px] text-gray-500">Saisie Manuelle</div>}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-mono font-bold text-red-400 text-sm privacy-blur">{acc.value.toLocaleString('fr-CA', { maximumFractionDigits: 0 })}$</div>
                                    {!acc.isManual && (
                                        <div className="text-[10px] mt-0.5 font-bold privacy-blur text-gray-500">
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

                // Life Events
                lifeEvents.forEach(ev => {
                    milestones.push({ label: ev.name, date: ev.date, icon: ev.icon || '🎯', color: '#a855f7', tab: Tab.LIFE_EVENTS, year: new Date(ev.date).getFullYear() + new Date(ev.date).getMonth() / 12 });
                });
                // Real Estate purchases
                realEstateGoals.filter(g => g.isActive && g.purchaseDate).forEach(g => {
                    const yr = new Date(g.purchaseDate!).getFullYear() + new Date(g.purchaseDate!).getMonth() / 12;
                    if (yr > nowYear - 0.5) milestones.push({ label: g.name || 'Immobilier', date: g.purchaseDate!, icon: '🏡', color: '#ec4899', tab: Tab.REAL_ESTATE, year: yr });
                });
                // Children
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
                            <span className="text-[10px] text-gray-600">{milestones.length} événement{milestones.length > 1 ? 's' : ''}</span>
                        </div>

                        {/* Timeline bar */}
                        <div className="relative h-20 mx-4 select-none">
                            {/* Rail */}
                            <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10" />

                            {/* Today needle */}
                            <div className="absolute top-0 bottom-0 w-0.5 bg-blue-400/60" style={{ left: `${todayPct}%` }}>
                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-[9px] text-blue-400 font-bold whitespace-nowrap">Auj.</div>
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-400 ring-2 ring-blue-400/30" />
                            </div>

                            {/* Milestones */}
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
                                        {/* Connector line */}
                                        <div className={`absolute w-px ${above ? 'bottom-full h-6' : 'top-full h-6'}`} style={{ backgroundColor: m.color + '60' }} />

                                        {/* Dot */}
                                        <div
                                            className={`w-7 h-7 rounded-full flex items-center justify-center text-sm border-2 transition-transform group-hover:scale-125 z-10 ${isPast ? 'opacity-40' : ''}`}
                                            style={{ backgroundColor: m.color + '20', borderColor: m.color }}
                                        >
                                            {m.icon}
                                        </div>

                                        {/* Label */}
                                        <div className={`absolute text-[9px] font-bold whitespace-nowrap ${above ? 'bottom-[calc(100%+26px)]' : 'top-[calc(100%+26px)]'}`}
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
