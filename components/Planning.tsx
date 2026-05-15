import React, { useMemo, useState } from 'react';
import { Transaction, RecurringItem, SavingsGoal, BudgetConfig, BudgetCategory } from '../types';
import { Card } from './ui/Card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { detectSubscriptionsAI } from '../services/gemini';
import { showToast } from './ui/Toast';
import { ConfirmModal } from './ui/ConfirmModal';

interface PlanningProps {
    transactions: Transaction[];
    savingsGoals: SavingsGoal[];
    setSavingsGoals: (goals: SavingsGoal[]) => void;
    budgetItems: BudgetCategory[];
    setBudgetItems: (items: BudgetCategory[]) => void;
    config: BudgetConfig;
    apiKey?: string;
}

export const Planning: React.FC<PlanningProps> = ({ transactions, savingsGoals = [], setSavingsGoals, budgetItems, setBudgetItems, config, apiKey }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiSubs, setAiSubs] = useState<RecurringItem[] | null>(null);
    const [isAddingGoal, setIsAddingGoal] = useState(false);
    const [confirmDeleteGoalId, setConfirmDeleteGoalId] = useState<string | null>(null);
    const [newGoal, setNewGoal] = useState<Partial<SavingsGoal>>({ name: '', targetAmount: 0, currentAmount: 0, deadline: '', icon: '💰' });

    const heuristicSubs = useMemo(() => {
        const groups: Record<string, Transaction[]> = {};
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const variableKeywords = ['iga', 'metro', 'provigo', 'super c', 'maxi', 'walmart', 'costco', 'dollama', 'mcdonald', 'tim horton', 'starbucks', 'uber', 'taxi', 'restaurant', 'resto', 'bar', 'saq', 'petro', 'shell', 'esso', 'ultramar', 'sonic', 'essence', 'gaz', 'pharmaprix', 'jean coutu', 'uniprix', 'familiprix', 'amazon', 'paypal', 'home depot', 'canadian tire'];
        transactions.filter(t => t.amount < 0 && !t.isTransfer && !t.isDuplicate && new Date(t.date) > sixMonthsAgo).forEach(t => {
            const key = (t.payee || 'Inconnu').toLowerCase().trim().replace(/[0-9*#]/g, '').replace('payment', '').replace('paiement', '').replace('prel', '').trim();
            if (variableKeywords.some(k => key.includes(k) || (t.category || '').toLowerCase().includes(k))) return;
            if (!groups[key]) groups[key] = [];
            groups[key].push(t);
        });
        const detected: RecurringItem[] = [];
        const subKeywords = ['netflix', 'spotify', 'apple', 'google', 'disney', 'hbo', 'crave', 'bell', 'rogers', 'fido', 'videotron', 'hydro', 'gym', 'fitness', 'adobe', 'chatgpt', 'openai', 'icloud', 'dropbox', 'assurance', 'loyer', 'rent', 'intact', 'ia', 'desjardins', 'ssq'];
        Object.entries(groups).forEach(([key, txs]) => {
            if (txs.length >= 2) {
                txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                const amounts = txs.map(t => Math.abs(t.amount));
                const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
                const isStableAmount = amounts.every(a => Math.abs(a - avg) < 5);
                let isValidInterval = false;
                const last = new Date(txs[txs.length - 1].date);
                const prev = new Date(txs[txs.length - 2].date);
                const diffDays = Math.abs(last.getTime() - prev.getTime()) / (1000 * 3600 * 24);
                if (diffDays >= 20 && diffDays <= 40) isValidInterval = true;
                if (diffDays >= 350 && diffDays <= 380) isValidInterval = true;
                if (isStableAmount && isValidInterval) {
                    const lastTx = txs[txs.length - 1];
                    detected.push({ payee: lastTx.payee, averageAmount: avg, dayOfMonth: new Date(lastTx.date).getDate(), category: lastTx.category, lastDate: lastTx.date, yearlyCost: avg * (diffDays >= 350 ? 1 : 12) });
                }
            }
        });
        return detected.sort((a, b) => b.averageAmount - a.averageAmount);
    }, [transactions]);

    const activeSubs = aiSubs || heuristicSubs;
    const { totalMonthly, totalYearly, potentialSavings } = useMemo(() => { const mTotal = activeSubs.reduce((acc, i) => acc + i.averageAmount, 0); const yTotal = mTotal * 12; return { totalMonthly: mTotal, totalYearly: yTotal, potentialSavings: yTotal * 10 * 1.4 }; }, [activeSubs]);

    const calendarDays = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days = [];
        const startPadding = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        for (let i = 0; i < startPadding; i++) days.push(null);
        for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
        return days;
    }, [currentDate]);

    const changeMonth = (delta: number) => { const newDate = new Date(currentDate); newDate.setMonth(newDate.getMonth() + delta); setCurrentDate(newDate); };

    const handleAddGoal = () => {
        if (newGoal.name && newGoal.targetAmount) {
            setSavingsGoals([...savingsGoals, { ...newGoal, id: Date.now().toString() } as SavingsGoal]);
            setIsAddingGoal(false);
            setNewGoal({ name: '', targetAmount: 0, currentAmount: 0, deadline: '', icon: '💰' });
        }
    };

    const handleDeleteGoal = (id: string) => { setConfirmDeleteGoalId(id); };

    const doConfirmDeleteGoal = () => {
        if (confirmDeleteGoalId) {
            setSavingsGoals(savingsGoals.filter(g => g.id !== confirmDeleteGoalId));
            setConfirmDeleteGoalId(null);
        }
    };

    const handleAiAnalysis = async () => {
        if (!apiKey) { showToast('Clé API requise.', 'info'); return; }
        setIsAnalyzing(true);
        try { const results = await detectSubscriptionsAI(transactions, apiKey); if (results.length > 0) setAiSubs(results); else showToast("L'IA n'a rien détecté de plus.", 'info'); }
        catch (e) { console.error('AI Analysis Error:', e); showToast('Erreur lors de l\'analyse IA', 'error'); }
        finally { setIsAnalyzing(false); }
    };

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <ConfirmModal isOpen={!!confirmDeleteGoalId} onConfirm={doConfirmDeleteGoal} onCancel={() => setConfirmDeleteGoalId(null)} title="Supprimer l'objectif" message="Supprimer cet objectif d'épargne définitivement ?" confirmLabel="Supprimer" />
            <div className="flex flex-col md:flex-row justify-between items-end gap-4 bg-gradient-to-r from-blue-900/20 to-purple-900/20 p-6 rounded-2xl border border-white/10">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">Planification & Charges Fixes</h2>
                    <p className="text-gray-400 text-sm mt-1">Abonnements, Factures Récurrentes & Objectifs.</p>
                </div>
                <div className="flex gap-4">
                    <div className="text-right"><div className="text-tiny uppercase text-gray-500 font-bold">Fixe Mensuel</div><div className="text-2xl font-bold text-red-400 privacy-blur">{totalMonthly.toFixed(0)} $</div></div>
                    <div className="w-px bg-white/10"></div>
                    <div className="text-right"><div className="text-tiny uppercase text-gray-500 font-bold">Coût Annuel</div><div className="text-2xl font-bold text-white privacy-blur">{totalYearly.toLocaleString()} $</div></div>
                </div>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-1 space-y-6">
                    <Card title="Abonnements & Récurrents" action={
                        <div className="flex gap-2">{!aiSubs ? (<button onClick={handleAiAnalysis} disabled={isAnalyzing} className="text-tiny bg-gradient-to-r from-secondary to-purple-600 px-2 py-1 rounded text-white font-bold hover:brightness-110 disabled:opacity-50">{isAnalyzing ? '...' : '⚡ IA'}</button>) : (<button onClick={() => setAiSubs(null)} className="text-tiny bg-white/10 px-2 py-1 rounded text-gray-400">Reset</button>)}</div>
                    }>
                        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                            {activeSubs.map((sub, idx) => (
                                <div key={idx} className="flex justify-between items-center p-3 bg-[#1a1a1a] rounded-xl border border-white/5 hover:border-white/20 transition-all group">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-sm shadow-inner flex-shrink-0">{(sub.payee || '').toLowerCase().includes('netflix') ? '🍿' : (sub.payee || '').toLowerCase().includes('spotify') ? '🎵' : (sub.payee || '').toLowerCase().includes('hydro') ? '⚡' : (sub.payee || '').toLowerCase().includes('internet') ? '🌐' : (sub.payee || '').toLowerCase().includes('loyer') ? '🏠' : '💳'}</div>
                                        <div className="min-w-0"><div className="font-bold text-white text-sm truncate">{sub.payee}</div><div className="text-tiny text-gray-500">Le {sub.dayOfMonth} du mois</div></div>
                                    </div>
                                    <div className="text-right flex-shrink-0"><div className="font-bold text-white privacy-blur">{sub.averageAmount.toFixed(0)}$</div><div className="text-tiny text-gray-600">/mois</div></div>
                                </div>
                            ))}
                            {activeSubs.length === 0 && <div className="text-center text-gray-500 py-10">Aucun abonnement détecté.</div>}
                        </div>
                        <div className="mt-4 bg-gradient-to-br from-red-900/20 to-black border border-red-500/20 p-3 rounded-xl flex items-center justify-between">
                            <div><div className="text-tiny text-red-300 uppercase font-bold">Le "Latte Factor"</div><div className="text-tiny text-gray-400">Si investi à 7% sur 10 ans</div></div>
                            <div className="text-xl font-black text-white privacy-blur">{potentialSavings.toLocaleString()}$</div>
                        </div>
                    </Card>
                </div>
                <div className="xl:col-span-1 space-y-6">
                    <Card title="Calendrier des Factures">
                        <div className="flex justify-between items-center mb-4 bg-white/5 p-2 rounded-lg">
                            <button onClick={() => changeMonth(-1)} className="p-1 px-3 hover:bg-white/10 rounded text-gray-400">◀</button>
                            <h2 className="text-sm font-bold text-white capitalize">{currentDate.toLocaleString('fr-CA', { month: 'long', year: 'numeric' })}</h2>
                            <button onClick={() => changeMonth(1)} className="p-1 px-3 hover:bg-white/10 rounded text-gray-400">▶</button>
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => <div key={d} className="text-center text-gray-600 text-tiny font-bold uppercase pb-1">{d}</div>)}
                            {calendarDays.map((date, idx) => {
                                if (!date) return <div key={idx} />;
                                const day = date.getDate();
                                const isToday = new Date().toDateString() === date.toDateString();
                                const bills = activeSubs.filter(i => i.dayOfMonth === day);
                                const hasBills = bills.length > 0;
                                const dailyTotal = bills.reduce((s, b) => s + b.averageAmount, 0);
                                return (
                                    <div key={idx} className={`aspect-square rounded-lg border flex flex-col items-center justify-center relative ${isToday ? 'bg-primary/20 border-primary' : hasBills ? 'bg-red-500/10 border-red-500/30' : 'bg-dark/40 border-white/5'}`}>
                                        <span className={`text-xs font-bold ${isToday ? 'text-primary' : 'text-gray-500'}`}>{day}</span>
                                        {hasBills && <div className="mt-1 text-center"><div className="text-tiny font-bold text-white leading-none">{dailyTotal.toFixed(0)}$</div><div className="flex gap-0.5 justify-center mt-0.5">{bills.slice(0, 3).map((b, bi) => <div key={bi} className="w-1 h-1 rounded-full bg-red-400" title={b.payee}></div>)}</div></div>}
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                </div>
                <div className="xl:col-span-1 space-y-6">
                    <Card title="Objectifs (Sinking Funds)" action={<button onClick={() => setIsAddingGoal(!isAddingGoal)} className="text-tiny bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-white">+ Nouveau</button>}>
                        {isAddingGoal && (
                            <div className="mb-4 p-3 bg-white/5 rounded border border-white/10 grid grid-cols-2 gap-2">
                                <input type="text" placeholder="Nom" className="bg-dark border border-white/10 rounded px-2 py-1 text-xs text-white" value={newGoal.name} onChange={e => setNewGoal({ ...newGoal, name: e.target.value })} />
                                <input type="number" placeholder="Cible $" className="bg-dark border border-white/10 rounded px-2 py-1 text-xs text-white" value={newGoal.targetAmount || ''} onChange={e => setNewGoal({ ...newGoal, targetAmount: parseFloat(e.target.value) })} />
                                <input type="number" placeholder="Actuel $" className="bg-dark border border-white/10 rounded px-2 py-1 text-xs text-white" value={newGoal.currentAmount || ''} onChange={e => setNewGoal({ ...newGoal, currentAmount: parseFloat(e.target.value) })} />
                                <input type="date" className="bg-dark border border-white/10 rounded px-2 py-1 text-xs text-white" value={newGoal.deadline} onChange={e => setNewGoal({ ...newGoal, deadline: e.target.value })} />
                                <button onClick={handleAddGoal} className="col-span-2 bg-primary text-white text-xs font-bold py-1 rounded">Ajouter</button>
                            </div>
                        )}
                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                            {savingsGoals.map(goal => {
                                const progress = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
                                return (
                                    <div key={goal.id} className="relative p-3 bg-[#1a1a1a] rounded-xl border border-white/5 group">
                                        <button onClick={() => handleDeleteGoal(goal.id)} className="absolute top-2 right-2 text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                                        <div className="flex justify-between items-center mb-1">
                                            <div className="flex items-center gap-2"><span className="text-lg">{goal.icon}</span><span className="text-sm font-bold text-white">{goal.name}</span></div>
                                            <span className="text-xs text-gray-400">{goal.currentAmount}/{goal.targetAmount}$</span>
                                        </div>
                                        <div className="w-full bg-black/50 rounded-full h-1.5"><div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full" style={{ width: `${Math.min(100, progress)}%` }}></div></div>
                                    </div>
                                );
                            })}
                            {savingsGoals.length === 0 && <div className="text-center text-gray-500 text-xs py-4">Aucun objectif.</div>}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};
