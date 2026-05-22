import React, { useMemo, useState, useEffect } from 'react';
import { useDebouncedMemo } from '../utils/useDebouncedMemo';
import { Card } from './ui/Card';
import { PageHeader } from './ui/PageHeader';
import { KPIStat } from './ui/KPIStat';
import { StatGrid } from './ui/StatGrid';
import { Pill } from './ui/Pill';
import { Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Line, ComposedChart, Bar, ReferenceDot } from 'recharts';
import { BudgetConfig, BudgetCategory, Asset, RealEstateGoal, ChildGoal, TravelGoal, LifeEvent, RetirementGoal, Transaction, Debt, ProjectionConfig, FinancialGoal, User, RegisteredAccountType } from '../types';
import { fetchPortfolioHistory } from '../services/finance';
import { calculateFutureProjection, SimulationParams } from '../services/projection';
import { runProjectionAsync, terminateProjectionWorker } from '../services/projection/runAsync';
import { useFinanceStore } from '../store/useFinanceStore';
import { useShallow } from 'zustand/shallow';
import { usePendingFocus } from '../utils/usePendingFocus';

// Sprint 2 PH2 — constante stable pour éviter de créer un nouveau [] à chaque
// render (qui invaliderait les useMemo deps en aval).
const EMPTY_ARRAY: never[] = [];
import { Tab as TabEnum } from '../types';
import { ExpertTooltip, ClickableEventIcon, splitEventIcon } from './projection/ProjectionTooltip';
import { useTimeChartZoom } from '../hooks/useTimeChartZoom';
import { ProjectionControls } from './projection/ProjectionControls';

interface FutureProjectionProps {
  assets: Asset[];
  initialBalances: Record<string, number>;
  transactions: Transaction[];
  budgetItems: BudgetCategory[];
  config: BudgetConfig;
  realEstateGoals: RealEstateGoal[];
  setRealEstateGoals?: (g: RealEstateGoal[]) => void;
  childGoals: ChildGoal[];
  setChildGoals?: (g: ChildGoal[]) => void;
  travelGoals: TravelGoal[];
  lifeEvents: LifeEvent[];
  debts?: Debt[];
  retirementGoal: RetirementGoal;
  calculatedMonthlySavings: number;
  projection: ProjectionConfig;
  setProjection: (p: ProjectionConfig) => void;
  financialGoals?: FinancialGoal[];
  isPrivacyMode?: boolean;
}

