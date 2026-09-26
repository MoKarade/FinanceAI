import React, { useState } from 'react';
import { Tab } from '../../types';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useShallow } from 'zustand/shallow';
import { Icon } from '../ui/Icon';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { PAGE_SETUP, RequirementCard } from './PageSetupGate';
import { REQUIREMENTS } from './requirements';
import { navItemOfTab } from '../navDestinations';

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

// [REFONTE-NAV Lot 1] Accueil retiré ; ordre aligné sur les 6 destinations
// (Futur, puis Configurations, Vie, Transactions, Assistant).
// [REFONTE-NAV-L3] Tab.REAL_ESTATE_PROJECTS est VOLONTAIREMENT absent : il partage le
// prérequis `realEstate` avec Immobilier — le lister doublerait la même carte et
// gonflerait le % de complétion (double comptage du même prérequis).
const TAB_ORDER: Tab[] = [
    Tab.FUTURE, Tab.INVESTMENTS, Tab.REAL_ESTATE, Tab.DEBT, Tab.TAX,
    Tab.RETIREMENT, Tab.CHILD, Tab.LIFE_PROJECTS,
    Tab.TRANSACTIONS, Tab.BUDGET, Tab.ASSISTANT,
];

/**
 * [PERF-RENDER-SETUPHUB-FULLSTORE] Onglets gatés, calculés UNE fois : `PAGE_SETUP` est une
 * constante de module, donc la liste ne dépend d'aucun état. Hors composant, la fermeture des
 * sélecteurs ci-dessous reste stable.
 */
const TABS_GATES: Tab[] = TAB_ORDER.filter((t) => PAGE_SETUP[t]);

/** [S5-REFONTE-REGLAGES] Complétude par onglet, partagée par le hub et la pastille du menu Réglages. */
export function useCompletudeOnglets() {
    const metParOnglet = useFinanceStore(useShallow((s) => TABS_GATES.map(
        (t) => PAGE_SETUP[t]!.requirementIds.filter((id) => REQUIREMENTS[id].isMet(s)).length,
    )));
    const horsPerimetreParOnglet = useFinanceStore(useShallow((s) => TABS_GATES.map((t) => {
        const cfg = PAGE_SETUP[t]!;
        return !!(cfg.optOut && s.setupOptOut?.[cfg.optOut.key]);
    })));
    // Premier prérequis manquant de chaque onglet ('' si tout est rempli) : la ligne dit QUOI manque.
    const premierManqueParOnglet = useFinanceStore(useShallow((s) => TABS_GATES.map(
        (t) => PAGE_SETUP[t]!.requirementIds.find((id) => !REQUIREMENTS[id].isMet(s)) ?? '',
    )));
    const tabs = TABS_GATES;
    const tabStatus = tabs.map((t, i) => {
        const cfg = PAGE_SETUP[t]!;
        const reqs = cfg.requirementIds.map((id) => REQUIREMENTS[id]);
        const met = metParOnglet[i];
        const optedOut = horsPerimetreParOnglet[i];
        const idManque = premierManqueParOnglet[i];
        const manque = idManque ? REQUIREMENTS[idManque].manque : '';
        return { tab: t, cfg, reqs, met, total: reqs.length, ready: met === reqs.length || optedOut, optedOut, manque };
    });
    const readyCount = tabStatus.filter((s) => s.ready).length;
    const allReady = tabs.length > 0 && readyCount === tabs.length;
    const totalMet = tabStatus.reduce((s, t) => s + t.met, 0);
    const totalReq = tabStatus.reduce((s, t) => s + t.total, 0);
    const pct = totalReq > 0 ? Math.round((totalMet / totalReq) * 100) : 100;
    return { tabs, tabStatus, readyCount, allReady, pct };
}

/**
 * `compact` (mobile, maquette M-reglages) : chaque ligne est UN bouton qui ouvre l'onglet (« › ») ;
 * l'onglet ouvert montre lui-même ce qui manque. Sans `compact` (bureau) : la ligne déplie les
 * prérequis sur place, « Ouvrir → » navigue.
 */
