import React, { useMemo, useState, useEffect, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
// Phase 7.A.1 — DashboardEvolutionChart lazy-load pour différer le chunk recharts (~445KB)
// hors du premier paint au boot (Dashboard = tab par défaut).
// PH1-a : via lazyWithRetry (c'était le SEUL React.lazy nu du codebase → seul chunk sans
// retry/reload sur hash périmé après deploy — l'erreur prod « Failed to fetch dynamically
// imported module DashboardEvolutionChart-[hash].js » venait de là).
import { lazyWithRetry } from '../utils/lazyWithRetry';
const DashboardEvolutionChart = lazyWithRetry(() => import('./dashboard/DashboardEvolutionChart'), 'DashboardEvolutionChart');
import { Transaction, Asset, BudgetCategory, RealEstateGoal, BudgetConfig, ChildGoal, TravelGoal, LifeEvent, RetirementGoal, Tab, Debt } from '../types';
import { Card } from './ui/Card';
import { PageHeader } from './ui/PageHeader';
import { ProjectionStaleBanner } from './ui/ProjectionStaleBanner';
import { Icon } from './ui/Icon';
import { KPIStat } from './ui/KPIStat';
import { StatGrid } from './ui/StatGrid';
import { Skeleton } from './ui/Skeleton';
import { MarketDataPoint } from '../services/finance';
import { usePortfolioHistory } from '../hooks/usePortfolioHistory';
import { historyKeyMatchesSymbol } from '../services/history/buildMarketData';
import { ASSET_META, lookupSeedMeta } from '../services/assetMeta';
import { useFinanceStore } from '../store/useFinanceStore';
import { StockComparisonModal } from './dashboard/StockComparisonModal';
import { BrokerReconciliationCard } from './investments/BrokerReconciliationCard';
import { HistoryCoverageNote } from './dashboard/HistoryCoverageNote';
import { Tab as TabEnum } from '../types';
import { formatCAD, formatPercent, formatSigned } from '../utils/format';
import { ProjectionRequired } from './ui/ProjectionRequired';
import { logError, logErrorThrottled } from '../services/errorLogger';
import { toCurrencyFactor, computePresentNetWorth, computeTotalDebt } from '../services/portfolio';
import { presentEquityOfGoal, monthsSince } from '../services/projection/pastPurchaseInit';
import { PrivateAmount } from './ui/PrivateAmount';
import { PrivateBlock } from './ui/PrivateBlock';

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
    onNavigate?: (tab: Tab) => void;
    isPrivacyMode?: boolean;
}

type TimeRange = '1M' | '3M' | 'YTD' | '1Y' | 'ALL' | 'CUSTOM';

const COLORS = ['#4f9d86', '#5b82bf', '#c2974f', '#9277bd', '#bd7d9c', '#5093a8', '#8ba85a', '#6f72c4'];

// ✅ FIX #6 : Utiliser ASSET_META centralisé au lieu d'une copie locale désynchronisée
const ASSET_YIELDS: Record<string, number> = {};
Object.entries(ASSET_META).forEach(([k, v]) => {
    ASSET_YIELDS[k] = v.yield;
});

