// components/future/FutureHealthSummary.tsx
// [NAV-MERGE-SANTE-FUTUR] Résumé CONDENSÉ de la santé financière, en tête de la page Futur
// (décision Marc 2026-08-27 : « condensé — résumé + lien vers le détail », plutôt qu'un
// déplacement verbatim du sous-onglet Santé). Le détail complet (jauge, 6 métriques, réglage
// des pondérations) reste sur son onglet d'origine (Budget → Santé) : ce composant ne fait que
// pointer vers lui via `navigateWithFocus`, le même mécanisme de deep-link déjà utilisé ailleurs
// (`VieCurveLink`, « Voir au budget » de Transactions).
//
// Score calculé via `utils/healthScore.ts` — SOURCE UNIQUE partagée avec `HealthIndicator.tsx` :
// deux implémentations du même score divergeraient (classe `MCP-NETINCOME-MISLEADING`).

import React, { useMemo } from 'react';
import type { RecurringItem } from '../../types';
import { Tab } from '../../types';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useAutoritePlacements } from '../../hooks/useEcartAutoritePlacements';
import { useTodayIsoLocal } from '../../hooks/useSimulationParams';
import { useProjectionSelector } from '../../hooks/useProjectionSelector';
import { useHasUserData } from '../../utils/useHasUserData';
import { normalizeHealthWeights } from '../../utils/healthWeights';
import { computeHealthMetrics, computeHealthTotalScore, colorForHealthScore, HEALTH_SCORE_UNKNOWN_COLORS } from '../../utils/healthScore';

const selectFireTarget = (chart: ReadonlyArray<{ FireTarget?: number }>): number =>
    chart[0]?.FireTarget ?? 0;

const EMPTY_SUBS: RecurringItem[] = [];

export const FutureHealthSummary: React.FC = () => {
    const { hasData } = useHasUserData();
    const config = useFinanceStore(s => s.config);
    const budgetItems = useFinanceStore(s => s.budgetItems);
    const debts = useFinanceStore(s => s.debts);
    const assets = useFinanceStore(s => s.assets);
    const initialBalances = useFinanceStore(s => s.initialBalances);
    const transactions = useFinanceStore(s => s.transactions);
    const subscriptions = useFinanceStore(s => s.subscriptions) ?? EMPTY_SUBS;
    const fxRates = useFinanceStore(s => s.fxRates);
    const storedWeights = useFinanceStore(s => s.healthWeights);
    const navigateWithFocus = useFinanceStore(s => s.navigateWithFocus);
    const projectionFireTarget = useProjectionSelector(selectFireTarget, 0);
    // [FINTABLE-AUTORITE-PARTOUT étape 3] Le patrimoine noté ici est celui que Marc voit ailleurs.
    const { ecart: ecartAutoritePlacements } = useAutoritePlacements();
    // [DETTE-SOLDE-INSTANTANE-FIGE] Même jour que l'Accueil : le total dû noté ici est celui affiché.
    const todayIso = useTodayIsoLocal();

    const weights = useMemo(() => normalizeHealthWeights(storedWeights), [storedWeights]);
    const metrics = useMemo(
        () => computeHealthMetrics({ config, budgetItems, debts, assets, initialBalances, transactions, subscriptions, fxRates, projectionFireTarget, ecartAutoritePlacements, aujourdhuiIso: todayIso }),
        [config, budgetItems, debts, assets, initialBalances, transactions, subscriptions, projectionFireTarget, fxRates, ecartAutoritePlacements, todayIso],
    );
    const totalScore = useMemo(() => computeHealthTotalScore(metrics, weights), [metrics, weights]);

    const goToDetail = () => navigateWithFocus(Tab.BUDGET, 'sante');

    // No-fake-data : sans données de base, on ne calcule PAS un score (0/100 serait crédible et
    // faux) — même garde que `HealthIndicator`, adaptée au format condensé.
    // [S5-REFONTE-FUTUR] Pastille de l'en-tête (maquettes F-bureau / F-mobile : « Santé 76/100 »),
    // au lieu de la bande pleine largeur. Même bouton, même destination, même nom accessible.
    const pastille = 'touch-target inline-flex items-center gap-1.5 h-9 lg:h-10 px-3.5 lg:px-4 rounded-full border text-meta lg:text-[13px] font-semibold whitespace-nowrap transition-colors focus-ring';

    if (!hasData) {
        return (
            <button
                type="button"
                onClick={goToDetail}
                aria-label="Renseigne ton profil pour voir ta santé financière. Voir le détail."
                className={`${pastille} border-white/12 bg-white/5 text-ink-300 hover:bg-white/10`}
            >
                <span aria-hidden="true">Renseigne ton profil</span>
            </button>
        );
    }

    if (totalScore === null) {
        return (
            <button
                type="button"
                onClick={goToDetail}
                aria-label="Santé financière : aucune donnée exploitable. Voir le détail."
                className={`${pastille} border-white/12 bg-white/5 text-ink-300 hover:bg-white/10`}
            >
                <span aria-hidden="true">Santé <span className={HEALTH_SCORE_UNKNOWN_COLORS.text}>—</span></span>
            </button>
        );
    }

    const colors = colorForHealthScore(totalScore);

    // [HEALTH-MARQUEUR-DONNEE-INVALIDE] Décision de Marc (2026-09-03) : une PASTILLE discrète —
    // pas une phrase — quand au moins une métrique est exclue pour donnée INVALIDE (corrigeable),
    // cliquable vers le détail. Le résumé entier EST déjà le bouton vers le détail : la pastille
    // vit dedans (un bouton dans un bouton serait du HTML invalide — `FINDING-JUSTE-CORRECTIF-INVALIDE`).
    // ⚠️ Ancrée sur le marqueur STRUCTUREL `invalidData`, jamais sur `available:false` seul : une
    // métrique simplement non calculable (cible FIRE absente…) n'appelle AUCUNE action, et une
    // pastille qui s'allumerait pour elle serait un avertissement permanent — donc mort.
    const nbInvalides = metrics.filter((m) => m.invalidData).length;
    const suffixeInvalide = nbInvalides > 0
        ? ` ${nbInvalides === 1 ? 'Une métrique est exclue' : `${nbInvalides} métriques sont exclues`} : donnée invalide à corriger.`
        : '';

    // Couleur du score : texte, bordure et fond teintés de la même famille.
    const teinte = totalScore >= 70 ? 'border-success-400/30 bg-success-500/10' : totalScore >= 40 ? 'border-warning-400/35 bg-warning-500/10' : 'border-danger-400/30 bg-danger-500/10';
    return (
        <button
            type="button"
            onClick={goToDetail}
            aria-label={`Santé financière : ${totalScore} sur 100.${suffixeInvalide} Voir le détail.`}
            className={`${pastille} ${teinte} ${colors.text} hover:brightness-110`}
        >
            <span aria-hidden="true">Santé {totalScore}/100</span>
            {nbInvalides > 0 && (
                <span
                    data-testid="pastille-donnee-invalide"
                    title="Au moins une métrique est exclue du score : une donnée source est invalide. Clique pour voir laquelle et la corriger."
                    className="inline-block w-2 h-2 rounded-full bg-warning-500"
                    aria-hidden="true"
                />
            )}
        </button>
    );
};
