// Phase 7.B.3 — Command palette Cmd+K (impl maison, sans dépendance externe).
//
// Pattern : hotkey global déclenche un modal overlay avec input search +
// liste filtrée d'actions. Navigation flèches + Enter pour exécuter.
// Esc/click outside pour fermer.

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Tab } from '../../types';

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
    const navMap: Array<{ tab: Tab; label: string; icon: string; keywords?: string[] }> = [
        { tab: Tab.DASHBOARD, label: "Vue d'ensemble", icon: '📊', keywords: ['dashboard', 'home', 'accueil'] },
        { tab: Tab.TRANSACTIONS, label: 'Transactions', icon: '💳', keywords: ['transac', 'depense', 'achats'] },
        { tab: Tab.BUDGET, label: 'Budget', icon: '🧾', keywords: ['budget', 'depenses'] },
        { tab: Tab.PLANNING, label: 'Planification', icon: '🧭', keywords: ['plan', 'objectifs', 'goals'] },
        { tab: Tab.DEBT, label: 'Dettes', icon: '💳', keywords: ['debt', 'pret', 'credit'] },
        { tab: Tab.INVESTMENTS, label: 'Investissements', icon: '📈', keywords: ['invest', 'bourse', 'actions'] },
        { tab: Tab.FUTURE, label: 'Projection Future', icon: '🔮', keywords: ['future', 'projection', 'simulation', 'mc'] },
        { tab: Tab.REAL_ESTATE, label: 'Immobilier', icon: '🏠', keywords: ['immo', 'maison', 'hypotheque'] },
        { tab: Tab.CHILD, label: 'Enfants', icon: '👶', keywords: ['enfant', 'reee', 'famille'] },
        // Phase F.12 — Tab.TRAVEL et Tab.LIFE_EVENTS fusionnés en LIFE_PROJECTS
        { tab: Tab.LIFE_PROJECTS, label: 'Projets de vie', icon: '🛤️', keywords: ['voyage', 'travel', 'mariage', 'event', 'parcours', 'projet'] },
        { tab: Tab.RETIREMENT, label: 'Retraite', icon: '🏖️', keywords: ['retraite', 'pension', 'rrq'] },
        { tab: Tab.TAX, label: 'Centre fiscal', icon: '🧮', keywords: ['tax', 'impot', 'declaration'] },
        { tab: Tab.ASSISTANT, label: 'Assistant AI', icon: '🤖', keywords: ['ai', 'claude', 'chat', 'assistant'] },
        { tab: Tab.SETTINGS, label: 'Paramètres', icon: '⚙️', keywords: ['settings', 'config', 'reglages'] },
        { tab: Tab.SYSTEM, label: 'Système', icon: '🔧', keywords: ['system', 'admin'] },
        { tab: Tab.DATA, label: 'Données JSON', icon: '🗄️', keywords: ['data', 'json', 'debug'] },
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
                <div className="px-4 py-3 border-b border-white/10">
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
