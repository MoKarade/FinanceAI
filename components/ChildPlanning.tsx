import React, { useState, useMemo, useEffect } from 'react';
import { CHART_TOOLTIP_STYLE } from '../utils/chartTooltip';
import { formatCAD, formatCompactCAD, formatPercent } from '../utils/format';
import { Card } from './ui/Card';
import { PageHeader } from './ui/PageHeader';
import { CollapsibleSection } from './ui/CollapsibleSection';
import { ChoixDeVie } from './child/ChoixDeVie';
import { useViewportBelowLg } from '../hooks/useViewportBelowLg';
import { reperesRonds } from '../utils/reperesRonds';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
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
    UNI_INFO,
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

// [S5-REFONTE-ENFANTS] Titre = TAB_LABELS (source unique), aligné sur la navigation : « Enfants ».
const TITRE = TAB_LABELS[TabEnum.CHILD];

/** Séries du coût net par âge : couleurs et libellés des maquettes (clés = données du graphe). */
const SERIES_COUT = [
    { cle: 'Essentiel', libelle: 'Essentiel', couleur: '#7c93f2' },
    { cle: 'Garde_École_Activités', libelle: 'Garde, école, activités', couleur: '#34b39a' },
    { cle: 'Ponctuel', libelle: 'Ponctuel', couleur: '#d4a24c' },
    { cle: 'Bénéfices', libelle: 'Allocations (reçues)', couleur: '#5B6573' },
] as const;

