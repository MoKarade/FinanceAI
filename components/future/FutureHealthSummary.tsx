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
import { computeHealthMetrics, computeHealthTotalScore, colorForHealthScore } from '../../utils/healthScore';
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

    const colors = colorForHealthScore(totalScore);

    return (
        <button
            type="button"
            onClick={goToDetail}
            aria-label={`Santé financière : ${totalScore} sur 100. Voir le détail.`}
            className="touch-target w-full flex items-center gap-3 rounded-card border border-white/10 bg-white/5 px-4 py-2.5 text-left hover:bg-white/10 transition-colors focus-ring"
        >
            <Icon name="health" size={16} className={`${colors.text} shrink-0`} aria-hidden="true" />
            <span className="text-meta text-ink-200 flex-1" aria-hidden="true">
                Santé financière : <span className={`font-bold ${colors.text}`}>{totalScore}/100</span>
            </span>
            <span className="text-tiny text-ink-400 shrink-0" aria-hidden="true">Voir le détail →</span>
        </button>
    );
};
