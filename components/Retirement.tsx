import React, { useMemo, useState } from 'react';
import { PageHeader } from './ui/PageHeader';
import { ProjectionStaleBanner } from './ui/ProjectionStaleBanner';
import { type IconName } from './ui/Icon';
import { SubTabs, TabPanel } from './ui/SubTabs';
import { PrivateAmount } from './ui/PrivateAmount';
import { VieCurveLink } from './vie/VieCurveLink';
import { TAB_LABELS } from '../constants';
import { DEFAULT_LIFE_EXPECTANCY } from '../services/projection/modelAssumptions';
import { ProjectionConfig, RetirementGoal, BudgetConfig, ChildGoal, TravelGoal, LifeEvent, Debt, RealEstateGoal, BudgetCategory, Tab } from '../types';
import { ProjectionChartPoint } from '../services/projection/types';
import { useTimeChartZoom } from '../hooks/useTimeChartZoom';
import { useViewportBelowLg } from '../hooks/useViewportBelowLg';
import { buildLockedByMonth, pointStackedCapital } from '../utils/lockedCurveOverlay';
import { type ChartDataColumn } from './ui/ChartDataTable';
import { MASKED_AMOUNT_LABEL } from '../utils/privacyAria';
import { TaxBracketViz } from './TaxBracketViz';
import { GoalSeekerCard } from './retirement/GoalSeekerCard';
import { AssetLocationCard } from './retirement/AssetLocationCard';
import { AccumulationDecaissement, type PointAnnuel } from './retirement/AccumulationDecaissement';
import { FluxRetraite } from './retirement/FluxRetraite';
import { ageOptsForSalaryInversion, calculateGrossFromNet } from '../services/tax';
import { useFinanceStore } from '../store/useFinanceStore';
import { formatCAD, formatSigned, formatCompactCAD } from '../utils/format';
import { useShallow } from 'zustand/shallow';
import { ProjectionRequired } from './ui/ProjectionRequired';

