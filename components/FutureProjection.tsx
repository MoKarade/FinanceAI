import React, { useMemo, useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Card } from './ui/Card';
import { Skeleton } from './ui/Skeleton';
// [REFONTE-NAV-L2b] Sous-onglet « Historique » (évolution passée par compte, ex-Accueil) —
// lazy : son pipeline (usePortfolioHistory + helpers immo/dettes) ne se paie qu'à l'affichage.
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { resolveDaySeriesIndex, type DaySeriesPoint } from '../utils/daySeriesIndex';
import { hasForeignCurrencyAssets } from '../services/portfolio';
const FutureHistorySection = lazyWithRetry(() => import('./future/FutureHistorySection'), 'FutureHistorySection');
// [NAV-MERGE-SANTE-FUTUR] Résumé condensé de Santé, en tête de page — léger (pas de recharts),
// import statique (pas de justification à le mettre derrière un lazy comme FutureHistorySection).
import { FutureHealthSummary } from './future/FutureHealthSummary';
import { TabPanel, tabId, panelId, clavierTablist } from './ui/SubTabs';
import { PageHeader } from './ui/PageHeader';
import { Badge } from './ui/Badge';
import { PrivateAmount } from './ui/PrivateAmount';
import { KPIStat } from './ui/KPIStat';
import { StatGrid } from './ui/StatGrid';
import { Pill } from './ui/Pill';
import { Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ReferenceArea, Line, ComposedChart, Bar, ReferenceDot } from 'recharts';
import { BudgetConfig, BudgetCategory, RealEstateGoal, RetirementGoal, Transaction, ProjectionConfig } from '../types';
import { ProjectionResult, ProjectionChartPoint } from '../services/projection/types';
import { useFinanceStore } from '../store/useFinanceStore';
import { logError } from '../services/errorLogger';
import { loadRevealedProjection, saveRevealedProjection, clearRevealedProjection } from '../services/lockedProjectionStore';
import { usePendingFocus } from '../utils/usePendingFocus';
import { buildLockedByMonth } from '../utils/lockedCurveOverlay';
import { computeForecastAccuracy } from '../services/projection/forecastAccuracy';
import { ForecastAccuracyBadge } from './projection/ForecastAccuracyBadge';
import { findInsolvencyPoint } from '../utils/insolvency';
import { sampleEvenly } from '../utils/sampleEvenly';
import { assignStackIndex } from '../utils/stackEventIcons';

// Sprint 2 PH2 — constante stable pour éviter de créer un nouveau [] à chaque
// render (qui invaliderait les useMemo deps en aval).
const EMPTY_ARRAY: never[] = [];

// [FUTUR-DAILY] Mêmes replis stables pour les sélecteurs du panneau quotidien. Les types
// viennent du store lui-même (pas de re-déclaration locale qui pourrait diverger).
type FinanceStoreState = ReturnType<typeof useFinanceStore.getState>;
const EMPTY_ASSETS: FinanceStoreState['assets'] = [];
const EMPTY_RECURRING: NonNullable<FinanceStoreState['subscriptions']> = [];
const EMPTY_FX: Record<string, number> = {};
const EMPTY_DEBTS: NonNullable<FinanceStoreState['debts']> = [];
/** Domaine de l'axe X, en CONSTANTE de module : un littéral recréé à chaque rendu ferait comparer
 *  la prop par identité à recharts sur des re-rendus où les données n'ont PAS bougé (bascule d'une
 *  série via la légende, par exemple). */
const X_AXIS_DOMAIN: ['dataMin', 'dataMax'] = ['dataMin', 'dataMax'];

/** [FUTUR-DAILY lot B étape 2] Nombre maximal de points MENSUELS visibles pour que la courbe passe
 *  au JOUR. Exprimé en points — et non en mois — parce qu'il est COUPLÉ au plancher de zoom :
 *  `useTimeChartZoom` refuse de descendre sous `DEFAULT_MIN_POINTS = 5` d'ÉCART, ce qui laisse
 *  `5 + 1 = 6` points dans la fenêtre au zoom maximal.
 *  ⚠️ Un seuil inférieur à 6 rend la vue au jour tout simplement INATTEIGNABLE — bug attrapé par
 *  l'e2e de sélection, pas à la lecture : le code était « correct », la fonctionnalité juste
 *  jamais déclenchée. Le premier jet plafonnait à 4 mois.
 *  À 6 points = 5 mois raffinés, soit ~150 jours : la courbe reste lisible et chaque jour occupe
 *  encore ~6 px de large, donc reste VISABLE à la souris. */
/**
 * [FUTUR-DAILY-NATIVE] Champs ventilés pour la COURBE (série quotidienne GLOBALE). Ce sont les
 * `dataKey` réellement tracés + l'identité du jour — rien d'autre. La restriction est une contrainte
 * MESURÉE : la ventilation complète (99 champs) de 30 ans coûte ~500 ms et ~180 Mo ; celle-ci
 * ~100 ms (bench 2026-08-12). L'infobulle, elle, reçoit un point COMPLET ventilé à la demande sur
 * le mois survolé (`enrichDailyPoint`) — même fonction moteur, mêmes entrées, donc aucune
 * divergence possible entre ce que la courbe trace et ce que l'infobulle détaille.
 * ⚠️ Ajouter une série au graphe = l'ajouter ICI, sinon elle ne se trace pas (garde-test
 * `tests/components/futureProjection.curveFields.test.ts` : chaque dataKey du render ∈ CURVE_FIELDS).
 */
/** [FUTUR-DAILY-NATIVE] Plafond de points TRACÉS (≈ densité de l'ancienne courbe mensuelle sur
 *  30 ans). Au-delà, `decimateForRender` échantillonne le tracé — la sélection reste au jour exact
 *  sur la tranche complète. Mesuré : sans plafond, ~11 000 pts × 8 aires gèlent le main thread. */
const RENDER_MAX_POINTS = 700;

const CURVE_FIELDS: ReadonlySet<string> = new Set([
    'Liquidites', 'CELI', 'CELIAPP', 'REER', 'REEE', 'NonReg', 'Crypto', 'Immobilier',
    'ImpotLatent', 'FluxImpots', 'P10', 'P50', 'P90', 'NetWorth', 'lockedNetWorth',
    // ⚠️ `DettesNonImmo` n'est TRACÉE par aucune aire : elle est ici parce que le patrimoine au
    // jour est RECOMPOSÉ (`NetWorth = Σ NET_WORTH_DAILY_ASSETS − DettesNonImmo`) et que la
    // recomposition s'ABSTIENT si un seul terme manque — une somme partielle serait un patrimoine
    // faux et crédible. Sans ce champ, le correctif `[JOUR-BILAN-ROMPU-SOUS-HYPOTHEQUE]` était
    // INERTE dans la vraie courbe : vert en test (qui ventile tout), sans effet en prod
    // (`[CURVE-FIELDS-DETTE-MANQUANTE]`, 2026-08-19). La garde qui tient ce lien est
    // `tests/services/bilanQuotidien.test.ts` — elle rejoue la ventilation avec CE set exact.
    'DettesNonImmo',
    'year', 'age', 'isPast',
]);

/** [FUTUR-DAILY-FULL] Un point QUOTIDIEN de la courbe.
 *
 *  ⚠️ Le type vit désormais dans `services/projection/dailyLedger.ts`, avec le code qui le
 *  PRODUIT. La version locale décrivait un point qui ne portait que `NetWorth` ; depuis que la
 *  ventilation au jour couvre tous les champs du moteur, le contrat et sa construction ne peuvent
 *  plus diverger sans casser le typecheck. `Partial<>` reste la clé : un champ que le mois n'émet
 *  pas doit s'afficher « — », jamais « 0 $ ». */
type DailyChartPoint = DailyLedgerPoint;
import { Tab as TabEnum } from '../types';
import { ExpertTooltip, ClickableEventIcon, RefLineLabel } from './projection/ProjectionTooltip';
import { FutureDetailModal } from './projection/FutureDetailModal';
import { useTimeChartZoom } from '../hooks/useTimeChartZoom';
import { useChartTooltipPosition } from '../hooks/useChartTooltipPosition';
import { resolvePointByX } from '../utils/chartTooltip';
import { ProjectionControls } from './projection/ProjectionControls';
import { useSimulationParams, useTodayIsoLocal } from '../hooks/useSimulationParams';
import { buildPastPrefix } from '../services/history/buildPastPrefix';
import { mentionDettesPasse } from '../services/history/pastDebtNotice';
import { mentionRaccord } from '../services/history/raccordNotice';
import { deriveMilestoneIcons } from '../services/projection/milestoneIcons';
// [REFONTE-NAV-L2a] Itérations MC réellement exécutées (source unique moteur) pour le libellé.
import { mcSublabel } from '../services/projection/monteCarlo';
import { ActionPlanDrilldown } from './projection/ActionPlanDrilldown';
import { ProjectionExplains } from './projection/ProjectionExplains';
import { StrategyOptimizerPanel } from './projection/StrategyOptimizerPanel';
import { StressTestPanel } from './projection/StressTestPanel';
import { CollapsibleSection } from './ui/CollapsibleSection';
import { applyConfigToSettings, type StrategyConfig } from '../services/projection/strategyConfig';
import { ChartDataTable, type ChartDataColumn } from './ui/ChartDataTable';
import { isoDate, finiteAnchorRun, calendarFromMonthIndex, axisXForIso, axisXAtDay } from '../services/projection/dailyRefine';
import { useViewportBelowSm } from '../hooks/useViewportBelowSm';
import { mergeDailyRealPoint, sliceDailyRangeByX, decimateForRender, realOnlyMonthPoints, buildEnrichedMonth } from '../services/projection/dailyCurve';
import { centeredWindowRange } from '../services/projection/dailyRefine';
import { buildDailyLedger, type DailyLedgerPoint } from '../services/projection/dailyLedger';
import { buildDailyPastLedger } from '../services/history/dailyPastLedger';
import { reconstructRealEstateEquityByYear } from '../services/history/reconstructRealEstateEquity';
import { MASKED_AMOUNT_LABEL } from '../utils/privacyAria';
import { formatCAD, formatCompactCAD } from '../utils/format';
import { NO_DATA_LABEL } from './ui/emptyAware';
// [REFONTE-NAV-L6a] Contexte d'écran « Futur » pour l'assistant (patron CHAT-PAGE-CONTEXT).
import { useViewContextPublisher } from '../hooks/useViewContextPublisher';
import { buildFutureViewDetail } from '../services/aiChat/futureViewContext';
import { dayVariation } from '../services/history/dayVariation';
import { addDay } from '../services/history/reconstructCashHistory';

// [PROJECTION-PERSIST] Dédup MODULE-LEVEL de l'écriture du blob figé (finding code-reviewer) :
// survit au démontage/remontage de l'onglet → pas de réécriture IDB (~1-2 Mo chiffrés) à chaque
// visite quand le moteur n'a pas republié. Volontairement PAS dans le store (pur détail d'I/O).
let _lastSavedRevealedResults: ProjectionResult | null = null;

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

/** Les quatre sous-onglets de Futur — une SEULE source pour le rendu ET pour le clavier : une liste
 *  recopiée dans le `onKeyDown` divergerait au premier onglet ajouté, et les flèches sauteraient
 *  silencieusement le nouveau. */
const FUTURE_SUB_TABS = [
    { id: 'graph', emoji: '🎯', label: 'Projection' },
    { id: 'params', emoji: '⚙️', label: 'Hypothèses' },
    { id: 'plan', emoji: '🗂️', label: 'Plan d\'action' },
    { id: 'historique', emoji: '📊', label: 'Historique' },
] as const;

