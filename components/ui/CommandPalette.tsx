// Phase 7.B.3 — Command palette Cmd+K (impl maison, sans dépendance externe).
//
// Pattern : hotkey global déclenche un modal overlay avec input search +
// liste filtrée d'actions. Navigation flèches + Enter pour exécuter.
// Esc/click outside pour fermer.

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Tab } from '../../types';
import { Icon } from './Icon';

export interface CommandAction {
    /** Id stable (utile pour key React). */
    id: string;
    /** Label affiché à l'utilisateur. */
    label: string;
    /** Catégorie pour grouper visuellement (ex: "Navigation", "Action"). */
    group: string;
    /** Icône (emoji ou node). */
    icon?: React.ReactNode;
    /** Mots-clés additionnels pour le filtrage (alias). */
    keywords?: string[];
    /** Handler exécuté au Enter ou click. */
    onSelect: () => void;
}

interface CommandPaletteProps {
    open: boolean;
    onClose: () => void;
    actions: CommandAction[];
}

/**
 * Hook global qui écoute Cmd+K / Ctrl+K et toggle un state interne.
 * Retourne { isOpen, close } à brancher dans <CommandPalette>.
 */
export function useCommandPalette() {
    const [isOpen, setIsOpen] = useState(false);
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
            if (e.key === 'Escape') setIsOpen(false);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);
    return { isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) };
}

