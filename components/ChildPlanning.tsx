import React, { useState, useMemo, useEffect } from 'react';
import { CHART_TOOLTIP_STYLE } from '../utils/chartTooltip';
import { formatCAD } from '../utils/format';
import { Card } from './ui/Card';
import { PageHeader } from './ui/PageHeader';
import { ProfileFieldsMoved } from './settings/ProfileFieldsMoved';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, ReferenceLine, ComposedChart } from 'recharts';
import { useTimeChartZoom } from '../hooks/useTimeChartZoom';
import { ZoomContainer } from './ui/ZoomContainer';
import { ChildGoal, ProjectionConfig, Tab as TabEnum } from '../types';
import { INITIAL_CHILD_GOAL, TAB_LABELS } from '../constants';
import { ConfirmModal } from './ui/ConfirmModal';
import { EmptyState } from './ui/EmptyState';
import { VieCurveLink } from './vie/VieCurveLink';
import { ProjectionRequired } from './ui/ProjectionRequired';
import { useFinanceStore } from '../store/useFinanceStore';
import { PrivateAmount } from './ui/PrivateAmount';
import { maskedTick } from '../utils/chartPrivacy';
import { PrivateSliderValue } from './ui/PrivateSliderValue';
import { ChartDataTable, type ChartDataColumn } from './ui/ChartDataTable';
import { MASKED_AMOUNT_LABEL, maskedSliderAria } from '../utils/privacyAria';
import {
    DAYCARE_INFO, SCHOOL_INFO, ACTIVITIES_INFO, UNI_INFO, CAR_INFO,
    getAnnualChildCost,
    type DaycareType, type SchoolType, type ActivitiesLevel,
    type UniversityType, type CarGift,
} from '../services/projection/childCosts';

interface ChildPlanningProps {
    goals: ChildGoal[];
    setGoals: (goals: ChildGoal[]) => void;
    projection: ProjectionConfig;
    currentRESP?: number;
}

// ============================
// CHOIX DE VIE — Impacts chiffrés
// ============================
// Types et constantes déplacés dans services/projection/childCosts.ts
// (source unique partagée avec le moteur de projection).

const fmt = (n: number) => formatCAD(n);

