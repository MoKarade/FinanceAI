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
import { useProjectionSelector } from '../../hooks/useProjectionSelector';
import { useHasUserData } from '../../utils/useHasUserData';
import { normalizeHealthWeights } from '../../utils/healthWeights';
import { computeHealthMetrics, computeHealthTotalScore, colorForHealthScore, HEALTH_SCORE_UNKNOWN_COLORS } from '../../utils/healthScore';
import { Icon } from '../ui/Icon';

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

    const weights = useMemo(() => normalizeHealthWeights(storedWeights), [storedWeights]);
    const metrics = useMemo(
        () => computeHealthMetrics({ config, budgetItems, debts, assets, initialBalances, transactions, subscriptions, fxRates, projectionFireTarget }),
        [config, budgetItems, debts, assets, initialBalances, transactions, subscriptions, projectionFireTarget, fxRates],
    );
    const totalScore = useMemo(() => computeHealthTotalScore(metrics, weights), [metrics, weights]);

    const goToDetail = () => navigateWithFocus(Tab.BUDGET, 'sante');

    // No-fake-data : sans données de base, on ne calcule PAS un score (0/100 serait crédible et
    // faux) — même garde que `HealthIndicator`, adaptée au format condensé.
    if (!hasData) {
        return (
            <button
                type="button"
                onClick={goToDetail}
                // [a11y panel] Même contrat que la branche AVEC score : nom accessible porté par
                // `aria-label` (le glyphe « → » serait épelé s'il restait dans le nom calculé), tout
                // le contenu visible en `aria-hidden`. `touch-target` : le padding seul donne ~36 px,
                // sous le plancher de 44 px appliqué partout ailleurs (cf. `ui/SubTabs.tsx`).
                aria-label="Renseigne ton profil pour voir ta santé financière. Voir le détail."
                className="touch-target w-full flex items-center gap-2 rounded-card border border-white/10 bg-white/5 px-4 py-2.5 text-left hover:bg-white/10 transition-colors focus-ring"
            >
                <Icon name="health" size={16} className="text-ink-400 shrink-0" aria-hidden="true" />
                <span className="text-meta text-ink-300 flex-1" aria-hidden="true">Renseigne ton profil pour voir ta santé financière.</span>
                <span className="text-tiny text-ink-400 shrink-0" aria-hidden="true">Voir le détail →</span>
            </button>
        );
    }

    // [Finding silent-failure-hunter, panel PR #756] `null` = AUCUNE métrique mesurable (corruption
    // large qui exclut jusqu'aux trois métriques de base). Afficher « 0/100 » y serait un score
    // crédible ET faux, peint en ROUGE par `colorForHealthScore(0)` — l'utilisateur lirait « santé
    // critique » là où la réponse honnête est « rien de mesurable ». Même traitement que `!hasData`,
    // avec un libellé qui distingue la CAUSE (donnée invalide, actionnable) de l'absence de profil.
    if (totalScore === null) {
        return (
            <button
                type="button"
                onClick={goToDetail}
                aria-label="Santé financière : aucune donnée exploitable. Voir le détail."
                className="touch-target w-full flex items-center gap-2 rounded-card border border-white/10 bg-white/5 px-4 py-2.5 text-left hover:bg-white/10 transition-colors focus-ring"
            >
                <Icon name="health" size={16} className={`${HEALTH_SCORE_UNKNOWN_COLORS.text} shrink-0`} aria-hidden="true" />
                <span className="text-meta text-ink-300 flex-1" aria-hidden="true">
                    Santé financière : <span className="font-bold text-ink-400">—</span> (aucune donnée exploitable)
                </span>
                <span className="text-tiny text-ink-400 shrink-0" aria-hidden="true">Voir le détail →</span>
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

    return (
        <button
            type="button"
            onClick={goToDetail}
            aria-label={`Santé financière : ${totalScore} sur 100.${suffixeInvalide} Voir le détail.`}
            className="touch-target w-full flex items-center gap-3 rounded-card border border-white/10 bg-white/5 px-4 py-2.5 text-left hover:bg-white/10 transition-colors focus-ring"
        >
            <Icon name="health" size={16} className={`${colors.text} shrink-0`} aria-hidden="true" />
            <span className="text-meta text-ink-200 flex-1" aria-hidden="true">
                Santé financière : <span className={`font-bold ${colors.text}`}>{totalScore}/100</span>
                {nbInvalides > 0 && (
                    <span
                        data-testid="pastille-donnee-invalide"
                        title="Au moins une métrique est exclue du score : une donnée source est invalide. Clique pour voir laquelle et la corriger."
                        className="ml-2 inline-block w-2 h-2 rounded-full bg-warning-500 align-middle"
                    />
                )}
            </span>
            <span className="text-tiny text-ink-400 shrink-0" aria-hidden="true">Voir le détail →</span>
        </button>
    );
};
