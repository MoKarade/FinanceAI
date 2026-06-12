import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Card } from './ui/Card';
import { PageHeader } from './ui/PageHeader';
import { KPIStat } from './ui/KPIStat';
import { StatGrid } from './ui/StatGrid';
import { Pill } from './ui/Pill';
import { Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ReferenceArea, Line, ComposedChart, Bar, ReferenceDot } from 'recharts';
import { BudgetConfig, BudgetCategory, RealEstateGoal, RetirementGoal, Transaction, ProjectionConfig } from '../types';
import { ProjectionResult, ProjectionChartPoint } from '../services/projection/types';
import { useFinanceStore } from '../store/useFinanceStore';
import { usePendingFocus } from '../utils/usePendingFocus';
import { buildLockedByMonth } from '../utils/lockedCurveOverlay';

// Sprint 2 PH2 — constante stable pour éviter de créer un nouveau [] à chaque
// render (qui invaliderait les useMemo deps en aval).
const EMPTY_ARRAY: never[] = [];
import { Tab as TabEnum } from '../types';
import { ExpertTooltip, ClickableEventIcon, RefLineLabel } from './projection/ProjectionTooltip';
import { FutureDetailModal } from './projection/FutureDetailModal';
import { useTimeChartZoom } from '../hooks/useTimeChartZoom';
import { ProjectionControls } from './projection/ProjectionControls';
import { useSimulationParams } from '../hooks/useSimulationParams';
import { reconstructCashHistory } from '../services/history/reconstructCashHistory';
import { reconstructRealEstateEquityByYear } from '../services/history/reconstructRealEstateEquity';
import { ActionPlanDrilldown } from './projection/ActionPlanDrilldown';
import { ProjectionExplains } from './projection/ProjectionExplains';
import { StrategyOptimizerPanel } from './projection/StrategyOptimizerPanel';
import { StressTestPanel } from './projection/StressTestPanel';
import { CollapsibleSection } from './ui/CollapsibleSection';
import { applyConfigToSettings, type StrategyConfig } from '../services/projection/strategyConfig';

// G10 — Légende interactive : une seule source de vérité pour les chips ET les
// gardes de visibilité dans le graphique. `key` correspond au dataKey recharts
// (ou à un groupe logique : 'montecarlo', 'events', 'fire', 'aujourdhui').
type LegendShape = 'area' | 'line' | 'bar' | 'dashed' | 'dot';
interface FutureLegendItem {
    key: string;
    label: string;
    color: string;
    shape: LegendShape;
    mcOnly?: boolean; // n'apparaît que si Monte Carlo est activé
}
const FUTURE_LEGEND_ITEMS: FutureLegendItem[] = [
    { key: 'Liquidites', label: 'Cash', color: '#4b5563', shape: 'area' },
    { key: 'CELI', label: 'CELI', color: '#10b981', shape: 'area' },
    { key: 'CELIAPP', label: 'CELIAPP (FHSA)', color: '#2dd4bf', shape: 'area' },
    { key: 'REER', label: 'REER', color: '#3b82f6', shape: 'area' },
    { key: 'REEE', label: 'REEE', color: '#06b6d4', shape: 'area' },
    { key: 'NonReg', label: 'Non-Enreg', color: '#f59e0b', shape: 'area' },
    { key: 'Crypto', label: 'Crypto', color: '#a855f7', shape: 'area' },
    { key: 'Immobilier', label: 'Équité Immo', color: '#ec4899', shape: 'area' },
    { key: 'NetWorth', label: 'Valeur Nette', color: '#ffffff', shape: 'line' },
    { key: 'ImpotLatent', label: 'Impôt Latent', color: '#ef4444', shape: 'dashed' },
    { key: 'FluxImpots', label: 'Paiement Impôts', color: '#ef4444', shape: 'bar' },
    { key: 'montecarlo', label: 'Monte Carlo (P10–P90)', color: '#3b82f6', shape: 'dashed', mcOnly: true },
    { key: 'events', label: 'Événements / icônes', color: '#e5e7eb', shape: 'dot' },
    { key: 'fire', label: 'Objectif FIRE', color: '#f97316', shape: 'dashed' },
    { key: 'aujourdhui', label: "Aujourd'hui", color: '#ffffff', shape: 'dashed' },
];

const LegendSwatch: React.FC<{ shape: LegendShape; color: string; dimmed?: boolean }> = ({ shape, color, dimmed }) => {
    const style = { backgroundColor: color, opacity: dimmed ? 0.4 : 1 } as React.CSSProperties;
    if (shape === 'line') return <span className="w-4 h-[3px] rounded-full shrink-0" style={style} aria-hidden="true" />;
    if (shape === 'bar') return <span className="w-1.5 h-3 rounded-sm shrink-0" style={style} aria-hidden="true" />;
    if (shape === 'dot') return <span className="w-2.5 h-2.5 rounded-full shrink-0" style={style} aria-hidden="true" />;
    if (shape === 'dashed') return <span className="w-4 h-0 shrink-0 border-t-2 border-dashed" style={{ borderColor: color, opacity: dimmed ? 0.4 : 1 }} aria-hidden="true" />;
    return <span className="w-3 h-3 rounded shrink-0" style={style} aria-hidden="true" />;
};

interface FutureProjectionProps {
  initialBalances: Record<string, number>;
  transactions: Transaction[];
  budgetItems: BudgetCategory[];
  config: BudgetConfig;
  realEstateGoals: RealEstateGoal[];
  setRealEstateGoals?: (g: RealEstateGoal[]) => void;
  retirementGoal: RetirementGoal;
  setRetirementGoal?: (g: RetirementGoal) => void;
  calculatedMonthlySavings: number;
  projection: ProjectionConfig;
  setProjection: (p: ProjectionConfig) => void;
  isPrivacyMode?: boolean;
}

