import React, { useState } from 'react';
import { Tab } from '../../types';
import { useFinanceStore } from '../../store/useFinanceStore';
import { Icon } from '../ui/Icon';
import { PAGE_SETUP, RequirementCard } from './PageSetupGate';
import { REQUIREMENTS } from './requirements';

/**
 * Hub de complétude PAR ONGLET (demande Marc) — affiché dans Configuration.
 *
 * Remplace l'ancienne `MissingDataChecklist` (liste plate). Pour CHAQUE onglet
 * gaté : son état (prêt / X sur N), un repère « pas concerné » si opt-out, un
 * bouton « Ouvrir » (navigue vers l'onglet), et au dépli les `RequirementCard`
 * pour remplir DIRECTEMENT ici les infos manquantes.
 *
 * Source unique : `PAGE_SETUP` + `REQUIREMENTS` (le même registre que les gates).
 */

const TAB_ORDER: Tab[] = [
    Tab.DASHBOARD, Tab.TRANSACTIONS, Tab.BUDGET, Tab.TAX, Tab.INVESTMENTS,
    Tab.FUTURE, Tab.RETIREMENT, Tab.REAL_ESTATE, Tab.CHILD, Tab.LIFE_PROJECTS,
    Tab.DEBT, Tab.ACTIONS, Tab.ASSISTANT,
];

export const SetupHub: React.FC<{ className?: string }> = ({ className = '' }) => {
    const state = useFinanceStore((s) => s);
    const navigateWithFocus = useFinanceStore((s) => s.navigateWithFocus);
    const [open, setOpen] = useState<Tab | null>(null);

    const tabs = TAB_ORDER.filter((t) => PAGE_SETUP[t]);
    const tabStatus = tabs.map((t) => {
        const cfg = PAGE_SETUP[t]!;
        const reqs = cfg.requirementIds.map((id) => REQUIREMENTS[id]);
        const met = reqs.filter((r) => r.isMet(state)).length;
        const optedOut = !!(cfg.optOut && state.setupOptOut?.[cfg.optOut.key]);
        return { tab: t, cfg, reqs, met, total: reqs.length, ready: met === reqs.length || optedOut, optedOut };
    });
    const readyCount = tabStatus.filter((s) => s.ready).length;

    return (
        <div className={`rounded-card border border-white/10 bg-white/5 p-4 ${className}`}>
            <div className="flex items-center justify-between gap-3 mb-3">
                <div className="min-w-0">
                    <h3 className="font-bold text-ink-50">Complétude par onglet</h3>
                    <p className="text-meta text-ink-400">
                        Ce qu'il faut renseigner pour débloquer chaque page. Clique un onglet pour compléter ici,
                        ou « Ouvrir » pour y aller.
                    </p>
                </div>
                <span className="text-meta text-ink-400 font-mono shrink-0">{readyCount}/{tabs.length} prêts</span>
            </div>

            <div className="space-y-2">
                {tabStatus.map(({ tab, cfg, reqs, met, total, ready, optedOut }) => {
                    const isOpen = open === tab;
                    return (
                        <div key={tab} className="rounded-card border border-white/[0.08] bg-black/20 overflow-hidden">
                            <div className="flex items-center gap-2 p-2.5">
                                <button
                                    type="button"
                                    onClick={() => setOpen(isOpen ? null : tab)}
                                    aria-expanded={isOpen}
                                    className="flex-1 min-w-0 flex items-center gap-2.5 text-left focus-ring rounded"
                                >
                                    <span
                                        className={`shrink-0 min-w-[1.5rem] h-6 px-1 rounded-md flex items-center justify-center text-tiny font-bold ${
                                            ready ? 'bg-success-500/15 text-success-400' : 'bg-warning-500/15 text-warning-400'
                                        }`}
                                        aria-hidden="true"
                                    >
                                        {ready ? <Icon name="check" size={13} /> : `${met}/${total}`}
                                    </span>
                                    <span className="text-body font-semibold text-ink-100 truncate">{cfg.title}</span>
                                    {optedOut && <span className="text-tiny text-ink-500 shrink-0">(pas concerné)</span>}
                                    <span className={`ml-auto shrink-0 text-ink-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigateWithFocus(tab)}
                                    className="shrink-0 px-2.5 py-1 rounded-card border border-white/10 bg-white/5 text-tiny font-medium text-ink-300 hover:text-ink-50 hover:bg-white/10 transition-colors focus-ring"
                                >
                                    Ouvrir →
                                </button>
                            </div>
                            {isOpen && (
                                <div className="p-3 pt-1 space-y-3 border-t border-white/5">
                                    {reqs.map((req) => <RequirementCard key={req.id} req={req} currentTab={Tab.SETTINGS} />)}
                                    {cfg.optOut && (
                                        <p className="text-tiny text-ink-500 italic">
                                            Optionnel : « {cfg.optOut.label} » est proposé sur l'onglet (réversible).
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