export const Dashboard: React.FC<DashboardProps> = ({
    transactions, assets, initialBalances, realEstateGoals, childGoals: _childGoals = [], debts = [],
    lifeEvents: _lifeEvents = [], onNavigate, isPrivacyMode = false,
    config,
}) => {
    const { t } = useTranslation();
    const [marketData, setMarketData] = useState<MarketDataPoint[]>([]);
    const [timeRange, setTimeRange] = useState<TimeRange>('1M');
    const [customStart, setCustomStart] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
    const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);

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

    // [EP-3] Source unique : le KPI « Patrimoine projeté » lit le DERNIER point de
    // lastProjection.chartData (plus de formule ad-hoc). Sync garantie avec l'onglet Futur.
    const lastProjection = useFinanceStore(s => s.lastProjection);
    const navigateWithFocus = useFinanceStore(s => s.navigateWithFocus);
    // [ASSET-FX-DISPLAY] prix des actifs en devise NATIVE → conversion CAD pour toute valeur/gain affiché.
    const fxRates = useFinanceStore(s => s.fxRates);

    // [EP-3] KPI Futur dérivé en amont du rendu. no-silent-failure : typeof NaN === 'number'
    // est `true` → on EXIGE une valeur FINIE. Un dernier point présent mais NetWorth non fini =
    // projection corrompue (≠ absente) → hasValue=false (donc <ProjectionRequired>) + flag `corrupt`
    // pour logguer une fois (cas absent = repli muet légitime, on ne log pas).
    const futureKpi = useMemo(() => {
        const cd = lastProjection?.chartData;
        const last = cd && cd.length > 0 ? cd[cd.length - 1] : null;
        const nw = last ? last.NetWorth : null;
        const hasValue = typeof nw === 'number' && Number.isFinite(nw);
        const corrupt = last != null && typeof nw === 'number' && !Number.isFinite(nw);
        const horizonY = last ? Math.round((Number(last.monthIndex) || 0) / 12) : null;
        return { netWorth: hasValue ? (nw as number) : null, hasValue, horizonY, corrupt };
    }, [lastProjection]);

    useEffect(() => {
        if (futureKpi.corrupt) {
            logError({
                source: 'projection',
                severity: 'warning',
                message: 'Dashboard KPI Futur : dernier point chartData avec NetWorth non fini (projection corrompue)',
            });
        }
    }, [futureKpi.corrupt]);

    // Sprint 3B M3 — usePortfolioHistory hook avec cache singleton.
    // Avant : fetch redondant à chaque mount Dashboard (et chaque autre tab
    // qui en a besoin). Maintenant : un seul fetch global mis en cache pour
    // toute la session.
    const { history: portfolioHistory, noHistorySymbols, partialHistorySymbols, staleTailSymbols } = usePortfolioHistory();
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

    const { unifiedHistory, accountKeys, segmentedData, totalMonthlyPassive } = useMemo(() => {
        // Sans CSV historique : pas de graphe ni de listes segmentées — le KPI patrimoine, lui,
        // vient de `presentNetWorth` (source unique, ci-dessous) dans TOUS les cas.
        // [DASH-NETWORTH-CANONICAL] L'ancien `latestTotals.Total` (dernier point de l'historique,
        // consommé par le KPI) est RETIRÉ : le KPI ne lit plus jamais l'historique.
        if (marketData.length === 0) {
            return {
                unifiedHistory: [],
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
                // Matching EXACT (clé réelle = symbole ; legacy = préfixe place) — jamais includes :
                // « V » (Visa) matchait « VFV.TO » → mauvais type de compte (panel 2026-07-22).
                const mappedAsset = assets.find(a => historyKeyMatchesSymbol(k, a.symbol));

                // [Finding panel #496 — hors-diff, MÊME classe que INVEST-ALLOC-GEO-SECTOR]
                // ASSET_YIELDS était keyé BRUT (« EPA:CW8 ») et interrogé avec un symbole strippé
                // (« CW8 ») → 0 hit, revenu passif estimé toujours 0 même pour les titres du seed.
                // lookupSeedMeta normalise préfixe↔suffixe (même remède que les donuts).
                const estYield = ASSET_YIELDS[cleanSymbol] ?? lookupSeedMeta(cleanSymbol)?.yield ?? 0;
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
        // [Finding financial-integrity #544, MESURÉ] Amorcer TOUS les comptes connus à 0 (comme
        // `runningCash` plus haut) : un compte découvert via une TRANSACTION (accountName
        // Fintable/CSV absent d'initialBalances) laissait `rc[acc]` undefined sur les lignes
        // antérieures à sa 1re transaction → `total += undefined` = NaN → `point.Total` NaN sur ces
        // lignes → la « Variation » lisait `Number(NaN) || 0` = 0 et restait FIGÉE à 0,00 % en
        // permanence (mesuré : « Desjardins » → 0,00 % ; « Compte » → 18,18 % sur mêmes fixtures).
        cashAccountsList.forEach(acc => { if (rc[acc] === undefined) rc[acc] = 0; });

        // [DASH-IMMO-EQUITY-WRITERS] (décision Marc : BRANCHER) Équité par le helper PARTAGÉ avec
        // le moteur (mêmes conventions que chartData[0].Immobilier) : les champs explicites
        // currentValue/mortgageBalance priment s'ils existent, sinon reconstruction depuis
        // price/downPayment/amortissement — avant, le terme était INERTE (aucun écrivain UI).
        const currentRealEstateEquity = realEstateGoals.reduce(
            (sum, g) => sum + presentEquityOfGoal(g, monthsSince(g.purchaseDate)), 0);
        // [DASH-NW-DUP] source unique gardée NaN/Infinity (l'ancienne somme inline propageait un solde corrompu).
        const currentDebts = computeTotalDebt(debts);

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

            // [PORTFOLIO-HISTORY, panel 2026-07-22] Piles CELI/REER/NonReg/Crypto = buckets TOTAL_*
            // ÉMIS par le producteur (buildMarketData réel ET generateTestMarketData en portent) —
            // l'ancienne recomposition depuis les colonnes par-symbole lisait les clés de la LIGNE 0
            // (désormais ÉPARSE : un actif acheté après la 1re date en est absent) → tout actif non
            // mappé tombait en « NonReg » (mesuré : 45 k$ de BTC empilés sous NonReg, Crypto à 0),
            // et le matching par sous-chaîne mélangeait « V » (Visa) et « VFV.TO ».
            const invMap: Record<string, number> = {
                CELI: Number(row['TOTAL_CELI']) || 0,
                REER: Number(row['TOTAL_REER']) || 0,
                NonReg: Number(row['TOTAL_NON-ENREG']) || 0,
                Crypto: Number(row['TOTAL_CRYPTO']) || 0,
            };
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
            accountKeys: combinedKeys,
            segmentedData: { assets: indAssets, cash: cashList, credit: creditList },
            totalMonthlyPassive: passiveIncome
        };
    }, [marketData, assets, timeRange, customStart, customEnd, transactions, initialBalances, debts, realEstateGoals]);

    // [DASH-NW-DUP] pilote l'étiquette de périmètre du KPI patrimoine (la série historique inclut
    // l'équité immo — convention moteur — contrairement au NW « hors immo » des surfaces IA).
    // [DASH-IMMO-EQUITY-WRITERS F4] gate sur l'ÉQUITÉ réelle (≠ 0), pas sur un champ sans écrivain.
    const hasRealEstate = realEstateGoals.some(g => presentEquityOfGoal(g, monthsSince(g.purchaseDate)) !== 0);

    // [DASH-NETWORTH-CANONICAL] Le KPI « patrimoine global » = le PRÉSENT par la SOURCE UNIQUE
    // (`computePresentNetWorth` + équité immo — même expression que le repli sans CSV ci-dessus),
    // plus JAMAIS `latestTotals.Total` (dernier point de l'HISTORIQUE : figé au dernier close, cash
    // borné aux transactions ≤ dernière date et gated par accountName → les 4 symptômes « l'accueil
    // fait aucun sens » de Marc, diagnostic financial-integrity 2026-07-30). L'historique reste la
    // base du GRAPHE et de la variation — le présent et l'histoire sont deux choses ; le KPI dit le
    // présent, comme toutes les autres surfaces (App/TabRouter, PDF, snapshot IA, Investissements).
    const presentNetWorth = useMemo(() => {
        // [DASH-IMMO-EQUITY-WRITERS] même helper que le moteur — plus jamais un terme inerte.
        // Garde F4 : une valeur explicite NON FINIE est tracée (throttlé), jamais avalée en silence.
        const realEstateEquity = realEstateGoals.reduce((sum, g) => {
            if ((g.currentValue !== undefined && !Number.isFinite(g.currentValue))
                || (g.mortgageBalance !== undefined && !Number.isFinite(g.mortgageBalance))) {
                logErrorThrottled(`dash-immo-nonfinite-${g.id}`, {
                    source: 'ui', severity: 'warning',
                    message: 'Bien immobilier à valeur/hypothèque non numérique — ignoré du KPI',
                    context: { id: g.id, name: g.name },
                });
                return sum;
            }
            return sum + presentEquityOfGoal(g, monthsSince(g.purchaseDate));
        }, 0);
        return computePresentNetWorth(initialBalances, transactions, assets, fxRates, debts)
            + realEstateEquity;
    }, [initialBalances, transactions, assets, fxRates, debts, realEstateGoals]);

    const performance = useMemo(() => {
        if (unifiedHistory.length < 2) return { global: 0, diff: 0 };
        const start = Number(unifiedHistory[0].Total) || 0;
        const end = Number(unifiedHistory[unifiedHistory.length - 1].Total) || 0;
        const diff = end - start;
        const pct = start > 0 ? (diff / start) * 100 : 0;
        return { global: pct, diff };
    }, [unifiedHistory]);

    // D2 (activation) — « premier lancement » : tant qu'il n'y a AUCUNE donnée financière (ni
    // transaction, ni placement, ni solde initial), on affiche un accueil avec CTA plutôt que des
    // KPIs à 0 $ et des graphes vides qui ressemblent à un bug. Placé APRÈS tous les hooks.
    const hasNoFinancialData = transactions.length === 0 && assets.length === 0
        && !Object.values(initialBalances ?? {}).some((v) => Number(v) > 0);
    if (hasNoFinancialData) {
        return (
            <div className="space-y-6 animate-fade-in pb-10">
                <PageHeader
                    icon={<Icon name="dashboard" size={28} />}
                    title={t('dashboard.title', "Vue d'ensemble")}
                />
                <Card>
                    <div className="text-center py-12 px-4 space-y-4">
                        <Icon name="dashboard" size={44} className="text-ink-500 block mx-auto" />
                        <h2 className="text-h2 text-ink-50 font-bold">Tableau de bord vide</h2>
                        <p className="text-meta text-ink-400 max-w-sm mx-auto leading-snug">
                            Importe des transactions ou ajoute tes placements pour commencer.
                        </p>
                        <div className="flex flex-wrap gap-3 justify-center pt-2">
                            <button
                                type="button"
                                onClick={() => onNavigate?.(TabEnum.TRANSACTIONS)}
                                className="px-4 py-2 rounded-card bg-primary/15 border border-primary/40 text-primary text-meta font-bold hover:bg-primary/25 transition-colors focus-ring"
                            >
                                Importer des transactions
                            </button>
                            <button
                                type="button"
                                onClick={() => onNavigate?.(TabEnum.INVESTMENTS)}
                                className="px-4 py-2 rounded-card bg-white/5 border border-white/40 text-ink-200 text-meta font-bold hover:bg-white/10 transition-colors focus-ring"
                            >
                                Ajouter des placements
                            </button>
                        </div>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="pb-10">
            {/* stagger-in : entrée chorégraphiée des sections. La modale (position:fixed)
                reste HORS du conteneur staggé pour ne pas hériter du transform transitoire. */}
            <div className="space-y-6 stagger-in">

            <PageHeader
                icon={<Icon name="dashboard" size={28} />}
                title={t('dashboard.title', "Vue d'ensemble")}
            />
            {/* [PH2-c-2] — signal inter-onglets : dernier recalcul de projection échoué. */}
            <ProjectionStaleBanner />

            {/* Hero KPI strip — Phase D.8 : 5 KPIs incluant Active Income */}
            <StatGrid cols={5}>
                <KPIStat
                    label={t('dashboard.global_net_worth')}
                    icon={<Icon name="money" size={16} />}
                    value={formatCAD(presentNetWorth)}
                    // [DASH-NW-DUP] Étiquette de PÉRIMÈTRE : la série historique inclut l'équité
                    // immobilière (convention moteur/chartData), contrairement au NW « hors immo »
                    // des surfaces IA (computePresentNetWorth) — l'écart entre les deux est l'équité
                    // immo, ATTENDU (leçon NW-PARITY-INVARIANT). Sans étiquette, deux « patrimoines »
                    // différents à l'écran = la classe de confusion que Marc a déjà signalée.
                    sublabel={hasRealEstate ? 'Tous comptes, équité immo incluse' : t('dashboard.consolidated', 'Tous comptes')}
                    tooltip={hasRealEstate ? "Inclut l'équité immobilière (valeur − hypothèque). Les surfaces IA/MCP raisonnent hors immobilier — l'écart entre les deux est ton équité immo." : undefined}
                    privacy
                    variant="primary"
                />
                {/* [DASH-NETWORTH-CANONICAL, finding code-reviewer #544] La variation reste dérivée
                    de l'HISTORIQUE (graphe) alors que le KPI patrimoine dit désormais le PRÉSENT →
                    l'ÉTIQUETER, comme le voisin immo : sans ça, « X $ » et « +Z $ » adjacents ne sont
                    plus algébriquement cohérents et la classe « deux patrimoines à l'écran » revient. */}
                <KPIStat
                    label={`${t('dashboard.global_variation')} (${timeRange})`}
                    icon={<Icon name="investments" size={16} />}
                    value={formatPercent(performance.global)}
                    sublabel={`${formatSigned(performance.diff || 0, { withCurrency: true, decimals: 2 })} (courbe historique)`}
                    tooltip="Évolution de la courbe historique du graphe (dernier cours de clôture), pas du patrimoine présent affiché à gauche — les deux peuvent différer légèrement."
                    privacy
                    variant={performance.global >= 0 ? 'success' : 'danger'}
                />
                {/* Phase D.8 — Active Income (salaire net mensuel cumulé du couple).
                    `netSalary` est en MENSUEL dans le store (cf Budget.tsx). */}
                <KPIStat
                    label="Revenu actif"
                    icon={<Icon name="portfolio" size={16} />}
                    value={formatCAD(totalMonthlyActiveIncome)}
                    // [INCOME-3WAY-SPLIT] ce KPI affiche le salaire DÉCLARÉ (config) — légitime ici
                    // (c'est son objet), mais ÉTIQUETÉ pour ne pas être confondu avec le revenu réel
                    // des transactions affiché dans Budget (exception documentée BUDGET-INCOME-REAL).
                    sublabel="/ mois (net, salaire déclaré)"
                    privacy
                    variant="info"
                />
                <KPIStat
                    label={t('dashboard.passive_income_month')}
                    icon={<Icon name="sparkles" size={16} />}
                    value={`+${formatCAD(totalMonthlyPassive)}`}
                    sublabel="/ mois"
                    privacy
                    variant="warning"
                />
                {/* [EP-3] KPI Futur simplifié : valeur projetée à l'horizon RÉEL (lastProjection),
                    plus de mini-formulaire (input année + Sync) — l'horizon se règle dans Futur.
                    a11y : onClick UNIQUEMENT si hasValue — sinon KPIStat rendrait un <button> contenant
                    le <button> interne de <ProjectionRequired> (bouton imbriqué = HTML invalide).
                    Revue #247 (MAJEUR) — privacy gated PAREIL : sans valeur, la value est le CTA
                    <ProjectionRequired> ; le mettre sous aria-hidden (PrivateAmount) rendrait son bouton
                    focusable-mais-muet (WCAG 4.1.2) et annoncerait « Montant masqué » sans montant. */}
                <KPIStat
                    label={t('dashboard.future_predictor', 'Patrimoine projeté')}
                    value={futureKpi.hasValue
                        ? formatCAD(futureKpi.netWorth as number)
                        : <ProjectionRequired variant="inline" />}
                    sublabel={futureKpi.horizonY ? `dans ${futureKpi.horizonY} ans` : undefined}
                    privacy={futureKpi.hasValue}
                    onClick={futureKpi.hasValue ? () => navigateWithFocus(TabEnum.FUTURE) : undefined}
                />
            </StatGrid>

            {/* [FINTABLE-6 Lot 2] « Que l'accueil utilise Fintable aussi » (Marc) : total courtier
                (autorité) + écart avec les titres saisis + fraîcheur. Ship dark sans sync Fintable. */}
            <BrokerReconciliationCard variant="compact" />

            {/* [PH4-D] L'indicateur de santé financière a été DÉPLACÉ dans l'onglet Budget → sous-onglet « Santé »
                (regroupement avec le budget, qui porte le contexte des ratios). */}

            {/* CHART */}
            <Card title={t('dashboard.detailed_evolution')} className="w-full min-h-[450px]"
                action={
                    <div className="flex flex-col items-end gap-2">
                        <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/10">
                            {(['1M', '3M', 'YTD', '1Y', 'ALL', 'CUSTOM'] as TimeRange[]).map(r => (
                                <button key={r} onClick={() => setTimeRange(r)} className={`px-3 py-1 text-tiny font-bold rounded transition-all ${timeRange === r ? 'bg-white text-black shadow' : 'text-ink-300 hover:text-white hover:bg-white/5'}`}>{r}</button>
                            ))}
                        </div>
                        {timeRange === 'CUSTOM' && (
                            <div className="flex items-center gap-1.5">
                                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="bg-black/40 border border-white/10 rounded px-2 py-1 text-tiny text-white focus:border-white/30 outline-none" />
                                <span className="text-ink-500 text-tiny">→</span>
                                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="bg-black/40 border border-white/10 rounded px-2 py-1 text-tiny text-white focus:border-white/30 outline-none" />
                            </div>
                        )}
                    </div>
                }
            >
                {/* Phase D.3 — chips toggle pour chaque compte + "Total" overlay */}
                {accountKeys.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mb-3">
                        <span className="text-tiny text-ink-400 uppercase tracking-widest font-bold mr-1">Affichage :</span>
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
                                            ? 'bg-white/[0.02] text-ink-400 border-white/5 hover:bg-white/5'
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
                {/* [DASH-HIST-CARDS-LABEL] Même étiquette d'honnêteté que la carte d'actifs : cette
                    courbe est l'HISTORIQUE (dernier close), pas le patrimoine présent du KPI. */}
                {unifiedHistory.length > 0 && (
                    <p className="text-tiny text-ink-400 mb-1">Courbe au dernier cours de clôture (historique).</p>
                )}
                <div className="w-full h-[380px]">
                    {/* [PORTFOLIO-HISTORY] État HONNÊTE quand l'historique n'est pas (encore) là :
                        avant, un ComposedChart VIDE (grille sans message) laissait croire à un bug.
                        L'hydratation remplit le store au boot → le graphe apparaît tout seul. */}
                    {unifiedHistory.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
                            {assets.some(a => a.symbol) ? (
                                <>
                                    <p className="text-body text-ink-200 font-medium">Historique de cours indisponible pour l'instant</p>
                                    <p className="text-meta text-ink-400">
                                        Les cours historiques se chargent au démarrage depuis tes dates d'achat
                                        (la courbe apparaît toute seule quand ils arrivent). Si rien n'apparaît
                                        après un rechargement, vérifie ta clé Finnhub (Réglages → Clés API) —
                                        le repli gratuit couvre la plupart des titres.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p className="text-body text-ink-200 font-medium">Aucun placement à tracer</p>
                                    <p className="text-meta text-ink-400">
                                        Ajoute tes actions/FNB (Investissements → Ajouter) pour voir l'évolution
                                        de ton portefeuille ici.
                                    </p>
                                </>
                            )}
                        </div>
                    ) : (
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
                    )}
                </div>
                {/* [HIST-COVERAGE-TOTAL] Signalement HONNÊTE des approximations de couverture
                    (composant partagé avec Investissements — jamais deux copies qui dérivent). */}
                <HistoryCoverageNote noHistorySymbols={noHistorySymbols} partialHistorySymbols={partialHistorySymbols}
                    staleTailSymbols={staleTailSymbols} hasChart={portfolioHistory.length > 0} />

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
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/15 hover:bg-primary/25 border border-primary/40 text-primary text-tiny font-bold rounded-card transition-colors focus-ring"
                            >
                                <Icon name="chart" size={14} />{selectedStockSymbols.size === 1 ? 'Voir courbe' : `Comparer (${selectedStockSymbols.size})`}
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedStockSymbols(new Set())}
                                className="inline-flex px-2 py-1 text-ink-400 hover:text-ink-200 transition-colors focus-ring rounded"
                                title="Tout désélectionner"
                                aria-label="Tout désélectionner"
                            >
                                <Icon name="close" size={14} />
                            </button>
                        </div>
                    ) : (
                        <span className="text-tiny text-ink-400 italic">Coche pour comparer</span>
                    )
                }
            >
                {/* [DASH-HIST-CARDS-LABEL] Ces valeurs viennent de l'HISTORIQUE (dernier close),
                    pas des cotations présentes — sans étiquette, l'écart avec le KPI Patrimoine
                    (au présent) est inexpliqué à l'écran (finding financial-integrity #544 F3). */}
                <p className="text-tiny text-ink-400 mb-2">
                    Valeurs au dernier cours de clôture (courbe historique) — le KPI Patrimoine, lui, est au présent.
                </p>
                <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                    {segmentedData.assets.map(asset => {
                        const isSelected = selectedStockSymbols.has(asset.symbol);
                        // Phase D.4 — gain $/% depuis achat si dateBought + buyPrice connus
                        const ownedAsset = assets.find(a => a.symbol === asset.symbol);
                        const buyPrice = ownedAsset?.buyPrice;
                        const quantity = ownedAsset?.quantity || 0;
                        const currentPrice = ownedAsset?.currentPrice || 0;
                        const hasPurchaseData = buyPrice && buyPrice > 0 && quantity > 0;
                        // [ASSET-FX-DISPLAY] gain $ affiché en CAD : (prix natif − achat natif) × qty × FX.
                        // Le % reste un ratio de prix natifs (sans devise), inchangé.
                        const gainAbs = hasPurchaseData
                            ? (currentPrice - buyPrice) * quantity * toCurrencyFactor(fxRates, ownedAsset?.currency || 'CAD')
                            : null;
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
                                        {isSelected && <Icon name="check" size={11} className="text-dark" />}
                                    </div>
                                    <div className="w-8 h-8 rounded bg-surfaceHighlight flex items-center justify-center text-meta font-bold text-ink-200 shrink-0">{asset.symbol.substring(0, 2)}</div>
                                    <div className="min-w-0">
                                        <div className="font-bold text-white text-body truncate">{asset.symbol}</div>
                                        <div className="text-tiny text-ink-400 bg-black/50 px-1.5 rounded inline-block mt-0.5">{asset.accountType}</div>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <PrivateAmount as="div" className="font-mono font-bold text-ink-100 text-body">{formatCAD(asset.value)}</PrivateAmount>
                                    <PrivateBlock className="flex justify-end gap-2 text-tiny mt-0.5 font-bold">
                                        <span className={asset.diffCAD >= 0 ? 'text-green-500' : 'text-danger-500'}>
                                            {formatSigned(asset.diffCAD, { withCurrency: true })}
                                        </span>
                                        <span className="text-yellow-500" title="Revenu mensuel estimé (dividendes)">
                                            +{formatCAD(asset.revMensuel)}
                                        </span>
                                    </PrivateBlock>
                                    {hasPurchaseData && gainAbs !== null && gainPct !== null ? (
                                        <div className="text-tiny mt-0.5" title="Gain total depuis l'achat (cours actuel vs prix d'achat)">
                                            <PrivateAmount className={`font-mono ${gainAbs >= 0 ? 'text-success-400' : 'text-danger-400'}`}>
                                                Achat : {formatSigned(gainAbs, { withCurrency: true })} ({formatSigned(gainPct, { decimals: 2 })}%)
                                            </PrivateAmount>
                                        </div>
                                    ) : (
                                        <div className="text-tiny mt-0.5 text-ink-400 italic">
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
                    {segmentedData.assets.length === 0 && <div className="text-center py-4 text-ink-400 text-meta">Aucun actif trouvé.</div>}
                </div>
            </Card>

            </div>

            <StockComparisonModal
                symbols={Array.from(selectedStockSymbols)}
                isOpen={showComparisonModal}
                onClose={() => setShowComparisonModal(false)}
                isPrivacyMode={isPrivacyMode}
            />

        </div>
    );
};
