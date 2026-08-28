import React, { useMemo, useState } from 'react';
import { CHART_TOOLTIP_STYLE } from '../utils/chartTooltip';
import { Card } from './ui/Card';
import { PageHeader } from './ui/PageHeader';
import { ProjectionStaleBanner } from './ui/ProjectionStaleBanner';
import { ProfileFieldsMoved } from './settings/ProfileFieldsMoved';
import { Icon, type IconName } from './ui/Icon';
import { SubTabs, TabPanel } from './ui/SubTabs';
import { Badge } from './ui/Badge';
import { PrivateAmount } from './ui/PrivateAmount';
import { maskedTick } from '../utils/chartPrivacy';
import { VieCurveLink } from './vie/VieCurveLink';
import { TAB_LABELS } from '../constants';
import { ProjectionConfig, RetirementGoal, BudgetConfig, ChildGoal, TravelGoal, LifeEvent, Debt, RealEstateGoal, BudgetCategory, Tab } from '../types';
import { ProjectionChartPoint } from '../services/projection/types';
import { Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ComposedChart, Line, Legend } from 'recharts';
import { useTimeChartZoom } from '../hooks/useTimeChartZoom';
import { buildLockedByMonth, pointStackedCapital } from '../utils/lockedCurveOverlay';
import { ZoomContainer } from './ui/ZoomContainer';
import { ChartDataTable, type ChartDataColumn } from './ui/ChartDataTable';
import { MASKED_AMOUNT_LABEL } from '../utils/privacyAria';
import { TaxBracketViz } from './TaxBracketViz';
import { GoalSeekerCard } from './retirement/GoalSeekerCard';
import { AssetLocationCard } from './retirement/AssetLocationCard';
import { CurrentCapitalCard } from './retirement/CurrentCapitalCard';
import { ageOptsForSalaryInversion, calculateGrossFromNet } from '../services/tax';
import { useFinanceStore } from '../store/useFinanceStore';
import { formatCAD, formatSigned, formatCompactCAD } from '../utils/format';
import { useShallow } from 'zustand/shallow';
import { ProjectionRequired } from './ui/ProjectionRequired';

// Sprint 2 PH3 — constante stable pour éviter de créer un nouveau [] à chaque
// render (qui invaliderait les useMemo deps de la projection).
const EMPTY_ARRAY: never[] = [];

// [REFONTE-NAV-L4] Sous-titre harmonisé de la famille « Vie » (ce que je PRÉVOIS) :
// chaque page annonce son rôle vis-à-vis de la courbe Future.
const RETIREMENT_SUBTITLE = "Ton plan de retraite déforme ta courbe Future — mêmes chiffres que l'onglet Futur.";

// [REFONTE-NAV-L4] + [UI-TABS-RICH] — la page empilait 4 outils dans une colonne :
// sous-onglets légers (idiome BudgetWorkspace) SANS déplacer de logique. « Projection »
// = résultats de la courbe (capital + graphes), « Outils » = optimiseurs interactifs.
type RetirementSubTab = 'projection' | 'outils';
const RETIREMENT_SUB_TABS: ReadonlyArray<{ id: RetirementSubTab; label: string; icon: IconName }> = [
    { id: 'projection', label: 'Projection', icon: 'chart' },
    { id: 'outils', label: "Outils d'optimisation", icon: 'goal' },
];

interface RetirementProps {
    goal: RetirementGoal;
    /** PH3 — plus consommé (l'édition de retirementGoal passe par Profil) ; optionnel pour compat. */
    setGoal?: (g: RetirementGoal) => void;
    currentREER: number;
    currentCELI: number;
    currentNonReg: number;
    calculatedMonthlySavings: number;
    projection: ProjectionConfig;
    config: BudgetConfig;
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
    initialBalances = {}, budgetItems = [],
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

    // [DEAD-FLT] (revue #245) — l'ancien effet `fetchLiveTotals` était INOPÉRANT : il reposait sur
    // `services/finance.fetchPortfolioHistory`, un STUB `return []` (le corps async ne tournait
    // jamais). Purgé → simple dérivé des props (mêmes valeurs que ce que l'état affichait réellement).
    const liveCSVBalances = useMemo(() => ({
        CELI: currentCELI, CELIAPP: 0, REER: currentREER, NON_ENREG: currentNonReg,
        CRYPTO: 0, REEE: 0, TOTAL: currentCELI + currentREER + currentNonReg, historicalRate: 0,
    }), [currentCELI, currentREER, currentNonReg]);

