import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
import { HistoryCoverageNote } from './dashboard/HistoryCoverageNote';
import { HistorySyncDoctor } from './investments/HistorySyncDoctor';
import { historyKeyMatchesSymbol } from '../services/history/buildMarketData';
import { seriesReturnPct, priceReturnPct, isBenchmarkCandidate, PERF_PERIODS, PERF_PERIOD_LABELS, type PerfPeriod } from '../services/history/periodReturn';
import { StockChart } from './StockChart';
import { resolveAssetMeta, lookupSeedMeta, CANONICAL_SECTORS, CANONICAL_REGIONS } from '../services/assetMeta';
import { assetValueCad, toCurrencyFactor } from '../services/portfolio';
import { getQuote, hasQuoteProvider } from '../services/marketData';
import { refreshAssetPrices, applyPricePatches } from '../services/priceRefresh';
import { DividendPanel } from './investments/DividendPanel';
import { formatCAD, formatDate } from '../utils/format';
import { ProjectionRequired } from './ui/ProjectionRequired';
import { logError } from '../services/errorLogger';
import { getRebalanceJustifications, type RebalanceActionInput } from '../services/claude';
import { AddStockForm } from './investments/AddStockForm';
import { showToast } from './ui/Toast';
import { ImportBrokerPositions } from './investments/ImportBrokerPositions';
import { computePurchaseStats } from '../utils/assetPurchases';
import { useFinanceStore } from '../store/useFinanceStore';
import { NetWorthByOwnerCard } from './investments/NetWorthByOwnerCard';
// [REFONTE-NAV-L2b] Comparaison multi-titres (ex-Accueil Phase D.4) — la modale vit
// désormais dans components/investments/, son seul consommateur restant est ici (+ l'ex-
// Dashboard jusqu'à sa suppression à l'intégration).
import { StockComparisonModal } from './investments/StockComparisonModal';
import { BrokerReconciliationCard } from './investments/BrokerReconciliationCard';
import { CeliAssetNudge } from './CeliAssetNudge';
import { PrivateAmount } from './ui/PrivateAmount';
import { ChartDataTable, type ChartDataColumn } from './ui/ChartDataTable';
import { MASKED_AMOUNT_LABEL } from '../utils/privacyAria';

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

// [Finding panel #496 — MOYEN] Couvre TOUTES les valeurs canoniques (CANONICAL_SECTORS/REGIONS) :
// « Crypto »/« Canada »/« Autre » sont désormais atteignables (résolution + auto-populate + selects)
// — sans couleur dédiée, leur segment tombait sur le gris de repli, indiscernable.
const COLORS_SECTOR: Record<string, string> = {
    "Technologie": "#5b82bf", // Blue
    "Industrie": "#c2974f", // Orange
    "Finance": "#4f9d86", // Green
    "Mines/Or": "#b8a45e", // Yellow
    "Index": "#8a7cc0", // Purple
    "Crypto": "#f97316",  // Orange vif
    "Autre": "#6b7280"
};

const COLORS_REGION: Record<string, string> = {
    "USA": "#5b82bf",
    "Canada": "#ef8fa0",
    "Europe": "#4f9d86",
    "Asie": "#ef4444",
    "Global": "#8a7cc0",
    "Ameriques": "#c2974f",
    "Autre": "#6b7280"
};

type TimeRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';

interface AllocationItem {
    id: string;
    value: number;
    /** Performance % de PRIX NATIF sur la période choisie ; null = pas d'historique (« — »). */
    trendPct: number | null;
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
    /** Variation % sur la période choisie ; null = pas de baseline dans la fenêtre (« — »). */
    trend: number | null;
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

    // [A11Y-CHARTS] tables de données sr-only pour les donuts d'allocation (Recharts opaque aux
    // lecteurs d'écran). Classe d'actif + % visibles ; Valeur $ masquée en mode privé (parité PrivateAmount).
    const isPrivacyMode = useFinanceStore(s => s.isPrivacyMode);
    const allocationColumns: ChartDataColumn[] = [
        { key: 'name', label: "Classe d'actif" },
        { key: 'value', label: 'Valeur', format: (v) => isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(Number(v) || 0) },
        { key: 'percent', label: 'Part', format: (v) => `${(Number(v) || 0).toFixed(1)}%` },
    ];

    const [marketData, setMarketData] = useState<MarketDataPoint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [timeRange, setTimeRange] = useState<TimeRange>('1Y');
    // [INVEST-PERF-PERIOD] Période des variations/performances affichées (demande Marc 2026-07-23 :
    // « la performance actuellement c'est 24h mais je veux pouvoir choisir moi »). Pilote la carte
    // Performance, les chips du graphe et les cartes par titre. Le score de santé reste FIXÉ sur 24h
    // (momentum court terme — indépendant du sélecteur, sinon le badge header changerait avec la vue).
    const [perfPeriod, setPerfPeriod] = useState<PerfPeriod>('24H');
    // Phase E.3 — sous-onglets pour aérer la page (doc directives §4)
    // PH4-INV-4 — « moins de pages » : Rééquilibrage fusionné dans Allocation (4 → 3 sous-onglets).
    const [subTab, setSubTab] = useState<'overview' | 'allocation' | 'detail'>('overview');
    // Phase E.6 — filtre interactif Geo/Sector cliqué dans la pie
    const [allocationFilter, setAllocationFilter] = useState<{ type: 'region' | 'sector'; value: string } | null>(null);