// Sprint 2 PH3 — constante stable pour éviter de créer un nouveau [] à chaque
// render (qui invaliderait les useMemo deps de la projection).
const EMPTY_ARRAY: never[] = [];

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
    const lifeExpectancy = retirementGoalStore?.lifeExpectancy ?? DEFAULT_LIFE_EXPECTANCY;
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
    // [ENG-STARTYEAR-DEFAUT-2026] La même lecture alimente désormais l'ANNÉE et le MOIS de départ du
    // chercheur d'objectif. `CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE` : `startMonth` vient du même
    // besoin que `startYear`, et le tirer d'un second `new Date()` rouvrirait exactement la fenêtre
    // du 31 décembre que cette variable existe pour fermer.
    const maintenant = useMemo(() => new Date(), []);
    const anneeFiscaleCourante = maintenant.getFullYear();
    const moisCourant = maintenant.getMonth();
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
        const money = (v: unknown) => isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(v);
        return [
            { key: 'age', label: 'Âge', format: (v) => v != null ? `${v} ans` : '' },
            { key: 'IncomeRetirement', label: 'Rente gouv. + PSV', format: money },
            { key: 'Income', label: 'Revenu total', format: money },
            { key: 'Expenses', label: 'Besoin (avec inflation)', format: money },
        ];
    }, [isPrivacyMode]);

    // G7c — zoom molette / pan sur les deux graphes Retraite (x = âge).
    const zoomAccum = useTimeChartZoom<PointAnnuel>(lifeExpectancyData as PointAnnuel[]);
    const zoomCashflow = useTimeChartZoom<PointAnnuel>(retirementData as PointAnnuel[]);
    const etroit = useViewportBelowLg();
    const bankruptcyAge = bankruptcyPoint?.age;

    // [REFONTE-NAV-L4] sous-onglet actif (idiome BudgetWorkspace, aucun état persisté).
    const [subTab, setSubTab] = useState<RetirementSubTab>('projection');

    // Mode strict : pas de projection = pas de données. Aucune invention.
    if (!hasProjection) {
        return (
            <div className="space-y-5 stagger-in pb-10">
                <PageHeader title={TAB_LABELS[Tab.RETIREMENT]} actions={<VieCurveLink />} />
                <ProjectionRequired feature="La simulation de retraite" />
            </div>
        );
    }

    // [S5-REFONTE-RETRAITE] En-tête des maquettes : onglets à côté du titre, puis le scénario et la
    // pastille « Tient jusqu'à N ans » (ou « Épuisé à N ans ») ; sur mobile, la pastille seule à droite
    // du titre, le scénario en petite ligne sous les onglets, le lien courbe en bas de page.
    const pastilleStatut = bankruptcyAge
        ? 'bg-danger-500/10 border-danger-400/30 text-danger-400'
        : 'bg-success-500/10 border-success-400/30 text-success-400';
    const statut = (
        <span className={`h-[30px] lg:h-9 px-2.5 lg:px-3.5 rounded-full border text-meta lg:text-[13px] font-semibold flex items-center whitespace-nowrap ${pastilleStatut}`}>
            {bankruptcyAge ? `Épuisé à ${bankruptcyAge} ans` : `Tient jusqu'à ${lifeExpectancy} ans`}
        </span>
    );
    const etiquette = 'text-meta xl:text-[11px] xl:font-semibold xl:tracking-[0.06em] xl:uppercase text-ink-400';
    const tuile = 'rounded-2xl bg-surface border border-white/6 p-3.5 xl:px-[18px] xl:py-4 flex flex-col gap-1 min-w-0';
    const valeur = 'font-mono xl:font-sans text-[18px] xl:text-[26px] font-bold xl:font-extrabold';
    const capitaux = [
        { libelle: 'REER', montant: liveCSVBalances.REER, couleur: 'text-[#7c93f2]' },
        { libelle: 'CELI', montant: liveCSVBalances.CELI, couleur: 'text-[#34b39a]' },
        { libelle: 'Non-enr.', montant: liveCSVBalances.NON_ENREG, couleur: 'text-[#d4a24c]' },
    ];

    return (
        <div className="space-y-5 stagger-in pb-10">
            {/* [PH2-c-2] — signal inter-onglets : dernier recalcul de projection échoué. */}
            <ProjectionStaleBanner />
            <PageHeader
                title={TAB_LABELS[Tab.RETIREMENT]}
                nav={
                    <SubTabs<RetirementSubTab>
                        idPrefix="retraite"
                        label="Sections Retraite"
                        tabs={RETIREMENT_SUB_TABS}
                        active={subTab}
                        onSelect={setSubTab}
                    />
                }
                actions={etroit ? statut : (
                    <span className="flex items-center gap-3">
                        {activeScenarioName && (
                            <span className="h-9 px-3.5 rounded-full bg-surface border border-white/8 text-ink-200 text-[13px] flex items-center whitespace-nowrap">Scénario : {activeScenarioName}</span>
                        )}
                        {statut}
                        <VieCurveLink />
                    </span>
                )}
            />
            {etroit && activeScenarioName && <p className="-mt-2 text-meta text-ink-400">Scénario : {activeScenarioName}</p>}

            <TabPanel idPrefix="retraite" tab="outils" when={subTab === 'outils'} className="space-y-5 focus-ring rounded-card">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                    {/* W1.5 — Goal Seeking + W2.6 Drawdown (extrait dans GoalSeekerCard) */}
                    <GoalSeekerCard
                        paramsBuilder={() => ({
                            projection, calculatedStartingCash, liveCSVBalances,
                            realEstateGoals, debts, childGoals, travelGoals, lifeEvents,
                            retirementGoal: goal, config,
                            baseGrossAnnual, baseNetAnnual,
                            currentRentExpense, baseMonthlyExpenses,
                            // [ENG-STARTYEAR-DEFAUT-2026] Ce site était le SEUL à omettre `startYear`,
                            // et il consommait donc le défaut `= 2026` du moteur : le chercheur
                            // d'objectif projetait depuis 2026 en dur, quelle que soit l'année réelle.
                            startYear: anneeFiscaleCourante, startMonth: moisCourant,
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

            <TabPanel idPrefix="retraite" tab="projection" when={subTab === 'projection'} className="space-y-5 focus-ring rounded-card">
                <section aria-label="Résumé" className="grid grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_1.4fr] gap-2.5 xl:gap-3.5">
                    <div className={`${tuile} col-span-2 xl:col-span-1`}>
                        <span className={etiquette}>Capital à la retraite ({goal.targetAge} ans)</span>
                        <PrivateAmount as="div" className={`${valeur} text-success-400 xl:text-ink-50`}>{formatCompactCAD(retirementNetWorth)}</PrivateAmount>
                    </div>
                    <div className={tuile}>
                        <span className={etiquette}>Pic du patrimoine</span>
                        <PrivateAmount as="div" className={`${valeur} text-ink-50`}>{formatCompactCAD(peakNetWorth)}</PrivateAmount>
                    </div>
                    <div className={tuile}>
                        <span className={etiquette}>Héritage ({lifeExpectancy} ans)</span>
                        {finalNetWorth > 0
                            ? <PrivateAmount as="div" className={`${valeur} text-ink-50`}>{formatCompactCAD(finalNetWorth)}</PrivateAmount>
                            : <div className={`${valeur} text-danger-400`}>Épuisé</div>}
                    </div>
                    <div className="col-span-2 xl:col-span-1 rounded-2xl bg-surface border border-white/6 p-4 xl:px-[18px] flex flex-col gap-3 xl:gap-2 min-w-0">
                        <span className="text-[11px] font-semibold tracking-[0.08em] xl:tracking-[0.06em] uppercase text-ink-400">Capitaux actuels</span>
                        <dl className="grid grid-cols-3 gap-2">
                            {capitaux.map((c) => (
                                <div key={c.libelle} className="flex flex-col gap-0.5 min-w-0">
                                    <dt className="text-meta text-ink-400">{c.libelle}</dt>
                                    <dd><PrivateAmount className={`font-mono text-[14px] font-semibold xl:font-bold ${c.couleur} xl:text-ink-50`}>{formatCAD(c.montant)}</PrivateAmount></dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                </section>

                <AccumulationDecaissement
                    donnees={lifeExpectancyData as PointAnnuel[]}
                    zoom={zoomAccum}
                    ageRetraite={goal.targetAge}
                    verrouillee={!!lockedCapitalByMonth}
                    colonnes={accumColumns}
                    isPrivacyMode={isPrivacyMode}
                    etroit={etroit}
                    infobulle={<RetirementTooltip />}
                />

                <FluxRetraite
                    donnees={retirementData as PointAnnuel[]}
                    zoom={zoomCashflow}
                    colonnes={cashflowColumns}
                    isPrivacyMode={isPrivacyMode}
                    etroit={etroit}
                />
            </TabPanel>

            {/* Mobile : le lien vers la courbe ferme la page, en pleine largeur (maquette M-retraite). */}
            {etroit && <div className="[&>button]:w-full"><VieCurveLink /></div>}
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
        <div className="bg-surface border border-white/10 p-4 rounded-xl shadow-2xl max-w-[280px] z-50">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/10">
                <span className="text-body font-bold text-ink-50">{data.age} ans</span>
                <span className={`text-meta font-bold px-2 py-1 rounded-md ${isRetired ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-info-500/10 text-info-400 border border-info-500/20'}`}>
                    {isRetired ? 'En retraite' : 'Accumulation'}
                </span>
            </div>

            <div className="mb-4 space-y-2">
                <div className="flex justify-between items-center">
                    <span className="text-tiny font-bold text-ink-300 uppercase tracking-widest">Patrimoine Net</span>
                    <PrivateAmount className="text-body font-black text-success-400">{formatCAD(data.NetWorth)}</PrivateAmount>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                        <div className="text-tiny text-primary font-bold mb-1">CELI</div>
                        <PrivateAmount as="div" className="text-meta font-black text-ink-50">{formatCAD(data.CELI)}</PrivateAmount>
                    </div>
                    <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                        <div className="text-tiny text-info-500 font-bold mb-1">REER</div>
                        <PrivateAmount as="div" className="text-meta font-black text-ink-50">{formatCAD(data.REER)}</PrivateAmount>
                    </div>
                    {/* Revue #245 (a11y S1) — CELIAPP visible au stack doit avoir sa valeur TEXTE ici. */}
                    {(data.CELIAPP || 0) > 0 && (
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                            <div className="text-tiny text-[#2dd4bf] font-bold mb-1">CELIAPP</div>
                            <PrivateAmount as="div" className="text-meta font-black text-ink-50">{formatCAD(data.CELIAPP)}</PrivateAmount>
                        </div>
                    )}
                    {(data.NonReg || 0) > 0 && (
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                            <div className="text-tiny text-warning-500 font-bold mb-1">Non-Enreg.</div>
                            <PrivateAmount as="div" className="text-meta font-black text-ink-50">{formatCAD(data.NonReg)}</PrivateAmount>
                        </div>
                    )}
                    <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                        <div className="text-tiny text-[#9b8fcf] font-bold mb-1">Liquidites</div>
                        <PrivateAmount as="div" className="text-meta font-black text-ink-50">{formatCAD(data.Liquidites)}</PrivateAmount>
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
