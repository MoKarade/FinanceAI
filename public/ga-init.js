// Google Analytics 4 init — Measurement ID G-5WLQGBF1VL
//
// Externalisé depuis index.html pour respecter la CSP stricte
// (script-src 'self' sans unsafe-inline dans la CSP (index.html / vercel.json)).
//
// [SEC-GA-DEFER-CONSENT] (Loi 25 QC) — le SCRIPT gtag.js n'est chargé qu'APRÈS un
// consentement accordé : ce fichier pose le stub dataLayer/gtag + Consent Mode v2
// (refus par défaut), puis n'injecte googletagmanager.com QUE si un consentement
// 'granted' a été persisté lors d'une session précédente. Le premier accord de la
// session courante injecte le tag depuis services/consent.ts (ensureGtagLoaded).
// Les appels gtag() émis avant chargement s'accumulent dans dataLayer et sont
// rejoués par le tag à son arrivée (comportement standard gtag).
// IMPORTANT : la clé ET l'URL doivent rester synchronisées avec services/consent.ts.
var ANALYTICS_CONSENT_KEY = 'financeai:analyticsConsent:v1';
var GTAG_SRC = 'https://www.googletagmanager.com/gtag/js?id=G-5WLQGBF1VL';

window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }

// Refus par défaut AVANT toute config (exigé par Consent Mode pour être effectif).
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
});

// Si l'utilisateur avait déjà accepté : rétablir la mesure ET charger le tag.
try {
  if (window.localStorage && localStorage.getItem(ANALYTICS_CONSENT_KEY) === 'granted') {
    gtag('consent', 'update', { analytics_storage: 'granted' });
    var s = document.createElement('script');
    s.async = true;
    s.src = GTAG_SRC;
    document.head.appendChild(s);
  }
} catch (e) {
  // localStorage indisponible → on reste en refus (état le plus protecteur), tag non chargé.
}

gtag('js', new Date());
gtag('config', 'G-5WLQGBF1VL');