type FutureSubTabId = typeof FUTURE_SUB_TABS[number]['id'];

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
    // [ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] Motif du refus, publié par `ProjectionEngine` — il
    // NOMME le champ fautif, là où le message générique ci-dessous n'oriente vers rien.
    const projectionRefus = useFinanceStore(s => s.projectionRefus);

    // PH2-c — résultat LU depuis la SOURCE UNIQUE (publiée par ProjectionEngine, app-level).
    // Plus aucun calcul ni repli local : la courbe affichée EST celle du moteur (sauf GEL, ci-dessous).
    const liveResults = useFinanceStore(s => s.lastProjection);
    // [FUTUR-REAL-HISTORY] La mention « change du jour » ne concerne QUE les titres en devise étrangère
    // (facteur FX=1 pour CAD) → ne l'affiche pas pour un portefeuille 100 % CAD (finding code-reviewer :
    // sinon on suggère un risque de change qui ne s'applique pas). Sélecteur booléen = re-render minimal.
    const hasForeignHoldings = useFinanceStore(s => hasForeignCurrencyAssets(s.assets));

    // [PROJECTION-PERSIST 2026-07-16, demande Marc] — la projection révélée RESTE (reload / changement
    // de page / autre PC) et se FIGE quand les entrées changent (badge « pas à jour », choix Marc :
    // figer, pas recalculer). Mécanique :
    //   - `revealedProjectionSig` (store, PERSISTÉ + synchronisé Drive) remplace l'ancien useState
    //     local : la révélation survit au reload et voyage entre appareils.
    //   - signature courante = params entiers + runMC (inchangé, cf commentaire historique plus bas).
    //   - PÉRIMÉ (sig ≠) → on affiche le BLOB FIGÉ (IndexedDB, record `revealed`) au lieu de la courbe
    //     live ; s'il est absent (autre PC : le blob ~1-2 Mo ne se synchronise pas), repli honnête sur
    //     la courbe live, toujours avec le badge.
    //   - MODE TEST : jamais de gel (le blob porte les VRAIES données de Marc → l'afficher en démo
    //     persona les fuiterait à l'écran ; et un persona ne doit pas écraser le blob réel).
    // ⚠️ Signature = HASH COURT du JSON, pas le JSON lui-même (finding code-reviewer) : la sig est
    // désormais PERSISTÉE + synchronisée Drive — stocker le JSON complet des params (~dizaines de Ko,
    // duplicata de budgets/dettes/objectifs déjà dans le state) gonflerait localStorage et chaque push.
    // L'égalité stricte suffit à détecter la péremption ; hash FNV-1a 32 bits + longueur (déterministe
    // cross-PC : même stringify → même hash). Non-crypto assumé (détection de changement, pas sécurité).
    const currentSig = useMemo<string | null>(() => {
        try {
            const json = JSON.stringify({ p: params, mc: runMC });
            let h = 0x811c9dc5;
            for (let i = 0; i < json.length; i++) {
                h ^= json.charCodeAt(i);
                h = Math.imul(h, 0x01000193);
            }
            return `v1:${(h >>> 0).toString(36)}:${json.length.toString(36)}`;
        } catch { return null; } // illisible (inatteignable : params est sérialisable) → jamais révélé
    }, [params, runMC]);
    const revealedSig = useFinanceStore(s => s.revealedProjectionSig);
    const setRevealedSig = useFinanceStore(s => s.setRevealedProjectionSig);
    const isTestModeActive = useFinanceStore(s => s.isTestMode);
    const curveRevealed = revealedSig !== null && currentSig !== null && revealedSig === currentSig;
    const isStale = revealedSig !== null && revealedSig !== currentSig; // calculé, puis entrées modifiées
    const [frozenResults, setFrozenResults] = useState<ProjectionResult | null>(null);
    // Restauration du gel : périmé (reload avec prix/paramètres qui ont bougé) et pas encore de blob
    // en mémoire → relire l'IDB (best-effort ; 'empty'/'unreadable' → repli live, badge quand même).
    useEffect(() => {
        if (!isStale || isTestModeActive || frozenResults) return;
        let cancelled = false;
        void loadRevealedProjection().then((res) => {
            if (!cancelled && res.status === 'ok') setFrozenResults(res.result);
        });
        return () => { cancelled = true; };
    }, [isStale, isTestModeActive, frozenResults]);
    // Miroir du gel : tant que la courbe est FRAÎCHE, le blob figé suit le résultat live (une écriture
    // par VRAI recalcul moteur — ProjectionEngine ne republie que sur changement réel de params).
    // Dès qu'un paramètre change (périmé), ce miroir s'arrête → le blob garde la dernière courbe vue.
    // ⚠️ Dédup par RÉFÉRENCE au niveau MODULE (finding code-reviewer) : FutureProjection est démonté/
    // remonté à chaque changement d'onglet (TabRouter) → avec une dédup locale au montage, CHAQUE visite
    // de l'onglet réécrivait le blob chiffré (~1-2 Mo, AES-GCM) en IDB alors que rien n'avait changé.
    // `lastProjection` vit dans le store APP-LEVEL : son identité survit aux montages → la comparaison
    // module-level saute l'écriture tant que le moteur n'a pas VRAIMENT republié. (setFrozenResults
    // reste nécessaire à chaque montage : état local remis à null au démontage.)
    useEffect(() => {
        if (curveRevealed && liveResults && !isTestModeActive) {
            setFrozenResults(liveResults);
            if (_lastSavedRevealedResults !== liveResults) {
                _lastSavedRevealedResults = liveResults;
                void saveRevealedProjection(liveResults);
            }
        }
    }, [curveRevealed, liveResults, isTestModeActive]);
    // Substitution UNIQUE : tout l'aval (chartData, KPIs, événements, insolvabilité, plan) consomme
    // `results` → périmé = TOUT figé de façon cohérente, pas seulement la courbe.
    const frozenUsable = isStale && !isTestModeActive ? frozenResults : null;
    const results = frozenUsable ?? liveResults;
    // Courbe visible = (fraîche OU périmée hors mode test) ET un résultat existe. La garde
    // `results !== null` vaut pour les DEUX branches (finding silent-failure BLOQUANT) : au reload,
    // la signature persistée révèle d'emblée mais le moteur n'a pas encore publié (~300 ms + calcul)
    // → sans la garde, les KPIs affichaient « Objectif FIRE 0k$ » / « 0.00M$ » avec assurance
    // (no-fake-data violé) et un graphe vide sans spinner. Jamais révélé → gate.
    const curveVisible = results !== null && (curveRevealed || (isStale && !isTestModeActive));
    // Fenêtre de RESTAURATION : révélé (sig persistée) mais AUCUN résultat encore (moteur en route,
    // gel IDB en lecture). On affiche une carte de chargement honnête — PAS l'écran d'amorçage, sinon
    // chaque reload donne l'impression que la projection a été perdue (l'inverse de la demande Marc).
    const curveRestoring = revealedSig !== null && !isTestModeActive && results === null;
    const { chartData = [] as ProjectionChartPoint[], fireNumber = 0, allResults = [] as ProjectionResult[] } = results ?? {};

    // [PROJ-INSOLVENCY-BADGE] premier moment où le patrimoine net projeté passe sous 0 (plan
    // insoutenable, capital épuisé). null si solvable sur tout l'horizon → aucun badge (empty state honnête).
    const insolvency = useMemo(() => findInsolvencyPoint(chartData), [chartData]);

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
    // [FUTUR-REAL-HISTORY, Option A] Dette hors hypothèque AU NIVEAU ACTUEL (source unique du moteur,
    // `chartData[0].DettesNonImmo`) → soustraite du patrimoine net de CHAQUE point passé pour un raccord
    // EXACT au présent (le futur soustrait la même dette dès le mois 0). Approximation assumée (dette
    // supposée constante dans le passé, faute d'historique d'amortissement) — SIGNALÉE dans le bandeau.
    // ⚠️ [FUTUR-PAST-DEBT-FREEZE 2026-07-29, audit demande Marc « le passé doit être exactement ce que
    // c'était à cette date »] PRÉFÈRE `liveResults` (TOUJOURS frais) à `results`/`chartData` (qui peuvent
    // être le blob FIGÉ de PROJECTION-PERSIST) : le segment PASSÉ doit refléter la dette RÉELLE actuelle
    // même quand la courbe FUTURE affichée est gelée (badge « Pas à jour ») — sinon la ligne Valeur Nette
    // du passé continue de soustraire une dette PÉRIMÉE tant que Marc ne relance pas le calcul.
    // ⚠️ [finding financial-integrity, PR #531, MESURÉ par sonde de rendu] Ne JAMAIS retomber sur 0 quand
    // `liveResults` n'est pas encore publié (fenêtre boot/reload : `lastProjection` est EXCLU de la
    // persistance — `useFinanceStore.ts` partialize — donc `null` tant que ProjectionEngine n'a pas
    // recalculé, ~300 ms+, alors que le blob figé restauré depuis IDB affiche DÉJÀ une courbe) : un
    // repli sur 0 gonflerait le passé de TOUTE la dette hors hypothèque — exactement le MONEY-PHANTOM que
    // ce fix ferme par ailleurs. Repli sur `chartData` (= ce que la courbe affiche déjà, live ou figé),
    // jamais sur 0 — seul un état SANS AUCUNE donnée (ni live ni figé) reste à 0 (nominal, avant 1er calcul).
    const effectiveChartData = liveResults?.chartData?.length ? liveResults.chartData : chartData;
    const rawDebtNonImmo = effectiveChartData?.[0]?.DettesNonImmo;
    const currentDebtNonImmo = Number(rawDebtNonImmo) || 0;
    const debtAnomaly = (effectiveChartData?.length ?? 0) > 0 && !Number.isFinite(Number(rawDebtNonImmo));
    // [PASSE-REEL-DETTE-1] `currentDebtNonImmo` reste LE total appliqué au passé (raccord EXACT
    // inchangé, Option A) ; `storeDebts` (tableau brut, FRAIS) sert UNIQUEMENT à déterminer, mois par
    // mois, QUELLES dettes en retrancher parce qu'elles n'existaient pas encore (`sumNotYetStarted
    // DebtsAtMonth`/`...AtAbsoluteMonth` dans `buildPastPrefix`/`buildDailyPastLedger`) — jamais à
    // resommer le total en entier (cf commentaire dédié dans `debtSchedule.ts`).
    const storeDebts = useFinanceStore(s => s.debts) ?? EMPTY_DEBTS;
    useEffect(() => {
        if (debtAnomaly) {
            logError({ source: 'ui', severity: 'warning', message: 'FutureProjection : DettesNonImmo (liveResults, repli chartData) non fini — dette du passé rabattue à 0', context: { rawDebtNonImmo } });
        }
    }, [debtAnomaly, rawDebtNonImmo]);
    // [FUTUR-HIST-WIRING-TEST] Assemblage du segment passé extrait en fonction PURE `buildPastPrefix`
    // (unit-testable, hors composant) → le câblage money-critical (buckets → helper, dette soustraite,
    // dates) se prouve sans rendre le composant. Vide → `EMPTY_ARRAY` (référence stable pour l'aval).
    const pastPrefix = useMemo(() => {
        const built = buildPastPrefix({ pastHistoryPoints: pastHistory.points, transactions, calculatedStartingCash, realEstateGoals, startYear, startMonth, currentDebtNonImmo, debts: storeDebts });
        // [PASSE-REEL-RACCORD-CHUTE-MENSUEL] Le lot 97 fait remonter `fluxPeriodeAnnulee` avec les
        // points : la marche au raccord de la vue par MOIS annule TOUT le mois courant.
        return { points: built.points.length ? built.points : EMPTY_ARRAY, fluxPeriodeAnnulee: built.fluxPeriodeAnnulee };
    }, [pastHistory.points, startYear, startMonth, transactions, calculatedStartingCash, realEstateGoals, currentDebtNonImmo, storeDebts]);
    // Référence STABLE pour l'aval : `pastPrefix` est un objet neuf à chaque memo, mais ses POINTS
    // gardent `EMPTY_ARRAY` quand il n'y a pas de passé — c'est cette identité que les memos avals
    // comparent, et la casser rendrait tout le graphe à chaque rendu.
    const pastPrefixPoints = pastPrefix.points;

    // [DEBT-AMORTIZATION-CABLAGE] Ce que le bandeau peut HONNÊTEMENT affirmer des dettes du passé.
    // Le fait vient du service qui décide de l'amortissement, pas d'une seconde lecture des champs.
    const mentionDettes = useMemo(
        () => mentionDettesPasse(storeDebts, startYear * 12 + startMonth, currentDebtNonImmo),
        [storeDebts, startYear, startMonth, currentDebtNonImmo],
    );
    // PH2-d — index NetWorth de la courbe VERROUILLÉE par monthIndex (référence à superposer).
    const lockedByMonth = useMemo(
        () => buildLockedByMonth(lockedProjection, isProjectionLocked, (p) => p.NetWorth ?? NaN),
        [isProjectionLocked, lockedProjection],
    );
    const displayData = useMemo(() => {
        const base = pastPrefixPoints.length ? [...pastPrefixPoints, ...chartData] : chartData;
        // Sous verrou : on ajoute `lockedNetWorth` à chaque point (référence figée) → 2e courbe tracée.
        if (!lockedByMonth) return base;
        return base.map((d) => ({ ...d, lockedNetWorth: lockedByMonth.get((d as { monthIndex: number }).monthIndex) }));
    }, [pastPrefixPoints, chartData, lockedByMonth]);
    const pastStartIndex = pastPrefixPoints.length ? pastPrefixPoints[0].monthIndex : 0;

    // PH2-c — la PUBLICATION dans store.lastProjection est faite par ProjectionEngine (app-level),
    // plus par ce composant. Futur est désormais un pur CONSOMMATEUR de la source unique.

    // G5 — un événement = une pastille (plus de fusion « A | B | C »). On garde
    // year/age/dateLabel par événement pour la fiche au clic, et `subIdx` pour
    // empiler verticalement les événements d'un même mois.
    const { lifeChartEvents, flowChartEvents } = useMemo(() => {
        type ChartEvent = { monthIndex: number; year: number | undefined; age: number | undefined; dateLabel: string | undefined; val: number | undefined; netWorth: number | undefined; label: string; subIdx: number; index: number; kind: 'life' | 'flow'; color?: string; pinned?: boolean; /** [FUTUR-DAILY-EVENTS] Abscisse FRACTIONNAIRE du jour saisi/échéance — absente = pastille au mois. */ x?: number };
        const lifes: ChartEvent[] = [];
        const flows: ChartEvent[] = [];
        // Anti-spam : le moteur ré-émet certains labels (renouvellements, stress
        // tests) plusieurs mois d'affilée. On collapse les répétitions du même
        // label rapprochées (≤ DEDUP_GAP mois) pour ne garder qu'une pastille.
        const DEDUP_GAP = 3;
        const lastLife: Record<string, number> = {};
        const lastFlow: Record<string, number> = {};
        // [R2] La pastille « FIRE atteint » vient du MOTEUR (lifeEvent 'Objectif FIRE Atteint 🔥', projection.ts —
        // source UNIQUE, seuil inflaté + indexé). On NE la recalcule PAS côté UI : on la MET EN VALEUR — orange
        // #f97316 + `pinned` (jamais écrêtée par thinEvents). Cohérent avec « Future = source unique ».
        const FIRE_RE = /\bfire\b/i;
        chartData.forEach((d: ProjectionChartPoint) => {
            // `val` = coordonnée Y de la pastille → `NetWorth` : TOUTES les pastilles (vie ET flux) se posent
            // SUR la courbe (visibles). [FUTUR-ICONS-RICH] avant, les flux étaient à `val=ImpotLatent` (position
            // basse, quasi invisibles — une des causes du « je ne vois presque aucune icône »).
            const meta = { monthIndex: d.monthIndex, year: d.year, age: d.age, dateLabel: d.dateLabel, val: d.NetWorth, netWorth: d.NetWorth };
            // [FUTUR-DAILY-EVENTS] Jour connu (saisie datée, échéance fiscale) → abscisse du JOUR.
            // Calendrier hissé hors de la closure : constant pour tout le mois (finding revue #594).
            const cal = calendarFromMonthIndex(startYear, startMonth, d.monthIndex);
            const dayXOf = (label: string): number | undefined => {
                const day = (d.eventDays ?? {})[label];
                if (!Number.isFinite(day)) return undefined;
                return axisXAtDay(d.monthIndex, day, cal.year, cal.month);
            };
            (d.lifeEvents || []).forEach((label: string) => {
                if (lastLife[label] != null && d.monthIndex - lastLife[label] <= DEDUP_GAP) return;
                lastLife[label] = d.monthIndex;
                const isFire = FIRE_RE.test(label);
                lifes.push({ ...meta, label, subIdx: 0, index: 0, kind: 'life', x: dayXOf(label), ...(isFire ? { color: '#f97316', pinned: true } : null) });
            });
            // [FUTUR-ICONS-RICH, ADR-2] Gate RETIRÉ : il filtrait la quasi-totalité des flowEvents
            // (`.includes('-')` cherchait un tiret ASCII alors que les messages portent un tiret cadratin « — »
            // → seuls les mois à remboursement d'impôt passaient). La densité est gérée par sampleEvenly, pas ici.
            (d.flowEvents || []).forEach((label: string) => {
                // Dédup par MOTIF (finding silent-failure) : le moteur émet un flowEvent de retrait CHAQUE mois
                // avec un MONTANT UNIQUE (« Retrait REER … +5 605 $ », « +5 609 $ »…) → un dédup par chaîne EXACTE
                // ne collapse jamais et inonde le cap flux. On normalise les nombres (→ « # ») avant dédup.
                const dedupKey = label.replace(/\d[\d\s.,]*/g, '#');
                if (lastFlow[dedupKey] != null && d.monthIndex - lastFlow[dedupKey] <= DEDUP_GAP) return;
                lastFlow[dedupKey] = d.monthIndex;
                flows.push({ ...meta, label, subIdx: 0, index: 0, kind: 'flow', x: dayXOf(label) });
            });
        });
        // [FUTUR-ICONS-RICH] Jalons DÉRIVÉS des champs chartData (RRQ/PSV/1er retrait REER-CELI/locatif) —
        // présentation pure (aucun recalcul $). Jamais retraite/FIRE/impôt (émis par le moteur → anti-doublon
        // structurel). `pinned` : peu nombreux (one-time) → JAMAIS écrêtés par sampleEvenly, toujours visibles
        // (finding silent-failure : sinon noyés par le volume de flowEvents dégatés).
        const milestones = deriveMilestoneIcons(chartData);
        lifes.push(...milestones.map((m) => ({ ...m, subIdx: 0, index: 0, pinned: true })));
        // ⚠️ RE-TRI par monthIndex OBLIGATOIRE avant `sampleEvenly` (contrat « tableau ORDONNÉ », finding architect
        // ÉLEVÉ : un merge non trié casse l'échantillonnage uniforme) + `index` (clé unique).
        // ⚠️ [FUTUR-DAILY-STACK-X] `subIdx` n'est PLUS attribué ici : le rang d'empilement se calcule
        // sur les pastilles RÉELLEMENT montrées (`assignStackIndex`, après fenêtre + écrêtage). Attribué
        // ici, il survivait à ses voisins écrêtés et laissait une pastille flotter sur un étage vide.
        const finalize = (arr: ChartEvent[]): ChartEvent[] => {
            const sorted = [...arr].sort((a, b) => a.monthIndex - b.monthIndex);
            return sorted.map((e, i) => ({ ...e, subIdx: 0, index: i }));
        };
        return { lifeChartEvents: finalize(lifes), flowChartEvents: finalize(flows) };
    // ⚠️ startYear/startMonth dans les deps (finding ÉLEVÉ revue #594) : l'horloge calendaire
    // avance TOUTE SEULE (rollover) — sans ces deps, les abscisses des pastilles restaient
    // calculées sur un ancrage périmé jusqu'au prochain recalcul de chartData.
    }, [chartData, startYear, startMonth]);

    // PH4-FUT — ANNOTATIONS sur la courbe (choix Marc : âge de retraite, épuisement d'un compte, bascule
    // de phase). Calculées une fois depuis chartData ; rendues en lignes verticales discrètes (masquables
    // via le toggle « Événements » de la légende). Les ÉVÉNEMENTS DE VIE restent les pastilles cliquables.
    const lifeMarkers = useMemo(() => {
        const markers: { monthIndex: number; label: string; color: string }[] = [];
        let retDone = false;
        const accounts: Array<[keyof ProjectionChartPoint, string]> = [
            ['REER', 'REER'], ['CELI', 'CELI'], ['NonReg', 'Non-enr.'], ['CELIAPP', 'CELIAPP'],
        ];
        const sig: Record<string, boolean> = {};
        const dep: Record<string, boolean> = {};
        for (const d of chartData as ProjectionChartPoint[]) {
            if (d.monthIndex < 0) continue; // pas d'annotation sur le passé reconstruit
            if (!retDone && d.isRetired) { markers.push({ monthIndex: d.monthIndex, label: `Retraite${d.age ? ` ${d.age}` : ''}`, color: '#f97316' }); retDone = true; }
            // [FUTUR-ICONS-RICH, ADR-3] RRQ/PSV retirés des lignes verticales → désormais icônes-jalons cliquables
            // (`deriveMilestoneIcons`) : évite la double représentation (ligne + pastille) du même mois.
            for (const [key, short] of accounts) {
                const v = (d[key] as number | undefined) ?? 0;
                if (v > 5000) sig[key as string] = true;
                if (sig[key as string] && !dep[key as string] && v < 1000) { markers.push({ monthIndex: d.monthIndex, label: `${short} ⌀`, color: '#ef4444' }); dep[key as string] = true; }
            }
        }
        return markers;
    }, [chartData]);

    // G3 + PH4-FUT « leviers-d'abord » — 3 sous-onglets : Projection (composeur de leviers EN AMONT puis
    // courbe + KPIs) ; Paramètres (hypothèses) ; Plan d'action (explications + checklist). Plus d'onglet
    // « Optimisation » : le composeur de leviers est remonté dans l'écran d'amorçage du sous-onglet Projection.
    // PH4-FUT « leviers-d'abord » — sous-onglet « Optimisation » RETIRÉ : le composeur de leviers est
    // remonté dans l'écran d'amorçage du Graphique (en amont du calcul).
    // [REFONTE-NAV-L2b] + 4e sous-onglet « Historique » (l'évolution PASSÉE, ex-Accueil).
    const [futureSubTab, setFutureSubTab] = useState<FutureSubTabId>('graph');
    // PH4 (refonte Futur « leviers-d'abord », demande Marc) — la courbe ET les KPIs ne s'affichent
    // QUE sur un calcul EXPLICITE : la révélation est liée à une SIGNATURE de ce qui PILOTE la courbe.
    // Revue PH4 (MAJEUR) — on signe `params` ENTIER (la source UNIQUE, ~20 entrées du store) et NON un
    // sous-ensemble cueilli à la main — sinon la courbe se remettrait à jour seule pour toute entrée non
    // listée. `params` est mémoïsé par référence → le stringify ne se refait qu'au vrai changement.
    // ⚠️ [PROJECTION-PERSIST 2026-07-16] : le calcul de currentSig/revealedSig/curveRevealed/isStale a
    // DÉMÉNAGÉ en tête de composant (avant la lecture de `results`) — la signature pilote désormais la
    // SUBSTITUTION live/figé. `revealedSig` n'est PLUS un useState local : il vit dans le store PERSISTÉ
    // (survit au reload, synchronisé Drive). États : jamais calculé (null) → gate ; sig identique →
    // courbe live ; sig ≠ → courbe FIGÉE + badge « pas à jour » (plus de ré-invite plein écran).
    const revealCurve = () => setRevealedSig(currentSig);
    // « Rechoisir mes leviers » (badge périmé) : on efface la révélation → retour à l'écran d'amorçage
    // (composeur de leviers), et on purge le gel (mémoire + IDB) — la prochaine révélation refigera.
    const regateToLevers = () => {
        setRevealedSig(null);
        setFrozenResults(null);
        // ⚠️ Garde mode test (finding silent-failure ÉLEVÉ) : le record IDB `revealed` est un slot
        // GLOBAL partagé réel/test — un clic « Ré-optimiser » pendant une démo persona SUPPRIMERAIT
        // silencieusement le blob RÉEL de l'utilisateur (même classe d'incident que PERSONA-PURGE).
        // Cohérent avec les effets voisins (restauration + miroir), déjà gatés `!isTestModeActive`.
        if (!isTestModeActive) void clearRevealedProjection();
    };
    // PH4-FUT (leviers-d'abord) — « Appliquer la stratégie gagnante PUIS révéler la courbe » : on ne peut
    // pas figer la signature dans le même tick que l'application (les params changent juste après).
    // Un flag déclenche la révélation au render SUIVANT, quand currentSig reflète les params appliqués.
    // Invariant : handleApplyConfig fait 2 setAppState (projection + retirementGoal) BATCHÉS en 1 render
    // (handler synchrone, React 19) → currentSig recalculé une seule fois, COMPLET (pas de sig intermédiaire,
    // pas de flash). ⚠️ Si un de ces set devenait async, ce flux re-cacherait la courbe (revue PH4-FUT).
    const [revealAfterApply, setRevealAfterApply] = useState(false);
    useEffect(() => {
        if (revealAfterApply) { setRevealedSig(currentSig); setRevealAfterApply(false); }
    }, [revealAfterApply, currentSig, setRevealedSig]);
    const applyAndReveal = (cfg: StrategyConfig) => { handleApplyConfig(cfg); setRevealAfterApply(true); };
    // A11y : à la révélation, déplacer le focus sur la zone courbe (le bouton « Calculer » se
    // démonte → sinon le focus retombe sur <body> et le lecteur d'écran perd le contexte).
    // [PROJECTION-PERSIST] le focus ne bouge que sur une TRANSITION false→true (révélation explicite,
    // i.e. un clic) : avec la signature persistée, curveRevealed peut être vrai dès le montage (reload)
    // → voler le focus à l'arrivée sur la page serait intrusif. Détection par ref « valeur précédente »
    // initialisée à la valeur du MONTAGE — immune à la double-invocation d'effets de StrictMode (dev),
    // contrairement à un flag « sauter le 1er passage » (finding a11y-auditor).
    const revealedRef = useRef<HTMLDivElement>(null);
    const prevCurveRevealedRef = useRef(curveRevealed);
    useEffect(() => {
        const was = prevCurveRevealedRef.current;
        prevCurveRevealedRef.current = curveRevealed;
        if (!was && curveRevealed) revealedRef.current?.focus();
    }, [curveRevealed]);

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
    // [FUTUR-DAILY-ZOOM-DEEP] `minPoints: 1` (écart minimal) ⇒ on peut descendre jusqu'à DEUX points
    // mensuels visibles = UN seul mois rendu au jour (~30 jours à l'écran, ~30 px par jour — chaque
    // jour se vise à la souris). Demande Marc 2026-08-11 : « je veux pouvoir zoomer un peu plus pour
    // pouvoir voir les jours individuels ». Le défaut du hook (5) reste en place pour les AUTRES
    // graphes de l'app, où descendre à 2 points n'a pas de vue au jour pour le justifier.
    // ⚠️ Le plancher ne peut pas passer SOUS le mois sans réécrire le zoom : le hook navigue par
    // indices ENTIERS du tableau mensuel, et la construction des jours exige 2 ancres (la première
    // sert de valeur d'entrée, non rendue).
    const zoom = useTimeChartZoom<ProjectionChartPoint>(displayData as ProjectionChartPoint[], { minPoints: 1 });

    // [FUTUR-DAILY-NATIVE] La plage MENSUELLE ventilable : la plus longue plage contiguë de
    // `displayData` à valeur nette FINIE. C'est la base de TOUTE la série quotidienne (courbe ET
    // infobulle) — plus aucune dépendance au zoom : le jour est la résolution de BASE de la courbe
    // (demande Marc 2026-08-12 : « je veux pas un bouton je veux pouvoir selectionner sur la
    // courbe direct », cadrage 3/3 : clic = jour partout, survol = jour, courbe tracée au jour).
    // ⚠️ `finiteAnchorRun` et NON `Number(p.NetWorth) || 0` (finding silent-failure #577) :
    // `buildPastPrefix` laisse `NetWorth` à `undefined` AVANT la première transaction connue,
    // exprès. Le coercer aurait ancré toute la ventilation sur un patrimoine de 0 $ inventé.
    const dailyAnchors = useMemo(
        () => finiteAnchorRun(displayData as ProjectionChartPoint[], startYear, startMonth),
        [displayData, startYear, startMonth],
    );
    // [FUTUR-DAILY-ROLLOVER] Aujourd'hui, RÉACTIF au passage de jour (demande Marc 2026-08-12 :
    // « ça doit se mettre à jour à chaque jour pour le passé »). Figé au montage, une app laissée
    // ouverte gardait la frontière réel/projeté au jour de l'ouverture — les jours écoulés
    // restaient « projetés ». Toute la chaîne aval (passé réel, série quotidienne, ancrages) dépend
    // de cette valeur : quand le jour change, elle se reconstruit d'elle-même.
    const todayIso = useTodayIsoLocal();
    // [FUTUR-DAILY-ROLLOVER] Abscisse FRACTIONNAIRE d'aujourd'hui : sur une courbe au jour, poser
    // « Aujourd'hui » et la fin de la bande « Passé réel » à l'ENTIER du mois les décalait de
    // jusqu'à 30 jours du vrai jour courant. `null` (date imparsable) ⇒ repli sur l'ancrage mensuel.
    const todayAxisX = useMemo(() => axisXForIso(startYear, startMonth, todayIso), [startYear, startMonth, todayIso]);

    // ⚠️ Replis STABLES (constantes de module) et non `?? []` inline : un littéral crée une NOUVELLE
    // référence à chaque rendu, ce qui ferait recalculer les `useMemo` qui en dépendent à chaque
    // frame de zoom/pan — exactement la classe de fuite de perf déjà relevée en revue sur ce
    // chantier. Attrapé ici par `react-hooks/exhaustive-deps`, pas par mon jugement.
    const storeAssets = useFinanceStore(s => s.assets) ?? EMPTY_ASSETS;
    // [FUTUR-DAILY-ROLLOVER, finding silent-failure #593] Dernier jour COUVERT par la sync bancaire
    // (date LOCALE de la dernière passe). Un jour réel postérieur porte `daySyncUnconfirmed` : après
    // minuit app ouverte, un « 0 $ dépensé hier » peut n'être qu'une sync pas encore passée — le
    // dire est le symétrique de `hasEstimatedPrice` côté prix. Jamais de sync ⇒ null ⇒ aucun flag
    // (usage manuel : marquer tout le passé serait du bruit permanent).
    const fintableSyncAt = useFinanceStore(s => s.fintableSyncReport?.at);
    const syncConfirmedUntilIso = useMemo(() => {
        if (!Number.isFinite(fintableSyncAt)) return null;
        const d = new Date(fintableSyncAt as number);
        return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
    }, [fintableSyncAt]);
    const fxRates = useFinanceStore(s => s.fxRates) ?? EMPTY_FX;
    const storeRecurring = useFinanceStore(s => s.subscriptions) ?? EMPTY_RECURRING;
    // ⚠️ `netSalary` du store est MENSUEL (règle « unités argent » de CLAUDE.md). Marc est payé
    // CHAQUE SEMAINE le jeudi (réponse A13, 2026-08-06) : c'est `weeklyDeltasForMonth` qui fait la
    // conversion (×12/52 par versement), pas ce site — ici on ne fait que sommer le ménage.
    const dailyMonthlyNet = (config?.users ?? []).reduce((s, u) => s + (Number(u?.netSalary) || 0), 0);
    const dailyMonthlyDebt = useFinanceStore(
        s => (s.debts ?? []).reduce((acc, d) => acc + (Number(d?.minimumPayment) || 0), 0),
    );


    // [A11Y-CHARTS] — colonnes de la table de données sr-only (alternative texte à la courbe Recharts,
    // opaque aux lecteurs d'écran). Date (axe X) + chaque montant affiché (comptes empilés + Valeur Nette).
    // Le mode privé masque les MONTANTS (parité avec l'axe/tooltip déjà masqués), pas la date.
    const dataColumns = useMemo<ChartDataColumn[]>(() => {
        // ⚠️ `Number(v) || 0` transformait une valeur ABSENTE en « 0 $ » (finding revue) : la table
        // aurait annoncé « CELI : 0 $ » là où la valeur est simplement inconnue.
        // ⚠️ Le motif d'origine (« en vue quotidienne les colonnes par compte n'existent pas ») est
        // PÉRIMÉ depuis [FUTUR-DAILY-FULL] : `dailyLedger` ventile les soldes par compte au jour, et
        // ces colonnes se remplissent donc aussi en vue jour. Le garde reste nécessaire pour le
        // PRÉFIXE PASSÉ, où `NetWorth` est légitimement absent avant la 1re transaction connue.
        // ⚠️ Et ici le texte est LITTÉRAL (`NO_DATA_LABEL`), pas `emptyAware` : cette table est
        // `sr-only`, donc invisible — c'est la convention INVERSE de celle des cellules visibles, où
        // le libellé en clair polluerait l'écran. Le typecheck l'a d'ailleurs imposé : `format`
        // renvoie une chaîne, pas un nœud React.
        const money = (v: unknown) => {
            if (v === undefined || v === null || !Number.isFinite(Number(v))) return NO_DATA_LABEL;
            return isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCompactCAD(Number(v));
        };
        return [
            { key: 'dateLabel', label: 'Date', format: (_v, row) => {
                const r = row as { dateLabel?: string; year?: number };
                return r.dateLabel ?? (r.year !== undefined ? String(r.year) : '');
            } },
            { key: 'NetWorth', label: 'Valeur nette', format: money },
            { key: 'Liquidites', label: 'Cash', format: money },
            { key: 'CELI', label: 'CELI', format: money },
            { key: 'CELIAPP', label: 'CELIAPP (FHSA)', format: money },
            { key: 'REER', label: 'REER', format: money },
            { key: 'REEE', label: 'REEE', format: money },
            { key: 'NonReg', label: 'Non-Enreg', format: money },
            { key: 'Crypto', label: 'Crypto', format: money },
            { key: 'Immobilier', label: 'Équité Immo', format: money },
        ];
    }, [isPrivacyMode]);

    // G5 — événement sélectionné (clic sur une pastille) → fiche détail.
    const [detailPoint, setDetailPoint] = useState<ProjectionChartPoint | null>(null);
    /**
     * [PASSE-REEL-TXN-DU-JOUR] Le JOUR cliqué, porté À PART du point de détail — et c'est
     * indispensable, pas une préférence de style.
     *
     * ⚠️ `detailPointFor` REMPLACE volontairement un point quotidien par son point MENSUEL hôte
     * (« un mois qui existe plutôt qu'un mois fantôme reconstitué depuis un jour »). Or `dayIso` et
     * `hostMonthIndex` sont posés ENSEMBLE (`dailyLedger.ts`) : lire `dayIso` sur le point rebasé
     * donne donc TOUJOURS `undefined`. Ma première version le faisait — la section « Transactions
     * du jour » était rigoureusement INATTEIGNABLE en clic réel, alors que ses tests passaient
     * (ils rendaient la modale avec une fixture portant `dayIso` à la main, court-circuitant tout
     * le chemin). Classe `UX-UNREACHABLE-FEATURE`, trouvée par la revue.
     *
     * ⚠️ Le correctif n'est PAS de fusionner `{ ...pointMensuel, dayIso }` : ça fabriquerait un
     * point hybride dont les montants sont mensuels et la date quotidienne — un faux, exactement ce
     * que la règle no-fake-data interdit pour un objet. Le jour voyage donc SÉPARÉMENT.
     */
    const [detailDayIso, setDetailDayIso] = useState<string | null>(null);
    /**
     * [FUTUR-DETAIL-STEP-DAY] Ancre de NAVIGATION du panneau — distincte de `detailDayIso`.
     *
     * ⚠️ `detailDayIso` est gated sur `dayIsReal` : il autorise à AFFIRMER des transactions
     * mesurées, et un jour futur n'en a pas (no-fake-data). Se déplacer d'un jour à l'autre
     * n'affirme rien, donc l'ancre est posée sur TOUT jour, projeté compris. Les fusionner ferait
     * soit mentir l'affichage, soit geler les flèches dans le futur.
     */
    const [detailAnchorIso, setDetailAnchorIso] = useState<string | null>(null);
    const [detailMonthIso, setDetailMonthIso] = useState<string | null>(null);



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

    // [R3] Tooltip FIGEABLE : survol = suit la souris (portail, pointer-events:none) ;
    // clic = FIGE (devient ancré, scrollable, interactif) ; Échap / clic-dehors libère.
    // Le moteur d'état + le positionnement vivent dans le hook ; ici on ne fait que
    // l'alimenter (point survolé via Recharts, position via mousemove) et router le clic.
    // [FUTUR-MOBILE-LAYOUT] Sur téléphone, l'infobulle FIGÉE devient un BOTTOM SHEET pleine
    // largeur : la boîte flottante de 288 px recouvrait la moitié de l'écran en la laissant
    // illisible (retour Marc « trop cramped »). `dockedRef` débraye le positionnement impératif
    // du hook (le sheet est ancré par CSS) — assigné après coup car il dépend de tooltip.mode.
    const isNarrowViewport = useViewportBelowSm();
    const tooltipDockedRef = useRef(false);
    const tooltip = useChartTooltipPosition<ProjectionChartPoint>({
        getKey: (p) => p.monthIndex,
        containerRef: zoom.containerEl,
        dockedRef: tooltipDockedRef,
    });
    const tooltipIsSheet = isNarrowViewport && tooltip.mode === 'frozen';
    tooltipDockedRef.current = tooltipIsSheet;

    // Rotation/redimensionnement traversant 640px pendant un point FIGÉ : le portail est REMONTÉ
    // (key sheet/float) — le nouveau nœud flottant naît au style JSX (0,0) et l'effet interne du
    // hook ne se redéclenche pas (point/mode inchangés). Repositionner (no-op côté sheet, ancré
    // CSS) et refocus (le nœud qui portait le focus a été détruit → focus tombé sur body).
    const { mode: tooltipMode, reposition: tooltipReposition, tooltipRef: tooltipNodeRef } = tooltip;
    useEffect(() => {
        if (tooltipMode !== 'frozen') return;
        tooltipReposition();
        tooltipNodeRef.current?.focus();
    }, [tooltipIsSheet, tooltipMode, tooltipReposition, tooltipNodeRef]);

    // [REFONTE-NAV-L6a] Publication du contexte d'écran « Futur » pour l'assistant (chat panneau
    // ouvert par-dessus cet onglet — patron CHAT-PAGE-CONTEXT, scope-guard + purge mode discret à
    // la source via useViewContextPublisher). Résumé bâti sur `results` = la courbe AFFICHÉE
    // (source unique lastProjection, ou son gel PROJECTION-PERSIST quand la courbe est figée) —
    // JAMAIS un recalcul côté UI. Courbe non visible (gate d'amorçage) → détail « sans
    // projection » : le prompt l'avoue, zéro chiffre (no-fake-data).
    // Point sélectionné = modal détail ouvert, sinon infobulle FIGÉE (dernière sélection active).
    const selectedCurvePoint = detailPoint ?? (tooltip.mode === 'frozen' ? tooltip.point : null);
    const futureViewDetail = useMemo(
        () => buildFutureViewDetail(curveVisible ? results : null, selectedCurvePoint),
        [curveVisible, results, selectedCurvePoint],
    );
    useViewContextPublisher('future', futureViewDetail);

    // [FUTUR-DAILY lot B étape 2] La COURBE elle-même au jour, quand la fenêtre est assez serrée.
    // ⚠️ CORRECTION DE CAP (Marc, 2026-08-11) : « je veux pas voir dans l'info bulle le détail des
    // jours de chaque mois, je veux pouvoir sélectionner chaque jour dans le graph ». La version
    // précédente listait les jours DANS l'infobulle — c'était lire, pas sélectionner. Ici, chaque
    // jour devient un POINT du graphe : on le survole, on le fige, on l'ouvre, comme un mois.
    //
    // ⚠️ Le zoom, lui, reste MENSUEL : `useTimeChartZoom` indexe le tableau mensuel et c'est sa
    // fenêtre qui décide. On ne substitue que la SÉRIE RENDUE. Découpler les deux éviterait de
    // réécrire la logique de zoom/pan pour un gain nul.
    // [FUTUR-DAILY-PAST-REAL] Les jours du PASSÉ, reconstruits depuis les VRAIES données (demande
    // Marc 2026-08-11 : « je veux aussi que ça marche pour le passé, en fonction de la valeur de mes
    // comptes, de mes dépenses »). Sans ça, un jour d'hier était INTERPOLÉ entre deux points mensuels
    // — un lissage là où l'app connaît la vérité au jour près (transactions datées, prix datés).
    //
    // [FUTUR-DAILY-NATIVE] Le passé RÉEL au jour, reconstruit UNE fois pour TOUTE la plage passée
    // (plus seulement la fenêtre zoomée) : from = 1er mois ventilable du préfixe, to = aujourd'hui.
    // ⚠️ Dépendances PRIMITIVES (`from`/`to`) : un objet intermédiaire recréé à chaque rendu
    // rejouerait la reconstruction à chaque frame de zoom/pan (classe de fuite déjà vue ici).
    const dailyPastFrom = useMemo(() => {
        const first = dailyAnchors[0];
        if (!first) return null;
        const firstIso = isoDate(first.year, first.month, 1);
        return firstIso < todayIso ? firstIso : null; // aucun passé ventilable → pas de reconstruction
    }, [dailyAnchors, todayIso]);
    const dailyPast = useMemo(() => {
        if (!dailyPastFrom) return null;
        const built = buildDailyPastLedger({
            from: dailyPastFrom,
            to: todayIso,
            today: todayIso,
            transactions,
            currentCash: calculatedStartingCash || 0,
            assets: storeAssets,
            fx: fxRates,
            equityByYear: reconstructRealEstateEquityByYear(realEstateGoals, startYear),
            currentDebtNonImmo,
            debts: storeDebts,
        });
        return {
            byDate: built.rows.length ? new Map(built.rows.map((r) => [r.date, r])) : null,
            // ⚠️ [FUTUR-DAILY-ANCHOR-CAVEAT] Sommes que l'ANCRE compte mais que la série quotidienne
            // ne peut pas placer (transactions au MOIS seul, ou datées APRÈS aujourd'hui). Non nul ⇒
            // tout le niveau passé est décalé d'autant — et le bandeau le DIT. L'avertissement vivait
            // dans le panneau quotidien, supprimé par [FUTUR-DAILY-INFOBULLE-ONLY] : le retrait de la
            // surface ne devait pas emporter l'honnêteté avec elle.
            undatedTotal: built.undatedTotal,
            flowsAfterNowDate: built.flowsAfterNowDate,
            // [PASSE-REEL-CAP-400J] Le plafond de reconstruction a mordu : la courbe s'arrête
            // AVANT la fin de la fenêtre demandée. Muet jusqu'ici — c'est précisément ce qui a
            // fait qu'un trou de 7 mois est passé inaperçu jusqu'à ce que Marc le signale.
            truncatedFrom: built.truncatedFrom,
            // [PASSE-REEL-RACCORD-CHUTE] Le flux du jour que la reconstruction a DÉFAIT pour produire
            // la veille : c'est la marche visible au raccord (« je vois une chute de 10k aujourd'hui
            // jsp pourquoi »). Les deux points sont justes — c'est leur lecture qui manquait.
            fluxPeriodeAnnulee: built.fluxPeriodeAnnulee,
        };
    }, [dailyPastFrom, todayIso, transactions, calculatedStartingCash, storeAssets, fxRates, realEstateGoals, startYear, currentDebtNonImmo, storeDebts]);
    const dailyPastByDate = dailyPast?.byDate ?? null;
    // [PASSE-REEL-RACCORD-CHUTE] Le fait est dérivé du module qui le PRODUIT ; le composant ne
    // relit pas les transactions pour se faire une seconde opinion.
    const mentionRaccordJour = useMemo(
        () => (dailyPast === null ? '' : mentionRaccord(dailyPast.fluxPeriodeAnnulee)),
        [dailyPast],
    );
    // [PASSE-REEL-RACCORD-CHUTE-MENSUEL] Même explication pour la vue par MOIS, où la marche est
    // structurellement plus grosse (elle annule TOUT le mois courant) — et c'est la vue par défaut.
    // ⚠️ Gaté sur `dailyPast === null` : quand la reconstruction au JOUR est en place, le dernier
    // point du passé est une JOURNÉE, donc c'est la marche du jour que Marc voit et la mention
    // mensuelle décrirait un raccord qui n'est pas à l'écran. Une phrase qui explique la mauvaise
    // marche est pire que pas de phrase.
    const mentionRaccordMois = useMemo(
        () => (dailyPast !== null ? '' : mentionRaccord(pastPrefix.fluxPeriodeAnnulee)),
        [dailyPast, pastPrefix],
    );
    /**
     * [PASSE-REEL-VARIATION-DU-JOUR] La ventilation du jour ouvert, calculée à partir des lignes
     * DÉJÀ reconstruites — aucune donnée nouvelle, aucun recalcul financier.
     *
     * ⚠️ Une variation est une DIFFÉRENCE : il faut la VEILLE. Si elle manque (premier jour
     * reconstruit, ou trou dans la série), `dayVariation` rend `null` et la section ne s'affiche
     * pas — plutôt qu'un 0 crédible et faux.
     */
    const variationDuJour = useMemo(() => {
        if (!detailDayIso || !dailyPastByDate) return null;
        const jour = dailyPastByDate.get(detailDayIso);
        if (!jour) return null;
        const veilleIso = addDay(detailDayIso, -1);
        return dayVariation(jour, dailyPastByDate.get(veilleIso));
    }, [detailDayIso, dailyPastByDate]);

    // Contexte daté (paie/charges/dettes) — un objet STABLE pour la ventilation courbe + infobulle.
    const dailyDated = useMemo(() => ({
        recurring: storeRecurring,
        monthlyNetSalary: dailyMonthlyNet,
        monthlyDebtPayment: dailyMonthlyDebt,
    }), [storeRecurring, dailyMonthlyNet, dailyMonthlyDebt]);

    /**
     * [FUTUR-DAILY-NATIVE] LA série de la courbe : toute la projection ventilée au JOUR, une fois
     * par changement de projection (~100 ms et ~15 champs/point pour 30 ans — mesuré ; la
     * ventilation COMPLÈTE à 99 champs coûterait ~500 ms et ~180 Mo, elle est réservée à
     * l'infobulle via `enrichDailyPoint`). Le zoom, lui, continue d'indexer le tableau MENSUEL :
     * sa fenêtre découpe cette série par VALEUR d'abscisse (`sliceDailyByX`), jamais par indice.
     */
    const dailyAll = useMemo<ProjectionChartPoint[]>(() => {
        if (dailyAnchors.length < 2) return EMPTY_ARRAY as unknown as ProjectionChartPoint[];
        const keep = new Set(dailyAnchors.map((a) => a.monthIndex));
        const months = (displayData as ProjectionChartPoint[]).filter((p) => keep.has(p.monthIndex));
        if (months.length < 2) return EMPTY_ARRAY as unknown as ProjectionChartPoint[];

        const days = buildDailyLedger({
            months,
            startYear,
            startMonth,
            dated: dailyDated,
            fields: CURVE_FIELDS,
        });
        if (days.length === 0) return EMPTY_ARRAY as unknown as ProjectionChartPoint[];

        // [PASSE-REEL-1] `todayIso` transmis ⇒ une journée PASSÉE sans donnée réelle rend `null` et
        // n'est PAS tracée (avant : elle affichait le point PROJETÉ, présenté comme du passé).
        // La courbe commence donc où les données commencent — décision Marc 2026-08-13.
        const points = days
            .map((d) => mergeDailyRealPoint(d, startYear, startMonth, dailyPastByDate, CURVE_FIELDS, syncConfirmedUntilIso, todayIso))
            .filter((p): p is ProjectionChartPoint => p !== null);
        if (points.length === 0) return EMPTY_ARRAY as unknown as ProjectionChartPoint[];
        // ⚠️ `FluxImpots` ≈ 0 (tous les jours SAUF l'échéance, cadence monthEnd) devient ABSENT :
        // recharts ne rend pas de rect pour une valeur absente — sinon la Bar créerait ~11 000
        // rects DOM à hauteur nulle. Vérifié par la sonde perf (comptage des rects rendus).
        for (const p of points) {
            const v = (p as Record<string, unknown>).FluxImpots;
            if (typeof v === 'number' && Math.abs(v) < 0.005) delete (p as Record<string, unknown>).FluxImpots;
        }
        // [FUTUR-DAILY-NATIVE] Le mois ANCRE (1er de la série, non ventilable — pas de mois d'avant)
        // n'est pas perdu pour autant : ses jours PASSÉS RÉELS sont construits depuis les données
        // seules (no-fake), et à défaut le point MENSUEL d'origine tient la position — sinon la
        // courbe ET la bande « Passé réel » commençaient un mois trop tard (e2e d'axe, bande 4 px).
        const anchorHost = months[0].monthIndex;
        const anchorDays = realOnlyMonthPoints(anchorHost, startYear, startMonth, dailyPastByDate, CURVE_FIELDS, syncConfirmedUntilIso);
        if (anchorDays.length > 0) return [...anchorDays, ...points];
        // ⚠️ `FluxImpots` RETIRÉ du point mensuel de repli (finding projection-validator #592) : ce
        // point porte le TOTAL du mois à l'abscisse du 1er — au milieu de barres quotidiennes, une
        // barre mensuelle pleine au mauvais jour est un faux visuel. Son échéance vit dans le mois
        // suivant ventilé ; ici l'honnête est l'absence.
        const { FluxImpots: _anchorFlux, ...anchorRest } = months[0] as ProjectionChartPoint & { FluxImpots?: number };
        return [anchorRest as ProjectionChartPoint, ...points];
    }, [dailyAnchors, displayData, startYear, startMonth, dailyDated, dailyPastByDate, syncConfirmedUntilIso, todayIso]);

    // [PASSE-REEL-2] Écart entre le passé MESURÉ et la prévision VERROUILLÉE. Calculé sur la série
    // quotidienne — c'est elle qui porte les points réels (depuis `[PASSE-REEL-1]`, une journée
    // passée non mesurée n'y est même plus présente, donc rien de projeté ne peut s'y glisser).
    const forecastAccuracy = useMemo(
        () => computeForecastAccuracy(dailyAll, lockedByMonth),
        [dailyAll, lockedByMonth],
    );


    /**
     * [FUTUR-DAILY-NATIVE] Infobulle : le point COMPLET (99 champs) du jour visé, ventilé À LA
     * DEMANDE sur 3 mois autour du mois hôte (~10 ms la première fois, caché ensuite par mois).
     * 3 mois et non 2 : les `diff*` du 1er jour du mois hôte exigent la veille, donc le mois
     * précédent rendu — qui exige lui-même SON prédécesseur comme ancre d'entrée.
     * Même moteur (`buildDailyLedger`), mêmes entrées que la courbe → aucune divergence possible
     * (garde-test de parité). Le merge passé réel passe par la MÊME fonction que la courbe.
     */
    // ⚠️ `useMemo` et NON `useRef`+`useEffect` de purge (finding revue #592) : un effet s'exécute
    // APRÈS la peinture — entre le rendu sur de nouvelles données et l'effet, un mousemove pouvait
    // servir une entrée calculée sur les ANCIENNES données. Le useMemo se recrée PENDANT le rendu :
    // la fenêtre de staleness n'existe pas, par construction.
    const enrichCache = useMemo(() => ({
        byHost: new Map<number, Map<string, ProjectionChartPoint>>(),
        failLogged: new Set<number>(),
        // Les deps SONT les entrées de l'enrichissement — un cache qui survivrait à l'une d'elles
        // servirait des montants périmés. La règle les voit « inutiles » (la fabrique ne les lit
        // pas) : c'est exact, et c'est le but — elles pilotent l'INVALIDATION, pas la valeur.
        //
        // ⚠️ [PASSE-REEL-1, panel #614] `todayIso` EN FAIT PARTIE, et je l'avais oublié — au point
        // d'écrire dans le handover « ajouté aux DEUX useMemo » alors qu'il y en a TROIS. Sans lui :
        // l'app reste ouverte, minuit passe, et la Map en cache pour ce mois a été construite avec
        // l'ANCIEN `todayIso` — le jour qui vient de basculer au passé y porte encore sa valeur
        // PROJETÉE. C'est le bug même que cette PR corrige, réapparu côté infobulle. Et comme
        // l'infobulle FIGÉE alimente le contexte envoyé à l'assistant, la fausse valeur héritait de
        // l'autorité d'une « source unique ».
        // ⚠️ Ça ne se voyait pas en pratique : `dailyPastByDate` est une NOUVELLE Map à chaque
        // changement de `todayIso`, ce qui invalidait ce cache par ricochet. Une protection
        // ACCIDENTELLE — mémoïser `dailyPast` plus finement un jour aurait réintroduit le bug en
        // silence. Une dépendance ne doit pas reposer sur l'instabilité de référence d'une autre.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [displayData, dailyDated, dailyPastByDate, startYear, startMonth, syncConfirmedUntilIso, todayIso]);
    const enrichDailyPoint = useCallback((p: ProjectionChartPoint | null): ProjectionChartPoint | null => {
        if (!p) return null;
        const dp = p as unknown as DailyChartPoint;
        const host = dp.hostMonthIndex;
        const iso = dp.dayIso;
        if (typeof host !== 'number' || typeof iso !== 'string') return p; // pas un jour de la courbe
        const cached = enrichCache.byHost.get(host);
        if (cached) return cached.get(iso) ?? p;

        // ⚠️ Toute la construction (y compris le cas ANCRE hostIdx=0, ventilé du réel seul) vit
        // dans `buildEnrichedMonth` — PUR et testé. Finding CRITIQUE silent-failure #592 : la
        // version précédente mettait en cache une Map VIDE pour le mois ancre (`buildDailyLedger`
        // rend [] sur 1 seul mois) → l'infobulle de ce mois restait LÉGÈRE pour toujours, une
        // paie réelle devenant invisible comme si elle était nulle. Règles : un échec ne se met
        // JAMAIS en cache (le prochain survol retente), et il se JOURNALISE (une fois par mois
        // hôte — pas au rythme du mousemove).
        const byIso = buildEnrichedMonth(
            displayData as ProjectionChartPoint[], host, startYear, startMonth,
            dailyPastByDate, dailyDated, buildDailyLedger as never, syncConfirmedUntilIso, todayIso,
        );
        if (byIso === null) {
            if (!enrichCache.failLogged.has(host)) {
                enrichCache.failLogged.add(host);
                logError({ source: 'ui', severity: 'warning', message: 'FUTUR-DAILY-NATIVE : enrichissement du mois impossible, infobulle en champs réduits', context: { host } });
            }
            return p;
        }
        enrichCache.byHost.set(host, byIso);
        return byIso.get(iso) ?? p;
    }, [displayData, startYear, startMonth, dailyDated, dailyPastByDate, enrichCache, syncConfirmedUntilIso, todayIso]);

    /**
     * Point à passer à la modale « Détail complet ».
     *
     * ⚠️ Finding CRITIQUE de la revue : `FutureDetailModal` joint sur `chartData.findIndex(d =>
     * d.monthIndex === point.monthIndex)`. Sur un point QUOTIDIEN, `monthIndex` est fractionnaire →
     * aucune correspondance sauf le 1er du mois, et la modale retombait alors sur ses `|| 0` :
     * « Variation nette (mois) +0 $ » systématique, et surtout un `Math.max(0, 0 − NetWorth)` qui
     * FABRIQUAIT un montant de dette égal au patrimoine net dès que celui-ci était négatif.
     * On rabat donc sur le VRAI mois hôte : la modale est mensuelle, elle montre le mois — ce qui
     * existe — au lieu d'un mois fantôme reconstitué à partir d'un jour.
     */
    const detailPointFor = useCallback((p: ProjectionChartPoint | null): ProjectionChartPoint | null => {
        if (!p) return null;
        const host = (p as unknown as DailyChartPoint).hostMonthIndex;
        if (typeof host !== 'number') return p; // point mensuel : inchangé
        return (displayData as ProjectionChartPoint[]).find((d) => d.monthIndex === host) ?? null;
    }, [displayData]);

    /**
     * [FUTUR-DAILY-NATIVE] Deux séries, deux rôles :
     *  • `daysInWindow` — la tranche quotidienne COMPLÈTE de la fenêtre de zoom (bornes mensuelles,
     *    découpe par valeur d'abscisse). C'est LA vérité de sélection : clic, Veille/Lendemain et
     *    résolution géométrique y travaillent — le jour exact est sélectionnable à toute fenêtre.
     *  • `chartSeries` — ce que recharts TRACE : la même tranche, DÉCIMÉE au-delà de
     *    RENDER_MAX_POINTS (mesuré : ~11 000 pts × 8 aires gèlent le main thread au point que
     *    `mouse.wheel` expire — clause annoncée à Marc au cadrage GO).
     * Repli mensuel uniquement quand la ventilation est impossible (< 2 mois à valeur nette finie).
     */
    const visLoMonth = zoom.visibleData[0]?.monthIndex;
    const visHiMonth = zoom.visibleData[zoom.visibleData.length - 1]?.monthIndex;
    const dailyWindowRange = useMemo<[number, number]>(() => {
        if (dailyAll.length === 0 || visLoMonth === undefined || visHiMonth === undefined) return [0, 0];
        return sliceDailyRangeByX(dailyAll, visLoMonth, visHiMonth);
    }, [dailyAll, visLoMonth, visHiMonth]);
    const daysInWindow = useMemo<ProjectionChartPoint[]>(
        () => dailyAll.slice(dailyWindowRange[0], dailyWindowRange[1]),
        [dailyAll, dailyWindowRange],
    );
    const isDailyCurve = daysInWindow.length >= 2;
    const chartSeries = useMemo<ProjectionChartPoint[]>(() => {
        if (!isDailyCurve) return zoom.visibleData as ProjectionChartPoint[];
        return decimateForRender(daysInWindow, dailyWindowRange[0], RENDER_MAX_POINTS);
    }, [isDailyCurve, daysInWindow, dailyWindowRange, zoom.visibleData]);
    /** Série de RÉSOLUTION des interactions : les jours complets, ou le mensuel en repli. */
    const selectSeries = isDailyCurve ? daysInWindow : (zoom.visibleData as ProjectionChartPoint[]);


    // [FUTUR-DAILY-SELECT-PATH] Depuis un point MENSUEL figé : zoomer la fenêtre sur CE mois → vue
    // au jour, centrée là où l'utilisateur venait de cliquer, N'EXISTE PLUS : la courbe est au jour
    // PARTOUT ([FUTUR-DAILY-NATIVE]) — le clic sélectionne directement le jour, sans étape.

    // [FUTUR-DAILY-SELECT-STEP] Depuis un point QUOTIDIEN figé : figer la veille / le lendemain sans
    // re-viser au pixel (à ~150 jours affichés, un jour ≈ 6 px — mesuré ; en vue 30 ans, ~0,3 px).
    // Fonctionne aussi au DOIGT, où le zoom molette n'existe pas. La recherche se fait par VALEUR
    // d'abscisse dans la série rendue (les jours ne sont pas régulièrement espacés — même raison
    // que resolvePointByX).
    // ⚠️ `selectSeries` (tranche COMPLÈTE) et non `chartSeries` (décimée) : les flèches avancent
    // d'exactement UN jour, y compris ceux que le tracé décimé ne rend pas.
    const frozenSeriesIdx = useMemo(() => {
        if (tooltip.mode !== 'frozen' || !tooltip.point) return -1;
        const x = tooltip.point.monthIndex;
        return selectSeries.findIndex((d) => d.monthIndex === x);
    }, [tooltip.mode, tooltip.point, selectSeries]);
    const stepDay = useCallback((dir: -1 | 1) => {
        if (frozenSeriesIdx === -1) return;
        const next = selectSeries[frozenSeriesIdx + dir];
        // ⚠️ `enrichDailyPoint` : la série de la courbe est LÉGÈRE (champs tracés) — l'infobulle
        // fige toujours le point COMPLET du jour.
        if (next) tooltip.freezeOn(enrichDailyPoint(next) ?? next);
    }, [frozenSeriesIdx, selectSeries, tooltip, enrichDailyPoint]);

    /**
     * [FUTUR-DETAIL-STEP-DAY] Ouvre le panneau de détail SUR un point donné.
     *
     * ⚠️ Extrait pour être appelé de DEUX endroits — le bouton « Détail complet » de l'infobulle et
     * les flèches Veille/Lendemain du panneau lui-même. Les trois états (point, jour, mois) doivent
     * bouger ENSEMBLE : un `detailDayIso` qui resterait sur la veille afficherait les transactions
     * d'un jour à côté du patrimoine d'un autre. Dupliquer ce trio à deux endroits, c'est
     * garantir qu'un des deux oubliera un état.
     */
    const ouvrirDetailSur = useCallback((pt: ProjectionChartPoint | null | undefined) => {
        if (!pt) return;
        const p = pt as ProjectionChartPoint & { dayIso?: string; dayIsReal?: boolean };
        const cal = calendarFromMonthIndex(startYear, startMonth, Math.floor(p.monthIndex ?? 0));
        const moisIso = `${cal.year}-${String(cal.month + 1).padStart(2, '0')}`;
        setDetailMonthIso(moisIso <= todayIso.slice(0, 7) ? moisIso : null);
        setDetailDayIso(p.dayIsReal ? (p.dayIso ?? null) : null);
        setDetailAnchorIso(p.dayIso ?? null);
        setDetailPoint(detailPointFor(pt));
    }, [startYear, startMonth, todayIso, detailPointFor]);

    /**
     * [FUTUR-DETAIL-STEP-DAY] Position du point AFFICHÉ DANS LE PANNEAU au sein de la série.
     *
     * ⚠️ Volontairement indépendant de `frozenSeriesIdx` (l'infobulle). Le panneau s'ouvre aussi
     * depuis une pastille d'événement, sans infobulle figée — et une fois ouvert, l'infobulle peut
     * être relâchée. Se caler sur elle laisserait les flèches inertes exactement dans ces cas.
     * On résout par `dayIso` quand il existe (unique), sinon par `monthIndex`.
     */
    const detailSeriesIdx = useMemo(
        // ⚠️ L'ancre vient de `detailAnchorIso` (point d'ORIGINE), PAS de `detailPoint` — celui-ci
        // est rebasé sur le mois par `detailPointFor` et n'a donc jamais de `dayIso`. Détail du
        // défaut mesuré dans `utils/daySeriesIndex.ts`.
        () => resolveDaySeriesIndex(
            selectSeries as unknown as DaySeriesPoint[],
            detailAnchorIso,
            detailPoint?.monthIndex,
        ),
        [detailAnchorIso, detailPoint, selectSeries],
    );

    /** Jour voisin DANS le panneau ouvert — demande de Marc (2026-08-17) : le panneau était un
     *  cul-de-sac, il fallait le fermer, re-viser au pixel sur la courbe, et le rouvrir. */
    const stepDetailDay = useCallback((dir: -1 | 1) => {
        if (detailSeriesIdx === -1) return;
        const next = selectSeries[detailSeriesIdx + dir];
        if (next) ouvrirDetailSur(enrichDailyPoint(next) ?? next);
    }, [detailSeriesIdx, selectSeries, enrichDailyPoint, ouvrirDetailSur]);

    // [R3] Clic sur le graphe = FIGE le tooltip (avant : ouvrait directement la modale).
    // La modale exhaustive s'ouvre désormais via le bouton « Détail complet » du tooltip
    // figé, et via les pastilles d'événement (inchangées). On résout le mois cliqué par
    // GÉOMÉTRIE (robuste tactile / sans survol), avec repli sur le dernier point survolé.
    // On ignore les glissers (pan) via la distance depuis le mousedown.
    /**
     * [FUTUR-CLICK-AREA] ⚠️ `pointerup` et NON `click` — et ce n'est PAS un détail de style.
     *
     * MESURÉ (sonde Playwright, 2026-08-11) : quand le pointeur retombe sur une AIRE EMPILÉE
     * (`path.recharts-curve.recharts-area-area`), le navigateur ne dispatche **aucun** événement
     * `click` — pas même au niveau `document` en phase de capture. Sur l'espace vide du graphe
     * (`svg.recharts-surface`), il le dispatche normalement. Cause : recharts re-rend le `<path>`
     * entre le `pointerdown` et le `pointerup` (le survol change son état), donc les deux cibles ne
     * sont plus le MÊME nœud DOM et le `click` n'est jamais synthétisé. `pointerup`, lui, arrive
     * bien jusqu'au conteneur dans les deux cas — vérifié côté à côté.
     *
     * CONSÉQUENCE UTILISATEUR, antérieure à la vue au jour : cliquer sur la partie COLORÉE de la
     * courbe ne figeait jamais l'infobulle. Seuls les clics dans le vide au-dessus de la pile
     * marchaient. Le défaut est resté invisible parce que l'e2e cliquait justement dans le vide ;
     * il est devenu criant en vue au jour, où les aires par compte couvrent presque tout le tracé.
     */
    const handleChartContainerClick = (e: React.PointerEvent<HTMLDivElement>) => {
        // [FUTUR-DAILY-TOUCH] Le lever du 2e doigt en fin de PINCEMENT émet un pointerup à faible
        // dérive qui passerait le garde anti-pan ci-dessous → jour figé que personne ne visait.
        if (zoom.isPinchActive()) return;
        const down = pointerDownPosRef.current;
        // ⚠️ Tolérance de dérive ADAPTATIVE (sonde 2026-08-12 : avec le seuil fixe à 6 px, un clic
        // qui dérive de 8 px pendant le geste ne faisait RIEN — mesuré drift 8/10 px → aucun jour
        // figé). Le critère est la DENSITÉ de la fenêtre, pas le mode (la courbe est toujours au
        // jour) : fenêtre serrée (≤ ~6 mois rendus) → 14 px de pan ≈ 0,08 mois, imperceptible,
        // donc le geste est un CLIC ; vue large → 14 px = plusieurs mois de pan réel, on garde 6 px.
        const driftTol = selectSeries.length <= 190 ? 14 : 6;
        if (down && (Math.abs(e.clientX - down.x) > driftTol || Math.abs(e.clientY - down.y) > driftTol)) return; // glisser = pan
        // Les pastilles d'événement ont DÉJÀ leur action (ouvrir la modale). Sans ce garde, le même
        // geste ferait les deux — modale ouverte ET infobulle figée dessous.
        if ((e.target as Element | null)?.closest?.('button, a, [role="button"]')) return;
        const grid = zoom.containerEl.current?.querySelector('.recharts-cartesian-grid');
        const rect = grid?.getBoundingClientRect();
        // ⚠️ `resolvePointByX` et NON `resolvePointFromClick` (par indice) : en mode QUOTIDIEN les
        // points ne sont PAS régulièrement espacés — un jour de février vaut 1/28 de mois, un jour
        // de mars 1/31. Résoudre par indice y sélectionnerait un autre jour que celui visé, sans
        // rien casser d'apparent. On résout donc par valeur d'abscisse, ce qui reste exact pour la
        // série mensuelle uniforme.
        // ⚠️ `selectSeries` (tranche quotidienne COMPLÈTE) et non `chartSeries` (tracé décimé en
        // vue large) : le clic sélectionne le jour EXACT sous le curseur, y compris un jour que le
        // tracé ne rend pas — c'est le contrat « sélectionner sur la courbe direct ».
        const point = resolvePointByX(
            e.clientX,
            rect ? { left: rect.left, width: rect.width } : null,
            selectSeries,
            (p) => p.monthIndex,
        ) ?? lastHoverPointRef.current; // repli : dernier point survolé
        // ⚠️ Le point de la série est LÉGER (champs de la courbe) : on fige sa version COMPLÈTE.
        if (point) tooltip.freezeOn(enrichDailyPoint(point) ?? point);
    };

    // [D6-GRAPH] Sélection d'un jour AU CLAVIER. Le seul chaînon qui manquait : une fois un jour
    // FIGÉ, tout est déjà clavier (l'infobulle figée est un dialogue focalisé avec Veille/
    // Lendemain, « Détail complet » et Échap — le hook restitue le focus au conteneur au
    // relâchement). Il manquait le PREMIER geste : figer un jour sans souris. Entrée/Espace/
    // flèches sur le conteneur figent le jour d'AUJOURD'HUI (frontière passé/futur — l'ancre la
    // plus parlante), ou le point le plus proche si la fenêtre zoomée ne le contient pas.
    // ⚠️ `e.target === e.currentTarget` : les pastilles d'événement DANS le conteneur ont leurs
    // propres touches (Entrée/Espace = modale) — on ne double pas leur geste.
    const figerAuClavier = useCallback(() => {
        if (selectSeries.length === 0) return;
        const idxAujourdhui = selectSeries.findIndex((p) => p.monthIndex >= 0);
        const point = selectSeries[idxAujourdhui === -1 ? selectSeries.length - 1 : idxAujourdhui];
        if (point) tooltip.freezeOn(enrichDailyPoint(point) ?? point);
    }, [selectSeries, tooltip, enrichDailyPoint]);
    const handleChartKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.target !== e.currentTarget) return;
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault(); // Espace/flèches : ne pas défiler la page pendant le geste
        figerAuClavier();
    };

    // C6 fix (Sprint 1B) — Garde déplacée ICI (après tous les hooks) pour
    // respecter la règle des Hooks. Retourne un placeholder UI si les props
    // critiques manquent. Avant ce fix, cette garde était ligne 46 (avant les
    // 21 hooks ci-dessus) → 21 violations react-hooks/rules-of-hooks.
    if (!budgetItems || !projection || !config || !initialBalances) {
        // SF-RESIDUS — routé vers logError (visible en prod). Context = QUELS champs manquent
        // (booléens), pas les objets eux-mêmes (évite de loguer des données financières inutilement).
        logError({ source: 'ui', severity: 'error', message: 'FutureProjection : données d\'initialisation critiques manquantes', context: { hasBudget: !!budgetItems, hasProjection: !!projection, hasConfig: !!config, hasBalances: !!initialBalances } });
        return <div className="p-8 text-center text-red-400 font-bold bg-surface/50 rounded-2xl border border-red-500/20">
            ⚠️ Données d'initialisation manquantes. Veuillez vérifier vos comptes et votre budget.
        </div>;
    }

    // F1 (audit 2026-05-28) + PH2-c — projection plantée : le moteur app-level (ProjectionEngine)
    // ne publie PAS un résultat en erreur dans store.lastProjection (no-fake-data) ; il bascule
    // `projectionStatus` à 'error'. On affiche donc une erreur honnête depuis ce statut plutôt que
    // de rendre un graphe à $0. Dashboard/Investments/Budget gardent la dernière projection valide.
    if (hasError) {
        // [ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] ⚠️ `projectionStatus === 'error'` recouvre
        // désormais DEUX causes très différentes, et cet écran est le SEUL à ne pas les distinguer :
        // les six autres onglets passent par `ProjectionRequired`, qui nomme le champ. Or c'est ici
        // qu'on vient chercher « pourquoi ma projection ne marche plus ». Pire, le conseil
        // « désactive Monte-Carlo » est une fausse piste devant une entrée illisible — il ne répare
        // rien (finding panel #764).
        return <div className="p-8 text-center bg-surface/50 rounded-2xl border border-red-500/20 space-y-2">
            <div className="text-2xl" aria-hidden="true">⚠️</div>
            <div className="text-red-400 font-bold">
                {projectionRefus ? 'Donnée illisible' : 'Le calcul de la projection a échoué.'}
            </div>
            <div className="text-sm text-ink-300 max-w-md mx-auto">
                {projectionRefus ?? (<>
                    Vérifie tes paramètres (revenus, dépenses, comptes, objectifs). L'erreur a été
                    journalisée.{runMC ? ' Tu peux aussi désactiver le mode Monte-Carlo et réessayer.' : ''}
                </>)}
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
    // [FUTUR-ICON-DENSITY] `sampleEvenly` répartit EXACTEMENT `cap` icônes (bug Marc « pas assez
    // d'icônes » : l'ancien pas entier `ceil(len/cap)` sous-remplissait — 25 events cap 24 → 13 montrés).
    const thinEvents = sampleEvenly;
    // [R4] Cap de densité en vue dézoomée (décision Marc 2026-06-22 : 40/24 → 24/16) : la vue large
    // reste « peu d'icônes » (échantillonnage uniforme) ; en zoomant, la fenêtre contient moins
    // d'événements que le cap → tous affichés (« jusqu'à toutes »). Cap FIXE (densité écran ≈ constante),
    // PAS proportionnel au span — un cap ∝ span ferait l'inverse (plus d'icônes dézoomé, moins en zoomant).
    const MAX_LIFE_ICONS = 24;
    const MAX_FLOW_ICONS = 16;
    // [R2] Les événements `pinned` (ex. pastille FIRE) ne sont JAMAIS écrêtés par l'échantillonnage : sinon, en
    // vue dézoomée (au-delà du cap), la pastille FIRE pouvait disparaître en silence (revue adversariale R2).
    // pinned en FIN : rendus en dernier → dessinés AU-DESSUS (SVG painter) si un autre événement tombe le même mois.
    // ⚠️ [FUTUR-DAILY-STACK-X] `assignStackIndex` EN DERNIER : le rang d'empilement décrit ce qui est
    // à l'écran, pas ce que le moteur a produit. Vie et flux s'empilent dans des sens OPPOSÉS → deux
    // appels séparés, jamais un rang partagé.
    const shownLifeEvents = assignStackIndex([
        ...thinEvents(visibleLifeEvents.filter((e) => !e.pinned), MAX_LIFE_ICONS),
        ...visibleLifeEvents.filter((e) => e.pinned),
    ]);
    const shownFlowEvents = assignStackIndex(thinEvents(visibleFlowEvents, MAX_FLOW_ICONS));
    const lastMonthIndex = chartData.length > 0 ? chartData[chartData.length - 1].monthIndex : 0;
    // ⚠️ Indices résolus sur `displayData` (= `pastPrefix` + `chartData`) et NON sur `chartData` :
    // c'est `displayData` que `useTimeChartZoom` indexe. Chercher dans `chartData` rendait un indice
    // décalé du nombre de mois de PASSÉ préfixés — le bouton « 5 ans » s'arrêtait alors
    // `pastPrefix.length` mois trop tôt, en silence, et son état actif se comparait au même indice
    // faux (donc cohérent avec lui-même, donc invisible).
    const idxForYears = (yrs: number) => {
        const i = (displayData as ProjectionChartPoint[]).findIndex((d) => d.monthIndex >= yrs * 12);
        return i === -1 ? displayData.length - 1 : i;
    };
    // [FUTUR-DAILY-NATIVE + finding a11y #592] Le bouton « Jour » (chemin vers la vue au jour) est
    // retiré — mais il était aussi le SEUL contrôle FOCUSABLE menant à une fenêtre centrée sur
    // AUJOURD'HUI : les presets « 5 ans… Tout » partent tous de l'origine. « Aujourd'hui » reprend
    // ce rôle-là (preset de FENÊTRE temporelle, ~6 mois autour du présent — pas un mode) : au
    // clavier, Tab + Entrée suffisent à regarder le présent de près. WCAG 2.1.1.
    const todayArrayIndex = (() => {
        const i = (displayData as ProjectionChartPoint[]).findIndex((d) => d.monthIndex >= todayMonthIndex);
        return i === -1 ? displayData.length - 1 : i;
    })();
    const todayPresetRange = centeredWindowRange(displayData.length, todayArrayIndex, 7);

    return (
        <div className="space-y-6 animate-fade-in pb-24">

            <PageHeader
                icon="🔮"
                title="Projection Future"
                subtitle="Analyse des flux mensuels projetés avec Loyer → Hypothèque automatique et frais enfants dynamiques."
                badge={insolvency ? (
                    // role="status" (live polite) : le badge apparaît après le calcul de projection →
                    // annoncé au lecteur d'écran si le plan bascule en insoutenable lors d'un recalcul.
                    <div role="status">
                        <Badge variant="danger" size="md">
                            {insolvency.age != null
                                ? `Plan insoutenable — capital épuisé vers ${insolvency.age} ans`
                                : 'Plan insoutenable — capital épuisé'}
                        </Badge>
                    </div>
                ) : undefined}
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

            {/* [NAV-MERGE-SANTE-FUTUR] Résumé condensé, toujours visible (pas de gate curveVisible :
                le score de santé ne dépend pas d'une projection calculée). */}
            <FutureHealthSummary />

            {/* Hero KPI strip — PH4 : caché tant que la projection n'est pas calculée explicitement
                (cf revealedSig) ; sinon les chiffres projetés s'affichaient sans geste de l'utilisateur. */}
            {curveVisible && (
            <StatGrid cols={4}>
                <KPIStat
                    label="Objectif FIRE"
                    icon="🎯"
                    // ⚠️ MESURÉ : l'ancien format restait en « k$ » quel que soit l'ordre de grandeur — une cible
                    // FIRE de 1,25 M$ s'affichait « 1250k $ ». `formatCompactCAD` bascule en M$.
                    value={formatCompactCAD(fireNumber)}
                    sublabel="Règle des 4%"
                    privacy
                    variant="warning"
                />
                <KPIStat
                    // Le fallback (value ci-dessous) tombe sur finalNetWorth/fireNumber quand estateNetWorth=0 :
                    // dans ce cas le nombre N'INCLUT PAS les rentes → libellé neutre + pas de tooltip « avec rentes »
                    // (sinon le libellé mentirait, le bug même que R1 corrige). Sinon : successoral, avec rentes.
                    label={results?.estateNetWorth ? "Patrimoine successoral, avec rentes" : "Patrimoine projeté"}
                    tooltip={results?.estateNetWorth ? "Patrimoine au décès : net de l'impôt de liquidation (REER et gains en capital imposés au décès) + la valeur actualisée des rentes RRQ/PSV restantes. Différent du patrimoine en fin d'horizon." : undefined}
                    icon="💼"
                    // Fallback : si estateNetWorth est 0 (rare en réalité ou bug
                    // silencieux du moteur), utiliser finalNetWorth puis fireNumber
                    // comme proxy. Évite d'afficher "0.00M$" trompeur en mode test.
                    value={formatCompactCAD((results?.estateNetWorth || results?.finalNetWorth || results?.fireNumber) || 0)}
                    sublabel={`Fin de l'horizon (${projection.years || 30} ans)`}
                    privacy
                    variant="primary"
                />
                <KPIStat
                    label="Taux de succès"
                    icon="✓"
                    value={results?.successRate != null ? `${results.successRate}%` : '—'}
                    // [MC-LABEL-FROZEN] Le compte vient du RÉSULTAT affiché, jamais de la config
                    // vivante : `results` peut être GELÉ (curseur bougé sans relance), et lire la
                    // config faisait alors annoncer un nombre d'itérations qui n'avait pas servi.
                    // Résultat sans compte (MC non lancé, ou projection d'avant ce lot) → « Monte
                    // Carlo » SANS chiffre : un « — » honnête vaut mieux qu'un nombre crédible.
                    sublabel={mcSublabel(runMC, results?.mcIterationsRun as number | null | undefined)}
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
            {/* [A11Y-TABLIST-NO-PANEL] Ce bandeau garde son habillage (emoji, autres classes) mais
                emprunte le MOTIF de `ui/SubTabs` : mêmes `id` d'onglet et de panneau, même clavier.
                Sans `aria-controls` ni panneau déclaré, un lecteur d'écran annonçait « onglet » sans
                pouvoir dire ce que l'onglet commande — le seul des quatre bandeaux resté à part. */}
            <div
                className="flex flex-wrap gap-1 p-1 rounded-card bg-surface/40 border border-white/5 w-fit"
                role="tablist"
                aria-label="Vue Future"
                onKeyDown={clavierTablist<FutureSubTabId>('futur', FUTURE_SUB_TABS.map((t) => t.id), futureSubTab, setFutureSubTab)}
            >
                {FUTURE_SUB_TABS.map(t => (
                    <button
                        key={t.id}
                        type="button" role="tab" aria-selected={futureSubTab === t.id}
                        id={tabId('futur', t.id)}
                        aria-controls={panelId('futur', t.id)}
                        tabIndex={futureSubTab === t.id ? 0 : -1}
                        onClick={() => setFutureSubTab(t.id)}
                        className={`px-4 py-1.5 rounded-card text-meta font-bold transition-colors focus-ring ${futureSubTab === t.id ? 'bg-primary text-dark' : 'text-ink-300 hover:text-ink-100'}`}
                    >
                        <span aria-hidden="true" className="mr-1">{t.emoji}</span>{t.label}
                    </button>
                ))}
            </div>

            {/* ⚠️ UN SEUL panneau, dont l'identité SUIT l'onglet actif. Les blocs de chaque onglet
                sont éclatés en plusieurs conditions (`graph` en porte trois, `plan` deux) : leur
                donner chacun un `TabPanel` produirait des `id` EN DOUBLE, et `aria-controls`
                pointerait alors vers un élément ambigu — un attribut présent qui désigne la mauvaise
                chose. Comme un seul onglet est actif à la fois, un panneau unique et mobile dit
                exactement la vérité. */}
            <TabPanel idPrefix="futur" tab={futureSubTab} when className="space-y-6">

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
            {/* [PROJECTION-PERSIST] Fenêtre de restauration (sig persistée, résultat pas encore là :
                moteur en route ~300 ms-qq s, gel IDB en lecture) → chargement honnête, PAS l'écran
                d'amorçage (sinon chaque reload donne l'impression d'avoir perdu la projection). */}
            {futureSubTab === 'graph' && curveRestoring && (
                <Card className="text-center">
                    <div className="py-10 flex flex-col items-center gap-3 text-ink-300" role="status" aria-live="polite">
                        <svg className="animate-spin h-8 w-8 text-amber-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="40" strokeDashoffset="20" opacity="0.5" />
                        </svg>
                        <span className="text-meta">Ta projection se recharge…</span>
                    </div>
                </Card>
            )}
            {futureSubTab === 'graph' && !curveVisible && !curveRestoring && (
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

            {futureSubTab === 'graph' && curveVisible && (
            <div ref={revealedRef} tabIndex={-1} className="outline-none space-y-3" role="region" aria-label="Projection affichée">
            {/* [PROJECTION-PERSIST] Badge « pas à jour » (choix Marc : FIGER l'ancienne courbe, pas la
                recalculer en douce). Affiché dès que les entrées divergent de la dernière révélation :
                la courbe ci-dessous est le GEL (ou le repli live si le gel est absent — autre PC). */}
            {isStale && (
                <div className="flex flex-wrap items-center gap-3 rounded-card border border-warning-500/40 bg-warning-500/10 px-4 py-2.5" role="status">
                    <span aria-hidden="true">🔄</span>
                    <span className="text-meta text-ink-100 font-bold">
                        Pas à jour{frozenUsable ? ' — courbe figée au dernier calcul' : ''}
                    </span>
                    <span className="text-tiny text-ink-300">
                        Tes hypothèses ou tes données ont changé depuis.
                    </span>
                    <span className="flex gap-2 ml-auto">
                        <button
                            type="button"
                            onClick={revealCurve}
                            disabled={isComputing}
                            className="px-3 py-1 rounded-card bg-primary text-dark text-tiny font-bold focus-ring disabled:opacity-50"
                        >
                            {isComputing ? 'Calcul…' : 'Recharger avec mes données'}
                        </button>
                        <button
                            type="button"
                            onClick={regateToLevers}
                            className="px-3 py-1 rounded-card border border-white/30 text-ink-200 hover:text-ink-50 text-tiny font-bold focus-ring"
                        >
                            Rechoisir mes leviers
                        </button>
                    </span>
                </div>
            )}
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
                        {/* [FUTUR-DAILY-NATIVE] Le bouton « Jour » a disparu (la courbe est au jour à
                            toute fenêtre) ; « Aujourd'hui » = preset de FENÊTRE autour du présent —
                            seul chemin FOCUSABLE vers cette fenêtre (finding a11y #592). */}
                        {todayPresetRange && (
                            <button
                                type="button"
                                onClick={() => zoom.showRange(todayPresetRange[0], todayPresetRange[1])}
                                title="Fenêtre d'environ 6 mois centrée sur aujourd'hui"
                                className="px-2.5 py-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-tiny font-bold rounded transition-colors focus-ring text-ink-300 hover:text-white hover:bg-white/10"
                            >
                                Aujourd'hui
                            </button>
                        )}
                        {[5, 10, 20, 30].filter((y) => y * 12 < lastMonthIndex).map((y) => {
                            const active = !!zoom.range && zoom.range[0] === 0 && zoom.range[1] === idxForYears(y);
                            return (
                                <button
                                    key={y}
                                    type="button"
                                    onClick={() => zoom.showRange(0, idxForYears(y))}
                                    className={`px-2.5 py-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-tiny font-bold rounded transition-colors focus-ring ${active ? 'bg-primary text-dark' : 'text-ink-300 hover:text-white hover:bg-white/10'}`}
                                >
                                    {y} ans
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            onClick={zoom.reset}
                            className={`px-2.5 py-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-tiny font-bold rounded transition-colors focus-ring ${!zoom.isZoomed ? 'bg-primary text-dark' : 'text-ink-300 hover:text-white hover:bg-white/10'}`}
                        >
                            Tout
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* [A11Y-CHART-HINT-HIDDEN] `aria-hidden` ASSUMÉ, et vérifié : cette phrase
                            est un DOUBLON visuel de l'`aria-label` du graphe (plus bas). L'exposer
                            ferait annoncer deux fois les mêmes gestes. Ce qui manquait n'était pas
                            une copie sr-only mais le CONTENU de cet `aria-label`, qui n'énonçait que
                            des gestes de POINTEUR — inutilisables par qui ne pointe pas — sans jamais
                            nommer l'alternative textuelle qui existe pourtant juste après la courbe. */}
                        <span className="text-tiny text-ink-500 hidden md:block" aria-hidden="true">
                            survol = jour · clic = fige le jour · molette = zoom · glisser = défiler
                        </span>
                        {/* PH4-FUT « leviers-d'abord » — revenir au composeur de leviers (ré-optimiser).
                            [PROJECTION-PERSIST] même chemin que « Rechoisir mes leviers » : efface AUSSI
                            le gel (mémoire + IDB), sinon un blob périmé resurgirait au prochain périmé. */}
                        <button
                            type="button"
                            onClick={regateToLevers}
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
                {/* [FUTUR-REAL-HISTORY] Note d'honnêteté sur le passé reconstruit : patrimoine net réel
                    (placements + cash + immo − dettes), avec deux approximations SIGNALÉES (Option A + FX du jour). */}
                {pastPrefixPoints.length > 0 && (
                    <div className="-mt-1 mb-2 text-tiny text-cyan-300/80 flex items-center gap-1.5 flex-wrap">
                        <span aria-hidden="true">⟵</span>
                        <span>
                            Patrimoine net réel{pastHistory.firstDate ? ` depuis ${pastHistory.firstDate.slice(0, 7)}` : ''}
                            {mentionDettes ? ` · ${mentionDettes}` : ''}
                            {hasForeignHoldings ? ' · titres étrangers au change du jour' : ''}
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
                {/* [PASSE-REEL-2] L'écart se lit JUSTE SOUS sa référence : affiché ailleurs, il ne
                    serait pas interprétable. Rend `null` si la comparaison n'a pas de sens. */}
                <ForecastAccuracyBadge accuracy={forecastAccuracy} />
                {/* Hauteur responsive : 380px mobile, 500px tablet, 650px desktop */}
                <div
                    ref={zoom.containerRef}
                    {...zoom.handlers}
                    onPointerDownCapture={(e) => { pointerDownPosRef.current = { x: e.clientX, y: e.clientY }; }}
                    onPointerUp={handleChartContainerClick}
                    onPointerMove={(e) => tooltip.onPointerMove(e.clientX, e.clientY)}
                    // [D6-GRAPH] tabIndex 0 (était -1) : le conteneur entre dans l'ordre de
                    // tabulation — c'est LE point d'entrée clavier du geste « figer un jour ».
                    // Le hook comptait déjà sur sa focusabilité pour restituer le focus.
                    tabIndex={0}
                    onKeyDown={handleChartKeyDown}
                    className={`chart-fullscreen relative w-full h-[55dvh] min-h-[380px] sm:h-[500px] sm:min-h-0 lg:h-[650px] select-none focus-ring ${zoom.isZoomed && zoom.isPanning ? 'cursor-grabbing' : zoom.isZoomed ? 'cursor-grab' : 'cursor-pointer'}`}
                    role="img"
                    aria-label="Courbe de vie — évolution projetée du patrimoine net et de chaque compte dans le temps. Les mêmes données sont lisibles sous la courbe, sous forme de tableau et de liste de jalons. À la souris : clic = figer l'infobulle (puis détail complet), molette = zoom, glisser = défiler. Au clavier : Entrée ou flèches = figer le jour d'aujourd'hui, puis Veille/Lendemain et Détail complet dans l'infobulle, Échap = relâcher."
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
                            data={chartSeries}
                            margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
                            onMouseMove={((s: { activePayload?: Array<{ payload: ProjectionChartPoint }> }) => {
                                // [FUTUR-DAILY-NATIVE] Le point recharts est LÉGER (champs de la courbe) :
                                // l'infobulle reçoit sa version COMPLÈTE, ventilée à la demande et cachée
                                // par mois (~10 ms la 1re entrée dans un mois, 0 ensuite).
                                const p = s?.activePayload?.[0]?.payload;
                                if (p) { const full = enrichDailyPoint(p) ?? p; lastHoverPointRef.current = full; tooltip.onHoverPoint(full); }
                            }) as unknown as (nextState: unknown, event: unknown) => void}
                            onMouseLeave={(() => tooltip.onChartLeave()) as unknown as () => void}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />

                            {/* [FUTUR-DAILY lot B] Axe X NUMÉRIQUE (`type="number"`), et non plus catégoriel.
                                ⚠️ CE QUE ÇA CHANGE, ET POURQUOI C'EST LE PRÉALABLE AU QUOTIDIEN. En catégoriel,
                                un `ReferenceLine x={…}` s'apparie à une CATÉGORIE : il n'apparaît que si un point
                                de données porte EXACTEMENT cette valeur. Injecter des points quotidiens ferait
                                donc disparaître ou glisser « Aujourd'hui », la frontière passé/futur et les
                                icônes-jalons — en SILENCE, sur un écran money-critical. En numérique, ces mêmes
                                valeurs sont des COORDONNÉES : elles tombent au bon endroit qu'un point existe ou
                                non à cette abscisse. C'est la condition pour que le lot suivant puisse ajouter
                                des abscisses fractionnaires.
                                ⚠️ Ce n'est PAS un no-op au pixel près, et le premier jet de ce commentaire le
                                prétendait à tort : un axe catégoriel place les points au CENTRE de leur bande
                                (une demi-bande de marge à chaque bord), un axe numérique fait coïncider dataMin
                                et dataMax avec les bords du tracé. Tout se décale donc d'une demi-bande — ~1 px
                                sur ~450 mois. Ce qui compte est que points ET ancrages subissent la MÊME
                                échelle : la frontière passé/futur, qui tombait 0,97 px à côté de la bande du
                                passé en catégoriel, coïncide désormais EXACTEMENT avec elle (mesuré, garde e2e).
                                `domain` explicite : le défaut d'un axe numérique recharts part de 0, ce qui
                                COUPERAIT tout le préfixe passé (monthIndex négatifs). */}
                            <XAxis
                                dataKey="monthIndex"
                                type="number"
                                domain={X_AXIS_DOMAIN}
                                stroke="#666"
                                tick={{fontSize: 10}}
                                minTickGap={50}
                                tickFormatter={(val: number) => {
                                    // Un axe numérique génère ses PROPRES graduations (nombres ronds), qui ne
                                    // correspondent pas forcément à un point de données : sans le repli
                                    // arithmétique, l'axe afficherait des numéros de mois bruts au lieu des
                                    // années. La Map reste consultée d'abord — même étiquette qu'avant, à
                                    // l'identique, partout où un point existe.
                                    const year = monthIndexToYear.get(val)
                                        ?? calendarFromMonthIndex(startYear, startMonth, Math.floor(val)).year;
                                    return `${year}`;
                                }}
                            />

                            <YAxis stroke="#666" tick={{fontSize: 10}} domain={['auto', 'auto']} tickFormatter={(val) => isPrivacyMode ? '***' : `${(val/1000000).toFixed(1)}M`} />

                            {pastPrefixPoints.length > 0 && (
                                <ReferenceArea
                                    // ⚠️ [FUTUR-DAILY-NATIVE] x1 clampé au 1er point RENDU : le 1er mois
                                    // de `displayData` sert d'ANCRE de ventilation (non rendu), donc
                                    // `pastStartIndex` est HORS domaine — et `ifOverflow` par défaut
                                    // (« discard ») JETTE alors toute la ReferenceArea : la bande du
                                    // passé disparaissait ENTIÈREMENT, en silence (attrapé par l'e2e
                                    // d'axe, timeout sur `.recharts-reference-area-rect`).
                                    x1={isDailyCurve && dailyAll.length > 0 ? Math.max(pastStartIndex, dailyAll[0].monthIndex) : pastStartIndex}
                                    // [FUTUR-DAILY-ROLLOVER] La bande du passé va jusqu'à AUJOURD'HUI
                                    // (abscisse du JOUR) : les jours réels du mois COURANT (avant
                                    // aujourd'hui) sont du passé reconstruit, les laisser hors bande
                                    // les faisait paraître projetés. Repli mensuel : frontière au mois.
                                    x2={isDailyCurve && todayAxisX !== null ? todayAxisX : 0}
                                    fill="#22d3ee"
                                    fillOpacity={0.05}
                                    stroke="none"
                                />
                            )}
                            {/* [FUTUR-DAILY-ROLLOVER] La ligne « Passé réel ⟵ » à x=0 (frontière du
                                PRÉFIXE mensuel) disparaît en courbe quotidienne : la vraie frontière
                                réel/projeté est AUJOURD'HUI — la bande + la ligne « Aujourd'hui »
                                la racontent, une 2e ligne au 1er du mois serait un faux repère. */}
                            {pastPrefixPoints.length > 0 && !isDailyCurve && (
                                <ReferenceLine x={0} stroke="#22d3ee" strokeOpacity={0.5} strokeDasharray="3 3" label={<RefLineLabel value="Passé réel ⟵" color="#22d3ee" />} />
                            )}
                            <ReferenceLine y={0} stroke="#444" strokeWidth={2} />
                            {isVisible('aujourdhui') && <ReferenceLine x={isDailyCurve && todayAxisX !== null ? todayAxisX : todayMonthIndex} stroke="rgba(255,255,255,0.6)" strokeDasharray="5 5" label={<RefLineLabel value="Aujourd'hui" color="#ffffff" />} />}

                            {/* [R3] Recharts ne rend RIEN (content=()=>null) : il reste actif pour
                                alimenter onMouseMove (point survolé) + le curseur (ligne verticale).
                                Le vrai tooltip est rendu dans un PORTAIL positionné par le hook. */}
                            <Tooltip content={() => null} cursor={{ stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1 }} isAnimationActive={false} />
                            {isVisible('fire') && <ReferenceLine y={fireNumber} stroke="#f97316" strokeDasharray="5 5" label={<RefLineLabel value="Objectif FIRE" color="#f97316" />} />}

                            {/* PH4-FUT — ANNOTATIONS de cycle de vie (retraite / rentes RRQ-PSV / épuisement
                                de compte). Lignes verticales discrètes, masquables via le toggle « Événements ». */}
                            {isVisible('events') && lifeMarkers.map((mk, i) => (
                                <ReferenceLine key={`lifemark-${i}`} x={mk.monthIndex} stroke={mk.color} strokeOpacity={0.5} strokeDasharray="2 4" label={<RefLineLabel value={mk.label} color={mk.color} />} />
                            ))}

                            {isVisible('Liquidites') && <Area type="monotone" dataKey="Liquidites" stackId="1" stroke="#4b5563" fill="#4b5563" name="Cash" isAnimationActive={false} />}
                            {isVisible('CELI') && <Area type="monotone" dataKey="CELI" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="CELI" isAnimationActive={false}/>}
                            {isVisible('CELIAPP') && <Area type="monotone" dataKey="CELIAPP" stackId="1" stroke="#2dd4bf" fill="#2dd4bf" fillOpacity={0.6} name="CELIAPP (FHSA)" isAnimationActive={false}/>}
                            {isVisible('REER') && <Area type="monotone" dataKey="REER" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} name="REER" isAnimationActive={false}/>}
                            {isVisible('REEE') && <Area type="monotone" dataKey="REEE" stackId="1" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.6} name="REEE" isAnimationActive={false}/>}
                            {isVisible('NonReg') && <Area type="monotone" dataKey="NonReg" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} name="Non-Enreg" isAnimationActive={false}/>}
                            {isVisible('Crypto') && <Area type="monotone" dataKey="Crypto" stackId="1" stroke="#a855f7" fill="#a855f7" fillOpacity={0.6} name="Crypto" isAnimationActive={false}/>}
                            {isVisible('Immobilier') && <Area type="monotone" dataKey="Immobilier" stackId="1" stroke="#ec4899" fill="#ec4899" fillOpacity={0.3} name="Équité Immo" isAnimationActive={false}/>}

                            {isVisible('ImpotLatent') && <Area type="monotone" dataKey="ImpotLatent" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} strokeDasharray="3 3" name="Impôt Latent" isAnimationActive={false}/>}
                            {/* [FUTUR-DAILY-NATIVE] `FluxImpots` n'existe sur les points quotidiens
                                QU'AUX jours d'échéance (retiré ailleurs dans `dailyAll`) : la Bar ne
                                rend donc ~qu'un rect par an, pas 11 000 rects à hauteur nulle. */}
                            {isVisible('FluxImpots') && <Bar dataKey="FluxImpots" fill="#ef4444" fillOpacity={0.8} name="Paiement Impôts" barSize={4} isAnimationActive={false} />}

                            {/* G17 — Monte Carlo dessiné PAR-DESSUS la pile (sinon occulté) en
                                cône d'incertitude : P10/P90 pointillés + médiane pleine.
                                [FUTUR-DAILY-NATIVE] Les bandes restent tracées au jour : ce sont des
                                percentiles MENSUELS reliés linéairement entre fins de mois (même
                                statut assumé que la croissance étalée sur le mois) — les masquer les
                                ferait disparaître PARTOUT maintenant que tout est au jour. */}
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

                            {/* [Audit a11y #599, MED] UNE seule séquence triée par date : vie et flux
                                étaient rendus en DEUX passes (tous les « vie » chronologiques, puis
                                retour au début de la timeline pour les « flux ») — Tab et lecteur
                                d'écran faisaient un bond de plusieurs décennies en arrière à la
                                jonction. L'ordre DOM = l'ordre de tabulation : on fusionne AVANT de
                                mapper. */}
                            {isVisible('events') && [
                                ...shownLifeEvents.map((evt, i) => ({ evt, kind: 'life' as const, key: `life-${i}` })),
                                ...shownFlowEvents.map((evt, i) => ({ evt, kind: 'flow' as const, key: `flow-${i}` })),
                            ]
                                .sort((a, b) => (a.evt.x ?? a.evt.monthIndex) - (b.evt.x ?? b.evt.monthIndex))
                                .map(({ evt, kind, key }) => (
                                    <ReferenceDot
                                        key={key}
                                        // [FUTUR-DAILY-EVENTS] Jour saisi → pastille à SON jour ; sans
                                        // jour connu, au mois (jamais un jour inventé).
                                        x={evt.x ?? evt.monthIndex}
                                        y={evt.val}
                                        r={kind === 'life' ? 3 : 2}
                                        shape={
                                            <ClickableEventIcon
                                                kind={kind}
                                                payload={evt}
                                                onSelect={() => { const found = chartData.find((d: ProjectionChartPoint) => d.monthIndex === evt.monthIndex); if (found) { setDetailDayIso(null); setDetailAnchorIso(null); setDetailMonthIso(null); setDetailPoint(found); } }}
                                            />
                                        }
                                    />
                                ))}
                        </ComposedChart>
                    </ResponsiveContainer>
                     )}
                </div>

                {/* [FUTUR-DAILY-NATIVE] La courbe est au jour PARTOUT — la bannière est devenue une
                    note de méthodologie compacte + les avertissements d'honnêteté conditionnels.
                    Le repli mensuel (ventilation impossible : < 2 mois à valeur nette finie) est
                    signalé, jamais silencieux. */}
                {!isDailyCurve && (
                    <p role="status" className="mt-2 rounded-card border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-tiny text-ink-200">
                        <strong className="text-amber-300">Courbe au mois (repli)</strong> — la valeur nette
                        mensuelle est inconnue sur presque toute la période (données passées incomplètes),
                        donc les jours ne peuvent pas être reconstruits honnêtement.
                    </p>
                )}
                {isDailyCurve && (
                    <p role="status" className="mt-2 rounded-card border border-primary/25 bg-primary/5 px-3 py-2 text-tiny text-ink-200">
                        <strong className="text-primary">Courbe au jour</strong> — chaque point est une
                        journée : survole pour la lire, clique pour la figer.
                        <strong className="text-ink-100"> Avant aujourd'hui, c'est du RÉEL</strong> (tes
                        transactions datées, le prix de tes titres ce jour-là). Après, c'est projeté : ce
                        que l'app sait dater (paie du jeudi, charges à leur quantième, solde d'impôt à
                        l'échéance) tombe au bon jour ; le rendement du marché — sans date connue — est
                        réparti sur le mois, et les bandes Monte Carlo sont des percentiles mensuels
                        reliés entre fins de mois. L'infobulle dit pour chaque jour s'il est réel,
                        daté ou réparti. En vue très large, le TRACÉ est échantillonné pour rester
                        fluide — le survol et le clic, eux, visent toujours le jour exact.
                        {/* [FUTUR-DAILY-ANCHOR-CAVEAT] Un montant que l'ancre compte mais que la série
                            quotidienne ne peut pas placer décale TOUT le niveau passé. Le dire est le
                            minimum ; le corriger (retrancher ces flux de l'ancre) touche
                            `computeStartingCash`, donc le raccord au présent — plan-first, au BACKLOG. */}
                        {/* [PASSE-REEL-IMPOT-LATENT-DEBUT] Marc : « je vois impôt latent commencer
                            le 1/09 mais jsp pourquoi ». MESURÉ : `ImpotLatent` n'est émis NULLE PART
                            dans le passé reconstruit (0 occurrence dans `dailyPastLedger.ts` et
                            `buildPastPrefix.ts` — le passé ne porte que soldes, flux et patrimoine
                            net). Sa série ne PEUT donc démarrer qu'au premier mois PROJETÉ.
                            ⚠️ Le calcul est juste ; c'est de ne pas le DIRE qui est le défaut — une
                            courbe qui surgit à une date arbitraire se lit comme un bug. Même classe
                            que `SILENCE-READS-AS-BROKEN`.
                            ⚠️ Affiché SEULEMENT si la série est visible : sinon c'est du bruit
                            permanent sur un écran déjà dense. Et surtout, on n'invente PAS un impôt
                            latent passé — il faudrait l'historique des prix de revient, que l'app
                            n'a pas (no-fake-data). */}
                        {isVisible('ImpotLatent') && (
                            <span className="mt-1 block text-ink-300">
                                L'<strong className="text-ink-100">impôt latent</strong> n'est pas reconstruit
                                pour le passé : l'app n'a pas l'historique de tes prix de revient. Sa courbe
                                démarre donc au premier mois projeté — ce n'est pas un trou dans tes données.
                            </span>
                        )}
                        {dailyPast !== null && Math.abs(dailyPast.undatedTotal) > 0.5 && (
                            <span className="mt-1 block text-amber-300/90">
                                ⚠ <PrivateAmount>{formatCAD(Math.abs(dailyPast.undatedTotal))}</PrivateAmount> de transactions datées au mois
                                seul (sans jour) ne peuvent pas être placées : le niveau des jours passés peut
                                être décalé d'autant.
                            </span>
                        )}
                        {dailyPast?.truncatedFrom && (
                            <span className="mt-1 block text-amber-300/90">
                                {/* ⚠️ `truncatedFrom` est le PREMIER jour NON reconstruit, pas le dernier
                                    tracé. Mon premier libellé disait « s'arrête au {date} », ce qui
                                    laissait croire que ce jour-là existait encore — décalage d'un jour
                                    relevé par la revue, sur une mise en garde dont tout l'intérêt est
                                    d'être exacte. */}
                                ⚠ Le premier jour non reconstruit est le {dailyPast.truncatedFrom} : à
                                partir de là, la courbe passée s'interrompt (limite de volume) et les
                                journées ne sont ni tracées ni sélectionnables.
                            </span>
                        )}
                        {dailyPast !== null && Math.abs(dailyPast.flowsAfterNowDate) > 0.5 && (
                            <span className="mt-1 block text-amber-300/90">
                                ⚠ <PrivateAmount>{formatCAD(Math.abs(dailyPast.flowsAfterNowDate))}</PrivateAmount> de transactions datées
                                après aujourd'hui sont déjà dans ton solde actuel mais pas encore dans les
                                jours passés.
                            </span>
                        )}
                        {/* [PASSE-REEL-RACCORD-CHUTE] La marche au raccord, EXPLIQUÉE. Aucun montant
                            dans la phrase : interpolé dans une chaîne il ne serait plus masquable, et
                            il est déjà lisible sur la courbe. Ton informatif, pas d'avertissement —
                            les deux points sont JUSTES, il n'y a rien à corriger. */}
                        {mentionRaccordJour && (
                            <span className="mt-1 block">{mentionRaccordJour}</span>
                        )}
                        {mentionRaccordMois && (
                            <span className="mt-1 block">{mentionRaccordMois}</span>
                        )}
                    </p>
                )}

                {/* [A11Y-CHARTS] — alternative TEXTUELLE (sr-only) à la courbe Recharts : mêmes données
                    en table accessible, masquage privacy aligné sur l'axe/tooltip.
                    ⚠️ `chartSeries` et NON `displayData` (finding revue) : la table doit suivre ce qui
                    est RÉELLEMENT tracé. En vue au jour, elle restait au mois — un utilisateur de
                    lecteur d'écran n'avait alors aucun accès à la granularité que la courbe expose.
                    ⚠️ La mention « les colonnes par compte y sortent “—” » est PÉRIMÉE depuis
                    [FUTUR-DAILY-FULL] : `dailyLedger` ventile les soldes par compte au jour, donc la
                    table les remplit aussi. Le « — » reste réservé aux valeurs réellement absentes
                    (préfixe passé avant la 1re transaction connue). */}
                {/* ⚠️ `selectSeries` (tranche quotidienne COMPLÈTE) et non `chartSeries` (tracé
                    décimé) — finding a11y #592 : la table annonçait « 40 échantillonnés sur 700 »
                    alors que la base réelle est ~11 000 jours. La table échantillonne elle-même à
                    ~40 lignes : lui donner la série complète ne coûte rien et rend le dénominateur
                    honnête. */}
                <ChartDataTable
                    caption={isDailyCurve
                        ? 'Projection du patrimoine net et des comptes, jour par jour'
                        : 'Projection du patrimoine net et des comptes par mois (repli)'}
                    columns={dataColumns}
                    rows={selectSeries}
                />
                {/* [FUTUR-ICONS-RICH, a11y] Liste sr-only des JALONS affichés sur la courbe (RRQ/PSV/retraits/
                    impôts/retraite/FIRE…). Les pastilles SVG sont focusables DEPUIS le lot
                    A11Y-FUTUR-MILESTONES-KEYBOARD (PR #599) — la liste reste utile pour la LECTURE
                    d'ensemble (date + libellé d'un coup, sans tabuler 29 pastilles), sans
                    échantillonnage (bornée par le cap visuel des icônes). */}
                {(shownLifeEvents.length > 0 || shownFlowEvents.length > 0) && (
                    <ul className="sr-only">
                        <li>Jalons de la projection :</li>
                        {[...shownLifeEvents, ...shownFlowEvents]
                            .slice()
                            .sort((a, b) => a.monthIndex - b.monthIndex)
                            .map((e, i) => (
                                <li key={`ms-sr-${i}`}>{e.dateLabel ? `${e.dateLabel} : ` : ''}{e.label}</li>
                            ))}
                    </ul>
                )}

                {/* [R3] Tooltip portail : survol (pointer-events:none, suit la souris) ou
                    figé (pointer-events:auto, scrollable, ancré, focusable). Positionné par
                    le hook (left/top mutés directement). z-290 < modale z-300. */}
                {tooltip.point && tooltip.mode !== 'idle' && createPortal(
                    <div
                        // ⚠️ key : flottant et sheet écrivent des left/top DIFFÉRENTS (impératif vs
                        // JSX) sur le même nœud — le remount garantit un style vierge au basculement.
                        key={tooltipIsSheet ? 'sheet' : 'float'}
                        ref={tooltip.tooltipRef}
                        style={tooltipIsSheet
                            ? { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 290, pointerEvents: 'auto' }
                            : { position: 'fixed', top: 0, left: 0, zIndex: 290, pointerEvents: tooltip.mode === 'frozen' ? 'auto' : 'none' }}
                        tabIndex={tooltip.mode === 'frozen' ? -1 : undefined}
                        data-frozen-tooltip={tooltip.mode === 'frozen' ? '' : undefined}
                        role={tooltip.mode === 'frozen' ? 'dialog' : undefined}
                        aria-modal={tooltip.mode === 'frozen' ? true : undefined}
                        // Piège de focus minimal (panel #597) : figé = modal (Échap/clic-dehors/
                        // Fermer libèrent) — sans piège, Tab sortait vers des contrôles recouverts
                        // par le sheet plein écran, sans indication. aria-modal l'ANNONCE, le
                        // piège le GARANTIT — l'un sans l'autre mentirait au lecteur d'écran.
                        onKeyDown={tooltip.mode === 'frozen' ? (e) => {
                            if (e.key !== 'Tab') return;
                            const root = tooltip.tooltipRef.current;
                            if (!root) return;
                            const focusables = root.querySelectorAll<HTMLElement>(
                                'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
                            );
                            if (focusables.length === 0) return;
                            const first = focusables[0];
                            const last = focusables[focusables.length - 1];
                            if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
                                e.preventDefault();
                                last.focus();
                            } else if (!e.shiftKey && document.activeElement === last) {
                                e.preventDefault();
                                first.focus();
                            }
                        } : undefined}
                        aria-label={tooltip.mode === 'frozen'
                            ? (tooltipIsSheet
                                ? "Infobulle figée du point projeté — bouton Fermer en bas"
                                : "Infobulle figée du point projeté — Échap pour fermer")
                            : undefined}
                    >
                        <ExpertTooltip
                            data={tooltip.point}
                            userName1={config.users[0]?.name}
                            userName2={config.users[1]?.name}
                            frozen={tooltip.mode === 'frozen'}
                            onOpenDetail={() => {
                                // Le jour se lit sur le point D'ORIGINE, avant que `detailPointFor`
                                // ne le rebase sur son mois hôte.
                                // ⚠️ [PASSE-REEL-TXN-JOUR-VIDE] `dayIsReal` est OBLIGATOIRE ici, et ce
                                // n'est pas une ceinture-bretelles : `dayIso` est posé sur TOUT point
                                // quotidien, futur compris (`mergeDailyRealPoint` fait `{ ...d }` sur
                                // la branche projetée, et `d` le porte déjà). Sans ce filtre, cliquer
                                // un jour FUTUR affichait « aucun mouvement ce jour-là » — une
                                // affirmation de MESURE sur du projeté, exactement le faux que la
                                // section évite déjà pour un point mensuel.
                                // Ça ne se voyait pas avant l'état vide : la liste étant toujours
                                // vide dans le futur, la section ne se rendait simplement pas.
                                // `dayIsReal` n'est posé que par la branche RÉELLE de
                                // `mergeDailyRealPoint` (unique occurrence du dépôt), et le mois
                                // ANCRE y passe aussi via `realOnlyMonthPoints` : couverture
                                // complète, sans exclure les jours réels du premier mois.
                                // [FUTUR-DETAIL-CATEGORIES-MOIS + FUTUR-DETAIL-STEP-DAY] Le trio
                                // (point, jour, mois) est posé par `ouvrirDetailSur` — un seul
                                // endroit, partagé avec les flèches Veille/Lendemain du panneau.
                                ouvrirDetailSur(tooltip.point);
                            }}
                            onStepDay={stepDay}
                            canStepPrev={frozenSeriesIdx > 0}
                            canStepNext={frozenSeriesIdx !== -1 && frozenSeriesIdx < selectSeries.length - 1}
                            sheet={tooltipIsSheet}
                            onClose={tooltip.release}
                        />
                    </div>,
                    document.body,
                )}

                {detailPoint && (
                    <FutureDetailModal
                        point={detailPoint}
                        chartData={chartData}
                        transactions={transactions}
                        dayIso={detailDayIso}
                        variation={variationDuJour}
                        monthIso={detailMonthIso}
                        userName1={config.users[0]?.name}
                        userName2={config.users[1]?.name}
                        isPrivacyMode={isPrivacyMode}
                        onStepDay={stepDetailDay}
                        canStepPrev={detailSeriesIdx > 0}
                        canStepNext={detailSeriesIdx !== -1 && detailSeriesIdx < selectSeries.length - 1}
                        onClose={() => { setDetailPoint(null); setDetailDayIso(null); setDetailAnchorIso(null); setDetailMonthIso(null); }}
                    />
                )}

                {/* G10 — légende interactive : clic = afficher/masquer la série. */}
                <div className="mt-6 bg-black/20 p-4 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                        <span className="text-tiny text-ink-400 font-semibold uppercase tracking-wide">
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
                                    className={`flex items-center gap-1.5 px-2.5 py-1 min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 rounded-card text-tiny font-semibold border transition-colors focus-ring ${on ? 'bg-white/10 border-white/15 text-ink-100 hover:bg-white/15' : 'bg-transparent border-white/5 text-ink-400 line-through hover:text-ink-300'}`}
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
            {/* [PROJECTION-PERSIST] pendant la restauration, ne pas montrer l'invite (flash trompeur). */}
            {futureSubTab === 'plan' && !curveVisible && !curveRestoring && (
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
            {futureSubTab === 'plan' && curveVisible && (
                <div className="space-y-6">
                    <ProjectionExplains chartData={chartData} />
                    {/* C2 — Plan d'action HIÉRARCHIQUE (global → mois, drill-down au clic). */}
                    <ActionPlanDrilldown chartData={chartData} strategyName={allResults[0]?.strategyName} />
                </div>
            )}

            {/* [REFONTE-NAV-L2b] Historique : évolution PASSÉE du patrimoine par compte (ex-Accueil).
                Indépendant de la projection (pas gated par curveVisible : l'historique existe même
                sans courbe calculée). Lazy → le pipeline ne se paie qu'à l'affichage. */}
            {futureSubTab === 'historique' && (
                <Suspense fallback={<Skeleton variant="chart" />}>
                    <FutureHistorySection />
                </Suspense>
            )}
            </TabPanel>
        </div>
    );
};
