import React, { useState, useMemo, useEffect } from 'react';
import { Card } from './ui/Card';
import { PageHeader } from './ui/PageHeader';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, ReferenceLine } from 'recharts';
import { ChildGoal, ProjectionConfig, Tab as TabEnum } from '../types';
import { INITIAL_CHILD_GOAL } from '../constants';
import { ConfirmModal } from './ui/ConfirmModal';
import { useFinanceStore } from '../store/useFinanceStore';

interface ChildPlanningProps {
    goals: ChildGoal[];
    setGoals: (goals: ChildGoal[]) => void;
    projection: ProjectionConfig;
    currentRESP?: number;
}

// ============================
// CHOIX DE VIE — Impacts chiffrés
// ============================
type DaycareType = 'cpe' | 'garde_privee' | 'parent_foyer';
type SchoolType = 'publique' | 'privee' | 'internationale';
type ActivitiesLevel = 'aucune' | 'legeres' | 'intensives';
type UniversityType = 'aucune' | 'cegep' | 'dep' | 'uni_local' | 'uni_appart' | 'uni_etranger';
type CarGift = 'non' | 'usagee' | 'neuve';

const DAYCARE_INFO: Record<DaycareType, { label: string; monthly: number; icon: string; desc: string }> = {
    cpe: { label: 'CPE Subventionné', monthly: 215, icon: '🏗️', desc: '~$11.25/jour (2025, indexé)' },
    garde_privee: { label: 'Garderie Privée', monthly: 1400, icon: '🏠', desc: '~$70/jour, service de garde privé non subventionné' },
    parent_foyer: { label: 'Parent au Foyer', monthly: 0, icon: '🤱', desc: 'Pas de frais de garde, mais perte de salaire (~1 700$/mois net)' },
};

const SCHOOL_INFO: Record<SchoolType, { label: string; yearlyExtra: number; icon: string }> = {
    publique: { label: 'École Publique', yearlyExtra: 500, icon: '📚' },
    privee: { label: 'École Privée', yearlyExtra: 6000, icon: '🎓' },
    internationale: { label: 'Internationale', yearlyExtra: 10000, icon: '🌍' },
};

const ACTIVITIES_INFO: Record<ActivitiesLevel, { label: string; yearlyExtra: number; icon: string }> = {
    aucune: { label: 'Aucune activité', yearlyExtra: 0, icon: '🏠' },
    legeres: { label: 'Légères (1 sport/art)', yearlyExtra: 1500, icon: '⚽' },
    intensives: { label: 'Intensives (2-3 disciplines)', yearlyExtra: 4500, icon: '🏆' },
};

const UNI_INFO: Record<UniversityType, { label: string; yearlyCost: number; icon: string; years: number }> = {
    aucune: { label: 'Pas d\'études post-sec.', yearlyCost: 0, icon: '🔧', years: 0 },
    dep: { label: 'DEP (Formation prof.)', yearlyCost: 2000, icon: '🛠️', years: 2 },
    cegep: { label: 'Cégep seulement', yearlyCost: 1000, icon: '📘', years: 2 },
    uni_local: { label: 'Université chez parents', yearlyCost: 5000, icon: '🎓', years: 4 },
    uni_appart: { label: 'Université + Appart', yearlyCost: 20000, icon: '🏙️', years: 4 },
    uni_etranger: { label: 'Univ. Hors Québec/Canada', yearlyCost: 35000, icon: '✈️', years: 4 },
};

const CAR_INFO: Record<CarGift, { label: string; cost: number; icon: string }> = {
    non: { label: 'Pas de voiture', cost: 0, icon: '🚶' },
    usagee: { label: 'Voiture usagée (~10 000$)', cost: 10000, icon: '🚗' },
    neuve: { label: 'Voiture neuve (~25 000$)', cost: 25000, icon: '🚙' },
};

const fmt = (n: number) => n.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

