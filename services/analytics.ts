// services/analytics.ts
// Wrapper minimaliste autour de gtag (Google Analytics 4).
//
// [SEC-GA-DEFER-CONSENT] Le tag gtag.js n'est chargé qu'APRÈS consentement (services/consent.ts —
// avant, seul le stub dataLayer de public/ga-init.js existe et les événements s'y accumulent sans
// requête réseau). Ce module expose une API typée pour tracker les vues d'écran SPA (changements
// d'onglet) sans jamais envoyer de PII.
//
// No-op silencieux si gtag n'est pas disponible (env de test, blocker
// d'ads, CSP qui rejette googletagmanager, etc.) — l'app continue de
// fonctionner sans analytics.

declare global {
    interface Window {
        gtag?: (
            // 'consent' : Consent Mode v2 (S-B / Loi 25) — cf services/consent.ts.
            command: 'event' | 'config' | 'set' | 'js' | 'consent',
            targetOrEventName: string,
            params?: Record<string, unknown>,
        ) => void;
        dataLayer?: unknown[];
    }
}

/**
 * Envoie un page_view à GA4 pour un onglet de la SPA.
 *
 * GA4 ne track automatiquement que la page d'entrée — les navigations
 * SPA (changements de `Tab` enum) doivent être déclarées explicitement
 * pour apparaître dans les rapports "Pages and screens".
 *
 * @param tab Nom de l'onglet actif (valeur du `Tab` enum).
 */
export function trackPageView(tab: string): void {
    if (typeof window === 'undefined') return;
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', 'page_view', {
        page_title: tab,
        page_path: `/${tab.toLowerCase()}`,
    });
}
