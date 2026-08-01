// services/consent.ts
//
// S-B — Consentement à la mesure d'audience (Google Analytics) — Loi 25 (QC).
//
// Modèle : Google Consent Mode v2. gtag se charge au boot (index.html) mais avec
// `analytics_storage='denied'` PAR DÉFAUT (cf public/ga-init.js). Tant que
// l'utilisateur n'a pas accepté, GA ne stocke aucun identifiant/cookie.
// Ce module gère le choix de l'utilisateur (persistance + bascule gtag).
//
// Contrat avec ga-init.js (fichier statique non-bundlé, vanilla JS) : la clé
// localStorage ci-dessous. ga-init lit `'granted'` au boot pour rétablir le
// consentement d'une session précédente ; ce module l'écrit au clic de l'UI.
// La valeur DOIT rester synchronisée avec public/ga-init.js.

export const CONSENT_STORAGE_KEY = 'financeai:analyticsConsent:v1';

export type ConsentChoice = 'granted' | 'denied';

/** Lit le choix persisté. `null` = pas encore décidé → afficher la bannière. */
export function getStoredConsent(): ConsentChoice | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        const v = localStorage.getItem(CONSENT_STORAGE_KEY);
        return v === 'granted' || v === 'denied' ? v : null;
    } catch {
        return null;
    }
}

/**
 * Propage le choix à gtag (Consent Mode v2). On ne touche QUE `analytics_storage` :
 * les signaux pub (ad_storage…) restent refusés à vie (l'app ne fait pas de pub).
 * No-op silencieux si gtag est absent (bloqueur, CSP, env de test).
 */
export function applyGtagConsent(choice: ConsentChoice): void {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
    window.gtag('consent', 'update', { analytics_storage: choice });
}

/** URL du tag GA4 — DOIT rester synchronisée avec public/ga-init.js. */
export const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js?id=G-5WLQGBF1VL';

/**
 * [SEC-GA-DEFER-CONSENT] (Loi 25) Injecte le SCRIPT gtag.js s'il ne l'est pas déjà.
 * Avant consentement, aucune requête ne part vers Google (le script n'est plus dans
 * index.html) ; au premier « Accepter », on charge le tag ici — les événements
 * accumulés dans dataLayer par le stub (ga-init.js) sont alors rejoués par gtag.
 */
export function ensureGtagLoaded(): void {
    if (typeof document === 'undefined') return;
    if (document.querySelector('script[src^="https://www.googletagmanager.com/gtag/js"]')) return;
    const s = document.createElement('script');
    s.async = true;
    s.src = GTAG_SRC;
    document.head.appendChild(s);
}

/** Persiste le choix, charge le tag si accordé, ET propage immédiatement à gtag. */
export function setConsent(choice: ConsentChoice): void {
    try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(CONSENT_STORAGE_KEY, choice);
    } catch {
        // localStorage indisponible : on applique quand même à gtag pour la session.
    }
    if (choice === 'granted') ensureGtagLoaded();
    applyGtagConsent(choice);
}
