import React, { useState, useMemo, useEffect } from 'react';
import { Card } from './ui/Card';
import { ProjectionRequired } from './ui/ProjectionRequired';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useTimeChartZoom } from '../hooks/useTimeChartZoom';
import { ZoomContainer } from './ui/ZoomContainer';
import { RealEstateGoal, Tab as TabEnum } from '../types';
import { INITIAL_REAL_ESTATE_GOAL } from '../constants';
import { ConfirmModal } from './ui/ConfirmModal';
import { PropertyConfigurator } from './realestate/PropertyConfigurator';
import { MultiPropertyComparison } from './realestate/MultiPropertyComparison';
import { RealEstateAdviceCard } from './realestate/RealEstateAdviceCard';
import { calculateWelcomeTax } from '../services/realEstate';
import { useFinanceStore } from '../store/useFinanceStore';
import { PageHeader } from './ui/PageHeader';
import { Icon } from './ui/Icon';
import { KPIStat } from './ui/KPIStat';
import { StatGrid } from './ui/StatGrid';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

interface RealEstateProps {
    availableCash: number;
    goals: RealEstateGoal[];
    setGoals: (g: RealEstateGoal[]) => void;
}

export const RealEstate: React.FC<RealEstateProps> = ({ availableCash, goals, setGoals }) => {
    // Selection state
    const [activeGoalId, setActiveGoalId] = useState<string>(goals[0]?.id || 'primary');

    const activeGoal = useMemo(() =>
        goals.find(g => g.id === activeGoalId) || goals[0] || INITIAL_REAL_ESTATE_GOAL
        , [goals, activeGoalId]);

    const updateActiveGoal = (updates: Partial<RealEstateGoal>) => {
        const newGoals = goals.map(g => g.id === activeGoal.id ? { ...g, ...updates } : g);
        setGoals(newGoals);
    };

    const addNewGoal = () => {
        const newId = `prop_${Date.now()}`;
        const newGoal: RealEstateGoal = {
            ...INITIAL_REAL_ESTATE_GOAL,
            id: newId,
            isActive: false,
            isPrimaryResidence: false,
            price: 400000,
            downPayment: 80000,
        };
        setGoals([...goals, newGoal]);
        setActiveGoalId(newId);
    };

    const deleteGoal = (id: string) => {
        if (goals.length <= 1) return;
        setConfirmDeleteGoalId(id);
    };

    const doConfirmDeleteGoal = () => {
        if (!confirmDeleteGoalId) return;
        const newGoals = goals.filter(g => g.id !== confirmDeleteGoalId);
        setGoals(newGoals);
        if (activeGoalId === confirmDeleteGoalId) setActiveGoalId(newGoals[0].id);
        setConfirmDeleteGoalId(null);
    };

    const [confirmDeleteGoalId, setConfirmDeleteGoalId] = useState<string | null>(null);

    // Mode Switch
    const [mode, setMode] = useState<'AUTO' | 'MANUAL'>('MANUAL');

    const price = activeGoal.price || 450000;
    const downPayment = activeGoal.downPayment || (price * 0.2);
    const _downPaymentPercent = Math.round((downPayment / price) * 100);
    const rate = activeGoal.mortgageRate || 4.5;
    const amortization = activeGoal.amortization || 25;
    const targetDate = activeGoal.purchaseDate || new Date().toISOString().split('T')[0];
    const propertyGrowthRate = activeGoal.propertyGrowthRate || 3.0;
    const rentalIncomeMonthly = activeGoal.rentalIncomeMonthly || 0;
    const initialRenovations = activeGoal.initialRenovations || 0;
    const yearlyRenovations = activeGoal.yearlyRenovations || 0;
    const renewalRate = activeGoal.renewalRateProjection || 5.0;
    const maxValue = activeGoal.maxValue || 0;
    const propertyName = activeGoal.name || (activeGoal.isPrimaryResidence ? 'Résidence Principale' : 'Investissement');

    const [taxesYearly, setTaxesYearly] = useState(activeGoal.taxesYearly ?? 3000);
    const [heatingMonthly, setHeatingMonthly] = useState(activeGoal.heatingMonthly ?? 150);
    const [condoFees, setCondoFees] = useState(activeGoal.condoFees ?? 0);

    // Sync from store when switching between properties
    useEffect(() => {
        setTaxesYearly(activeGoal.taxesYearly ?? 3000);
        setHeatingMonthly(activeGoal.heatingMonthly ?? 150);
        setCondoFees(activeGoal.condoFees ?? 0);
    // activeGoal.taxesYearly/heatingMonthly/condoFees omis volontairement : seul activeGoalId
    // doit déclencher la réinitialisation des sliders locaux (pas les changements en cours de saisie).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeGoalId]);

    // AUTO: compute from price and persist to store
    useEffect(() => {
        if (mode === 'AUTO') {
            const t = Math.round(price * 0.01);
            const h = Math.round(80 + (price / 10000) * 1.5);
            setTaxesYearly(t);
            setHeatingMonthly(h);
            setCondoFees(0);
            setGoals(goals.map(g => g.id === activeGoal.id ? { ...g, taxesYearly: t, heatingMonthly: h, condoFees: 0 } : g));
        }
    // goals, setGoals et activeGoal.id omis volontairement : seuls price et mode
    // doivent déclencher ce recalcul ; ajouter goals provoquerait des boucles d'update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [price, mode]);

    const [currentRent, setCurrentRent] = useState(1600);
    // Phase F.7 — coût d'opportunité dynamique : le rendement boursier hérite
    // de l'hypothèse globale de croissance des actions (projection.returnRate).
    // L'utilisateur peut toujours override localement via le slider.
    const globalReturnRate = useFinanceStore(s => s.projection?.returnRate);
    const [marketReturn, setMarketReturn] = useState(globalReturnRate ?? 7);
    const [marketReturnOverridden, setMarketReturnOverridden] = useState(false);
    // Sync automatique tant que l'utilisateur n'a pas explicitement override
    React.useEffect(() => {
        if (!marketReturnOverridden && globalReturnRate !== undefined && globalReturnRate !== marketReturn) {
            setMarketReturn(globalReturnRate);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [globalReturnRate]);
    const [localRentalAppreciation, setLocalRentalAppreciation] = useState(propertyGrowthRate);
    const [localStockReturn, setLocalStockReturn] = useState(marketReturn);

    const totalMortgage = price - downPayment;
    // C9 fix : était une IIFE dupliquée de services/realEstate.ts:calculateWelcomeTax.
    // Note : le moteur de projection (services/projection/helpers.ts:welcomeTax)
    // utilise les paliers Montréal (jusqu'à 4%), tandis qu'ici on utilise les
    // paliers provinciaux Québec (jusqu'à 2%). Distinction volontaire, à unifier
    // dans un futur refactor via param `city: 'montreal' | 'quebec'`.
    const welcomeTax = calculateWelcomeTax(price);

    const notaryFees = 1500;
    const inspectionFees = 800;
    const totalCashNeeded = downPayment + welcomeTax + notaryFees + inspectionFees + initialRenovations;

    const monthlyRate = rate / 100 / 12;
    const numberOfPayments = amortization * 12;
    // Facteur d'amortissement calculé une seule fois (évitait 2 Math.pow par render).
    const mortgagePowFactor = monthlyRate > 0 ? Math.pow(1 + monthlyRate, numberOfPayments) : 0;
    const monthlyMortgage = monthlyRate > 0
        ? (monthlyRate * totalMortgage * mortgagePowFactor) / (mortgagePowFactor - 1)
        : totalMortgage / numberOfPayments;

    const amortizationData = useMemo(() => {
        const data = [];
        let balance = totalMortgage;
        let totalInterestPaid = 0;
        let totalPrincipalPaid = 0;
        let currentMonthlyPayment = monthlyMortgage;
        let currentRate = rate / 100 / 12;
        let propertyValue = price + initialRenovations;
        const purchaseYear = new Date(targetDate || new Date()).getFullYear();

        for (let year = 1; year <= amortization; year++) {
            let yearInterest = 0;
            let yearPrincipal = 0;
            if (year > 1 && (year - 1) % 5 === 0) {
                currentRate = renewalRate / 100 / 12;
                const remainingMonths = (amortization - year + 1) * 12;
                if (currentRate > 0)
                    currentMonthlyPayment = (currentRate * balance * Math.pow(1 + currentRate, remainingMonths)) / (Math.pow(1 + currentRate, remainingMonths) - 1);
            }
            for (let m = 0; m < 12; m++) {
                if (balance <= 0) break;
                const interest = balance * currentRate;
                const principal = currentMonthlyPayment - interest;
                balance -= principal;
                yearInterest += interest;
                yearPrincipal += principal;
            }
            totalInterestPaid += yearInterest;
            totalPrincipalPaid += yearPrincipal;
            const rawValue = propertyValue * (1 + (propertyGrowthRate / 100));
            propertyValue = (maxValue > 0 && rawValue > maxValue) ? maxValue : rawValue;
            const calendarYear = purchaseYear + year;
            data.push({
                year,
                calendarYear,
                age: year,
                Solde: Math.max(0, Math.round(balance)),
                ValeuréPropriété: Math.round(propertyValue),
                Équité: Math.max(0, Math.round(propertyValue - Math.max(0, balance))),
                IntérêtsCumul: Math.round(totalInterestPaid),
                PrincipalCumul: Math.round(totalPrincipalPaid),
                PartInteretAnnuelle: Math.round(yearInterest),
                PartPrincipalAnnuelle: Math.round(yearPrincipal),
                TauxEnVigueur: (currentRate * 12 * 100).toFixed(1) + '%',
                RenosCumul: Math.round(yearlyRenovations * year),
            });
        }
        return { data, totalInterest: totalInterestPaid, finalValue: propertyValue };
    }, [totalMortgage, rate, renewalRate, monthlyMortgage, amortization, price, propertyGrowthRate, initialRenovations, maxValue, targetDate, yearlyRenovations]);

    const monthlyTaxes = taxesYearly / 12;
    const totalMonthlyCost = monthlyMortgage + monthlyTaxes + heatingMonthly + condoFees;
    const netMonthlyCost = Math.max(0, totalMonthlyCost - rentalIncomeMonthly);
    const maintenanceMonthly = (price * 0.01) / 12;
    const initialInterest = totalMortgage * monthlyRate;
    const unrecoverableMonthly = Math.max(0, initialInterest + monthlyTaxes + heatingMonthly + condoFees + maintenanceMonthly - rentalIncomeMonthly);

    const _buyVsRentData = useMemo(() => {
        const data = [];
        let rentScenarioNetWorth = totalCashNeeded;
        let buyNetWorth = downPayment + initialRenovations;
        let currentRentCost = currentRent;
        for (let year = 1; year <= amortization; year++) {
            const rentAnnualCost = currentRentCost * 12;
            const buyAnnualCost = netMonthlyCost * 12 + maintenanceMonthly * 12;
            const differenceToInvest = (buyAnnualCost - rentAnnualCost);
            rentScenarioNetWorth *= (1 + marketReturn / 100);
            if (differenceToInvest > 0) rentScenarioNetWorth += differenceToInvest;
            buyNetWorth = amortizationData.data[year - 1]?.Équité || 0;
            currentRentCost *= 1.03;
            data.push({ year, 'Acheter (Équité)': Math.round(buyNetWorth), 'Louer + Investir': Math.round(rentScenarioNetWorth) });
        }
        return data;
    }, [amortization, totalCashNeeded, downPayment, initialRenovations, netMonthlyCost, maintenanceMonthly, currentRent, marketReturn, amortizationData.data]);

    const formatCurrency = (val: number) => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(val);

    // Wiring 2026-05: équité immo projetée par le moteur principal au terme de
    // l'amortissement, à comparer avec le calcul local de la card Buy vs Rent.
    const lastProjection = useFinanceStore(s => s.lastProjection);
    const navigateWithFocus = useFinanceStore(s => s.navigateWithFocus);
    const projectedEquityAtAmortEnd = useMemo(() => {
        if (!lastProjection?.chartData?.length) return null;
        const targetMonth = amortization * 12;
        const point = lastProjection.chartData.find(p => p.monthIndex === targetMonth)
            ?? lastProjection.chartData[Math.min(targetMonth, lastProjection.chartData.length - 1)];
        return point?.Immobilier ?? null;
    }, [lastProjection, amortization]);

    // G7b — calcul Acheter-vs-Louer remonté au niveau composant (il vivait dans
    // une IIFE de rendu) pour pouvoir brancher le zoom molette/pan sur la courbe.
    const monthlyRental = rentalIncomeMonthly || Math.round(price / 23.3 / 12);
    const annualExpenses = monthlyTaxes * 12 + heatingMonthly * 12 + condoFees * 12 + (price * 0.01);
    const netAnnualIncome = (monthlyRental * 12) - annualExpenses - (amortizationData.data[0]?.PartInteretAnnuelle || 0);
    const netYield = (netAnnualIncome / price) * 100;
    const combinedData = useMemo(() => Array.from({ length: amortization }, (_, i) => {
        const yr = i + 1;
        let rentScenarioNetWorth = totalCashNeeded;
        let currentRentCost = currentRent;
        for (let y = 1; y <= yr; y++) {
            const rentAnnualCost = currentRentCost * 12;
            const buyAnnualCost = netMonthlyCost * 12 + maintenanceMonthly * 12;
            const differenceToInvest = (buyAnnualCost - rentAnnualCost);
            rentScenarioNetWorth *= (1 + marketReturn / 100);
            if (differenceToInvest > 0) rentScenarioNetWorth += differenceToInvest;
            currentRentCost *= 1.03;
        }
        const buyPrimaryNetWorth = amortizationData.data[i]?.Équité || 0;
        const propValue = price * Math.pow(1 + localRentalAppreciation / 100, yr);
        const equity = amortizationData.data[i]?.Équité || 0;
        const cumulativeRentalIncome = netAnnualIncome * yr;
        const stockInvestment = totalCashNeeded * Math.pow(1 + localStockReturn / 100, yr);
        return {
            year: yr,
            'Acheter (Résidence)': Math.round(buyPrimaryNetWorth),
            'Louer + Investir Reste': Math.round(rentScenarioNetWorth),
            'Investissement Locatif (Équité+Loyer)': Math.round(equity + cumulativeRentalIncome),
            'Bourse (Placer Cash Initial)': Math.round(stockInvestment),
            'Valeur Propriété': Math.round(propValue),
        };
    }), [amortization, totalCashNeeded, currentRent, netMonthlyCost, maintenanceMonthly, marketReturn, price, localRentalAppreciation, localStockReturn, netAnnualIncome, amortizationData.data]);
    const zoom = useTimeChartZoom<{
        year: number;
        'Acheter (Résidence)': number;
        'Louer + Investir Reste': number;
        'Investissement Locatif (Équité+Loyer)': number;
        'Bourse (Placer Cash Initial)': number;
        'Valeur Propriété': number;
    }>(combinedData);

    return (
        <div className="space-y-6 stagger-in pb-10">
            <ConfirmModal
                isOpen={!!confirmDeleteGoalId}
                onConfirm={doConfirmDeleteGoal}
                onCancel={() => setConfirmDeleteGoalId(null)}
                title="Supprimer la propriété"
                message="Supprimer ce scénario immobilier définitivement ?"
                confirmLabel="Supprimer"
            />
            <PageHeader
                icon={<Icon name="real-estate" size={28} />}
                title="Immobilier"
                subtitle={`${goals.length} propriété${goals.length > 1 ? 's' : ''} configurée${goals.length > 1 ? 's' : ''} · Mensualité nette ${formatCurrency(netMonthlyCost)}`}
                badge={activeGoal.isActive ? <Badge variant="success" size="md">Active dans simulation</Badge> : <Badge variant="neutral" size="md">Inactive</Badge>}
                actions={
                    <Button
                        onClick={() => updateActiveGoal({ isActive: !activeGoal.isActive })}
                        variant={activeGoal.isActive ? 'danger' : 'primary'}
                        size="md"
                    >
                        {activeGoal.isActive ? 'Désactiver' : 'Activer dans Simulation'}
                    </Button>
                }
            />

            {/* Multi-Property Tabs */}
            <div className="flex flex-wrap items-center gap-2">
                {goals.map((g, idx) => {
                    const isActive = activeGoalId === g.id;
                    return (
                        <button
                            key={g.id}
                            onClick={() => setActiveGoalId(g.id)}
                            className={`px-4 py-2 rounded-pill border transition-all flex items-center gap-2 text-meta font-bold focus-ring ${
                                isActive
                                    ? 'bg-info-bg border-info-500 text-info-400'
                                    : 'bg-white/5 border-white/10 text-ink-300 hover:bg-white/10'
                            }`}
                        >
                            <span>🏠 {g.name || (g.isPrimaryResidence ? 'Résidence' : `Propriété ${idx + 1}`)}</span>
                            {g.isActive && <span className="w-2 h-2 rounded-full bg-success-500 animate-pulse" aria-label="active" />}
                            {goals.length > 1 && (
                                <span
                                    onClick={(e) => { e.stopPropagation(); deleteGoal(g.id); }}
                                    className="ml-2 text-ink-400 hover:text-danger-400 cursor-pointer"
                                    role="button"
                                    aria-label={`Supprimer ${g.name}`}
                                >
                                    ✕
                                </span>
                            )}
                        </button>
                    );
                })}
                <button
                    onClick={addNewGoal}
                    className="px-4 py-2 rounded-pill bg-white/5 border border-dashed border-white/20 text-ink-300 hover:bg-white/10 text-meta font-bold focus-ring"
                >
                    + Ajouter une propriété
                </button>
            </div>

            {/* Property name editor */}
            <div className="flex items-center gap-3">
                <span className="text-h1 text-ink-50">🏢 {propertyName}</span>
                <input
                    type="text"
                    value={propertyName}
                    onChange={e => updateActiveGoal({ name: e.target.value })}
                    placeholder="Renommer..."
                    className="bg-transparent border-b border-white/20 text-ink-300 text-meta focus:outline-none focus:border-info-400 w-48 pb-0.5 transition-colors"
                    aria-label="Nom de la propriété"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <PropertyConfigurator
                    activeGoal={activeGoal}
                    updateActiveGoal={updateActiveGoal}
                    mode={mode}
                    setMode={setMode}
                    taxesYearly={taxesYearly}
                    setTaxesYearly={setTaxesYearly}
                    heatingMonthly={heatingMonthly}
                    setHeatingMonthly={setHeatingMonthly}
                    condoFees={condoFees}
                    setCondoFees={setCondoFees}
                />

                {/* ANALYSIS DASHBOARD */}
                <div className="lg:col-span-3 space-y-5">
                    <StatGrid cols={4} gap="sm">
                        <KPIStat
                            label="Cash nécessaire"
                            icon={<Icon name="cash" size={16} />}
                            value={formatCurrency(totalCashNeeded)}
                            sublabel={availableCash >= totalCashNeeded ? 'Disponible' : `Manque ${formatCurrency(totalCashNeeded - availableCash)}`}
                            privacy
                            variant={availableCash >= totalCashNeeded ? 'success' : 'danger'}
                        />
                        <KPIStat
                            label="Prêt Initial"
                            icon={<Icon name="bank" size={16} />}
                            value={formatCurrency(totalMortgage)}
                            sublabel={`Ratio Prêt/Valeur: ${Math.round((totalMortgage / price) * 100)}%`}
                            privacy
                            variant="info"
                        />
                        <KPIStat
                            label="Perte Sèche (Mens.)"
                            icon={<Icon name="debt" size={16} />}
                            value={formatCurrency(unrecoverableMonthly)}
                            sublabel="Intérêts + taxes + entretien"
                            privacy
                            variant="danger"
                        />
                        <KPIStat
                            label="Valeur à terme"
                            icon={<Icon name="investments" size={16} />}
                            value={formatCurrency(amortizationData.finalValue)}
                            sublabel={`Dans ${amortization} ans`}
                            privacy
                            variant="success"
                        />
                    </StatGrid>

                    <Card icon={<Icon name="chart" size={18} />} title="Scénarios comparatifs" action={
                        projectedEquityAtAmortEnd !== null && projectedEquityAtAmortEnd > 0 ? (
                            <Badge
                                variant="info"
                                size="sm"
                                onClick={() => navigateWithFocus(TabEnum.FUTURE)}
                                title={`Équité immo projetée par FutureProjection à l'année ${amortization} — clic pour ouvrir`}
                            >
                                Projection: {formatCurrency(projectedEquityAtAmortEnd)}
                            </Badge>
                        ) : <ProjectionRequired variant="inline" feature="l'équité immo projetée" />
                    }>
                        {(() => {
                            return (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 p-4 bg-black/30 rounded-xl border border-white/5">
                                        <div>
                                            <label className="text-tiny text-purple-400 font-bold uppercase block mb-1">
                                                Loyer actuel (scénario Louer)
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    step="50"
                                                    value={currentRent}
                                                    onChange={e => setCurrentRent(Number(e.target.value))}
                                                    className="w-full bg-purple-500/10 border border-purple-500/30 rounded px-2 py-1.5 text-purple-300 text-body font-bold focus:outline-none focus:border-purple-400"
                                                />
                                                <span className="text-meta text-ink-500">$/m</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="flex justify-between text-tiny text-success-400 font-bold uppercase mb-1">
                                                <span className="flex items-center gap-1">
                                                    Rendement Boursier
                                                    {!marketReturnOverridden && globalReturnRate !== undefined && (
                                                        <span title="Synchronisé avec hypothèse globale (Futur)" className="inline-flex text-ink-400"><Icon name="link" size={12} /></span>
                                                    )}
                                                </span>
                                                <span className="flex items-center gap-2">
                                                    <span className="text-white">{marketReturn}%</span>
                                                    {marketReturnOverridden && globalReturnRate !== undefined && (
                                                        <button
                                                            type="button"
                                                            onClick={() => { setMarketReturnOverridden(false); setMarketReturn(globalReturnRate); setLocalStockReturn(globalReturnRate); }}
                                                            className="text-tiny text-info-400 hover:underline font-normal normal-case"
                                                            title={`Resynchroniser avec la projection globale (${globalReturnRate}%)`}
                                                        >
                                                            ↺ sync
                                                        </button>
                                                    )}
                                                </span>
                                            </label>
                                            <input
                                                type="range"
                                                min="3"
                                                max="15"
                                                step="0.5"
                                                value={marketReturn}
                                                onChange={e => {
                                                    setMarketReturn(Number(e.target.value));
                                                    setLocalStockReturn(Number(e.target.value));
                                                    setMarketReturnOverridden(true);
                                                }}
                                                className="w-full h-1.5 bg-dark rounded-lg appearance-none cursor-pointer accent-success-500 mt-2"
                                            />
                                            {!marketReturnOverridden && globalReturnRate !== undefined && (
                                                <p className="text-tiny text-info-400/70 italic mt-1">
                                                    Phase F.7 — coût d'opportunité hérité de Futur ({globalReturnRate}%). Bouge le slider pour override.
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            <label className="flex justify-between text-tiny text-pink-400 font-bold uppercase mb-1">
                                                <span>Appréciation Immo</span>
                                                <span className="text-white">{localRentalAppreciation}%</span>
                                            </label>
                                            <input
                                                type="range"
                                                min="0" max="10" step="0.5"
                                                value={localRentalAppreciation}
                                                onChange={e => setLocalRentalAppreciation(Number(e.target.value))}
                                                className="w-full h-1.5 bg-dark rounded-lg appearance-none cursor-pointer accent-pink-500 mt-2"
                                            />
                                        </div>
                                        <div className={`p-2 rounded-lg border flex flex-col justify-center ${netYield > 0 ? 'bg-green-900/20 border-green-500/20' : 'bg-red-900/20 border-danger-500/20'}`}>
                                            <div className="text-tiny uppercase font-bold text-ink-300">Si location (Cash-Flow)</div>
                                            <div className={`text-lg font-black ${netYield > 0 ? 'text-green-400' : 'text-danger-400'}`}>
                                                {formatCurrency(netAnnualIncome)}<span className="text-tiny font-normal text-ink-500">/an</span>
                                            </div>
                                        </div>
                                    </div>

                                    <ZoomContainer zoom={zoom} className="h-[300px] w-full mt-2">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={zoom.visibleData}>
                                                <XAxis dataKey="year" tick={{ fontSize: 10 }} tickFormatter={v => `An ${v}`} />
                                                <YAxis hide />
                                                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: '#0B0E14', borderColor: '#333' }} />
                                                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11, fontWeight: 'bold' }} />

                                                {(activeGoal.isPrimaryResidence || !activeGoal.isRented) && (
                                                    <Area type="monotone" dataKey="Acheter (Résidence)" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeWidth={3} />
                                                )}

                                                {(activeGoal.isPrimaryResidence || !activeGoal.isRented) && (
                                                    <Area type="monotone" dataKey="Louer + Investir Reste" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.1} strokeWidth={3} />
                                                )}

                                                {(!activeGoal.isPrimaryResidence && activeGoal.isRented) && (
                                                    <Area type="monotone" dataKey="Investissement Locatif (Équité+Loyer)" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.1} strokeWidth={3} />
                                                )}

                                                {(!activeGoal.isPrimaryResidence && activeGoal.isRented) && (
                                                    <Area type="monotone" dataKey="Bourse (Placer Cash Initial)" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} strokeWidth={3} />
                                                )}
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </ZoomContainer>
                                    <p className="text-tiny text-ink-500 mt-3 text-center">
                                        Note: Le graphique affiche automatiquement les scénarios pertinents (Habiter vs Louer) selon le type de propriété que vous avez configuré (Résidence Principale ou Propriété Locative).
                                    </p>
                                </>
                            );
                        })()}
                    </Card>

                    <Card title="Amortissement et Équité">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-2">
                            <div><div className="text-tiny text-ink-500 uppercase tracking-wider">Welcome Tax</div><div className="text-body font-bold text-white">{formatCurrency(welcomeTax)}</div></div>
                            <div><div className="text-tiny text-ink-500 uppercase tracking-wider">Notaire &amp; Insp.</div><div className="text-body font-bold text-white">{formatCurrency(notaryFees + inspectionFees)}</div></div>
                            <div><div className="text-tiny text-ink-500 uppercase tracking-wider">Rénos Initiales</div><div className="text-body font-bold text-white">{formatCurrency(initialRenovations)}</div></div>
                            <div><div className="text-tiny text-ink-500 uppercase tracking-wider">Maison Totale</div><div className="text-body font-bold text-white">{formatCurrency(price + initialRenovations)}</div></div>
                        </div>
                    </Card>

                    <Card icon={<Icon name="clipboard" size={18} />} title="Amortissement">
                        <div className="overflow-x-auto">
                            <div className="mb-3 flex flex-wrap gap-4 text-meta">
                                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-danger-500 inline-block" />Intérêts totaux payés : <span className="font-bold text-danger-400 privacy-blur">{formatCurrency(amortizationData.totalInterest)}</span></div>
                                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-success-500 inline-block" />Gain Équité projeté : <span className="font-bold text-success-400 privacy-blur">{formatCurrency((amortizationData.data[amortizationData.data.length - 1]?.Équité || 0) - downPayment)}</span></div>
                                {yearlyRenovations > 0 && <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" />Rénos totales : <span className="font-bold text-yellow-400 privacy-blur">{formatCurrency(yearlyRenovations * amortization)}</span></div>}
                            </div>
                            <table className="w-full text-meta text-left min-w-[700px]">
                                <thead>
                                    <tr className="border-b border-white/10 text-ink-500 uppercase tracking-wider">
                                        <th className="py-2 pr-4">Année</th>
                                        <th className="py-2 pr-4">Taux</th>
                                        <th className="py-2 pr-4 text-right">Intérêts/an</th>
                                        <th className="py-2 pr-4 text-right">Principal/an</th>
                                        <th className="py-2 pr-4 text-right">Solde Restant</th>
                                        <th className="py-2 pr-4 text-right">Valeur Propriété</th>
                                        <th className="py-2 text-right">Équité</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {amortizationData.data.map((row, idx) => {
                                        const isRenewal = idx > 0 && idx % 5 === 0;
                                        const equityPct = row.ValeuréPropriété > 0 ? Math.round((row.Équité / row.ValeuréPropriété) * 100) : 0;
                                        return (
                                            <tr key={row.year} className={`border-b border-white/5 ${isRenewal ? 'bg-orange-900/10' : idx % 2 === 0 ? 'bg-white/[0.02]' : ''} hover:bg-white/5 transition-colors`}>
                                                <td className="py-2 pr-4 font-bold">
                                                    {row.calendarYear}
                                                    {isRenewal && <span className="ml-1.5 text-tiny text-orange-400 border border-orange-500/30 rounded px-1">Renouvellement</span>}
                                                </td>
                                                <td className="py-2 pr-4 text-orange-300">{row.TauxEnVigueur}</td>
                                                <td className="py-2 pr-4 text-right text-danger-400 privacy-blur">{formatCurrency(row.PartInteretAnnuelle)}</td>
                                                <td className="py-2 pr-4 text-right text-info-400 privacy-blur">{formatCurrency(row.PartPrincipalAnnuelle)}</td>
                                                <td className="py-2 pr-4 text-right text-white privacy-blur">{formatCurrency(row.Solde)}</td>
                                                <td className="py-2 pr-4 text-right text-purple-300 privacy-blur">{formatCurrency(row.ValeuréPropriété)}</td>
                                                <td className="py-2 text-right">
                                                    <span className="text-success-400 font-bold privacy-blur">{formatCurrency(row.Équité)}</span>
                                                    <span className="text-ink-500 ml-1">({equityPct}%)</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            </div>

            <MultiPropertyComparison goals={goals} />

            {/* Phase F.8 — Conseils IA Immobilier poussés */}
            <RealEstateAdviceCard
                context={{
                    price,
                    downPayment,
                    mortgageRate: rate,
                    amortizationYears: amortization,
                    monthlyMortgagePayment: monthlyMortgage,
                    propertyTaxesAnnual: taxesYearly,
                    welcomeTax,
                    maintenanceAnnual: maintenanceMonthly * 12,
                    isPrimaryResidence: !!activeGoal.isPrimaryResidence,
                    isFirstTimeBuyer: !!activeGoal.isFirstTimeBuyer,
                    currentRent,
                    marketReturnExpected: marketReturn,
                    propertyAppreciationExpected: propertyGrowthRate,
                }}
            />

        </div>
    );
};
