import React from 'react';
import './i18n';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { LoginGate } from './components/auth/LoginGate';

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