// hooks/useTabNavigation.ts
//
// [GODFILE-APP] Effets de NAVIGATION par onglet, extraits tels quels d'App.tsx : deep-links par
// hash (avec les redirections héritées #ACTIONS/#DASHBOARD), titre de page, raccourcis Alt+1..9,
// page_view GA4 et <html lang>. Comportement inchangé — mêmes effets, mêmes dépendances.

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tab } from '../types';
import { trackPageView } from '../services/analytics';

export function useTabNavigation(activeTab: Tab, setActiveTab: (tab: Tab) => void): void {
    // GA4 — page_view explicite à chaque changement d'onglet. GA4 ne
    // track automatiquement que la page d'entrée ; sans cet effect, les
    // navigations SPA n'apparaissent pas dans "Pages and screens".
    useEffect(() => {
        trackPageView(activeTab);
    }, [activeTab]);

    useEffect(() => {
        const applyHash = () => {
            const hash = window.location.hash.replace('#', '');
            // [ASSISTANT-HUB] L'onglet ACTIONS a fusionné dans ASSISTANT : un deep-link/bookmark
            // #ACTIONS redirige explicitement (jamais un 404 silencieux) et l'URL est réécrite.
            if (hash === 'ACTIONS') {
                setActiveTab(Tab.ASSISTANT);
                window.history.replaceState(null, '', '#ASSISTANT');
                return;
            }
            // [REFONTE-NAV Lot 1] L'Accueil est retiré : un deep-link/bookmark #DASHBOARD
            // redirige vers la courbe Future (jamais un écran vide), URL réécrite. DOIT rester
            // AVANT le check générique : DASHBOARD est encore dans l'enum, le check générique
            // l'accepterait vers un onglet sans route.
            if (hash === 'DASHBOARD') {
                setActiveTab(Tab.FUTURE);
                window.history.replaceState(null, '', '#FUTURE');
                return;
            }
            if (Object.values(Tab).includes(hash as Tab) && hash !== activeTab) {
                setActiveTab(hash as Tab);
            }
        };
        // BUG FIX 2026-05-21 (audit checklist) : `hashchange` ne se déclenche
        // PAS au boot. Sans cet appel direct, ouvrir https://www.hubperso.com/#FUTURE
        // affichait toujours le Dashboard (le tab `title` changeait mais pas
        // le contenu). Appel immédiat au mount + listener pour les changements
        // ultérieurs.
        applyHash();
        window.addEventListener('hashchange', applyHash);
        return () => window.removeEventListener('hashchange', applyHash);
    }, [activeTab, setActiveTab]);

    useEffect(() => {
        // Le titre est mis à jour avec le tab actif. Les labels détaillés
        // sont dans TabRouter — ici on se contente d'un fallback générique.
        document.title = `FinanceAI - ${activeTab || 'Pro'}`;
    }, [activeTab]);

    // Q3 — Keyboard shortcuts Alt+1..9 pour switcher d'onglet rapidement
    useEffect(() => {
        const SHORTCUTS: Array<Tab> = [
            // [REFONTE-NAV Lot 1] Ordre = destinations (Futur d'abord, Accueil retiré).
            Tab.FUTURE, Tab.TRANSACTIONS, Tab.BUDGET, Tab.ASSISTANT,
            Tab.PROFILE, Tab.INVESTMENTS, Tab.RETIREMENT, Tab.TAX, Tab.SETTINGS,
        ];
        const onKeyDown = (e: KeyboardEvent) => {
            // Ignore si l'utilisateur tape dans un input/textarea/contenteditable
            const target = e.target as HTMLElement | null;
            if (target && (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'SELECT' ||
                target.isContentEditable
            )) return;
            // Alt+1..9 pour naviguer (Cmd/Ctrl+1 est réservé navigateur)
            if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            const num = parseInt(e.key, 10);
            if (Number.isNaN(num) || num < 1 || num > SHORTCUTS.length) return;
            e.preventDefault();
            setActiveTab(SHORTCUTS[num - 1]);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [setActiveTab]);

    // §7.D.3 — <html lang> dynamique synchronisé avec i18next.
    const { i18n: i18nInstance } = useTranslation();
    useEffect(() => {
        const lang = (i18nInstance.language || 'fr').split('-')[0];
        if (document.documentElement.lang !== lang) {
            document.documentElement.lang = lang;
        }
    }, [i18nInstance.language]);
}
