import React, { useMemo, useState } from 'react';
import type { HealthWeights, RecurringItem } from '../../types';
import { useFinanceStore } from '../../store/useFinanceStore';
import { DEFAULT_HEALTH_WEIGHTS, normalizeHealthWeights } from '../../utils/healthWeights';
import { computeBudgetParity } from '../../utils/budget';
import { computeBudgetParityScore, computeSubscriptionLoadScore, subscriptionsMonthlyCost, monthlyTargetOf } from '../../utils/healthRatios';
import { formatCAD, formatNumber, formatPercent } from '../../utils/format';
import { useHasUserData } from '../../utils/useHasUserData';
import { EmptyDataPrompt } from '../ui/EmptyDataPrompt';
import { Icon } from '../ui/Icon';
import { useProjectionSelector } from '../../hooks/useProjectionSelector';
import { computeCurrentLiquidity } from '../../services/portfolio';

/**
 * Phase D.6 — indicateur de santé financière paramétrable.
 *
 * Calcule un score global 0-100 à partir de 4 ratios pondérables, chacun
 * cappé entre 0 et 100. L'utilisateur peut ajuster les poids (somme = 100%)
 * via un dropdown. Affichage : jauge circulaire SVG + détail par métrique.
 *
 * Ratios :
 * 1. **Taux d'épargne** = (revenus mensuels − dépenses mensuelles) / revenus
 *    Target 20%+ → score 100. 0% → score 0. Linéaire.
 *
 * 2. **Couverture coussin** = liquidités / (dépenses mensuelles)
 *    Target 6 mois → score 100. <1 mois → score 0.
 *
 * 3. **Ratio dette/actif** = total dettes / patrimoine brut
 *    Target ≤ 0% → score 100. ≥50% → score 0. Plus c'est bas, mieux c'est.
 *
 * 4. **Progression FIRE** = patrimoine actuel / (dépenses annuelles × 25)
 *    Target 100% → score 100. 0% → score 0.
 */

// Selectors top-level pour stabilité (useProjectionSelector compare la ref).
const selectFireTarget = (chart: ReadonlyArray<{ FireTarget?: number }>): number =>
    chart[0]?.FireTarget ?? 0;

const clamp01 = (x: number) => Math.max(0, Math.min(100, x));

// [PH4D-BUDGET-RATIOS] référence stable pour le fallback abonnements (évite une nouvelle [] par render).
const EMPTY_SUBS: RecurringItem[] = [];

const colorForScore = (score: number): { ring: string; text: string; bg: string } => {
    if (score >= 70) return { ring: 'stroke-success-400', text: 'text-emerald-300', bg: 'bg-success-500/10' };
    if (score >= 40) return { ring: 'stroke-warning-400', text: 'text-amber-300', bg: 'bg-warning-500/10' };
    return { ring: 'stroke-danger-400', text: 'text-red-300', bg: 'bg-danger-500/10' };
};

interface MetricRow {
    id: keyof HealthWeights;
    label: string;
    value: number; // 0-100 (déjà clampé)
    raw: string;   // valeur brute formatée pour le tooltip
    help: string;
    /** [PH4D-BUDGET-RATIOS] false = donnée de base manquante (ex. pas de projection FIRE, pas de dépenses du mois) :
     *  la métrique est affichée « requis » et EXCLUE du score pondéré (un 0 par absence de donnée fausserait le score). */
    available: boolean;
}

