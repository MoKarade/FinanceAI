// components/ui/commandPaletteActions.tsx
//
// [S5-REFONTE-PERF] Ce qui doit exister DÈS le démarrage pour la palette Ctrl/Cmd + K : le raccourci
// global (`useCommandPalette`), l'ouverture depuis un bouton (`ouvrirPaletteCommandes`) et la liste
// des actions de navigation. Le composant de la palette (`CommandPalette.tsx`) est chargé à la
// demande, à la première ouverture — il n'a rien à faire dans le chemin critique.
import React, { useState, useEffect } from 'react';
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
        // [S5-REFONTE-FUTUR] Le champ « Rechercher… » de l'en-tête Futur (maquette F-bureau) ouvre la
        // MÊME palette : un évènement DOM plutôt qu'un contexte, la palette vit dans App et l'écran
        // Futur est chargé à part (lazy) — aucun fil à tirer entre les deux.
        const ouvrir = () => setIsOpen(true);
        window.addEventListener('keydown', handler);
        window.addEventListener(EVT_OUVRIR_PALETTE, ouvrir);
        return () => {
            window.removeEventListener('keydown', handler);
            window.removeEventListener(EVT_OUVRIR_PALETTE, ouvrir);
        };
    }, []);
    return { isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) };
}

const EVT_OUVRIR_PALETTE = 'financeai:ouvrir-palette';

/** Ouvre la palette de commandes (Ctrl/Cmd + K) depuis n'importe quel écran. */
export function ouvrirPaletteCommandes(): void {
    window.dispatchEvent(new Event(EVT_OUVRIR_PALETTE));
}

/** Helper : génère les actions de navigation pour tous les Tabs. */
export function makeNavigationActions(setActiveTab: (t: Tab) => void): CommandAction[] {
    const sz = 16;
    const navMap: Array<{ tab: Tab; label: string; icon: React.ReactNode; keywords?: string[] }> = [
        // [REFONTE-NAV Lot 1] Accueil retiré — ses mots-clés mènent au Futur (la page d'ouverture).
        { tab: Tab.TRANSACTIONS, label: 'Transactions', icon: <Icon name="transactions" size={sz} />, keywords: ['transac', 'depense', 'achats'] },
        { tab: Tab.BUDGET, label: 'Budget', icon: <Icon name="budget" size={sz} />, keywords: ['budget', 'depenses', 'abonnements', 'charges fixes', 'objectifs', 'planification'] },
        { tab: Tab.DEBT, label: 'Dettes', icon: <Icon name="debt" size={sz} />, keywords: ['debt', 'pret', 'credit'] },
        { tab: Tab.INVESTMENTS, label: 'Placements', icon: <Icon name="investments" size={sz} />, keywords: ['invest', 'investissements', 'bourse', 'actions'] },
        { tab: Tab.FUTURE, label: 'Futur', icon: <Icon name="future" size={sz} />, keywords: ['future', 'projection', 'simulation', 'mc', 'dashboard', 'home', 'accueil'] },
        { tab: Tab.REAL_ESTATE, label: 'Immobilier', icon: <Icon name="real-estate" size={sz} />, keywords: ['immo', 'maison', 'hypotheque'] },
        // [REFONTE-NAV-L3] Projets d'achat futurs (Vie) — l'actuel reste sous « Immobilier ».
        { tab: Tab.REAL_ESTATE_PROJECTS, label: 'Projets immo', icon: <Icon name="building" size={sz} />, keywords: ['projet immo', 'achat', 'futur', 'maison', 'hypotheque'] },
        { tab: Tab.CHILD, label: 'Enfants', icon: <Icon name="child" size={sz} />, keywords: ['enfant', 'reee', 'famille'] },
        // Phase F.12 — Tab.TRAVEL et Tab.LIFE_EVENTS fusionnés en LIFE_PROJECTS
        { tab: Tab.LIFE_PROJECTS, label: 'Projets de vie', icon: <Icon name="life-projects" size={sz} />, keywords: ['voyage', 'travel', 'mariage', 'event', 'parcours', 'projet'] },
        { tab: Tab.RETIREMENT, label: 'Retraite', icon: <Icon name="retirement" size={sz} />, keywords: ['retraite', 'pension', 'rrq'] },
        { tab: Tab.TAX, label: 'Impôts', icon: <Icon name="tax" size={sz} />, keywords: ['tax', 'impot', 'declaration', 'centre fiscal'] },
        { tab: Tab.ASSISTANT, label: 'Assistant', icon: <Icon name="bot" size={sz} />, keywords: ['ai', 'claude', 'chat', 'assistant', 'action', 'reco', 'recommandation', 'conseil', 'prochaine'] },
        // G22-N5 — Système fusionné dans Configuration ; keywords 'system'/'diagnostic'
        // gardés ici pour que la recherche y mène toujours.
        { tab: Tab.SETTINGS, label: 'Réglages', icon: <Icon name="settings" size={sz} />, keywords: ['settings', 'config', 'parametres', 'system', 'systeme', 'admin', 'diagnostic', 'version'] },
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

