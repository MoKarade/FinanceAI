import React, { useState, useMemo, useEffect } from 'react';
import { Card } from './ui/Card';
import { PageHeader } from './ui/PageHeader';
import { Icon } from './ui/Icon';
import { Badge } from './ui/Badge';
import { ProjectionConfig, RetirementGoal, BudgetConfig, ChildGoal, TravelGoal, LifeEvent, Debt, RealEstateGoal, BudgetCategory, Asset, RegisteredAccountType } from '../types';
import { ProjectionChartPoint } from '../services/projection/types';
import { Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ComposedChart, Line, Legend, AreaChart } from 'recharts';
import { useTimeChartZoom } from '../hooks/useTimeChartZoom';
import { ZoomContainer } from './ui/ZoomContainer';
import { TaxBracketViz } from './TaxBracketViz';
import { GoalSeekerCard } from './retirement/GoalSeekerCard';
import { AssetLocationCard } from './retirement/AssetLocationCard';
import { CurrentCapitalCard } from './retirement/CurrentCapitalCard';
import { fetchPortfolioHistory } from '../services/finance';
import { calculateGrossFromNet } from '../services/tax';
import { useFinanceStore } from '../store/useFinanceStore';
import { useShallow } from 'zustand/shallow';
import { ProjectionRequired } from './ui/ProjectionRequired';

// Sprint 2 PH3 — constante stable pour éviter de créer un nouveau [] à chaque
// render (qui invaliderait les useMemo deps de la projection).
const EMPTY_ARRAY: never[] = [];

interface RetirementProps {
    goal: RetirementGoal;
    setGoal: (g: RetirementGoal) => void;
    currentREER: number;
    currentCELI: number;
    currentNonReg: number;
    calculatedMonthlySavings: number;
    grossIncome?: number;
    projection: ProjectionConfig;
    config: BudgetConfig;
    assets?: Asset[];
    initialBalances?: Record<string, number>;
    budgetItems?: BudgetCategory[];
    realEstateGoals?: RealEstateGoal[];
    childGoals?: ChildGoal[];
    travelGoals?: TravelGoal[];
    lifeEvents?: LifeEvent[];
    debts?: Debt[];
}

