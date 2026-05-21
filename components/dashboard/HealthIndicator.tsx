import React, { useMemo, useState } from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { formatNumber, formatPercent } from '../../utils/format';
import { useHasUserData } from '../../utils/useHasUserData';
import { EmptyDataPrompt } from '../ui/EmptyDataPrompt';
import { useProjectionSelector } from '../../hooks/useProjectionSelector';

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

const STORAGE_KEY = 'healthIndicator:weights:v1';

// Selectors top-level pour stabilité (useProjectionSelector compare la ref).
const selectFireTarget = (chart: ReadonlyArray<{ FireTarget?: number }>): number =>
    chart[0]?.FireTarget ?? 0;

interface Weights {
    savingsRate: number;
    emergencyFund: number;
    debtRatio: number;
    fireProgress: number;
}

const DEFAULT_WEIGHTS: Weights = {
    savingsRate: 30,
    emergencyFund: 20,
    debtRatio: 20,
    fireProgress: 30,
};

function loadWeights(): Weights {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_WEIGHTS;
        const parsed = JSON.parse(raw) as Partial<Weights>;
        return {
            savingsRate: parsed.savingsRate ?? DEFAULT_WEIGHTS.savingsRate,
            emergencyFund: parsed.emergencyFund ?? DEFAULT_WEIGHTS.emergencyFund,
            debtRatio: parsed.debtRatio ?? DEFAULT_WEIGHTS.debtRatio,
            fireProgress: parsed.fireProgress ?? DEFAULT_WEIGHTS.fireProgress,
        };
    } catch {
        return DEFAULT_WEIGHTS;
    }
}

function saveWeights(w: Weights) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
    } catch {
        // localStorage indisponible — pas critique
    }
}

const clamp01 = (x: number) => Math.max(0, Math.min(100, x));

const colorForScore = (score: number): { ring: string; text: string; bg: string } => {
    if (score >= 70) return { ring: 'stroke-emerald-400', text: 'text-emerald-300', bg: 'bg-emerald-500/10' };
    if (score >= 40) return { ring: 'stroke-amber-400', text: 'text-amber-300', bg: 'bg-amber-500/10' };
    return { ring: 'stroke-red-400', text: 'text-red-300', bg: 'bg-red-500/10' };
};

interface MetricRow {
    id: keyof Weights;
    label: string;
    value: number; // 0-100 (déjà clampé)
    raw: string;   // valeur brute formatée pour le tooltip
    help: string;
}

export const HealthIndicator: React.FC<{ className?: string }> = ({ className = '' }) => {
    // P1 gating — score 0-100 sans données → bogus. On masque tant que pas saisi.
    const { hasData } = useHasUserData();
    const [weights, setWeights] = useState<Weights>(loadWeights);
    const [showSettings, setShowSettings] = useState(false);

    if (!hasData) {
        return (
            <EmptyDataPrompt
                icon="🩺"
                title="Score de santé financière indisponible"
                description="Renseigne ton profil (salaire, dépenses) pour calculer ton score 0-100 et tes 4 ratios (épargne, coussin, dette, FIRE)."
                className={className}
            />
        );
    }

    const config = useFinanceStore(s => s.config);
    const budgetItems = useFinanceStore(s => s.budgetItems);
    const debts = useFinanceStore(s => s.debts);
    const assets = useFinanceStore(s => s.assets);
    const initialBalances = useFinanceStore(s => s.initialBalances);
    // Centralisation : FireTarget vient de la projection si disponible
    const projectionFireTarget = useProjectionSelector(selectFireTarget, 0);

    const metrics = useMemo<MetricRow[]>(() => {
        // Revenus mensuels (netSalary est mensuel dans le store)
        const monthlyIncome = (config?.users || []).reduce(
            (sum, u) => sum + (u.netSalary || u.salary || 0),
            0,
        );
        const monthlyExpenses = (budgetItems || []).reduce((sum, b) => sum + (b.target || 0), 0);
        const liquidity = (initialBalances?.liquidity || 0) + (initialBalances?.checking || 0) + (initialBalances?.savings || 0);
        const totalDebts = (debts || []).reduce((sum, d) => sum + (d.balance || 0), 0);
        const investmentValue = (assets || []).reduce((sum, a) => sum + (a.quantity || 0) * (a.currentPrice || 0), 0);
        const totalAssets = investmentValue + (initialBalances?.celi || 0) + (initialBalances?.reer || 0) + liquidity;

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

        return [
            {
                id: 'savingsRate' as const,
                label: "Taux d'épargne",
                value: savingsRateScore,
                raw: `${formatPercent(savingsRateRaw, 1)} (revenus − dépenses)`,
                help: "Cible 20%+ : marge mensuelle confortable.",
            },
            {
                id: 'emergencyFund' as const,
                label: 'Coussin d\'urgence',
                value: emergencyScore,
                raw: `${formatNumber(emergencyMonths, { decimals: 2 })} mois`,
                help: "Cible 6 mois : suffisant pour absorber une perte d'emploi.",
            },
            {
                id: 'debtRatio' as const,
                label: 'Ratio dette/actif',
                value: debtScore,
                raw: `${formatPercent(debtAssetsRatio, 1)}`,
                help: "Cible 0% : pas de dette. >50% : zone critique.",
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
            },
        ];
    }, [config, budgetItems, debts, assets, initialBalances, projectionFireTarget]);

    // Score global pondéré (normalisation au cas où la somme des poids ≠ 100)
    const totalScore = useMemo(() => {
        const weightedSum = metrics.reduce((sum, m) => sum + m.value * (weights[m.id] || 0), 0);
        const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0);
        return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
    }, [metrics, weights]);

    const colors = colorForScore(totalScore);

    const handleWeightChange = (id: keyof Weights, value: number) => {
        const newWeights = { ...weights, [id]: Math.max(0, Math.min(100, value)) };
        setWeights(newWeights);
        saveWeights(newWeights);
    };

    const resetWeights = () => {
        setWeights(DEFAULT_WEIGHTS);
        saveWeights(DEFAULT_WEIGHTS);
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
                    <span aria-hidden="true">🩺</span>
                    <h2 className="font-bold text-ink-50">Santé financière</h2>
                </div>
                <button
                    type="button"
                    onClick={() => setShowSettings(s => !s)}
                    aria-expanded={showSettings}
                    aria-label="Paramétrer les pondérations"
                    className="text-tiny text-ink-400 hover:text-ink-200 transition-colors focus-ring rounded px-2 py-1"
                >
                    {showSettings ? '✕ Fermer' : '⚙️ Paramétrer'}
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
                                    <span className={`font-mono font-bold ${mColors.text} shrink-0`}>{Math.round(m.value)}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <div className="flex-1 h-1 bg-black/40 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-500 ${m.value >= 70 ? 'bg-emerald-400' : m.value >= 40 ? 'bg-amber-400' : 'bg-red-400'}`}
                                            style={{ width: `${m.value}%` }}
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
                            <span className={`text-tiny font-mono ${totalWeight === 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
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
                        <p className="text-tiny text-amber-400 italic mt-2">
                            ⓘ La somme des poids n'est pas 100%, mais c'est OK : le score est normalisé automatiquement.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};
