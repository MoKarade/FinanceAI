import { Tab } from '../types';
import type { IconName } from './ui/Icon';

/**
 * [REFONTE-NAV Lot 1] Source UNIQUE de la navigation — 6 destinations (GO Marc 2026-08-12) :
 * tout tourne autour de la courbe Future. Sidebar desktop, barre mobile et drawer « Plus »
 * dérivent tous de cette table (aucune copie locale de la structure).
 *
 * - Le PREMIER tab d'une destination est sa page d'atterrissage.
 * - Une destination à tab unique se rend comme bouton direct (pas d'accordéon).
 * - `Tab.DASHBOARD` n'apparaît PLUS : l'Accueil est retiré (deep-link #DASHBOARD → #FUTURE,
 *   App.tsx). `Tab.TRAVEL`/`Tab.LIFE_EVENTS` restent des alias legacy de LIFE_PROJECTS
 *   (redirigés par TabRouter), donc absents ici aussi.
 */
export interface NavDestination {
    id: 'FUTUR' | 'CONFIG' | 'VIE' | 'TRANSACTIONS' | 'ASSISTANT' | 'REGLAGES';
    label: string;
    icon: IconName;
    tabs: Tab[];
}

export const NAV_DESTINATIONS: NavDestination[] = [
    // La courbe Future = cœur de l'app (page d'ouverture).
    { id: 'FUTUR', label: 'Futur', icon: 'future', tabs: [Tab.FUTURE] },
    {
        id: 'CONFIG',
        label: 'Configurations',
        icon: 'group-money',
        // « Ce que j'AI » : les entrées du moteur. L'immobilier ACTUEL vit ici — les PROJETS
        // immo futurs vivent dans Vie (Tab.REAL_ESTATE_PROJECTS, split [REFONTE-NAV-L3]).
        tabs: [Tab.PROFILE, Tab.INVESTMENTS, Tab.REAL_ESTATE, Tab.DEBT, Tab.TAX],
    },
    {
        id: 'VIE',
        label: 'Vie',
        icon: 'group-goals',
        // « Ce que je PRÉVOIS » : les plans qui déforment la courbe.
        tabs: [Tab.RETIREMENT, Tab.CHILD, Tab.LIFE_PROJECTS, Tab.REAL_ESTATE_PROJECTS],
    },
    { id: 'TRANSACTIONS', label: 'Transactions', icon: 'transactions', tabs: [Tab.TRANSACTIONS, Tab.BUDGET] },
    { id: 'ASSISTANT', label: 'Assistant', icon: 'bot', tabs: [Tab.ASSISTANT] },
    { id: 'REGLAGES', label: 'Réglages', icon: 'settings', tabs: [Tab.SETTINGS] },
];

/** Onglets épinglés dans la barre mobile (le reste passe par « Plus »). */
export const MOBILE_BAR_TABS: Tab[] = [Tab.FUTURE, Tab.TRANSACTIONS, Tab.ASSISTANT];

export const destinationOfTab = (tab: Tab): NavDestination | undefined =>
    NAV_DESTINATIONS.find((d) => d.tabs.includes(tab));
