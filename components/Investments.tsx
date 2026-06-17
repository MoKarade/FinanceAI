import React, { useState, useMemo, useEffect } from 'react';
import {
    Asset,
    AppState,
    InvestmentAccount,
    InvestmentTransaction,
    Transaction,
    BudgetCategory,
    BudgetConfig,
    RegisteredAccountType,
    Tab as TabEnum,
} from '../types';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as ReTooltip } from 'recharts';
import { Card } from './ui/Card';
import { PageHeader } from './ui/PageHeader';
import { ProjectionStaleBanner } from './ui/ProjectionStaleBanner';
import { Icon, type IconName } from './ui/Icon';
import { Pill } from './ui/Pill';
import { Badge } from './ui/Badge';
import { CollapsibleSection } from './ui/CollapsibleSection';
import { Skeleton } from './ui/Skeleton';
import { MarketDataPoint } from '../services/finance';
import { usePortfolioHistory } from '../hooks/usePortfolioHistory';
import { StockChart } from './StockChart';
import { ASSET_META } from '../services/assetMeta';
import { DividendPanel } from './investments/DividendPanel';
import { formatCAD } from '../utils/format';
import { ProjectionRequired } from './ui/ProjectionRequired';
import { logError } from '../services/errorLogger';
import { getRebalanceJustifications, type RebalanceActionInput } from '../services/claude';
import { AddStockForm } from './investments/AddStockForm';
import { showToast } from './ui/Toast';
import { ImportBrokerPositions } from './investments/ImportBrokerPositions';
import { computePurchaseStats } from '../utils/assetPurchases';
import { useFinanceStore } from '../store/useFinanceStore';
import { NetWorthByOwnerCard } from './investments/NetWorthByOwnerCard';
import { PrivateAmount } from './ui/PrivateAmount';

interface InvestmentsProps {
    assets: Asset[];
    setAssets: (assets: Asset[]) => void;
    investmentAccounts: InvestmentAccount[];
    setInvestmentAccounts: (accounts: InvestmentAccount[]) => void;
    investmentTransactions: InvestmentTransaction[];
    setInvestmentTransactions: (transactions: InvestmentTransaction[]) => void;
    apiKey: string;
    transactions: Transaction[];
    budgetItems: BudgetCategory[];
    config: BudgetConfig;
    projection: AppState['projection'];
    setProjection: (projection: AppState['projection']) => void;
}

const COLORS_SECTOR: Record<string, string> = {
    "Technologie": "#5b82bf", // Blue
    "Industrie": "#c2974f", // Orange
    "Finance": "#4f9d86", // Green
    "Mines/Or": "#b8a45e", // Yellow
    "Index": "#8a7cc0", // Purple
    "Autre": "#6b7280"
};

const COLORS_REGION: Record<string, string> = {
    "USA": "#5b82bf",
    "Europe": "#4f9d86",
    "Asie": "#ef4444",
    "Global": "#8a7cc0",
    "Ameriques": "#c2974f"
};

type TimeRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';

interface AllocationItem {
    id: string;
    value: number;
    trend24h: number;
    weight: number;
    dividendYearly: number;
    name: string;
    sector: string;
    region: string;
    yield: number;
    freq: number;
    nextPayMonth?: number;
    symbol?: string;
}

interface SeriesWithTrend {
    id: string;
    name: string;
    trend: number;
    isTotal: boolean;
}

interface DividendItem extends AllocationItem {
    nextPayout: string;
    amountPerPayout: number;
}

const DEFAULT_TARGET_MODEL: Array<{ id: string; label: string; targetPct: number; sectors: string[]; icon: IconName; color: string }> = [
    { id: 'index', label: 'Index Mondial (CW8)', targetPct: 40, sectors: ['Index'], icon: 'globe', color: '#8a7cc0' },
    { id: 'tech', label: 'Technologie', targetPct: 30, sectors: ['Technologie'], icon: 'cpu', color: '#5b82bf' },
    { id: 'ind_fin', label: 'Industrie & Finance', targetPct: 15, sectors: ['Industrie', 'Finance'], icon: 'factory', color: '#c2974f' },
    { id: 'gold', label: 'Or & Matières', targetPct: 10, sectors: ['Mines/Or'], icon: 'gem', color: '#b8a45e' },
    { id: 'cash', label: 'Liquidités', targetPct: 5, sectors: [], icon: 'cash', color: '#4f9d86' },
];