    // Wiring 2026-05: lecture de la projection vivante depuis le store.
    const lastProjection = useFinanceStore(s => s.lastProjection);
    const navigateWithFocus = useFinanceStore(s => s.navigateWithFocus);
    // [ASSET-FX-DISPLAY] prix des actifs en devise NATIVE → conversion CAD pour toute valeur affichée.
    const fxRates = useFinanceStore(s => s.fxRates);
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
    // [REFONTE-NAV-L2b] Comparaison multi-titres (ex-Accueil Phase D.4) : mode sélection dans le
    // sous-onglet Détail. « Comparer » arme le mode → cases à cocher sur les cartes → « Voir
    // courbe » (1 titre) / « Comparer (N) » (2+) ouvre la modale superposée (base 100).
    // Mode EXPLICITE (≠ Accueil où les cases étaient permanentes) : les cartes Détail portent déjà
    // selects/suppression — des cases permanentes ajouteraient une cible cliquable de plus partout.
    const [isCompareMode, setIsCompareMode] = useState(false);
    const [selectedCompareSymbols, setSelectedCompareSymbols] = useState<Set<string>>(new Set());
    const [showComparisonModal, setShowComparisonModal] = useState(false);
    const toggleCompareSymbol = (symbol: string) => {
        setSelectedCompareSymbols(prev => {
            const next = new Set(prev);
            if (next.has(symbol)) next.delete(symbol); else next.add(symbol);
            return next;
        });
    };
    const exitCompareMode = () => {
        setIsCompareMode(false);
        setSelectedCompareSymbols(new Set());
    };
    // [INV-COMPARE-SUBTAB] Le mode comparaison est une UI du sous-onglet Détail : en sortir le
    // désarme. Sinon l'état survivrait en SILENCE (cases cochées invisibles depuis Overview/
    // Allocation) et « Détail » rouvrirait un mode que l'utilisateur croyait quitté.
    useEffect(() => {
        if (subTab === 'detail') return;
        setIsCompareMode(false);
        setSelectedCompareSymbols(new Set());
    }, [subTab]);

    // --- INSTANT DATA LOAD ---
    // Sprint 3B M3 + test-mode-complet : utilise usePortfolioHistory hook qui
    // retourne le marketData synthétique en mode test (depuis testFixtures)
    // ou le CSV externe sinon.
    const { history: portfolioHistory, noHistorySymbols, partialHistorySymbols, staleTailSymbols, syntheticTailKeys } = usePortfolioHistory();
    // [PERF-STALE-TAIL-ZERO] Prédicat pour seriesReturnPct : une valeur (date, clé) est-elle raccordée
    // au prix courant (candles KO) ? Deux endpoints synthétiques → « — » plutôt qu'un 0 % trompeur.
    const isSyntheticValue = useCallback(
        (date: string, key: string) => syntheticTailKeys.has(JSON.stringify([date, key])),
        [syntheticTailKeys],
    );
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setIsLoading(true);
            const data = portfolioHistory;
            if (cancelled) return;
            setMarketData(data);