/** Montants mensuels / ponctuels saisis à la main (repliés dans « Détails de l'enfant »). */
const CHAMPS_MONTANTS: ReadonlyArray<{ id: 'governmentBenefits' | 'monthlyFood' | 'monthlyClothing' | 'initialCost'; libelle: string }> = [
    { id: 'governmentBenefits', libelle: 'Allocations (ACE + Soutien QC)' },
    { id: 'monthlyFood', libelle: 'Nourriture / mois' },
    { id: 'monthlyClothing', libelle: 'Vêtements / mois' },
    { id: 'initialCost', libelle: 'Coûts naissance (chambre, siège, etc.)' },
];

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
        // Tout enfant planifié compte dans le Futur (décision de Marc) : `isActive` écrit à vrai pour les
        // lecteurs qui le consultent encore (le moteur ne le lit plus).
        const newGoals = [...goals, { ...INITIAL_CHILD_GOAL, id: newId, name: `Enfant ${goals.length + 1}`, isActive: true }];
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
    const etroit = useViewportBelowLg();
    // Repères ronds (−5, 0, 5 … 20 k$ — maquettes) : sommes empilées au-dessus ET au-dessous de zéro.
    const reperesCout = useMemo(() => reperesRonds(costTimeline.data.flatMap((d) => [d.Essentiel + d.Garde_École_Activités + d.Ponctuel, d.Bénéfices])), [costTimeline.data]);
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

    // Âges de l'axe, calés aux bords (« 0 an » à gauche, « 25 ans » à droite — jamais rognés).
    const TickAge = (props: { x?: number; y?: number; payload?: { value: number }; index?: number; visibleTicksCount?: number }) => {
        const { x = 0, y = 0, payload, index = 0, visibleTicksCount = 1 } = props;
        const age = payload?.value ?? 0;
        const dernier = index === visibleTicksCount - 1;
        return (
            <text x={x} y={y + 12} textAnchor={index === 0 ? 'start' : dernier ? 'end' : 'middle'} fill="#8896a8" fontSize={etroit ? 10 : 11} fontFamily="JetBrains Mono">
                {age === 0 ? '0 an' : dernier ? `${age} ans` : age}
            </text>
        );
    };

    // C8 fix : garde déplacée APRÈS tous les hooks ci-dessus.
    // [REFONTE-NAV-L4] avant : `return null` → page BLANCHE quand aucun enfant.
    // Empty state honnête + CTA, cohérent avec les autres pages « Vie ».
    if (!goal) {
        return (
            <div className="space-y-6 stagger-in pb-10">
                <PageHeader title={TITRE} subtitle={CHILD_SUBTITLE} actions={<VieCurveLink />} />
                <EmptyState
                    icon={<Icon name="child" size={30} />}
                    title="Aucun enfant planifié"
                    description="Ajoute un enfant (réel ou prévu) pour chiffrer son coût, ses allocations et son REEE dans ta courbe Future."
                    cta={<Button onClick={handleAddChild} variant="primary" size="md">+ Ajouter un enfant</Button>}
                />
            </div>
        );
    }

    const nomEnfant = goal.name || `Enfant ${activeTabIndex + 1}`;
    const coutTotal = <span className="text-meta lg:text-body text-ink-400">Coût total <PrivateAmount className="font-mono font-semibold lg:font-normal text-ink-50">{fmt(costTimeline.totalCost)}</PrivateAmount></span>;
    const legende = (
        <span className="flex flex-wrap gap-x-3.5 gap-y-1 text-meta text-ink-300" aria-hidden="true">
            {SERIES_COUT.map((serie) => (
                <span key={serie.cle} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: serie.couleur }} />{serie.libelle}</span>
            ))}
        </span>
    );

    // [S5-REFONTE-ENFANTS] Maquettes E-enfants / M-enfants :
    // - en-tête : titre, onglets des enfants (+ Ajouter), coût total et lien vers la courbe ;
    // - bureau : « Choix de vie » à gauche ; courbe du coût net par âge puis REEE à droite ;
    // - mobile : courbe, REEE, choix de vie, puis le lien vers la courbe en pleine largeur.
    // Ce que les maquettes ne montrent pas (prénom, date, cotisation REEE, allocations, suppression) reste
    // disponible, replié dans « Détails de l'enfant » (décision de Marc, 25/09). Plus d'interrupteur
    // « compter dans le Futur » : un enfant planifié compte toujours.
    return (
        <div className="space-y-6 stagger-in pb-10">
            <ConfirmModal
                isOpen={!!confirmRemove}
                onConfirm={doRemoveChild}
                onCancel={() => setConfirmRemove(null)}
                title="Supprimer le profil"
                message={`Supprimer "${confirmRemove?.name}" définitivement ?`}
                confirmLabel="Supprimer"
            />
            <PageHeader
                title={TITRE}
                badge={<span className="lg:hidden">{coutTotal}</span>}
                nav={
                    <div role="group" aria-label="Enfants" className="flex flex-wrap items-center gap-1">
                        {goals.map((g, idx) => (
                            <button
                                type="button"
                                key={g.id || idx}
                                onClick={() => setActiveTabIndex(idx)}
                                aria-pressed={activeTabIndex === idx}
                                className={`min-h-11 lg:min-h-9 px-3.5 rounded-lg text-body transition-colors focus-ring ${
                                    activeTabIndex === idx ? 'bg-ink-50 lg:bg-surfaceHighlight text-dark lg:text-ink-50 font-semibold' : 'text-ink-300 hover:bg-white/5'
                                }`}
                            >
                                {g.name || `Enfant ${idx + 1}`}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={handleAddChild}
                            aria-label="Ajouter un enfant"
                            className="min-h-11 lg:min-h-9 px-3.5 rounded-lg border border-dashed border-white/20 text-body text-ink-200 hover:bg-white/5 transition-colors focus-ring"
                        >
                            + Ajouter
                        </button>
                    </div>
                }
                actions={<span className="hidden lg:flex items-center gap-3">{coutTotal}<VieCurveLink /></span>}
            />

            <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-5 items-start">
                <div className="min-w-0 flex flex-col gap-4 order-2 xl:order-none">
                    <ChoixDeVie
                        daycareType={daycareType} setDaycareType={setDaycareType}
                        schoolType={schoolType} setSchoolType={setSchoolType}
                        activitiesLevel={activitiesLevel} setActivitiesLevel={setActivitiesLevel}
                        universityType={universityType} setUniversityType={setUniversityType}
                        carGift={carGift} setCarGift={setCarGift}
                    />
                    <CollapsibleSection title="Détails de l'enfant" subtitle="Prénom, date, cotisation REEE, allocations" headingLevel={2}>
                        <div className="space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="child-name-input" className="text-meta text-ink-300 block mb-1">Prénom ou identifiant</label>
                                    <input id="child-name-input" type="text" value={goal.name || ''} onChange={e => update('name', e.target.value)} placeholder="Ex: Léo" className="w-full h-11 px-3 text-white" />
                                </div>
                                <div>
                                    <label htmlFor="child-birthDate" className="text-meta text-ink-300 block mb-1">Date de naissance (ou prévue)</label>
                                    <input id="child-birthDate" type="date" value={goal.birthDate} onChange={e => update('birthDate', e.target.value)} className="w-full h-11 px-3 text-white" />
                                </div>
                            </div>
                            <div>
                                <label className="flex justify-between text-meta text-ink-200 mb-1">
                                    <span>Cotisation annuelle REEE</span>
                                    <PrivateSliderValue revealed={respSliderFocus} className="font-mono text-ink-50">{fmt(respContribution)}</PrivateSliderValue>
                                </label>
                                <input type="range" aria-label="Cotisation annuelle REEE" min="0" max="5000" step="100" value={respContribution} {...maskedSliderAria(isPrivacyMode && !respSliderFocus)} onChange={e => setRespContribution(Number(e.target.value))} onFocus={() => setRespSliderFocus(true)} onBlur={() => setRespSliderFocus(false)} className="w-full accent-primary cursor-pointer" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {CHAMPS_MONTANTS.map((c) => (
                                    <div key={c.id}>
                                        <label htmlFor={`child-${c.id}`} className="text-meta text-ink-300 block mb-1">{c.libelle}</label>
                                        <input id={`child-${c.id}`} type="number" value={goal[c.id]} onChange={e => update(c.id, Number(e.target.value))} className="w-full h-11 px-3 text-right font-mono text-white" />
                                    </div>
                                ))}
                            </div>
                            {goals.length > 1 && (
                                <div className="flex justify-end">
                                    <button type="button" onClick={handleRemoveChild} className="min-h-11 px-3 text-meta text-danger-400 underline underline-offset-2 focus-ring rounded-sm">
                                        Supprimer {nomEnfant}
                                    </button>
                                </div>
                            )}
                        </div>
                    </CollapsibleSection>
                </div>

                <div className="min-w-0 flex flex-col gap-4 order-1 xl:order-none">
                    <Card title="Coût net par âge" action={<span className="hidden sm:flex">{legende}</span>}>
                        <div className="sm:hidden -mt-2 mb-3">{legende}</div>
                        <div role="img" aria-label={`Coût net de ${nomEnfant} par âge, de 0 à 25 ans : essentiel, garde/école/activités, ponctuel, et allocations reçues en négatif.`}>
                        <ZoomContainer zoom={zoomCost} hint={false} style={{ width: '100%', height: etroit ? '220px' : '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={zoomCost.visibleData} stackOffset="sign" margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                                    <XAxis dataKey="age" tick={<TickAge />} tickLine={false} axisLine={false} ticks={[0, 5, 10, 15, 20, 25]} interval={0} />
                                    <YAxis orientation="right" ticks={reperesCout} domain={['dataMin', 'dataMax']} stroke="#8896a8" tick={{ fontSize: etroit ? 10 : 11, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} width={etroit ? 40 : 48} tickFormatter={maskedTick(isPrivacyMode, (v: number) => formatCompactCAD(v))} />
                                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number, name: string) => [isPrivacyMode ? MASKED_AMOUNT_LABEL : fmt(Math.abs(v)), name]} labelFormatter={l => `Âge ${l} ans`} />
                                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" />
                                    {SERIES_COUT.map((serie) => (
                                        <Bar key={serie.cle} dataKey={serie.cle} stackId="a" fill={serie.couleur} fillOpacity={0.85} name={serie.libelle} />
                                    ))}
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

                    {/* REEE : phrase de repère + trois chiffres (maquettes). La cotisation se règle dans « Détails ». */}
                    <section aria-labelledby="reee-titre" className="rounded-2xl bg-surface border border-white/6 p-4 sm:px-[22px] sm:py-[18px] grid grid-cols-3 lg:grid-cols-[1.2fr_repeat(3,minmax(0,1fr))] gap-x-4 gap-y-3 items-center">
                        <div className="col-span-3 lg:col-span-1 flex flex-col gap-1">
                            <h2 id="reee-titre" className="text-[17px] lg:text-[16px] font-semibold text-ink-50">REEE</h2>
                            <p className="text-[13px] leading-[18px] text-ink-400"><PrivateAmount>{fmt(2500)}</PrivateAmount>/an maximise les subventions (30 % : 20 % fédéral, 10 % Québec).</p>
                        </div>
                        <div>
                            <div className="text-meta text-ink-400">Capital à 17 ans</div>
                            {totalResp != null
                                ? <PrivateAmount as="div" className="font-mono text-[18px] lg:text-[20px] font-bold text-ink-50">{fmt(totalResp)}</PrivateAmount>
                                : <ProjectionRequired variant="inline" />}
                        </div>
                        <div>
                            <div className="text-meta text-ink-400">Études prévues</div>
                            <PrivateAmount as="div" className="font-mono text-[18px] lg:text-[20px] font-bold text-ink-50">{fmt(totalStudiesCost)}</PrivateAmount>
                        </div>
                        <div>
                            <div className="text-meta text-ink-400">Couverture</div>
                            <div className={`text-[18px] lg:text-[20px] font-bold ${respCovers != null && respCovers >= 100 ? 'text-success-400' : 'text-warning-400'}`}>
                                {respCovers != null ? formatPercent(respCovers, 0) : '—'}
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            {/* Mobile : le lien vers la courbe ferme la page, en pleine largeur (maquette M-enfants). */}
            <div className="lg:hidden [&>button]:w-full"><VieCurveLink /></div>
        </div>
    );
};

function parentalLeaveMonthsCost(goal: ChildGoal): number {
    // HIGH-2 fix (audit 2026-05-21) : fallback aligné sur INITIAL_CHILD_GOAL
    // (constants.ts = 800$). Avant : 900 fallback non documenté → divergence
    // silencieuse entre fixture par défaut et calcul si champ undefined.
    return (goal.parentalLeaveIncomeDrop ?? INITIAL_CHILD_GOAL.parentalLeaveIncomeDrop) * 12;
}