export const Retirement: React.FC<RetirementProps> = ({
    goal, setGoal,
    currentREER, currentCELI, currentNonReg,
    calculatedMonthlySavings,
    projection, config,
    assets = [], initialBalances = {}, budgetItems = [],
    realEstateGoals = [], childGoals = [], travelGoals = [], lifeEvents = [], debts = []
}) => {
    const setAppState = useFinanceStore(s => s.setAppState);
    // Sprint 2 PH3 — Regroupement W5.x via useShallow. Ces valeurs sont lues
    // depuis le store pour que le composant se re-render si elles changent
    // (cohérence avec FutureProjection qui les consomme), même si Retirement
    // ne les utilise pas directement (il consomme lastProjection.chartData).
    useFinanceStore(useShallow(s => ({
        insurancePolicies: s.insurancePolicies ?? EMPTY_ARRAY,
        vehicleReplacements: s.vehicleReplacements ?? EMPTY_ARRAY,
        majorRenovations: s.majorRenovations ?? EMPTY_ARRAY,
        charitableGoals: s.charitableGoals ?? EMPTY_ARRAY,
        rentalProperties: s.rentalProperties ?? EMPTY_ARRAY,
        privateBusinesses: s.privateBusinesses ?? EMPTY_ARRAY,
        savingsGoals: s.savingsGoals ?? EMPTY_ARRAY,
        financialGoals: s.financialGoals ?? EMPTY_ARRAY,
    })));
    // Phase C.3 — `lifeExpectancy` lu depuis le store (retirementGoal). Le Hub
    // Configuration (Phase C.1) sera l'endroit canonique pour le modifier ; le
    // slider local reste pour rétrocompat et exploration rapide.
    const retirementGoalStore = useFinanceStore(s => s.retirementGoal);
    const lifeExpectancy = retirementGoalStore?.lifeExpectancy ?? 90;
    const setLifeExpectancy = (v: number) =>
        setAppState({ retirementGoal: { ...retirementGoalStore, lifeExpectancy: v } });
    const [currentAge, setCurrentAge] = useState(config.users[0]?.age || 30);
    // States Goal Seeker / Asset Location déplacés dans leurs sous-composants
    // (refactor architecture cycle 2 — réduction Retirement.tsx de 700→527 lignes).

    useEffect(() => {
        if (config.users[0]?.age) setCurrentAge(config.users[0].age);
    }, [config]);

    const [liveCSVBalances, setLiveCSVBalances] = useState({
        CELI: currentCELI, CELIAPP: 0, REER: currentREER, NON_ENREG: currentNonReg, CRYPTO: 0, REEE: 0, TOTAL: currentCELI + currentREER + currentNonReg, historicalRate: 0
    });

    useEffect(() => {
        setLiveCSVBalances(prev => ({ ...prev, CELI: currentCELI, REER: currentREER, NON_ENREG: currentNonReg, TOTAL: currentCELI + currentREER + currentNonReg }));

        let cancelled = false;
        const fetchLiveTotals = async () => {
            try {
                const history = await fetchPortfolioHistory();
                if (cancelled) return;
                if (history.length > 0) {
                    const lastRow = history[history.length - 1];
                    let celi = 0, celiapp = 0, reer = 0, nonReg = 0, crypto = 0, reee = 0, total = 0;
                    Object.keys(lastRow).forEach(key => {
                        if (key === 'date' || key === 'Date' || key.startsWith('Taux')) return;
                        const val = Number(lastRow[key]) || 0;
                        if (key.includes('TOTAL')) { total = val; return; }
                        const mappedAsset = assets.find(a => key.includes(a.symbol));
                        // Fix TS2367 : `type` elargi en string pour autoriser CELIAPP (pas dans Asset.accountType union).
                        // CELIAPP / FHSA est un compte legitime au Canada (Compte d'epargne libre d'impot pour
                        // l'achat d'une premiere propriete) que le type Asset.accountType ne prevoit pas encore.
                        const type: RegisteredAccountType = mappedAsset?.accountType || 'NON-ENREG';
                        if (type === 'CELI') celi += val;
                        else if (type === 'CELIAPP') celiapp += val;
                        else if (type === 'REER') reer += val;
                        else if (type === 'CRYPTO') crypto += val;
                        else if (key.includes('REEE')) reee += val;
                        else nonReg += val;
                    });
                    if (cancelled) return;
                    setLiveCSVBalances({
                        CELI: celi || currentCELI, CELIAPP: celiapp,
                        REER: reer || currentREER, NON_ENREG: nonReg || currentNonReg,
                        CRYPTO: crypto, REEE: reee, TOTAL: total || (currentCELI + currentREER + currentNonReg),
                        historicalRate: 0
                    });
                }
            } catch (e) {
                // Fix silent-failure #4 : log au lieu de swallow silencieux
                console.warn('[Retirement] fetchLiveTotals failed:', e);
            }
        };
        fetchLiveTotals();
        return () => { cancelled = true; };
    }, [assets, currentCELI, currentREER, currentNonReg]);

    const updateGoal = (field: keyof RetirementGoal, value: number) => {
        setGoal({ ...goal, [field]: value });
    };

    const baseNetAnnual = useMemo(() => config.users.reduce((sum: number, u) => sum + ((u.netSalary || u.salary || 0) * 12), 0), [config]);
    const baseGrossAnnual = useMemo(() => config.users.reduce((sum: number, u) => {
        if (u.grossSalary) return sum + (u.grossSalary * 12);
        const netAnnual = (u.netSalary || u.salary || 0) * 12;
        return sum + calculateGrossFromNet(netAnnual);
    }, 0), [config]);

    const baseMonthlyExpenses = Math.max(0, (baseNetAnnual / 12) - calculatedMonthlySavings);

    const currentRentExpense = useMemo(() => {
        const rentItem = budgetItems.find(b => b.name.toLowerCase().includes('loyer') || b.name.toLowerCase().includes('hypothèque'));
        return rentItem ? (rentItem.frequency === 'Yearly' ? rentItem.target / 12 : rentItem.target) : 1600;
    }, [budgetItems]);

    const calculatedStartingCash = useMemo(() => {
        let cash = 0;
        (Object.values(initialBalances) as number[]).forEach(v => cash += v);
        return cash;
    }, [initialBalances]);

    // 2026-05-21 — Mode strict centralisation :
    // Retirement consomme EXCLUSIVEMENT `store.lastProjection.chartData`
    // produit par FutureProjection.tsx. Plus de Worker local de fallback
    // (qui divergeait des chiffres affichés par Future). Si la projection
    // n'a pas encore été calculée, on affiche <ProjectionRequired> et
    // l'utilisateur va dans Future pour la déclencher.
    //
    // Convention "valeurs réelles ou rien" : pas d'invention de valeurs
    // approximatives quand la source canonique est indisponible.
    const projectionFromStore = useFinanceStore(s => s.lastProjection?.chartData ?? null);
    const activeScenarioName = useFinanceStore(s => s.lastProjection?.strategyName ?? null);
    // chartData dérivé de projectionFromStore : utilisé uniquement dans le JSX
    // après les hooks. Pour les useMemo, on dépend de projectionFromStore directement
    // afin d'éviter la nouvelle référence `?? []` qui invaliderait les deps à chaque render.
    const chartData = projectionFromStore ?? [];
    const hasProjection = chartData.length > 0;

    const yearlyData = useMemo(() => {
        // Dépend de projectionFromStore (stable) et non de chartData (expr. logique instable)
        if (!projectionFromStore || projectionFromStore.length === 0) return [];
        return projectionFromStore.filter(d => d.monthIndex % 12 === 0).map(d => ({
            ...d,
            TotalCapital: (d.CELI ?? 0) + (d.REER ?? 0) + (d.NonReg ?? 0) + (d.Liquidites ?? 0) + (d.CELIAPP ?? 0),
        }));
    }, [projectionFromStore]);

    const retirementPoint = yearlyData.find(d => (d.age ?? 0) >= goal.targetAge);
    const retirementNetWorth = retirementPoint?.NetWorth || 0;
    const peakNetWorth = yearlyData.length > 0 ? Math.max(...yearlyData.map(d => d.NetWorth)) : 0;
    const finalNetWorth = yearlyData.length > 0 ? yearlyData[yearlyData.length - 1]?.NetWorth || 0 : 0;

    const retirementData = yearlyData.filter(d => (d.age ?? 0) >= goal.targetAge);
    const lifeExpectancyData = yearlyData.filter(d => (d.age ?? 0) <= lifeExpectancy);
    const bankruptcyPoint = retirementData.find(d => d.TotalCapital <= 0);

    // G7c — zoom molette / pan sur les deux graphes Retraite (x = âge).
    type YearlyPoint = ProjectionChartPoint & { TotalCapital: number };
    const zoomAccum = useTimeChartZoom<YearlyPoint>(lifeExpectancyData as YearlyPoint[]);
    const zoomCashflow = useTimeChartZoom<YearlyPoint>(retirementData as YearlyPoint[]);
    const bankruptcyAge = bankruptcyPoint?.age;

    // Mode strict : pas de projection = pas de données. Aucune invention.
    if (!hasProjection) {
        return (
            <div className="space-y-6 stagger-in pb-20">
                <PageHeader
                    icon={<Icon name="retirement" size={28} />}
                    title="Planification Retraite"
                    subtitle="Simulation complète basée sur le moteur FIRE — mêmes données que l'onglet Future."
                />
                <ProjectionRequired feature="La simulation de retraite" />
            </div>
        );
    }

    return (
        <div className="space-y-6 stagger-in pb-20">
            <PageHeader
                icon={<Icon name="retirement" size={28} />}
                title="Planification Retraite"
                subtitle={activeScenarioName
                    ? `Scénario actif : ${activeScenarioName} — synchronisé avec Future`
                    : "Simulation complète basée sur le moteur FIRE — mêmes données que l'onglet Future."}
                badge={
                    <Badge variant={bankruptcyAge ? 'danger' : 'success'} size="md">
                        {bankruptcyAge ? `⚠️ Capital épuisé à ${bankruptcyAge} ans` : `🚀 Succès jusqu'à ${lifeExpectancy} ans`}
                    </Badge>
                }
            />


            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                    <Card title="Parametres de Vie">
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-meta text-ink-300 mb-1">Age Actuel</label>
                                    <input type="number" min="18" max="80" value={currentAge} onChange={e => {
                                        const val = Number(e.target.value);
                                        setCurrentAge(val);
                                        setAppState({ config: { ...config, users: config.users.map((u, i) => i === 0 ? { ...u, age: val } : u) as BudgetConfig['users'] } });
                                    }} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white font-bold focus:border-primary transition-colors outline-none" />
                                </div>
                                <div>
                                    <label className="block text-meta text-ink-300 mb-1">Age Retraite</label>
                                    <input type="number" value={goal.targetAge} onChange={e => updateGoal('targetAge', Number(e.target.value))} className="w-full bg-black/40 border border-info-500/30 rounded-lg px-3 py-2 text-info-400 font-bold focus:border-info-500 transition-colors outline-none" />
                                </div>
                            </div>
                            <div>
                                <label className="flex justify-between text-meta text-ink-300 mb-1">
                                    <span>Esperance de vie</span>
                                    <span className="text-white font-black">{lifeExpectancy} ans</span>
                                </label>
                                <input type="range" min="80" max="100" value={lifeExpectancy} onChange={e => setLifeExpectancy(Number(e.target.value))} className="w-full h-1.5 bg-black/50 rounded-lg appearance-none cursor-pointer accent-ink-300" />
                            </div>
                        </div>
                    </Card>

                    {/* Phase F.5 — extraction Card "Capitaux Actuels" en sous-composant */}
                    <CurrentCapitalCard
                        balances={{ REER: liveCSVBalances.REER, CELI: liveCSVBalances.CELI, NON_ENREG: liveCSVBalances.NON_ENREG }}
                        targetAge={goal.targetAge}
                        lifeExpectancy={lifeExpectancy}
                        retirementNetWorth={retirementNetWorth}
                        peakNetWorth={peakNetWorth}
                        finalNetWorth={finalNetWorth}
                    />

                    <Card title="Revenus & Besoins (Retraite)">
                        <div className="space-y-5">
                            <div>
                                <label className="block text-meta text-ink-300 mb-1">Besoin Mensuel (Aujourd'hui)</label>
                                <input type="number" value={goal.targetMonthlyIncome} onChange={e => updateGoal('targetMonthlyIncome', Number(e.target.value))} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white font-bold focus:border-primary transition-colors outline-none privacy-blur" />
                            </div>
                            <div>
                                <label className="block text-meta text-ink-300 mb-1">Rente Etat agrégée (RRQ + PSV / mois) — legacy</label>
                                <input type="number" value={goal.governmentPension} onChange={e => updateGoal('governmentPension', Number(e.target.value))} className="w-full bg-black/40 border border-info-500/20 rounded-lg px-3 py-2 text-blue-300 font-bold focus:border-info-500 transition-colors outline-none privacy-blur" />
                                <p className="text-tiny text-ink-500 mt-1">Si tu remplis les 2 champs ci-dessous, ce champ est ignoré.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                                <div>
                                    <label className="block text-meta text-ink-300 mb-1">🇨🇦 RRQ projetée / mois (par personne)</label>
                                    <input
                                        type="number"
                                        value={goal.rrqEstimateMonthly ?? ''}
                                        placeholder="ex: 1100"
                                        onChange={e => updateGoal('rrqEstimateMonthly', Number(e.target.value))}
                                        className="w-full bg-black/40 border border-info-500/20 rounded-lg px-3 py-2 text-blue-300 text-body focus:border-info-500 transition-colors outline-none"
                                    />
                                    <p className="text-tiny text-ink-500 mt-1">Max 2025: 1 433$/mois. Consulte ton relevé RRQ.</p>
                                </div>
                                <div>
                                    <label className="block text-meta text-ink-300 mb-1">🍁 PSV projetée / mois</label>
                                    <input
                                        type="number"
                                        value={goal.psvEstimateMonthly ?? ''}
                                        placeholder="ex: 734"
                                        onChange={e => updateGoal('psvEstimateMonthly', Number(e.target.value))}
                                        className="w-full bg-black/40 border border-info-500/20 rounded-lg px-3 py-2 text-blue-300 text-body focus:border-info-500 transition-colors outline-none"
                                    />
                                    <p className="text-tiny text-ink-500 mt-1">Max 2025: 734$/mois (40 ans résidence).</p>
                                </div>
                            </div>
                            <div className="pt-3 border-t border-white/5">
                                <label className="block text-meta text-ink-300 mb-1">Pension employeur DB (prestations determinees) / mois</label>
                                <input
                                    type="number"
                                    value={goal.dbPensionMonthly ?? 0}
                                    onChange={e => updateGoal('dbPensionMonthly', Number(e.target.value))}
                                    placeholder="0"
                                    className="w-full bg-black/40 border border-success-500/20 rounded-lg px-3 py-2 text-emerald-300 font-bold focus:border-success-500 transition-colors outline-none privacy-blur"
                                />
                                <p className="text-tiny text-ink-500 mt-1">RREGOP, fonction publique federale, regime garanti viager. Laisse 0 si tu n'as que du REER/CD.</p>
                            </div>
                            {(goal.dbPensionMonthly ?? 0) > 0 && (
                                <div className="grid grid-cols-2 gap-3 pb-3 border-b border-white/5">
                                    <div>
                                        <label className="block text-meta text-ink-300 mb-1">Option DB (au décès)</label>
                                        <select
                                            value={goal.dbElectionType ?? 'joint60'}
                                            onChange={e => setGoal({ ...goal, dbElectionType: e.target.value as RetirementGoal['dbElectionType'] })}
                                            className="w-full bg-black/40 border border-success-500/10 rounded-lg px-3 py-2 text-emerald-200 text-body"
                                        >
                                            <option value="single">Vie seule (rente cesse)</option>
                                            <option value="joint60">Conjoint à 60% (recommandé)</option>
                                            <option value="joint66">Conjoint à 66%</option>
                                            <option value="joint100">Conjoint à 100% (rente réduite)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-meta text-ink-300 mb-1">% rente survivant</label>
                                        <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={goal.dbSurvivorPct ?? 60}
                                            onChange={e => updateGoal('dbSurvivorPct', Number(e.target.value))}
                                            className="w-full bg-black/40 border border-success-500/10 rounded-lg px-3 py-2 text-emerald-200 text-body"
                                        />
                                    </div>
                                </div>
                            )}
                            {(goal.dbPensionMonthly ?? 0) > 0 && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-meta text-ink-300 mb-1">Indexation IPC (%)</label>
                                        <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={goal.dbPensionIndexationPct ?? 100}
                                            onChange={e => updateGoal('dbPensionIndexationPct', Number(e.target.value))}
                                            className="w-full bg-black/40 border border-success-500/10 rounded-lg px-3 py-2 text-emerald-200 text-body focus:border-success-500 transition-colors outline-none"
                                        />
                                        <p className="text-tiny text-ink-500 mt-1">100 = pleine indexation, 50 = demi, 0 = nominale</p>
                                    </div>
                                    <div>
                                        <label className="block text-meta text-ink-300 mb-1">Age debut versement</label>
                                        <input
                                            type="number"
                                            min={50}
                                            max={75}
                                            value={goal.dbPensionStartAge ?? goal.targetAge}
                                            onChange={e => updateGoal('dbPensionStartAge', Number(e.target.value))}
                                            className="w-full bg-black/40 border border-success-500/10 rounded-lg px-3 py-2 text-emerald-200 text-body focus:border-success-500 transition-colors outline-none"
                                        />
                                        <p className="text-tiny text-ink-500 mt-1">Defaut = age cible retraite</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* W4.1 — Tax bracket viz */}
                    <TaxBracketViz annualGrossIncome={baseGrossAnnual} label="revenu actuel" />

                    {/* W1.5 — Goal Seeking + W2.6 Drawdown (extrait dans GoalSeekerCard) */}
                    <GoalSeekerCard
                        paramsBuilder={() => ({
                            projection, calculatedStartingCash, liveCSVBalances,
                            realEstateGoals, debts, childGoals, travelGoals, lifeEvents,
                            retirementGoal: goal, config,
                            baseGrossAnnual, baseNetAnnual,
                            currentRentExpense, baseMonthlyExpenses,
                        })}
                        targetAge={goal.targetAge}
                    />

                    {/* Asset Location Optimizer (extrait dans AssetLocationCard) */}
                    <AssetLocationCard annualGrossIncome={baseGrossAnnual} />
                </div>

                <div className="lg:col-span-2 space-y-6">
                    {chartData.length === 0 ? (
                        <Card title="Simulation">
                            <div className="flex items-center justify-center h-64 text-ink-500">
                                <div className="text-center">
                                    <div className="text-4xl mb-3">⏳</div>
                                    <p>Chargement des donnees de portefeuille...</p>
                                    <p className="text-meta mt-2 text-ink-500">Assurez-vous d'avoir importe un CSV de portefeuille.</p>
                                </div>
                            </div>
                        </Card>
                    ) : (
                        <>
                            <Card icon={<Icon name="investments" size={18} />} title="Accumulation & Epuisement du Capital (Moteur FIRE)">
                                <ZoomContainer zoom={zoomAccum} className="h-[420px] w-full" style={{ minHeight: '420px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={zoomAccum.visibleData} margin={{ top: 20, right: 30, left: 10, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="retGradREER" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.75} />
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                                                </linearGradient>
                                                <linearGradient id="retGradCELI" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.75} />
                                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                                                </linearGradient>
                                                <linearGradient id="retGradNonReg" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.75} />
                                                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                                                </linearGradient>
                                                <linearGradient id="retGradLiq" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.5} />
                                                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.02} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" vertical={false} />
                                            <XAxis dataKey="age" stroke="#334155" tick={{ fontSize: 10, fill: '#64748b' }} tickMargin={10} tickFormatter={(val) => `${val} ans`} />
                                            <YAxis stroke="#334155" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k$`} width={55} />
                                            <Tooltip content={<RetirementTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.07)', strokeWidth: 2 }} />
                                            <Legend verticalAlign="top" iconType="circle" wrapperStyle={{ paddingBottom: '20px', fontSize: '12px' }} />
                                            <ReferenceLine x={goal.targetAge} stroke="#f97316" strokeDasharray="5 3" label={{ position: 'insideTopRight', value: `Retraite (${goal.targetAge}a) 🔥`, fill: '#f97316', fontSize: 11, fontWeight: 'bold', dy: -8 }} />
                                            <Area type="monotone" dataKey="Liquidites" stackId="1" fill="url(#retGradLiq)" stroke="#a78bfa" strokeWidth={1} name="Liquidites" fillOpacity={1} />
                                            <Area type="monotone" dataKey="NonReg" stackId="1" fill="url(#retGradNonReg)" stroke="#f59e0b" strokeWidth={1} name="Non-Enreg." fillOpacity={1} />
                                            <Area type="monotone" dataKey="CELI" stackId="1" fill="url(#retGradCELI)" stroke="#10b981" strokeWidth={1.5} name="CELI" fillOpacity={1} />
                                            <Area type="monotone" dataKey="REER" stackId="1" fill="url(#retGradREER)" stroke="#3b82f6" strokeWidth={1.5} name="REER" fillOpacity={1} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </ZoomContainer>

                                <div className="grid grid-cols-3 gap-4 mt-6">
                                    <div className="bg-black/30 p-4 rounded-xl border border-white/5 text-center shadow-inner">
                                        <div className="text-tiny text-ink-500 uppercase tracking-widest font-bold">Capital a la Retraite</div>
                                        <div className="text-2xl font-black text-info-400 privacy-blur mt-1 drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]">
                                            {(retirementNetWorth / 1000).toFixed(0)}k $
                                        </div>
                                    </div>
                                    <div className="bg-black/30 p-4 rounded-xl border border-white/5 text-center shadow-inner">
                                        <div className="text-tiny text-ink-500 uppercase tracking-widest font-bold">Pic du Patrimoine</div>
                                        <div className="text-2xl font-black text-success-400 privacy-blur mt-1 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]">
                                            {(peakNetWorth / 1000).toFixed(0)}k $
                                        </div>
                                    </div>
                                    <div className="bg-black/30 p-4 rounded-xl border border-white/5 text-center shadow-inner">
                                        <div className="text-tiny text-ink-500 uppercase tracking-widest font-bold">Heritage ({lifeExpectancy} ans)</div>
                                        <div className={`text-2xl font-black privacy-blur mt-1 ${finalNetWorth > 0 ? 'text-white' : 'text-danger-400'}`}>
                                            {finalNetWorth > 0 ? `${(finalNetWorth / 1000).toFixed(0)}k $` : 'Epuise ⚠️'}
                                        </div>
                                    </div>
                                </div>
                            </Card>

                            <Card icon={<Icon name="debt" size={18} />} title="Flux Financier durant la Retraite (Revenus vs Besoin)">
                                <ZoomContainer zoom={zoomCashflow} className="h-[280px] w-full" style={{ minHeight: '280px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={zoomCashflow.visibleData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" vertical={false} />
                                            <XAxis dataKey="age" stroke="#334155" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(val) => `${val}a`} />
                                            <YAxis stroke="#334155" tick={{ fontSize: 10, fill: '#64748b' }} width={50} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
                                            <Tooltip contentStyle={{ backgroundColor: '#0B0E14', borderColor: '#1e293b', borderRadius: '10px', color: '#fff' }} formatter={(val: number | string, name: string) => [`${Number(val).toLocaleString()}$`, name]} />
                                            <Legend iconType="circle" />
                                            <Area type="monotone" dataKey="IncomeRetirement" fill="#3b82f620" stroke="#3b82f6" strokeWidth={2} name="Rente Gouv. + PSV" />
                                            <Area type="monotone" dataKey="Income" fill="#10b98115" stroke="#10b981" strokeWidth={2} name="Revenu Total" />
                                            <Line type="monotone" dataKey="Expenses" stroke="#ef4444" strokeWidth={3} dot={false} name="Besoin (Infl.)" style={{ filter: 'drop-shadow(0px 2px 6px rgba(239,68,68,0.5))' }} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </ZoomContainer>
                                <div className="mt-4 text-meta text-ink-300 text-center bg-white/5 p-3 rounded-lg border border-white/10">
                                    La ligne rouge represente votre besoin mensuel ({goal.targetMonthlyIncome}$/mois), ajuste a l'inflation ({projection.inflationRate || 2}%) au fil du temps.
                                </div>
                            </Card>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

interface RetirementTooltipProps {
    active?: boolean;
    payload?: Array<{ payload: ProjectionChartPoint & { TotalCapital?: number; RetirementAge?: number; Savings?: number } }>;
    label?: number | string;
}

const RetirementTooltip = React.memo(({ active, payload }: RetirementTooltipProps) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;
    const isRetired = (data.age ?? 0) >= (data.RetirementAge ?? 65);

    return (
        <div className="bg-dark/95 backdrop-blur-md border border-white/10 p-4 rounded-xl shadow-2xl max-w-[280px] z-50">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/10">
                <span className="text-lg font-black text-white">Age: {data.age} ans</span>
                <span className={`text-meta font-bold px-2 py-1 rounded-md ${isRetired ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-info-500/10 text-info-400 border border-info-500/20'}`}>
                    {isRetired ? 'En Retraite 🏖️' : 'Accumulation 📈'}
                </span>
            </div>

            <div className="mb-4 space-y-2">
                <div className="flex justify-between items-center">
                    <span className="text-tiny font-bold text-ink-300 uppercase tracking-widest">Patrimoine Net</span>
                    <span className="text-body font-black text-success-400 privacy-blur drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]">{data.NetWorth?.toLocaleString()}$</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                        <div className="text-tiny text-primary font-bold mb-1">CELI</div>
                        <div className="text-meta font-black text-ink-50 privacy-blur">{(data.CELI || 0).toLocaleString()}$</div>
                    </div>
                    <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                        <div className="text-tiny text-info-500 font-bold mb-1">REER</div>
                        <div className="text-meta font-black text-ink-50 privacy-blur">{(data.REER || 0).toLocaleString()}$</div>
                    </div>
                    {(data.NonReg || 0) > 0 && (
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                            <div className="text-tiny text-warning-500 font-bold mb-1">Non-Enreg.</div>
                            <div className="text-meta font-black text-ink-50 privacy-blur">{(data.NonReg || 0).toLocaleString()}$</div>
                        </div>
                    )}
                    <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                        <div className="text-tiny text-[#a78bfa] font-bold mb-1">Liquidites</div>
                        <div className="text-meta font-black text-ink-50 privacy-blur">{(data.Liquidites || 0).toLocaleString()}$</div>
                    </div>
                </div>
            </div>

            {isRetired ? (
                <div className="space-y-2">
                    <div className="text-tiny font-bold text-ink-300 uppercase tracking-widest mb-1">Flux Mensuel</div>
                    <div className="bg-black/30 rounded-lg p-3 border border-danger-500/20 space-y-2">
                        <div className="flex justify-between text-meta"><span className="text-ink-300">Revenu total</span><span className="text-success-400 font-bold privacy-blur">+{(data.Income || 0).toLocaleString()}$</span></div>
                        <div className="flex justify-between text-meta"><span className="text-ink-300">Depenses (Infl.)</span><span className="text-danger-400 font-bold privacy-blur">-{(data.Expenses || 0).toLocaleString()}$</span></div>
                        <div className="flex justify-between text-meta pt-1 border-t border-white/5"><span className="text-ink-300">Cashflow</span><span className={`font-bold privacy-blur ${((data.Income ?? 0) - (data.Expenses ?? 0)) >= 0 ? 'text-success-400' : 'text-danger-400'}`}>{((data.Income ?? 0) - (data.Expenses ?? 0)).toLocaleString()}$</span></div>
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="text-tiny font-bold text-ink-300 uppercase tracking-widest mb-1">Epargne Mensuelle</div>
                    <div className="bg-black/30 rounded-lg p-3 border border-success-500/20">
                        <div className="flex justify-between text-meta"><span className="text-ink-300">Cashflow</span><span className="text-success-400 font-bold privacy-blur">+{(data.Savings || 0).toLocaleString()}$</span></div>
                    </div>
                </div>
            )}
        </div>
    );
});
