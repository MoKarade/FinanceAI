import React, { useState, useMemo, useEffect } from 'react';
import { Card } from './ui/Card';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, BarChart, Bar } from 'recharts';
import { RealEstateGoal } from '../types';
import { INITIAL_REAL_ESTATE_GOAL } from '../constants';
import { ConfirmModal } from './ui/ConfirmModal';

interface RealEstateProps {
    availableCash: number;
    goals: RealEstateGoal[];
    setGoals: (g: RealEstateGoal[]) => void;
}

export const RealEstate: React.FC<RealEstateProps> = ({ availableCash, goals, setGoals }) => {
    const [activeGoalId, setActiveGoalId] = useState<string>(goals[0]?.id || 'primary');
    const [confirmDeleteGoalId, setConfirmDeleteGoalId] = useState<string | null>(null);

    const activeGoal = useMemo(() => goals.find(g => g.id === activeGoalId) || goals[0] || INITIAL_REAL_ESTATE_GOAL, [goals, activeGoalId]);

    const updateActiveGoal = (updates: Partial<RealEstateGoal>) => {
        const newGoals = goals.map(g => g.id === activeGoal.id ? { ...g, ...updates } : g);
        setGoals(newGoals);
    };

    const addNewGoal = () => {
        const newId = `prop_${Date.now()}`;
        const newGoal: RealEstateGoal = { ...INITIAL_REAL_ESTATE_GOAL, id: newId, isActive: false, isPrimaryResidence: false, price: 400000, downPayment: 80000 };
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

    const [mode, setMode] = useState<'AUTO' | 'MANUAL'>('MANUAL');

    const price = activeGoal.price || 450000;
    const downPayment = activeGoal.downPayment || (price * 0.2);
    const downPaymentPercent = Math.round((downPayment / price) * 100);
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

    const [taxesYearly, setTaxesYearly] = useState(3000);
    const [heatingMonthly, setHeatingMonthly] = useState(150);
    const [condoFees, setCondoFees] = useState(0);

    useEffect(() => {
        if (mode === 'AUTO') {
            setTaxesYearly(Math.round(price * 0.01));
            setHeatingMonthly(Math.round(80 + (price / 10000) * 1.5));
            setCondoFees(0);
        }
    }, [price, mode]);

    const [currentRent, setCurrentRent] = useState(1600);
    const [marketReturn, setMarketReturn] = useState(7);
    const [localRentalAppreciation, setLocalRentalAppreciation] = useState(propertyGrowthRate);
    const [localStockReturn, setLocalStockReturn] = useState(marketReturn);

    const totalMortgage = price - downPayment;
    const welcomeTax = (() => {
        let tax = 0; let v = price;
        if (v > 552300) { tax += (v - 552300) * 0.02; v = 552300; }
        if (v > 290000) { tax += (v - 290000) * 0.015; v = 290000; }
        if (v > 58900) { tax += (v - 58900) * 0.01; v = 58900; }
        tax += v * 0.005;
        return tax;
    })();
    const notaryFees = 1500;
    const inspectionFees = 800;
    const totalCashNeeded = downPayment + welcomeTax + notaryFees + inspectionFees + initialRenovations;
    const monthlyRate = rate / 100 / 12;
    const numberOfPayments = amortization * 12;
    const monthlyMortgage = monthlyRate > 0
        ? (monthlyRate * totalMortgage * Math.pow(1 + monthlyRate, numberOfPayments)) / (Math.pow(1 + monthlyRate, numberOfPayments) - 1)
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
            let yearInterest = 0; let yearPrincipal = 0;
            if (year > 1 && (year - 1) % 5 === 0) {
                currentRate = renewalRate / 100 / 12;
                const remainingMonths = (amortization - year + 1) * 12;
                if (currentRate > 0) currentMonthlyPayment = (currentRate * balance * Math.pow(1 + currentRate, remainingMonths)) / (Math.pow(1 + currentRate, remainingMonths) - 1);
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
            data.push({ year, calendarYear: purchaseYear + year, age: year, Solde: Math.max(0, Math.round(balance)), Valeur: Math.round(propertyValue), Équité: Math.max(0, Math.round(propertyValue - Math.max(0, balance))), Intérêts: Math.round(totalInterestPaid), Principal: Math.round(totalPrincipalPaid), PartInteret: Math.round(yearInterest), PartPrincipal: Math.round(yearPrincipal), Taux: (currentRate * 12 * 100).toFixed(1) + '%', Renos: Math.round(yearlyRenovations * year) });
        }
        return { data, totalInterest: totalInterestPaid, finalValue: propertyValue };
    }, [totalMortgage, rate, renewalRate, monthlyMortgage, amortization, price, propertyGrowthRate, initialRenovations, maxValue, targetDate, yearlyRenovations]);

    const monthlyTaxes = taxesYearly / 12;
    const totalMonthlyCost = monthlyMortgage + monthlyTaxes + heatingMonthly + condoFees;
    const netMonthlyCost = Math.max(0, totalMonthlyCost - rentalIncomeMonthly);
    const maintenanceMonthly = (price * 0.01) / 12;
    const initialInterest = totalMortgage * monthlyRate;
    const unrecoverableMonthly = Math.max(0, initialInterest + monthlyTaxes + heatingMonthly + condoFees + maintenanceMonthly - rentalIncomeMonthly);

    const buyVsRentData = useMemo(() => {
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
            else rentScenarioNetWorth -= Math.abs(differenceToInvest);
            const yearData = amortizationData.data[year - 1];
            if (yearData) buyNetWorth = yearData.Équité - yearlyRenovations * year;
            buyNetWorth *= (1 + propertyGrowthRate / 100);
            currentRentCost *= 1.03;
            data.push({ year, Locataire: Math.round(rentScenarioNetWorth), Propriétaire: Math.round(buyNetWorth) });
        }
        return data;
    }, [totalCashNeeded, downPayment, initialRenovations, currentRent, netMonthlyCost, maintenanceMonthly, marketReturn, amortizationData, yearlyRenovations, propertyGrowthRate, amortization]);

    const fmt = (n: number) => n.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
    const lastData = amortizationData.data[amortizationData.data.length - 1];
    const finalEquity = lastData?Équité || 0;
    const breakEvenYear = buyVsRentData.findIndex(d => d.Propriétaire > d.Locataire) + 1;

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <ConfirmModal isOpen={!!confirmDeleteGoalId} onConfirm={doConfirmDeleteGoal} onCancel={() => setConfirmDeleteGoalId(null)} title="Supprimer la propriété" message="Supprimer ce scénario immobilier définitivement ?" confirmLabel="Supprimer" />

            {/* Multi-Property Tabs */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
                {goals.map((g, idx) => (
                    <button key={g.id} onClick={() => setActiveGoalId(g.id)}
                        className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${activeGoalId === g.id ? 'bg-blue-500/20 border-blue-500 text-blue-300 font-bold' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}>
                        <span>🏠 {g.name || (g.isPrimaryResidence ? 'Résidence' : `Propriété ${idx + 1}`)}</span>
                        {g.isActive && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
                        {goals.length > 1 && (
                            <span onClick={(e) => { e.stopPropagation(); deleteGoal(g.id); }} className="ml-2 text-gray-600 hover:text-red-400 cursor-pointer">✕</span>
                        )}
                    </button>
                ))}
                <button onClick={addNewGoal} className="px-4 py-2 rounded-xl bg-white/5 border border-dashed border-white/20 text-gray-400 hover:bg-white/10 flex items-center gap-2">＋ Ajouter une propriété</button>
            </div>

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">{propertyName}</h2>
                    <p className="text-gray-400 text-sm mt-1">{activeGoal.isPrimaryResidence ? 'Résidence principale — Analyse hypothécaire complète' : 'Investissement locatif — Analyse de rentabilité'}</p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={() => setMode(mode === 'AUTO' ? 'MANUAL' : 'AUTO')} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${mode === 'AUTO' ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-white/10 text-gray-400'}`}>{mode === 'AUTO' ? '⚙️ Auto' : '📝 Manuel'}</button>
                    <button onClick={() => updateActiveGoal({ isActive: !activeGoal.isActive })} className={`px-4 py-2 rounded-xl font-bold text-sm border transition-all ${activeGoal.isActive ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}>{activeGoal.isActive ? '✅ Actif dans Futur' : 'Activer dans Futur'}</button>
                    <button onClick={() => updateActiveGoal({ isPrimaryResidence: !activeGoal.isPrimaryResidence })} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10">{activeGoal.isPrimaryResidence ? '🏠 Principale' : '💼 Locatif'}</button>
                </div>
            </div>

            {/* Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[#151922] border border-white/10 rounded-2xl p-4">
                    <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Prix d'Achat</div>
                    <div className="text-2xl font-black text-white privacy-blur">{fmt(price)}</div>
                    <div className="text-xs text-gray-500 mt-1">Mise de fonds {downPaymentPercent}%</div>
                </div>
                <div className="bg-[#151922] border border-white/10 rounded-2xl p-4">
                    <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Paiement Mensuel</div>
                    <div className="text-2xl font-black text-white privacy-blur">{fmt(totalMonthlyCost)}</div>
                    <div className="text-xs text-gray-500 mt-1">Hypothèque + taxes + chauffage</div>
                </div>
                <div className="bg-[#151922] border border-white/10 rounded-2xl p-4">
                    <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Équité à terme</div>
                    <div className="text-2xl font-black text-white privacy-blur">{fmt(finalEquity)}</div>
                    <div className="text-xs text-gray-500 mt-1">Après {amortization} ans d'amortissement</div>
                </div>
                <div className="bg-[#151922] border border-white/10 rounded-2xl p-4">
                    <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Cash Total Nécessaire</div>
                    <div className="text-2xl font-black text-white privacy-blur">{fmt(totalCashNeeded)}</div>
                    <div className={`text-xs mt-1 font-bold ${availableCash >= totalCashNeeded ? 'text-green-400' : 'text-red-400'}`}>{availableCash >= totalCashNeeded ? `✅ Vous avez ${fmt(availableCash)}` : `⚠️ Manque ${fmt(totalCashNeeded - availableCash)}`}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* CONFIGURATEUR */}
                <div className="space-y-4">
                    <Card title="🏠 Paramètres de la Propriété">
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Nom / Identifiant</label>
                                <input type="text" value={activeGoal.name || ''} onChange={e => updateActiveGoal({ name: e.target.value })} className="w-full bg-white/5 border border-border rounded px-2 py-1.5 text-white text-sm outline-none focus:border-primary" placeholder="Ex: Maison Laval" />
                            </div>
                            <div className="flex justify-between items-center"><label className="text-xs text-gray-300">Prix d'achat</label><input type="number" value={price} onChange={e => updateActiveGoal({ price: Number(e.target.value) })} className="w-28 bg-white/5 border border-border rounded px-2 py-1 text-right text-sm text-white" /></div>
                            <div className="flex justify-between items-center"><label className="text-xs text-gray-300">Mise de fonds</label><input type="number" value={downPayment} onChange={e => updateActiveGoal({ downPayment: Number(e.target.value) })} className="w-28 bg-white/5 border border-border rounded px-2 py-1 text-right text-sm text-white" /></div>
                            <div className="flex justify-between items-center"><label className="text-xs text-gray-300">Taux hypothécaire (%)</label><input type="number" step="0.1" value={rate} onChange={e => updateActiveGoal({ mortgageRate: Number(e.target.value) })} className="w-28 bg-white/5 border border-border rounded px-2 py-1 text-right text-sm text-white" /></div>
                            <div className="flex justify-between items-center"><label className="text-xs text-gray-300">Amortissement (ans)</label><input type="number" value={amortization} onChange={e => updateActiveGoal({ amortization: Number(e.target.value) })} className="w-28 bg-white/5 border border-border rounded px-2 py-1 text-right text-sm text-white" /></div>
                            <div className="flex justify-between items-center"><label className="text-xs text-gray-300">Taux renouvellement (%)</label><input type="number" step="0.1" value={renewalRate} onChange={e => updateActiveGoal({ renewalRateProjection: Number(e.target.value) })} className="w-28 bg-white/5 border border-border rounded px-2 py-1 text-right text-sm text-white" /></div>
                            <div className="flex justify-between items-center"><label className="text-xs text-gray-300">Croissance propriété (%/an)</label><input type="number" step="0.1" value={propertyGrowthRate} onChange={e => updateActiveGoal({ propertyGrowthRate: Number(e.target.value) })} className="w-28 bg-white/5 border border-border rounded px-2 py-1 text-right text-sm text-white" /></div>
                            <div className="flex justify-between items-center"><label className="text-xs text-gray-300">Date d'achat prévue</label><input type="date" value={targetDate} onChange={e => updateActiveGoal({ purchaseDate: e.target.value })} className="w-36 bg-white/5 border border-border rounded px-2 py-1 text-right text-xs text-white" /></div>
                        </div>
                    </Card>
                    <Card title="💸 Revenus & Charges">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center"><label className="text-xs text-gray-300">Revenu locatif/mois</label><input type="number" value={rentalIncomeMonthly} onChange={e => updateActiveGoal({ rentalIncomeMonthly: Number(e.target.value) })} className="w-24 bg-white/5 border border-border rounded px-2 py-1 text-right text-sm text-green-400" /></div>
                            <div className="flex justify-between items-center"><label className="text-xs text-gray-300">Taxes municipales/an</label><input type="number" value={taxesYearly} onChange={e => setTaxesYearly(Number(e.target.value))} disabled={mode === 'AUTO'} className="w-24 bg-white/5 border border-border rounded px-2 py-1 text-right text-sm text-white disabled:opacity-50" /></div>
                            <div className="flex justify-between items-center"><label className="text-xs text-gray-300">Chauffage/mois</label><input type="number" value={heatingMonthly} onChange={e => setHeatingMonthly(Number(e.target.value))} disabled={mode === 'AUTO'} className="w-24 bg-white/5 border border-border rounded px-2 py-1 text-right text-sm text-white disabled:opacity-50" /></div>
                            <div className="flex justify-between items-center"><label className="text-xs text-gray-300">Condo/mois</label><input type="number" value={condoFees} onChange={e => setCondoFees(Number(e.target.value))} className="w-24 bg-white/5 border border-border rounded px-2 py-1 text-right text-sm text-white" /></div>
                            <div className="flex justify-between items-center"><label className="text-xs text-gray-300">Réno. initiales</label><input type="number" value={initialRenovations} onChange={e => updateActiveGoal({ initialRenovations: Number(e.target.value) })} className="w-24 bg-white/5 border border-border rounded px-2 py-1 text-right text-sm text-white" /></div>
                            <div className="flex justify-between items-center"><label className="text-xs text-gray-300">Réno. annuelles</label><input type="number" value={yearlyRenovations} onChange={e => updateActiveGoal({ yearlyRenovations: Number(e.target.value) })} className="w-24 bg-white/5 border border-border rounded px-2 py-1 text-right text-sm text-white" /></div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-white/10 space-y-1">
                            <div className="flex justify-between text-xs"><span className="text-gray-400">Coût mensuel brut</span><span className="text-white font-bold">{fmt(totalMonthlyCost)}</span></div>
                            {rentalIncomeMonthly > 0 && <div className="flex justify-between text-xs"><span className="text-green-400">- Revenu locatif</span><span className="text-green-400">-{fmt(rentalIncomeMonthly)}</span></div>}
                            <div className="flex justify-between text-xs font-bold"><span className="text-gray-200">Coût net mensuel</span><span className="text-white">{fmt(netMonthlyCost)}</span></div>
                            <div className="flex justify-between text-xs"><span className="text-red-400">Non-récupérable/mois</span><span className="text-red-400">{fmt(unrecoverableMonthly)}</span></div>
                        </div>
                    </Card>
                </div>

                {/* CHARTS */}
                <div className="lg:col-span-2 space-y-6">
                    <Card title="📈 Évolution Hypothèque & Équité">
                        <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={amortizationData.data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                                        <linearGradient id="debtGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                    <XAxis dataKey="year" stroke="#666" tick={{ fontSize: 10 }} tickFormatter={v => `An ${v}`} />
                                    <YAxis stroke="#666" tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                                    <Tooltip contentStyle={{ backgroundColor: '#151922', borderColor: '#333', borderRadius: 8 }} formatter={(v: number) => fmt(v)} labelFormatter={l => `Année ${l}`} />
                                    <Legend />
                                    <Area type="monotone" dataKey="Valeur" stroke="#8b5cf6" fill="none" strokeWidth={1.5} strokeDasharray="4 4" name="Valeur Marché" />
                                    <Area type="monotone" dataKey="Équité" stroke="#10b981" fill="url(#equityGrad)" strokeWidth={2} name="Équité" />
                                    <Area type="monotone" dataKey="Solde" stroke="#ef4444" fill="url(#debtGrad)" strokeWidth={2} name="Solde Hypothèque" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    <Card title="🥇 Acheter vs. Louer" action={
                        breakEvenYear > 0 ? <div className="text-xs font-bold text-green-400 bg-green-900/20 px-2 py-1 rounded border border-green-500/30">⚡ Rentable en {breakEvenYear} ans</div> : <div className="text-xs text-gray-500">Louer reste avantageux</div>
                    }>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div><label className="text-xs text-gray-400 block mb-1">Loyer actuel/mois</label><input type="number" value={currentRent} onChange={e => setCurrentRent(Number(e.target.value))} className="w-full bg-white/5 border border-border rounded px-2 py-1 text-sm text-white" /></div>
                            <div><label className="text-xs text-gray-400 block mb-1">Rendement bourse (%)</label><input type="number" step="0.5" value={marketReturn} onChange={e => setMarketReturn(Number(e.target.value))} className="w-full bg-white/5 border border-border rounded px-2 py-1 text-sm text-white" /></div>
                        </div>
                        <div className="h-[220px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={buyVsRentData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="buyGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                                        <linearGradient id="rentGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                    <XAxis dataKey="year" stroke="#666" tick={{ fontSize: 10 }} tickFormatter={v => `An ${v}`} />
                                    <YAxis stroke="#666" tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                                    <Tooltip contentStyle={{ backgroundColor: '#151922', borderColor: '#333', borderRadius: 8 }} formatter={(v: number) => fmt(v)} labelFormatter={l => `Année ${l}`} />
                                    <Legend />
                                    <Area type="monotone" dataKey="Propriétaire" stroke="#10b981" fill="url(#buyGrad)" strokeWidth={2} name="Propriétaire" />
                                    <Area type="monotone" dataKey="Locataire" stroke="#3b82f6" fill="url(#rentGrad)" strokeWidth={2} name="Locataire (investi)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-3">ℹ️ Si vous louez, on suppose que vous investissez la mise de fonds + la différence mensuelle en bourse. Points de croisement = moment où l'achat devient plus rentable.</p>
                    </Card>
                </div>
            </div>
        </div>
    );
};
