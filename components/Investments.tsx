
import React, { useState, useMemo, useEffect } from 'react';
import { Asset, InvestmentAccount } from '../types';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as ReTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card } from './ui/Card';
import { fetchPortfolioHistory, MarketDataPoint } from '../services/finance';
import { StockChart } from './StockChart';
import { ASSET_META } from '../services/assetMeta';

interface InvestmentsProps {
    assets: Asset[];
    setAssets: (assets: Asset[]) => void;
    // Props kept for compatibility
    investmentAccounts: InvestmentAccount[];
    setInvestmentAccounts: any;
    investmentTransactions: any;
    setInvestmentTransactions: any;
    apiKey: string;
    transactions: any;
    budgetItems: any;
    config: any;
    projection: any;
    setProjection: any;
}

const COLORS_SECTOR: Record<string, string> = {
    "Technologie": "#3b82f6", // Blue
    "Industrie": "#f59e0b", // Orange
    "Finance": "#10b981", // Green
    "Mines/Or": "#eab308", // Yellow
    "Index": "#8b5cf6", // Purple
    "Autre": "#6b7280"
};

const COLORS_REGION: Record<string, string> = {
    "USA": "#3b82f6",
    "Europe": "#10b981",
    "Asie": "#ef4444",
    "Global": "#8b5cf6",
    "Ameriques": "#f59e0b"
};

type TimeRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';