// [REFONTE-NAV-L4] Sous-titre harmonisé de la famille « Vie » (ce que je PRÉVOIS).
const CHILD_SUBTITLE = 'Chaque enfant planifié déforme ta courbe Future — coûts, allocations et REEE entrent dans la simulation.';

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
    // [D6-PRIV-MONTANTS] focus du slider → étiquette révélée pendant l'ajustement seulement.
    const [respSliderFocus, setRespSliderFocus] = useState(false);

    // C8 fix : la garde `if (!goal) return null` est déplacée APRÈS tous les
    // hooks (juste avant le `return` JSX final). Les hooks qui dépendent de
    // `goal` font leur propre check interne. Avant ce fix, 4 hooks (2 useEffect
    // + 2 useMemo) étaient appelés conditionnellement → violation des règles
    // des Hooks → instabilité potentielle si `goal` passait de undefined à défini.

    const update = (field: keyof ChildGoal, value: ChildGoal[keyof ChildGoal]) => {
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

    // Note (audit HIGH-1 2026-05-21) : le state local `parentAtHome` a été
    // supprimé car jamais lu. La logique parent au foyer est correctement
    // appliquée via `daycareType === 'parent_foyer'` dans `getAnnualChildCost`
    // de services/projection/childCosts.ts (source unique).

    // Variables locales : seules uniInfo est utilisée par le JSX (couverture études).
    // Les autres (daycareMonthly, schoolYearly, etc.) étaient utilisées par
    // l'ancien costTimeline inline — maintenant la source est getAnnualChildCost().
    const uniInfo = UNI_INFO[universityType];

    // Centralisation 2026-05-21 : utilise getAnnualChildCost() (source unique
    // services/projection/childCosts.ts) au lieu de répliquer la logique des
    // tranches d'âge. Garanti aligné avec le moteur de projection qui utilise
    // les mêmes constantes DAYCARE_INFO/SCHOOL_INFO/etc.
    const costTimeline = useMemo(() => {
        if (!goal) return { data: [], totalCost: 0 };
        // `??` (pas `||`) : une inflation de 0 % saisie est respectée (cohérent avec le moteur,
        // setupSimulation) au lieu d'indexer les coûts enfant à 2 % en douce.
        const inflation = (projection.inflationRate ?? 2) / 100;
        const parentalLeaveYr0 = parentalLeaveMonthsCost(goal);
        // Override les choix de vie sur le goal pour matcher l'état local
        // de ce composant (les useState sont la vérité utilisateur courante,
        // pas encore forcément persistés sur goal.daycareType etc.)
        const effectiveGoal: ChildGoal = {
            ...goal,
            daycareType,
            schoolType,
            activitiesLevel,
            universityType,
            carGift,
        };

        const data = [];
        let totalCost = 0;

        for (let age = 0; age <= 25; age++) {
            const inflationMultiplier = Math.pow(1 + inflation, age);
            const b = getAnnualChildCost(
                effectiveGoal,
                age,
                inflationMultiplier,
                age === 0 ? parentalLeaveYr0 : 0,
            );

            totalCost += b.netTotal;
            data.push({
                age,
                Essentiel: b.base,
                Garde_École_Activités: b.careAndSchool + b.studies,
                Ponctuel: b.oneOff,
                Bénéfices: -b.benefits,
                Total: b.netTotal,
            });
        }
        return { data, totalCost };
    }, [goal, daycareType, schoolType, activitiesLevel, universityType, carGift, projection]);

    // Mode strict 2026-05-21 : respProjection vient de lastProjection.chartData
    // (champ REEE par année) au lieu d'une formule locale qui divergeait du
    // moteur. Si la projection n'a pas tourné, respProjection est vide et
    // l'UI affiche <ProjectionRequired>.
    const respProjection = useMemo(() => {
        if (!lastProjection?.chartData?.length || !goal?.birthDate) return [];
        const birthYear = new Date(goal.birthDate).getFullYear();
        const data = [];
        let prevBalance = currentRESP;
        let prevContribCum = 0;
        let prevGrantsCum = 0;
        for (let age = 0; age <= 17; age++) {
            const targetYear = birthYear + age;
            const point = lastProjection.chartData.find(p => p.year === targetYear);
            if (!point || typeof point.REEE !== 'number') continue;
            const solde = point.REEE;
            const contribCum = point.reeeContribCum ?? prevContribCum;
            const grantsCum = point.reeeGrantsCum ?? prevGrantsCum;
            // Annual delta
            const contribAnnual = Math.max(0, contribCum - prevContribCum);
            const grantAnnual = Math.max(0, grantsCum - prevGrantsCum);
            const interets = Math.max(0, Math.round(solde - prevBalance - contribAnnual - grantAnnual));
            data.push({
                age,
                Solde: Math.round(solde),
                Contribution: Math.round(contribAnnual),
                Subvention: Math.round(grantAnnual),
                Intérêts: interets,
            });
            prevBalance = solde;
            prevContribCum = contribCum;
            prevGrantsCum = grantsCum;
        }
        return data;
    }, [lastProjection, currentRESP, goal?.birthDate]);

    const totalResp = respProjection[respProjection.length - 1]?.Solde ?? null;

    // G7d — zoom molette / pan sur les deux graphes Enfant (x = âge).
    const zoomCost = useTimeChartZoom(costTimeline.data);
    const zoomResp = useTimeChartZoom(respProjection);
    const totalStudiesCost = uniInfo.yearlyCost * uniInfo.years;
    const respCovers = totalResp != null && totalStudiesCost > 0
        ? Math.min(100, (totalResp / totalStudiesCost) * 100)
        : null;

    // [A11Y-CHARTS] tables de données sr-only pour les 2 graphes Recharts (opaques aux lecteurs d'écran).
    // Colonnes $ masquées en mode privé (parité avec PrivateAmount/blur) ; l'axe X (âge) reste visible.
    const isPrivacyMode = useFinanceStore(s => s.isPrivacyMode);
    const money = (v: unknown) => isPrivacyMode ? MASKED_AMOUNT_LABEL : fmt(Number(v) || 0);
    const costColumns: ChartDataColumn[] = [
        { key: 'age', label: 'Âge enfant', format: (v) => `${v} ans` },
        { key: 'Essentiel', label: 'Essentiel', format: money },
        { key: 'Garde_École_Activités', label: 'Garde / École / Activités', format: money },
        { key: 'Ponctuel', label: 'Ponctuel (naissance, voiture…)', format: money },
        { key: 'Bénéfices', label: 'Allocations (négatif = bénéfice)', format: money },
        { key: 'Total', label: 'Total net', format: money },
    ];
    const respColumns: ChartDataColumn[] = [
        { key: 'age', label: 'Âge enfant', format: (v) => `${v} ans` },
        { key: 'Solde', label: 'Solde total', format: money },
        { key: 'Contribution', label: 'Contribution', format: money },
        { key: 'Subvention', label: 'Subventions reçues', format: money },
        { key: 'Intérêts', label: 'Intérêts', format: money },
    ];

    // C8 fix : garde déplacée APRÈS tous les hooks ci-dessus.
    // [REFONTE-NAV-L4] avant : `return null` → page BLANCHE quand aucun enfant.
    // Empty state honnête + CTA, cohérent avec les autres pages « Vie ».
    if (!goal) {
        return (
            <div className="space-y-6 stagger-in pb-10">
                <PageHeader
                    icon={<Icon name="child" size={28} />}
                    title={TAB_LABELS[TabEnum.CHILD]}
                    subtitle={CHILD_SUBTITLE}
                    actions={<VieCurveLink />}
                />
                <EmptyState
                    icon={<Icon name="child" size={30} />}
                    title="Aucun enfant planifié"
                    description="Ajoute un enfant (réel ou prévu) pour chiffrer son coût, ses allocations et son REEE dans ta courbe Future."
                    cta={<Button onClick={handleAddChild} variant="primary" size="md">+ Ajouter un enfant</Button>}
                />
            </div>
        );
    }

    return (
        <div className="space-y-6 stagger-in pb-10">
            <ConfirmModal
                isOpen={!!confirmRemove}
                onConfirm={doRemoveChild}
                onCancel={() => setConfirmRemove(null)}
                title="Supprimer le profil"
                message={`Supprimer "${confirmRemove?.name}" définitivement ?`}
                confirmLabel="Supprimer"
            />
            {/* [REFONTE-NAV-L4] header harmonisé famille « Vie » : titre = TAB_LABELS,
                sous-titre = rôle vis-à-vis de la courbe, lien courbe en tête des actions. */}
            <PageHeader
                icon={<Icon name="child" size={28} />}
                title={TAB_LABELS[TabEnum.CHILD]}
                subtitle={CHILD_SUBTITLE}
                badge={
                    <div className="flex items-center gap-2">
                        {/* Phase F.9 — indicateur d'activation FUTUR uniformisé avec Immobilier */}
                        {goal.isActive
                            ? <Badge variant="success" size="md">Active dans simulation</Badge>
                            // [UX-ISACTIVE-BADGE] (A5) : le défaut inactif est VOULU (« on attend
                            // le clic Activer ») — mais l'absence de la simulation doit être DITE.
                            : <Badge variant="neutral" size="md">Non compté dans la simulation</Badge>
                        }
                        <Badge variant="info" size="md">Coût total: {fmt(costTimeline.totalCost)}</Badge>
                    </div>
                }
                actions={
                    <>
                        <VieCurveLink />
                        <Button
                            onClick={() => update('isActive', !goal.isActive)}
                            variant={goal.isActive ? 'danger' : 'primary'}
                            size="md"
                        >
                            {goal.isActive ? 'Désactiver dans Futur' : 'Activer dans Futur'}
                        </Button>
                        {goals.length > 1 && (
                            <Button onClick={handleRemoveChild} variant="ghost" size="md" title="Supprimer ce profil"><Icon name="trash" size={16} /></Button>
                        )}
                    </>
                }
            />

            {/* PH3 — infos enfants (REEE) déplacées dans l'onglet Profil unifié. */}
            <ProfileFieldsMoved what="Les infos enfants (REEE)" />

            {/* Phase F.11 — onglets enfants alignés sur le style Pill (cohérence app) */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-b border-white/10 pb-4">
                {goals.map((g, idx) => (
                    <button
                        type="button"
                        key={g.id || idx}
                        onClick={() => setActiveTabIndex(idx)}
                        aria-pressed={activeTabIndex === idx}
                        className={`px-4 py-1.5 rounded-pill font-medium text-meta transition-colors focus-ring ${
                            activeTabIndex === idx
                                ? 'bg-info-500/15 text-info-400 border border-info-500/30'
                                : 'bg-white/5 text-ink-400 hover:bg-white/10 border border-white/10'
                        }`}
                    >
                        {g.name || `Enfant ${idx + 1}`}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={handleAddChild}
                    className="px-3 py-1.5 rounded-pill text-meta font-bold bg-success-500/10 text-emerald-300 border border-success-500/30 hover:bg-success-500/20 transition-colors focus-ring"
                >
                    + Ajouter
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* CONFIGURATEUR */}
                <div className="space-y-5">
                    <Card icon={<Icon name="calendar" size={18} />} title="Profil & Date Prévue">
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="child-name-input" className="text-meta text-ink-300 block mb-1">Prénom ou Identifiant</label>
                                <input id="child-name-input" type="text" value={goal.name || ''} onChange={e => update('name', e.target.value)} placeholder="Ex: Léo" className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-white outline-none focus:border-primary" />
                            </div>
                            <div>
                                <label className="text-meta text-ink-300 block mb-1">Date de naissance (ou prévue)</label>
                                <input type="date" value={goal.birthDate} onChange={e => update('birthDate', e.target.value)} className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-white focus:border-primary outline-none" />
                            </div>
                        </div>
                        <p className="text-tiny text-ink-400 mt-2">Cette date sera utilisée dans la simulation de l'onglet Futur.</p>
                    </Card>

                    <Card icon={<Icon name="goal" size={18} />} title="Choix de Vie">
                        <div className="space-y-5">
                            <div>
                                <div className="text-meta font-bold text-pink-400 uppercase mb-2">Mode de garde (0–5 ans)</div>
                                <div className="space-y-1.5">
                                    {(Object.entries(DAYCARE_INFO) as [DaycareType, typeof DAYCARE_INFO[DaycareType]][]).map(([key, info]) => (
                                        <button key={key} onClick={() => setDaycareType(key)}
                                            className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${daycareType === key ? 'border-primary bg-primary/10 text-white' : 'border-white/5 bg-white/5 text-ink-300 hover:bg-white/10'}`}>
                                            <span className="text-xl">{info.icon}</span>
                                            <div className="flex-1">
                                                <div className="text-meta font-bold">{info.label}</div>
                                                <div className="text-tiny text-ink-400">{info.desc}</div>
                                            </div>
                                            <div className="text-meta font-mono font-bold text-right">{info.monthly > 0 ? `${info.monthly}$/m` : 'Gratuit'}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="text-meta font-bold text-info-400 uppercase mb-2">Type d'école (6–17 ans)</div>
                                <div className="space-y-1.5">
                                    {(Object.entries(SCHOOL_INFO) as [SchoolType, typeof SCHOOL_INFO[SchoolType]][]).map(([key, info]) => (
                                        <button key={key} onClick={() => setSchoolType(key)}
                                            className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${schoolType === key ? 'border-info-500 bg-info-500/10 text-white' : 'border-white/5 bg-white/5 text-ink-300 hover:bg-white/10'}`}>
                                            <span className="text-xl">{info.icon}</span>
                                            <div className="flex-1 text-meta font-bold">{info.label}</div>
                                            <div className="text-meta font-mono font-bold text-right text-blue-300">+{(info.yearlyExtra / 1000).toFixed(0)}k$/an</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="text-meta font-bold text-yellow-400 uppercase mb-2">Sports & activités</div>
                                <div className="space-y-1.5">
                                    {(Object.entries(ACTIVITIES_INFO) as [ActivitiesLevel, typeof ACTIVITIES_INFO[ActivitiesLevel]][]).map(([key, info]) => (
                                        <button key={key} onClick={() => setActivitiesLevel(key)}
                                            className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${activitiesLevel === key ? 'border-yellow-500 bg-yellow-500/10 text-white' : 'border-white/5 bg-white/5 text-ink-300 hover:bg-white/10'}`}>
                                            <span className="text-xl">{info.icon}</span>
                                            <div className="flex-1 text-meta font-bold">{info.label}</div>
                                            <div className="text-meta font-mono font-bold text-right text-yellow-300">{info.yearlyExtra > 0 ? `+${info.yearlyExtra}$/an` : 'Rien'}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="text-meta font-bold text-purple-400 uppercase mb-2">Études post-secondaires (18–25 ans)</div>
                                <div className="space-y-1.5">
                                    {(Object.entries(UNI_INFO) as [UniversityType, typeof UNI_INFO[UniversityType]][]).map(([key, info]) => (
                                        <button key={key} onClick={() => setUniversityType(key)}
                                            className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${universityType === key ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-white/5 bg-white/5 text-ink-300 hover:bg-white/10'}`}>
                                            <span className="text-xl">{info.icon}</span>
                                            <div className="flex-1">
                                                <div className="text-meta font-bold">{info.label}</div>
                                                {info.years > 0 && <div className="text-tiny text-ink-400">{info.years} ans</div>}
                                            </div>
                                            <div className="text-meta font-mono font-bold text-right text-purple-300">{info.yearlyCost > 0 ? `${(info.yearlyCost / 1000).toFixed(0)}k$/an` : 'Gratuit'}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="text-meta font-bold text-orange-400 uppercase mb-2">Voiture à 18 ans (cadeau)</div>
                                <div className="flex gap-2">
                                    {(Object.entries(CAR_INFO) as [CarGift, typeof CAR_INFO[CarGift]][]).map(([key, info]) => (
                                        <button key={key} onClick={() => setCarGift(key)}
                                            className={`flex-1 flex flex-col items-center p-2.5 rounded-lg border text-center transition-all ${carGift === key ? 'border-orange-500 bg-orange-500/10 text-white' : 'border-white/5 bg-white/5 text-ink-300 hover:bg-white/10'}`}>
                                            <span className="text-xl mb-1">{info.icon}</span>
                                            <div className="text-tiny font-bold leading-tight">{info.label.split(' (')[0]}</div>
                                            {info.cost > 0 && <div className="text-tiny font-mono text-orange-300 mt-0.5">{(info.cost / 1000).toFixed(0)}k$</div>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card icon={<Icon name="money" size={18} />} title="Allocations">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="text-meta text-ink-200">Allocations (ACE + Soutien QC)</label>
                                <input type="number" value={goal.governmentBenefits} onChange={e => update('governmentBenefits', Number(e.target.value))} className="w-20 bg-white/5 border border-border rounded px-2 py-1 text-right text-body text-green-400 font-bold" />
                            </div>
                            <div className="flex justify-between items-center">
                                <label className="text-meta text-ink-200">Nourriture / mois</label>
                                <input type="number" value={goal.monthlyFood} onChange={e => update('monthlyFood', Number(e.target.value))} className="w-20 bg-white/5 border border-border rounded px-2 py-1 text-right text-body text-white" />
                            </div>
                            <div className="flex justify-between items-center">
                                <label className="text-meta text-ink-200">Vêtements / mois</label>
                                <input type="number" value={goal.monthlyClothing} onChange={e => update('monthlyClothing', Number(e.target.value))} className="w-20 bg-white/5 border border-border rounded px-2 py-1 text-right text-body text-white" />
                            </div>
                            <div className="flex justify-between items-center">
                                <label className="text-meta text-ink-200">Coûts naissance (chambre, siège, etc.)</label>
                                <input type="number" value={goal.initialCost} onChange={e => update('initialCost', Number(e.target.value))} className="w-20 bg-white/5 border border-border rounded px-2 py-1 text-right text-body text-white" />
                            </div>
                        </div>
                    </Card>
                </div>

                {/* GRAPHIQUES */}
                <div className="lg:col-span-2 space-y-5">
                    <Card icon={<Icon name="chart" size={18} />} title="Coût par âge" action={
                        <div className="text-meta text-ink-300 font-mono">Total : <PrivateAmount className="text-white font-bold">{fmt(costTimeline.totalCost)}</PrivateAmount></div>
                    }>
                        <div role="img" aria-label="Graphique du coût de l'enfant par âge (essentiel, garde/école/activités, ponctuel, allocations)">
                        <ZoomContainer zoom={zoomCost} className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={zoomCost.visibleData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                    <XAxis dataKey="age" stroke="#666" tick={{ fontSize: 10 }} label={{ value: 'Âge enfant', position: 'insideBottom', offset: -5, fill: '#666' }} />
                                    <YAxis stroke="#666" tick={{ fontSize: 10 }} tickFormatter={maskedTick(isPrivacyMode, (v: number) => `${(v / 1000).toFixed(0)}k`)} />
                                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number, name: string) => [isPrivacyMode ? MASKED_AMOUNT_LABEL : fmt(Math.abs(v)), name === 'Bénéfices' ? '↩ Allocations' : name]} labelFormatter={l => `Âge ${l} ans`} />
                                    <Legend />
                                    <ReferenceLine y={0} stroke="#555" />
                                    <Bar dataKey="Essentiel" stackId="a" fill="#6f72c4" name="Essentiel" />
                                    <Bar dataKey="Garde_École_Activités" stackId="a" fill="#bd7d9c" name="Garde / École / Activités" />
                                    <Bar dataKey="Ponctuel" stackId="a" fill="#c2974f" name="Ponctuel (naissance, voiture…)" />
                                    <Bar dataKey="Bénéfices" stackId="a" fill="#4f9d86" name="Allocations (négatif = bénéfice)" />
                                </BarChart>
                            </ResponsiveContainer>
                        </ZoomContainer>
                        </div>
                        <ChartDataTable
                            caption="Coût net de l'enfant par âge"
                            columns={costColumns}
                            rows={costTimeline.data}
                        />
                    </Card>

                    <Card icon={<Icon name="graduation" size={18} />} title="Simulateur REEE" action={
                        <div className="flex items-center gap-2">
                            {projectedReeeAt18 !== null && projectedReeeAt18 > 0 && (
                                <Badge
                                    variant="info"
                                    size="sm"
                                    onClick={() => navigateWithFocus(TabEnum.FUTURE)}
                                    title="Projection officielle (FutureProjection) au 17e anniversaire — clic pour ouvrir"
                                >
                                    <Icon name="link" size={11} className="inline mr-1" />{fmt(projectedReeeAt18)}
                                </Badge>
                            )}
                            {respCovers != null ? (
                                <div className={`text-meta font-bold px-2 py-1 rounded border ${respCovers >= 100 ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'}`}>
                                    {respCovers.toFixed(0)}% des études couvertes
                                </div>
                            ) : (
                                <ProjectionRequired variant="inline" feature="la couverture études" />
                            )}
                        </div>
                    }>
                        <div className="space-y-3 mb-4">
                            <div>
                                <label className="flex justify-between text-meta text-ink-200 mb-1">
                                    <span>Cotisation annuelle REEE</span>
                                    <PrivateSliderValue revealed={respSliderFocus} className="text-info-400 font-bold">{fmt(respContribution)}</PrivateSliderValue>
                                </label>
                                <input type="range" aria-label="Cotisation annuelle REEE" min="0" max="5000" step="100" value={respContribution} {...maskedSliderAria(isPrivacyMode && !respSliderFocus)} onChange={e => setRespContribution(Number(e.target.value))} onFocus={() => setRespSliderFocus(true)} onBlur={() => setRespSliderFocus(false)} className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-info-500" />
                                <p className="text-tiny text-ink-400 mt-1">Optimal : 2 500$/an pour maximiser les subventions (30% = fed 20% + QC 10%)</p>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-blue-900/20 p-3 rounded-lg border border-info-500/20 text-center">
                                    <div className="text-tiny text-ink-400 uppercase mb-1">Capital à 17 ans</div>
                                    <PrivateAmount as="div" className="text-lg font-black text-white">
                                        {totalResp != null ? fmt(totalResp) : <ProjectionRequired variant="inline" />}
                                    </PrivateAmount>
                                </div>
                                <div className="bg-green-900/20 p-3 rounded-lg border border-green-500/20 text-center">
                                    <div className="text-tiny text-ink-400 uppercase mb-1">Coût études prévu</div>
                                    <PrivateAmount as="div" className="text-lg font-black text-white">{fmt(totalStudiesCost)}</PrivateAmount>
                                </div>
                                <div className="bg-purple-900/20 p-3 rounded-lg border border-purple-500/20 text-center">
                                    <div className="text-tiny text-ink-400 uppercase mb-1">Couverture</div>
                                    <div className={`text-lg font-black ${respCovers != null && respCovers >= 100 ? 'text-green-400' : 'text-yellow-400'}`}>
                                        {respCovers != null ? `${respCovers.toFixed(0)}%` : '—'}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="h-[200px]">
                            {respProjection.length === 0 ? (
                                <ProjectionRequired feature="La projection REEE" />
                            ) : (
                            <div role="img" aria-label="Graphique de projection de l'épargne-études REEE (solde, contributions, subventions) par âge de l'enfant" className="h-full w-full">
                            <ZoomContainer zoom={zoomResp} className="h-full w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={zoomResp.visibleData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="respGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#5b82bf" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#5b82bf" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                    <XAxis dataKey="age" stroke="#666" tick={{ fontSize: 10 }} />
                                    <YAxis stroke="#666" tick={{ fontSize: 10 }} tickFormatter={maskedTick(isPrivacyMode, (v: number) => `${(v / 1000).toFixed(0)}k`)} />
                                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => isPrivacyMode ? MASKED_AMOUNT_LABEL : fmt(v)} labelFormatter={l => `Âge ${l} ans`} />
                                    <Legend />
                                    <Area type="monotone" dataKey="Solde" stroke="#5b82bf" fill="url(#respGrad)" strokeWidth={2} name="Solde Total" />
                                    <Bar dataKey="Subvention" fill="#4f9d86" name="Subventions reçues" />
                                </ComposedChart>
                            </ResponsiveContainer>
                            </ZoomContainer>
                            </div>
                            )}
                        </div>
                        {respProjection.length > 0 && (
                            <ChartDataTable
                                caption="Projection de l'épargne-études REEE par âge de l'enfant"
                                columns={respColumns}
                                rows={respProjection}
                            />
                        )}
                    </Card>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                            <div className="text-2xl mb-1">{DAYCARE_INFO[daycareType].icon}</div>
                            <div className="text-tiny text-ink-300">Garde mensuelle</div>
                            <div className="text-body font-bold text-white">{fmt(DAYCARE_INFO[daycareType].monthly)}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                            <div className="text-2xl mb-1">{SCHOOL_INFO[schoolType].icon}</div>
                            <div className="text-tiny text-ink-300">Frais scolaires/an</div>
                            <div className="text-body font-bold text-white">{fmt(SCHOOL_INFO[schoolType].yearlyExtra)}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                            <div className="text-2xl mb-1">{ACTIVITIES_INFO[activitiesLevel].icon}</div>
                            <div className="text-tiny text-ink-300">Activités/an</div>
                            <div className="text-body font-bold text-white">{fmt(ACTIVITIES_INFO[activitiesLevel].yearlyExtra)}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                            <div className="text-2xl mb-1">{UNI_INFO[universityType].icon}</div>
                            <div className="text-tiny text-ink-300">Études total</div>
                            <div className="text-body font-bold text-white">{fmt(totalStudiesCost)}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

function parentalLeaveMonthsCost(goal: ChildGoal): number {
    // HIGH-2 fix (audit 2026-05-21) : fallback aligné sur INITIAL_CHILD_GOAL
    // (constants.ts = 800$). Avant : 900 fallback non documenté → divergence
    // silencieuse entre fixture par défaut et calcul si champ undefined.
    return (goal.parentalLeaveIncomeDrop ?? INITIAL_CHILD_GOAL.parentalLeaveIncomeDrop) * 12;
}
