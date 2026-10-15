// Phase 7.B.3 — Command palette Cmd+K (impl maison, sans dépendance externe).
//
// Pattern : hotkey global déclenche un modal overlay avec input search +
// liste filtrée d'actions. Navigation flèches + Enter pour exécuter.
// Esc/click outside pour fermer.

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { CommandAction } from './commandPaletteActions';

// Rétro-compatibilité des imports (tests, appelants) : le noyau vit dans commandPaletteActions.
export { useCommandPalette, makeNavigationActions, ouvrirPaletteCommandes, type CommandAction } from './commandPaletteActions';

interface CommandPaletteProps {
    open: boolean;
    onClose: () => void;
    actions: CommandAction[];
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
            className="fixed inset-0 z-200 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-xs"
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
                        className="w-full bg-transparent text-ink-100 placeholder-ink-400 outline-hidden text-body"
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
