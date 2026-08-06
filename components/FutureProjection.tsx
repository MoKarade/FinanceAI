import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card } from './ui/Card';
import { PageHeader } from './ui/PageHeader';
import { Badge } from './ui/Badge';
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
import { findInsolvencyPoint } from '../utils/insolvency';
import { sampleEvenly } from '../utils/sampleEvenly';

// Sprint 2 PH2 — constante stable pour éviter de créer un nouveau [] à chaque
// render (qui invaliderait les useMemo deps en aval).
const EMPTY_ARRAY: never[] = [];
import { Tab as TabEnum } from '../types';
import { ExpertTooltip, ClickableEventIcon, RefLineLabel } from './projection/ProjectionTooltip';
import { FutureDetailModal } from './projection/FutureDetailModal';
import { useTimeChartZoom } from '../hooks/useTimeChartZoom';
import { useChartTooltipPosition } from '../hooks/useChartTooltipPosition';
import { resolvePointFromClick } from '../utils/chartTooltip';
import { ProjectionControls } from './projection/ProjectionControls';
import { useSimulationParams } from '../hooks/useSimulationParams';
import { buildPastPrefix } from '../services/history/buildPastPrefix';
import { deriveMilestoneIcons } from '../services/projection/milestoneIcons';
import { ActionPlanDrilldown } from './projection/ActionPlanDrilldown';
import { ProjectionExplains } from './projection/ProjectionExplains';
import { StrategyOptimizerPanel } from './projection/StrategyOptimizerPanel';
import { StressTestPanel } from './projection/StressTestPanel';
import { CollapsibleSection } from './ui/CollapsibleSection';
import { applyConfigToSettings, type StrategyConfig } from '../services/projection/strategyConfig';
import { ChartDataTable, type ChartDataColumn } from './ui/ChartDataTable';
import { DailyDetailPanel } from './projection/DailyDetailPanel';
import { MASKED_AMOUNT_LABEL } from '../utils/privacyAria';
import { formatCompactCAD } from '../utils/format';

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
    // Plus aucun calcul ni repli local : la courbe affichée EST celle du moteur (sauf GEL, ci-dessous).
    const liveResults = useFinanceStore(s => s.lastProjection);
    // [FUTUR-REAL-HISTORY] La mention « change du jour » ne concerne QUE les titres en devise étrangère
    // (facteur FX=1 pour CAD) → ne l'affiche pas pour un portefeuille 100 % CAD (finding code-reviewer :
    // sinon on suggère un risque de change qui ne s'applique pas). Sélecteur booléen = re-render minimal.
    const hasForeignHoldings = useFinanceStore(s => (s.assets ?? []).some(a => (a.currency || 'CAD') !== 'CAD'));

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
    useEffect(() => {
        if (debtAnomaly) {
            logError({ source: 'ui', severity: 'warning', message: 'FutureProjection : DettesNonImmo (liveResults, repli chartData) non fini — dette du passé rabattue à 0', context: { rawDebtNonImmo } });
        }
    }, [debtAnomaly, rawDebtNonImmo]);
    // [FUTUR-HIST-WIRING-TEST] Assemblage du segment passé extrait en fonction PURE `buildPastPrefix`
    // (unit-testable, hors composant) → le câblage money-critical (buckets → helper, dette soustraite,
    // dates) se prouve sans rendre le composant. Vide → `EMPTY_ARRAY` (référence stable pour l'aval).
    const pastPrefix = useMemo(() => {
        const built = buildPastPrefix({ pastHistoryPoints: pastHistory.points, transactions, calculatedStartingCash, realEstateGoals, startYear, startMonth, currentDebtNonImmo });
        return built.length ? built : EMPTY_ARRAY;
    }, [pastHistory.points, startYear, startMonth, transactions, calculatedStartingCash, realEstateGoals, currentDebtNonImmo]);
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
        type ChartEvent = { monthIndex: number; year: number | undefined; age: number | undefined; dateLabel: string | undefined; val: number | undefined; netWorth: number | undefined; label: string; subIdx: number; index: number; kind: 'life' | 'flow'; color?: string; pinned?: boolean };
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
            (d.lifeEvents || []).forEach((label: string) => {
                if (lastLife[label] != null && d.monthIndex - lastLife[label] <= DEDUP_GAP) return;
                lastLife[label] = d.monthIndex;
                const isFire = FIRE_RE.test(label);
                lifes.push({ ...meta, label, subIdx: 0, index: 0, kind: 'life', ...(isFire ? { color: '#f97316', pinned: true } : null) });
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
                flows.push({ ...meta, label, subIdx: 0, index: 0, kind: 'flow' });
            });
        });
        // [FUTUR-ICONS-RICH] Jalons DÉRIVÉS des champs chartData (RRQ/PSV/1er retrait REER-CELI/locatif) —
        // présentation pure (aucun recalcul $). Jamais retraite/FIRE/impôt (émis par le moteur → anti-doublon
        // structurel). `pinned` : peu nombreux (one-time) → JAMAIS écrêtés par sampleEvenly, toujours visibles
        // (finding silent-failure : sinon noyés par le volume de flowEvents dégatés).
        const milestones = deriveMilestoneIcons(chartData);
        lifes.push(...milestones.map((m) => ({ ...m, subIdx: 0, index: 0, pinned: true })));
        // ⚠️ RE-TRI par monthIndex OBLIGATOIRE avant `sampleEvenly` (contrat « tableau ORDONNÉ », finding architect
        // ÉLEVÉ : un merge non trié casse l'échantillonnage uniforme) + réassignation `subIdx` (empilement vertical
        // par mois) et `index` (clé unique).
        const finalize = (arr: ChartEvent[]): ChartEvent[] => {
            const sorted = [...arr].sort((a, b) => a.monthIndex - b.monthIndex);
            const perMonth: Record<number, number> = {};
            return sorted.map((e, i) => {
                const s = perMonth[e.monthIndex] ?? 0;
                perMonth[e.monthIndex] = s + 1;
                return { ...e, subIdx: s, index: i };
            });
        };
        return { lifeChartEvents: finalize(lifes), flowChartEvents: finalize(flows) };
    }, [chartData]);

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
    const [futureSubTab, setFutureSubTab] = useState<'graph' | 'params' | 'plan'>('graph');
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
    const zoom = useTimeChartZoom<ProjectionChartPoint>(displayData as ProjectionChartPoint[]);

    // [FUTUR-DAILY] Fenêtre à raffiner au jour = la fenêtre ZOOMÉE, traduite en dates calendaires.
    // ⚠️ Le hook de zoom indexe le tableau MENSUEL et c'est très bien ainsi : lui substituer des
    // points quotidiens casserait son indexation (et l'axe X est CATÉGORIEL, ancré sur `monthIndex`
    // entier pour les jalons). Le mensuel pilote donc la FENÊTRE, et le quotidien n'est calculé que
    // pour la remplir — c'est exactement ce que « si je zoom » autorise.
    const dailyWindow = useMemo(() => {
        const vis = zoom.visibleData;
        if (vis.length < 2) return null;
        const cal = (monthIndex: number) => {
            const abs = startMonth + monthIndex;
            return { year: startYear + Math.floor(abs / 12), month: ((abs % 12) + 12) % 12 };
        };
        const anchors = vis.map((p) => {
            const { year, month } = cal(p.monthIndex);
            return { monthIndex: p.monthIndex, year, month, value: Number(p.NetWorth) || 0 };
        });
        const first = cal(vis[0].monthIndex);
        const last = cal(vis[vis.length - 1].monthIndex);
        const iso = (y: number, m: number, d: number) =>
            `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const now = cal(todayMonthIndex);
        return {
            from: iso(first.year, first.month, 1),
            to: iso(last.year, last.month, new Date(Date.UTC(last.year, last.month + 1, 0)).getUTCDate()),
            anchors,
            today: iso(now.year, now.month, new Date().getUTCDate()),
        };
    }, [zoom.visibleData, startYear, startMonth, todayMonthIndex]);

    const dailyAssets = useFinanceStore(s => s.assets) ?? [];
    const fxRates = useFinanceStore(s => s.fxRates) ?? {};
    const dailyRecurring = useFinanceStore(s => s.subscriptions) ?? [];

    // [A11Y-CHARTS] — colonnes de la table de données sr-only (alternative texte à la courbe Recharts,
    // opaque aux lecteurs d'écran). Date (axe X) + chaque montant affiché (comptes empilés + Valeur Nette).
    // Le mode privé masque les MONTANTS (parité avec l'axe/tooltip déjà masqués), pas la date.
    const dataColumns = useMemo<ChartDataColumn[]>(() => {
        const money = (v: unknown) => isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCompactCAD(Number(v) || 0);
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
    const tooltip = useChartTooltipPosition<ProjectionChartPoint>({
        getKey: (p) => p.monthIndex,
        containerRef: zoom.containerEl,
    });

    // [R3] Clic sur le graphe = FIGE le tooltip (avant : ouvrait directement la modale).
    // La modale exhaustive s'ouvre désormais via le bouton « Détail complet » du tooltip
    // figé, et via les pastilles d'événement (inchangées). On résout le mois cliqué par
    // GÉOMÉTRIE (robuste tactile / sans survol), avec repli sur le dernier point survolé.
    // On ignore les glissers (pan) via la distance depuis le mousedown.
    const handleChartContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const down = pointerDownPosRef.current;
        if (down && (Math.abs(e.clientX - down.x) > 6 || Math.abs(e.clientY - down.y) > 6)) return; // glisser = pan
        const grid = zoom.containerEl.current?.querySelector('.recharts-cartesian-grid');
        const rect = grid?.getBoundingClientRect();
        const point = resolvePointFromClick(
            e.clientX,
            rect ? { left: rect.left, width: rect.width } : null,
            zoom.visibleData,
        ) ?? lastHoverPointRef.current; // repli : dernier point survolé
        if (point) tooltip.freezeOn(point);
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
    const shownLifeEvents = [
        ...thinEvents(visibleLifeEvents.filter((e) => !e.pinned), MAX_LIFE_ICONS),
        ...visibleLifeEvents.filter((e) => e.pinned),
    ];
    const shownFlowEvents = thinEvents(visibleFlowEvents, MAX_FLOW_ICONS);
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

            {/* Hero KPI strip — PH4 : caché tant que la projection n'est pas calculée explicitement
                (cf revealedSig) ; sinon les chiffres projetés s'affichaient sans geste de l'utilisateur. */}
            {curveVisible && (
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
                    // Le fallback (value ci-dessous) tombe sur finalNetWorth/fireNumber quand estateNetWorth=0 :
                    // dans ce cas le nombre N'INCLUT PAS les rentes → libellé neutre + pas de tooltip « avec rentes »
                    // (sinon le libellé mentirait, le bug même que R1 corrige). Sinon : successoral, avec rentes.
                    label={results?.estateNetWorth ? "Patrimoine successoral, avec rentes" : "Patrimoine projeté"}
                    tooltip={results?.estateNetWorth ? "Patrimoine au décès : net de l'impôt de liquidation (REER et gains en capital imposés au décès) + la valeur actualisée des rentes RRQ/PSV restantes. Différent du patrimoine en fin d'horizon." : undefined}
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
                    { id: 'params', emoji: '⚙️', label: 'Hypothèses' },
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
                {pastPrefix.length > 0 && (
                    <div className="-mt-1 mb-2 text-tiny text-cyan-300/80 flex items-center gap-1.5 flex-wrap">
                        <span aria-hidden="true">⟵</span>
                        <span>
                            Patrimoine net réel{pastHistory.firstDate ? ` depuis ${pastHistory.firstDate.slice(0, 7)}` : ''}
                            {currentDebtNonImmo > 0 ? ' · dettes au niveau actuel' : ''}
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
                {/* Hauteur responsive : 380px mobile, 500px tablet, 650px desktop */}
                <div
                    ref={zoom.containerRef}
                    {...zoom.handlers}
                    onMouseDownCapture={(e) => { pointerDownPosRef.current = { x: e.clientX, y: e.clientY }; }}
                    onClick={handleChartContainerClick}
                    onPointerMove={(e) => tooltip.onPointerMove(e.clientX, e.clientY)}
                    tabIndex={-1}
                    className={`chart-fullscreen relative w-full h-[380px] sm:h-[500px] lg:h-[650px] select-none ${zoom.isZoomed && zoom.isPanning ? 'cursor-grabbing' : zoom.isZoomed ? 'cursor-grab' : 'cursor-pointer'}`}
                    role="img"
                    aria-label="Courbe de vie — évolution projetée du patrimoine net et de chaque compte dans le temps. Clic = figer l'infobulle (puis détail complet), molette = zoom, glisser = défiler."
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
                            onMouseMove={((s: { activePayload?: Array<{ payload: ProjectionChartPoint }> }) => { const p = s?.activePayload?.[0]?.payload; if (p) { lastHoverPointRef.current = p; tooltip.onHoverPoint(p); } }) as unknown as (nextState: unknown, event: unknown) => void}
                            onMouseLeave={(() => tooltip.onChartLeave()) as unknown as () => void}
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

                {/* [FUTUR-DAILY] Détail JOUR PAR JOUR de la fenêtre regardée (demande Marc 2026-08-06).
                    N'apparaît qu'en ZOOM : dézoomé, la fenêtre couvre des décennies et un tableau
                    quotidien n'aurait ni sens ni lisibilité. */}
                {zoom.isZoomed && dailyWindow && (
                    <DailyDetailPanel
                        from={dailyWindow.from}
                        to={dailyWindow.to}
                        anchors={dailyWindow.anchors}
                        today={dailyWindow.today}
                        transactions={transactions}
                        currentCash={calculatedStartingCash || 0}
                        assets={dailyAssets}
                        fx={fxRates}
                        recurring={dailyRecurring}
                        isPrivacyMode={isPrivacyMode}
                    />
                )}

                {/* [A11Y-CHARTS] — alternative TEXTUELLE (sr-only) à la courbe Recharts : mêmes données
                    en table accessible, masquage privacy aligné sur l'axe/tooltip. */}
                <ChartDataTable
                    caption="Projection du patrimoine net et des comptes par date"
                    columns={dataColumns}
                    rows={displayData}
                />
                {/* [FUTUR-ICONS-RICH, a11y] Liste sr-only des JALONS affichés sur la courbe (RRQ/PSV/retraits/
                    impôts/retraite/FIRE…) : les pastilles SVG ne sont pas atteignables au clavier (dette
                    A11Y-FUTUR-MILESTONES-KEYBOARD au BACKLOG) → cette liste donne au lecteur d'écran la PARITÉ
                    d'information (date + libellé), sans échantillonnage (bornée par le cap visuel des icônes). */}
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
                        ref={tooltip.tooltipRef}
                        style={{ position: 'fixed', top: 0, left: 0, zIndex: 290, pointerEvents: tooltip.mode === 'frozen' ? 'auto' : 'none' }}
                        tabIndex={tooltip.mode === 'frozen' ? -1 : undefined}
                        data-frozen-tooltip={tooltip.mode === 'frozen' ? '' : undefined}
                        role={tooltip.mode === 'frozen' ? 'dialog' : undefined}
                        aria-label={tooltip.mode === 'frozen' ? "Infobulle figée du point projeté — Échap pour fermer" : undefined}
                    >
                        <ExpertTooltip
                            data={tooltip.point}
                            userName1={config.users[0]?.name}
                            userName2={config.users[1]?.name}
                            frozen={tooltip.mode === 'frozen'}
                            onOpenDetail={() => setDetailPoint(tooltip.point)}
                        />
                    </div>,
                    document.body,
                )}

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
        </div>
    );
};
