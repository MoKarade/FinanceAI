import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { getNextBestActions, type NextBestAction as NBAction, type FinancialSnapshot } from '../../services/claude';
import { computeCurrentLiquidity, computeInvestmentsValue, computeAssetBreakdown } from '../../services/portfolio';
import { useHasUserData } from '../../utils/useHasUserData';
import { Tab } from '../../types';

/**
 * Phase B.3 — widget IA "Prochaine Meilleure Action".
 *
 * Remplace l'ancien widget statique "prochain palier / cible" par une zone
 * d'analyse IA temps réel : Claude Haiku 4.5 produit 1-3 actions concrètes
 * en se basant sur la projection vivante.
 *
 * Cache localStorage 1h ; rafraîchissement manuel via bouton. Quand la
 * sidebar est collapsed, n'affiche qu'une pastille avec couleur d'urgence.
 */

const CACHE_KEY = 'nba:cache:v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

interface CachedNBA {
    timestamp: number;
    actions: NBAction[];
}

function readCache(): CachedNBA | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CachedNBA;
        if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeCache(actions: NBAction[]) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), actions }));
    } catch {
        // localStorage may be full or disabled — silent fail.
    }
}

const URGENCY_COLORS: Record<NBAction['urgency'], { dot: string; border: string; text: string }> = {
    high: { dot: 'bg-danger-500', border: 'border-danger-500/30', text: 'text-red-300' },
    medium: { dot: 'bg-warning-400', border: 'border-warning-400/30', text: 'text-amber-300' },
    low: { dot: 'bg-success-400', border: 'border-success-400/30', text: 'text-emerald-300' },
};

interface NextBestActionProps {
    isSidebarOpen: boolean;
}

