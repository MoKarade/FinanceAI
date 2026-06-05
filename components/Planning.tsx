import React, { useMemo, useState } from 'react';
import { logError } from '../services/errorLogger';
import { Transaction, RecurringItem, SavingsGoal, BudgetConfig, BudgetCategory } from '../types';
import { Card } from './ui/Card';
import { ProjectionRequired } from './ui/ProjectionRequired';
// Phase 4 A5: bascule sur services/claude.ts (Haiku 4.5)
import { detectSubscriptionsAI } from '../services/claude';
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
    /** G22-N3 — sous-section rendue quand intégré dans Budget :
     *  'fixed' = Abonnements/Récurrents + Calendrier ; 'goals' = Objectifs ; 'all' = tout. */
    section?: 'all' | 'fixed' | 'goals';
}

export const Planning: React.FC<PlanningProps> = ({ transactions, savingsGoals = [], setSavingsGoals, budgetItems: _budgetItems, setBudgetItems: _setBudgetItems, config: _config, apiKey, section = 'all' }) => {
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
        Object.entries(groups).forEach(([_key, txs]) => {
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
    const { totalMonthly, totalYearly } = useMemo(() => {
        const mTotal = activeSubs.reduce((acc, i) => acc + i.averageAmount, 0);
        const yTotal = mTotal * 12;
        return { totalMonthly: mTotal, totalYearly: yTotal };
    }, [activeSubs]);

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
        setIsAnalyzing(true);
        try {
            if (!apiKey) {
                showToast('Configure une clé Anthropic pour analyser tes abonnements.', 'info');
                return;
            }
            const results = await detectSubscriptionsAI(transactions, apiKey);
            if (results.length > 0) setAiSubs(results);
            else showToast("L'IA n'a rien détecté de plus.", 'info');
        } catch (e) {
            logError({ source: 'ai', severity: 'error', message: 'Détection IA des abonnements échouée', error: e });
            showToast("Erreur lors de l'analyse IA", 'error');
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <ConfirmModal isOpen={!!confirmDeleteGoalId} onConfirm={doConfirmDeleteGoal} onCancel={() => setConfirmDeleteGoalId(null)} title="Supprimer l'objectif" message="Supprimer cet objectif d'épargne définitivement ?" confirmLabel="Supprimer" />
            {section !== 'goals' && (
            <div className="flex flex-col md:flex-row justify-between items-end gap-4 bg-gradient-to-r from-blue-900/20 to-purple-900/20 p-6 rounded-2xl border border-white/10">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">{section === 'all' ? 'Planification & Charges Fixes' : 'Charges Fixes & Abonnements'}</h2>
                    <p className="text-ink-300 text-body mt-1">{section === 'all' ? 'Abonnements, Factures Récurrentes & Objectifs.' : 'Abonnements & Factures Récurrentes.'}</p>
                </div>
                <div className="flex gap-4">
                    <div className="text-right"><div className="text-tiny uppercase text-ink-500 font-bold">Fixe Mensuel</div><div className="text-2xl font-bold text-danger-400 privacy-blur">{totalMonthly.toFixed(0)} $</div></div>
                    <div className="w-px bg-white/10"></div>
                    <div className="text-right"><div className="text-tiny uppercase text-ink-500 font-bold">Coût Annuel</div><div className="text-2xl font-bold text-white privacy-blur">{totalYearly.toLocaleString()} $</div></div>
                </div>
            </div>
            )}
            <div className={`grid grid-cols-1 gap-6 ${section === 'all' ? 'xl:grid-cols-3' : section === 'fixed' ? 'xl:grid-cols-2' : 'xl:grid-cols-1'}`}>
                {section !== 'goals' && (
                <div className="xl:col-span-1 space-y-6">
                    <Card title="Abonnements & Récurrents" action={
                        <div className="flex gap-2">{!aiSubs ? (<button onClick={handleAiAnalysis} disabled={isAnalyzing} className="text-tiny bg-gradient-to-r from-secondary to-purple-600 px-2 py-1 rounded text-white font-bold hover:brightness-110 disabled:opacity-50">{isAnalyzing ? '...' : '⚡ IA'}</button>) : (<button onClick={() => setAiSubs(null)} className="text-tiny bg-white/10 px-2 py-1 rounded text-ink-300">Reset</button>)}</div>
                    }>
                        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                            {activeSubs.map((sub, idx) => (
                                <div key={idx} className="flex justify-between items-center p-3 bg-[#1a1a1a] rounded-xl border border-white/5 hover:border-white/20 transition-all group">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-body shadow-inner flex-shrink-0">{(sub.payee || '').toLowerCase().includes('netflix') ? '🍿' : (sub.payee || '').toLowerCase().includes('spotify') ? '🎵' : (sub.payee || '').toLowerCase().includes('hydro') ? '⚡' : (sub.payee || '').toLowerCase().includes('internet') ? '🌐' : (sub.payee || '').toLowerCase().includes('loyer') ? '🏠' : '💳'}</div>
                                        <div className="min-w-0"><div className="font-bold text-white text-body truncate">{sub.payee}</div><div className="text-tiny text-ink-500">Le {sub.dayOfMonth} du mois</div></div>
                                    </div>
                                    <div className="text-right flex-shrink-0"><div className="font-bold text-white privacy-blur">{sub.averageAmount.toFixed(0)}$</div><div className="text-tiny text-ink-500">/mois</div></div>
                                </div>
                            ))}
                            {activeSubs.length === 0 && <div className="text-center text-ink-500 py-10">Aucun abonnement détecté.</div>}
                        </div>
                        <div className="mt-4 bg-gradient-to-br from-red-900/20 to-black border border-danger-500/20 p-3 rounded-xl">
                            <div className="text-tiny text-red-300 uppercase font-bold mb-2">Le "Latte Factor"</div>
                            <div className="text-tiny text-ink-300 mb-2">
                                Impact à long terme de ces {activeSubs.length} abonnements si l'argent était plutôt investi.
                            </div>
                            <ProjectionRequired variant="inline" feature="cette projection long-terme" />
                        </div>
                    </Card>
                </div>
                )}
                {section !== 'goals' && (
                <div className="xl:col-span-1 space-y-6">
                    <Card title="Calendrier des Factures">
                        <div className="flex justify-between items-center mb-4 bg-white/5 p-2 rounded-lg">
                            <button onClick={() => changeMonth(-1)} aria-label="Mois précédent" className="touch-target flex items-center justify-center hover:bg-white/10 rounded text-ink-300 focus-ring">◀</button>
                            <h2 className="text-body font-bold text-white capitalize">{currentDate.toLocaleString('fr-CA', { month: 'long', year: 'numeric' })}</h2>
                            <button onClick={() => changeMonth(1)} aria-label="Mois suivant" className="touch-target flex items-center justify-center hover:bg-white/10 rounded text-ink-300 focus-ring">▶</button>
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => <div key={d} className="text-center text-ink-500 text-tiny font-bold uppercase pb-1">{d}</div>)}
                            {calendarDays.map((date, idx) => {
                                if (!date) return <div key={idx} />;
                                const day = date.getDate();
                                const isToday = new Date().toDateString() === date.toDateString();
                                const bills = activeSubs.filter(i => i.dayOfMonth === day);
                                const hasBills = bills.length > 0;
                                const dailyTotal = bills.reduce((s, b) => s + b.averageAmount, 0);
                                return (
                                    <div key={idx} className={`aspect-square rounded-lg border flex flex-col items-center justify-center relative ${isToday ? 'bg-primary/20 border-primary' : hasBills ? 'bg-danger-500/10 border-danger-500/30' : 'bg-dark/40 border-white/5'}`}>
                                        <span className={`text-meta font-bold ${isToday ? 'text-primary' : 'text-ink-500'}`}>{day}</span>
                                        {hasBills && <div className="mt-1 text-center"><div className="text-tiny font-bold text-white leading-none">{dailyTotal.toFixed(0)}$</div><div className="flex gap-0.5 justify-center mt-0.5">{bills.slice(0, 3).map((b, bi) => <div key={bi} className="w-1 h-1 rounded-full bg-danger-400" title={b.payee}></div>)}</div></div>}
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                </div>
                )}
                {section !== 'fixed' && (
                <div className="xl:col-span-1 space-y-6">
                    <Card title="Objectifs (Sinking Funds)" action={<button onClick={() => setIsAddingGoal(!isAddingGoal)} className="text-tiny bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-white">+ Nouveau</button>}>
                        {isAddingGoal && (
                            <div className="mb-4 p-3 bg-white/5 rounded border border-white/10 grid grid-cols-2 gap-2">
                                <input aria-label="Nom de l'objectif" type="text" placeholder="Nom" className="bg-dark border border-white/10 rounded px-2 py-1 text-meta text-white" value={newGoal.name} onChange={e => setNewGoal({ ...newGoal, name: e.target.value })} />
                                <input aria-label="Montant cible (dollars)" type="number" placeholder="Cible $" className="bg-dark border border-white/10 rounded px-2 py-1 text-meta text-white" value={newGoal.targetAmount || ''} onChange={e => setNewGoal({ ...newGoal, targetAmount: parseFloat(e.target.value) })} />
                                <input aria-label="Montant actuel (dollars)" type="number" placeholder="Actuel $" className="bg-dark border border-white/10 rounded px-2 py-1 text-meta text-white" value={newGoal.currentAmount || ''} onChange={e => setNewGoal({ ...newGoal, currentAmount: parseFloat(e.target.value) })} />
                                <input aria-label="Date d'échéance" type="date" className="bg-dark border border-white/10 rounded px-2 py-1 text-meta text-white" value={newGoal.deadline} onChange={e => setNewGoal({ ...newGoal, deadline: e.target.value })} />
                                <button onClick={handleAddGoal} className="col-span-2 bg-primary text-white text-meta font-bold py-1 rounded">Ajouter</button>
                            </div>
                        )}
                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                            {savingsGoals.map(goal => {
                                const progress = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
                                return (
                                    <div key={goal.id} className="relative p-3 bg-[#1a1a1a] rounded-xl border border-white/5 group">
                                        <button onClick={() => handleDeleteGoal(goal.id)} aria-label={`Supprimer l'objectif ${goal.name}`} className="absolute top-1 right-1 touch-target flex items-center justify-center text-ink-500 hover:text-danger-500 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity focus-ring rounded">✕</button>
                                        <div className="flex justify-between items-center mb-1">
                                            <div className="flex items-center gap-2"><span className="text-lg">{goal.icon}</span><span className="text-body font-bold text-white">{goal.name}</span></div>
                                            <span className="text-meta text-ink-300">{goal.currentAmount}/{goal.targetAmount}$</span>
                                        </div>
                                        <div className="w-full bg-black/50 rounded-full h-1.5"><div className="h-full bg-gradient-to-r from-info-500 to-purple-500 rounded-full" style={{ width: `${Math.min(100, progress)}%` }}></div></div>
                                    </div>
                                );
                            })}
                            {savingsGoals.length === 0 && <div className="text-center text-ink-500 text-meta py-4">Aucun objectif.</div>}
                        </div>
                    </Card>
                </div>
                )}
            </div>
        </div>
    );
};