            if (data.length > 0) {
                // [panel 2026-07-22] UNION des clés (les lignes réelles sont ÉPARSES — la ligne 0
                // ne porte pas les buckets nuls à cette date ni les actifs achetés plus tard).
                const allKeys = new Set<string>();
                data.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));
                // Sélection par défaut : le TOTAL portefeuille + les totaux par compte.
                const keysToSelect = [...allKeys].filter(k => k.includes('TOTAL'));
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
        diversificationScore,
        portfolioTrend,
        benchmarkTrend,
    } = useMemo(() => {
        // PH4-INV-2 — SOURCE DE VÉRITÉ de l'allocation = le portefeuille `assets` saisi (qty × prix
        // courant), PAS le CSV historique (Google Sheet déprécié) qui divergeait du portefeuille réel
        // (bug Marc : allocation fausse dès qu'un CSV existait). Le CSV ne sert plus qu'aux SÉRIES
        // temporelles (tendances sur la période choisie, benchmark, score de santé) quand il est présent.

        // (a) Dernières valeurs par colonne du CSV (si présent) — pour l'EXISTENCE des séries.
        // [INVEST-PERF-PERIOD] La tendance elle-même vient de seriesReturnPct (période au choix),
        // plus du couple latest/prev « 2 dernières lignes » (qui était figé 24h).
        const latestValues: Record<string, number> = {};
        if (marketData.length > 0) {
            const allKeys = new Set<string>();
            marketData.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));
            const cleanKeys = Array.from(allKeys).filter(k =>
                k !== 'date' && k !== 'Date' && !k.startsWith('Taux') && k.trim() !== '' && k !== '1' && k.toLowerCase() !== 'colonne 1' && k !== 'Unnamed: 1',
            );
            cleanKeys.forEach(k => {
                for (let i = marketData.length - 1; i >= 0; i--) {
                    const val = Number(marketData[i][k]);
                    if (val > 0) { latestValues[k] = val; break; }
                }
            });
        }

        // (b) Séries + tendances (depuis le CSV). Vide s'il n'y a pas de CSV.
        // [panel 2026-07-22] `isTotal` = STRICTEMENT la clé 'TOTAL' : l'ancien `includes('TOTAL')`
        // flaggait AUSSI les buckets TOTAL_CELI/TOTAL_REER/… → 4-5 chips toutes étiquetées « TOTAL
        // PORTEFEUILLE » et le KPI « Votre Portefeuille (24h) » pouvait lire la tendance d'un
        // bucket (comparateur de tri inconsistant quand plusieurs isTotal). Chaque bucket garde
        // désormais son propre libellé.
        const BUCKET_LABELS: Record<string, string> = {
            TOTAL_CELI: 'CELI (total)', TOTAL_REER: 'REER (total)',
            'TOTAL_NON-ENREG': 'Non-enregistré (total)', TOTAL_CRYPTO: 'Crypto (total)',
        };
        const availableSeriesWithTrend = Object.keys(latestValues).map(k => {
            const current = latestValues[k] || 0;
            if (current === 0) return null;
            // [INVEST-PERF-PERIOD] Variation de VALEUR de la série sur la période choisie ;
            // null (« — ») quand la série est plus récente que la période (no-fake-data).
            const trend = seriesReturnPct(marketData, k, perfPeriod, isSyntheticValue);
            const isTotal = k === 'TOTAL';
            const meta = lookupSeedMeta(k) || { name: k.replace('NASDAQ:', '').replace('NYSE:', '') };
            const name = isTotal ? 'TOTAL PORTEFEUILLE' : (BUCKET_LABELS[k] ?? meta.name);
            return { id: k, name, trend, isTotal };
        }).filter((x): x is SeriesWithTrend => x !== null).sort((a, b) => {
            if (a.isTotal !== b.isTotal) return a.isTotal ? -1 : 1;
            // « — » (null) en queue — sans soustraction d'Infinity (deux null → NaN, comparateur
            // hors-spec ; finding FAIBLE panel #498).
            if (a.trend === null && b.trend === null) return 0;
            if (a.trend === null) return 1;
            if (b.trend === null) return -1;
            return b.trend - a.trend;
        });
        const totalSerie = availableSeriesWithTrend.find(s => s.isTotal);
        // [PORTFOLIO-HISTORY / no-fake-data] null = « pas de donnée » (affiché « — »), jamais un
        // +0.00% présenté comme mesuré quand l'historique manque (finding scout 2026-07-22).
        const portfolioTrend = totalSerie?.trend ?? null;
        // [INVEST-PERF-PERIOD] Benchmark = performance de PRIX NATIF du titre CW8/MSCI World détenu
        // (insensible aux ACHATS — une série en valeur gonflerait le « marché » de chaque apport).
        // Matching STRICT via isBenchmarkCandidate (finding ÉLEVÉ panel #498 : `includes('MSCI')`
        // nu matchait « Amundi MSCI Em Asia » → mauvais titre affiché comme benchmark mondial).
        // Repli série CSV (sémantique VALEUR) restreint à 24H : au-delà, la valeur diverge du prix
        // à chaque apport → « — » honnête plutôt qu'un chiffre à sémantique différente sous le
        // même libellé (finding MOYEN panel #498).
        const benchAsset = assets.find(a => isBenchmarkCandidate(a.symbol, a.name));
        const cw8Serie = availableSeriesWithTrend.find(s => isBenchmarkCandidate(s.id, s.name));
        const benchmarkTrend = priceReturnPct(benchAsset?.priceHistory, perfPeriod)
            ?? (perfPeriod === '24H' ? cw8Serie?.trend ?? null : null);

        // (c) ALLOCATION = portefeuille réel (assets). trendPct = performance de PRIX NATIF du titre
        // sur la période choisie ([INVEST-PERF-PERIOD] — insensible aux achats, règle ASSET-FX « les
        // % sont des ratios natifs ») ; l'ancien calcul lisait 2 lignes du CSV (valeur, figé 24h).
        const FREQ_MAP: Record<string, number> = { Monthly: 12, Quarterly: 4, Yearly: 1 };
        const allocation = assets.map(a => {
            // [ASSET-FX-DISPLAY] valeur en CAD (prix natif × FX) — l'ancien qty×prix brut mélangeait
            // USD/EUR/CAD (portefeuille sous-affiché de ~70 k$, incident Marc 2026-07-14).
            const value = assetValueCad(a, fxRates);
            // [INVEST-ALLOC-GEO-SECTOR] Résolution PARTAGÉE (champ persisté > seed normalisé
            // préfixe↔suffixe > crypto > Autre) — l'ancien lookup statique `ASSET_META[a.symbol]`
            // ratait même les titres du seed (clés « EPA:CW8 » vs symboles réels « CW8.PA »)
            // → donuts « tout en Autre » (bug Marc).
            const { source: _metaSource, ...meta } = resolveAssetMeta(a);
            void _metaSource; // la provenance ne fait pas partie d'AllocationItem (affichage seul)
            const trendPct = priceReturnPct(a.priceHistory, perfPeriod);
            // PH4-INV-3 — dividendes : priorité au rendement/fréquence SAISIS sur l'Asset (réels du
            // titre) sur l'estimation de la table statique ASSET_META.
            const effYield = a.dividendYield != null && a.dividendYield > 0 ? a.dividendYield : meta.yield;
            const effFreq = a.dividendFreq ? (FREQ_MAP[a.dividendFreq] ?? meta.freq) : meta.freq;
            return { id: a.symbol, value, trendPct, weight: 0, ...meta, yield: effYield, freq: effFreq, dividendYearly: value * (effYield / 100) };
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
        // [INVEST-PERF-PERIOD] Le momentum du score reste FIXÉ sur 24h (indépendant du sélecteur
        // d'affichage — sinon le badge « Diversification » du header changerait selon la période
        // regardée, un score instable pour la même réalité). Momentum NEUTRE (ni bonus ni malus)
        // quand l'historique manque (trend null) — pas de donnée ≠ performance nulle.
        const portfolioTrend24 = seriesReturnPct(marketData, 'TOTAL', '24H');
        const benchmarkTrend24 = priceReturnPct(benchAsset?.priceHistory, '24H')
            ?? (cw8Serie ? seriesReturnPct(marketData, cw8Serie.id, '24H') : null);
        const pt = portfolioTrend24 ?? 0;
        const bt = benchmarkTrend24 ?? 0;
        if (portfolioTrend24 !== null && pt > bt && pt > 0) trendPts += 20;
        else if (portfolioTrend24 !== null && pt > 0) trendPts += 10;
        else if (portfolioTrend24 !== null && pt < 0) trendPts -= 10;
        if (trendPts > 40) trendPts = 40;
        if (trendPts < 0) trendPts = 0;
        const diversificationScore = Math.round(safePts + trendPts);

        return {
            currentAllocation: allocation,
            geoBreakdown: geoData,
            sectorBreakdown: sectorData,
            dividendCalendar: sortedDividends,
            totalAnnualDividends: totalDivs,
            availableSeriesWithTrend,
            diversificationScore,
            portfolioTrend,
            benchmarkTrend,
        };
    }, [marketData, assets, fxRates, perfPeriod, isSyntheticValue]); // perfPeriod : leçon BUDGET-MONTH-NAV (dep manquante = memo figé)

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

    // [PRICE-REFRESH-LIVE] — actualise les currentPrice via les quotes live (séquentiel provider-aware).
    // HONNÊTE sur la couverture : les symboles non quotables (forfait Finnhub, titres manuels/GIC)
    // sont listés dans le toast au lieu d'être silencieusement laissés périmés. Fusion par symbole
    // sur l'état FRAIS du store (anti-course avec un pull Drive pendant le refresh).
    const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
    const lastPriceRefreshAt = useMemo(() => {
        const stamps = assets.map(a => a.priceUpdatedAt || 0).filter(t => t > 0);
        return stamps.length > 0 ? Math.max(...stamps) : null;
    }, [assets]);
    const handleRefreshPrices = async () => {
        // Garde MODE TEST (finding panel) : ne jamais écraser les prix de fixtures persona (CoinGecko
        // répond même sans clé → un clic corromprait l'état déterministe du persona).
        if (useFinanceStore.getState().isTestMode === true) {
            showToast('Actualisation désactivée en mode test (prix des fixtures conservés).', 'info');
            return;
        }
        setIsRefreshingPrices(true);
        try {
            // [HIST-MULTI-PROVIDER] Le geste couvre aussi les HISTORIQUES : purge du cache
            // 'history' du jour (un « vide » caché 24 h bloquerait le nouvel essai) + hydratation
            // FORCÉE (variantes de suffixe incluses) + publication du diagnostic par titre.
            // AVANT le refresh des quotes : une variante résolue ici sert immédiatement aux quotes.
            // [Finding silent-failure #494 — ÉLEVÉ] L'échec de CETTE moitié du geste doit remonter
            // au TOAST final : sinon « N cours mis à jour » (vert) masque un resync d'historique
            // raté — le cœur même du bouton.
            let historySyncFailed = false;
            try {
                const { clearMarketDataCache, clearNegativeCache, getHistory, hasHistoryProvider } = await import('../services/marketData');
                const { hydrateAssetHistories, applyHistoryPatches } = await import('../services/history/hydrateAssetHistories');
                const { setHistorySyncReport } = await import('../services/history/syncDiagnostics');
                clearMarketDataCache('history');
                // [QUOTE-NEGATIVE-CACHE] Geste EXPLICITE = repartir de zéro : les skips négatifs
                // (quotes/profils) sautent aussi — un titre corrigé/nouvellement couvert ré-essaie
                // immédiatement au lieu d'attendre l'expiration du TTL.
                clearNegativeCache();
                const current = useFinanceStore.getState().assets ?? [];
                const histRes = await hydrateAssetHistories(current, { getHistory, hasProvider: hasHistoryProvider }, { force: true });
                setHistorySyncReport({ at: Date.now(), skipped: histRes.skipped, patchedCount: histRes.patches.size });
                if (histRes.patches.size > 0) {
                    const freshAssets = useFinanceStore.getState().assets ?? [];
                    setAssets(applyHistoryPatches(freshAssets, histRes.patches));
                }
            } catch (e) {
                // L'échec de l'hydratation ne bloque PAS le refresh des quotes (indépendants),
                // mais il est TRACÉ en erreur et DIT dans le toast final (jamais avalé).
                historySyncFailed = true;
                logError({ source: 'network', severity: 'error', message: 'Resynchronisation des historiques échouée (les quotes sont quand même actualisées).', error: e });
            }
            // force:true = geste explicite (le gate 5 min du service ne s'applique pas au bouton ;
            // le cache quote 5 min absorbe de toute façon les re-clics rapprochés côté réseau).
            // État FRAIS du store (pas la capture du render) : un historySymbol résolu par
            // l'hydratation ci-dessus sert immédiatement de symbole de cotation.
            const res = await refreshAssetPrices(useFinanceStore.getState().assets ?? [], { getQuote, hasProvider: hasQuoteProvider }, { force: true });
            if (res.patches.size > 0) {
                const fresh = useFinanceStore.getState().assets ?? [];
                setAssets(applyPricePatches(fresh, res.patches));
            }
            // [PRICE-SYNC-REPORT] Skips de quotes publiés au doctor ([] efface les périmés).
            const { updateQuoteSkips } = await import('../services/history/syncDiagnostics');
            updateQuoteSkips(res.skipped);
            const uncovered = res.skipped.filter(s => s.reason === 'no-quote' || s.reason === 'invalid-price' || s.reason === 'error');
            const mismatched = res.skipped.filter(s => s.reason === 'currency-mismatch');
            if (res.refreshed.length + res.unchanged.length + uncovered.length + mismatched.length === 0) {
                showToast('Aucun titre valorisé à actualiser.', 'info');
            } else {
                const parts: string[] = [`${res.refreshed.length} cours mis à jour`];
                if (res.unchanged.length > 0) parts.push(`${res.unchanged.length} déjà à jour`);
                if (uncovered.length > 0) parts.push(`${uncovered.length} sans cours disponible (${uncovered.map(s => s.symbol).slice(0, 4).join(', ')}${uncovered.length > 4 ? '…' : ''}) — introuvable chez Finnhub/Yahoo : fixe le symbole de cotation dans le diagnostic sous le graphe`);
                if (mismatched.length > 0) parts.push(`${mismatched.length} ignoré(s) : devise du quote ≠ devise stockée (${mismatched.map(s => s.symbol).join(', ')})`);
                if (historySyncFailed) parts.push('historiques de cours NON resynchronisés (échec inattendu) — réessaie dans un instant');
                showToast(parts.join(' · '), historySyncFailed ? 'error' : (uncovered.length + mismatched.length > 0 ? 'info' : 'success'));
            }
        } catch (e) {
            // [PRICE-SYNC-REPORT] Échec TOTAL du refresh : on GARDE les quoteSkips précédents du
            // doctor (décision, finding #520) — ils restent VRAIS (ces titres n'ont toujours pas de
            // prix frais) ; fabriquer un [] « tout va bien » serait pire. L'échec global, lui, est
            // porté par le toast + logError.
            logError({ source: 'network', severity: 'warning', message: 'Actualisation des cours échouée (prix existants conservés)', error: e });
            showToast('Actualisation des cours impossible (réseau/fournisseur). Prix existants conservés.', 'error');
        } finally {
            setIsRefreshingPrices(false);
        }
    };

    // [HIST-MULTI-PROVIDER] Fixe le symbole de COTATION d'un actif (saisie utilisateur ou
    // suggestion de recherche) : purge l'historique du titre (un historique fusionné d'un MAUVAIS
    // titre ne doit pas survivre à la correction — même classe que le scénario « variante d'un
    // autre titre » du panel #493) puis relance la resynchronisation complète.
    const handleApplyQuoteSymbol = async (assetSymbol: string, quoteSymbol: string) => {
        const trimmed = quoteSymbol.trim();
        if (!trimmed) return;
        const current = useFinanceStore.getState().assets ?? [];
        const next = current.map((a) => a.symbol === assetSymbol
            ? { ...a, historySymbol: trimmed === a.symbol ? undefined : trimmed, priceHistory: [], lastHistorySync: undefined }
            : a);
        setAssets(next);
        // [Finding silent-failure #494] AWAIT (pas fire-and-forget) : la purge du priceHistory est
        // optimiste — le resync doit aboutir (ou son échec être dit par le toast/rapport) avant que
        // le geste soit considéré terminé.
        await handleRefreshPrices(); // recharge historique (cache purgé + force) + quotes
    };

    // [INVEST-ALLOC-GEO-SECTOR] Édition inline région/secteur : appliquée à TOUS les actifs du
    // symbole (même titre en 2 comptes = même secteur/région — jamais deux classifications).
    const handleAssetMetaChange = (symbolKey: string, field: 'sector' | 'region', value: string) => {
        const next = assets.map((a) => historyKeyMatchesSymbol(symbolKey, a.symbol) ? { ...a, [field]: value } : a);
        setAssets(next);
    };

    const handleAssetAccountChange = (symbolKey: string, newAccount: string) => {
        // Matching EXACT (l'id d'allocation EST le symbole) — `includes` faisait matcher « VFV.TO »
        // avec l'actif « V » (Visa) selon l'ordre du tableau → mauvais actif modifié/supprimé.
        const assetIdx = assets.findIndex(a => historyKeyMatchesSymbol(symbolKey, a.symbol));
        if (assetIdx >= 0) {
            const newAssets = [...assets];
            newAssets[assetIdx] = { ...newAssets[assetIdx], accountType: newAccount as RegisteredAccountType };
            setAssets(newAssets);
        }
    };

    // Retire une position du portefeuille (le symbolKey est l'id d'allocation, qui contient le symbole).
    const handleDeleteAsset = (symbolKey: string) => {
        const target = assets.find(a => historyKeyMatchesSymbol(symbolKey, a.symbol));
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
                        variant={diversificationScore >= 80 ? 'success' : diversificationScore >= 50 ? 'warning' : 'danger'}
                        size="md"
                        title="Sous-mesure : diversification du portefeuille + tendance vs marché (le score de santé financière GLOBAL est sur l'Accueil)"
                    >
                        Diversification {diversificationScore}/100
                    </Badge>
                }
            />

            {/* [CELI-ASSET-NUDGE] virements CELI détectés mais aucun avoir CELI saisi → CELI affiché 0. */}
            <CeliAssetNudge onAddAsset={() => setShowAddStockForm(true)} />

            {/* CI-1000x Phase 1 (axe B) — répartition du portefeuille par personne (mode couple). */}
            <NetWorthByOwnerCard assets={assets} setAssets={setAssets} />

            {/* [FINTABLE-6 Lot 2] Le total du COURTIER fait autorité (demande Marc) : solde Fintable
                par panier fiscal + écart explicite avec les titres saisis + fraîcheur. Ship dark
                tant que la sync Fintable n'a jamais tourné. */}
            <BrokerReconciliationCard variant="full" />

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
                Reste la performance (portefeuille vs marché), non affichée ailleurs.
                [INVEST-PERF-PERIOD] Période AU CHOIX (24h par défaut) — pilote aussi les chips du
                graphe et les cartes par titre. */}
            <Card
                title={`Performance (${PERF_PERIOD_LABELS[perfPeriod]})`}
                action={
                    <Pill
                        aria-label="Période de performance"
                        size="sm"
                        value={perfPeriod}
                        onChange={(v) => setPerfPeriod(v as PerfPeriod)}
                        options={PERF_PERIODS.map(p => ({ value: p, label: PERF_PERIOD_LABELS[p] }))}
                    />
                }
            >
                <div className="grid grid-cols-2 gap-4">
                    <div className="card-subtle p-4 flex flex-col items-center justify-center">
                        <div className="kpi-label mb-1">Votre Portefeuille</div>
                        <div className={`text-kpi tabular-nums ${portfolioTrend === null ? 'text-ink-400' : portfolioTrend >= 0 ? 'text-success-400' : 'text-danger-400'}`}>
                            {portfolioTrend === null ? '—' : `${portfolioTrend > 0 ? '+' : ''}${portfolioTrend.toFixed(2)}%`}
                        </div>
                    </div>
                    <div className="card-subtle p-4 flex flex-col items-center justify-center">
                        <div className="kpi-label mb-1">Marché (CW8 / MSCI)</div>
                        <div className={`text-kpi tabular-nums ${benchmarkTrend === null ? 'text-ink-400' : benchmarkTrend >= 0 ? 'text-info-400' : 'text-danger-400'}`}>
                            {benchmarkTrend === null ? '—' : `${benchmarkTrend > 0 ? '+' : ''}${benchmarkTrend.toFixed(2)}%`}
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
                {/* [INVEST-CHART-CLEAN] Ligne « N points · période » retirée (demande Marc : moins
                    de texte autour du graphe — la période est déjà dans la pill globale). */}
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
                                    : 'bg-[#1a1a1a] text-ink-400 border-white/5 hover:border-white/10 hover:text-ink-200'
                                    }`}
                            >
                                <div className="flex items-center gap-1">
                                    <span className={`w-1.5 h-1.5 rounded-full ${isActive ? (asset.isTotal ? 'bg-green-400' : 'bg-info-400') : 'bg-white/10'}`}></span>
                                    {asset.name}
                                </div>
                                {asset.trend !== null && Math.abs(asset.trend) > 0.5 && (
                                    <span className={`text-tiny ${asset.trend > 0 ? 'text-green-500' : 'text-danger-500'}`}>
                                        {asset.trend > 0 ? '↗' : '↘'}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* [INVEST-CHART-CLEAN] 400 → 520 px : le graphe est la pièce maîtresse de la page. */}
                <div style={{ width: '100%', height: '520px' }}>
                    {isLoading ? (
                        <div className="w-full h-full flex flex-col gap-4">
                            <Skeleton variant="chart" className="!h-auto flex-1" />
                            <Skeleton variant="text" className="w-3/4 mx-auto !h-8" />
                        </div>
                    ) : filteredMarketData.length > 0 ? (
                        <StockChart
                            data={filteredMarketData}
                            visibleKeys={selectedKeys}
                            isPrivacyMode={isPrivacyMode}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-ink-400 bg-white/5 rounded-xl">
                            Aucune donnée disponible pour cette période.
                        </div>
                    )}
                </div>
                {/* [HIST-COVERAGE-TOTAL] Même signalement honnête que le Dashboard (composant
                    partagé) : c'est ICI que Marc lit la courbe TOTAL. */}
                <HistoryCoverageNote noHistorySymbols={noHistorySymbols} partialHistorySymbols={partialHistorySymbols}
                    staleTailSymbols={staleTailSymbols} hasChart={portfolioHistory.length > 0} />
                {/* [HIST-MULTI-PROVIDER] Diagnostic par titre + remède inline (symbole de cotation,
                    recherche par nom). Jamais rendu en mode test (tickers réels). */}
                <HistorySyncDoctor onApplyQuoteSymbol={handleApplyQuoteSymbol} isSyncing={isRefreshingPrices} />
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
                            <div className="flex-1 w-full h-[200px]" role="img" aria-label="Donut de répartition géographique du portefeuille">
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
                                        <ReTooltip contentStyle={{ backgroundColor: '#fff', color: '#000', borderRadius: '8px', border: 'none' }} itemStyle={{ color: '#000' }} formatter={(val: number) => isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(val)} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <ChartDataTable
                                caption="Répartition géographique du portefeuille"
                                columns={allocationColumns}
                                rows={geoBreakdown}
                            />
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
                                                <PrivateAmount as="div" className="text-white font-bold">{formatCAD(item.value)}</PrivateAmount>
                                                <div className="text-tiny text-ink-400">{item.percent.toFixed(1)}%</div>
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
                            <div className="flex-1 w-full h-[200px]" role="img" aria-label="Donut de répartition sectorielle du portefeuille">
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
                                        <ReTooltip contentStyle={{ backgroundColor: '#fff', color: '#000', borderRadius: '8px', border: 'none' }} itemStyle={{ color: '#000' }} formatter={(val: number) => isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(val)} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <ChartDataTable
                                caption="Répartition sectorielle du portefeuille"
                                columns={allocationColumns}
                                rows={sectorBreakdown}
                            />
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
                                                <PrivateAmount as="div" className="text-white font-bold">{formatCAD(item.value)}</PrivateAmount>
                                                <div className="text-tiny text-ink-400">{item.percent.toFixed(1)}%</div>
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
                                        <div className={`text-tiny font-mono ${a.trendPct === null ? 'text-ink-400' : a.trendPct >= 0 ? 'text-success-400' : 'text-danger-400'}`}>
                                            {a.trendPct === null ? '—' : `${a.trendPct >= 0 ? '+' : ''}${a.trendPct.toFixed(2)}%`} ({PERF_PERIOD_LABELS[perfPeriod]})
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
                                                <div className="text-tiny text-ink-400 flex items-center gap-2 mt-1">
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
                                                    → Vendre <PrivateAmount>{formatCAD(Math.round(Math.abs(item.diffAmount)))}</PrivateAmount>
                                                </div>
                                            )}
                                            {!isRebalanceEdit && item.action === 'BUY' && (
                                                <div className="text-green-400 font-bold text-body">
                                                    → Acheter <PrivateAmount>{formatCAD(Math.round(Math.abs(item.diffAmount)))}</PrivateAmount>
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
                                            <span><b>Vendre</b> <PrivateAmount>{formatCAD(Math.round(Math.abs(a.diffAmount)))}</PrivateAmount> de <b>{a.label}</b> (surplus {a.diffPct.toFixed(1)}%) — Utilisez votre compte Non-Enregistré en priorité pour optimiser la fiscalité.</span>
                                        </div>
                                    ))}
                                    {rebalancingActions.filter(a => a.action === 'BUY').map((a, i) => (
                                        <div key={i} className="text-meta text-green-300 flex items-start gap-2">
                                            <span className="w-2 h-2 rounded-full bg-success-500 mt-1.5 shrink-0" aria-hidden="true" />
                                            <span><b>Acheter</b> <PrivateAmount>{formatCAD(Math.round(Math.abs(a.diffAmount)))}</PrivateAmount> de <b>{a.label}</b> (déficit {Math.abs(a.diffPct).toFixed(1)}%) — Priorisez votre CELI si vous avez de l'espace disponible.</span>
                                        </div>
                                    ))}
                                    <div className="text-meta text-ink-400 mt-3 pt-3 border-t border-white/5 italic">
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
                {/* Phase E.9 — bouton d'ajout manuel d'action · [PRICE-REFRESH-LIVE] actualisation des cours */}
                <div className="flex justify-end items-center gap-2 flex-wrap">
                    {lastPriceRefreshAt != null && (
                        <span className="text-tiny text-ink-400 mr-auto">
                            {/* formatDate (fr-CA, NaN→—) + heure, même patron qu'AutoBackupPanel. */}
                            Cours au {formatDate(lastPriceRefreshAt)} {new Date(lastPriceRefreshAt).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={handleRefreshPrices}
                        disabled={isRefreshingPrices}
                        aria-busy={isRefreshingPrices}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/40 text-ink-200 text-tiny font-bold rounded-card transition-colors focus-ring disabled:opacity-50"
                    >
                        {isRefreshingPrices ? 'Actualisation…' : 'Actualiser les cours'}
                    </button>
                    {/* [REFONTE-NAV-L2b] Comparaison multi-titres (ex-Accueil).
                        [A11Y-COMPARE-FOCUS] UN SEUL bouton bascule PERSISTANT (libellé/action
                        changent, aria-pressed) : l'ancien ternaire démontait le bouton au toggle
                        → focus clavier perdu vers <body> (mesuré). Un élément qui persiste garde
                        le focus PAR CONSTRUCTION — pas de restauration manuelle à maintenir. */}
                    {isCompareMode && (
                        selectedCompareSymbols.size > 0 ? (
                            <button
                                type="button"
                                onClick={() => setShowComparisonModal(true)}
                                className="touch-target inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-primary/15 hover:bg-primary/25 border border-primary/40 text-primary text-tiny font-bold rounded-card transition-colors focus-ring"
                            >
                                <Icon name="chart" size={14} />{selectedCompareSymbols.size === 1 ? 'Voir courbe' : `Comparer (${selectedCompareSymbols.size})`}
                            </button>
                        ) : (
                            <span className="text-tiny text-ink-400 italic">Coche pour comparer</span>
                        )
                    )}
                    <button
                        type="button"
                        onClick={() => (isCompareMode ? exitCompareMode() : setIsCompareMode(true))}
                        aria-pressed={isCompareMode}
                        className="touch-target px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/40 text-ink-200 text-tiny font-bold rounded-card transition-colors focus-ring"
                    >
                        {isCompareMode ? 'Quitter la comparaison' : 'Comparer'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowImportBroker(true)}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/40 text-ink-200 text-tiny font-bold rounded-card transition-colors focus-ring"
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
                    // Try to find matching asset in props to get saved account type (matching EXACT)
                    const savedAsset = assets.find(a => historyKeyMatchesSymbol(asset.id, a.symbol));
                    const accountType = savedAsset?.accountType || 'NON-ENREG';
                    // Phase E.8 — stats DCA si purchases[] présent. ⚠️ Prix NATIF de l'actif (comme
                    // buyPrice/purchases[].price) — surtout PAS re-dérivé de asset.value, qui est
                    // désormais en CAD ([ASSET-FX-DISPLAY]) : mélanger CAD et natif fausserait le gain.
                    // (L'ancien `asset.value / quantity` était une identité du prix natif — plus maintenant.)
                    const purchaseStats = savedAsset ? computePurchaseStats(savedAsset) : null;
                    // [REFONTE-NAV-L2b] Sélection pour la comparaison superposée (mode « Comparer »).
                    const isCompareSelected = selectedCompareSymbols.has(asset.id);

                    return (
                        <div key={asset.id} className={`premium-card border p-5 rounded-2xl transition-all group relative overflow-hidden flex flex-col justify-between animate-premium-in shadow-xl ${
                            isCompareMode && isCompareSelected ? 'border-primary/40 bg-primary/10' : 'border-white/5 hover:border-white/20'
                        }`}>
                            {/* Background Gradient based on sector */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-white/10 to-transparent -mr-8 -mt-8 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

                            <div>
                                <div className="flex justify-between items-start mb-4 relative z-10">
                                    <div className="flex items-center gap-3">
                                        {/* [REFONTE-NAV-L2b] Case de sélection (mode Comparer uniquement) —
                                            même visuel que l'ex-Accueil, mais bouton DÉDIÉ : la carte porte
                                            déjà selects/suppression, un clic-carte serait ambigu. */}
                                        {isCompareMode && (
                                            // [A11Y-TOUCH] Surface tactile 44px (patron Planning.tsx :
                                            // .touch-target sur le bouton, visuel 16px DANS un span).
                                            // Marge négative : la zone cliquable déborde sans pousser
                                            // la mise en page de la carte.
                                            <button
                                                type="button"
                                                onClick={() => toggleCompareSymbol(asset.id)}
                                                aria-pressed={isCompareSelected}
                                                aria-label={`Comparer ${asset.name}`}
                                                className="touch-target -m-3 flex items-center justify-center shrink-0 focus-ring rounded"
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                                        isCompareSelected ? 'bg-primary border-primary' : 'border-white/20 hover:border-white/40'
                                                    }`}
                                                >
                                                    {isCompareSelected && <Icon name="check" size={11} className="text-dark" />}
                                                </span>
                                            </button>
                                        )}
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-meta font-bold text-white shadow-lg border border-white/10" style={{ backgroundColor: COLORS_SECTOR[asset.sector] || '#333' }}>
                                            {asset.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="font-bold text-white text-body leading-tight tracking-tight">{asset.name}</div>
                                            <div className="text-tiny text-ink-400 font-medium uppercase tracking-wider">{asset.region}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xl font-black text-white tracking-tight">{asset.weight.toFixed(1)}%</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-tiny mb-4 relative z-10">
                                    <div className="bg-white/[0.03] p-2.5 rounded-xl border border-white/5 backdrop-blur-sm">
                                        <div className="text-ink-400 mb-1 font-bold">Valeur</div>
                                        <PrivateAmount as="div" className="text-white font-mono font-bold text-meta">{formatCAD(asset.value)}</PrivateAmount>
                                    </div>
                                    <div className="bg-white/[0.03] p-2.5 rounded-xl border border-white/5 backdrop-blur-sm">
                                        <div className="text-ink-400 mb-1 font-bold">Variation {PERF_PERIOD_LABELS[perfPeriod]}</div>
                                        <div className={`font-bold text-meta ${asset.trendPct === null ? 'text-ink-400' : asset.trendPct >= 0 ? 'text-green-400' : 'text-danger-400'}`}>
                                            {asset.trendPct === null ? '—' : `${asset.trendPct > 0 ? '+' : ''}${asset.trendPct.toFixed(1)}%`}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-3 border-t border-white/5 relative z-10 mt-auto">
                                <div className="text-tiny text-ink-300 flex items-center gap-2">
                                    <span className="font-medium">Yield</span>
                                    <span className={asset.yield > 0 ? "text-success-400 font-bold" : "text-ink-400"}>{asset.yield}%</span>
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
                                    {/* [INVEST-ALLOC-GEO-SECTOR] Région/secteur éditables inline :
                                        tout titre est classable même quand aucun provider ne le
                                        connaît (les donuts n'ont plus d'impasse « Autre »). */}
                                    <select
                                        aria-label={`Région pour ${asset.id}`}
                                        value={asset.region}
                                        onChange={(e) => handleAssetMetaChange(asset.id, 'region', e.target.value)}
                                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-tiny text-ink-200 outline-none hover:bg-white/10 cursor-pointer transition-colors"
                                    >
                                        {CANONICAL_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                                        {!CANONICAL_REGIONS.includes(asset.region as never) && <option value={asset.region}>{asset.region}</option>}
                                    </select>
                                    <select
                                        aria-label={`Secteur pour ${asset.id}`}
                                        value={asset.sector}
                                        onChange={(e) => handleAssetMetaChange(asset.id, 'sector', e.target.value)}
                                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-tiny text-ink-200 outline-none hover:bg-white/10 cursor-pointer transition-colors"
                                    >
                                        {CANONICAL_SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
                                        {!CANONICAL_SECTORS.includes(asset.sector as never) && <option value={asset.sector}>{asset.sector}</option>}
                                    </select>
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
                                    <div className="text-tiny text-info-400 uppercase font-bold mb-1">DCA · {purchaseStats.purchaseCount} achats</div>
                                    <div className="space-y-0.5 text-tiny">
                                        {/* [ASSET-FX-DISPLAY] les stats DCA sont calculées en devise NATIVE
                                            (prix comparés entre eux) → conversion CAD à l'AFFICHAGE seulement,
                                            pour réconcilier avec la Valeur (CAD) de la même carte. Le % reste
                                            un ratio natif, exact tel quel. */}
                                        <div className="flex justify-between">
                                            <span className="text-ink-400">Coût moyen</span>
                                            <PrivateAmount className="font-mono text-ink-200">{formatCAD(purchaseStats.averageCost * toCurrencyFactor(fxRates, savedAsset?.currency || 'CAD'))}</PrivateAmount>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-ink-400">Gain total</span>
                                            <span className={`font-mono ${purchaseStats.totalGain >= 0 ? 'text-success-400' : 'text-danger-400'}`}>
                                                {purchaseStats.totalGain >= 0 ? '+' : ''}<PrivateAmount>{formatCAD(purchaseStats.totalGain * toCurrencyFactor(fxRates, savedAsset?.currency || 'CAD'))}</PrivateAmount> ({purchaseStats.gainPct.toFixed(1)}%)
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

            {/* [REFONTE-NAV-L2b] Modale de comparaison superposée (ex-Accueil Phase D.4) :
                1 titre → mode PRIX ; 2+ → base 100 (%) par défaut (toggle interne à StockChart). */}
            <StockComparisonModal
                symbols={Array.from(selectedCompareSymbols)}
                isOpen={showComparisonModal}
                onClose={() => setShowComparisonModal(false)}
                isPrivacyMode={isPrivacyMode}
            />

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