export const Investments: React.FC<InvestmentsProps> = ({
    assets, setAssets
}) => {

    const [marketData, setMarketData] = useState<MarketDataPoint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [timeRange, setTimeRange] = useState<TimeRange>('1Y');

    const [targetModel, setTargetModel] = useState([
        { id: 'index', label: 'Index Mondial (CW8)', targetPct: 40, sectors: ['Index'], icon: '🌍', color: '#8b5cf6' },
        { id: 'tech', label: 'Technologie', targetPct: 30, sectors: ['Technologie'], icon: '💻', color: '#3b82f6' },
        { id: 'ind_fin', label: 'Industrie & Finance', targetPct: 15, sectors: ['Industrie', 'Finance'], icon: '🏭', color: '#f59e0b' },
        { id: 'gold', label: 'Or & Matières', targetPct: 10, sectors: ['Mines/Or'], icon: '🥇', color: '#eab308' },
        { id: 'cash', label: 'Liquidités', targetPct: 5, sectors: [], icon: '💵', color: '#10b981' },
    ]);
    const [isRebalanceEdit, setIsRebalanceEdit] = useState(false);

    // Dividend Projections State
    const [dripEnabled, setDripEnabled] = useState(false);
    const [divGrowthRate, setDivGrowthRate] = useState(5); // 5% annual dividend growth

    // --- INSTANT DATA LOAD ---
    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            const data = await fetchPortfolioHistory();
            setMarketData(data);

            if (data.length > 0) {
                const allKeys = Object.keys(data[0]);
                // Select Total and CW8 (Benchmark) by default
                const keysToSelect = allKeys.filter(k => k.includes('TOTAL'));
                setSelectedKeys(new Set(keysToSelect));
            }
            setIsLoading(false);
        };
        load();
    }, []);

    // --- ANALYSIS ENGINE ---
    const {
        currentAllocation,
        geoBreakdown,
        sectorBreakdown,
        dividendCalendar,
        totalAnnualDividends,
        availableSeriesWithTrend,
        healthScore,
        portfolioTrend,
        benchmarkTrend,
        indexWeight
    } = useMemo(() => {
        if (marketData.length === 0) return {
            currentAllocation: [], geoBreakdown: [], sectorBreakdown: [],
            dividendCalendar: [], totalAnnualDividends: 0,
            availableSeriesWithTrend: [],
            healthScore: 0, portfolioTrend: 0, benchmarkTrend: 0, indexWeight: 0
        };

        // 1. Get Latest Valid Row scanning backwards for non-zeros
        const latestValues: Record<string, number> = {};
        const prevValues: Record<string, number> = {};
        let totalPortfolio = 1;

        const allKeys = new Set<string>();
        marketData.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));

        const cleanKeys = Array.from(allKeys).filter(k =>
            k !== 'date' && k !== 'Date' && !k.startsWith('Taux') && k.trim() !== '' && k !== '1' && k.toLowerCase() !== 'colonne 1' && k !== 'Unnamed: 1'
        );

        cleanKeys.forEach(k => {
            let latestIdx = -1;
            for (let i = marketData.length - 1; i >= 0; i--) {
                const val = Number(marketData[i][k]);
                if (val > 0) {
                    latestValues[k] = val;
                    latestIdx = i;
                    break;
                }
            }
            if (latestIdx > 0) {
                prevValues[k] = Number(marketData[latestIdx - 1][k]) || 0;
            } else {
                prevValues[k] = 0;
            }

            if (k.includes('TOTAL')) {
                totalPortfolio = latestValues[k] || 1;
            }
        });

        // 2. Build Allocation Table (Excluding TOTAL for breakdown)
        const allocation = cleanKeys
            .filter(k => !k.includes('TOTAL'))
            .map(key => {
                const val = latestValues[key] || 0;
                if (val === 0) return null;

                const prevVal = prevValues[key] || 0;
                const meta = ASSET_META[key] || { name: key.replace('NASDAQ:', '').replace('NYSE:', '').replace('EPA:', ''), sector: 'Autre', region: 'Autre', yield: 0, freq: 1 };

                const estimatedAnnualDividend = val * (meta.yield / 100);

                return {
                    id: key,
                    value: val,
                    trend24h: prevVal > 0 ? ((val - prevVal) / prevVal) * 100 : 0,
                    weight: (val / totalPortfolio) * 100,
                    dividendYearly: estimatedAnnualDividend,
                    ...meta
                };
            })
            .filter(Boolean) as any[];

        allocation.sort((a, b) => b.value - a.value);

        // 3. Geographic Breakdown
        const geoMap: Record<string, number> = {};
        allocation.forEach(a => {
            geoMap[a.region] = (geoMap[a.region] || 0) + a.value;
        });
        const geoData = Object.entries(geoMap).map(([name, value]) => ({ name, value, percent: (value / totalPortfolio) * 100 })).sort((a, b) => b.value - a.value);

        // 4. Sector Breakdown
        const sectorMap: Record<string, number> = {};
        allocation.forEach(a => {
            sectorMap[a.sector] = (sectorMap[a.sector] || 0) + a.value;
        });
        const sectorData = Object.entries(sectorMap).map(([name, value]) => ({ name, value, percent: (value / totalPortfolio) * 100 })).sort((a, b) => b.value - a.value);

        // 5. Dividend Calendar
        const dividendList: any[] = [];
        let totalDivs = 0;
        const today = new Date();

        allocation.forEach(asset => {
            if (asset.dividendYearly > 0) {
                totalDivs += asset.dividendYearly;

                // Estimate next payout
                let nextMonth = asset.nextPayMonth || (today.getMonth() + 2); // Default to +2 months if unknown
                if (nextMonth > 12) nextMonth -= 12;

                const monthName = new Date(today.getFullYear(), nextMonth - 1, 1).toLocaleDateString('fr-CA', { month: 'long' });

                dividendList.push({
                    ...asset,
                    nextPayout: monthName,
                    amountPerPayout: asset.dividendYearly / asset.freq
                });
            }
        });

        // Sort by value roughly
        const sortedDividends = dividendList.sort((a, b) => b.dividendYearly - a.dividendYearly);

        // 6. Trends for Toggle List (Including TOTAL)
        const availableSeriesWithTrend = cleanKeys.map(k => {
            const current = latestValues[k] || 0;
            if (current === 0) return null;

            const prev = prevValues[k] || 0;
            const trend = prev > 0 ? ((current - prev) / prev) * 100 : 0;
            const isTotal = k.includes('TOTAL');
            const meta = ASSET_META[k] || { name: k.replace('NASDAQ:', '').replace('NYSE:', '') };

            return {
                id: k,
                name: isTotal ? 'TOTAL PORTEFEUILLE' : meta.name,
                trend,
                isTotal
            };
        }).filter(Boolean).sort((a: any, b: any) => {
            if (a.isTotal) return -1;
            if (b.isTotal) return 1;
            return b.trend - a.trend; // Sort by momentum
        });

        // 7. Health Score Calculation
        let healthScore = 0;
        let indexWeight = 0;
        let benchmarkTrend = 0;
        let portfolioTrend = 0;

        allocation.forEach(a => {
            if (a.sector === 'Index' || a.sector === 'Mines/Or') indexWeight += a.weight;
        });

        let safePts = (indexWeight / 40) * 60; // Max 60 pts if 40%+ in safe assets
        if (safePts > 60) safePts = 60;

        const totalSerie = availableSeriesWithTrend.find(s => s.isTotal);
        const cw8Serie = availableSeriesWithTrend.find(s => s.id.includes('CW8') || s.name.includes('MSCI'));

        portfolioTrend = totalSerie ? totalSerie.trend : 0;
        benchmarkTrend = cw8Serie ? cw8Serie.trend : 0;

        let trendPts = 20; // Base points
        if (portfolioTrend > benchmarkTrend && portfolioTrend > 0) trendPts += 20;
        else if (portfolioTrend > 0) trendPts += 10;
        else if (portfolioTrend < 0) trendPts -= 10;

        if (trendPts > 40) trendPts = 40;
        if (trendPts < 0) trendPts = 0;

        healthScore = Math.round(safePts + trendPts);

        return {
            currentAllocation: allocation,
            geoBreakdown: geoData,
            sectorBreakdown: sectorData,
            dividendCalendar: sortedDividends,
            totalAnnualDividends: totalDivs,
            availableSeriesWithTrend,
            healthScore,
            portfolioTrend,
            benchmarkTrend,
            indexWeight
        };
    }, [marketData]);

    // --- DIVIDEND PROJECTION CHART DATA ---
    const dividendProjectionData = useMemo(() => {
        if (dividendCalendar.length === 0) return [];

        let currentPortfolioValue = currentAllocation.reduce((s, a) => s + a.value, 0);
        let monthlyIncome = totalAnnualDividends / 12;

        const data = [];
        const today = new Date();

        for (let i = 0; i < 12; i++) {
            const date = new Date(today.getFullYear(), today.getMonth() + i, 1);
            const monthLabel = date.toLocaleDateString('fr-CA', { month: 'short', year: '2-digit' }).replace('.', '');

            // Base growth of dividends per month (divGrowthRate / 12)
            monthlyIncome = monthlyIncome * (1 + (divGrowthRate / 100 / 12));

            if (dripEnabled && currentPortfolioValue > 0) {
                // DRIP: Reinvest monthly income. Calculate average yield.
                const avgYield = totalAnnualDividends / currentPortfolioValue;
                const newAddedDividendsPerYear = monthlyIncome * avgYield;
                monthlyIncome += (newAddedDividendsPerYear / 12);
                currentPortfolioValue += monthlyIncome; // Reinvested
            }

            data.push({
                month: monthLabel,
                Revenu: monthlyIncome,
                Accumulé: monthlyIncome + (i > 0 ? data[i - 1].Accumulé : 0)
            });
        }
        return data;
    }, [dividendCalendar, totalAnnualDividends, currentAllocation, dripEnabled, divGrowthRate]);

    // --- FILTERED DATA FOR CHART ---
    const filteredMarketData = useMemo(() => {
        if (marketData.length === 0) return [];

        const now = new Date();
        let startDate = new Date(marketData[0].date);

        switch (timeRange) {
            case '1M': startDate = new Date(); startDate.setMonth(now.getMonth() - 1); break;
            case '3M': startDate = new Date(); startDate.setMonth(now.getMonth() - 3); break;
            case '6M': startDate = new Date(); startDate.setMonth(now.getMonth() - 6); break;
            case 'YTD': startDate = new Date(now.getFullYear(), 0, 1); break;
            case '1Y': startDate = new Date(); startDate.setFullYear(now.getFullYear() - 1); break;
        }

        return marketData.filter(d => new Date(d.date) >= startDate);
    }, [marketData, timeRange]);

    const handleAssetAccountChange = (symbolKey: string, newAccount: string) => {
        const assetIdx = assets.findIndex(a => symbolKey.includes(a.symbol));
        if (assetIdx >= 0) {
            const newAssets = [...assets];
            newAssets[assetIdx] = { ...newAssets[assetIdx], accountType: newAccount as any };
            setAssets(newAssets);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in pb-10 relative">

            {/* 0. HEALTH SCORE WIDGET */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-1 bg-gradient-to-br from-indigo-900/40 to-black border-indigo-500/30 flex flex-col justify-center items-center py-6">
                    <div className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">Score de Santé</div>
                    <div className="relative flex items-center justify-center w-32 h-32 mb-2">
                        <svg className="absolute w-full h-full transform -rotate-90">
                            <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/5" />
                            <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent"
                                strokeDasharray="351.8"
                                strokeDashoffset={351.8 - (351.8 * healthScore) / 100}
                                className={`transition-all duration-1000 ${healthScore >= 80 ? 'text-green-500' : healthScore >= 50 ? 'text-yellow-500' : 'text-red-500'}`}
                            />
                        </svg>
                        <div className="text-4xl font-black text-white">{healthScore}</div>
                    </div>
                    <div className="text-xs text-gray-400 text-center px-4">
                        Basé sur la diversification ({indexWeight.toFixed(0)}% Safe) et la tendance face au marché.
                    </div>
                </Card>

                <Card className="md:col-span-2 flex flex-col justify-center gap-6" title="Performance vs Marché (24h)">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/5 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center">
                            <div className="text-gray-400 text-xs font-bold mb-1">Votre Portefeuille</div>
                            <div className={`text-3xl font-black ${portfolioTrend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {portfolioTrend > 0 ? '+' : ''}{portfolioTrend.toFixed(2)}%
                            </div>
                        </div>
                        <div className="bg-white/5 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center">
                            <div className="text-gray-400 text-xs font-bold mb-1">Marché (CW8 / MSCI)</div>
                            <div className={`text-3xl font-black ${benchmarkTrend >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                                {benchmarkTrend > 0 ? '+' : ''}{benchmarkTrend.toFixed(2)}%
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            {/* 1. CHART SECTION */}
            <Card className="min-h-[550px]" title="Performance Comparée">
                <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                    <div className="flex gap-1 bg-black/40 p-1 rounded-lg">
                        {(['1M', '3M', '6M', 'YTD', '1Y', 'ALL'] as TimeRange[]).map(r => (
                            <button
                                key={r}
                                onClick={() => setTimeRange(r)}
                                className={`px-3 py-1 text-[10px] font-bold rounded transition-all ${timeRange === r ? 'bg-white text-black shadow' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                    <div className="text-xs text-gray-500">
                        {filteredMarketData.length} points
                    </div>
                </div>

                {/* SERIES TOGGLES */}
                <div className="mb-4 flex flex-wrap gap-2 max-h-[100px] overflow-y-auto custom-scrollbar p-1">
                    {availableSeriesWithTrend.map(asset => {
                        const isActive = selectedKeys.has(asset.id);
                        return (
                            <button
                                key={asset.id}
                                onClick={() => {
                                    const next = new Set(selectedKeys);
                                    if (next.has(asset.id)) next.delete(asset.id); else next.add(asset.id);
                                    setSelectedKeys(next);
                                }}
                                className={`text-[10px] px-2 py-1.5 rounded-lg border transition-all flex items-center gap-2 ${isActive
                                    ? (asset.isTotal ? 'bg-green-500/20 text-green-400 border-green-500/50 font-bold' : 'bg-blue-500/20 text-blue-300 border-blue-500/50')
                                    : 'bg-[#1a1a1a] text-gray-500 border-white/5 hover:border-white/10 hover:text-gray-300'
                                    }`}
                            >
                                <div className="flex items-center gap-1">
                                    <span className={`w-1.5 h-1.5 rounded-full ${isActive ? (asset.isTotal ? 'bg-green-400' : 'bg-blue-400') : 'bg-gray-600'}`}></span>
                                    {asset.name}
                                </div>
                                {Math.abs(asset.trend) > 0.5 && (
                                    <span className={`text-[9px] ${asset.trend > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {asset.trend > 0 ? '↗' : '↘'}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>

                <div style={{ width: '100%', height: '400px' }}>
                    {isLoading ? (
                        <div className="w-full h-full flex flex-col gap-4">
                            <div className="flex-1 skeleton-box rounded-xl"></div>
                            <div className="h-8 skeleton-box rounded-lg w-3/4 mx-auto"></div>
                        </div>
                    ) : filteredMarketData.length > 0 ? (
                        <StockChart
                            data={filteredMarketData}
                            visibleKeys={selectedKeys}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500 bg-white/5 rounded-xl">
                            Aucune donnée disponible pour cette période.
                        </div>
                    )}
                </div>
            </Card>

            {/* 2. ALLOCATION PANORAMIQUE (FULL WIDTH) */}
            <Card title="Analyse de l'Allocation">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 min-h-[300px]">

                    {/* REGIONS */}
                    <div className="bg-[#1a1a1a] rounded-xl p-4 border border-white/5 flex flex-col">
                        <h4 className="text-gray-400 text-xs font-bold uppercase mb-4 text-center">Répartition Géographique</h4>
                        <div className="flex-1 flex flex-col lg:flex-row items-center gap-4">
                            <div className="flex-1 w-full h-[200px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={geoBreakdown}
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {geoBreakdown.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS_REGION[entry.name] || '#444'} />
                                            ))}
                                        </Pie>
                                        <ReTooltip contentStyle={{ backgroundColor: '#fff', color: '#000', borderRadius: '8px', border: 'none' }} itemStyle={{ color: '#000' }} formatter={(val: number) => val.toLocaleString() + '$'} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex-1 w-full space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                                {geoBreakdown.map(item => (
                                    <div key={item.name} className="flex justify-between items-center text-xs p-2 bg-white/5 rounded">
                                        <div className="flex items-center gap-2">
                                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS_REGION[item.name] || '#444' }}></span>
                                            <span className="text-gray-200 font-medium">{item.name}</span>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-white font-bold">{item.value.toLocaleString()} $</div>
                                            <div className="text-[10px] text-gray-500">{item.percent.toFixed(1)}%</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* SECTORS */}
                    <div className="bg-[#1a1a1a] rounded-xl p-4 border border-white/5 flex flex-col">
                        <h4 className="text-gray-400 text-xs font-bold uppercase mb-4 text-center">Répartition Sectorielle</h4>
                        <div className="flex-1 flex flex-col lg:flex-row items-center gap-4">
                            <div className="flex-1 w-full h-[200px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={sectorBreakdown}
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {sectorBreakdown.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS_SECTOR[entry.name] || '#444'} />
                                            ))}
                                        </Pie>
                                        <ReTooltip contentStyle={{ backgroundColor: '#fff', color: '#000', borderRadius: '8px', border: 'none' }} itemStyle={{ color: '#000' }} formatter={(val: number) => val.toLocaleString() + '$'} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex-1 w-full space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                                {sectorBreakdown.map(item => (
                                    <div key={item.name} className="flex justify-between items-center text-xs p-2 bg-white/5 rounded">
                                        <div className="flex items-center gap-2">
                                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS_SECTOR[item.name] || '#444' }}></span>
                                            <span className="text-gray-200 font-medium">{item.name}</span>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-white font-bold">{item.value.toLocaleString()} $</div>
                                            <div className="text-[10px] text-gray-500">{item.percent.toFixed(1)}%</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>
            </Card>

            {/* 3. DIVIDEND CALENDAR (NEW) */}
            <Card title="Calendrier des Revenus Passifs" className="animate-premium-in" style={{ animationDelay: '0.2s' }}>
                <div className="flex justify-between items-center mb-6 bg-gradient-to-r from-emerald-900/40 to-black/40 p-5 rounded-2xl border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-3xl shadow-inner border border-emerald-500/10">💰</div>
                        <div>
                            <div className="text-[10px] uppercase font-bold text-emerald-500/70 tracking-widest mb-1">Rente Annuelle Estimée</div>
                            <div className="text-3xl font-black text-white privacy-blur tracking-tight">{totalAnnualDividends.toLocaleString()} CAD</div>
                        </div>
                    </div>
                    <div className="text-right hidden sm:block">
                        <div className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-1">Moyenne mensuelle</div>
                        <div className="text-xl font-bold text-gray-300">{(totalAnnualDividends / 12).toLocaleString()} $ / mois</div>
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
                            <div key={i} className="premium-card p-4 rounded-xl flex flex-col justify-between hover:border-emerald-500/30 transition-all group">
                                <div className="flex justify-between items-start mb-2 relative z-10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-xs font-bold text-white shadow-inner group-hover:bg-emerald-500/10 transition-colors">
                                            {item.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="font-bold text-white text-sm tracking-tight">{item.name}</div>
                                            <div className="text-[10px] text-gray-500">{item.id.split(':')[0]}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-emerald-400 font-bold text-sm">+{item.amountPerPayout.toFixed(0)}$</div>
                                        <div className="text-[9px] text-gray-500 font-medium">{item.freq === 4 ? 'Trimestriel' : 'Annuel'}</div>
                                    </div>
                                </div>

                                <div className="mt-3 pt-2 border-t border-white/5 flex justify-between items-center relative z-10">
                                    <span className="text-[10px] text-gray-500 font-medium">Prochain paiement</span>
                                    <span className="text-[10px] font-bold text-white bg-emerald-500/20 px-2.5 py-1 rounded-lg border border-emerald-500/10 text-emerald-300">
                                        {item.nextPayout}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                    {!isLoading && dividendCalendar.length === 0 && (
                        <div className="col-span-full text-center text-gray-500 py-10 italic">
                            Aucune action à dividende détectée.
                        </div>
                    )}
                </div>

                {/* ADVANCED PROJECTION SECTION */}
                {dividendCalendar.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-emerald-500/10">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                            <div>
                                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                    <span className="text-emerald-400">📈</span> Projection sur 12 mois
                                </h4>
                                <p className="text-[10px] text-gray-500 mt-1">Estimation des revenus passifs futurs</p>
                            </div>

                            <div className="flex items-center gap-6 bg-black/40 p-3 rounded-xl border border-white/5 w-full sm:w-auto">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <div className={`w-8 h-4 rounded-full transition-colors relative ${dripEnabled ? 'bg-emerald-500' : 'bg-gray-700'}`}>
                                        <div className={`w-3 h-3 bg-white rounded-full absolute top-[2px] transition-all ${dripEnabled ? 'left-4 translate-x-0.5' : 'left-0.5'}`}></div>
                                    </div>
                                    <input type="checkbox" className="hidden" checked={dripEnabled} onChange={(e) => setDripEnabled(e.target.checked)} />
                                    <span className="text-[10px] font-bold text-gray-300 group-hover:text-white transition-colors">DRIP (Réinvestir)</span>
                                </label>

                                <div className="w-px h-6 bg-white/10 hidden sm:block"></div>

                                <div className="flex items-center gap-2 flex-1 sm:flex-none">
                                    <span className="text-[10px] text-gray-400 whitespace-nowrap">Croissance des div. :</span>
                                    <input
                                        type="number"
                                        min="0"
                                        max="50"
                                        value={divGrowthRate}
                                        onChange={(e) => setDivGrowthRate(Number(e.target.value))}
                                        className="bg-black/50 border border-white/10 rounded px-2 py-0.5 text-xs text-white font-bold w-14 outline-none focus:border-emerald-500 transition-colors text-center"
                                    />
                                    <span className="text-[10px] text-gray-400">% / an</span>
                                </div>
                            </div>
                        </div>

                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dividendProjectionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                    <XAxis dataKey="month" stroke="#ffffff50" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                                    <YAxis stroke="#ffffff50" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}$`} />
                                    <ReTooltip
                                        cursor={{ fill: '#ffffff05' }}
                                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
                                        itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                                        labelStyle={{ color: '#9ca3af', fontSize: '10px', marginBottom: '4px' }}
                                        formatter={(val: number) => [(val || 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' }), 'Revenu Mensuel']}
                                    />
                                    <Bar dataKey="Revenu" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                        {dividendProjectionData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={index === 11 ? '#059669' : '#10b98180'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </Card>

            {/* 4. VISUAL PORTFOLIO REBALANCING (V16) */}
            {currentAllocation.length > 0 && (() => {
                const totalPortfolio = currentAllocation.reduce((s, a) => s + a.value, 0);

                const rebalancingActions = targetModel.map(target => {
                    const currentVal = currentAllocation
                        .filter(a => target.sectors.some(s => a.sector === s))
                        .reduce((s, a) => s + a.value, 0);
                    const currentPct = totalPortfolio > 0 ? (currentVal / totalPortfolio) * 100 : 0;
                    const diffPct = currentPct - target.targetPct;
                    const diffAmount = (diffPct / 100) * totalPortfolio;

                    let action: 'SELL' | 'BUY' | 'OK' = 'OK';
                    if (diffPct > 3) action = 'SELL';
                    else if (diffPct < -3) action = 'BUY';

                    return { ...target, currentPct, diffPct, diffAmount, action };
                });

                const hasActions = rebalancingActions.some(a => a.action !== 'OK');
                const sumTargets = targetModel.reduce((sum, t) => sum + t.targetPct, 0);

                return (
                    <Card title="⚖️ Rééquilibrage du Portefeuille" className="mt-8">
                        <div className="mb-6 bg-gradient-to-r from-violet-900/20 to-black p-4 rounded-xl border border-violet-500/20 flex items-center justify-between">
                            <div>
                                <div className="text-xs text-violet-400 uppercase font-bold mb-1">Diagnostic Automatique</div>
                                <div className="text-white text-sm font-bold">
                                    {hasActions ? '⚠️ Des actions de rééquilibrage sont recommandées' : '✅ Portefeuille bien équilibré'}
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setIsRebalanceEdit(!isRebalanceEdit)}
                                    className="px-3 py-1.5 bg-violet-600/20 text-violet-300 border border-violet-500/30 rounded-lg text-xs font-bold hover:bg-violet-600 hover:text-white transition-colors"
                                >
                                    {isRebalanceEdit ? '💾 Terminer' : '⚙️ Modifier Cibles'}
                                </button>
                                <div className="text-3xl font-black text-white privacy-blur hidden sm:block">
                                    {totalPortfolio.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}
                                </div>
                            </div>
                        </div>

                        {isRebalanceEdit && sumTargets !== 100 && (
                            <div className="text-red-400 text-xs font-bold mb-4 bg-red-900/20 p-3 rounded-lg border border-red-500/20 animate-pulse flex items-center gap-2">
                                <span>⚠️</span> Le total des cibles doit être de 100% (Actuel : {sumTargets}%)
                            </div>
                        )}

                        <div className="space-y-3 mb-6">
                            {rebalancingActions.map((item, i) => (
                                <div key={i} className={`p-4 rounded-xl border transition-all ${!isRebalanceEdit && item.action === 'SELL' ? 'border-red-500/30 bg-red-900/10' :
                                    !isRebalanceEdit && item.action === 'BUY' ? 'border-green-500/30 bg-green-900/10' :
                                        'border-white/5 bg-white/5'
                                    }`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xl">{item.icon}</span>
                                            <div>
                                                <div className="text-white font-bold text-sm">{item.label}</div>
                                                <div className="text-[10px] text-gray-500 flex items-center gap-2 mt-1">
                                                    <span>Actuel: <span className="text-gray-300 font-bold">{item.currentPct.toFixed(1)}%</span></span>
                                                    <span className="opacity-50">|</span>
                                                    {isRebalanceEdit ? (
                                                        <div className="flex items-center gap-1">
                                                            <span>Cible:</span>
                                                            <div className="relative">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max="100"
                                                                    className="w-16 bg-black/50 border border-violet-500/30 rounded px-2 py-0.5 text-white font-bold outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all text-right"
                                                                    value={item.targetPct}
                                                                    onChange={(e) => {
                                                                        const newModel = [...targetModel];
                                                                        newModel[i].targetPct = Number(e.target.value);
                                                                        setTargetModel(newModel);
                                                                    }}
                                                                />
                                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">%</span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span>Cible: <span className="text-white font-bold">{item.targetPct}%</span></span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            {!isRebalanceEdit && item.action === 'SELL' && (
                                                <div className="text-red-400 font-bold text-sm">
                                                    → Vendre {Math.round(Math.abs(item.diffAmount)).toLocaleString()}$
                                                </div>
                                            )}
                                            {!isRebalanceEdit && item.action === 'BUY' && (
                                                <div className="text-green-400 font-bold text-sm">
                                                    → Acheter {Math.round(Math.abs(item.diffAmount)).toLocaleString()}$
                                                </div>
                                            )}
                                            {!isRebalanceEdit && item.action === 'OK' && (
                                                <div className="text-gray-400 text-xs font-bold">✓ CIBLE ATTEINTE</div>
                                            )}
                                        </div>
                                    </div>
                                    {/* Progress Bar */}
                                    <div className="relative w-full h-2 bg-black/50 rounded-full overflow-hidden mt-3 shadow-inner">
                                        <div
                                            className="absolute left-0 top-0 h-full rounded-full transition-all duration-700 shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                                            style={{
                                                width: `${Math.min(100, item.currentPct)}%`,
                                                backgroundColor: item.color
                                            }}
                                        />
                                        {/* Target line indicator */}
                                        <div
                                            className="absolute top-0 h-full w-0.5 bg-white opacity-80 shadow-[0_0_5px_#fff]"
                                            style={{ left: `${item.targetPct}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Priority Suggestions */}
                        {hasActions && (
                            <div className="bg-black/40 rounded-xl p-4 border border-white/10">
                                <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">📋 Stratégie de Rééquilibrage Recommandée</h4>
                                <div className="space-y-2">
                                    {rebalancingActions.filter(a => a.action === 'SELL').map((a, i) => (
                                        <div key={i} className="text-xs text-red-300 flex items-start gap-2">
                                            <span>🔴</span>
                                            <span><b>Vendre</b> {Math.round(Math.abs(a.diffAmount)).toLocaleString()}$ de <b>{a.label}</b> (surplus {a.diffPct.toFixed(1)}%) — Utilisez votre compte Non-Enregistré en priorité pour optimiser la fiscalité.</span>
                                        </div>
                                    ))}
                                    {rebalancingActions.filter(a => a.action === 'BUY').map((a, i) => (
                                        <div key={i} className="text-xs text-green-300 flex items-start gap-2">
                                            <span>🟢</span>
                                            <span><b>Acheter</b> {Math.round(Math.abs(a.diffAmount)).toLocaleString()}$ de <b>{a.label}</b> (déficit {Math.abs(a.diffPct).toFixed(1)}%) — Priorisez votre CELI si vous avez de l'espace disponible.</span>
                                        </div>
                                    ))}
                                    <div className="text-xs text-gray-500 mt-3 pt-3 border-t border-white/5 italic">
                                        💡 Astuce fiscale : Rééquilibrer via les nouvelles contributions évite de déclencher des gains en capital dans votre compte Non-Enregistré.
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>
                );
            })()}

            {/* 5. STOCK CARDS GRID */}
            <h3 className="text-xl font-bold text-white mt-8 mb-4">Portefeuille Détaillé</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {currentAllocation.map((asset) => {
                    // Try to find matching asset in props to get saved account type
                    const savedAsset = assets.find(a => asset.id.includes(a.symbol));
                    const accountType = savedAsset?.accountType || 'NON-ENREG';

                    return (
                        <div key={asset.id} className="premium-card border border-white/5 hover:border-white/20 p-5 rounded-2xl transition-all group relative overflow-hidden flex flex-col justify-between animate-premium-in shadow-xl">
                            {/* Background Gradient based on sector */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-white/10 to-transparent -mr-8 -mt-8 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

                            <div>
                                <div className="flex justify-between items-start mb-4 relative z-10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-lg border border-white/10" style={{ backgroundColor: COLORS_SECTOR[asset.sector] || '#333' }}>
                                            {asset.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="font-bold text-white text-sm leading-tight tracking-tight">{asset.name}</div>
                                            <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{asset.region}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xl font-black text-white tracking-tight">{asset.weight.toFixed(1)}%</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-[10px] mb-4 relative z-10">
                                    <div className="bg-white/[0.03] p-2.5 rounded-xl border border-white/5 backdrop-blur-sm">
                                        <div className="text-gray-500 mb-1 font-bold">Valeur</div>
                                        <div className="text-white font-mono font-bold text-xs">{asset.value.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}</div>
                                    </div>
                                    <div className="bg-white/[0.03] p-2.5 rounded-xl border border-white/5 backdrop-blur-sm">
                                        <div className="text-gray-500 mb-1 font-bold">Variation 24h</div>
                                        <div className={`font-bold text-xs ${asset.trend24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {asset.trend24h > 0 ? '+' : ''}{asset.trend24h.toFixed(1)}%
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-3 border-t border-white/5 relative z-10 mt-auto">
                                <div className="text-[10px] text-gray-400 flex items-center gap-2">
                                    <span className="font-medium">Yield</span>
                                    <span className={asset.yield > 0 ? "text-emerald-400 font-bold" : "text-gray-500"}>{asset.yield}%</span>
                                </div>
                                <select
                                    value={accountType}
                                    onChange={(e) => handleAssetAccountChange(asset.id, e.target.value)}
                                    className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-[10px] text-gray-300 font-bold outline-none hover:bg-white/10 cursor-pointer transition-colors"
                                >
                                    <option value="CELI">CELI</option>
                                    <option value="REER">REER</option>
                                    <option value="NON-ENREG">Non-Enreg</option>
                                    <option value="CRYPTO">Crypto</option>
                                </select>
                            </div>
                        </div>
                    );
                })}
            </div>

        </div>
    );
};