export const ChildPlanning: React.FC<ChildPlanningProps> = ({ goals = [], setGoals, projection, currentRESP = 0 }) => {
    const [activeTabIndex, setActiveTabIndex] = useState(0);
    const [confirmRemove, setConfirmRemove] = useState<{ index: number; name: string } | null>(null);
    const goal = goals[activeTabIndex] || goals[0];

    // Wiring 2026-05: lecture de la projection vivante pour montrer le REEE
    // projeté par le moteur principal (FutureProjection), à comparer avec
    // la simulation locale ci-dessous.
    const lastProjection = useFinanceStore(s => s.lastProjection);
    const navigateWithFocus = useFinanceStore(s => s.navigateWithFocus);
    const projectedReeeAt18 = useMemo(() => {
        if (!lastProjection?.chartData?.length || !goal?.birthDate) return null;
        const childBirthYear = new Date(goal.birthDate).getFullYear();
        const targetYear = childBirthYear + 17;
        const point = lastProjection.chartData.find(p => p.year === targetYear);
        return point?.REEE ?? null;
    }, [lastProjection, goal?.birthDate]);

    const [daycareType, setDaycareTypeLocal] = useState<DaycareType>((goal?.daycareType as DaycareType) || 'cpe');
    const [schoolType, setSchoolTypeLocal] = useState<SchoolType>((goal?.schoolType as SchoolType) || 'publique');
    const [activitiesLevel, setActivitiesLevelLocal] = useState<ActivitiesLevel>((goal?.activitiesLevel as ActivitiesLevel) || 'legeres');
    const [universityType, setUniversityTypeLocal] = useState<UniversityType>((goal?.universityType as UniversityType) || 'uni_local');
    const [carGift, setCarGiftLocal] = useState<CarGift>((goal?.carGift as CarGift) || 'non');
    const [respContribution, setRespContributionLocal] = useState(goal?.respContribution ?? 2500);
    const [parentAtHome, setParentAtHome] = useState(false);

    if (!goal) return null; // Hydration guard

    const update = (field: keyof ChildGoal, value: any) => {
        if (!goals.length) return;
        const newGoals = [...goals];
        newGoals[activeTabIndex] = { ...newGoals[activeTabIndex], [field]: value };
        setGoals(newGoals);
    };

    // Persisting setters: update local state + persist to store in one call
    const setDaycareType = (v: DaycareType) => { setDaycareTypeLocal(v); update('daycareType', v); };
    const setSchoolType = (v: SchoolType) => { setSchoolTypeLocal(v); update('schoolType', v); };
    const setActivitiesLevel = (v: ActivitiesLevel) => { setActivitiesLevelLocal(v); update('activitiesLevel', v); };
    const setUniversityType = (v: UniversityType) => { setUniversityTypeLocal(v); update('universityType', v); };
    const setCarGift = (v: CarGift) => { setCarGiftLocal(v); update('carGift', v); };
    const setRespContribution = (v: number) => { setRespContributionLocal(v); update('respContribution', v); };

    const handleAddChild = () => {
        const newId = 'child_' + Date.now();
        const newGoals = [...goals, { ...INITIAL_CHILD_GOAL, id: newId, name: `Enfant ${goals.length + 1}` }];
        setGoals(newGoals);
        setActiveTabIndex(newGoals.length - 1);
    };

    const handleRemoveChild = () => {
        if (goals.length <= 1) return;
        setConfirmRemove({ index: activeTabIndex, name: goal.name || 'cet enfant' });
    };

    const doRemoveChild = () => {
        if (!confirmRemove) return;
        const newGoals = goals.filter((_, i) => i !== confirmRemove.index);
        setGoals(newGoals);
        setActiveTabIndex(Math.max(0, confirmRemove.index - 1));
        setConfirmRemove(null);
    };

    // Sync local choix-de-vie when switching children
    useEffect(() => {
        if (!goal) return;
        setDaycareTypeLocal((goal.daycareType as DaycareType) || 'cpe');
        setSchoolTypeLocal((goal.schoolType as SchoolType) || 'publique');
        setActivitiesLevelLocal((goal.activitiesLevel as ActivitiesLevel) || 'legeres');
        setUniversityTypeLocal((goal.universityType as UniversityType) || 'uni_local');
        setCarGiftLocal((goal.carGift as CarGift) || 'non');
        setRespContributionLocal(goal.respContribution ?? 2500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [goal?.id]);

    // Impact du parent au foyer : pas de coût garderie mais perte de salaire
    useEffect(() => {
        if (daycareType === 'parent_foyer') {
            setParentAtHome(true);
        } else {
            setParentAtHome(false);
        }
    }, [daycareType]);

    const daycareMonthly = DAYCARE_INFO[daycareType].monthly;
    const schoolYearly = SCHOOL_INFO[schoolType].yearlyExtra;
    const activitiesYearly = ACTIVITIES_INFO[activitiesLevel].yearlyExtra;
    const uniInfo = UNI_INFO[universityType];
    const carCost = CAR_INFO[carGift].cost;
    const parentSalaryLoss = parentAtHome ? 1700 : 0;

    const costTimeline = useMemo(() => {
        const data = [];
        let totalCost = 0;
        const inflation = (projection.inflationRate || 2) / 100;
        const govBenefits = goal.governmentBenefits || 450;

        for (let age = 0; age <= 25; age++) {
            const inf = Math.pow(1 + inflation, age);
            let base = 0;
            let garde = 0;
            let extra = 0;
            let benefices = govBenefits;

            if (age === 0) {
                extra += (goal.initialCost || 2800) + (parentalLeaveMonthsCost(goal));
                base = (goal.monthlyDiapers + goal.monthlyFood + goal.monthlyClothing) * 12;
                garde = daycareMonthly * 12;
                if (parentAtHome) garde = 0;
            } else if (age >= 1 && age <= 4) {
                base = (goal.monthlyDiapers * 0.5 + goal.monthlyFood + goal.monthlyClothing + 50) * 12;
                garde = (parentAtHome ? 0 : daycareMonthly) * 12;
            } else if (age >= 5 && age <= 11) {
                base = (goal.monthlyFood + goal.monthlyClothing + 80) * 12;
                garde = (schoolYearly + activitiesYearly) / 1;
            } else if (age >= 12 && age <= 17) {
                base = (goal.monthlyFood * 1.2 + goal.monthlyClothing * 1.5 + 150) * 12;
                garde = (schoolYearly + activitiesYearly);
                if (age === 16) extra += 500;
                benefices = Math.max(0, govBenefits - 100);
            } else if (age === 18) {
                base = 0;
                garde = 0;
                extra += carCost;
                benefices = 0;
            } else if (age >= 18 && age < 18 + uniInfo.years) {
                base = uniInfo.yearlyCost;
                garde = 0;
                benefices = 0;
            } else {
                base = 0;
                garde = 0;
                benefices = 0;
            }

            const annualCost = Math.round(((base + garde + extra) * inf) - benefices);
            totalCost += Math.max(0, annualCost);

            data.push({
                age,
                Essentiel: Math.max(0, Math.round(base * inf)),
                Garde_École_Activités: Math.max(0, Math.round(garde * inf)),
                Ponctuel: Math.round(extra * inf),
                Bénéfices: -Math.round(benefices),
                Total: Math.max(0, annualCost),
            });
        }
        return { data, totalCost };
    }, [goal, daycareType, schoolType, activitiesLevel, universityType, carGift, parentAtHome, projection]);

    const respProjection = useMemo(() => {
        const data = [];
        let balance = currentRESP;
        const grantRate = 0.30;
        const maxGrantLifetime = 10800;
        let totalGrants = 0;
        const r = (projection.returnRates?.celi || 7) / 100;

        for (let age = 0; age <= 17; age++) {
            const contribution = respContribution;
            let grant = Math.min(contribution * grantRate, maxGrantLifetime - totalGrants);
            totalGrants += grant;
            const growth = balance * r;
            balance = balance + contribution + grant + growth;
            data.push({
                age,
                Solde: Math.round(balance),
                Contribution: Math.round(contribution),
                Subvention: Math.round(grant),
                Intérêts: Math.round(growth),
            });
        }
        return data;
    }, [respContribution, projection, currentRESP]);

    const totalResp = respProjection[respProjection.length - 1]?.Solde || 0;
    const totalStudiesCost = uniInfo.yearlyCost * uniInfo.years;
    const respCovers = totalStudiesCost > 0 ? Math.min(100, (totalResp / totalStudiesCost) * 100) : 100;

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <ConfirmModal
                isOpen={!!confirmRemove}
                onConfirm={doRemoveChild}
                onCancel={() => setConfirmRemove(null)}
                title="Supprimer le profil"
                message={`Supprimer "${confirmRemove?.name}" définitivement ?`}
                confirmLabel="Supprimer"
            />
            <PageHeader
                icon="👶"
                title="Planification Enfant"
                subtitle="Configurez les choix de vie et visualisez l'impact financier complet jusqu'à 25 ans."
                badge={<Badge variant="info" size="md">Coût total: {fmt(costTimeline.totalCost)}</Badge>}
                actions={
                    <>
                        <Button
                            onClick={() => update('isActive', !goal.isActive)}
                            variant={goal.isActive ? 'danger' : 'primary'}
                            size="md"
                        >
                            {goal.isActive ? '❌ Désactiver (Futur)' : '✅ Activer dans Futur'}
                        </Button>
                        {goals.length > 1 && (
                            <Button onClick={handleRemoveChild} variant="ghost" size="md" title="Supprimer ce profil">🗑️</Button>
                        )}
                    </>
                }
            />
            <div className="hidden">{/* spacing preserve */}
            </div>

            {/* TABS ENFANTS */}
            <div className="flex flex-wrap gap-2 pt-2 border-b border-white/10 pb-4">
                {goals.map((g, idx) => (
                    <button
                        key={g.id || idx}
                        onClick={() => setActiveTabIndex(idx)}
                        className={`px-5 py-2 rounded-xl font-bold text-sm transition-all focus:outline-none ${activeTabIndex === idx ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-transparent'}`}
                    >
                        {g.name || `Enfant ${idx + 1}`}
                    </button>
                ))}
                <button
                    onClick={handleAddChild}
                    className="px-4 py-2 rounded-xl font-bold text-sm bg-green-900/20 text-green-400 border border-green-500/30 hover:bg-green-900/40 transition-all focus:outline-none flex items-center gap-1"
                >
                    <span className="text-lg leading-none">+</span> Ajouter
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* CONFIGURATEUR */}
                <div className="space-y-5">
                    <Card title="📅 Profil & Date Prévue">
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Prénom ou Identifiant</label>
                                <input type="text" value={goal.name || ''} onChange={e => update('name', e.target.value)} placeholder="Ex: Léo" className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-white outline-none focus:border-primary" />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Date de naissance (ou prévue)</label>
                                <input type="date" value={goal.birthDate} onChange={e => update('birthDate', e.target.value)} className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-white focus:border-primary outline-none" />
                            </div>
                        </div>
                        <p className="text-tiny text-gray-500 mt-2">Cette date sera utilisée dans la simulation de l'onglet Futur.</p>
                    </Card>

                    <Card title="🎯 Choix de Vie">
                        <div className="space-y-5">
                            <div>
                                <div className="text-xs font-bold text-pink-400 uppercase mb-2">Mode de garde (0–5 ans)</div>
                                <div className="space-y-1.5">
                                    {(Object.entries(DAYCARE_INFO) as [DaycareType, typeof DAYCARE_INFO[DaycareType]][]).map(([key, info]) => (
                                        <button key={key} onClick={() => setDaycareType(key)}
                                            className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${daycareType === key ? 'border-primary bg-primary/10 text-white' : 'border-white/5 bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                                            <span className="text-xl">{info.icon}</span>
                                            <div className="flex-1">
                                                <div className="text-xs font-bold">{info.label}</div>
                                                <div className="text-tiny text-gray-500">{info.desc}</div>
                                            </div>
                                            <div className="text-xs font-mono font-bold text-right">{info.monthly > 0 ? `${info.monthly}$/m` : 'Gratuit'}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-bold text-blue-400 uppercase mb-2">Type d'école (6–17 ans)</div>
                                <div className="space-y-1.5">
                                    {(Object.entries(SCHOOL_INFO) as [SchoolType, typeof SCHOOL_INFO[SchoolType]][]).map(([key, info]) => (
                                        <button key={key} onClick={() => setSchoolType(key)}
                                            className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${schoolType === key ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-white/5 bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                                            <span className="text-xl">{info.icon}</span>
                                            <div className="flex-1 text-xs font-bold">{info.label}</div>
                                            <div className="text-xs font-mono font-bold text-right text-blue-300">+{(info.yearlyExtra / 1000).toFixed(0)}k$/an</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-bold text-yellow-400 uppercase mb-2">Sports & activités</div>
                                <div className="space-y-1.5">
                                    {(Object.entries(ACTIVITIES_INFO) as [ActivitiesLevel, typeof ACTIVITIES_INFO[ActivitiesLevel]][]).map(([key, info]) => (
                                        <button key={key} onClick={() => setActivitiesLevel(key)}
                                            className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${activitiesLevel === key ? 'border-yellow-500 bg-yellow-500/10 text-white' : 'border-white/5 bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                                            <span className="text-xl">{info.icon}</span>
                                            <div className="flex-1 text-xs font-bold">{info.label}</div>
                                            <div className="text-xs font-mono font-bold text-right text-yellow-300">{info.yearlyExtra > 0 ? `+${info.yearlyExtra}$/an` : 'Rien'}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-bold text-purple-400 uppercase mb-2">Études post-secondaires (18–25 ans)</div>
                                <div className="space-y-1.5">
                                    {(Object.entries(UNI_INFO) as [UniversityType, typeof UNI_INFO[UniversityType]][]).map(([key, info]) => (
                                        <button key={key} onClick={() => setUniversityType(key)}
                                            className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${universityType === key ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-white/5 bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                                            <span className="text-xl">{info.icon}</span>
                                            <div className="flex-1">
                                                <div className="text-xs font-bold">{info.label}</div>
                                                {info.years > 0 && <div className="text-tiny text-gray-500">{info.years} ans</div>}
                                            </div>
                                            <div className="text-xs font-mono font-bold text-right text-purple-300">{info.yearlyCost > 0 ? `${(info.yearlyCost / 1000).toFixed(0)}k$/an` : 'Gratuit'}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-bold text-orange-400 uppercase mb-2">Voiture à 18 ans (cadeau)</div>
                                <div className="flex gap-2">
                                    {(Object.entries(CAR_INFO) as [CarGift, typeof CAR_INFO[CarGift]][]).map(([key, info]) => (
                                        <button key={key} onClick={() => setCarGift(key)}
                                            className={`flex-1 flex flex-col items-center p-2.5 rounded-lg border text-center transition-all ${carGift === key ? 'border-orange-500 bg-orange-500/10 text-white' : 'border-white/5 bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                                            <span className="text-xl mb-1">{info.icon}</span>
                                            <div className="text-tiny font-bold leading-tight">{info.label.split(' (')[0]}</div>
                                            {info.cost > 0 && <div className="text-tiny font-mono text-orange-300 mt-0.5">{(info.cost / 1000).toFixed(0)}k$</div>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card title="💰 Allocations & Coûts de base">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="text-xs text-gray-300">Allocations (ACE + Soutien QC)</label>
                                <input type="number" value={goal.governmentBenefits} onChange={e => update('governmentBenefits', Number(e.target.value))} className="w-20 bg-white/5 border border-border rounded px-2 py-1 text-right text-sm text-green-400 font-bold" />
                            </div>
                            <div className="flex justify-between items-center">
                                <label className="text-xs text-gray-300">Nourriture / mois</label>
                                <input type="number" value={goal.monthlyFood} onChange={e => update('monthlyFood', Number(e.target.value))} className="w-20 bg-white/5 border border-border rounded px-2 py-1 text-right text-sm text-white" />
                            </div>
                            <div className="flex justify-between items-center">
                                <label className="text-xs text-gray-300">Vêtements / mois</label>
                                <input type="number" value={goal.monthlyClothing} onChange={e => update('monthlyClothing', Number(e.target.value))} className="w-20 bg-white/5 border border-border rounded px-2 py-1 text-right text-sm text-white" />
                            </div>
                            <div className="flex justify-between items-center">
                                <label className="text-xs text-gray-300">Coûts naissance (chambre, siège, etc.)</label>
                                <input type="number" value={goal.initialCost} onChange={e => update('initialCost', Number(e.target.value))} className="w-20 bg-white/5 border border-border rounded px-2 py-1 text-right text-sm text-white" />
                            </div>
                        </div>
                    </Card>
                </div>

                {/* GRAPHIQUES */}
                <div className="lg:col-span-2 space-y-5">
                    <Card title="📊 Coût annuel par âge (décomposé)" action={
                        <div className="text-xs text-gray-400 font-mono">Total : <span className="text-white font-bold privacy-blur">{fmt(costTimeline.totalCost)}</span></div>
                    }>
                        <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={costTimeline.data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                    <XAxis dataKey="age" stroke="#666" tick={{ fontSize: 10 }} label={{ value: 'Âge enfant', position: 'insideBottom', offset: -5, fill: '#666' }} />
                                    <YAxis stroke="#666" tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                                    <Tooltip contentStyle={{ backgroundColor: '#151922', borderColor: '#333', borderRadius: 8 }} formatter={(v: number, name: string) => [fmt(Math.abs(v)), name === 'Bénéfices' ? '↩ Allocations' : name]} labelFormatter={l => `Âge ${l} ans`} />
                                    <Legend />
                                    <ReferenceLine y={0} stroke="#555" />
                                    <Bar dataKey="Essentiel" stackId="a" fill="#6366f1" name="Essentiel" />
                                    <Bar dataKey="Garde_École_Activités" stackId="a" fill="#ec4899" name="Garde / École / Activités" />
                                    <Bar dataKey="Ponctuel" stackId="a" fill="#f59e0b" name="Ponctuel (naissance, voiture…)" />
                                    <Bar dataKey="Bénéfices" stackId="a" fill="#10b981" name="Allocations (négatif = bénéfice)" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    <Card title="🎓 Simulateur REEE — Croissance jusqu'à 17 ans" action={
                        <div className="flex items-center gap-2">
                            {projectedReeeAt18 !== null && projectedReeeAt18 > 0 && (
                                <Badge
                                    variant="info"
                                    size="sm"
                                    onClick={() => navigateWithFocus(TabEnum.FUTURE)}
                                    title="Projection officielle (FutureProjection) au 17e anniversaire — clic pour ouvrir"
                                >
                                    🔗 {fmt(projectedReeeAt18)}
                                </Badge>
                            )}
                            <div className={`text-xs font-bold px-2 py-1 rounded border ${respCovers >= 100 ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'}`}>
                                {respCovers.toFixed(0)}% des études couvertes
                            </div>
                        </div>
                    }>
                        <div className="space-y-3 mb-4">
                            <div>
                                <label className="flex justify-between text-xs text-gray-300 mb-1">
                                    <span>Cotisation annuelle REEE</span>
                                    <span className="text-blue-400 font-bold">{fmt(respContribution)}</span>
                                </label>
                                <input type="range" min="0" max="5000" step="100" value={respContribution} onChange={e => setRespContribution(Number(e.target.value))} className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                                <p className="text-tiny text-gray-500 mt-1">Optimal : 2 500$/an pour maximiser les subventions (30% = fed 20% + QC 10%)</p>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-500/20 text-center">
                                    <div className="text-tiny text-gray-500 uppercase mb-1">Capital à 17 ans</div>
                                    <div className="text-lg font-black text-white privacy-blur">{fmt(totalResp)}</div>
                                </div>
                                <div className="bg-green-900/20 p-3 rounded-lg border border-green-500/20 text-center">
                                    <div className="text-tiny text-gray-500 uppercase mb-1">Coût études prévu</div>
                                    <div className="text-lg font-black text-white privacy-blur">{fmt(totalStudiesCost)}</div>
                                </div>
                                <div className="bg-purple-900/20 p-3 rounded-lg border border-purple-500/20 text-center">
                                    <div className="text-tiny text-gray-500 uppercase mb-1">Couverture</div>
                                    <div className={`text-lg font-black ${respCovers >= 100 ? 'text-green-400' : 'text-yellow-400'}`}>{respCovers.toFixed(0)}%</div>
                                </div>
                            </div>
                        </div>
                        <div className="h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={respProjection} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="respGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                    <XAxis dataKey="age" stroke="#666" tick={{ fontSize: 10 }} />
                                    <YAxis stroke="#666" tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                                    <Tooltip contentStyle={{ backgroundColor: '#151922', borderColor: '#333', borderRadius: 8 }} formatter={(v: number) => fmt(v)} labelFormatter={l => `Âge ${l} ans`} />
                                    <Legend />
                                    <Area type="monotone" dataKey="Solde" stroke="#3b82f6" fill="url(#respGrad)" strokeWidth={2} name="Solde Total" />
                                    <Bar dataKey="Subvention" fill="#10b981" name="Subventions reçues" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                            <div className="text-2xl mb-1">{DAYCARE_INFO[daycareType].icon}</div>
                            <div className="text-tiny text-gray-400">Garde mensuelle</div>
                            <div className="text-sm font-bold text-white">{fmt(DAYCARE_INFO[daycareType].monthly)}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                            <div className="text-2xl mb-1">{SCHOOL_INFO[schoolType].icon}</div>
                            <div className="text-tiny text-gray-400">Frais scolaires/an</div>
                            <div className="text-sm font-bold text-white">{fmt(SCHOOL_INFO[schoolType].yearlyExtra)}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                            <div className="text-2xl mb-1">{ACTIVITIES_INFO[activitiesLevel].icon}</div>
                            <div className="text-tiny text-gray-400">Activités/an</div>
                            <div className="text-sm font-bold text-white">{fmt(ACTIVITIES_INFO[activitiesLevel].yearlyExtra)}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                            <div className="text-2xl mb-1">{UNI_INFO[universityType].icon}</div>
                            <div className="text-tiny text-gray-400">Études total</div>
                            <div className="text-sm font-bold text-white">{fmt(totalStudiesCost)}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

function parentalLeaveMonthsCost(goal: ChildGoal): number {
    return (goal.parentalLeaveIncomeDrop || 900) * 12;
}