    // PV-5 / PH3 — `updateGoal` retiré avec les éditeurs (le revenu-retraite s'édite dans Profil).

    const baseNetAnnual = useMemo(() => config.users.reduce((sum: number, u) => sum + ((u.netSalary || u.salary || 0) * 12), 0), [config]);
    // [TAXBRACKETVIZ-ANNEE] Une SEULE lecture de l'horloge pour tout l'écran : le brut déduit et les
    // paliers affichés doivent parler de la même année, et deux `new Date()` séparés pourraient
    // tomber de part et d'autre d'un 31 décembre.
    const anneeFiscaleCourante = useMemo(() => new Date().getFullYear(), []);
    const baseGrossAnnual = useMemo(() => config.users.reduce((sum: number, u) => {
        if (u.grossSalary) return sum + (u.grossSalary * 12);
        const netAnnual = (u.netSalary || u.salary || 0) * 12;
        // [GROSSFROMNET-ANNEE-FIGEE] barème de l'année COURANTE, pas 2026 figé.
        // [GROSSFROMNET-CREDITS-65] Crédits d'âge PAR UTILISATEUR — un ménage mixte (66 ans + 40 ans)
        // n'a pas le même brut déduit pour les deux, et `hasSpouse` change le montant QC « vivant seule ».
        return sum + calculateGrossFromNet(netAnnual, anneeFiscaleCourante,
            ageOptsForSalaryInversion(u, anneeFiscaleCourante, config.users.length));
    }, 0), [config, anneeFiscaleCourante]);

    const baseMonthlyExpenses = Math.max(0, (baseNetAnnual / 12) - calculatedMonthlySavings);