export const SetupHub: React.FC<{ className?: string; compact?: boolean }> = ({ className = '', compact = false }) => {
    const navigateWithFocus = useFinanceStore((s) => s.navigateWithFocus);
    const [open, setOpen] = useState<Tab | null>(null);
    const { tabs, tabStatus, readyCount, allReady, pct } = useCompletudeOnglets();

    // [S5-REFONTE-REGLAGES] Lignes des maquettes : pastille d'état, nom de l'onglet (libellé de la nav),
    // état en clair, « Ouvrir → ». Un clic sur la ligne déplie ce qu'il reste à renseigner.
    const list = (
        <div>
            {tabStatus.map(({ tab, cfg, reqs, met, total, ready, optedOut, manque }) => {
                    const isOpen = open === tab;
                    const etat = optedOut ? 'pas concerné' : ready ? 'prêt' : `${met}/${total}${manque ? ` · ${manque}` : ''}`;
                    const pastille = (
                        <span
                            className={`shrink-0 w-5 h-5 rounded-full border-2 ${ready ? 'bg-success-400 border-success-400' : 'border-warning-400'}`}
                            aria-hidden="true"
                        />
                    );
                    if (compact) {
                        return (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => navigateWithFocus(tab)}
                                className="w-full min-h-12 px-4 flex items-center gap-3 text-left border-t border-white/5 focus-ring"
                            >
                                {pastille}
                                <span className="text-body text-ink-100 truncate">{navItemOfTab(tab)?.label ?? cfg.title}</span>
                                <span className={`ml-auto shrink-0 text-meta ${ready ? 'text-success-400' : 'text-warning-400'}`}>{etat}</span>
                                <span className="shrink-0 text-ink-400" aria-hidden="true">›</span>
                            </button>
                        );
                    }
                    return (
                        <div key={tab} className="border-t border-white/5">
                            <div className="flex items-center gap-3 px-5 min-h-12">
                                <button
                                    type="button"
                                    onClick={() => setOpen(isOpen ? null : tab)}
                                    aria-expanded={isOpen}
                                    className="flex-1 min-w-0 min-h-12 flex items-center gap-3 text-left focus-ring rounded-sm"
                                >
                                    {pastille}
                                    <span className="text-body text-ink-100 truncate">{navItemOfTab(tab)?.label ?? cfg.title}</span>
                                    <span className={`ml-auto shrink-0 text-meta ${ready ? 'text-success-400' : 'text-warning-400'}`}>
                                        {etat}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigateWithFocus(tab)}
                                    className="shrink-0 min-h-[44px] text-meta text-primary underline underline-offset-2 focus-ring rounded-sm"
                                >
                                    Ouvrir →
                                </button>
                            </div>
                            {isOpen && (
                                <div className="px-5 pb-4 space-y-3">
                                    {reqs.map((req) => <RequirementCard key={req.id} req={req} currentTab={Tab.SETTINGS} />)}
                                    {cfg.optOut && (
                                        <p className="text-tiny text-ink-400 italic">
                                            Optionnel : « {cfg.optOut.label} » est proposé sur l'onglet (réversible).
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
        </div>
    );

    if (allReady) {
        return (
            <CollapsibleSection
                variant="quiet"
                defaultOpen={false}
                title="Configuration complète"
                subtitle="Tous les onglets sont prêts — déplie pour revoir ou ajuster."
                badge={
                    <span className="text-meta text-success-400 font-mono shrink-0 inline-flex items-center gap-1">
                        <Icon name="check" size={13} />{readyCount}/{tabs.length}
                    </span>
                }
                className={className}
            >
                {list}
            </CollapsibleSection>
        );
    }

    // Anneau de progression (maquettes) : 64 px, trait de 7 px.
    const R = 27, C = 2 * Math.PI * R;
    return (
        <div className={`rounded-2xl bg-surface border border-white/6 overflow-hidden ${className}`}>
            <div className="flex items-center gap-4 px-5 py-4">
                <div
                    className="relative w-16 h-16 shrink-0"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Profil complété à ${pct} %`}
                >
                    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
                        <circle cx="32" cy="32" r={R} fill="none" stroke="#15181E" strokeWidth="7" />
                        <circle cx="32" cy="32" r={R} fill="none" stroke="#34d399" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(C * pct) / 100} ${C}`} transform="rotate(-90 32 32)" />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-body font-bold text-ink-50" aria-hidden="true">{pct} %</span>
                </div>
                <div className="min-w-0">
                    {/* h2 : premier titre de section sous le h1 du PageHeader (évite le saut h1→h3, WCAG 1.3.1). */}
                    <h2 className="text-[18px] font-semibold text-ink-50">{readyCount} onglets sur {tabs.length} prêts</h2>
                    <p className="text-[13px] text-ink-400">Ce qu'il faut renseigner pour débloquer chaque page.</p>
                </div>
            </div>
            {list}
        </div>
    );
};
