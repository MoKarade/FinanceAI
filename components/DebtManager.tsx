import React, { useState, useMemo } from 'react';
import { Card } from './ui/Card';
import { PrivateAmount } from './ui/PrivateAmount';
import { PrivateSliderValue } from './ui/PrivateSliderValue';
import { EmptyState } from './ui/EmptyState';
import { PageHeader } from './ui/PageHeader';
import { Icon } from './ui/Icon';
import { Badge } from './ui/Badge';
import { Debt } from '../types';
import { computeTotalDebt } from '../services/portfolio';
import { ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';
import { ConfirmModal } from './ui/ConfirmModal';
import { useTimeChartZoom } from '../hooks/useTimeChartZoom';
import { ZoomContainer } from './ui/ZoomContainer';
import { ChartDataTable, type ChartDataColumn } from './ui/ChartDataTable';
import { MASKED_AMOUNT_LABEL, maskedSliderAria } from '../utils/privacyAria';
import { useFinanceStore } from '../store/useFinanceStore';
import { formatCAD } from '../utils/format';

interface DebtManagerProps {
    debts: Debt[];
    setDebts: (d: Debt[]) => void;
}

export const DebtManager: React.FC<DebtManagerProps> = ({ debts, setDebts }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newDebt, setNewDebt] = useState<Partial<Debt>>({ name: '', balance: 0, interestRate: 0, minimumPayment: 0, category: 'CreditCard' });
    const [extraPayment, setExtraPayment] = useState(200);
    // [D6-PRIV-MONTANTS] focus du slider → étiquette révélée pendant l'ajustement seulement.
    const [extraSliderFocus, setExtraSliderFocus] = useState(false);
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

    // [DEBT-SUM-DUP, audit 2026-07-16] Source unique (garde isFinite incluse) au lieu du reduce local.
    const totalDebt = computeTotalDebt(debts);
    const totalMinPayment = debts.reduce((sum, d) => sum + d.minimumPayment, 0);

    // G7a — zoom molette / pan sur la courbe d'extinction (x = mois).
    const zoom = useTimeChartZoom(simulation.chart);

    // [A11Y-CHARTS] — mode discret : masque les montants de la table de données sr-only.
    // [A11Y-PRIVACY-DEBT] Le mode discret ne couvrait que la table sr-only et le slider : le total dû
    // (badge d'en-tête), chaque solde/minimum de la liste, le rappel « paiements mensuels » et
    // l'infobulle de la courbe restaient LISIBLES. Tout passe désormais par la primitive PrivateAmount
    // (la valeur SORT du DOM — jamais un flou CSS qui la laisse au lecteur d'écran).
    const isPrivacyMode = useFinanceStore(s => s.isPrivacyMode);
    // [A11Y-CHARTS] — colonnes de la table sr-only (alternative texte à l'AreaChart d'extinction,
    // opaque aux lecteurs d'écran). Mois (axe X) + solde restant + intérêts cumulés. Mode privé
    // masque les MONTANTS (pas le numéro de mois).
    const debtColumns = useMemo<ChartDataColumn[]>(() => {
        const money = (v: unknown) => isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(Number(v) || 0);
        return [
            { key: 'month', label: 'Mois', format: (v) => `Mois ${v ?? 0}` },
            { key: 'balance', label: 'Solde restant', format: money },
            { key: 'interestAccumulated', label: 'Intérêts cumulés', format: money },
        ];
    }, [isPrivacyMode]);

    return (
        <div className="space-y-6 stagger-in pb-20">
            <ConfirmModal isOpen={!!confirmDeleteId} onConfirm={doConfirmDelete} onCancel={() => setConfirmDeleteId(null)} title="Supprimer la dette" message="Supprimer cette dette définitivement ?" confirmLabel="Supprimer" />
            {/* [REFONTE-NAV-L3] Titre aligné sur TAB_LABELS (« Dettes ») — la page et la nav
                doivent dire la même chose (passe de cohérence Config). */}
            <PageHeader
                icon={<Icon name="debt" size={28} />}
                title="Dettes"
                badge={<Badge variant={totalDebt > 0 ? 'danger' : 'success'} size="md">Total Dû: <PrivateAmount>{formatCAD(totalDebt)}</PrivateAmount></Badge>}
            />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                    <Card title="Vos Dettes" action={<button onClick={() => setIsAdding(!isAdding)} className="text-meta bg-white/10 px-2 py-1 rounded hover:bg-white/20">+ Ajouter</button>}>
                        {isAdding && (
                            <div className="mb-4 p-3 bg-white/5 rounded border border-white/10 space-y-2">
                                <input aria-label="Nom de la dette" type="text" placeholder="Nom (ex: Visa)" className="w-full bg-dark border border-white/10 rounded px-2 py-1 text-meta text-white" value={newDebt.name} onChange={e => setNewDebt({...newDebt, name: e.target.value})} />
                                <div className="grid grid-cols-2 gap-2">
                                    <input aria-label="Solde de la dette (dollars)" type="number" placeholder="Solde $" className="bg-dark border border-white/10 rounded px-2 py-1 text-meta text-white" value={newDebt.balance || ''} onChange={e => setNewDebt({...newDebt, balance: parseFloat(e.target.value)})} />
                                    <input aria-label="Taux d'intérêt (pourcentage)" type="number" placeholder="Taux %" className="bg-dark border border-white/10 rounded px-2 py-1 text-meta text-white" value={newDebt.interestRate || ''} onChange={e => setNewDebt({...newDebt, interestRate: parseFloat(e.target.value)})} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <input aria-label="Paiement minimum mensuel (dollars)" type="number" placeholder="Min. Payment $" className="bg-dark border border-white/10 rounded px-2 py-1 text-meta text-white" value={newDebt.minimumPayment || ''} onChange={e => setNewDebt({...newDebt, minimumPayment: parseFloat(e.target.value)})} />
                                    <select aria-label="Catégorie de la dette" className="bg-dark border border-white/10 rounded px-2 py-1 text-meta text-white" value={newDebt.category} onChange={e => setNewDebt({...newDebt, category: e.target.value as Debt['category']})}><option value="CreditCard">Carte Crédit</option><option value="Car">Auto</option><option value="Student">Étudiant</option><option value="Personal">Personnel</option></select>
                                </div>
                                <button onClick={handleAdd} className="w-full bg-danger-600 hover:bg-danger-500 text-white text-meta font-bold py-2 rounded">Enregistrer</button>
                            </div>
                        )}
                        <div className="space-y-3">
                            {debts.map(d => (
                                <div key={d.id} className="p-3 bg-[#1a1a1a] rounded-xl border border-white/5 flex justify-between items-center group">
                                    <div><div className="font-bold text-white text-body">{d.name}</div><div className="text-meta text-ink-400">{d.interestRate}% • Min: <PrivateAmount>{formatCAD(d.minimumPayment)}</PrivateAmount></div></div>
                                    <div className="text-right"><PrivateAmount as="div" className="font-mono text-danger-400 font-bold">{formatCAD(d.balance)}</PrivateAmount><button onClick={() => handleDelete(d.id)} className="text-tiny text-ink-400 hover:text-danger-500 opacity-0 group-hover:opacity-100 focus:opacity-100 focus-ring transition-opacity">Supprimer</button></div>
                                </div>
                            ))}
                            {debts.length === 0 && (
                                <EmptyState
                                    variant="subtle"
                                    icon={<Icon name="celebrate" size={30} />}
                                    title="Aucune dette"
                                    description="Bravo ! Votre santé financière est au beau fixe."
                                />
                            )}
                        </div>
                    </Card>
                    <Card title="Remboursement">
                        <div className="space-y-4">
                            <div>
                                <label className="flex justify-between text-meta text-ink-200 mb-1"><span>Paiement Mensuel Supplémentaire</span><PrivateSliderValue revealed={extraSliderFocus} className="font-bold text-green-400">{formatCAD(extraPayment)}</PrivateSliderValue></label>
                                <input type="range" aria-label="Paiement Mensuel Supplémentaire" min="0" max="2000" step="50" value={extraPayment} {...maskedSliderAria(isPrivacyMode && !extraSliderFocus)} onChange={e => setExtraPayment(Number(e.target.value))} onFocus={() => setExtraSliderFocus(true)} onBlur={() => setExtraSliderFocus(false)} className="w-full h-2 bg-dark rounded-lg appearance-none cursor-pointer accent-green-500" />
                                <div className="text-tiny text-ink-400 mt-1">En plus des minimums (<PrivateAmount>{formatCAD(totalMinPayment)}</PrivateAmount>). Total payé: <strong className="text-white"><PrivateAmount>{formatCAD(totalMinPayment + extraPayment)}</PrivateAmount>/mois</strong>.</div>
                            </div>
                            <div className="p-3 bg-white/5 rounded border border-white/10">
                                <div className="flex justify-between items-center mb-1"><span className="text-meta text-ink-300">Liberté dans</span><span className="text-body font-bold text-white">{(simulation.months / 12).toFixed(1)} ans</span></div>
                                <div className="flex justify-between items-center"><span className="text-meta text-ink-300">Intérêts évités</span><span className="text-body font-bold text-green-400">Calculé vs Min.</span></div>
                            </div>
                        </div>
                    </Card>
                </div>
                <div className="lg:col-span-2">
                    <Card title="Extinction de la dette">
                        <div
                            role="img"
                            aria-label="Courbe d'extinction de la dette — solde total restant, mois par mois, jusqu'au remboursement complet selon le paiement supplémentaire choisi."
                        >
                        <ZoomContainer zoom={zoom} style={{ width: '100%', height: '350px', minHeight: '350px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={zoom.visibleData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <defs><linearGradient id="colorDebt" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient></defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                    <XAxis dataKey="month" stroke="#666" tick={{fontSize: 10}} tickFormatter={(m) => `M${m}`} />
                                    <YAxis stroke="#666" tick={{fontSize: 10}} width={40} tickFormatter={(val) => `${(val/1000).toFixed(0)}k`} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333' }} formatter={(val: number) => (isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(val))} />
                                    <Area type="monotone" dataKey="balance" stroke="#ef4444" fill="url(#colorDebt)" name="Solde Restant" strokeWidth={3} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </ZoomContainer>
                        </div>
                        {/* [A11Y-CHARTS] — alternative TEXTUELLE (sr-only) à la courbe d'extinction :
                            mêmes données (solde + intérêts cumulés par mois) en table accessible. */}
                        <ChartDataTable
                            caption="Solde de dette restant et intérêts cumulés par mois"
                            columns={debtColumns}
                            rows={simulation.chart}
                        />
                    </Card>
                    <div className="mt-6 p-4 bg-blue-900/10 border border-info-500/20 rounded-xl flex gap-4 items-start">
                        <span className="text-2xl">ℹ️</span>
                        <div>
                            <h4 className="font-bold text-blue-300 text-body">Impact sur le Futur</h4>
                            <p className="text-meta text-ink-200 mt-1">Ces dettes sont automatiquement prises en compte dans l'onglet <strong>Futur</strong>. Le simulateur déduit les paiements mensuels (<PrivateAmount>{formatCAD(totalMinPayment + extraPayment)}</PrivateAmount>) de vos liquidités jusqu'à ce que chaque dette soit remboursée.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