/** Helper : génère les actions de navigation pour tous les Tabs. */
export function makeNavigationActions(setActiveTab: (t: Tab) => void): CommandAction[] {
    const sz = 16;
    const navMap: Array<{ tab: Tab; label: string; icon: React.ReactNode; keywords?: string[] }> = [
        // [REFONTE-NAV Lot 1] Accueil retiré — ses mots-clés mènent au Futur (la page d'ouverture).
        { tab: Tab.TRANSACTIONS, label: 'Transactions', icon: <Icon name="transactions" size={sz} />, keywords: ['transac', 'depense', 'achats'] },
        { tab: Tab.BUDGET, label: 'Budget', icon: <Icon name="budget" size={sz} />, keywords: ['budget', 'depenses', 'abonnements', 'charges fixes', 'objectifs', 'planification'] },
        { tab: Tab.DEBT, label: 'Dettes', icon: <Icon name="debt" size={sz} />, keywords: ['debt', 'pret', 'credit'] },
        { tab: Tab.INVESTMENTS, label: 'Investissements', icon: <Icon name="investments" size={sz} />, keywords: ['invest', 'bourse', 'actions'] },
        { tab: Tab.FUTURE, label: 'Projection Future', icon: <Icon name="future" size={sz} />, keywords: ['future', 'projection', 'simulation', 'mc', 'dashboard', 'home', 'accueil'] },
        { tab: Tab.REAL_ESTATE, label: 'Immobilier', icon: <Icon name="real-estate" size={sz} />, keywords: ['immo', 'maison', 'hypotheque'] },
        // [REFONTE-NAV-L3] Projets d'achat futurs (Vie) — l'actuel reste sous « Immobilier ».
        { tab: Tab.REAL_ESTATE_PROJECTS, label: 'Projets immo', icon: <Icon name="building" size={sz} />, keywords: ['projet immo', 'achat', 'futur', 'maison', 'hypotheque'] },
        { tab: Tab.CHILD, label: 'Enfants', icon: <Icon name="child" size={sz} />, keywords: ['enfant', 'reee', 'famille'] },
        // Phase F.12 — Tab.TRAVEL et Tab.LIFE_EVENTS fusionnés en LIFE_PROJECTS
        { tab: Tab.LIFE_PROJECTS, label: 'Projets de vie', icon: <Icon name="life-projects" size={sz} />, keywords: ['voyage', 'travel', 'mariage', 'event', 'parcours', 'projet'] },
        { tab: Tab.RETIREMENT, label: 'Retraite', icon: <Icon name="retirement" size={sz} />, keywords: ['retraite', 'pension', 'rrq'] },
        { tab: Tab.TAX, label: 'Centre fiscal', icon: <Icon name="tax" size={sz} />, keywords: ['tax', 'impot', 'declaration'] },
        { tab: Tab.ASSISTANT, label: 'Assistant', icon: <Icon name="bot" size={sz} />, keywords: ['ai', 'claude', 'chat', 'assistant', 'action', 'reco', 'recommandation', 'conseil', 'prochaine'] },
        // G22-N5 — Système fusionné dans Configuration ; keywords 'system'/'diagnostic'
        // gardés ici pour que la recherche y mène toujours.
        { tab: Tab.SETTINGS, label: 'Paramètres', icon: <Icon name="settings" size={sz} />, keywords: ['settings', 'config', 'reglages', 'system', 'systeme', 'admin', 'diagnostic', 'version'] },
        { tab: Tab.PROFILE, label: 'Profil', icon: <Icon name="settings" size={sz} />, keywords: ['profil', 'profile', 'utilisateur', 'user', 'identite', 'salaire', 'retraite', 'sante', 'carriere'] },
    ];
    return navMap.map(({ tab, label, icon, keywords }) => ({
        id: `nav:${tab}`,
        label: `Aller à : ${label}`,
        group: 'Navigation',
        icon,
        keywords,
        onSelect: () => setActiveTab(tab),
    }));
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, actions }) => {
    const [query, setQuery] = useState('');
    const [activeIdx, setActiveIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) {
            setQuery('');
            setActiveIdx(0);
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [open]);

    const filtered = useMemo(() => {
        const q = query.toLowerCase().trim();
        if (!q) return actions;
        return actions.filter(a => {
            const hay = [a.label, a.group, ...(a.keywords ?? [])].join(' ').toLowerCase();
            return hay.includes(q);
        });
    }, [actions, query]);

    useEffect(() => {
        setActiveIdx(0);
    }, [filtered.length]);

    const select = useCallback((a: CommandAction) => {
        a.onSelect();
        onClose();
    }, [onClose]);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIdx(i => Math.min(filtered.length - 1, i + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIdx(i => Math.max(0, i - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const a = filtered[activeIdx];
            if (a) select(a);
        }
    };

    if (!open) return null;

    // Group items by group label
    const grouped = filtered.reduce<Record<string, CommandAction[]>>((acc, a) => {
        (acc[a.group] = acc[a.group] || []).push(a);
        return acc;
    }, {});

    let runningIdx = 0;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Palette de commandes"
            className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="w-full max-w-xl mx-4 bg-surface border border-white/10 rounded-card shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-4 py-3 border-b border-white/10 focus-within:border-primary/50 transition-colors">
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="Tape pour rechercher…"
                        aria-label="Rechercher une commande"
                        className="w-full bg-transparent text-ink-100 placeholder-ink-400 outline-none text-body"
                    />
                </div>
                <div ref={listRef} className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {filtered.length === 0 && (
                        <div className="px-4 py-8 text-center text-ink-400 text-meta">
                            Aucun résultat.
                        </div>
                    )}
                    {Object.entries(grouped).map(([group, items]) => (
                        <div key={group}>
                            <div className="px-4 pt-3 pb-1 text-tiny uppercase tracking-widest text-ink-400 font-bold">
                                {group}
                            </div>
                            {items.map(a => {
                                const myIdx = runningIdx++;
                                const isActive = myIdx === activeIdx;
                                return (
                                    <button
                                        key={a.id}
                                        type="button"
                                        onMouseEnter={() => setActiveIdx(myIdx)}
                                        onClick={() => select(a)}
                                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                            isActive ? 'bg-primary/15 text-ink-50' : 'text-ink-200 hover:bg-white/5'
                                        }`}
                                    >
                                        {a.icon && <span aria-hidden="true" className="text-base">{a.icon}</span>}
                                        <span className="text-meta">{a.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
                <div className="px-4 py-2 border-t border-white/10 bg-black/30 text-tiny text-ink-400 flex items-center justify-between">
                    <span>↑↓ naviguer · Enter exécuter · Esc fermer</span>
                    <span className="hidden sm:inline">Cmd/Ctrl + K</span>
                </div>
            </div>
        </div>
    );
};
