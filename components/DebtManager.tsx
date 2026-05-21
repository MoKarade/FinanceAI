import React, { useState, useMemo } from 'react';
import { Card } from './ui/Card';
import { EmptyState } from './ui/EmptyState';
import { PageHeader } from './ui/PageHeader';
import { Badge } from './ui/Badge';
import { Debt } from '../types';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';
import { ConfirmModal } from './ui/ConfirmModal';

interface DebtManagerProps {
    debts: Debt[];
    setDebts: (d: Debt[]) => void;
}

export const DebtManager: React.FC<DebtManagerProps> = ({ debts, setDebts }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newDebt, setNewDebt] = useState<Partial<Debt>>({ name: '', balance: 0, interestRate: 0, minimumPayment: 0, category: 'CreditCard' });
    const [extraPayment, setExtraPayment] = useState(200);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const handleAdd = () => {
        if (newDebt.name && newDebt.balance && newDebt.balance > 0) {
            setDebts([...debts, { ...newDebt, id: Date.now().toString() } as Debt]);
            setIsAdding(false);
            setNewDebt({ name: '', balance: 0, interestRate: 0, minimumPayment: 0, category: 'CreditCard' });
        }
    };

    const handleDelete = (id: string) => { setConfirmDeleteId(id); };

    const doConfirmDelete = () => {
        if (confirmDeleteId) {
            setDebts(debts.filter(d => d.id !== confirmDeleteId));
            setConfirmDeleteId(null);
        }
    };

    const simulation = useMemo(() => {
        const data = [];
        let activeDebts = debts.map(d => ({ ...d }));
        let totalInterestPaid = 0;
        let month = 0;
        const maxMonths = 120;
        while (activeDebts.some(d => d.balance > 0) && month < maxMonths) {
            let monthlyBalanceTotal = 0;
            let remainingExtra = extraPayment;
            activeDebts.sort((a, b) => b.interestRate - a.interestRate);
            activeDebts.forEach(d => {
                if (d.balance <= 0) return;
                const interest = (d.balance * (d.interestRate / 100)) / 12;
                totalInterestPaid += interest;
                let payment = d.minimumPayment;
                if (remainingExtra > 0) { payment += remainingExtra; remainingExtra = 0; }
                if (payment > (d.balance + interest)) { remainingExtra += (payment - (d.balance + interest)); payment = d.balance + interest; }
                const principal = Math.max(0, payment - interest);
                d.balance -= principal;
                if (d.balance < 0) d.balance = 0;
                monthlyBalanceTotal += d.balance;
            });
            if (month % 3 === 0 || monthlyBalanceTotal === 0) data.push({ month, balance: Math.round(monthlyBalanceTotal), interestAccumulated: Math.round(totalInterestPaid) });
            month++;
        }
        return { chart: data, totalInterest: totalInterestPaid, months: month };
    }, [debts, extraPayment]);

    const totalDebt = debts.reduce((sum, d) => sum + d.balance, 0);
    const totalMinPayment = debts.reduce((sum, d) => sum + d.minimumPayment, 0);

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <ConfirmModal isOpen={!!confirmDeleteId} onConfirm={doConfirmDelete} onCancel={() => setConfirmDeleteId(null)} title="Supprimer la dette" message="Supprimer cette dette définitivement ?" confirmLabel="Supprimer" />
            <PageHeader
                icon="💸"
                title="Gestion de la Dette"
                subtitle="Éliminez vos dettes toxiques (cartes, prêts)."
                badge={<Badge variant={totalDebt > 0 ? 'danger' : 'success'} size="md">Total Dû: {totalDebt.toLocaleString()} $</Badge>}
            />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                    <Card title="Vos Dettes" action={<button onClick={() => setIsAdding(!isAdding)} className="text-xs bg-white/10 px-2 py-1 rounded hover:bg-white/20">+ Ajouter</button>}>
                        {isAdding && (
                            <div className="mb-4 p-3 bg-white/5 rounded border border-white/10 space-y-2">
                                <input aria-label="Nom de la dette" type="text" placeholder="Nom (ex: Visa)" className="w-full bg-dark border border-white/10 rounded px-2 py-1 text-xs text-white" value={newDebt.name} onChange={e => setNewDebt({...newDebt, name: e.target.value})} />
                                <div className="grid grid-cols-2 gap-2">
                                    <input aria-label="Solde de la dette (dollars)" type="number" placeholder="Solde $" className="bg-dark border border-white/10 rounded px-2 py-1 text-xs text-white" value={newDebt.balance || ''} onChange={e => setNewDebt({...newDebt, balance: parseFloat(e.target.value)})} />
                                    <input aria-label="Taux d'intérêt (pourcentage)" type="number" placeholder="Taux %" className="bg-dark border border-white/10 rounded px-2 py-1 text-xs text-white" value={newDebt.interestRate || ''} onChange={e => setNewDebt({...newDebt, interestRate: parseFloat(e.target.value)})} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <input aria-label="Paiement minimum mensuel (dollars)" type="number" placeholder="Min. Payment $" className="bg-dark border border-white/10 rounded px-2 py-1 text-xs text-white" value={newDebt.minimumPayment || ''} onChange={e => setNewDebt({...newDebt, minimumPayment: parseFloat(e.target.value)})} />
                                    <select aria-label="Catégorie de la dette" className="bg-dark border border-white/10 rounded px-2 py-1 text-xs text-white" value={newDebt.category} onChange={e => setNewDebt({...newDebt, category: e.target.value as any})}><option value="CreditCard">Carte Crédit</option><option value="Car">Auto</option><option value="Student">Étudiant</option><option value="Personal">Personnel</option></select>
                                </div>
                                <button onClick={handleAdd} className="w-full bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-2 rounded">Enregistrer</button>
                            </div>
                        )}
                        <div className="space-y-3">
                            {debts.map(d => (
                                <div key={d.id} className="p-3 bg-[#1a1a1a] rounded-xl border border-white/5 flex justify-between items-center group">
                                    <div><div className="font-bold text-white text-sm">{d.name}</div><div className="text-xs text-gray-500">{d.interestRate}% • Min: {d.minimumPayment}$</div></div>
                                    <div className="text-right"><div className="font-mono text-red-400 font-bold">{d.balance.toLocaleString()} $</div><button onClick={() => handleDelete(d.id)} className="text-tiny text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">Supprimer</button></div>
                                </div>
                            ))}
                            {debts.length === 0 && (
                                <EmptyState
                                    variant="subtle"
                                    icon="🎉"
                                    title="Aucune dette"
                                    description="Bravo ! Votre santé financière est au beau fixe."
                                />
                            )}
                        </div>
                    </Card>
                    <Card title="Stratégie de Remboursement">
                        <div className="space-y-4">
                            <div>
                                <label className="flex justify-between text-xs text-gray-300 mb-1"><span>Paiement Mensuel Supplémentaire</span><span className="font-bold text-green-400">{extraPayment}$</span></label>
                                <input type="range" min="0" max="2000" step="50" value={extraPayment} onChange={e => setExtraPayment(Number(e.target.value))} className="w-full h-2 bg-dark rounded-lg appearance-none cursor-pointer accent-green-500" />
                                <div className="text-tiny text-gray-500 mt-1">En plus des minimums ({totalMinPayment}$). Total payé: <strong className="text-white">{(totalMinPayment + extraPayment).toLocaleString()}$/mois</strong>.</div>
                            </div>
                            <div className="p-3 bg-white/5 rounded border border-white/10">
                                <div className="flex justify-between items-center mb-1"><span className="text-xs text-gray-400">Liberté dans</span><span className="text-sm font-bold text-white">{(simulation.months / 12).toFixed(1)} ans</span></div>
                                <div className="flex justify-between items-center"><span className="text-xs text-gray-400">Intérêts évités</span><span className="text-sm font-bold text-green-400">Calculé vs Min.</span></div>
                            </div>
                        </div>
                    </Card>
                </div>
                <div className="lg:col-span-2">
                    <Card title="Projection d'Extinction de la Dette">
                        <div style={{ width: '100%', height: '350px', minHeight: '350px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={simulation.chart} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <defs><linearGradient id="colorDebt" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient></defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                    <XAxis dataKey="month" stroke="#666" tick={{fontSize: 10}} tickFormatter={(m) => `M${m}`} />
                                    <YAxis stroke="#666" tick={{fontSize: 10}} width={40} tickFormatter={(val) => `${(val/1000).toFixed(0)}k`} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333' }} formatter={(val: number) => val.toLocaleString() + ' $'} />
                                    <Area type="monotone" dataKey="balance" stroke="#ef4444" fill="url(#colorDebt)" name="Solde Restant" strokeWidth={3} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                    <div className="mt-6 p-4 bg-blue-900/10 border border-blue-500/20 rounded-xl flex gap-4 items-start">
                        <span className="text-2xl">ℹ️</span>
                        <div>
                            <h4 className="font-bold text-blue-300 text-sm">Impact sur le Futur</h4>
                            <p className="text-xs text-gray-300 mt-1">Ces dettes sont automatiquement prises en compte dans l'onglet <strong>Futur</strong>. Le simulateur déduit les paiements mensuels ({totalMinPayment + extraPayment}$) de vos liquidités jusqu'à ce que chaque dette soit remboursée.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
