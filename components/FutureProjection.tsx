import React, { useMemo, useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Line, ComposedChart, Brush, Bar, ReferenceDot, LabelList } from 'recharts';
import { BudgetConfig, BudgetCategory, Asset, RealEstateGoal, ChildGoal, TravelGoal, LifeEvent, RetirementGoal, Transaction, Debt, ProjectionConfig, FinancialGoal, User } from '../types';
import { calculateFiscalReport } from '../services/tax';
import { fetchPortfolioHistory } from '../services/finance';
import { calculateFutureProjection, SimulationParams } from '../services/projection';

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

const ExpertTooltip = ({ active, payload, label, isPrivacyMode, userName1, userName2 }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;

    return (
        <div className="bg-[#0B0E14]/95 backdrop-blur-md border border-white/20 p-4 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] max-w-sm z-50">
            <div className="text-sm font-bold text-white mb-2 border-b border-white/20 pb-2 flex justify-between items-center">
                <span>{data.dateLabel || 'N/A'}</span>
                <span className="text-[10px] text-gray-400 bg-white/10 px-2 py-0.5 rounded">Âge: {data.age || '??'}</span>
            </div>

            <div className="mb-3 space-y-1">
                {(data.IncomeMarc || 0) > 0 && <div className="flex justify-between text-xs"><span className="text-gray-400">Paye {userName1 || 'Utilisateur 1'}:</span> <span className="font-mono text-green-400 privacy-blur">+{(data.IncomeMarc || 0).toLocaleString()}$</span></div>}
                {(data.IncomeAnna || 0) > 0 && <div className="flex justify-between text-xs"><span className="text-gray-400">Paye {userName2 || 'Utilisateur 2'}:</span> <span className="font-mono text-green-400 privacy-blur">+{(data.IncomeAnna || 0).toLocaleString()}$</span></div>}
                {(data.IncomeRetirement || 0) > 0 && <div className="flex justify-between text-xs"><span className="text-gray-400">Rentes/Retraite:</span> <span className="font-mono text-green-400 privacy-blur">+{(data.IncomeRetirement || 0).toLocaleString()}$</span></div>}

                <div className="flex justify-between text-xs"><span className="text-gray-400">Dépenses Vies:</span> <span className="font-mono text-red-400 privacy-blur">-{(data.Expenses || 0).toLocaleString()}$</span></div>

                {(data.childGross || 0) > 0 && (
                    <div className="flex justify-between text-[10px]">
                        <span className="text-gray-500 pl-2">↳ dt. Enfant:</span>
                        <span className="font-mono text-red-300 privacy-blur text-right">
                            -{(data.childGross || 0).toLocaleString()}$
                            {(data.childBenefits || 0) > 0 && <span className="text-green-400 ml-1">(+{(data.childBenefits || 0)}$ alloc)</span>}
                        </span>
                    </div>
                )}
                {(data.ReeeContrib || 0) > 0 && <div className="flex justify-between text-[10px]"><span className="text-gray-500 pl-2">↳ dt. Épargne REEE:</span> <span className="font-mono text-blue-300 privacy-blur">{(data.ReeeContrib || 0)}$ (+30% gouv)</span></div>}

                {(data.ImmoHypo || 0) > 0 && (
                    <div className="flex flex-col text-[10px]">
                        <div className="flex justify-between">
                            <span className="text-gray-500 pl-2">↳ dt. Maison:</span>
                            <span className="font-mono text-pink-300 privacy-blur">Hypo {(data.ImmoHypo || 0).toLocaleString()}$ | Chg {(data.ImmoCharges || 0).toLocaleString()}$</span>
                        </div>
                        <div className="flex justify-end text-[9px] text-gray-500 mt-0.5 font-mono">
                            (Capital: <span className="text-green-400/80 mx-1">+{(data.ImmoPrincipal || 0).toLocaleString()}$</span> Intérêts: <span className="text-red-400/80 ml-1">-{(data.ImmoInterest || 0).toLocaleString()}$</span>)
                        </div>
                    </div>
                )}
                {(data.ImmoHypo || 0) === 0 && (data.ImmoCharges || 0) > 0 && (
                    <div className="flex justify-between text-[10px]">
                        <span className="text-gray-500 pl-2">↳ dt. Maison (Payée):</span>
                        <span className="font-mono text-pink-300 privacy-blur">Chg {(data.ImmoCharges || 0).toLocaleString()}$</span>
                    </div>
                )}

                <div className="flex justify-between text-xs font-bold border-t border-white/10 pt-1 mt-1">
                    <span className="text-gray-300">Var. Nette (Mois):</span>
                    <span className={`font-mono privacy-blur ${(data.diffNW || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(data.diffNW || 0) > 0 ? '+' : ''}{(data.diffNW || 0).toLocaleString()}$
                    </span>
                </div>

                <div className="grid grid-cols-3 gap-1 mt-1 text-[9px] text-gray-400 border-b border-white/5 pb-2 mb-2">
                    <div className="text-center bg-white/5 rounded py-0.5">Cash: <br/><span className={(data.diffLiquid || 0) >= 0 ? 'text-green-300' : 'text-red-300'}>{(data.diffLiquid || 0) > 0 ? '+' : ''}{(data.diffLiquid || 0)}$</span></div>
                    <div className="text-center bg-white/5 rounded py-0.5">CELI: <br/><span className={(data.diffCELI || 0) >= 0 ? 'text-green-300' : 'text-red-300'}>{(data.diffCELI || 0) > 0 ? '+' : ''}{(data.diffCELI || 0)}$</span></div>
                    <div className="text-center bg-white/5 rounded py-0.5">REER: <br/><span className={(data.diffREER || 0) >= 0 ? 'text-green-300' : 'text-red-300'}>{(data.diffREER || 0) > 0 ? '+' : ''}{(data.diffREER || 0)}$</span></div>
                </div>
            </div>

            <div className="bg-black/30 p-2 rounded-lg space-y-1.5 text-xs text-white border border-white/5 mb-3">
                <div className="flex justify-between"><span className="text-gray-500">Cash (Coussin):</span> <span className="font-mono privacy-blur">{(data.Liquidites || 0).toLocaleString()}$</span></div>
                <div className="flex justify-between"><span className="text-green-500">CELI:</span> <span className="font-mono privacy-blur">{(data.CELI || 0).toLocaleString()}$</span></div>
                <div className="flex justify-between"><span className="text-blue-500">REER:</span> <span className="font-mono privacy-blur">{(data.REER || 0).toLocaleString()}$</span></div>
                {(data.REEE || 0) > 0 && <div className="flex justify-between"><span className="text-cyan-400">REEE (Études):</span> <span className="font-mono privacy-blur">{(data.REEE || 0).toLocaleString()}$</span></div>}
                <div className="flex justify-between"><span className="text-orange-500">Non-Enreg:</span> <span className="font-mono privacy-blur">{(data.NonReg || 0).toLocaleString()}$</span></div>
                {(data.Crypto || 0) > 0 && <div className="flex justify-between"><span className="text-purple-500">Crypto:</span> <span className="font-mono privacy-blur">{(data.Crypto || 0).toLocaleString()}$</span></div>}
                <div className="flex justify-between"><span className="text-pink-500">Immobilier:</span> <span className="font-mono privacy-blur">{(data.Immobilier || 0).toLocaleString()}$</span></div>
            </div>

            <div className="flex justify-between font-black text-sm text-white bg-white/10 p-2 rounded border border-white/20">
                <span>Valeur Nette:</span> <span className="font-mono privacy-blur">{(data.NetWorth || 0).toLocaleString()}$</span>
            </div>

            {((data.ImpotLatent || 0) < 0 || (data.FluxImpots || 0) < 0) && (
                <div className="mt-2 space-y-1">
                    {(data.ImpotLatent || 0) < 0 && <div className="flex justify-between text-xs"><span className="text-red-500 font-bold">Impôt Latent (Dette):</span> <span className="font-mono text-red-400 privacy-blur">{(data.ImpotLatent || 0).toLocaleString()}$</span></div>}
                    {(data.FluxImpots || 0) < 0 && <div className="flex justify-between text-xs"><span className="text-red-500 font-bold">Impôt Payé (Avril):</span> <span className="font-mono text-red-400 privacy-blur">{(data.FluxImpots || 0).toLocaleString()}$</span></div>}
                </div>
            )}

            {(data.lifeEvents?.length > 0 || data.flowEvents?.length > 0) && (
                <div className="mt-3 pt-2 border-t border-white/20">
                    {data.lifeEvents?.length > 0 && (
                        <div className="mb-2">
                            <span className="text-[9px] uppercase text-yellow-500 font-bold tracking-widest">Événements</span>
                            <ul className="text-xs text-yellow-300 mt-1 font-bold space-y-1">
                                {data.lifeEvents?.map((e: string, i: number) => <li key={i}>{e}</li>)}
                            </ul>
                        </div>
                    )}
                    {data.flowEvents?.length > 0 && (
                        <div>
                            <span className="text-[9px] uppercase text-gray-500 font-bold tracking-widest">Flux d'Épargne</span>
                            <ul className="text-[10px] text-gray-300 mt-1 space-y-1 font-mono">
                                {data.flowEvents?.map((e: string, i: number) => <li key={i} className={e.includes('Survie') ? 'text-red-300' : 'text-blue-300'}>⫪ {e}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const CustomLifeEventLabel = (props: any) => {
    const { x, y, value, index } = props;
    const dyOffsets = [-25, -45, -65, 25, 45];
    const dy = dyOffsets[index % dyOffsets.length];
    return (
        <text x={x} y={y} dy={dy} fill="#facc15" fontSize={11} textAnchor="middle" fontWeight="black" style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.8))' }}>
            {value}
        </text>
    );
};

const CustomFlowEventLabel = (props: any) => {
    const { x, y, value } = props;
    return (
        <text x={x} y={y} dy={-10} fill="#60a5fa" fontSize={8} textAnchor="middle" opacity={0.6}>
            {value}
        </text>
    );
};

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
                    const type: string = mappedAsset?.accountType || 'NON-ENREG';

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
        startMonth
    }), [projection, calculatedStartingCash, liveCSVBalances, realEstateGoals, debts, childGoals, travelGoals, lifeEvents, retirementGoal, config, baseGrossAnnual, baseNetAnnual, currentRentExpense, baseMonthlyExpenses]);

    const results = useMemo<any>(() => {
        try {
            return calculateFutureProjection(params, runMC, selectedScenarioIdx);
        } catch (e) {
            console.error("CRITICAL SIMULATION ERROR:", e);
            return { chartData: [], fireNumber: 0, aiNote: "Error", allResults: [] };
        }
    }, [params, runMC, selectedScenarioIdx]);

    const { chartData = [], fireNumber = 0, aiNote = "", allResults = [] } = (results || {}) as any;

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
            {/* Scenario Selector */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {allResults.map((res: any, idx: number) => (
                    <button
                        key={idx}
                        onClick={() => setSelectedScenarioIdx(idx)}
                        className={`p-4 rounded-xl border transition-all text-left relative overflow-hidden group ${
                            selectedScenarioIdx === idx
                            ? 'bg-primary/20 border-primary ring-1 ring-primary'
                            : 'bg-surface/40 border-white/5 hover:border-white/20'
                        }`}
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">{res.icon}</span>
                            <div>
                                <div className="text-xs font-bold text-white leading-tight">{res.strategyName}</div>
                                <div className="text-[10px] text-gray-400">Patrimoine: {Math.round(res.estateNetWorth/1000000).toFixed(1)}M$</div>
                            </div>
                        </div>
                        {selectedScenarioIdx === idx && (
                            <div className="absolute top-0 right-0 w-8 h-8 bg-primary/20 rounded-bl-xl flex items-center justify-center">
                                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                            </div>
                        )}
                    </button>
                ))}
            </div>

            <Card className="bg-surface/80 backdrop-blur-md">
                {/* AI Insight Box */}
                {aiNote && (
                    <div className="mb-6 p-4 rounded-xl bg-primary/10 border border-primary/20 flex gap-4 items-start">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                            🤖
                        </div>
                        <div>
                            <p className="text-sm text-gray-200 leading-relaxed" dangerouslySetInnerHTML={{ __html: aiNote.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                            <div className="flex gap-4 mt-2">
                                 <div className="text-[10px] text-emerald-400 font-bold">Pros: {allResults[selectedScenarioIdx]?.pros?.join(', ') || 'N/A'}</div>
                                <div className="text-[10px] text-red-400 font-bold">Cons: {allResults[selectedScenarioIdx]?.cons?.join(', ') || 'N/A'}</div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex justify-center mb-6">
                    <div className="bg-black/50 p-1 rounded-lg border border-white/10 flex">
                        <button
                            onClick={() => updateProj('useTheoretical', false)}
                            className={`px-6 py-2 text-sm font-bold rounded-md transition-all ${!projection.useTheoretical ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            🔗 Données Réelles
                        </button>
                        <button
                            onClick={() => updateProj('useTheoretical', true)}
                            className={`px-6 py-2 text-sm font-bold rounded-md transition-all ${projection.useTheoretical ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            🧪 Mode Sandbox
                        </button>
                    </div>
                    <div className="ml-4 flex items-center gap-2">
                        <button
                            onClick={() => setRunMC(!runMC)}
                            className={`px-4 py-2 text-[10px] font-bold rounded-md border transition-all ${runMC ? 'bg-orange-500/20 border-orange-500/50 text-orange-300' : 'bg-gray-800 border-white/10 text-gray-400'}`}
                        >
                            🎲 Monte Carlo {runMC ? 'ON' : 'OFF'}
                        </button>
                        <button
                            onClick={() => updateProj('useSmileCurve', !projection.useSmileCurve)}
                            title="Courbe en U des dépenses retraite (étude CIBC): go-go +15%, slow-go base, no-go -10%"
                            className={`px-4 py-2 text-[10px] font-bold rounded-md border transition-all ${projection.useSmileCurve ? 'bg-pink-500/20 border-pink-500/50 text-pink-300' : 'bg-gray-800 border-white/10 text-gray-400'}`}
                        >
                            😊 Smile Curve {projection.useSmileCurve ? 'ON' : 'OFF'}
                        </button>
                    </div>
                </div>

                {/* D2.8: Toggles Mortalité stochastique + LTC */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                    <button
                        onClick={() => updateProj('useStochasticMortality', !projection.useStochasticMortality)}
                        title="Active des tirages aléatoires de date de décès (tables Stats Can 2020-2022) en mode Monte Carlo. La simulation s'arrête à la mort."
                        className={`px-3 py-2 text-[11px] font-bold rounded-md border transition-all ${projection.useStochasticMortality ? 'bg-violet-500/20 border-violet-500/50 text-violet-300' : 'bg-gray-800 border-white/10 text-gray-400'}`}
                    >
                        ⚰️ Mortalité stochastique {projection.useStochasticMortality ? 'ON' : 'OFF'}
                    </button>
                    <button
                        onClick={() => updateProj('ltcEnabled', !projection.ltcEnabled)}
                        title="Soins de longue durée (CHSLD/RPA). Probabilité croissante après 65 ans (1% → 25%/an). Coût mensuel ajouté aux dépenses."
                        className={`px-3 py-2 text-[11px] font-bold rounded-md border transition-all ${projection.ltcEnabled ? 'bg-red-500/20 border-red-500/50 text-red-300' : 'bg-gray-800 border-white/10 text-gray-400'}`}
                    >
                        🏥 LTC stochastique {projection.ltcEnabled ? 'ON' : 'OFF'}
                    </button>
                </div>
                {projection.ltcEnabled && (
                    <div className="mb-4 p-3 rounded-lg border border-red-500/20 bg-black/30">
                        <label className="flex justify-between text-xs text-gray-300 mb-1">
                            <span>Coût mensuel soins ($/mois)</span>
                            <span className="text-red-300 font-bold">{projection.ltcMonthlyCost ?? 5000}$</span>
                        </label>
                        <input
                            type="range" min="2000" max="12000" step="500"
                            value={projection.ltcMonthlyCost ?? 5000}
                            onChange={e => updateProj('ltcMonthlyCost', Number(e.target.value))}
                            className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-red-500"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">CHSLD public ~2000$, RPA semi-privé ~4500$, soins privés à domicile 8000-12000$.</p>
                    </div>
                )}

                {/* D2.7: Champs Withholding tax US sur CELI */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 p-3 rounded-lg border border-white/5 bg-black/30">
                    <div>
                        <label className="flex justify-between text-xs text-gray-300 mb-1">
                            <span>🇺🇸 Part actions US dans CELI (%)</span>
                            <span className="text-blue-300 font-bold">{projection.usEquityShareCeli ?? 0}%</span>
                        </label>
                        <input
                            type="range" min="0" max="100" step="5"
                            value={projection.usEquityShareCeli ?? 0}
                            onChange={e => updateProj('usEquityShareCeli', Number(e.target.value))}
                            className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">VOO/SPY/QQQ... Le CELI n'est PAS protégé du withholding US 15% (le REER si).</p>
                    </div>
                    <div>
                        <label className="flex justify-between text-xs text-gray-300 mb-1">
                            <span>Rendement dividende US (%)</span>
                            <span className="text-blue-300 font-bold">{(projection.usEquityDividendYield ?? 1.5).toFixed(1)}%</span>
                        </label>
                        <input
                            type="range" min="0" max="5" step="0.1"
                            value={projection.usEquityDividendYield ?? 1.5}
                            onChange={e => updateProj('usEquityDividendYield', Number(e.target.value))}
                            className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">Yield moyen S&P 500 ≈ 1.5%. Drag annuel = part × yield × 15%.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="space-y-4">
                        <h4 className={`text-xs font-bold uppercase tracking-widest border-b pb-1 ${projection.useTheoretical ? 'text-purple-400 border-purple-500/20' : 'text-emerald-400 border-emerald-500/20'}`}>Flux Mensuels</h4>
                        <div className={!projection.useTheoretical ? 'opacity-50 pointer-events-none' : ''}>
                            <label className="flex justify-between text-xs text-gray-300 mb-1">
                                <span>Revenus (Net)</span>
                                <span className="text-green-400 font-bold privacy-blur">{projection.theoreticalIncome || 8000}$</span>
                            </label>
                            <input type="range" min="2000" max="20000" step="100" value={projection.theoreticalIncome || 8000} onChange={e => updateProj('theoreticalIncome', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-green-500" />
                        </div>
                        <div className={!projection.useTheoretical ? 'opacity-50 pointer-events-none' : ''}>
                            <label className="flex justify-between text-xs text-gray-300 mb-1">
                                <span>Dépenses</span>
                                <span className="text-red-400 font-bold privacy-blur">{projection.theoreticalExpenses || 4000}$</span>
                            </label>
                            <input type="range" min="1000" max="15000" step="100" value={projection.theoreticalExpenses || 4000} onChange={e => updateProj('theoreticalExpenses', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-red-500" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-white/10 pb-1 flex justify-between">
                            Facteurs Macro
                        </h4>
                        <div>
                            <label className="flex justify-between text-xs text-gray-300 mb-1">
                                <span>Horizon (Années)</span>
                                <span className="text-purple-400 font-bold">{projection.years || 30}</span>
                            </label>
                            <input type="range" min="5" max="50" step="1" value={projection.years || 30} onChange={e => updateProj('years', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-purple-500" />
                        </div>
                        <div>
                            <label className="flex justify-between text-xs text-gray-300 mb-1">
                                <span>Inflation</span>
                                <span className="text-red-400 font-bold">{projection.inflationRate}%</span>
                            </label>
                            <input type="range" min="0" max="8" step="0.1" value={projection.inflationRate} onChange={e => updateProj('inflationRate', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-red-500" />
                        </div>
                        <div>
                            <label className="flex justify-between text-xs text-gray-300 mb-1">
                                <span>Hausse Salaire (An)</span>
                                <span className="text-blue-400 font-bold">{projection.salaryGrowth ?? 2.5}%</span>
                            </label>
                            <input type="range" min="0" max="10" step="0.1" value={projection.salaryGrowth ?? 2.5} onChange={e => updateProj('salaryGrowth', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-blue-500" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-white/10 pb-1 flex justify-between items-center">
                            <span>Rendements Estimés</span>
                            {liveCSVBalances.historicalRate > 0 && (
                                <button
                                    onClick={applyHistoricalRate}
                                    className="text-[9px] bg-blue-500/20 text-blue-300 hover:bg-blue-500/40 hover:text-white px-1.5 py-0.5 rounded transition-colors"
                                    title="Appliquer le rendement historique réel de votre Google Sheet"
                                >
                                    🪴 Auto ({liveCSVBalances.historicalRate.toFixed(1)}%)
                                </button>
                            )}
                        </h4>
                        <div>
                            <label className="flex justify-between text-xs text-gray-300 mb-1">
                                <span>CELI (Tax Free)</span>
                                <span className="text-yellow-400 font-bold">{projection.returnRates?.celi || 7}%</span>
                            </label>
                            <input type="range" min="2" max="15" step="0.1" value={projection.returnRates?.celi || 7} onChange={e => updateReturnRate('celi', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-yellow-500" />
                        </div>
                        <div>
                            <label className="flex justify-between text-xs text-gray-300 mb-1">
                                <span>Non-Enregistré / REER</span>
                                <span className="text-yellow-400 font-bold">{projection.returnRates?.nonReg || 6.5}%</span>
                            </label>
                            <input type="range" min="2" max="15" step="0.1" value={projection.returnRates?.nonReg || 6.5} onChange={e => { updateReturnRate('nonReg', Number(e.target.value)); updateReturnRate('reer', Number(e.target.value)); }} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-yellow-500" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-white/10 pb-1">Paramètres Spéciaux</h4>
                        <div>
                            <label className="flex justify-between text-xs text-gray-300 mb-1">
                                <span>Coussin de Sécurité</span>
                                <span className="text-blue-400 font-bold">{projection.emergencyFundMonths || 3} Mois</span>
                            </label>
                            <input type="range" min="1" max="12" step="1" value={projection.emergencyFundMonths || 3} onChange={e => updateProj('emergencyFundMonths', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-blue-500" />
                        </div>
                        <div>
                            <label className="flex justify-between text-xs text-gray-300 mb-1">
                                <span>Valeur Max Maison</span>
                                <span className="text-pink-400 font-bold privacy-blur">{((realEstateGoals[0]?.maxValue || 1000000)/1000).toFixed(0)}k$</span>
                            </label>
                            <input type="range" min="300000" max="3000000" step="50000" value={realEstateGoals[0]?.maxValue || 1000000} onChange={e => {
                                const updated = [...realEstateGoals];
                                if (updated[0]) {
                                    updated[0] = { ...updated[0], maxValue: Number(e.target.value) };
                                    setRealEstateGoals?.(updated);
                                }
                            }} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-pink-500" />
                            <p className="text-[9px] text-gray-500 mt-1">Plafond de croissance immo.</p>
                        </div>
                    </div>
                </div>
            </Card>

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