export const HealthIndicator: React.FC<{ className?: string }> = ({ className = '' }) => {
    // P1 gating — score 0-100 sans données → bogus. On masque tant que pas saisi.
    // IMPORTANT : on lit hasData ici, mais l'early-return est APRÈS tous les
    // hooks (plus bas). Un return avant un hook = React #310 "rendered more
    // hooks than during the previous render" au moment où le store s'hydrate
    // (hasData false → true change le nombre de hooks). Cf. BACKLOG B0.
    const { hasData } = useHasUserData();
    // [PH4D-WEIGHTS-STORE] poids lus/écrits dans le STORE persisté (avant : localStorage local au composant).
    // [PH4D-BUDGET-RATIOS] normalise 4→6 champs (rétrocompat) ; mémorisé sur la réf du store (pas de boucle de rendu).
    const storedWeights = useFinanceStore(s => s.healthWeights);
    const weights = useMemo(() => normalizeHealthWeights(storedWeights), [storedWeights]);
    const setAppState = useFinanceStore(s => s.setAppState);
    const [showSettings, setShowSettings] = useState(false);

    const config = useFinanceStore(s => s.config);
    const budgetItems = useFinanceStore(s => s.budgetItems);
    const debts = useFinanceStore(s => s.debts);
    const assets = useFinanceStore(s => s.assets);
    const initialBalances = useFinanceStore(s => s.initialBalances);
    const transactions = useFinanceStore(s => s.transactions);
    const subscriptions = useFinanceStore(s => s.subscriptions) ?? EMPTY_SUBS;
    // Centralisation : FireTarget vient de la projection si disponible
    const projectionFireTarget = useProjectionSelector(selectFireTarget, 0);

    const metrics = useMemo<MetricRow[]>(() => {
        // Revenus mensuels (netSalary est mensuel dans le store)
        const monthlyIncome = (config?.users || []).reduce(
            (sum, u) => sum + (u.netSalary || u.salary || 0),
            0,
        );
        // [PH4D-BUDGET-RATIOS] normalise la fréquence (monthlyTargetOf) : un poste annuel/trimestriel ne doit pas
        // compter pour sa valeur brute en mensuel (sinon taux d'épargne + coussin faussés ET incohérents avec la parité).
        const monthlyExpenses = (budgetItems || []).reduce((sum, b) => sum + monthlyTargetOf(b), 0);
        // Liquidités = cash de TOUS les comptes. initialBalances a des clés
        // DYNAMIQUES : noms de comptes bancaires en usage réel (ex : « Compte
        // chèque BMO »), ou types en mode test (CELI, REER, LIQUIDITE…). On
        // somme donc toutes les valeurs via la source unique computeCurrentLiquidity
        // (idem Dashboard) au lieu de deviner des clés fixes « liquidity »/
        // « checking »/« celi » qui n'existent jamais → bug : coussin d'urgence
        // toujours à 0, patrimoine sous-estimé.
        const liquidity = computeCurrentLiquidity(initialBalances, transactions);
        const totalDebts = (debts || []).reduce((sum, d) => sum + (d.balance || 0), 0);
        const investmentValue = (assets || []).reduce((sum, a) => sum + (a.quantity || 0) * (a.currentPrice || 0), 0);
        // Patrimoine = placements + liquidités (la liquidité inclut déjà tout
        // le cash : CELI, REER, comptes courants…).
        const totalAssets = investmentValue + liquidity;

        // 1. Taux d'épargne
        const savingsRateRaw = monthlyIncome > 0 ? ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100 : 0;
        const savingsRateScore = clamp01((savingsRateRaw / 20) * 100); // 20% = 100 score

        // 2. Couverture coussin (mois)
        const emergencyMonths = monthlyExpenses > 0 ? liquidity / monthlyExpenses : 0;
        const emergencyScore = clamp01((emergencyMonths / 6) * 100); // 6 mois = 100 score

        // 3. Ratio dette/actif (inversé — moins c'est haut, mieux c'est)
        const debtAssetsRatio = totalAssets > 0 ? (totalDebts / totalAssets) * 100 : (totalDebts > 0 ? 100 : 0);
        const debtScore = clamp01(100 - (debtAssetsRatio / 50) * 100); // 0% dette = 100, 50%+ = 0

        // 4. Progression FIRE (patrimoine / 25× dépenses annuelles)
        // Mode strict : la cible FIRE vient EXCLUSIVEMENT de Future. Si la
        // projection n'a pas été calculée, on retourne null et l'UI affiche
        // un état "Projection requise" plutôt qu'une valeur inventée.
        const fireTarget = projectionFireTarget > 0 ? projectionFireTarget : null;
        const fireProgressPct = fireTarget != null ? (totalAssets / fireTarget) * 100 : null;
        const fireScore = fireProgressPct != null ? clamp01(fireProgressPct) : null;

        // 5. Adhérence au budget — dépenses réelles vs cibles, sur le MOIS COMPLET PRÉCÉDENT (évite le biais
        //    d'un mois courant partiel). YYYY-MM dérivé des composantes LOCALES (toISOString décalerait le mois
        //    en fuseau négatif). On distingue 3 états : (a) aucune dépense le mois dernier → indispo « pas de
        //    données » ; (b) des dépenses mais AUCUNE rapprochée à un poste (toutes orphelines) → indispo, mais
        //    message explicite (sinon un faux 100 ou un « pas de données » trompeur) ; (c) au moins une rapprochée → score.
        const nowDate = new Date();
        const prevMonthDate = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1);
        const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
        const prevSpend = (transactions || []).filter(
            t => typeof t.date === 'string' && t.date.startsWith(prevMonthStr) && t.amount < 0 && !t.isTransfer && !t.isDuplicate,
        );
        const prevParity = computeBudgetParity(prevSpend, budgetItems);
        const hasMatchedActuals = Object.keys(prevParity.actualsMap).length > 0;
        const hadSpending = prevParity.totalSpent > 0;
        const budgetParityScore = hasMatchedActuals ? computeBudgetParityScore(prevParity.actualsMap, budgetItems) : null;
        const budgetParityRaw = budgetParityScore != null
            ? 'Mois précédent : dépenses réelles vs cibles'
            : hadSpending
                ? 'Dépenses non rapprochées à un poste budget'
                : 'Pas encore de dépenses à comparer';

        // 6. Poids des abonnements épinglés — coût MENSUEL (yearlyCost/12, pas de ×12) / revenu net mensuel.
        //    Aucun abo ÉPINGLÉ → indisponible (cohérent avec FIRE/budget) : un 100 « aucun fardeau » serait
        //    trompeur car l'utilisateur a peut-être des abos non épinglés (détectés à la volée seulement).
        const subMonthly = subscriptionsMonthlyCost(subscriptions);
        const subLoadPct = monthlyIncome > 0 ? (subMonthly / monthlyIncome) * 100 : 0;
        const subscriptionLoadScore = subscriptions.length > 0
            ? computeSubscriptionLoadScore(subscriptions, monthlyIncome)
            : null;

        return [
            {
                id: 'savingsRate' as const,
                label: "Taux d'épargne",
                value: savingsRateScore,
                raw: `${formatPercent(savingsRateRaw, 1)} (revenus − dépenses)`,
                help: "Cible 20%+ : marge mensuelle confortable.",
                available: true,
            },
            {
                id: 'emergencyFund' as const,
                label: 'Coussin d\'urgence',
                value: emergencyScore,
                raw: `${formatNumber(emergencyMonths, { decimals: 2 })} mois`,
                help: "Cible 6 mois : suffisant pour absorber une perte d'emploi.",
                available: true,
            },
            {
                id: 'debtRatio' as const,
                label: 'Ratio dette/actif',
                value: debtScore,
                raw: `${formatPercent(debtAssetsRatio, 1)}`,
                help: "Cible 0% : pas de dette. >50% : zone critique.",
                available: true,
            },
            {
                id: 'fireProgress' as const,
                label: 'Progression FIRE',
                value: fireScore ?? 0,
                raw: fireProgressPct != null
                    ? `${formatPercent(fireProgressPct, 1)} (cible Future : ${formatNumber(fireTarget ?? 0)} $)`
                    : 'Projection requise — ouvrir Future',
                help: fireProgressPct != null
                    ? "Cible 100% : indépendance financière atteinte (règle des 4%)."
                    : "La cible FIRE vient de l'onglet Future (moteur de projection). Calculez-la d'abord.",
                available: fireScore != null,
            },
            {
                id: 'budgetParity' as const,
                label: 'Adhérence au budget',
                value: budgetParityScore ?? 0,
                raw: budgetParityRaw,
                help: budgetParityScore != null
                    ? "Cible 100% : tu restes dans tes cibles par poste (hors épargne). Le score baisse avec le dépassement."
                    : hadSpending
                        ? "Tes dépenses du mois dernier ne correspondent à aucun poste budget — vérifie les noms de tes postes."
                        : "Catégorise des dépenses sur un mois complet pour mesurer ton adhérence au budget.",
                available: budgetParityScore != null,
            },
            {
                id: 'subscriptionLoad' as const,
                label: 'Poids des abonnements',
                value: subscriptionLoadScore ?? 0,
                raw: subscriptionLoadScore != null
                    ? `${formatCAD(subMonthly)}/mois (${formatPercent(subLoadPct, 1)} du revenu net)`
                    : subscriptions.length === 0
                        ? 'Aucun abonnement épinglé'
                        : 'Revenu requis',
                help: "Cible <15% du revenu net en abonnements épinglés. Épingle tes abos dans « Charges fixes ».",
                available: subscriptionLoadScore != null,
            },
        ];
    }, [config, budgetItems, debts, assets, initialBalances, transactions, subscriptions, projectionFireTarget]);

    // Score global pondéré. [PH4D-BUDGET-RATIOS] n'inclut que les métriques DISPONIBLES (numérateur ET
    // dénominateur) : une métrique sans donnée (ex. FIRE sans projection, budget sans dépenses) ne doit pas
    // peser comme un 0 qui écraserait le score. Normalisé par la somme des poids des seules métriques comptées.
    const totalScore = useMemo(() => {
        const counted = metrics.filter(m => m.available);
        const weightedSum = counted.reduce((sum, m) => sum + m.value * (weights[m.id] || 0), 0);
        const totalWeight = counted.reduce((sum, m) => sum + (weights[m.id] || 0), 0);
        return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
    }, [metrics, weights]);

    // Early-return APRÈS tous les hooks (règle des Hooks — voir tête de fonction).
    if (!hasData) {
        return (
            <EmptyDataPrompt
                icon={<Icon name="health" size={24} />}
                title="Score de santé financière indisponible"
                description="Renseigne ton profil (salaire, dépenses) pour calculer ton score 0-100 et tes 4 ratios (épargne, coussin, dette, FIRE)."
                className={className}
            />
        );
    }

    const colors = colorForScore(totalScore);

    const handleWeightChange = (id: keyof HealthWeights, value: number) => {
        setAppState({ healthWeights: { ...weights, [id]: Math.max(0, Math.min(100, value)) } });
    };

    const resetWeights = () => {
        setAppState({ healthWeights: { ...DEFAULT_HEALTH_WEIGHTS } });
    };

    const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0);

    // Géométrie du donut SVG (rayon 56, stroke 8)
    const RADIUS = 56;
    const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
    const dashOffset = CIRCUMFERENCE * (1 - totalScore / 100);

    return (
        <div className={`rounded-card border border-white/10 bg-white/5 p-4 ${className}`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Icon name="health" size={16} className="text-ink-300" />
                    <h2 className="font-bold text-ink-50">Santé financière</h2>
                </div>
                <button
                    type="button"
                    onClick={() => setShowSettings(s => !s)}
                    aria-expanded={showSettings}
                    aria-label="Paramétrer les pondérations"
                    className="text-tiny text-ink-400 hover:text-ink-200 transition-colors focus-ring rounded px-2 py-1"
                >
                    {showSettings ? 'Fermer' : 'Paramétrer'}
                </button>
            </div>

            <div className="flex items-center gap-6">
                {/* Donut chart SVG */}
                <div className="relative shrink-0">
                    <svg width="128" height="128" viewBox="0 0 128 128" className="transform -rotate-90">
                        <circle
                            cx="64"
                            cy="64"
                            r={RADIUS}
                            fill="none"
                            stroke="rgba(255,255,255,0.08)"
                            strokeWidth="8"
                        />
                        <circle
                            cx="64"
                            cy="64"
                            r={RADIUS}
                            fill="none"
                            className={`${colors.ring} transition-all duration-700`}
                            strokeWidth="8"
                            strokeDasharray={CIRCUMFERENCE}
                            strokeDashoffset={dashOffset}
                            strokeLinecap="round"
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className={`text-2xl font-black ${colors.text} tabular-nums`}>{totalScore}</div>
                        <div className="text-tiny text-ink-500">/ 100</div>
                    </div>
                </div>

                {/* Breakdown */}
                <div className="flex-1 min-w-0 space-y-1.5">
                    {metrics.map(m => {
                        const mColors = colorForScore(m.value);
                        return (
                            <div key={m.id} className="group">
                                <div className="flex items-center justify-between text-meta">
                                    <span className="text-ink-300 truncate" title={m.help}>{m.label}</span>
                                    <span className={`font-mono font-bold shrink-0 ${m.available ? mColors.text : 'text-ink-400'}`} aria-label={m.available ? undefined : `${m.label} : donnée indisponible`}>{m.available ? Math.round(m.value) : '—'}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <div className="flex-1 h-1 bg-black/40 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-500 ${m.value >= 70 ? 'bg-success-400' : m.value >= 40 ? 'bg-warning-400' : 'bg-danger-400'}`}
                                            style={{ width: `${m.available ? m.value : 0}%` }}
                                        />
                                    </div>
                                    <span className="text-tiny text-ink-500 font-mono shrink-0 tabular-nums">{weights[m.id]}%</span>
                                </div>
                                <div className="text-tiny text-ink-500 mt-0.5">{m.raw}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {showSettings && (
                <div className="mt-4 pt-3 border-t border-white/10 space-y-2">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-meta font-bold text-ink-200">Pondérations</span>
                        <div className="flex items-center gap-2">
                            <span className={`text-tiny font-mono ${totalWeight === 100 ? 'text-success-400' : 'text-warning-400'}`}>
                                Total : {totalWeight}%
                            </span>
                            <button
                                type="button"
                                onClick={resetWeights}
                                className="text-tiny text-ink-400 hover:text-ink-200 px-2 py-0.5 rounded transition-colors"
                            >
                                Réinitialiser
                            </button>
                        </div>
                    </div>
                    {metrics.map(m => (
                        <div key={m.id} className="flex items-center gap-3">
                            <label htmlFor={`hw-${m.id}`} className="text-tiny text-ink-300 w-40 shrink-0">{m.label}</label>
                            <input
                                id={`hw-${m.id}`}
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={weights[m.id]}
                                onChange={e => handleWeightChange(m.id, Number(e.target.value))}
                                className="flex-1 h-1.5 bg-black/40 rounded-full accent-primary cursor-pointer"
                            />
                            <span className="text-tiny font-mono text-ink-200 w-10 text-right tabular-nums">{weights[m.id]}%</span>
                        </div>
                    ))}
                    {totalWeight !== 100 && (
                        <p className="text-tiny text-warning-400 italic mt-2">
                            ⓘ La somme des poids n'est pas 100%, mais c'est OK : le score est normalisé automatiquement.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};