export const FutureProjection: React.FC<FutureProjectionProps> = ({
    assets = [], initialBalances = {}, transactions = [], budgetItems = [], config,
    realEstateGoals = [], setRealEstateGoals, childGoals = [], travelGoals = [], lifeEvents = [], debts = [], retirementGoal,
    calculatedMonthlySavings, projection, setProjection, financialGoals = [], isPrivacyMode = false
}) => {
    // C6 fix (Sprint 1B) — La garde SAFETY CHECKS qui retournait du JSX avant
    // tous les hooks ci-dessous était une violation flagrante de la règle des
    // Hooks (21 violations remontées par ESLint react-hooks/rules-of-hooks).
    // Si les props passaient d'un état non-init à init entre 2 renders, l'ordre
    // des hooks se décalait → panique React, state corrompu.
    //
    // Fix : la garde est déplacée APRÈS tous les hooks, juste avant le return
    // JSX final. Les hooks tolèrent les props undefined via `?.` et `|| 0`
    // (déjà en place avant ce fix). Voir guard early-return ligne ~285.

    const updateProj = (key: keyof ProjectionConfig, val: any) => {
        setProjection({ ...projection, [key]: val });
    };

    const updateReturnRate = (key: string, val: number) => {
        setProjection({
            ...projection,
            returnRates: { ...(projection.returnRates || { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 }), [key]: val }
        });
    };

    const baseNetAnnual = useMemo<number>(() => {
        const users: User[] = (config?.users ?? []) as unknown as User[];
        return users.reduce((sum: number, u: User) => sum + ((u.netSalary || u.salary || 0) * 12), 0);
    }, [config]);
    const baseGrossAnnual = useMemo<number>(() => {
        const users: User[] = (config?.users ?? []) as unknown as User[];
        return users.reduce((sum: number, u: User) => sum + ((u.grossSalary || 0) * 12), 0);
    }, [config]);
    const baseMonthlyExpenses = (baseNetAnnual / 12) - calculatedMonthlySavings;

    const [liveCSVBalances, setLiveCSVBalances] = useState({ CELI: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0, TOTAL: 0, historicalRate: 0 });

    useEffect(() => {
        const fetchLiveTotals = async () => {
            const history = await fetchPortfolioHistory();
                if (!history || history.length === 0) {
                    // LOW-4 fix (audit 2026-05-21) : log seulement en DEV. État
                    // normal pour un nouvel utilisateur sans historique CSV.
                    if (import.meta.env.DEV) {
                        console.warn("FutureProjection: No history found, using default balances.");
                    }
                    return;
                }
                const lastRow = history[history.length - 1];
                if (!lastRow) return;

                let celi = 0, reer = 0, nonReg = 0, crypto = 0, reee = 0, total = 0;

                Object.keys(lastRow).forEach(key => {
                    if (key === 'date' || key === 'Date' || key.startsWith('Taux')) return;
                    const val = Number(lastRow[key]) || 0;
                    if (key.includes('TOTAL')) { total = val; return; }

                    const mappedAsset = assets.find(a => key.includes(a.symbol));
                    const type: RegisteredAccountType = mappedAsset?.accountType || 'NON-ENREG';

                    if (type === 'CELI') celi += val;
                    else if (type === 'REER') reer += val;
                    else if (type === 'CRYPTO') crypto += val;
                    else if (key.includes('REEE')) reee += val;
                    else nonReg += val;
                });

                let historicalRate = 7.0;
                if (history.length > 1) {
                    const firstRow = history[0];
                    const firstTotalKey = Object.keys(firstRow).find(k => k.includes('TOTAL'));
                    if (firstTotalKey) {
                        const firstTotal = Number(firstRow[firstTotalKey]) || 0;
                        const lastTotal = Number(lastRow[firstTotalKey]) || 0;

                        const days = (new Date(lastRow.date as string).getTime() - new Date(firstRow.date as string).getTime()) / (1000 * 3600 * 24);
                        if (days > 30 && firstTotal > 0 && lastTotal > 0) {
                            const years = days / 365.25;
                            historicalRate = (Math.pow(lastTotal / firstTotal, 1 / years) - 1) * 100;
                            historicalRate = Math.min(Math.max(historicalRate, -10), 30);
                        }
                    }
                }

                setLiveCSVBalances({ CELI: celi, REER: reer, NON_ENREG: nonReg, CRYPTO: crypto, REEE: reee, TOTAL: total, historicalRate });
        };
        fetchLiveTotals();
    }, [assets]);

    const applyHistoricalRate = () => {
        if (liveCSVBalances.historicalRate > 0) {
            const rate = Number(liveCSVBalances.historicalRate.toFixed(1));
            setProjection({
                ...projection,
                returnRates: { ...projection.returnRates, celi: rate, reer: rate, nonReg: rate, crypto: rate, cash: 3 }
            });
        }
    };

    const calculatedStartingCash = useMemo(() => {
        let cash = 0;
        (Object.values(initialBalances) as number[]).forEach(v => cash += (Number(v) || 0));
        transactions.forEach((t: Transaction) => {
            if (!t.isDuplicate && !t.isTransfer) cash += (Number(t.amount) || 0);
        });
        return cash;
    }, [initialBalances, transactions]);

    const currentRentExpense = useMemo(() => {
        const rentItem = budgetItems.find(b => b.name.toLowerCase().includes('loyer') || b.name.toLowerCase().includes('rent') || b.name.toLowerCase().includes('hypothèque'));
        if (rentItem) {
            let val = rentItem.target;
            if (rentItem.frequency === 'Yearly') val /= 12;
            if (rentItem.frequency === 'Weekly') val *= 4.33;
            return val;
        }
        return 1600;
    }, [budgetItems]);

    const startYear = 2026;
    const startMonth = 0;

    const todayMonthIndex = useMemo(() => {
        const now = new Date();
        return Math.max(0, (now.getFullYear() - startYear) * 12 + (now.getMonth() - startMonth));
    }, []);
    const [selectedScenarioIdx, setSelectedScenarioIdx] = useState(0);
    const [runMC, setRunMC] = useState(true);

    // W5.x — Conteneurs étendus câblés au moteur
    // Phase B2 — consomme un éventuel deep-link entrant (cf docs/UI_REFOUNDATION_PLAN.md §5)
    usePendingFocus(TabEnum.FUTURE);

    // Sprint 2 PH2 — Regroupement en un seul selector useShallow. Avant ce fix,
    // 7 selectors séparés provoquaient des re-renders parasites et chaque `?? []`
    // créait une nouvelle référence à chaque render, invalidant les useMemo
    // deps en aval (`params` ci-dessous).
    const { insurancePolicies, vehicleReplacements, majorRenovations, charitableGoals, rentalProperties, privateBusinesses, savingsGoals } = useFinanceStore(useShallow(s => ({
        insurancePolicies: s.insurancePolicies ?? EMPTY_ARRAY,
        vehicleReplacements: s.vehicleReplacements ?? EMPTY_ARRAY,
        majorRenovations: s.majorRenovations ?? EMPTY_ARRAY,
        charitableGoals: s.charitableGoals ?? EMPTY_ARRAY,
        rentalProperties: s.rentalProperties ?? EMPTY_ARRAY,
        privateBusinesses: s.privateBusinesses ?? EMPTY_ARRAY,
        // Wiring 2026-05: deux goals jusqu'ici dead-wired arrivent maintenant au moteur.
        savingsGoals: s.savingsGoals ?? EMPTY_ARRAY,
    })));

    const params: SimulationParams = useMemo(() => ({
        projection,
        calculatedStartingCash,
        liveCSVBalances,
        realEstateGoals: realEstateGoals.filter(Boolean),
        debts: debts || [],
        childGoals: childGoals.filter(Boolean),
        travelGoals,
        lifeEvents,
        retirementGoal,
        config,
        baseGrossAnnual,
        baseNetAnnual,
        currentRentExpense,
        baseMonthlyExpenses,
        startYear,
        startMonth,
        insurancePolicies,
        vehicleReplacements,
        majorRenovations,
        charitableGoals,
        rentalProperties,
        privateBusinesses,
        savingsGoals,
        financialGoals,
    }), [projection, calculatedStartingCash, liveCSVBalances, realEstateGoals, debts, childGoals, travelGoals, lifeEvents, retirementGoal, config, baseGrossAnnual, baseNetAnnual, currentRentExpense, baseMonthlyExpenses, insurancePolicies, vehicleReplacements, majorRenovations, charitableGoals, rentalProperties, privateBusinesses, savingsGoals, financialGoals]);

    // Perf fix:
    //  - Mode déterministe (runMC=false): synchrone + debounce 300ms (rapide ~150ms)
    //  - Mode MC (runMC=true): exécuté dans Web Worker via runProjectionAsync
    //    (libère le main thread pendant les 1.5-3s de calcul)
    const syncResults = useDebouncedMemo<any>(() => {
        if (runMC) return null; // Sera calculé par l'effect ci-dessous
        try {
            return calculateFutureProjection(params, false, selectedScenarioIdx);
        } catch (e) {
            // SF3 fix (Sprint 1) : avant ce fix, un crash projection retournait
            // silencieusement `fireNumber: 0` + chartData vide → propagé via
            // setLastProjection à Dashboard, Investments, Budget, NextBestAction
            // (IA) qui basaient leurs recommandations sur des données invalides
            // présentées comme valides. On ajoute un flag `_hasError` que les
            // consumers peuvent tester, et on loggue via errorLogger.
            console.error("CRITICAL SIMULATION ERROR:", e);
            import('../services/errorLogger').then(({ logError }) => {
                logError({
                    source: 'projection',
                    severity: 'critical',
                    message: 'calculateFutureProjection crashed',
                    error: e instanceof Error ? e : new Error(String(e)),
                });
            }).catch(() => { /* logger HS, silent */ });
            return { chartData: [], fireNumber: 0, aiNote: "Error", allResults: [], _hasError: true };
        }
    }, [params, runMC, selectedScenarioIdx], 300);

    const [asyncResults, setAsyncResults] = useState<any>(null);
    const [isComputing, setIsComputing] = useState(false);

    useEffect(() => {
        if (!runMC) return;
        let cancelled = false;
        const timer = setTimeout(() => {
            setIsComputing(true);
            runProjectionAsync(params, true, selectedScenarioIdx)
                .then(r => { if (!cancelled) { setAsyncResults(r); setIsComputing(false); } })
                .catch(e => {
                    if (!cancelled) {
                        console.error("CRITICAL SIMULATION ERROR (worker):", e);
                        setAsyncResults({ chartData: [], fireNumber: 0, aiNote: "Error", allResults: [] });
                        setIsComputing(false);
                    }
                });
        }, 300); // debounce 300ms même en MC
        return () => { cancelled = true; clearTimeout(timer); };
    }, [params, runMC, selectedScenarioIdx]);

    // FIX agent cycle 2 (HIGH): cleanup du Worker au démontage du composant
    // (évite fuites en HMR dev + ressource libérée propre).
    useEffect(() => {
        return () => { terminateProjectionWorker(); };
    }, []);

    const results = runMC ? asyncResults : syncResults;
    const { chartData = [], fireNumber = 0, aiNote = "", allResults = [] } = (results || {}) as any;

    // Wiring 2026-05 (Option A): publie le dernier résultat dans le store pour
    // que Dashboard/Investments/Budget/etc. puissent l'afficher sans recalculer.
    const setLastProjection = useFinanceStore(s => s.setLastProjection);
    useEffect(() => {
        if (results && Array.isArray(results.chartData) && results.chartData.length > 0) {
            setLastProjection(results);
        }
    }, [results, setLastProjection]);

    // G5 — un événement = une pastille (plus de fusion « A | B | C »). On garde
    // year/age/dateLabel par événement pour la fiche au clic, et `subIdx` pour
    // empiler verticalement les événements d'un même mois.
    const { lifeChartEvents, flowChartEvents } = useMemo(() => {
        const lifes: any[] = [];
        const flows: any[] = [];
        let lifeIdx = 0;
        let flowIdx = 0;
        // Anti-spam : le moteur ré-émet certains labels (renouvellements, stress
        // tests) plusieurs mois d'affilée. On collapse les répétitions du même
        // label rapprochées (≤ DEDUP_GAP mois) pour ne garder qu'une pastille.
        const DEDUP_GAP = 3;
        const lastLife: Record<string, number> = {};
        const lastFlow: Record<string, number> = {};
        chartData.forEach((d: any) => {
            const meta = { monthIndex: d.monthIndex, year: d.year, age: d.age, dateLabel: d.dateLabel };
            let lifeSub = 0;
            (d.lifeEvents || []).forEach((label: string) => {
                if (lastLife[label] != null && d.monthIndex - lastLife[label] <= DEDUP_GAP) return;
                lastLife[label] = d.monthIndex;
                lifes.push({ ...meta, val: d.NetWorth, netWorth: d.NetWorth, label, subIdx: lifeSub++, index: lifeIdx++, kind: 'life' });
            });
            if (d.flowEvents?.length > 0 && (d.FluxImpots < 0 || d.flowEvents.some((x: any) => x.includes('-')))) {
                let flowSub = 0;
                d.flowEvents.forEach((label: string) => {
                    if (lastFlow[label] != null && d.monthIndex - lastFlow[label] <= DEDUP_GAP) return;
                    lastFlow[label] = d.monthIndex;
                    flows.push({ ...meta, val: d.ImpotLatent || 0, netWorth: d.NetWorth, label, subIdx: flowSub++, index: flowIdx++, kind: 'flow' });
                });
            }
        });
        return { lifeChartEvents: lifes, flowChartEvents: flows };
    }, [chartData]);

    // G3 — sous-onglets Futur (Graphique = courbe + KPIs ; Paramètres = contrôles).
    const [futureSubTab, setFutureSubTab] = useState<'graph' | 'params'>('graph');

    // G4 — zoom molette / pan / sélecteur de période sur la courbe (remplace <Brush>).
    const zoom = useTimeChartZoom<any>(chartData);

    // G5 — événement sélectionné (clic sur une pastille) → fiche détail.
    const [selectedEvent, setSelectedEvent] = useState<any>(null);

    // C6 fix (Sprint 1B) — Garde déplacée ICI (après tous les hooks) pour
    // respecter la règle des Hooks. Retourne un placeholder UI si les props
    // critiques manquent. Avant ce fix, cette garde était ligne 46 (avant les
    // 21 hooks ci-dessus) → 21 violations react-hooks/rules-of-hooks.
    if (!budgetItems || !projection || !config || !initialBalances) {
        console.error("FutureProjection: Missing critical initialization data.", { budgetItems, projection, config, initialBalances });
        return <div className="p-8 text-center text-red-400 font-bold bg-surface/50 rounded-2xl border border-red-500/20">
            ⚠️ Données d'initialisation manquantes. Veuillez vérifier vos comptes et votre budget.
        </div>;
    }

    // G4/G5 — fenêtre visible (en monthIndex) pour ne tracer que les événements
    // dans la plage zoomée et borner le sélecteur de période.
    const visMinMonth = zoom.visibleData[0]?.monthIndex ?? Number.NEGATIVE_INFINITY;
    const visMaxMonth = zoom.visibleData[zoom.visibleData.length - 1]?.monthIndex ?? Number.POSITIVE_INFINITY;
    const visibleLifeEvents = lifeChartEvents.filter((e: any) => e.monthIndex >= visMinMonth && e.monthIndex <= visMaxMonth);
    const visibleFlowEvents = flowChartEvents.filter((e: any) => e.monthIndex >= visMinMonth && e.monthIndex <= visMaxMonth);
    // Plafond de densité : en vue large on échantillonne uniformément (lisibilité
    // + fluidité). En zoomant, la fenêtre contient moins d'événements → tous visibles.
    const thinEvents = (arr: any[], cap: number) => {
        if (arr.length <= cap) return arr;
        const step = Math.ceil(arr.length / cap);
        return arr.filter((_: any, i: number) => i % step === 0);
    };
    const shownLifeEvents = thinEvents(visibleLifeEvents, 40);
    const shownFlowEvents = thinEvents(visibleFlowEvents, 24);
    const lastMonthIndex = chartData.length > 0 ? chartData[chartData.length - 1].monthIndex : 0;
    const idxForYears = (yrs: number) => {
        const i = chartData.findIndex((d: any) => d.monthIndex >= yrs * 12);
        return i === -1 ? chartData.length - 1 : i;
    };

    return (
        <div className="space-y-6 animate-fade-in pb-24">

            <PageHeader
                icon="🔮"
                title="Projection Future"
                subtitle="Analyse des flux mensuels projetés avec Loyer → Hypothèque automatique et frais enfants dynamiques."
                actions={
                    <Pill
                        aria-label="Mode de données"
                        size="sm"
                        value={projection.useTheoretical ? 'sandbox' : 'real'}
                        onChange={(v) => updateProj('useTheoretical', v === 'sandbox')}
                        options={[
                            { value: 'real', label: 'Données Réelles', icon: '🔗' },
                            { value: 'sandbox', label: 'Sandbox', icon: '🧪' },
                        ]}
                    />
                }
            />

            {/* Hero KPI strip — instant comprehension */}
            <StatGrid cols={4}>
                <KPIStat
                    label="Objectif FIRE"
                    icon="🎯"
                    value={`${(fireNumber / 1000).toFixed(0)}k $`}
                    sublabel="Règle des 4%"
                    privacy
                    variant="warning"
                />
                <KPIStat
                    label="Patrimoine projeté"
                    icon="💼"
                    // Fallback : si estateNetWorth est 0 (rare en réalité ou bug
                    // silencieux du moteur), utiliser finalNetWorth puis fireNumber
                    // comme proxy. Évite d'afficher "0.00M$" trompeur en mode test.
                    value={`${(((results?.estateNetWorth || results?.finalNetWorth || results?.fireNumber) || 0) / 1000000).toFixed(2)}M $`}
                    sublabel={`Fin de l'horizon (${projection.years || 30} ans)`}
                    privacy
                    variant="primary"
                />
                <KPIStat
                    label="Taux de succès"
                    icon="✓"
                    value={results?.successRate != null ? `${results.successRate}%` : '—'}
                    sublabel={runMC ? 'Monte Carlo (100 itér.)' : 'Active MC pour calculer'}
                    variant={results?.successRate != null && results.successRate >= 80 ? 'success' : results?.successRate != null && results.successRate >= 50 ? 'warning' : 'danger'}
                />
                <KPIStat
                    label="Vitalité financière"
                    icon="🌡️"
                    value={results?.fvi != null ? `${results.fvi}/100` : '—'}
                    sublabel={runMC ? '30/30/20/20 split' : 'Active MC pour calculer'}
                    variant={results?.fvi != null && results.fvi >= 70 ? 'success' : results?.fvi != null && results.fvi >= 40 ? 'warning' : 'danger'}
                />
            </StatGrid>
            {/* G3 — bascule Graphique / Paramètres */}
            <div className="flex gap-1 p-1 rounded-card bg-surface/40 border border-white/5 w-fit" role="tablist" aria-label="Vue Future">
                <button
                    type="button" role="tab" aria-selected={futureSubTab === 'graph'}
                    onClick={() => setFutureSubTab('graph')}
                    className={`px-4 py-1.5 rounded-card text-meta font-bold transition-colors focus-ring ${futureSubTab === 'graph' ? 'bg-primary text-white' : 'text-ink-300 hover:text-ink-100'}`}
                >
                    📈 Graphique
                </button>
                <button
                    type="button" role="tab" aria-selected={futureSubTab === 'params'}
                    onClick={() => setFutureSubTab('params')}
                    className={`px-4 py-1.5 rounded-card text-meta font-bold transition-colors focus-ring ${futureSubTab === 'params' ? 'bg-primary text-white' : 'text-ink-300 hover:text-ink-100'}`}
                >
                    ⚙️ Paramètres
                </button>
            </div>

            {futureSubTab === 'params' && (
            <ProjectionControls
                projection={projection}
                updateProj={updateProj}
                updateReturnRate={updateReturnRate}
                runMC={runMC}
                setRunMC={setRunMC}
                isComputing={isComputing}
                selectedScenarioIdx={selectedScenarioIdx}
                setSelectedScenarioIdx={setSelectedScenarioIdx}
                allResults={allResults}
                fireNumber={fireNumber}
                aiNote={aiNote}
                liveCSVBalances={liveCSVBalances}
                applyHistoricalRate={applyHistoricalRate}
                realEstateGoals={realEstateGoals}
                setRealEstateGoals={setRealEstateGoals}
                config={config}
            />
            )}

            {futureSubTab === 'graph' && (
            <Card title={`La Courbe de Vie - ${allResults[selectedScenarioIdx]?.strategyName || 'Simulation'}`}
                action={isComputing ? (
                    <span className="flex items-center gap-2 text-tiny text-amber-400" role="status" aria-live="polite">
                        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="40" strokeDashoffset="20" opacity="0.5"/>
                        </svg>
                        Recalcul Monte Carlo en cours…
                    </span>
                ) : undefined}>
                {/* G4 — sélecteur de période façon Google Finance */}
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <div className="flex gap-0.5 p-0.5 rounded-card bg-black/30 border border-white/5">
                        {[5, 10, 20, 30].filter((y) => y * 12 < lastMonthIndex).map((y) => (
                            <button
                                key={y}
                                type="button"
                                onClick={() => zoom.showRange(0, idxForYears(y))}
                                className="px-2.5 py-1 text-tiny font-bold rounded text-ink-300 hover:text-white hover:bg-white/10 transition-colors focus-ring"
                            >
                                {y} ans
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={zoom.reset}
                            className={`px-2.5 py-1 text-tiny font-bold rounded transition-colors focus-ring ${!zoom.isZoomed ? 'bg-primary text-white' : 'text-ink-300 hover:text-white hover:bg-white/10'}`}
                        >
                            Tout
                        </button>
                    </div>
                    <span className="text-tiny text-ink-500 hidden sm:block" aria-hidden="true">
                        Molette = zoom · glisser = défiler · double-clic = reset
                    </span>
                </div>
                {/* Hauteur responsive : 380px mobile, 500px tablet, 650px desktop */}
                <div
                    ref={zoom.containerRef}
                    {...zoom.handlers}
                    onClick={() => setSelectedEvent(null)}
                    className={`relative w-full h-[380px] sm:h-[500px] lg:h-[650px] select-none ${zoom.isZoomed && zoom.isPanning ? 'cursor-grabbing' : zoom.isZoomed ? 'cursor-grab' : 'cursor-default'}`}
                >
                    {/* G5 — fiche détail de l'événement cliqué */}
                    {selectedEvent && (() => {
                        const { icon, text } = splitEventIcon(selectedEvent.label || '');
                        return (
                            <div
                                className="absolute top-2 right-2 z-20 w-[min(260px,calc(100%-1rem))] bg-[#0B0E14]/95 backdrop-blur-md border border-white/20 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.7)] p-3 animate-fade-in"
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                role="dialog"
                                aria-label="Détail de l'événement"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-start gap-2 min-w-0">
                                        <span className="text-xl shrink-0" aria-hidden="true">{icon}</span>
                                        <div className="min-w-0">
                                            <div className="text-sm font-bold text-white break-words">{text}</div>
                                            <div className="text-tiny text-ink-400 mt-0.5">
                                                {selectedEvent.dateLabel || selectedEvent.year || '—'}{selectedEvent.age != null ? ` · Âge ${selectedEvent.age}` : ''}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedEvent(null)}
                                        aria-label="Fermer la fiche"
                                        className="shrink-0 text-ink-400 hover:text-white text-sm leading-none p-1 -m-1 rounded focus-ring"
                                    >
                                        ✕
                                    </button>
                                </div>
                                <div className="mt-2 pt-2 border-t border-white/10 flex justify-between text-tiny">
                                    <span className="text-ink-400">Valeur nette à ce moment</span>
                                    <span className="font-mono text-white privacy-blur">{Math.round(selectedEvent.netWorth || 0).toLocaleString('fr-CA')} $</span>
                                </div>
                            </div>
                        );
                    })()}
                     <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={zoom.visibleData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />

                            <XAxis
                                dataKey="monthIndex"
                                stroke="#666"
                                tick={{fontSize: 10}}
                                minTickGap={50}
                                tickFormatter={(val) => {
                                    const match = chartData.find((d:any) => d.monthIndex === val);
                                    return match ? `${match.year}` : val;
                                }}
                            />

                            <YAxis stroke="#666" tick={{fontSize: 10}} domain={['auto', 'auto']} tickFormatter={(val) => isPrivacyMode ? '***' : `${(val/1000000).toFixed(1)}M`} />

                            <ReferenceLine y={0} stroke="#444" strokeWidth={2} />
                            <ReferenceLine x={todayMonthIndex} stroke="rgba(255,255,255,0.6)" strokeDasharray="5 5" label={{ position: 'top', value: "Aujourd'hui", fill: '#fff', fontSize: 10 }} />

                            <Tooltip content={<ExpertTooltip isPrivacyMode={isPrivacyMode} userName1={config.users[0]?.name} userName2={config.users[1]?.name} />} />
                            <ReferenceLine y={fireNumber} stroke="#f97316" strokeDasharray="5 5" label={{ position: 'top', value: 'Objectif FIRE', fill: '#f97316', fontSize: 12, fontWeight: 'bold' }} />

                            {runMC && (
                                <>
                                    <Area type="monotone" dataKey="P90" stroke="none" fill="#3b82f6" fillOpacity={0.05} name="Optimiste (P90)" />
                                    <Area type="monotone" dataKey="P50" stroke="#3b82f6" strokeDasharray="5 5" fill="none" name="Médiane (P50)" />
                                    <Area type="monotone" dataKey="P10" stroke="none" fill="#ef4444" fillOpacity={0.05} name="Pessimiste (P10)" />
                                </>
                            )}
                            <Area type="monotone" dataKey="Liquidites" stackId="1" stroke="#4b5563" fill="#4b5563" name="Cash" isAnimationActive={false} />
                            <Area type="monotone" dataKey="CELI" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="CELI" isAnimationActive={false}/>
                            <Area type="monotone" dataKey="REER" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} name="REER" isAnimationActive={false}/>
                            <Area type="monotone" dataKey="REEE" stackId="1" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.6} name="REEE" isAnimationActive={false}/>
                            <Area type="monotone" dataKey="NonReg" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} name="Non-Enreg" isAnimationActive={false}/>
                            <Area type="monotone" dataKey="Crypto" stackId="1" stroke="#a855f7" fill="#a855f7" fillOpacity={0.6} name="Crypto" isAnimationActive={false}/>
                            <Area type="monotone" dataKey="Immobilier" stackId="1" stroke="#ec4899" fill="#ec4899" fillOpacity={0.3} name="Équité Immo" isAnimationActive={false}/>

                            <Area type="monotone" dataKey="ImpotLatent" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} strokeDasharray="3 3" name="Impôt Latent" isAnimationActive={false}/>
                            <Bar dataKey="FluxImpots" fill="#ef4444" fillOpacity={0.8} name="Paiement Impôts" barSize={4} isAnimationActive={false} />

                            <Line type="monotone" dataKey="NetWorth" stroke="#fff" strokeWidth={3} dot={false} name="Valeur Nette Totale" isAnimationActive={false}/>

                            {shownLifeEvents.map((evt: any, i: number) => (
                                <ReferenceDot
                                    key={`life-${i}`}
                                    x={evt.monthIndex}
                                    y={evt.val}
                                    r={3}
                                    shape={
                                        <ClickableEventIcon
                                            kind="life"
                                            payload={evt}
                                            onSelect={setSelectedEvent}
                                            selected={!!selectedEvent && selectedEvent.monthIndex === evt.monthIndex && selectedEvent.label === evt.label && selectedEvent.subIdx === evt.subIdx}
                                        />
                                    }
                                />
                            ))}

                            {shownFlowEvents.map((evt: any, i: number) => (
                                <ReferenceDot
                                    key={`flow-${i}`}
                                    x={evt.monthIndex}
                                    y={evt.val}
                                    r={2}
                                    shape={
                                        <ClickableEventIcon
                                            kind="flow"
                                            payload={evt}
                                            onSelect={setSelectedEvent}
                                            selected={!!selectedEvent && selectedEvent.monthIndex === evt.monthIndex && selectedEvent.label === evt.label && selectedEvent.subIdx === evt.subIdx}
                                        />
                                    }
                                />
                            ))}
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>

                <div className="mt-6 flex flex-wrap gap-4 text-tiny text-gray-400 justify-center bg-black/20 p-4 rounded-xl border border-white/5">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-[#4b5563] rounded"></span> Cash</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-[#10b981] rounded"></span> CELI</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-[#3b82f6] rounded"></span> REER</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-[#06b6d4] rounded"></span> REEE</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-[#f59e0b] rounded"></span> Non-Enregistré</span>
                    <div className="w-px h-4 bg-white/20 mx-2"></div>
                    <span className="flex items-center gap-1"><span className="w-4 h-1 bg-[#fff]"></span> Valeur Nette</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-[#ef4444] opacity-30 rounded"></span> Dette Fiscale Latente (Sous 0)</span>
                </div>
            </Card>
            )}
        </div>
    );
};