export const FutureProjection: React.FC<FutureProjectionProps> = ({
    initialBalances = {}, transactions = [], budgetItems = [], config,
    realEstateGoals = [], setRealEstateGoals, retirementGoal, setRetirementGoal,
    calculatedMonthlySavings, projection, setProjection, isPrivacyMode = false
}) => {
    // C6 fix (Sprint 1B) — La garde SAFETY CHECKS qui retournait du JSX avant
    // tous les hooks ci-dessous était une violation flagrante de la règle des
    // Hooks (21 violations remontées par ESLint react-hooks/rules-of-hooks).
    // Si les props passaient d'un état non-init à init entre 2 renders, l'ordre
    // des hooks se décalait → panique React, state corrompu.
    //
    // Fix : la garde est déplacée APRÈS tous les hooks, juste avant le return
    // JSX final. Les hooks tolèrent les props undefined via `?.` et `|| 0`
    // (déjà en place avant ce fix). Voir guard early-return ligne ~285.

    const updateProj = <K extends keyof ProjectionConfig>(key: K, val: ProjectionConfig[K]) => {
        setProjection({ ...projection, [key]: val });
    };

    const updateReturnRate = (key: string, val: number) => {
        setProjection({
            ...projection,
            returnRates: { ...(projection.returnRates || { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 }), [key]: val }
        });
    };

    // baseNetAnnual / baseMonthlyExpenses / currentRentExpense ont migré dans
    // l'adaptateur pur buildSimulationParams (Lot 0) — plus recalculés ici.
    // [EP-10] baseGrossAnnual retiré avec AssetLocationPanel (son seul consommateur).

    // A1/A3 — Soldes de placement de DÉPART du futur, dérivés de la MÊME
    // reconstruction que la courbe passée (usePastPortfolioHistory) → garantit la
    // continuité passé↔futur au mois 0 (le futur démarre sur le portefeuille réel).
    //
    // Bug historique (la « falaise ») : ces soldes étaient peuplés par un effet qui
    // appelait fetchPortfolioHistory() — un stub mort renvoyant toujours [] — donc
    // setLiveCSVBalances n'était JAMAIS appelé et le futur démarrait avec ZÉRO
    // placement (REER/CELI/NonReg = 0), pendant que le passé affichait le vrai
    // portefeuille (centaines de k$). Le futur perdait donc tout le portefeuille
    // au mois 0, pour TOUS les personas/utilisateurs (et en mode réel aussi).
    // PH2-c (clé de voûte) — params + dérivations passé/présent depuis la SOURCE UNIQUE partagée
    // avec le moteur app-level (hooks/useSimulationParams). `params` sert ICI uniquement aux outils
    // EN AMONT (écran d'amorçage « leviers-d'abord » : StrategyOptimizerPanel + StressTestPanel) ; le calcul de
    // la courbe principale, lui, est fait par ProjectionEngine et lu via store.lastProjection.
    const { params, pastHistory, liveCSVBalances, calculatedStartingCash, startYear, startMonth, todayMonthIndex } = useSimulationParams(calculatedMonthlySavings);

    const applyHistoricalRate = () => {
        if (liveCSVBalances.historicalRate > 0) {
            const rate = Number(liveCSVBalances.historicalRate.toFixed(1));
            setProjection({
                ...projection,
                returnRates: { ...projection.returnRates, celi: rate, reer: rate, nonReg: rate, crypto: rate, cash: 3 }
            });
        }
    };

    // [UI-SCEN] — plus de sélecteur d'index de scénario : la stratégie est un PARAMÈTRE
    // (projection.withdrawalStrategy) ; le moteur ne calcule que ce scénario (allResults[0]).
    // PH2-a — runMC REMONTÉ dans le store : le toggle Monte-Carlo survit aux changements
    // d'onglet (ne se réinitialise plus au retour sur Futur) et au reload.
    const runMC = useFinanceStore(s => s.projectionRunMC);
    const setRunMC = useFinanceStore(s => s.setProjectionRunMC);

    // W5.x — Conteneurs étendus câblés au moteur
    // Phase B2 — consomme un éventuel deep-link entrant (cf docs/UI_REFOUNDATION_PLAN.md §5)
    usePendingFocus(TabEnum.FUTURE);

    // PH2-c (clé de voûte) — le CALCUL de la projection a déménagé dans le moteur app-level
    // (components/ProjectionEngine.tsx + hooks/useSimulationParams.ts, monté dans App). Ce
    // composant ne construit plus `params` ni n'appelle calculateFutureProjection : il LIT le
    // résultat publié dans store.lastProjection (source unique, toujours peuplée quel que soit
    // l'onglet). Les dérivations passé/présent ci-dessus (pastHistory, liveCSVBalances, startYear…)
    // restent ici : elles servent l'AFFICHAGE (préfixe « passé réel », ligne « aujourd'hui »).

    // PH2-c (clé de voûte) — le CALCUL a déménagé dans le moteur app-level (ProjectionEngine,
    // monté dans App). Ce composant ne calcule plus : `isComputing`/`hasError` reflètent le
    // statut du moteur publié dans le store, lus par l'UI (bouton « calcul en cours », overlay,
    // garde d'erreur).
    const isComputing = useFinanceStore(s => s.projectionStatus === 'computing');
    const hasError = useFinanceStore(s => s.projectionStatus === 'error');

    // PH2-c — résultat LU depuis la SOURCE UNIQUE (publiée par ProjectionEngine, app-level).
    // Plus aucun calcul ni repli local : la courbe affichée EST celle du moteur.
    const results = useFinanceStore(s => s.lastProjection);
    const { chartData = [] as ProjectionChartPoint[], fireNumber = 0, allResults = [] as ProjectionResult[] } = results ?? {};

    // PH2-d — courbe VERROUILLÉE (référence figée) : lue du store ; le moteur continue de publier
    // `results` en direct (aperçu). Verrouiller/déverrouiller = snapshot + persistance IndexedDB.
    const lockedProjection = useFinanceStore(s => s.lockedProjection);
    const isProjectionLocked = useFinanceStore(s => s.isProjectionLocked);
    const lockProjection = useFinanceStore(s => s.lockProjection);
    const unlockProjection = useFinanceStore(s => s.unlockProjection);

    // G21 C5 + [UI-SCEN] — « Appliquer » la stratégie gagnante de l'optimiseur aux
    // paramètres réels : leviers orthogonaux via setters, ordre de retrait via le
    // PARAMÈTRE withdrawalStrategy, report des rentes via rrqStartAge/psvStartAge (#210).
    const handleApplyConfig = (config: StrategyConfig) => {
        const applied = applyConfigToSettings(config, projection, retirementGoal);
        // [UI-SCEN] — l'ordre de retrait devient le PARAMÈTRE withdrawalStrategy (plus de
        // sélection de scénario) ; le report des rentes passe par les âges de début #210
        // (rrqStartAge 72 / psvStartAge 70), cohérent avec le levier delayPensions du moteur.
        setProjection({
            ...applied.projection,
            withdrawalStrategy: applied.strategy as ProjectionConfig['withdrawalStrategy'],
        });
        // delayPensions=false RÉINITIALISE les âges (sinon un « Appliquer » précédent avec
        // report laisserait 72/70 en place — plan incohérent avec la config affichée).
        setRetirementGoal?.(applied.delayPensions
            ? { ...applied.retirementGoal, rrqStartAge: 72, psvStartAge: 70 }
            : { ...applied.retirementGoal, rrqStartAge: undefined, psvStartAge: undefined });
    };

    // A1/A3 — passé réel reconstruit (valeur marché des placements) préfixé au
    // graphe AVANT le début de projection (monthIndex < 0), sans toucher au futur
    // (événements, lignes de référence, sélecteur de période restent intacts).
    // On n'y trace QUE les comptes de placement (pas de fausse « valeur nette
    // totale » : le cash/immo passé n'est pas reconstruit).
    // G22-B1 — VALEUR NETTE passée complète : placements (reconstruits) + cash
    // (flux de transactions à rebours) + équité immo (amortissement). La ligne VN
    // ne démarre qu'à la 1re transaction connue (avant = données cash inconnues,
    // VN laissée vide → pas de fausse ligne à 0). Carry-forward des placements pour
    // une courbe continue. Le cash actuel = cash au début de projection (jan 2026).
    // (pastHistory est déclaré plus haut — il sert aussi à amorcer liveCSVBalances.)
    const pastPrefix = useMemo(() => {
        const miOf = (ym: string): number => {
            const [y, m] = ym.split('-').map(Number);
            // Index relatif au DÉBUT de projection (mois 0 = startYear/startMonth).
            // Le « -startMonth » est indispensable quand la projection démarre ≠ janvier.
            return (y - startYear) * 12 + (m - 1 - startMonth);
        };
        const nowMonthKey = `${startYear}-${String(startMonth + 1).padStart(2, '0')}`;
        const cashRes = reconstructCashHistory(transactions, calculatedStartingCash || 0, nowMonthKey);
        const equityByYear = reconstructRealEstateEquityByYear(realEstateGoals, startYear);

        const invByMi = new Map<number, import('../services/history/reconstructPortfolioHistory').PortfolioHistoryPoint>();
        for (const p of pastHistory.points) {
            const mi = miOf(p.date);
            if (mi < 0) invByMi.set(mi, p);
        }
        const cashByMi = new Map<number, number>();
        for (const c of cashRes.points) {
            const mi = miOf(c.month);
            if (mi < 0) cashByMi.set(mi, c.cash);
        }
        const mis = [...invByMi.keys(), ...cashByMi.keys()];
        if (mis.length === 0) return EMPTY_ARRAY;
        const minMi = Math.min(...mis);
        const firstTxnMi = cashRes.firstMonth ? miOf(cashRes.firstMonth) : 1; // 1 = jamais de passé connu

        type InvPoint = import('../services/history/reconstructPortfolioHistory').PortfolioHistoryPoint;
        type PastPrefixPoint = { monthIndex: number; year: number; dateLabel: string; Liquidites: number; Immobilier: number; CELI: number; CELIAPP: number; REER: number; REEE: number; NonReg: number; Crypto: number; NetWorth: number | undefined; isPast: boolean };
        const out: PastPrefixPoint[] = [];
        let lastInv: InvPoint | null = null;
        for (let mi = minMi; mi < 0; mi++) {
            const invHere = invByMi.get(mi);
            if (invHere) lastInv = invHere;
            const inv = invHere ?? lastInv;
            const cash = cashByMi.get(mi);
            // Date calendaire réelle du point = startMonth + mi (mi est négatif au
            // passé). Le « + startMonth » est indispensable quand la projection
            // démarre ≠ janvier, sinon les libellés de date du passé sont décalés.
            const absMonth = startMonth + mi;
            const year = startYear + Math.floor(absMonth / 12);
            const month = (((absMonth % 12) + 12) % 12) + 1;
            const immo = equityByYear.get(year) ?? 0;
            const celi = inv?.CELI ?? 0, celiapp = inv?.CELIAPP ?? 0, reer = inv?.REER ?? 0,
                reee = inv?.REEE ?? 0, nonReg = inv?.NonReg ?? 0, crypto = inv?.Crypto ?? 0;
            const hasNW = mi >= firstTxnMi; // VN seulement à partir de la 1re transaction connue
            const investSum = celi + celiapp + reer + reee + nonReg + crypto;
            out.push({
                monthIndex: mi,
                year,
                dateLabel: `${year}-${String(month).padStart(2, '0')}`,
                Liquidites: hasNW ? (cash ?? 0) : 0,
                Immobilier: immo,
                CELI: celi, CELIAPP: celiapp, REER: reer, REEE: reee, NonReg: nonReg, Crypto: crypto,
                NetWorth: hasNW ? Math.round(investSum + (cash ?? 0) + immo) : undefined,
                isPast: true,
            });
        }
        return out;
    }, [pastHistory.points, startYear, startMonth, transactions, calculatedStartingCash, realEstateGoals]);
    // PH2-d — index NetWorth de la courbe VERROUILLÉE par monthIndex (référence à superposer).
    const lockedByMonth = useMemo(
        () => buildLockedByMonth(lockedProjection, isProjectionLocked, (p) => p.NetWorth ?? NaN),
        [isProjectionLocked, lockedProjection],
    );
    const displayData = useMemo(() => {
        const base = pastPrefix.length ? [...pastPrefix, ...chartData] : chartData;
        // Sous verrou : on ajoute `lockedNetWorth` à chaque point (référence figée) → 2e courbe tracée.
        if (!lockedByMonth) return base;
        return base.map((d) => ({ ...d, lockedNetWorth: lockedByMonth.get((d as { monthIndex: number }).monthIndex) }));
    }, [pastPrefix, chartData, lockedByMonth]);
    const pastStartIndex = pastPrefix.length ? pastPrefix[0].monthIndex : 0;

    // PH2-c — la PUBLICATION dans store.lastProjection est faite par ProjectionEngine (app-level),
    // plus par ce composant. Futur est désormais un pur CONSOMMATEUR de la source unique.

    // G5 — un événement = une pastille (plus de fusion « A | B | C »). On garde
    // year/age/dateLabel par événement pour la fiche au clic, et `subIdx` pour
    // empiler verticalement les événements d'un même mois.
    const { lifeChartEvents, flowChartEvents } = useMemo(() => {
        type ChartEvent = { monthIndex: number; year: number | undefined; age: number | undefined; dateLabel: string | undefined; val: number | undefined; netWorth: number | undefined; label: string; subIdx: number; index: number; kind: 'life' | 'flow' };
        const lifes: ChartEvent[] = [];
        const flows: ChartEvent[] = [];
        let lifeIdx = 0;
        let flowIdx = 0;
        // Anti-spam : le moteur ré-émet certains labels (renouvellements, stress
        // tests) plusieurs mois d'affilée. On collapse les répétitions du même
        // label rapprochées (≤ DEDUP_GAP mois) pour ne garder qu'une pastille.
        const DEDUP_GAP = 3;
        const lastLife: Record<string, number> = {};
        const lastFlow: Record<string, number> = {};
        chartData.forEach((d: ProjectionChartPoint) => {
            const meta = { monthIndex: d.monthIndex, year: d.year, age: d.age, dateLabel: d.dateLabel };
            let lifeSub = 0;
            (d.lifeEvents || []).forEach((label: string) => {
                if (lastLife[label] != null && d.monthIndex - lastLife[label] <= DEDUP_GAP) return;
                lastLife[label] = d.monthIndex;
                lifes.push({ ...meta, val: d.NetWorth, netWorth: d.NetWorth, label, subIdx: lifeSub++, index: lifeIdx++, kind: 'life' });
            });
            if ((d.flowEvents?.length ?? 0) > 0 && ((d.FluxImpots ?? 0) < 0 || (d.flowEvents || []).some((x: string) => x.includes('-')))) {
                let flowSub = 0;
                (d.flowEvents || []).forEach((label: string) => {
                    if (lastFlow[label] != null && d.monthIndex - lastFlow[label] <= DEDUP_GAP) return;
                    lastFlow[label] = d.monthIndex;
                    flows.push({ ...meta, val: d.ImpotLatent || 0, netWorth: d.NetWorth, label, subIdx: flowSub++, index: flowIdx++, kind: 'flow' });
                });
            }
        });
        return { lifeChartEvents: lifes, flowChartEvents: flows };
    }, [chartData]);

    // G3 + PH4-FUT « leviers-d'abord » — 3 sous-onglets : Projection (composeur de leviers EN AMONT puis
    // courbe + KPIs) ; Paramètres (hypothèses) ; Plan d'action (explications + checklist). Plus d'onglet
    // « Optimisation » : le composeur de leviers est remonté dans l'écran d'amorçage du sous-onglet Projection.
    // PH4-FUT « leviers-d'abord » — sous-onglet « Optimisation » RETIRÉ : le composeur de leviers est
    // remonté dans l'écran d'amorçage du Graphique (en amont du calcul).
    const [futureSubTab, setFutureSubTab] = useState<'graph' | 'params' | 'plan'>('graph');
    // PH4 (refonte Futur « leviers-d'abord », demande Marc) — la courbe ET les KPIs ne s'affichent
    // QUE sur un calcul EXPLICITE. Avant : le moteur app-level recalculait en continu et la courbe +
    // le bandeau KPI s'affichaient tout seuls (« le graphique s'applique alors que j'ai pas fait les
    // calculs avec les leviers »). On lie la révélation à une SIGNATURE de ce qui PILOTE la courbe :
    //   - jamais calculé (revealedSig null)         → écran d'invite « Calculer » ;
    //   - calculé PUIS une entrée a changé (sig ≠)  → état PÉRIMÉ → ré-invite « Recalculer » ;
    //   - sig identique                             → révélé (courbe + KPIs).
    // Revue PH4 (MAJEUR) — on signe `params` ENTIER (la source UNIQUE qui pilote le moteur app-level,
    // agrégeant les ~20 entrées du store : projection, config, dettes, objectifs, événements, budget,
    // splitMode, soldes…) et NON un sous-ensemble cueilli à la main — sinon la courbe se remettrait à
    // jour seule pour toute entrée non listée (le bug exact que PH4 tue). `params` est mémoïsé par
    // référence dans useSimulationParams → le stringify ne se refait qu'au vrai changement. Conséquence
    // assumée : l'arrivée tardive des prix (liveCSVBalances ⊂ params) marque « périmé » une fois —
    // cohérent (les chiffres ont changé), et au pire avant le 1er clic.
    // Local au composant (zéro persist) : survit aux bascules de SOUS-onglets ; un aller-retour vers
    // un autre onglet principal ré-invite — cohérent avec « seulement sur clic ».
    const currentSig = useMemo<string | null>(() => {
        try { return JSON.stringify({ p: params, mc: runMC }); }
        catch { return null; } // illisible (inatteignable : params est sérialisable) → jamais révélé
    }, [params, runMC]);
    const [revealedSig, setRevealedSig] = useState<string | null>(null);
    const curveRevealed = revealedSig !== null && currentSig !== null && revealedSig === currentSig;
    const isStale = revealedSig !== null && revealedSig !== currentSig; // calculé, puis entrées modifiées
    const revealCurve = () => setRevealedSig(currentSig);
    // PH4-FUT (leviers-d'abord) — « Appliquer la stratégie gagnante PUIS révéler la courbe » : on ne peut
    // pas figer la signature dans le même tick que l'application (les params changent juste après).
    // Un flag déclenche la révélation au render SUIVANT, quand currentSig reflète les params appliqués.
    // Invariant : handleApplyConfig fait 2 setAppState (projection + retirementGoal) BATCHÉS en 1 render
    // (handler synchrone, React 19) → currentSig recalculé une seule fois, COMPLET (pas de sig intermédiaire,
    // pas de flash). ⚠️ Si un de ces set devenait async, ce flux re-cacherait la courbe (revue PH4-FUT).
    const [revealAfterApply, setRevealAfterApply] = useState(false);
    useEffect(() => {
        if (revealAfterApply) { setRevealedSig(currentSig); setRevealAfterApply(false); }
    }, [revealAfterApply, currentSig]);
    const applyAndReveal = (cfg: StrategyConfig) => { handleApplyConfig(cfg); setRevealAfterApply(true); };
    // A11y : à la révélation, déplacer le focus sur la zone courbe (le bouton « Calculer » se
    // démonte → sinon le focus retombe sur <body> et le lecteur d'écran perd le contexte).
    const revealedRef = useRef<HTMLDivElement>(null);
    useEffect(() => { if (curveRevealed) revealedRef.current?.focus(); }, [curveRevealed]);

    // [UI-SCEN] — bandeau « Verdict » et classement retirés : la comparaison des façons
    // de gérer vit dans l'écran d'amorçage « leviers-d'abord » (StrategyOptimizerPanel).

    // F10 (audit 2026-05-28) — index monthIndex → année pour le tickFormatter du XAxis.
    // Avant : displayData.find() O(n) à CHAQUE tick, et recharts ré-appelle le formatter
    // pendant le zoom/pan → O(ticks × n) par frame. Map O(1) mémoïsée sur displayData.
    const monthIndexToYear = useMemo(() => {
        const map = new Map<number, number>();
        for (const d of displayData as ProjectionChartPoint[]) {
            if (d.year !== undefined) map.set(d.monthIndex, d.year);
        }
        return map;
    }, [displayData]);

    // G4 — zoom molette / pan / sélecteur de période sur la courbe (remplace <Brush>).
    // A3 — consomme displayData (passé réel préfixé + futur projeté).
    const zoom = useTimeChartZoom<ProjectionChartPoint>(displayData as ProjectionChartPoint[]);

    // G5 — événement sélectionné (clic sur une pastille) → fiche détail.
    const [detailPoint, setDetailPoint] = useState<ProjectionChartPoint | null>(null);

    // G10 — légende interactive : on stocke les séries MASQUÉES (le delta vs
    // défaut « tout visible »), persistées en localStorage. Même convention que
    // Dashboard (`dashboard:hiddenAccounts:v1`) : persistance dans le setter.
    const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(() => {
        try {
            const raw = localStorage.getItem('future:hiddenSeries:v1');
            return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
        } catch { return new Set<string>(); }
    });
    const isVisible = (key: string) => !hiddenSeries.has(key);
    const toggleSeries = (key: string) => {
        setHiddenSeries((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            try { localStorage.setItem('future:hiddenSeries:v1', JSON.stringify([...next])); } catch {/* localStorage indispo */}
            return next;
        });
    };
    const showAllSeries = () => {
        setHiddenSeries(new Set());
        try { localStorage.setItem('future:hiddenSeries:v1', '[]'); } catch {/* localStorage indispo */}
    };

    // G12 — clic n'importe où sur le graphique → modale détail (pas seulement
    // sur une pastille d'événement). On résout le mois cliqué par GÉOMÉTRIE :
    // position X du clic relative à la grille cartésienne → indice dans la
    // tranche visible. Robuste (marche au tactile, sans survol préalable, là où
    // recharts ne déclenche pas son `onClick` interne — la cause probable du bug
    // « seul le clic sur un événement marche »). `lastHoverPointRef` (rempli par
    // le survol recharts) sert de repli. On ignore les glissers (pan) via la
    // distance parcourue depuis le mousedown.
    const lastHoverPointRef = useRef<ProjectionChartPoint | null>(null);
    const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);
    const handleChartContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const down = pointerDownPosRef.current;
        if (down && (Math.abs(e.clientX - down.x) > 6 || Math.abs(e.clientY - down.y) > 6)) return; // glisser = pan
        const data = zoom.visibleData;
        if (!data.length) return;
        const grid = zoom.containerEl.current?.querySelector('.recharts-cartesian-grid');
        const rect = grid?.getBoundingClientRect();
        let point: ProjectionChartPoint | null | undefined = null;
        if (rect && rect.width > 0) {
            const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            point = data[Math.round(frac * (data.length - 1))];
        }
        if (!point) point = lastHoverPointRef.current; // repli : dernier point survolé
        if (point) setDetailPoint(point);
    };

    // C6 fix (Sprint 1B) — Garde déplacée ICI (après tous les hooks) pour
    // respecter la règle des Hooks. Retourne un placeholder UI si les props
    // critiques manquent. Avant ce fix, cette garde était ligne 46 (avant les
    // 21 hooks ci-dessus) → 21 violations react-hooks/rules-of-hooks.
    if (!budgetItems || !projection || !config || !initialBalances) {
        console.error("FutureProjection: Missing critical initialization data.", { budgetItems, projection, config, initialBalances });
        return <div className="p-8 text-center text-red-400 font-bold bg-surface/50 rounded-2xl border border-red-500/20">
            ⚠️ Données d'initialisation manquantes. Veuillez vérifier vos comptes et votre budget.
        </div>;
    }

    // F1 (audit 2026-05-28) + PH2-c — projection plantée : le moteur app-level (ProjectionEngine)
    // ne publie PAS un résultat en erreur dans store.lastProjection (no-fake-data) ; il bascule
    // `projectionStatus` à 'error'. On affiche donc une erreur honnête depuis ce statut plutôt que
    // de rendre un graphe à $0. Dashboard/Investments/Budget gardent la dernière projection valide.
    if (hasError) {
        return <div className="p-8 text-center bg-surface/50 rounded-2xl border border-red-500/20 space-y-2">
            <div className="text-2xl" aria-hidden="true">⚠️</div>
            <div className="text-red-400 font-bold">Le calcul de la projection a échoué.</div>
            <div className="text-sm text-ink-300 max-w-md mx-auto">
                Vérifie tes paramètres (revenus, dépenses, comptes, objectifs). L'erreur a été
                journalisée.{runMC ? ' Tu peux aussi désactiver le mode Monte-Carlo et réessayer.' : ''}
            </div>
        </div>;
    }

    // G4/G5 — fenêtre visible (en monthIndex) pour ne tracer que les événements
    // dans la plage zoomée et borner le sélecteur de période.
    const visMinMonth = zoom.visibleData[0]?.monthIndex ?? Number.NEGATIVE_INFINITY;
    const visMaxMonth = zoom.visibleData[zoom.visibleData.length - 1]?.monthIndex ?? Number.POSITIVE_INFINITY;
    const visibleLifeEvents = lifeChartEvents.filter((e) => e.monthIndex >= visMinMonth && e.monthIndex <= visMaxMonth);
    const visibleFlowEvents = flowChartEvents.filter((e) => e.monthIndex >= visMinMonth && e.monthIndex <= visMaxMonth);
    // Plafond de densité : en vue large on échantillonne uniformément (lisibilité
    // + fluidité). En zoomant, la fenêtre contient moins d'événements → tous visibles.
    const thinEvents = <T,>(arr: T[], cap: number): T[] => {
        if (arr.length <= cap) return arr;
        const step = Math.ceil(arr.length / cap);
        return arr.filter((_, i) => i % step === 0);
    };
    const shownLifeEvents = thinEvents(visibleLifeEvents, 40);
    const shownFlowEvents = thinEvents(visibleFlowEvents, 24);
    const lastMonthIndex = chartData.length > 0 ? chartData[chartData.length - 1].monthIndex : 0;
    const idxForYears = (yrs: number) => {
        const i = chartData.findIndex((d: ProjectionChartPoint) => d.monthIndex >= yrs * 12);
        return i === -1 ? chartData.length - 1 : i;
    };

    return (
        <div className="space-y-6 animate-fade-in pb-24">

            <PageHeader
                icon="🔮"
                title="Projection Future"
                subtitle="Analyse des flux mensuels projetés avec Loyer → Hypothèque automatique et frais enfants dynamiques."
                actions={
                    <Pill
                        aria-label="Mode de données"
                        size="sm"
                        value={projection.useTheoretical ? 'sandbox' : 'real'}
                        onChange={(v) => updateProj('useTheoretical', v === 'sandbox')}
                        options={[
                            { value: 'real', label: 'Données Réelles', icon: '🔗' },
                            { value: 'sandbox', label: 'Sandbox', icon: '🧪' },
                        ]}
                    />
                }
            />

            {/* Hero KPI strip — PH4 : caché tant que la projection n'est pas calculée explicitement
                (cf revealedSig) ; sinon les chiffres projetés s'affichaient sans geste de l'utilisateur. */}
            {curveRevealed && (
            <StatGrid cols={4}>
                <KPIStat
                    label="Objectif FIRE"
                    icon="🎯"
                    value={`${(fireNumber / 1000).toFixed(0)}k $`}
                    sublabel="Règle des 4%"
                    privacy
                    variant="warning"
                />
                <KPIStat
                    label="Patrimoine projeté"
                    icon="💼"
                    // Fallback : si estateNetWorth est 0 (rare en réalité ou bug
                    // silencieux du moteur), utiliser finalNetWorth puis fireNumber
                    // comme proxy. Évite d'afficher "0.00M$" trompeur en mode test.
                    value={`${(((results?.estateNetWorth || results?.finalNetWorth || results?.fireNumber) || 0) / 1000000).toFixed(2)}M $`}
                    sublabel={`Fin de l'horizon (${projection.years || 30} ans)`}
                    privacy
                    variant="primary"
                />
                <KPIStat
                    label="Taux de succès"
                    icon="✓"
                    value={results?.successRate != null ? `${results.successRate}%` : '—'}
                    sublabel={runMC ? 'Monte Carlo (100 itér.)' : 'Active MC pour calculer'}
                    variant={results?.successRate != null && results.successRate >= 80 ? 'success' : results?.successRate != null && results.successRate >= 50 ? 'warning' : 'danger'}
                />
                <KPIStat
                    label="Vitalité financière"
                    icon="🌡️"
                    value={results?.fvi != null ? `${results.fvi}/100` : '—'}
                    sublabel={runMC ? '30/30/20/20 split' : 'Active MC pour calculer'}
                    variant={results?.fvi != null && results.fvi >= 70 ? 'success' : results?.fvi != null && results.fvi >= 40 ? 'warning' : 'danger'}
                />
            </StatGrid>
            )}
            {/* PH4-FUT « leviers-d'abord » — 3 sous-onglets : Projection / Paramètres / Plan d'action */}
            <div className="flex flex-wrap gap-1 p-1 rounded-card bg-surface/40 border border-white/5 w-fit" role="tablist" aria-label="Vue Future">
                {([
                    { id: 'graph', emoji: '🎯', label: 'Projection' },
                    { id: 'params', emoji: '⚙️', label: 'Paramètres' },
                    { id: 'plan', emoji: '🗂️', label: 'Plan d\'action' },
                ] as const).map(t => (
                    <button
                        key={t.id}
                        type="button" role="tab" aria-selected={futureSubTab === t.id}
                        onClick={() => setFutureSubTab(t.id)}
                        className={`px-4 py-1.5 rounded-card text-meta font-bold transition-colors focus-ring ${futureSubTab === t.id ? 'bg-primary text-dark' : 'text-ink-300 hover:text-ink-100'}`}
                    >
                        <span aria-hidden="true" className="mr-1">{t.emoji}</span>{t.label}
                    </button>
                ))}
            </div>

            {futureSubTab === 'params' && (
            <ProjectionControls
                projection={projection}
                updateProj={updateProj}
                updateReturnRate={updateReturnRate}
                runMC={runMC}
                setRunMC={setRunMC}
                isComputing={isComputing}
                fireNumber={fireNumber}
                liveCSVBalances={liveCSVBalances}
                applyHistoricalRate={applyHistoricalRate}
                realEstateGoals={realEstateGoals}
                setRealEstateGoals={setRealEstateGoals}
                config={config}
            />
            )}

            {/* Écran d'invite : tant que la courbe n'est pas révélée (jamais calculée OU entrées
                modifiées depuis le dernier calcul), on invite à (re)calculer — jamais de courbe auto. */}
            {/* PH4-FUT « leviers-d'abord » : le composeur de leviers est REMONTÉ EN AMONT (avant tout
                calcul). On compose ses leviers, on cherche la meilleure combo, on l'applique → la courbe
                affichée = la MEILLEURE selon les leviers. Plus de sous-onglet « Optimisation » séparé. */}
            {futureSubTab === 'graph' && !curveRevealed && (
                <div className="space-y-4">
                    <Card className="text-center">
                        <div className="py-6 px-4 space-y-3 max-w-xl mx-auto">
                            <div className="text-4xl" aria-hidden="true">{isStale ? '🔄' : '🎯'}</div>
                            <h2 className="text-h2 text-ink-50">{isStale ? 'Paramètres modifiés' : 'Compose tes leviers, calcule ta meilleure projection'}</h2>
                            <p className="text-meta text-ink-300 leading-snug">
                                {isStale
                                    ? 'Tes hypothèses ou tes leviers ont changé depuis le dernier calcul. Recompose / relance ci-dessous pour mettre ta courbe et ton plan d\'action à jour.'
                                    : 'Coche les leviers à explorer ci-dessous, lance la recherche Monte-Carlo, puis applique la stratégie gagnante : ta courbe de vie affichera la MEILLEURE selon tes leviers.'}
                            </p>
                            <button
                                type="button"
                                onClick={revealCurve}
                                disabled={isComputing}
                                aria-busy={isComputing}
                                className="text-tiny text-ink-400 hover:text-ink-200 underline focus-ring rounded disabled:opacity-50"
                            >
                                {isComputing ? 'Calcul en cours…' : 'ou vois directement ta projection actuelle (sans optimiser)'}
                            </button>
                        </div>
                    </Card>
                    <StrategyOptimizerPanel params={params} onApply={setRetirementGoal ? applyAndReveal : undefined} />
                    {/* [UI-SCEN] — stress-tests à la demande (sortis du recalcul permanent). [EP-10] repliés. */}
                    <CollapsibleSection title="Stress-tests" subtitle="Scénarios adverses (krach, inflation, longévité…) — à la demande." defaultOpen={false}>
                        <StressTestPanel params={params} baselineEstateNW={allResults[0]?.estateNetWorth} />
                    </CollapsibleSection>
                </div>
            )}

            {futureSubTab === 'graph' && curveRevealed && (
            <div ref={revealedRef} tabIndex={-1} className="outline-none" role="region" aria-label="Projection affichée">
            <Card title={`La Courbe de Vie - ${allResults[0]?.strategyName || 'Simulation'}`}
                action={isComputing ? (
                    <span className="flex items-center gap-2 text-tiny text-amber-400" role="status" aria-live="polite">
                        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="40" strokeDashoffset="20" opacity="0.5"/>
                        </svg>
                        Recalcul Monte Carlo en cours…
                    </span>
                ) : undefined}>
                {/* G4 — sélecteur de période façon Google Finance */}
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <div className="flex gap-0.5 p-0.5 rounded-card bg-black/30 border border-white/5">
                        {[5, 10, 20, 30].filter((y) => y * 12 < lastMonthIndex).map((y) => {
                            const active = !!zoom.range && zoom.range[0] === 0 && zoom.range[1] === idxForYears(y);
                            return (
                                <button
                                    key={y}
                                    type="button"
                                    onClick={() => zoom.showRange(0, idxForYears(y))}
                                    className={`px-2.5 py-1 text-tiny font-bold rounded transition-colors focus-ring ${active ? 'bg-primary text-dark' : 'text-ink-300 hover:text-white hover:bg-white/10'}`}
                                >
                                    {y} ans
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            onClick={zoom.reset}
                            className={`px-2.5 py-1 text-tiny font-bold rounded transition-colors focus-ring ${!zoom.isZoomed ? 'bg-primary text-dark' : 'text-ink-300 hover:text-white hover:bg-white/10'}`}
                        >
                            Tout
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-tiny text-ink-500 hidden md:block" aria-hidden="true">
                            Clic = détail · molette = zoom · glisser = défiler
                        </span>
                        {/* PH4-FUT « leviers-d'abord » — revenir au composeur de leviers (ré-optimiser). */}
                        <button
                            type="button"
                            onClick={() => setRevealedSig(null)}
                            className="px-2 py-1 text-tiny font-bold rounded text-primary hover:brightness-110 bg-primary/15 hover:bg-primary/25 border border-primary/30 transition-colors focus-ring"
                            title="Recomposer tes leviers et recalculer la meilleure stratégie"
                        >
                            <span aria-hidden="true">🎯</span> Ré-optimiser
                        </button>
                        {/* PH2-d — verrou de courbe : fige la courbe courante comme référence (persistée IDB). */}
                        {isProjectionLocked ? (
                            <button
                                type="button"
                                onClick={unlockProjection}
                                className="px-2 py-1 text-tiny font-bold rounded text-amber-300 hover:text-amber-100 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition-colors focus-ring"
                                title="Déverrouiller : revenir à la courbe live seule"
                            >
                                <span aria-hidden="true">🔓</span> Déverrouiller
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => { if (results) lockProjection(results); }}
                                disabled={!results || isComputing}
                                className="px-2 py-1 text-tiny font-bold rounded text-ink-300 hover:text-white hover:bg-white/10 border border-white/10 transition-colors focus-ring disabled:opacity-40 disabled:cursor-not-allowed"
                                title="Verrouiller cette courbe comme référence (persistée jusqu'au déverrouillage)"
                            >
                                <span aria-hidden="true">🔒</span> Verrouiller
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => zoom.containerEl.current?.requestFullscreen?.()}
                            className="px-2 py-1 text-tiny font-bold rounded text-ink-300 hover:text-white hover:bg-white/10 border border-white/10 transition-colors focus-ring"
                            title="Plein écran (Échap pour quitter)"
                        >
                            ⛶ Plein écran
                        </button>
                    </div>
                </div>
                {/* A3 — note d'honnêteté sur le passé reconstruit (placements seulement). */}
                {pastPrefix.length > 0 && (
                    <div className="-mt-1 mb-2 text-tiny text-cyan-300/80 flex items-center gap-1.5 flex-wrap">
                        <span aria-hidden="true">⟵</span>
                        <span>
                            Passé réel des placements{pastHistory.firstDate ? ` depuis ${pastHistory.firstDate.slice(0, 7)}` : ''}
                            {pastHistory.isLoading ? ' · chargement des prix…' : (pastHistory.coverage < 0.99 ? ' · partiellement estimé aux prix actuels' : '')}
                        </span>
                    </div>
                )}
                {/* PH2-d — légende TEXTE de la courbe verrouillée (la légende custom du graphe ne la
                    liste pas) : label accessible + repère NON-couleur (trait tireté ambre). */}
                {lockedByMonth && (
                    <div className="-mt-1 mb-2 text-tiny text-amber-300/90 flex items-center gap-1.5 flex-wrap">
                        <span aria-hidden="true" className="inline-block w-5 border-t-2 border-dashed border-amber-400" />
                        <span>Courbe verrouillée — référence figée (l'aperçu live continue de se recalculer).</span>
                    </div>
                )}
                {/* Hauteur responsive : 380px mobile, 500px tablet, 650px desktop */}
                <div
                    ref={zoom.containerRef}
                    {...zoom.handlers}
                    onMouseDownCapture={(e) => { pointerDownPosRef.current = { x: e.clientX, y: e.clientY }; }}
                    onClick={handleChartContainerClick}
                    className={`chart-fullscreen relative w-full h-[380px] sm:h-[500px] lg:h-[650px] select-none ${zoom.isZoomed && zoom.isPanning ? 'cursor-grabbing' : zoom.isZoomed ? 'cursor-grab' : 'cursor-pointer'}`}
                >
                     {isComputing ? (
                        // Pendant le (re)calcul : on masque la courbe (potentiellement périmée) et on
                        // affiche un état de chargement de la MÊME hauteur que le graphe → zéro layout
                        // shift, et on ne montre jamais une courbe partielle/obsolète (demande Marc).
                        <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-ink-300" role="status" aria-live="polite">
                            <svg className="animate-spin h-8 w-8 text-amber-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="40" strokeDashoffset="20" opacity="0.5" />
                            </svg>
                            <span className="text-meta">Calcul de ta projection…</span>
                        </div>
                     ) : (
                     <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                            data={zoom.visibleData}
                            margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
                            onMouseMove={((s: { activePayload?: Array<{ payload: ProjectionChartPoint }> }) => { const p = s?.activePayload?.[0]?.payload; if (p) lastHoverPointRef.current = p; }) as unknown as (nextState: unknown, event: unknown) => void}
                            onClick={((s: { activePayload?: Array<{ payload: ProjectionChartPoint }> }) => { const p = s?.activePayload?.[0]?.payload; if (p) setDetailPoint(p); }) as unknown as (nextState: unknown, event: unknown) => void}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />

                            <XAxis
                                dataKey="monthIndex"
                                stroke="#666"
                                tick={{fontSize: 10}}
                                minTickGap={50}
                                tickFormatter={(val: number) => {
                                    const year = monthIndexToYear.get(val);
                                    return year !== undefined ? `${year}` : `${val}`;
                                }}
                            />

                            <YAxis stroke="#666" tick={{fontSize: 10}} domain={['auto', 'auto']} tickFormatter={(val) => isPrivacyMode ? '***' : `${(val/1000000).toFixed(1)}M`} />

                            {pastPrefix.length > 0 && (
                                <ReferenceArea x1={pastStartIndex} x2={0} fill="#22d3ee" fillOpacity={0.05} stroke="none" />
                            )}
                            {pastPrefix.length > 0 && (
                                <ReferenceLine x={0} stroke="#22d3ee" strokeOpacity={0.5} strokeDasharray="3 3" label={<RefLineLabel value="Passé réel ⟵" color="#22d3ee" />} />
                            )}
                            <ReferenceLine y={0} stroke="#444" strokeWidth={2} />
                            {isVisible('aujourdhui') && <ReferenceLine x={todayMonthIndex} stroke="rgba(255,255,255,0.6)" strokeDasharray="5 5" label={<RefLineLabel value="Aujourd'hui" color="#ffffff" />} />}

                            <Tooltip content={<ExpertTooltip userName1={config.users[0]?.name} userName2={config.users[1]?.name} />} />
                            {isVisible('fire') && <ReferenceLine y={fireNumber} stroke="#f97316" strokeDasharray="5 5" label={<RefLineLabel value="Objectif FIRE" color="#f97316" />} />}

                            {isVisible('Liquidites') && <Area type="monotone" dataKey="Liquidites" stackId="1" stroke="#4b5563" fill="#4b5563" name="Cash" isAnimationActive={false} />}
                            {isVisible('CELI') && <Area type="monotone" dataKey="CELI" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="CELI" isAnimationActive={false}/>}
                            {isVisible('CELIAPP') && <Area type="monotone" dataKey="CELIAPP" stackId="1" stroke="#2dd4bf" fill="#2dd4bf" fillOpacity={0.6} name="CELIAPP (FHSA)" isAnimationActive={false}/>}
                            {isVisible('REER') && <Area type="monotone" dataKey="REER" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} name="REER" isAnimationActive={false}/>}
                            {isVisible('REEE') && <Area type="monotone" dataKey="REEE" stackId="1" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.6} name="REEE" isAnimationActive={false}/>}
                            {isVisible('NonReg') && <Area type="monotone" dataKey="NonReg" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} name="Non-Enreg" isAnimationActive={false}/>}
                            {isVisible('Crypto') && <Area type="monotone" dataKey="Crypto" stackId="1" stroke="#a855f7" fill="#a855f7" fillOpacity={0.6} name="Crypto" isAnimationActive={false}/>}
                            {isVisible('Immobilier') && <Area type="monotone" dataKey="Immobilier" stackId="1" stroke="#ec4899" fill="#ec4899" fillOpacity={0.3} name="Équité Immo" isAnimationActive={false}/>}

                            {isVisible('ImpotLatent') && <Area type="monotone" dataKey="ImpotLatent" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} strokeDasharray="3 3" name="Impôt Latent" isAnimationActive={false}/>}
                            {isVisible('FluxImpots') && <Bar dataKey="FluxImpots" fill="#ef4444" fillOpacity={0.8} name="Paiement Impôts" barSize={4} isAnimationActive={false} />}

                            {/* G17 — Monte Carlo dessiné PAR-DESSUS la pile (sinon occulté) en
                                cône d'incertitude : P10/P90 pointillés + médiane pleine. */}
                            {runMC && isVisible('montecarlo') && (
                                <>
                                    <Line type="monotone" dataKey="P90" stroke="#60a5fa" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="Optimiste (P90)" isAnimationActive={false} />
                                    <Line type="monotone" dataKey="P10" stroke="#f87171" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="Pessimiste (P10)" isAnimationActive={false} />
                                    <Line type="monotone" dataKey="P50" stroke="#c084fc" strokeWidth={2.5} dot={false} name="Scénario médian (P50)" isAnimationActive={false} />
                                </>
                            )}

                            {isVisible('NetWorth') && <Line type="monotone" dataKey="NetWorth" stroke="#fff" strokeWidth={3} dot={false} name="Valeur Nette Totale" isAnimationActive={false}/>}
                            {/* PH2-d — courbe VERROUILLÉE (référence figée), superposée à l'aperçu live. */}
                            {lockedByMonth && <Line type="monotone" dataKey="lockedNetWorth" stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 3" dot={false} name="Courbe verrouillée 🔒" isAnimationActive={false} />}

                            {isVisible('events') && shownLifeEvents.map((evt, i) => (
                                <ReferenceDot
                                    key={`life-${i}`}
                                    x={evt.monthIndex}
                                    y={evt.val}
                                    r={3}
                                    shape={
                                        <ClickableEventIcon
                                            kind="life"
                                            payload={evt}
                                            onSelect={() => { const found = chartData.find((d: ProjectionChartPoint) => d.monthIndex === evt.monthIndex); if (found) setDetailPoint(found); }}
                                        />
                                    }
                                />
                            ))}

                            {isVisible('events') && shownFlowEvents.map((evt, i) => (
                                <ReferenceDot
                                    key={`flow-${i}`}
                                    x={evt.monthIndex}
                                    y={evt.val}
                                    r={2}
                                    shape={
                                        <ClickableEventIcon
                                            kind="flow"
                                            payload={evt}
                                            onSelect={() => { const found = chartData.find((d: ProjectionChartPoint) => d.monthIndex === evt.monthIndex); if (found) setDetailPoint(found); }}
                                        />
                                    }
                                />
                            ))}
                        </ComposedChart>
                    </ResponsiveContainer>
                     )}
                </div>

                {detailPoint && (
                    <FutureDetailModal
                        point={detailPoint}
                        chartData={chartData}
                        userName1={config.users[0]?.name}
                        userName2={config.users[1]?.name}
                        isPrivacyMode={isPrivacyMode}
                        onClose={() => setDetailPoint(null)}
                    />
                )}

                {/* G10 — légende interactive : clic = afficher/masquer la série. */}
                <div className="mt-6 bg-black/20 p-4 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                        <span className="text-tiny text-ink-500 font-semibold uppercase tracking-wide">
                            Légende — clique pour afficher / masquer
                        </span>
                        {hiddenSeries.size > 0 && (
                            <button
                                type="button"
                                onClick={showAllSeries}
                                className="text-tiny font-bold text-primary hover:underline focus-ring rounded px-1"
                            >
                                Tout réafficher ({hiddenSeries.size} masqué{hiddenSeries.size > 1 ? 's' : ''})
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Séries du graphique">
                        {FUTURE_LEGEND_ITEMS.filter((it) => !it.mcOnly || runMC).map((it) => {
                            const on = isVisible(it.key);
                            return (
                                <button
                                    key={it.key}
                                    type="button"
                                    onClick={() => toggleSeries(it.key)}
                                    aria-pressed={on}
                                    title={on ? `Masquer ${it.label}` : `Afficher ${it.label}`}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-card text-tiny font-semibold border transition-colors focus-ring ${on ? 'bg-white/10 border-white/15 text-ink-100 hover:bg-white/15' : 'bg-transparent border-white/5 text-ink-500 line-through hover:text-ink-300'}`}
                                >
                                    <LegendSwatch shape={it.shape} color={it.color} dimmed={!on} />
                                    {it.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

            </Card>
            </div>
            )}

            {/* Plan d'action : explications fusionnées + checklist hiérarchique.
                PH4 — gated comme la courbe : pas de résultats tant que la projection n'est pas calculée. */}
            {futureSubTab === 'plan' && !curveRevealed && (
                <Card className="text-center">
                    <div className="py-10 px-4 space-y-3 max-w-md mx-auto">
                        <div className="text-3xl" aria-hidden="true">🗂️</div>
                        <p className="text-meta text-ink-300 leading-snug">
                            {isStale ? 'Tes paramètres ont changé — relance le calcul' : 'Calcule ta projection'} dans
                            l'onglet <strong>Graphique</strong> pour voir ton plan d'action.
                        </p>
                    </div>
                </Card>
            )}
            {futureSubTab === 'plan' && curveRevealed && (
                <div className="space-y-6">
                    <ProjectionExplains chartData={chartData} />
                    {/* C2 — Plan d'action HIÉRARCHIQUE (global → mois, drill-down au clic). */}
                    <ActionPlanDrilldown chartData={chartData} strategyName={allResults[0]?.strategyName} />
                </div>
            )}
        </div>
    );
};
