import { Tab } from '../types';
import type { IconName } from './ui/Icon';

/**
 * [S5-REFONTE-R1] Source UNIQUE de la navigation — refonte validée par Marc (maquettes du
 * 2026-09-25, « fusion Nocturne × Cockpit ») : barre latérale TEXTE en trois groupes
 * (Vue / Planifier / Outils), carte Profil en pied de barre ; sur mobile, barre du bas
 * (Futur, Transactions, Assistant, Plus) et menu « Plus » pour le reste.
 *
 * - Immobilier réunit les biens détenus ET les projets d'achat : un seul item de nav, actif sur
 *   les deux onglets (`alsoActiveFor`) ; la page porte les deux sous-onglets.
 * - `Tab.DASHBOARD`, `Tab.TRAVEL`, `Tab.LIFE_EVENTS` restent hors nav (redirigés par App/TabRouter).
 * - Remplace les « 6 destinations » de [REFONTE-NAV Lot 1] (Futur, Configurations, Vie,
 *   Transactions, Assistant, Réglages).
 */
export interface NavItem {
    tab: Tab;
    /** Libellé COURT de la nav (maquettes) — le titre de page vit dans TAB_LABELS. */
    label: string;
    icon: IconName;
    /** Autres onglets pour lesquels cet item est « la page courante ». */
    alsoActiveFor?: Tab[];
}

export interface NavGroup {
    id: 'VUE' | 'PLANIFIER' | 'OUTILS';
    label: string;
    items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
    {
        id: 'VUE',
        label: 'Vue',
        items: [
            { tab: Tab.FUTURE, label: 'Futur', icon: 'future' },
            { tab: Tab.TRANSACTIONS, label: 'Transactions', icon: 'transactions' },
            { tab: Tab.BUDGET, label: 'Budget', icon: 'budget' },
            { tab: Tab.DEBT, label: 'Dettes', icon: 'debt' },
            { tab: Tab.INVESTMENTS, label: 'Placements', icon: 'investments' },
        ],
    },
    {
        id: 'PLANIFIER',
        label: 'Planifier',
        items: [
            { tab: Tab.RETIREMENT, label: 'Retraite', icon: 'retirement' },
            { tab: Tab.REAL_ESTATE, label: 'Immobilier', icon: 'real-estate', alsoActiveFor: [Tab.REAL_ESTATE_PROJECTS] },
            { tab: Tab.CHILD, label: 'Enfants', icon: 'child' },
            { tab: Tab.LIFE_PROJECTS, label: 'Projets de vie', icon: 'life-projects' },
        ],
    },
    {
        id: 'OUTILS',
        label: 'Outils',
        items: [
            { tab: Tab.TAX, label: 'Impôts', icon: 'tax' },
            { tab: Tab.ASSISTANT, label: 'Assistant', icon: 'bot' },
            { tab: Tab.SETTINGS, label: 'Réglages', icon: 'settings' },
        ],
    },
];

/** Le Profil s'ouvre depuis la carte en pied de barre (bureau) ou en tête du menu « Plus » (mobile). */
export const PROFILE_TAB = Tab.PROFILE;

/** Onglets épinglés dans la barre mobile (le reste passe par « Plus »). */
export const MOBILE_BAR_TABS: Tab[] = [Tab.FUTURE, Tab.TRANSACTIONS, Tab.ASSISTANT];

/** L'item de nav qui représente cet onglet (y compris les onglets rattachés, ex. projets immo). */
export const navItemOfTab = (tab: Tab): NavItem | undefined =>
    NAV_GROUPS.flatMap((g) => g.items).find((it) => it.tab === tab || it.alsoActiveFor?.includes(tab));

/** Tous les onglets atteignables depuis la nav (items, onglets rattachés, Profil). */
export const NAV_TABS_ATTEIGNABLES: Tab[] = [
    ...NAV_GROUPS.flatMap((g) => g.items.flatMap((it) => [it.tab, ...(it.alsoActiveFor ?? [])])),
    PROFILE_TAB,
];