export const Investments: React.FC<InvestmentsProps> = ({
    assets, setAssets, projection, setProjection, apiKey
}) => {
    // Phase E.7 — apiKey du store (fallback prop pour rétrocompat) pour appeler Claude
    const anthropicKeyFromStore = useFinanceStore(s => s.apiKeys.anthropic);
    const claudeKey = anthropicKeyFromStore || apiKey || '';

    const [marketData, setMarketData] = useState<MarketDataPoint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [timeRange, setTimeRange] = useState<TimeRange>('1Y');
    // Phase E.3 — sous-onglets pour aérer la page (doc directives §4)
    // PH4-INV-4 — « moins de pages » : Rééquilibrage fusionné dans Allocation (4 → 3 sous-onglets).
    const [subTab, setSubTab] = useState<'overview' | 'allocation' | 'detail'>('overview');
    // Phase E.6 — filtre interactif Geo/Sector cliqué dans la pie
    const [allocationFilter, setAllocationFilter] = useState<{ type: 'region' | 'sector'; value: string } | null>(null);

    // Wiring 2026-05: lecture de la projection vivante depuis le store.
    const lastProjection = useFinanceStore(s => s.lastProjection);
    const navigateWithFocus = useFinanceStore(s => s.navigateWithFocus);
    const projectionHorizonYears = projection.years || 30;
    const horizonData = useMemo(() => {
        if (!lastProjection?.chartData?.length) return { snapshot: null, corrupt: false };
        const targetMonth = projectionHorizonYears * 12;
        const point = lastProjection.chartData.find(p => p.monthIndex === targetMonth)
            ?? lastProjection.chartData[lastProjection.chartData.length - 1];
        if (!point) return { snapshot: null, corrupt: false };
        // [EP-5] détail par compte retiré → on ne garde que year + netWorth.
        // no-silent-failure : un NetWorth non fini (NaN/±Inf) = point corrompu → snapshot null
        // (→ <ProjectionRequired> déjà câblé) au lieu d'un « 0 $ » / « — » muet. Flag `corrupt`
        // (présent-mais-invalide) → log via effet ; absence pure = repli muet légitime.
        const nw = point.NetWorth;
        if (typeof nw !== 'number' || !Number.isFinite(nw)) {
            return { snapshot: null, corrupt: nw != null };
        }
        return {
            snapshot: {
                year: point.year ?? new Date().getFullYear() + projectionHorizonYears,
                netWorth: nw,
            },
            corrupt: false,
        };
    }, [lastProjection, projectionHorizonYears]);
    const horizonSnapshot = horizonData.snapshot;

    useEffect(() => {
        if (horizonData.corrupt) {
            logError({
                source: 'projection',
                severity: 'warning',
                message: 'Investments horizonSnapshot : NetWorth non fini au point horizon (projection corrompue)',
            });
        }
    }, [horizonData.corrupt]);

    const [targetModel, setTargetModelLocal] = useState(() => {
        const pcts = projection?.investmentTargetPcts;
        if (!pcts) return DEFAULT_TARGET_MODEL;
        return DEFAULT_TARGET_MODEL.map(m => ({ ...m, targetPct: pcts[m.id] ?? m.targetPct }));
    });
    const setTargetModel = (model: typeof DEFAULT_TARGET_MODEL) => {
        setTargetModelLocal(model);
        const pcts: Record<string, number> = {};
        model.forEach(m => { pcts[m.id] = m.targetPct; });
        setProjection({ ...projection, investmentTargetPcts: pcts });
    };
    const [isRebalanceEdit, setIsRebalanceEdit] = useState(false);
    // Phase E.7 — justifications IA des actions de rééquilibrage
    const [iaJustifications, setIaJustifications] = useState<Map<string, string>>(new Map());
    const [isFetchingJustifications, setIsFetchingJustifications] = useState(false);
    // Phase E.9 — modal d'ajout manuel d'une action
    const [showAddStockForm, setShowAddStockForm] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null); // suppression de position (2 clics)
    const [showImportBroker, setShowImportBroker] = useState(false);

    // --- INSTANT DATA LOAD ---
    // Sprint 3B M3 + test-mode-complet : utilise usePortfolioHistory hook qui
    // retourne le marketData synthétique en mode test (depuis testFixtures)
    // ou le CSV externe sinon.
    const { history: portfolioHistory } = usePortfolioHistory();
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setIsLoading(true);
            const data = portfolioHistory;
            if (cancelled) return;
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
        return () => { cancelled = true; };
    }, [portfolioHistory]);

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
    } = useMemo(() => {
        // PH4-INV-2 — SOURCE DE VÉRITÉ de l'allocation = le portefeuille `assets` saisi (qty × prix
        // courant), PAS le CSV historique (Google Sheet déprécié) qui divergeait du portefeuille réel
        // (bug Marc : allocation fausse dès qu'un CSV existait). Le CSV ne sert plus qu'aux SÉRIES
        // temporelles (tendances 24 h, benchmark, score de santé) quand il est présent.

        // (a) Dernières valeurs par colonne du CSV (si présent) — pour les TENDANCES uniquement.
        const latestValues: Record<string, number> = {};
        const prevValues: Record<string, number> = {};
        if (marketData.length > 0) {
            const allKeys = new Set<string>();
            marketData.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));
            const cleanKeys = Array.from(allKeys).filter(k =>
                k !== 'date' && k !== 'Date' && !k.startsWith('Taux') && k.trim() !== '' && k !== '1' && k.toLowerCase() !== 'colonne 1' && k !== 'Unnamed: 1',
            );
            cleanKeys.forEach(k => {
                let latestIdx = -1;
                for (let i = marketData.length - 1; i >= 0; i--) {
                    const val = Number(marketData[i][k]);
                    if (val > 0) { latestValues[k] = val; latestIdx = i; break; }
                }
                prevValues[k] = latestIdx > 0 ? (Number(marketData[latestIdx - 1][k]) || 0) : 0;
            });
        }

        // (b) Séries + tendances (depuis le CSV). Vide s'il n'y a pas de CSV.
        const availableSeriesWithTrend = Object.keys(latestValues).map(k => {
            const current = latestValues[k] || 0;
            if (current === 0) return null;
            const prev = prevValues[k] || 0;
            const trend = prev > 0 ? ((current - prev) / prev) * 100 : 0;
            const isTotal = k.includes('TOTAL');
            const meta = ASSET_META[k] || { name: k.replace('NASDAQ:', '').replace('NYSE:', '') };
            return { id: k, name: isTotal ? 'TOTAL PORTEFEUILLE' : meta.name, trend, isTotal };
        }).filter((x): x is SeriesWithTrend => x !== null).sort((a, b) => {
            if (a.isTotal) return -1;
            if (b.isTotal) return 1;
            return b.trend - a.trend;
        });
        const totalSerie = availableSeriesWithTrend.find(s => s.isTotal);
        const cw8Serie = availableSeriesWithTrend.find(s => s.id.includes('CW8') || s.name.includes('MSCI'));
        const portfolioTrend = totalSerie ? totalSerie.trend : 0;
        const benchmarkTrend = cw8Serie ? cw8Serie.trend : 0;

        // (c) ALLOCATION = portefeuille réel (assets). trend24h enrichi depuis le CSV par symbole si dispo.
        const FREQ_MAP: Record<string, number> = { Monthly: 12, Quarterly: 4, Yearly: 1 };
        const allocation = assets.map(a => {
            const value = (a.quantity || 0) * (a.currentPrice || 0);
            const meta = ASSET_META[a.symbol] || { name: a.name || a.symbol, sector: 'Autre', region: 'Autre', yield: 0, freq: 1 };
            const cur = latestValues[a.symbol] ?? 0;
            const prev = prevValues[a.symbol] ?? 0;
            const trend24h = cur > 0 && prev > 0 ? ((cur - prev) / prev) * 100 : 0;
            // PH4-INV-3 — dividendes : priorité au rendement/fréquence SAISIS sur l'Asset (réels du
            // titre) sur l'estimation de la table statique ASSET_META.
            const effYield = a.dividendYield != null && a.dividendYield > 0 ? a.dividendYield : meta.yield;
            const effFreq = a.dividendFreq ? (FREQ_MAP[a.dividendFreq] ?? meta.freq) : meta.freq;
            return { id: a.symbol, value, trend24h, weight: 0, ...meta, yield: effYield, freq: effFreq, dividendYearly: value * (effYield / 100) };
        }).filter((a): a is AllocationItem => a.value > 0);
        const totalPortfolio = allocation.reduce((s, a) => s + a.value, 0) || 1;
        allocation.forEach(a => { a.weight = (a.value / totalPortfolio) * 100; });
        allocation.sort((a, b) => b.value - a.value);

        // (d) Répartitions géographique / sectorielle (depuis l'allocation réelle).
        const geoMap: Record<string, number> = {};
        const sectorMap: Record<string, number> = {};
        allocation.forEach(a => {
            geoMap[a.region] = (geoMap[a.region] || 0) + a.value;
            sectorMap[a.sector] = (sectorMap[a.sector] || 0) + a.value;
        });
        const geoData = Object.entries(geoMap).map(([name, value]) => ({ name, value, percent: (value / totalPortfolio) * 100 })).sort((a, b) => b.value - a.value);
        const sectorData = Object.entries(sectorMap).map(([name, value]) => ({ name, value, percent: (value / totalPortfolio) * 100 })).sort((a, b) => b.value - a.value);

        // (e) Calendrier de dividendes (depuis l'allocation réelle).
        const dividendList: DividendItem[] = [];
        let totalDivs = 0;
        const today = new Date();
        allocation.forEach(asset => {
            if (asset.dividendYearly > 0) {
                totalDivs += asset.dividendYearly;
                let nextMonth = asset.nextPayMonth || (today.getMonth() + 2);
                if (nextMonth > 12) nextMonth -= 12;
                const monthName = new Date(today.getFullYear(), nextMonth - 1, 1).toLocaleDateString('fr-CA', { month: 'long' });
                dividendList.push({ ...asset, nextPayout: monthName, amountPerPayout: asset.dividendYearly / asset.freq });
            }
        });
        const sortedDividends = dividendList.sort((a, b) => b.dividendYearly - a.dividendYearly);

        // (f) Score de santé : part « défensive » (Index/Or) depuis l'allocation réelle + momentum (CSV).
        let indexWeight = 0;
        allocation.forEach(a => { if (a.sector === 'Index' || a.sector === 'Mines/Or') indexWeight += a.weight; });
        let safePts = (indexWeight / 40) * 60;
        if (safePts > 60) safePts = 60;
        let trendPts = 20;
        if (portfolioTrend > benchmarkTrend && portfolioTrend > 0) trendPts += 20;
        else if (portfolioTrend > 0) trendPts += 10;
        else if (portfolioTrend < 0) trendPts -= 10;
        if (trendPts > 40) trendPts = 40;
        if (trendPts < 0) trendPts = 0;
        const healthScore = Math.round(safePts + trendPts);

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
        };
    }, [marketData, assets]);

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
            newAssets[assetIdx] = { ...newAssets[assetIdx], accountType: newAccount as RegisteredAccountType };
            setAssets(newAssets);
        }
    };

    // Retire une position du portefeuille (le symbolKey est l'id d'allocation, qui contient le symbole).
    const handleDeleteAsset = (symbolKey: string) => {
        const target = assets.find(a => symbolKey.includes(a.symbol));
        if (!target) return;
        setAssets(assets.filter(a => a !== target));
        setConfirmDeleteId(null);
        showToast(`Position ${target.symbol} retirée du portefeuille.`, 'info');
    };

    // D2 (activation) — sans aucun actif, la page affichait un score à 0, une allocation et des
    // graphes vides (barren). On propose un accueil clair « ajoute ton premier placement » +
    // le formulaire d'ajout. Early-return placé APRÈS tous les hooks.
    if (assets.length === 0) {
        return (
            <div className="space-y-6 stagger-in pb-10 relative">
                <PageHeader icon={<Icon name="investments" size={28} />} title="Investissements" />
                <Card>
                    <div className="text-center py-12 px-4 space-y-4">
                        <Icon name="investments" size={44} className="text-ink-500 block mx-auto" />
                        <h2 className="text-h2 text-ink-50 font-bold">Ajoute ton premier placement</h2>
                        <p className="text-meta text-ink-300 max-w-md mx-auto leading-snug">
                            Saisis un titre à la main pour voir ton score de diversification, ton allocation
                            géographique/sectorielle et tes revenus passifs.
                        </p>
                        <div className="flex justify-center pt-2">
                            <button
                                type="button"
                                onClick={() => setShowAddStockForm(true)}
                                className="px-4 py-2 rounded-card bg-primary/15 border border-primary/40 text-primary text-meta font-bold hover:bg-primary/25 transition-colors focus-ring"
                            >
                                Ajouter un titre
                            </button>
                        </div>
                    </div>
                </Card>
                <AddStockForm
                    isOpen={showAddStockForm}
                    onClose={() => setShowAddStockForm(false)}
                    onAdd={(newAsset) => { if (setAssets) { setAssets([...assets, newAsset]); } }}
                />
            </div>
        );
    }

    return (
        <div className="space-y-6 stagger-in pb-10 relative">

            {/* [PH2-c-2] — signal inter-onglets : dernier recalcul de projection échoué. */}
            <ProjectionStaleBanner />
            <PageHeader
                icon={<Icon name="investments" size={28} />}
                title="Investissements"
                badge={
                    <Badge
                        variant={healthScore >= 80 ? 'success' : healthScore >= 50 ? 'warning' : 'danger'}
                        size="md"
                        title="Score basé sur la diversification et la tendance vs marché"
                    >
                        Santé {healthScore}/100
                    </Badge>
                }
            />

            {/* CI-1000x Phase 1 (axe B) — répartition du portefeuille par personne (mode couple). */}
            <NetWorthByOwnerCard assets={assets} setAssets={setAssets} />

            {/* Phase E.3 — Sous-onglets + Phase E.1 — TimeRange global au sommet */}
            <div className="flex flex-wrap items-center justify-center gap-3">
                <Pill
                    aria-label="Vue Investissements"
                    size="sm"
                    value={subTab}
                    onChange={(v) => setSubTab(v as typeof subTab)}
                    options={[
                        { value: 'overview', label: "Vue d'ensemble" },
                        { value: 'allocation', label: 'Allocation & rééquilibrage' },
                        { value: 'detail', label: 'Détail' },
                    ]}
                />
                <Pill
                    aria-label="Période"
                    size="sm"
                    value={timeRange}
                    onChange={(v) => setTimeRange(v as TimeRange)}
                    options={(['1M', '3M', '6M', 'YTD', '1Y', 'ALL'] as TimeRange[]).map(r => ({ value: r, label: r }))}
                />
            </div>

            {/* [EP-4] Donut « Score de Santé » retiré : il dupliquait le badge header « Santé X/100 ».
                Reste la performance 24h (portefeuille vs marché), non affichée ailleurs. */}
            <Card title="Performance (24h)">
                <div className="grid grid-cols-2 gap-4">
                    <div className="card-subtle p-4 flex flex-col items-center justify-center">
                        <div className="kpi-label mb-1">Votre Portefeuille</div>
                        <div className={`text-kpi tabular-nums ${portfolioTrend >= 0 ? 'text-success-400' : 'text-danger-400'}`}>
                            {portfolioTrend > 0 ? '+' : ''}{portfolioTrend.toFixed(2)}%
                        </div>
                    </div>
                    <div className="card-subtle p-4 flex flex-col items-center justify-center">
                        <div className="kpi-label mb-1">Marché (CW8 / MSCI)</div>
                        <div className={`text-kpi tabular-nums ${benchmarkTrend >= 0 ? 'text-info-400' : 'text-danger-400'}`}>
                            {benchmarkTrend > 0 ? '+' : ''}{benchmarkTrend.toFixed(2)}%
                        </div>
                    </div>
                </div>
            </Card>

            {/* 0.5 PROJECTION RETRAITE — Phase E.3 overview only */}
            {subTab === 'overview' && !horizonSnapshot && (
                <ProjectionRequired feature="Le portefeuille projeté à l'horizon retraite" />
            )}
            {/* [EP-5] Détail projeté PAR COMPTE retiré (duplique l'onglet Futur) : on garde le
                patrimoine net projeté à l'horizon + un lien vers le détail dans Futur. */}
            {subTab === 'overview' && horizonSnapshot && (
                <Card className="bg-white/[0.03] border-white/10">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <div className="kpi-label">Patrimoine net projeté en {horizonSnapshot.year} ({projectionHorizonYears} ans)</div>
                            <PrivateAmount as="div" className="text-kpi text-ink-50 tabular-nums">{formatCAD(horizonSnapshot.netWorth)}</PrivateAmount>
                        </div>
                        <button
                            type="button"
                            onClick={() => navigateWithFocus(TabEnum.FUTURE)}
                            className="text-tiny text-info-400 hover:underline font-bold focus-ring rounded inline-flex items-center gap-1"
                        >
                            Détail par compte dans Futur →
                        </button>
                    </div>
                </Card>
            )}

            {/* 1. CHART SECTION — Phase E.3 overview only */}
            {subTab === 'overview' && <Card className="min-h-[550px]" title="Performance Comparée">
                {/* Phase E.1 — Pill TimeRange déplacée en haut de page (global) */}
                <div className="flex justify-end items-center mb-2 text-meta text-ink-400">
                    {filteredMarketData.length} points · période <strong className="text-ink-200 ml-1">{timeRange}</strong>
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
                                className={`text-tiny px-2 py-1.5 rounded-lg border transition-all flex items-center gap-2 ${isActive
                                    ? (asset.isTotal ? 'bg-green-500/20 text-green-400 border-green-500/50 font-bold' : 'bg-info-500/20 text-blue-300 border-info-500/50')
                                    : 'bg-[#1a1a1a] text-ink-500 border-white/5 hover:border-white/10 hover:text-ink-200'
                                    }`}
                            >
                                <div className="flex items-center gap-1">
                                    <span className={`w-1.5 h-1.5 rounded-full ${isActive ? (asset.isTotal ? 'bg-green-400' : 'bg-info-400') : 'bg-white/10'}`}></span>
                                    {asset.name}
                                </div>
                                {Math.abs(asset.trend) > 0.5 && (
                                    <span className={`text-tiny ${asset.trend > 0 ? 'text-green-500' : 'text-danger-500'}`}>
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
                            <Skeleton variant="chart" className="!h-auto flex-1" />
                            <Skeleton variant="text" className="w-3/4 mx-auto !h-8" />
                        </div>
                    ) : filteredMarketData.length > 0 ? (
                        <StockChart
                            data={filteredMarketData}
                            visibleKeys={selectedKeys}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-ink-500 bg-white/5 rounded-xl">
                            Aucune donnée disponible pour cette période.
                        </div>
                    )}
                </div>
            </Card>}

            {/* 2. ALLOCATION PANORAMIQUE — Phase E.3 sub-tab 'allocation' */}
            {subTab === 'allocation' && <CollapsibleSection
                title="Analyse de l'Allocation"
                icon={<Icon name="goal" size={16} />}
                defaultOpen={true}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 min-h-[300px]">

                    {/* REGIONS — Phase E.6 : clic = filtre stocks */}
                    <div className="bg-[#1a1a1a] rounded-xl p-4 border border-white/5 flex flex-col">
                        <h4 className="text-ink-300 text-meta font-bold uppercase mb-4 text-center">Répartition Géographique</h4>
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
                                            onClick={(entry: { name?: string }) => entry.name && setAllocationFilter({ type: 'region', value: entry.name })}
                                            cursor="pointer"
                                        >
                                            {geoBreakdown.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={COLORS_REGION[entry.name] || '#444'}
                                                    opacity={allocationFilter?.type === 'region' && allocationFilter.value !== entry.name ? 0.3 : 1}
                                                />
                                            ))}
                                        </Pie>
                                        <ReTooltip contentStyle={{ backgroundColor: '#fff', color: '#000', borderRadius: '8px', border: 'none' }} itemStyle={{ color: '#000' }} formatter={(val: number) => formatCAD(val)} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex-1 w-full space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                                {geoBreakdown.map(item => {
                                    const isActive = allocationFilter?.type === 'region' && allocationFilter.value === item.name;
                                    return (
                                        <button
                                            key={item.name}
                                            type="button"
                                            onClick={() => setAllocationFilter(isActive ? null : { type: 'region', value: item.name })}
                                            className={`w-full flex justify-between items-center text-meta p-2 rounded transition-colors focus-ring ${
                                                isActive ? 'bg-white/15 border border-white/20' : 'bg-white/5 hover:bg-white/10'
                                            }`}
                                            aria-pressed={isActive}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS_REGION[item.name] || '#444' }}></span>
                                                <span className="text-ink-100 font-medium">{item.name}</span>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-white font-bold">{formatCAD(item.value)}</div>
                                                <div className="text-tiny text-ink-500">{item.percent.toFixed(1)}%</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* SECTORS — Phase E.6 : clic = filtre stocks */}
                    <div className="bg-[#1a1a1a] rounded-xl p-4 border border-white/5 flex flex-col">
                        <h4 className="text-ink-300 text-meta font-bold uppercase mb-4 text-center">Répartition Sectorielle</h4>
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
                                            onClick={(entry: { name?: string }) => entry.name && setAllocationFilter({ type: 'sector', value: entry.name })}
                                            cursor="pointer"
                                        >
                                            {sectorBreakdown.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={COLORS_SECTOR[entry.name] || '#444'}
                                                    opacity={allocationFilter?.type === 'sector' && allocationFilter.value !== entry.name ? 0.3 : 1}
                                                />
                                            ))}
                                        </Pie>
                                        <ReTooltip contentStyle={{ backgroundColor: '#fff', color: '#000', borderRadius: '8px', border: 'none' }} itemStyle={{ color: '#000' }} formatter={(val: number) => formatCAD(val)} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex-1 w-full space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                                {sectorBreakdown.map(item => {
                                    const isActive = allocationFilter?.type === 'sector' && allocationFilter.value === item.name;
                                    return (
                                        <button
                                            key={item.name}
                                            type="button"
                                            onClick={() => setAllocationFilter(isActive ? null : { type: 'sector', value: item.name })}
                                            className={`w-full flex justify-between items-center text-meta p-2 rounded transition-colors focus-ring ${
                                                isActive ? 'bg-white/15 border border-white/20' : 'bg-white/5 hover:bg-white/10'
                                            }`}
                                            aria-pressed={isActive}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS_SECTOR[item.name] || '#444' }}></span>
                                                <span className="text-ink-100 font-medium">{item.name}</span>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-white font-bold">{formatCAD(item.value)}</div>
                                                <div className="text-tiny text-ink-500">{item.percent.toFixed(1)}%</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                </div>

                {/* Phase E.6 — Liste des stocks filtrés par geo/sector cliqué */}
                {allocationFilter && (
                    <div className="mt-4 p-4 bg-gradient-to-r from-primary/5 to-info-500/5 border border-primary/20 rounded-xl">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-body font-bold text-white flex items-center gap-2">
                                <Icon name={allocationFilter.type === 'region' ? 'globe' : 'building'} size={16} className="text-ink-300" />
                                Actions en <span className="text-primary">{allocationFilter.value}</span>
                            </h4>
                            <button
                                type="button"
                                onClick={() => setAllocationFilter(null)}
                                className="text-tiny text-ink-400 hover:text-ink-100 px-2 py-1 rounded transition-colors focus-ring"
                            >
                                Effacer filtre
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                            {currentAllocation
                                .filter(a => allocationFilter.type === 'region' ? a.region === allocationFilter.value : a.sector === allocationFilter.value)
                                .sort((a, b) => b.value - a.value)
                                .map(a => (
                                    <div key={a.id} className="bg-white/5 p-3 rounded-lg border border-white/5">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-bold text-white text-body truncate">{a.name}</span>
                                            <span className="text-tiny text-ink-400 font-mono">{a.weight.toFixed(1)}%</span>
                                        </div>
                                        <PrivateAmount as="div" className="text-meta font-mono text-ink-200">{formatCAD(a.value)}</PrivateAmount>
                                        <div className={`text-tiny font-mono ${a.trend24h >= 0 ? 'text-success-400' : 'text-danger-400'}`}>
                                            {a.trend24h >= 0 ? '+' : ''}{a.trend24h.toFixed(2)}% (24h)
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}
            </CollapsibleSection>}

            {/* 3. DIVIDEND CALENDAR — Phase E.3 visible en overview */}
            {subTab === 'overview' && <DividendPanel
                dividendCalendar={dividendCalendar}
                totalAnnualDividends={totalAnnualDividends}
                currentAllocation={currentAllocation}
                isLoading={isLoading}
            />}

            {/* 4. VISUAL PORTFOLIO REBALANCING (V16) — sous « Allocation Phase E.3 sub-tab 'rebalance'  rééquilibrage » (PH4-INV-4) */}
            {subTab === 'allocation' && currentAllocation.length > 0 && (() => {
                const alloc = currentAllocation as AllocationItem[];
                const totalPortfolio = alloc.reduce((s, a) => s + a.value, 0);

                const rebalancingActions = targetModel.map(target => {
                    const currentVal = alloc
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
                    <CollapsibleSection
                        title="Rééquilibrage"
                        icon={<Icon name="budget" size={20} />}
                        subtitle={hasActions ? "Actions de rééquilibrage recommandées" : "Allocation conforme aux cibles"}
                        defaultOpen={hasActions}
                        badge={hasActions ? <Badge variant="warning" size="sm">Action requise</Badge> : <Badge variant="success" size="sm">OK</Badge>}
                        className="mt-2"
                    >
                        <div className="mb-6 bg-white/[0.03] p-4 rounded-xl border border-white/10 flex items-center justify-between">
                            <div>
                                <div className="text-meta text-violet-400 uppercase font-bold mb-1">Diagnostic Automatique</div>
                                <div className="text-white text-body font-bold">
                                    {hasActions ? 'Des actions de rééquilibrage sont recommandées' : 'Portefeuille bien équilibré'}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Phase E.7 — bouton justifications IA */}
                                {hasActions && claudeKey && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            setIsFetchingJustifications(true);
                                            const inputs: RebalanceActionInput[] = rebalancingActions.map(a => ({
                                                id: a.id,
                                                label: a.label,
                                                action: a.action,
                                                currentPct: a.currentPct,
                                                targetPct: a.targetPct,
                                                diffAmount: a.diffAmount,
                                            }));
                                            const justifications = await getRebalanceJustifications(inputs, claudeKey);
                                            const map = new Map<string, string>();
                                            justifications.forEach(j => map.set(j.actionId, j.reason));
                                            setIaJustifications(map);
                                            setIsFetchingJustifications(false);
                                        }}
                                        disabled={isFetchingJustifications}
                                        className="px-3 py-1.5 bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 rounded-lg text-meta font-bold hover:bg-indigo-600 hover:text-white transition-colors disabled:opacity-50"
                                    >
                                        {isFetchingJustifications ? 'Analyse…' : 'Pourquoi ces actions ?'}
                                    </button>
                                )}
                                <button
                                    onClick={() => setIsRebalanceEdit(!isRebalanceEdit)}
                                    className="px-3 py-1.5 bg-violet-600/20 text-violet-300 border border-violet-500/30 rounded-lg text-meta font-bold hover:bg-violet-600 hover:text-white transition-colors"
                                >
                                    {isRebalanceEdit ? 'Terminer' : 'Modifier Cibles'}
                                </button>
                                <PrivateAmount as="div" className="text-3xl font-black text-white hidden sm:block">
                                    {formatCAD(totalPortfolio)}
                                </PrivateAmount>
                            </div>
                        </div>

                        {isRebalanceEdit && sumTargets !== 100 && (
                            <div className="text-danger-400 text-meta font-bold mb-4 bg-red-900/20 p-3 rounded-lg border border-danger-500/20 animate-pulse flex items-center gap-2">
                                <Icon name="alert" size={14} /> Le total des cibles doit être de 100% (Actuel : {sumTargets}%)
                            </div>
                        )}

                        <div className="space-y-3 mb-6">
                            {rebalancingActions.map((item, i) => (
                                <div key={i} className={`p-4 rounded-xl border transition-all ${!isRebalanceEdit && item.action === 'SELL' ? 'border-danger-500/30 bg-red-900/10' :
                                    !isRebalanceEdit && item.action === 'BUY' ? 'border-green-500/30 bg-green-900/10' :
                                        'border-white/5 bg-white/5'
                                    }`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3">
                                            <Icon name={item.icon} size={20} className="text-ink-300 shrink-0" />
                                            <div>
                                                <div className="text-white font-bold text-body">{item.label}</div>
                                                <div className="text-tiny text-ink-500 flex items-center gap-2 mt-1">
                                                    <span>Actuel: <span className="text-ink-200 font-bold">{item.currentPct.toFixed(1)}%</span></span>
                                                    <span className="opacity-50">|</span>
                                                    {isRebalanceEdit ? (
                                                        <div className="flex items-center gap-1">
                                                            <span>Cible:</span>
                                                            <div className="relative">
                                                                <input
                                                                    aria-label="Allocation cible (pourcentage)"
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
                                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none text-tiny">%</span>
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
                                                <div className="text-danger-400 font-bold text-body">
                                                    → Vendre {formatCAD(Math.round(Math.abs(item.diffAmount)))}
                                                </div>
                                            )}
                                            {!isRebalanceEdit && item.action === 'BUY' && (
                                                <div className="text-green-400 font-bold text-body">
                                                    → Acheter {formatCAD(Math.round(Math.abs(item.diffAmount)))}
                                                </div>
                                            )}
                                            {!isRebalanceEdit && item.action === 'OK' && (
                                                <div className="text-ink-300 text-meta font-bold">CIBLE ATTEINTE</div>
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
                                    {/* Phase E.7 — justification IA */}
                                    {iaJustifications.has(item.id) && (
                                        <div className="mt-3 pt-3 border-t border-white/5 text-tiny text-ink-300 italic flex gap-2">
                                            <Icon name="sparkles" size={12} className="text-ink-400 shrink-0 mt-0.5" />
                                            <span className="leading-relaxed">{iaJustifications.get(item.id)}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Priority Suggestions */}
                        {hasActions && (
                            <div className="bg-black/40 rounded-xl p-4 border border-white/10">
                                <h4 className="text-meta font-bold text-ink-300 uppercase mb-3">Stratégie de Rééquilibrage Recommandée</h4>
                                <div className="space-y-2">
                                    {rebalancingActions.filter(a => a.action === 'SELL').map((a, i) => (
                                        <div key={i} className="text-meta text-red-300 flex items-start gap-2">
                                            <span className="w-2 h-2 rounded-full bg-danger-500 mt-1.5 shrink-0" aria-hidden="true" />
                                            <span><b>Vendre</b> {formatCAD(Math.round(Math.abs(a.diffAmount)))} de <b>{a.label}</b> (surplus {a.diffPct.toFixed(1)}%) — Utilisez votre compte Non-Enregistré en priorité pour optimiser la fiscalité.</span>
                                        </div>
                                    ))}
                                    {rebalancingActions.filter(a => a.action === 'BUY').map((a, i) => (
                                        <div key={i} className="text-meta text-green-300 flex items-start gap-2">
                                            <span className="w-2 h-2 rounded-full bg-success-500 mt-1.5 shrink-0" aria-hidden="true" />
                                            <span><b>Acheter</b> {formatCAD(Math.round(Math.abs(a.diffAmount)))} de <b>{a.label}</b> (déficit {Math.abs(a.diffPct).toFixed(1)}%) — Priorisez votre CELI si vous avez de l'espace disponible.</span>
                                        </div>
                                    ))}
                                    <div className="text-meta text-ink-500 mt-3 pt-3 border-t border-white/5 italic">
                                        Astuce fiscale : Rééquilibrer via les nouvelles contributions évite de déclencher des gains en capital dans votre compte Non-Enregistré.
                                    </div>
                                </div>
                            </div>
                        )}
                    </CollapsibleSection>
                );
            })()}

            {/* 5. STOCK CARDS GRID — Phase E.3 sub-tab 'detail' */}
            {subTab === 'detail' && <>
                {/* Phase E.9 — bouton d'ajout manuel d'action */}
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => setShowImportBroker(true)}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/15 text-ink-200 text-tiny font-bold rounded-card transition-colors focus-ring"
                    >
                        Importer (CSV courtier)
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowAddStockForm(true)}
                        className="px-3 py-1.5 bg-primary/15 hover:bg-primary/25 border border-primary/40 text-primary text-tiny font-bold rounded-card transition-colors focus-ring"
                    >
                        + Ajouter une action
                    </button>
                </div>
                <CollapsibleSection
                title="Portefeuille Détaillé"
                icon={<Icon name="package" size={20} />}
                defaultOpen={true}
                badge={<Badge variant="neutral" size="sm">{currentAllocation.length} actifs</Badge>}
            >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {currentAllocation.map((asset) => {
                    // Try to find matching asset in props to get saved account type
                    const savedAsset = assets.find(a => asset.id.includes(a.symbol));
                    const accountType = savedAsset?.accountType || 'NON-ENREG';
                    // Phase E.8 — affiche les stats DCA si purchases[] présent
                    const purchaseStats = savedAsset ? computePurchaseStats({ ...savedAsset, currentPrice: asset.value / (savedAsset.quantity || 1) }) : null;

                    return (
                        <div key={asset.id} className="premium-card border border-white/5 hover:border-white/20 p-5 rounded-2xl transition-all group relative overflow-hidden flex flex-col justify-between animate-premium-in shadow-xl">
                            {/* Background Gradient based on sector */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-white/10 to-transparent -mr-8 -mt-8 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

                            <div>
                                <div className="flex justify-between items-start mb-4 relative z-10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-meta font-bold text-white shadow-lg border border-white/10" style={{ backgroundColor: COLORS_SECTOR[asset.sector] || '#333' }}>
                                            {asset.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="font-bold text-white text-body leading-tight tracking-tight">{asset.name}</div>
                                            <div className="text-tiny text-ink-500 font-medium uppercase tracking-wider">{asset.region}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xl font-black text-white tracking-tight">{asset.weight.toFixed(1)}%</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-tiny mb-4 relative z-10">
                                    <div className="bg-white/[0.03] p-2.5 rounded-xl border border-white/5 backdrop-blur-sm">
                                        <div className="text-ink-400 mb-1 font-bold">Valeur</div>
                                        <div className="text-white font-mono font-bold text-meta">{formatCAD(asset.value)}</div>
                                    </div>
                                    <div className="bg-white/[0.03] p-2.5 rounded-xl border border-white/5 backdrop-blur-sm">
                                        <div className="text-ink-400 mb-1 font-bold">Variation 24h</div>
                                        <div className={`font-bold text-meta ${asset.trend24h >= 0 ? 'text-green-400' : 'text-danger-400'}`}>
                                            {asset.trend24h > 0 ? '+' : ''}{asset.trend24h.toFixed(1)}%
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-3 border-t border-white/5 relative z-10 mt-auto">
                                <div className="text-tiny text-ink-300 flex items-center gap-2">
                                    <span className="font-medium">Yield</span>
                                    <span className={asset.yield > 0 ? "text-success-400 font-bold" : "text-ink-500"}>{asset.yield}%</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {savedAsset && (
                                        confirmDeleteId === asset.id ? (
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteAsset(asset.id)}
                                                className="text-tiny font-bold text-red-100 bg-danger-500/25 border border-danger-500/40 px-2 py-1 rounded-lg hover:bg-danger-500/35"
                                            >
                                                Retirer ?
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => { setConfirmDeleteId(asset.id); window.setTimeout(() => setConfirmDeleteId(c => (c === asset.id ? null : c)), 3000); }}
                                                aria-label={`Retirer la position ${savedAsset.symbol}`}
                                                title="Retirer cette position"
                                                className="inline-flex text-ink-500 hover:text-danger-400 px-1.5 py-1 rounded-lg transition-colors"
                                            >
                                                <Icon name="trash" size={14} />
                                            </button>
                                        )
                                    )}
                                    <select
                                        aria-label={`Type de compte pour ${asset.id}`}
                                        value={accountType}
                                        onChange={(e) => handleAssetAccountChange(asset.id, e.target.value)}
                                        className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-tiny text-ink-200 font-bold outline-none hover:bg-white/10 cursor-pointer transition-colors"
                                    >
                                        <option value="CELI">CELI</option>
                                        <option value="REER">REER</option>
                                        <option value="NON-ENREG">Non-Enreg</option>
                                        <option value="CRYPTO">Crypto</option>
                                    </select>
                                </div>
                            </div>
                            {/* Phase E.8 — DCA stats si purchases[] non-vide */}
                            {purchaseStats && purchaseStats.purchaseCount > 1 && (
                                <div className="mt-3 pt-3 border-t border-white/5">
                                    <div className="text-tiny text-info-300 uppercase font-bold mb-1">DCA · {purchaseStats.purchaseCount} achats</div>
                                    <div className="space-y-0.5 text-tiny">
                                        <div className="flex justify-between">
                                            <span className="text-ink-500">Coût moyen</span>
                                            <span className="font-mono text-ink-200">{formatCAD(purchaseStats.averageCost)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-ink-500">Gain total</span>
                                            <span className={`font-mono ${purchaseStats.totalGain >= 0 ? 'text-success-400' : 'text-danger-400'}`}>
                                                {purchaseStats.totalGain >= 0 ? '+' : ''}{formatCAD(purchaseStats.totalGain)} ({purchaseStats.gainPct.toFixed(1)}%)
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            </CollapsibleSection>
            </>}

            {/* Phase E.9 — Modal d'ajout manuel */}
            <AddStockForm
                isOpen={showAddStockForm}
                onClose={() => setShowAddStockForm(false)}
                onAdd={(newAsset) => {
                    if (setAssets) {
                        setAssets([...assets, newAsset]);
                    }
                }}
            />

            {/* Import positions courtier en lot (CSV). Dédup par symbole : on
                n'ajoute que les titres pas déjà présents (l'utilisateur garde la main). */}
            <ImportBrokerPositions
                isOpen={showImportBroker}
                onClose={() => setShowImportBroker(false)}
                onImport={(newAssets) => {
                    if (setAssets) {
                        const existing = new Set(assets.map(a => a.symbol));
                        const toAdd = newAssets.filter(a => !existing.has(a.symbol));
                        setAssets([...assets, ...toAdd]);
                    }
                }}
            />

        </div>
    );
};
