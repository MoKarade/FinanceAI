import React, { useState } from 'react';
import { Tab } from '../../types';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useShallow } from 'zustand/shallow';
import { Icon } from '../ui/Icon';
import { CollapsibleSection } from '../ui/CollapsibleSection';
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

export const SetupHub: React.FC<{ className?: string }> = ({ className = '' }) => {
    // [PERF-RENDER-SETUPHUB-FULLSTORE] Avant : `useFinanceStore((s) => s)` — abonnement au store
    // ENTIER, donc un rendu à CHAQUE écriture (mesuré : 2 écritures sans rapport = 2 rendus).
    //
    // ⚠️ Le remède « restreindre aux champs réellement lus » est INAPPLICABLE ici : les champs lus
    // sont décidés par `REQUIREMENTS[*].isMet`, hors de ce composant. Les recopier ferait qu'une
    // exigence future lisant un champ non listé cesserait SILENCIEUSEMENT de rafraîchir l'écran —
    // une donnée périmée, bien pire que le rendu en trop qu'on corrige.
    //
    // Le patron juste vit chez le voisin qui consomme le même genre de registre
    // (`MissingDataChecklist`, `[PERF-MISSINGDATA]`) : `useShallow` sur le RÉSULTAT DÉRIVÉ. Le
    // sélecteur tourne toujours à chaque écriture, mais le composant ne se re-rend que si la
    // dérivée change.
    //
    // ⚠️ Et la dérivée doit être PLATE : `useShallow` compare élément par élément, donc un tableau
    // d'objets recréés à chaque passage n'est JAMAIS shallow-égal et rendrait le sélecteur
    // vacueux. D'où deux tableaux de primitives plutôt qu'un tableau de statuts.
    const metParOnglet = useFinanceStore(useShallow((s) => TABS_GATES.map(
        (t) => PAGE_SETUP[t]!.requirementIds.filter((id) => REQUIREMENTS[id].isMet(s)).length,
    )));
    const horsPerimetreParOnglet = useFinanceStore(useShallow((s) => TABS_GATES.map((t) => {
        const cfg = PAGE_SETUP[t]!;
        return !!(cfg.optOut && s.setupOptOut?.[cfg.optOut.key]);
    })));
    const navigateWithFocus = useFinanceStore((s) => s.navigateWithFocus);
    const [open, setOpen] = useState<Tab | null>(null);

    const tabs = TABS_GATES;
    const tabStatus = tabs.map((t, i) => {
        const cfg = PAGE_SETUP[t]!;
        const reqs = cfg.requirementIds.map((id) => REQUIREMENTS[id]);
        const met = metParOnglet[i];
        const optedOut = horsPerimetreParOnglet[i];
        return { tab: t, cfg, reqs, met, total: reqs.length, ready: met === reqs.length || optedOut, optedOut };
    });
    const readyCount = tabStatus.filter((s) => s.ready).length;
    const allReady = tabs.length > 0 && readyCount === tabs.length;
    // PH3-b — % de complétion GLOBAL (au niveau des INFOS, pas seulement des onglets prêts).
    const totalMet = tabStatus.reduce((s, t) => s + t.met, 0);
    const totalReq = tabStatus.reduce((s, t) => s + t.total, 0);
    const pct = totalReq > 0 ? Math.round((totalMet / totalReq) * 100) : 100;

    const list = (
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
                                    {optedOut && <span className="text-tiny text-ink-400 shrink-0">(pas concerné)</span>}
                                    <span className={`ml-auto shrink-0 text-ink-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigateWithFocus(tab)}
                                    className="shrink-0 min-h-[44px] px-2.5 py-1 rounded-card border border-white/10 bg-white/5 text-tiny font-medium text-ink-300 hover:text-ink-50 hover:bg-white/10 transition-colors focus-ring"
                                >
                                    Ouvrir →
                                </button>
                            </div>
                            {isOpen && (
                                <div className="p-3 pt-1 space-y-3 border-t border-white/5">
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

    // [EP-6] Config 100 % complète → le hub devient du bruit : ruban discret repliable
    // (déplie pour revoir/ajuster). Sinon, hub complet (aide à l'onboarding).
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

    return (
        <div className={`rounded-card border border-white/10 bg-white/5 p-4 ${className}`}>
            <div className="flex items-center justify-between gap-3 mb-3">
                <div className="min-w-0">
                    {/* h2 : premier titre de section sous le h1 du PageHeader (évite le saut h1→h3, WCAG 1.3.1). */}
                    <h2 className="font-bold text-ink-50">Complétude par onglet</h2>
                    <p className="text-meta text-ink-400">
                        Ce qu'il faut renseigner pour débloquer chaque page. Clique un onglet pour compléter ici,
                        ou « Ouvrir » pour y aller.
                    </p>
                </div>
                <div className="shrink-0 text-right">
                    <div className="text-body font-black text-ink-50 font-mono">{pct}%</div>
                    <div className="text-tiny text-ink-400 font-mono">{readyCount}/{tabs.length} onglets prêts</div>
                </div>
            </div>
            <div
                className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-3"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Profil complété à ${pct} %`}
            >
                <div className="h-full bg-primary rounded-full transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            {list}
        </div>
    );
};
