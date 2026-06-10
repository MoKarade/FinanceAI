import React from 'react';
import './i18n';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { LoginGate } from './components/auth/LoginGate';
import { installPreloadErrorReload } from './utils/lazyWithRetry';

// PH1-a — filet anti « Failed to fetch dynamically imported module » : un chunk périmé
// (deploy pendant la session) ou bloqué (redirect d'auth) déclenche UN reload au lieu
// de casser l'onglet. Installé avant le render pour couvrir le tout premier preload.
installPreloadErrorReload();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
// R2 — LoginGate enveloppe l'app : INERTE tant que VITE_GOOGLE_GATE n'est pas activé (rend App
// directement). Une fois activé, il exige un login Google (+ trappe anti-lockout) — cf authGate.ts.
root.render(
  <React.StrictMode>
    <LoginGate>
      <App />
    </LoginGate>
  </React.StrictMode>
);