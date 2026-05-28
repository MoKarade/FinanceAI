// Google Analytics 4 init — Measurement ID G-5WLQGBF1VL
//
// Externalisé depuis index.html pour respecter la CSP stricte
// (script-src 'self' sans unsafe-inline dans netlify.toml).
//
// Le tag gtag.js (googletagmanager.com) est chargé async depuis index.html ;
// ce fichier configure dataLayer + gtag puis envoie la première page view.
//
// S-B (Loi 25 QC) — Google Consent Mode v2. On REFUSE par défaut le stockage
// (analytics_storage + signaux pub) : tant que l'utilisateur n'a pas accepté via
// la bannière, GA ne dépose aucun cookie ni identifiant. Le choix est géré côté
// app (services/consent.ts) qui écrit la clé localStorage ci-dessous ; on la
// relit ici pour rétablir un consentement accordé lors d'une session précédente.
// IMPORTANT : la clé doit rester synchronisée avec services/consent.ts.
var ANALYTICS_CONSENT_KEY = 'financeai:analyticsConsent:v1';

window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }

// Refus par défaut AVANT toute config (exigé par Consent Mode pour être effectif).
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
});

// Si l'utilisateur avait déjà accepté, on rétablit immédiatement la mesure.
try {
  if (window.localStorage && localStorage.getItem(ANALYTICS_CONSENT_KEY) === 'granted') {
    gtag('consent', 'update', { analytics_storage: 'granted' });
  }
} catch (e) {
  // localStorage indisponible → on reste en refus (état le plus protecteur).
}

gtag('js', new Date());
gtag('config', 'G-5WLQGBF1VL');
