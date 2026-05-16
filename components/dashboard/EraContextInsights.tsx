import React, { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { KPIStat } from '../ui/KPIStat';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { useFinanceStore } from '../../store/useFinanceStore';
import { buildEnrichedContext, type EnrichedContext } from '../../services/aiOrchestrator';

/**
 * Phase 4 B6+B7 — Widget Dashboard qui affiche les insights pré-calculés
 * par Era Context (cash-flow, top spending, forecast).
 *
 * - N'apparaît que si l'utilisateur a configuré un token Era Context
 * - Cache 1h côté eraContext.ts (pas de fetch à chaque mount)
 * - Showcase visible de la nouvelle infra Phase 4.B
 */
export const EraContextInsights: React.FC = () => {
    const eraToken = useFinanceStore(s => s.apiKeys.eraContext);
    const [ctx, setCtx] = useState<EnrichedContext | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!eraToken) {
            setCtx(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        buildEnrichedContext(eraToken)
            .then(result => { if (!cancelled) setCtx(result); })
            .catch(() => { if (!cancelled) setCtx(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [eraToken]);

    // Pas de token configuré → ne rien afficher (silencieux, pas d'EmptyState
    // intrusif sur le Dashboard).
    if (!eraToken) return null;

    if (loading && !ctx) {
        return (
            <Card title="📊 Insights Era Context">
                <div className="flex items-center justify-center py-6">
                    <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-label="Chargement des insights" />
                </div>
            </Card>
        );
    }

    if (!ctx || (!ctx.cashFlow && !ctx.spending && !ctx.forecast)) {
        return (
            <Card title="📊 Insights Era Context">
                <EmptyState
                    icon="📡"
                    variant="subtle"
                    title="Insights indisponibles"
                    description="Era Context n'a pas encore d'historique suffisant. Reviens dans quelques jours."
                />
            </Card>
        );
    }

    const nextMonth = ctx.forecast?.forecast?.[0];

    return (
        <Card
            title="📊 Insights Era Context"
            action={<Badge variant="info" size="sm">🔗 pré-calculé</Badge>}
        >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {ctx.cashFlow && (
                    <KPIStat
                        label="Cash-flow 90j"
                        icon="💰"
                        value={`${ctx.cashFlow.net_cash_flow.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}`}
                        sublabel={`${ctx.cashFlow.income_total.toLocaleString()} − ${ctx.cashFlow.expense_total.toLocaleString()}`}
                        privacy
                        variant={ctx.cashFlow.net_cash_flow >= 0 ? 'success' : 'danger'}
                    />
                )}
                {ctx.spending?.top_categories?.[0] && (
                    <KPIStat
                        label="Top catégorie 30j"
                        icon="🏷️"
                        value={ctx.spending.top_categories[0].category}
                        sublabel={`${ctx.spending.top_categories[0].amount.toLocaleString()} CAD · ${ctx.spending.top_categories[0].pct.toFixed(0)}%`}
                        privacy
                        variant="warning"
                    />
                )}
                {nextMonth && (
                    <KPIStat
                        label="Prévision mois prochain"
                        icon="🔮"
                        value={`${nextMonth.projected_expenses.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}`}
                        sublabel={`Dépenses · confiance ${nextMonth.confidence ?? 'medium'}`}
                        privacy
                        variant="info"
                    />
                )}
            </div>

            {ctx.spending?.anomalies && ctx.spending.anomalies.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="text-tiny uppercase text-warning-400 font-bold tracking-widest mb-2">⚠️ Anomalies détectées</div>
                    <ul className="space-y-1">
                        {ctx.spending.anomalies.slice(0, 3).map((a, i) => (
                            <li key={i} className="text-meta text-ink-300">
                                <span className="font-bold text-ink-100">{a.category}:</span> {a.description}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {ctx.memory.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="text-tiny uppercase text-info-400 font-bold tracking-widest mb-2">🧠 Mémoire ({ctx.memory.length})</div>
                    <ul className="space-y-1">
                        {ctx.memory.slice(0, 3).map(f => (
                            <li key={f.id} className="text-meta text-ink-400 italic">"{f.fact}"</li>
                        ))}
                    </ul>
                </div>
            )}
        </Card>
    );
};