export const NextBestAction: React.FC<NextBestActionProps> = ({ isSidebarOpen }) => {
    const [actions, setActions] = useState<NBAction[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [lastFetch, setLastFetch] = useState<number | null>(null);

    const apiKey = useFinanceStore(s => s.apiKeys.anthropic);
    const navigateWithFocus = useFinanceStore(s => s.navigateWithFocus);
    // P1 gating — pas de recommandation pertinente sans données utilisateur
    const { hasData } = useHasUserData();
    const assets = useFinanceStore(s => s.assets);
    const initialBalances = useFinanceStore(s => s.initialBalances);
    const transactions = useFinanceStore(s => s.transactions);
    const debts = useFinanceStore(s => s.debts);
    const config = useFinanceStore(s => s.config);
    const budgetItems = useFinanceStore(s => s.budgetItems);
    const retirementGoal = useFinanceStore(s => s.retirementGoal);
    const financialGoals = useFinanceStore(s => s.financialGoals);
    const lastProjection = useFinanceStore(s => s.lastProjection);

    const snapshot: FinancialSnapshot = useMemo(() => {
        // Patrimoine net = placements + liquidités (cash de TOUS les comptes :
        // initialBalances a des clés dynamiques, donc source unique) − dettes.
        // Avant, on lisait des clés fixes celi/reer/liquidity qui n'existent
        // jamais → patrimoine sous-estimé envoyé à l'IA.
        const investmentsValue = computeInvestmentsValue(assets || [], {});
        const assetBreakdown = computeAssetBreakdown(assets || [], {});
        const netWorth =
            investmentsValue
            + computeCurrentLiquidity(initialBalances, transactions)
            - (debts || []).reduce((acc, d) => acc + (d.balance || 0), 0);

        // `netSalary` est en MENSUEL dans le store (cf Budget.tsx + Retirement.tsx).
        const monthlyIncome = (config?.users?.[0]?.netSalary || 0) + (config?.users?.[1]?.netSalary || 0);
        const monthlyExpenses = (budgetItems || []).reduce((acc, b) => acc + (b.target || 0), 0);

        const projected = lastProjection?.chartData?.length
            ? lastProjection.chartData[Math.min(20 * 12 - 1, lastProjection.chartData.length - 1)]?.NetWorth
            : undefined;

        return {
            netWorth,
            monthlyIncome,
            monthlyExpenses,
            // Soldes CELI/REER = valeur des placements de ce type (par accountType).
            celiBalance: assetBreakdown.celi,
            reerBalance: assetBreakdown.reer,
            currentAge: config?.users?.[0]?.age || 30,
            retirementAge: retirementGoal?.targetAge || 65,
            topDebts: (debts || []).slice(0, 3).map(d => ({ name: d.name, balance: d.balance, rate: d.interestRate })),
            activeGoals: (financialGoals || [])
                .filter(g => !g.completed)
                .slice(0, 3)
                .map(g => ({
                    name: g.name,
                    targetAmount: g.targetAmount,
                    currentAmount: g.manualCurrentAmount || 0,
                    deadline: g.deadline,
                })),
            projectedNetWorth20y: projected,
            coupleMode: Boolean(config?.users?.[1]?.name && config.users[1].name.trim() !== ''),
        };
    }, [assets, initialBalances, transactions, debts, config, budgetItems, retirementGoal, financialGoals, lastProjection]);

    const fetchActions = useCallback(async (force = false) => {
        if (!apiKey || !hasData) {
            setActions([]);
            return;
        }
        if (!force) {
            const cached = readCache();
            if (cached) {
                setActions(cached.actions);
                setLastFetch(cached.timestamp);
                return;
            }
        }
        setIsLoading(true);
        setHasError(false);
        try {
            const snap: FinancialSnapshot = { ...snapshot };
            const result = await getNextBestActions(snap, apiKey);
            if (result.length > 0) {
                setActions(result);
                writeCache(result);
                setLastFetch(Date.now());
            } else {
                setHasError(true);
            }
        } catch (e) {
            // SF4 fix (Sprint 1) : avant ce fix, toute erreur (timeout réseau,
            // 500 Anthropic, parsing échoué) affichait le même message générique
            // sans aucune trace. Maintenant on loggue via errorLogger pour
            // pouvoir diagnostiquer dans SystemView.
            import('../../services/errorLogger').then(({ logError }) => {
                logError({
                    source: 'ai',
                    severity: 'warning',
                    message: 'getNextBestActions failed',
                    error: e instanceof Error ? e : new Error(String(e)),
                });
            }).catch(() => { /* logger HS, silent */ });
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    }, [apiKey, snapshot, hasData]);

    // Initial fetch (depuis cache si dispo).
    useEffect(() => {
        fetchActions(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiKey]);

    // État collapsed : pastille avec couleur d'urgence
    if (!isSidebarOpen) {
        const topAction = actions[0];
        const urgency = topAction?.urgency;
        const colors = urgency ? URGENCY_COLORS[urgency] : URGENCY_COLORS.low;
        return (
            <div
                className="w-full flex justify-center py-2"
                title={topAction ? `${topAction.title}\n${topAction.reason}` : 'Prochaine meilleure action IA (configurer dans Configuration)'}
            >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${actions.length > 0 ? 'bg-white/5 border ' + colors.border : 'bg-white/[0.02] border border-white/10'}`}>
                    <span className="text-base" aria-hidden="true">⚡</span>
                    {actions.length > 0 && (
                        <span className={`absolute mt-5 ml-5 w-2 h-2 rounded-full ${colors.dot}`} aria-hidden="true" />
                    )}
                </div>
            </div>
        );
    }

    // État expanded : carte complète
    // P1 gating — pas de données utilisateur → pas d'action pertinente
    if (!hasData) {
        return (
            <div className="px-3 pb-3">
                <button
                    type="button"
                    onClick={() => navigateWithFocus(Tab.SETTINGS, 'profile-user1-card')}
                    className="w-full text-left p-3 rounded-xl bg-warning-500/5 border border-warning-500/20 text-meta text-amber-300 hover:bg-warning-500/10 focus-ring transition-colors"
                >
                    <div className="font-bold mb-1 flex items-center gap-2">
                        <span aria-hidden="true">⚡</span> Aucune action disponible
                    </div>
                    <div className="text-tiny text-ink-400">
                        Renseigne ton profil pour activer les recommandations IA.
                    </div>
                    <div className="text-tiny text-warning-400 mt-1 font-medium">→ Configurer mon profil</div>
                </button>
            </div>
        );
    }
    if (!apiKey) {
        return (
            <div className="px-3 pb-3">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-meta text-ink-400">
                    <div className="font-bold text-ink-200 mb-1 flex items-center gap-2">
                        <span aria-hidden="true">⚡</span> Prochaine meilleure action
                    </div>
                    <div className="text-tiny">
                        Configure ta clé API Anthropic dans <span className="text-primary">Configuration</span> pour activer les recommandations IA.
                    </div>
                </div>
            </div>
        );
    }

    if (isLoading && actions.length === 0) {
        return (
            <div className="px-3 pb-3">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-meta text-ink-300 font-bold mb-2 flex items-center gap-2">
                        <span aria-hidden="true">⚡</span> Analyse en cours…
                    </div>
                    <div className="h-2 w-2/3 bg-white/10 rounded animate-pulse mb-1.5" />
                    <div className="h-2 w-full bg-white/10 rounded animate-pulse" />
                </div>
            </div>
        );
    }

    if (actions.length === 0) {
        return (
            <div className="px-3 pb-3">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-meta text-ink-400">
                    <div className="font-bold text-ink-200 mb-1 flex items-center gap-2">
                        <span aria-hidden="true">⚡</span> Prochaine meilleure action
                    </div>
                    <button
                        type="button"
                        onClick={() => fetchActions(true)}
                        className="text-tiny text-primary hover:underline"
                    >
                        Générer une recommandation →
                    </button>
                    {hasError && <div className="text-tiny text-danger-400 mt-1">Erreur IA — vérifie ta clé Anthropic.</div>}
                </div>
            </div>
        );
    }

    const top = actions[0];
    const colors = URGENCY_COLORS[top.urgency];
    return (
        <div className="px-3 pb-3">
            <div className={`p-3 rounded-xl bg-gradient-to-br from-[#1A1E29] to-[#0d0f14] border ${colors.border} relative overflow-hidden`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`} aria-hidden="true" />
                        <span className="text-tiny uppercase tracking-widest font-bold text-ink-400">Prochaine action</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => fetchActions(true)}
                        disabled={isLoading}
                        title="Rafraîchir l'analyse IA"
                        aria-label="Rafraîchir l'analyse IA"
                        className="text-tiny text-ink-500 hover:text-ink-200 transition-colors disabled:opacity-50 shrink-0"
                    >
                        {isLoading ? '…' : '↻'}
                    </button>
                </div>
                <div className={`text-meta font-bold ${colors.text} mb-1 leading-tight`}>
                    {top.title}
                </div>
                <div className="text-tiny text-ink-400 leading-snug mb-2">
                    {top.reason}
                </div>
                {top.impact_estimate && (
                    <div className="text-tiny font-mono text-ink-300 bg-white/5 px-2 py-1 rounded inline-block">
                        {top.impact_estimate}
                    </div>
                )}
                {actions.length > 1 && (
                    <details className="mt-2">
                        <summary className="text-tiny text-ink-500 cursor-pointer hover:text-ink-300 list-none flex items-center gap-1">
                            <span>+{actions.length - 1} autre{actions.length > 2 ? 's' : ''} action{actions.length > 2 ? 's' : ''}</span>
                        </summary>
                        <div className="mt-2 space-y-2">
                            {actions.slice(1).map((action, i) => {
                                const c = URGENCY_COLORS[action.urgency];
                                return (
                                    <div key={i} className="text-tiny border-l-2 pl-2" style={{ borderColor: 'currentColor' }}>
                                        <div className={`font-bold ${c.text}`}>{action.title}</div>
                                        <div className="text-ink-400">{action.reason}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </details>
                )}
                {lastFetch && (
                    <div className="text-tiny text-ink-600 mt-2">
                        Mis à jour {Math.round((Date.now() - lastFetch) / 60000)} min
                    </div>
                )}
            </div>
        </div>
    );
};