    const currentRentExpense = useMemo(() => {
        // [BUDGET-TX-CATEGORIES] + « logement » (nom canonique des postes auto-alignés), comme
        // computeCurrentRentExpense (buildSimulationParams) — sinon défaut 1600 $ à tort.
        const rentItem = budgetItems.find(b => b.name.toLowerCase().includes('loyer') || b.name.toLowerCase().includes('hypothèque') || b.name.toLowerCase().includes('logement'));
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
    // [A11Y-CHARTS] — mode discret : masque les montants de la table de données sr-only (parité
    // avec les <PrivateAmount> / blur visuel du reste de l'onglet).
    const isPrivacyMode = useFinanceStore(s => s.isPrivacyMode);
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

    // [A11Y-CHARTS] — colonnes de la table de données sr-only du graphe d'accumulation (alternative
    // texte à la courbe Recharts, opaque aux lecteurs d'écran). Âge (axe X) + comptes empilés + capital
    // total + patrimoine net. Mode privé masque les MONTANTS (pas l'âge).
    const accumColumns = useMemo<ChartDataColumn[]>(() => {
        const money = (v: unknown) => isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCompactCAD(Number(v) || 0);
        return [
            { key: 'age', label: 'Âge', format: (v) => v != null ? `${v} ans` : '' },
            { key: 'NetWorth', label: 'Patrimoine net', format: money },
            { key: 'TotalCapital', label: 'Capital placé', format: money },
            { key: 'Liquidites', label: 'Liquidités', format: money },
            { key: 'NonReg', label: 'Non-Enreg.', format: money },
            { key: 'CELI', label: 'CELI', format: money },
            { key: 'CELIAPP', label: 'CELIAPP', format: money },
            { key: 'REER', label: 'REER', format: money },
        ];
    }, [isPrivacyMode]);

    // [A11Y-CHARTS] (LOT 3) — colonnes de la table de données sr-only du 2e graphe « Flux à la
    // retraite » (alternative texte au ComposedChart Recharts, opaque aux lecteurs d'écran). Âge
    // (axe X) + rente gouv./PSV + revenu total + besoin (dépenses). Mode privé masque les MONTANTS
    // (pas l'âge). Mêmes dataKeys que le graphe : IncomeRetirement / Income / Expenses.
    const cashflowColumns = useMemo<ChartDataColumn[]>(() => {
        const money = (v: unknown) => isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(Number(v) || 0);
        return [
            { key: 'age', label: 'Âge', format: (v) => v != null ? `${v} ans` : '' },
            { key: 'IncomeRetirement', label: 'Rente gouv. + PSV', format: money },
            { key: 'Income', label: 'Revenu total', format: money },
            { key: 'Expenses', label: 'Besoin (avec inflation)', format: money },
        ];
    }, [isPrivacyMode]);

    // G7c — zoom molette / pan sur les deux graphes Retraite (x = âge).
    type YearlyPoint = ProjectionChartPoint & { TotalCapital: number };
    const zoomAccum = useTimeChartZoom<YearlyPoint>(lifeExpectancyData as YearlyPoint[]);
    const zoomCashflow = useTimeChartZoom<YearlyPoint>(retirementData as YearlyPoint[]);
    const bankruptcyAge = bankruptcyPoint?.age;

    // [REFONTE-NAV-L4] sous-onglet actif (idiome BudgetWorkspace, aucun état persisté).
    const [subTab, setSubTab] = useState<RetirementSubTab>('projection');

    // Mode strict : pas de projection = pas de données. Aucune invention.
    if (!hasProjection) {
        return (
            <div className="space-y-6 stagger-in pb-20">
                <PageHeader
                    icon={<Icon name="retirement" size={28} />}
                    title={TAB_LABELS[Tab.RETIREMENT]}
                    subtitle={RETIREMENT_SUBTITLE}
                    actions={<VieCurveLink />}
                />
                <ProjectionRequired feature="La simulation de retraite" />
            </div>
        );
    }

    return (
        <div className="space-y-6 stagger-in pb-20">
            {/* [PH2-c-2] — signal inter-onglets : dernier recalcul de projection échoué. */}
            <ProjectionStaleBanner />
            {/* [REFONTE-NAV-L4] header harmonisé famille « Vie » : titre = TAB_LABELS, sous-titre
                = rôle vis-à-vis de la courbe, lien courbe en action. Le scénario actif (ex-sous-titre)
                devient un badge — même registre que l'indicateur succès/épuisement. */}
            <PageHeader
                icon={<Icon name="retirement" size={28} />}
                title={TAB_LABELS[Tab.RETIREMENT]}
                subtitle={RETIREMENT_SUBTITLE}
                badge={
                    <div className="flex flex-wrap items-center gap-2">
                        {activeScenarioName && (
                            <Badge variant="info" size="md">Scénario : {activeScenarioName}</Badge>
                        )}
                        <Badge variant={bankruptcyAge ? 'danger' : 'success'} size="md">
                            {bankruptcyAge ? `Capital épuisé à ${bankruptcyAge} ans` : `Succès jusqu'à ${lifeExpectancy} ans`}
                        </Badge>
                    </div>
                }
                actions={<VieCurveLink />}
            />

            {/* PH3 — TOUS les éditeurs de profil/retraite (paramètres, revenu-retraite, profil détaillé)
                ont migré dans l'onglet Profil unifié. Retraite = résultats & analyses uniquement. */}
            <ProfileFieldsMoved what="Tes paramètres de retraite, ton revenu-retraite et ton profil détaillé" />

            {/* [REFONTE-NAV-L4] + [UI-TABS-RICH] — sous-onglets légers : la colonne de 4 outils
                empilés devient « Outils d'optimisation », la courbe garde toute la place. */}
            <SubTabs<RetirementSubTab>
                idPrefix="retraite"
                label="Sections Retraite"
                tabs={RETIREMENT_SUB_TABS}
                active={subTab}
                onSelect={setSubTab}
            />

            <TabPanel idPrefix="retraite" tab="outils" when={subTab === 'outils'}>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
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

                    {/* W4.1 — Tax bracket viz */}
                    {/* [TAXBRACKETVIZ-ANNEE] MÊME année que celle qui a servi à déduire le brut
                        ci-dessus (`calculateGrossFromNet(net, new Date().getFullYear())`) : c'est la
                        PAIRE que le ticket avait laissée désaccordée. Passer l'une sans l'autre
                        reproduirait `CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE`. */}
                    <TaxBracketViz annualGrossIncome={baseGrossAnnual} label="revenu actuel" year={anneeFiscaleCourante} />
                </div>
            </TabPanel>

            <TabPanel idPrefix="retraite" tab="projection" when={subTab === 'projection'}>
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
                </div>

                <div className="lg:col-span-2 space-y-6">
                    {/* [REFONTE-NAV-L4] l'ancien ternaire chartData.length === 0 ici était MORT :
                        la garde hasProjection plus haut retourne déjà <ProjectionRequired>. */}
                    <>
                            <Card icon={<Icon name="investments" size={18} />} title="Accumulation & épuisement">
                                <div
                                    role="img"
                                    aria-label="Graphique d'accumulation et d'épuisement — évolution du capital placé (par compte) et du patrimoine net selon l'âge, de maintenant jusqu'à l'espérance de vie."
                                >
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
                                            <YAxis stroke="#334155" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={maskedTick(isPrivacyMode, (val: number) => formatCompactCAD(val))} width={55} />
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
                                </div>
                                {/* [A11Y-CHARTS] — alternative TEXTUELLE (sr-only) à la courbe d'accumulation :
                                    mêmes données en table accessible, masquage privacy aligné sur les PrivateAmount. */}
                                <ChartDataTable
                                    caption="Capital placé et patrimoine net par âge (accumulation puis épuisement)"
                                    columns={accumColumns}
                                    rows={lifeExpectancyData}
                                />

                                <div className="grid grid-cols-3 gap-4 mt-6">
                                    <div className="bg-black/30 p-4 rounded-xl border border-white/5 text-center shadow-inner">
                                        <div className="text-tiny text-ink-400 uppercase tracking-widest font-bold">Capital a la Retraite</div>
                                        <PrivateAmount as="div" className="text-2xl font-black text-info-400 mt-1 drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]">
                                            {formatCompactCAD(retirementNetWorth)}
                                        </PrivateAmount>
                                    </div>
                                    <div className="bg-black/30 p-4 rounded-xl border border-white/5 text-center shadow-inner">
                                        <div className="text-tiny text-ink-400 uppercase tracking-widest font-bold">Pic du Patrimoine</div>
                                        <PrivateAmount as="div" className="text-2xl font-black text-success-400 mt-1 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]">
                                            {formatCompactCAD(peakNetWorth)}
                                        </PrivateAmount>
                                    </div>
                                    <div className="bg-black/30 p-4 rounded-xl border border-white/5 text-center shadow-inner">
                                        <div className="text-tiny text-ink-400 uppercase tracking-widest font-bold">Heritage ({lifeExpectancy} ans)</div>
                                        <PrivateAmount as="div" className={`text-2xl font-black mt-1 ${finalNetWorth > 0 ? 'text-white' : 'text-danger-400'}`}>
                                            {finalNetWorth > 0 ? formatCompactCAD(finalNetWorth) : 'Épuisé'}
                                        </PrivateAmount>
                                    </div>
                                </div>
                            </Card>

                            <Card icon={<Icon name="debt" size={18} />} title="Flux à la retraite">
                                <div
                                    role="img"
                                    aria-label="Graphique des flux à la retraite — revenu total, rente gouvernementale + PSV et besoin mensuel (ajusté à l'inflation) selon l'âge, de la retraite jusqu'à l'espérance de vie."
                                >
                                <ZoomContainer zoom={zoomCashflow} className="h-[280px] w-full" style={{ minHeight: '280px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={zoomCashflow.visibleData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" vertical={false} />
                                            <XAxis dataKey="age" stroke="#334155" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(val) => `${val}a`} />
                                            <YAxis stroke="#334155" tick={{ fontSize: 10, fill: '#64748b' }} width={50} tickFormatter={maskedTick(isPrivacyMode, (val: number) => formatCompactCAD(val))} />
                                            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(val: number | string, name: string) => [isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(Number(val)), name]} />
                                            <Legend iconType="circle" />
                                            <Area type="monotone" dataKey="IncomeRetirement" fill="#5b82bf20" stroke="#5b82bf" strokeWidth={2} name="Rente Gouv. + PSV" />
                                            <Area type="monotone" dataKey="Income" fill="#4f9d8615" stroke="#4f9d86" strokeWidth={2} name="Revenu Total" />
                                            <Line type="monotone" dataKey="Expenses" stroke="#ef4444" strokeWidth={3} dot={false} name="Besoin (Infl.)" style={{ filter: 'drop-shadow(0px 2px 6px rgba(239,68,68,0.5))' }} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </ZoomContainer>
                                </div>
                                {/* [A11Y-CHARTS] (LOT 3) — alternative TEXTUELLE (sr-only) au graphe « Flux à la
                                    retraite » : mêmes flux (rente, revenu, besoin) par âge en table accessible,
                                    masquage privacy aligné sur le reste de l'onglet. */}
                                <ChartDataTable
                                    caption="Flux à la retraite par âge — rente gouvernementale, revenu total et besoin mensuel"
                                    columns={cashflowColumns}
                                    rows={retirementData}
                                />
                                <div className="mt-4 text-meta text-ink-300 text-center bg-white/5 p-3 rounded-lg border border-white/10">
                                    La ligne rouge represente votre besoin mensuel ({goal.targetMonthlyIncome}$/mois), ajuste a l'inflation ({projection.inflationRate ?? 2}%) au fil du temps.
                                </div>
                            </Card>
                        </>
                </div>
            </div>
            </TabPanel>
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
                    <PrivateAmount className="text-body font-black text-success-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]">{formatCAD(data.NetWorth)}</PrivateAmount>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                        <div className="text-tiny text-primary font-bold mb-1">CELI</div>
                        <PrivateAmount as="div" className="text-meta font-black text-ink-50">{formatCAD(data.CELI || 0)}</PrivateAmount>
                    </div>
                    <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                        <div className="text-tiny text-info-500 font-bold mb-1">REER</div>
                        <PrivateAmount as="div" className="text-meta font-black text-ink-50">{formatCAD(data.REER || 0)}</PrivateAmount>
                    </div>
                    {/* Revue #245 (a11y S1) — CELIAPP visible au stack doit avoir sa valeur TEXTE ici. */}
                    {(data.CELIAPP || 0) > 0 && (
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                            <div className="text-tiny text-[#2dd4bf] font-bold mb-1">CELIAPP</div>
                            <PrivateAmount as="div" className="text-meta font-black text-ink-50">{formatCAD(data.CELIAPP || 0)}</PrivateAmount>
                        </div>
                    )}
                    {(data.NonReg || 0) > 0 && (
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                            <div className="text-tiny text-warning-500 font-bold mb-1">Non-Enreg.</div>
                            <PrivateAmount as="div" className="text-meta font-black text-ink-50">{formatCAD(data.NonReg || 0)}</PrivateAmount>
                        </div>
                    )}
                    <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                        <div className="text-tiny text-[#9b8fcf] font-bold mb-1">Liquidites</div>
                        <PrivateAmount as="div" className="text-meta font-black text-ink-50">{formatCAD(data.Liquidites || 0)}</PrivateAmount>
                    </div>
                </div>
            </div>

            {isRetired ? (
                <div className="space-y-2">
                    <div className="text-tiny font-bold text-ink-300 uppercase tracking-widest mb-1">Flux Mensuel</div>
                    <div className="bg-black/30 rounded-lg p-3 border border-danger-500/20 space-y-2">
                        <div className="flex justify-between text-meta"><span className="text-ink-300">Revenu total</span><PrivateAmount className="text-success-400 font-bold">{formatSigned(data.Income || 0, { withCurrency: true })}</PrivateAmount></div>
                        <div className="flex justify-between text-meta"><span className="text-ink-300">Depenses (Infl.)</span><PrivateAmount className="text-danger-400 font-bold">{formatSigned(-(data.Expenses || 0), { withCurrency: true })}</PrivateAmount></div>
                        <div className="flex justify-between text-meta pt-1 border-t border-white/5"><span className="text-ink-300">Cashflow</span><PrivateAmount className={`font-bold ${((data.Income ?? 0) - (data.Expenses ?? 0)) >= 0 ? 'text-success-400' : 'text-danger-400'}`}>{formatCAD((data.Income ?? 0) - (data.Expenses ?? 0))}</PrivateAmount></div>
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="text-tiny font-bold text-ink-300 uppercase tracking-widest mb-1">Epargne Mensuelle</div>
                    <div className="bg-black/30 rounded-lg p-3 border border-success-500/20">
                        <div className="flex justify-between text-meta"><span className="text-ink-300">Cashflow</span><PrivateAmount className="text-success-400 font-bold">{formatSigned(data.Savings || 0, { withCurrency: true })}</PrivateAmount></div>
                    </div>
                </div>
            )}
        </div>
    );
});
