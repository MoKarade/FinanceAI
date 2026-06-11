import React, { useState, useMemo, useEffect } from 'react';
import { Card } from './ui/Card';
import { PageHeader } from './ui/PageHeader';
import { ProjectionStaleBanner } from './ui/ProjectionStaleBanner';
import { ProfileFieldsMoved } from './settings/ProfileFieldsMoved';
import { Icon } from './ui/Icon';
import { Badge } from './ui/Badge';
import { ProjectionConfig, RetirementGoal, BudgetConfig, ChildGoal, TravelGoal, LifeEvent, Debt, RealEstateGoal, BudgetCategory, Asset, RegisteredAccountType } from '../types';
import { ProjectionChartPoint } from '../services/projection/types';
import { Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ComposedChart, Line, Legend } from 'recharts';
import { useTimeChartZoom } from '../hooks/useTimeChartZoom';
import { buildLockedByMonth, pointStackedCapital } from '../utils/lockedCurveOverlay';
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
import { logError } from '../services/errorLogger';

// Sprint 2 PH3 — constante stable pour éviter de créer un nouveau [] à chaque
// render (qui invaliderait les useMemo deps de la projection).
const EMPTY_ARRAY: never[] = [];

interface RetirementProps {
    goal: RetirementGoal;
    /** PH3 — plus consommé (l'édition de retirementGoal passe par Profil) ; optionnel pour compat. */
    setGoal?: (g: RetirementGoal) => void;
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
    goal,
    currentREER, currentCELI, currentNonReg,
    calculatedMonthlySavings,
    projection, config,
    assets = [], initialBalances = {}, budgetItems = [],
    realEstateGoals = [], childGoals = [], travelGoals = [], lifeEvents = [], debts = []
}) => {
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
    // States Goal Seeker / Asset Location déplacés dans leurs sous-composants
    // (refactor architecture cycle 2 — réduction Retirement.tsx de 700→527 lignes).
    // PH3 — `setLifeExpectancy` + l'état `currentAge` retirés avec les éditeurs (déplacés dans Profil).
    // `lifeExpectancy` reste LU du store (consommé par le graphe d'accumulation et CurrentCapitalCard).

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
                // [SF-WARN] — vrai échec I/O → logError (journal app), plus un simple console.warn.
                logError({ source: 'network', severity: 'warning', message: 'Retirement: fetchLiveTotals a échoué (soldes live CSV indisponibles).', error: e instanceof Error ? e : new Error(String(e)) });
            }
        };
        fetchLiveTotals();
        return () => { cancelled = true; };
    }, [assets, currentCELI, currentREER, currentNonReg]);

    // PV-5 / PH3 — `updateGoal` retiré avec les éditeurs (le revenu-retraite s'édite dans Profil).

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
    // PH2-d — courbe VERROUILLÉE : superposée en référence sur le graphe d'accumulation (le verrou
    // se pilote depuis Futur ; Retraite ne fait que l'AFFICHER, source unique cohérente).
    const lockedProjection = useFinanceStore(s => s.lockedProjection);
    const isProjectionLocked = useFinanceStore(s => s.isProjectionLocked);
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
    // PH2-d — capital de la courbe VERROUILLÉE par monthIndex, sur la MÊME métrique que le stack
    // d'aires VISIBLE (Liquidites+NonReg+CELI+CELIAPP+REER, cf PH2-d-3) → superposition exacte au sommet.
    const lockedCapitalByMonth = useMemo(
        () => buildLockedByMonth(lockedProjection, isProjectionLocked, pointStackedCapital),
        [isProjectionLocked, lockedProjection],
    );
    const lifeExpectancyData = useMemo(() => {
        const base = yearlyData.filter(d => (d.age ?? 0) <= lifeExpectancy);
        if (!lockedCapitalByMonth) return base;
        return base.map(d => ({ ...d, lockedTotalCapital: lockedCapitalByMonth.get(d.monthIndex) }));
    }, [yearlyData, lifeExpectancy, lockedCapitalByMonth]);
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
                />
                <ProjectionRequired feature="La simulation de retraite" />
            </div>
        );
    }

    return (
        <div className="space-y-6 stagger-in pb-20">
            {/* [PH2-c-2] — signal inter-onglets : dernier recalcul de projection échoué. */}
            <ProjectionStaleBanner />
            <PageHeader
                icon={<Icon name="retirement" size={28} />}
                title="Planification Retraite"
                subtitle={activeScenarioName
                    ? `Scénario actif : ${activeScenarioName} — synchronisé avec Future`
                    : "Simulation complète basée sur le moteur FIRE — mêmes données que l'onglet Future."}
                badge={
                    <Badge variant={bankruptcyAge ? 'danger' : 'success'} size="md">
                        {bankruptcyAge ? `Capital épuisé à ${bankruptcyAge} ans` : `Succès jusqu'à ${lifeExpectancy} ans`}
                    </Badge>
                }
            />

            {/* PH3 — TOUS les éditeurs de profil/retraite (paramètres, revenu-retraite, profil détaillé)
                ont migré dans l'onglet Profil unifié. Retraite = résultats & analyses uniquement. */}
            <ProfileFieldsMoved what="Tes paramètres de retraite, ton revenu-retraite et ton profil détaillé" />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">

                    {/* Phase F.5 — extraction Card "Capitaux Actuels" en sous-composant */}
                    <CurrentCapitalCard
                        balances={{ REER: liveCSVBalances.REER, CELI: liveCSVBalances.CELI, NON_ENREG: liveCSVBalances.NON_ENREG }}
                        targetAge={goal.targetAge}
                        lifeExpectancy={lifeExpectancy}
                        retirementNetWorth={retirementNetWorth}
                        peakNetWorth={peakNetWorth}
                        finalNetWorth={finalNetWorth}
                    />


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
                                    <Icon name="clock" size={40} className="text-ink-500 block mx-auto mb-3" />
                                    <p>Chargement des donnees de portefeuille...</p>
                                    <p className="text-meta mt-2 text-ink-500">Assurez-vous d'avoir importe un CSV de portefeuille.</p>
                                </div>
                            </div>
                        </Card>
                    ) : (
                        <>
                            <Card icon={<Icon name="investments" size={18} />} title="Accumulation & épuisement">
                                <ZoomContainer zoom={zoomAccum} className="h-[420px] w-full" style={{ minHeight: '420px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={zoomAccum.visibleData} margin={{ top: 20, right: 30, left: 10, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="retGradREER" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#5b82bf" stopOpacity={0.75} />
                                                    <stop offset="95%" stopColor="#5b82bf" stopOpacity={0.05} />
                                                </linearGradient>
                                                <linearGradient id="retGradCELI" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#4f9d86" stopOpacity={0.75} />
                                                    <stop offset="95%" stopColor="#4f9d86" stopOpacity={0.05} />
                                                </linearGradient>
                                                <linearGradient id="retGradCELIAPP" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.75} />
                                                    <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0.05} />
                                                </linearGradient>
                                                <linearGradient id="retGradNonReg" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#c2974f" stopOpacity={0.75} />
                                                    <stop offset="95%" stopColor="#c2974f" stopOpacity={0.05} />
                                                </linearGradient>
                                                <linearGradient id="retGradLiq" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#9b8fcf" stopOpacity={0.5} />
                                                    <stop offset="95%" stopColor="#9b8fcf" stopOpacity={0.02} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" vertical={false} />
                                            <XAxis dataKey="age" stroke="#334155" tick={{ fontSize: 10, fill: '#64748b' }} tickMargin={10} tickFormatter={(val) => `${val} ans`} />
                                            <YAxis stroke="#334155" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k$`} width={55} />
                                            <Tooltip content={<RetirementTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.07)', strokeWidth: 2 }} />
                                            <Legend verticalAlign="top" iconType="circle" wrapperStyle={{ paddingBottom: '20px', fontSize: '12px' }} />
                                            <ReferenceLine x={goal.targetAge} stroke="#f97316" strokeDasharray="5 3" label={{ position: 'insideTopRight', value: `Retraite (${goal.targetAge}a)`, fill: '#f97316', fontSize: 11, fontWeight: 'bold', dy: -8 }} />
                                            <Area type="monotone" dataKey="Liquidites" stackId="1" fill="url(#retGradLiq)" stroke="#9b8fcf" strokeWidth={1} name="Liquidites" fillOpacity={1} />
                                            <Area type="monotone" dataKey="NonReg" stackId="1" fill="url(#retGradNonReg)" stroke="#c2974f" strokeWidth={1} name="Non-Enreg." fillOpacity={1} />
                                            <Area type="monotone" dataKey="CELI" stackId="1" fill="url(#retGradCELI)" stroke="#4f9d86" strokeWidth={1.5} name="CELI" fillOpacity={1} />
                                            {/* [PH2-d-3] — CELIAPP manquait du stack (TotalCapital l'inclut depuis toujours).
                                                Revue #245 (a11y S1) : stroke TIRETÉ = distinction non-couleur vs CELI (teal voisin). */}
                                            <Area type="monotone" dataKey="CELIAPP" stackId="1" fill="url(#retGradCELIAPP)" stroke="#2dd4bf" strokeWidth={1.5} strokeDasharray="4 2" name="CELIAPP" fillOpacity={1} />
                                            <Area type="monotone" dataKey="REER" stackId="1" fill="url(#retGradREER)" stroke="#5b82bf" strokeWidth={1.5} name="REER" fillOpacity={1} />
                                            {/* PH2-d — capital VERROUILLÉ (référence figée), superposé à l'aperçu live. */}
                                            {lockedCapitalByMonth && <Line type="monotone" dataKey="lockedTotalCapital" stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 3" dot={false} name="Verrouillée 🔒" isAnimationActive={false} />}
                                        </ComposedChart>
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
                                            {finalNetWorth > 0 ? `${(finalNetWorth / 1000).toFixed(0)}k $` : 'Épuisé'}
                                        </div>
                                    </div>
                                </div>
                            </Card>

                            <Card icon={<Icon name="debt" size={18} />} title="Flux à la retraite">
                                <ZoomContainer zoom={zoomCashflow} className="h-[280px] w-full" style={{ minHeight: '280px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={zoomCashflow.visibleData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" vertical={false} />
                                            <XAxis dataKey="age" stroke="#334155" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(val) => `${val}a`} />
                                            <YAxis stroke="#334155" tick={{ fontSize: 10, fill: '#64748b' }} width={50} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
                                            <Tooltip contentStyle={{ backgroundColor: '#0B0E14', borderColor: '#1e293b', borderRadius: '10px', color: '#fff' }} formatter={(val: number | string, name: string) => [`${Number(val).toLocaleString()}$`, name]} />
                                            <Legend iconType="circle" />
                                            <Area type="monotone" dataKey="IncomeRetirement" fill="#5b82bf20" stroke="#5b82bf" strokeWidth={2} name="Rente Gouv. + PSV" />
                                            <Area type="monotone" dataKey="Income" fill="#4f9d8615" stroke="#4f9d86" strokeWidth={2} name="Revenu Total" />
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
                    {isRetired ? 'En retraite' : 'Accumulation'}
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
                    {/* Revue #245 (a11y S1) — CELIAPP visible au stack doit avoir sa valeur TEXTE ici. */}
                    {(data.CELIAPP || 0) > 0 && (
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                            <div className="text-tiny text-[#2dd4bf] font-bold mb-1">CELIAPP</div>
                            <div className="text-meta font-black text-ink-50 privacy-blur">{(data.CELIAPP || 0).toLocaleString()}$</div>
                        </div>
                    )}
                    {(data.NonReg || 0) > 0 && (
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                            <div className="text-tiny text-warning-500 font-bold mb-1">Non-Enreg.</div>
                            <div className="text-meta font-black text-ink-50 privacy-blur">{(data.NonReg || 0).toLocaleString()}$</div>
                        </div>
                    )}
                    <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                        <div className="text-tiny text-[#9b8fcf] font-bold mb-1">Liquidites</div>
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
