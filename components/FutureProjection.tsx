import React, { useMemo, useState, useEffect } from 'react';
import { useDebouncedMemo } from '../utils/useDebouncedMemo';
import { Card } from './ui/Card';
import { Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Line, ComposedChart, Brush, Bar, ReferenceDot, LabelList } from 'recharts';
import { BudgetConfig, BudgetCategory, Asset, RealEstateGoal, ChildGoal, TravelGoal, LifeEvent, RetirementGoal, Transaction, Debt, ProjectionConfig, FinancialGoal, User, RegisteredAccountType } from '../types';
import { fetchPortfolioHistory } from '../services/finance';
import { calculateFutureProjection, SimulationParams } from '../services/projection';
import { runProjectionAsync, terminateProjectionWorker } from '../services/projection/runAsync';
import { useFinanceStore } from '../store/useFinanceStore';
import { ExpertTooltip, CustomLifeEventLabel, CustomFlowEventLabel } from './projection/ProjectionTooltip';
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
        // SAFETY CHECKS
    if (!budgetItems || !projection || !config || !initialBalances) {
        console.error("FutureProjection: Missing critical initialization data.", { budgetItems, projection, config, initialBalances });
        return <div className="p-8 text-center text-red-400 font-bold bg-surface/50 rounded-2xl border border-red-500/20">
            ⚠️ Données d'initialisation manquantes. Veuillez vérifier vos comptes et votre budget.
        </div>;
    }

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
                    console.warn("FutureProjection: No history found, using default balances.");
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
    const insurancePolicies = useFinanceStore(s => s.insurancePolicies ?? []);
    const vehicleReplacements = useFinanceStore(s => s.vehicleReplacements ?? []);
    const majorRenovations = useFinanceStore(s => s.majorRenovations ?? []);
    const charitableGoals = useFinanceStore(s => s.charitableGoals ?? []);
    const rentalProperties = useFinanceStore(s => s.rentalProperties ?? []);
    const privateBusinesses = useFinanceStore(s => s.privateBusinesses ?? []);
    // Wiring 2026-05: deux goals jusqu'ici dead-wired arrivent maintenant au moteur.
    const savingsGoals = useFinanceStore(s => s.savingsGoals ?? []);

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
            console.error("CRITICAL SIMULATION ERROR:", e);
            return { chartData: [], fireNumber: 0, aiNote: "Error", allResults: [] };
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

    const { lifeChartEvents, flowChartEvents } = useMemo(() => {
        const lifes: any[] = [];
        const flows: any[] = [];
        let lifeIdx = 0;
        let flowIdx = 0;
        chartData.forEach((d: any) => {
            if (d.lifeEvents?.length > 0) lifes.push({ monthIndex: d.monthIndex, val: d.NetWorth, label: d.lifeEvents.join(' | '), index: lifeIdx++ });
            if (d.flowEvents?.length > 0 && (d.FluxImpots < 0 || d.flowEvents.some((x:any)=>x.includes('-')))) {
                flows.push({ monthIndex: d.monthIndex, val: d.ImpotLatent || 0, label: d.flowEvents[0], index: flowIdx++ });
            }
        });
        return { lifeChartEvents: lifes, flowChartEvents: flows };
    }, [chartData]);

    return (
        <div className="space-y-6 animate-fade-in pb-24">

            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-900/40 to-emerald-900/40 border border-white/10 p-6 shadow-2xl">
                 <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                     <div>
                         <h2 className="text-3xl font-black text-white italic">Moteur de Simulation HD (Départ 2026)</h2>
                         <p className="text-gray-300 text-sm mt-1 max-w-2xl">
                             Analyse des flux mensuels projetés avec transition automatique Loyer → Hypothèque et Frais Enfants dynamiques.
                         </p>
                     </div>
                     <div className="text-right bg-black/40 p-3 rounded-xl border border-white/10">
                         <div className="text-[10px] text-orange-400 font-bold uppercase tracking-widest">Objectif FIRE (Règle des 4%)</div>
                         <div className="text-2xl font-black text-white privacy-blur">{fireNumber.toLocaleString()} $</div>
                     </div>
                 </div>
            </div>
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

            <Card title={`La Courbe de Vie - ${allResults[selectedScenarioIdx]?.strategyName || 'Simulation'}`}>
                <div style={{ width: '100%', height: '650px' }}>
                     <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
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

                            {lifeChartEvents.map((evt, i) => (
                                <ReferenceDot key={`life-${i}`} x={evt.monthIndex} y={evt.val} r={6} fill="#facc15" stroke="#0B0E14" strokeWidth={2}>
                                    <LabelList dataKey="label" content={<CustomLifeEventLabel value={evt.label} index={evt.index} />} />
                                </ReferenceDot>
                            ))}

                            {flowChartEvents.map((evt, i) => (
                                <ReferenceDot key={`flow-${i}`} x={evt.monthIndex} y={evt.val} r={3} fill="#60a5fa" stroke="#0B0E14" strokeWidth={1}>
                                    <LabelList dataKey="label" content={<CustomFlowEventLabel value={evt.label} index={evt.index} />} />
                                </ReferenceDot>
                            ))}

                            <Brush dataKey="monthIndex" height={30} stroke="#8884d8" fill="#151922" tickFormatter={(val) => {
                                const match = chartData.find((d: any) => d.monthIndex === val);
                                return match ? `${match.year}` : '';
                            }}/>
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>

                <div className="mt-6 flex flex-wrap gap-4 text-[10px] text-gray-400 justify-center bg-black/20 p-4 rounded-xl border border-white/5">
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
        </div>
    );
};
