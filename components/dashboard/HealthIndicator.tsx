import React, { useMemo, useState } from 'react';
import type { HealthWeights, RecurringItem } from '../../types';
import { useFinanceStore } from '../../store/useFinanceStore';
import { DEFAULT_HEALTH_WEIGHTS, normalizeHealthWeights } from '../../utils/healthWeights';
// [NAV-MERGE-SANTE-FUTUR] Calcul des métriques/score EXTRAIT vers `utils/healthScore.ts` (source
// unique) : le résumé condensé de Futur (`FutureHealthSummary`) doit afficher le MÊME score.
import { computeHealthMetrics, computeHealthTotalScore, colorForHealthScore, HEALTH_SCORE_UNKNOWN_COLORS, type HealthMetricRow } from '../../utils/healthScore';
import { useHasUserData } from '../../utils/useHasUserData';
import { EmptyDataPrompt } from '../ui/EmptyDataPrompt';
import { Icon } from '../ui/Icon';
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

// Selectors top-level pour stabilité (useProjectionSelector compare la ref).
const selectFireTarget = (chart: ReadonlyArray<{ FireTarget?: number }>): number =>
    chart[0]?.FireTarget ?? 0;

// [PH4D-BUDGET-RATIOS] référence stable pour le fallback abonnements (évite une nouvelle [] par render).
const EMPTY_SUBS: RecurringItem[] = [];

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
    // [ASSET-FX-DISPLAY] prix des actifs en devise NATIVE → conversion CAD pour le patrimoine du score.
    const fxRates = useFinanceStore(s => s.fxRates);
    // Centralisation : FireTarget vient de la projection si disponible
    const projectionFireTarget = useProjectionSelector(selectFireTarget, 0);

    const metrics = useMemo<HealthMetricRow[]>(
        () => computeHealthMetrics({ config, budgetItems, debts, assets, initialBalances, transactions, subscriptions, fxRates, projectionFireTarget }),
        [config, budgetItems, debts, assets, initialBalances, transactions, subscriptions, projectionFireTarget, fxRates],
    );

    const totalScore = useMemo(() => computeHealthTotalScore(metrics, weights), [metrics, weights]);

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

    // [Finding silent-failure-hunter, panel PR #756] `null` = aucune métrique mesurable. On peint
    // NEUTRE et on affiche « — » : la palette de `colorForHealthScore(0)` est celle du DANGER, et
    // un anneau rouge à 0/100 dirait « santé critique » au lieu de « rien de mesurable ».
    const colors = totalScore === null ? HEALTH_SCORE_UNKNOWN_COLORS : colorForHealthScore(totalScore);

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
    const dashOffset = totalScore === null ? CIRCUMFERENCE : CIRCUMFERENCE * (1 - totalScore / 100); // null → anneau VIDE

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
                        <div className={`text-2xl font-black ${colors.text} tabular-nums`}>{totalScore ?? '—'}</div>
                        <div className="text-tiny text-ink-400">/ 100</div>
                    </div>
                </div>

                {/* Breakdown */}
                <div className="flex-1 min-w-0 space-y-1.5">
                    {metrics.map(m => {
                        const mColors = colorForHealthScore(m.value);
                        return (
                            <div key={m.id} className="group">
                                <div className="flex items-center justify-between text-meta">
                                    <span className="text-ink-300 truncate" title={m.help}>{m.label}</span>
                                    {/* [HEALTH-CORRUPTION-INDISTINGUABLE-D-UNE-ABSENCE] L'`aria-label` disait
                                        « donnée indisponible » pour TOUS les états indisponibles — y compris,
                                        depuis le lot 31, « ta donnée est corrompue, va la corriger ». Trois
                                        situations aux actions opposées annoncées d'une seule phrase. Il porte
                                        désormais la vraie raison (`m.raw`), et `aria-describedby` ASSOCIE
                                        explicitement le score à sa ligne de détail — sans quoi un lecteur
                                        d'écran qui navigue par éléments, et non au fil du texte, ne la
                                        rencontre jamais (audit a11y, panel PR #757). */}
                                    <span
                                        className={`font-mono font-bold shrink-0 ${m.available ? mColors.text : 'text-ink-400'}`}
                                        aria-label={m.available ? undefined : `${m.label} : ${m.raw}`}
                                        aria-describedby={`health-detail-${m.id}`}
                                    >{m.available ? Math.round(m.value) : '—'}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <div className="flex-1 h-1 bg-black/40 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-500 ${m.value >= 70 ? 'bg-success-400' : m.value >= 40 ? 'bg-warning-400' : 'bg-danger-400'}`}
                                            style={{ width: `${m.available ? m.value : 0}%` }}
                                        />
                                    </div>
                                    <span className="text-tiny text-ink-400 font-mono shrink-0 tabular-nums">{weights[m.id]}%</span>
                                </div>
                                {/* `m.help` ne transitait QUE par l'attribut `title` du libellé, sur un
                                    `<span>` non focusable : hors clavier, invisible au tactile, et non
                                    annoncé de façon fiable par un lecteur d'écran (WCAG 1.4.13, audit a11y
                                    panel PR #757). Le `title` reste pour la souris ; la justification est
                                    désormais AUSSI dans le nom accessible, en `sr-only`, donc elle ne
                                    dépend plus d'un survol. */}
                                <div id={`health-detail-${m.id}`} className="text-tiny text-ink-400 mt-0.5">
                                    {m.raw}<span className="sr-only"> — {m.help}</span>
                                </div>
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
