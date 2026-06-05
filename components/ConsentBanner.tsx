// components/ConsentBanner.tsx
//
// S-B (Loi 25 QC) — Bannière de consentement à la mesure d'audience.
// Bandeau discret en bas, NON bloquant. Affiché tant qu'aucun choix n'est
// enregistré. « Accepter »/« Refuser » persistent le choix et le propagent à
// gtag via Consent Mode v2 (services/consent.ts). Modifiable ensuite dans
// Réglages → Clés API & Services (AnalyticsConsentCard).

import React, { useState } from 'react';
import { getStoredConsent, setConsent, type ConsentChoice } from '../services/consent';

export const ConsentBanner: React.FC = () => {
    const [decided, setDecided] = useState<boolean>(() => getStoredConsent() !== null);
    if (decided) return null;

    const choose = (choice: ConsentChoice) => {
        setConsent(choice);
        setDecided(true);
    };

    return (
        <div
            role="region"
            aria-label="Consentement à la mesure d'audience"
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[calc(100%-2rem)] bg-slate-800/95 border border-white/10 backdrop-blur rounded-xl shadow-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3 animate-fade-in"
        >
            <p className="text-sm text-ink-200 flex-1">
                On utilise <strong className="text-white">Google Analytics</strong> pour comprendre
                quelles pages sont utilisées et améliorer l'app.{' '}
                <strong className="text-white">Aucune donnée financière</strong> n'est transmise.
                Tu pourras changer d'avis dans Réglages.
            </p>
            <div className="flex gap-2 shrink-0">
                <button
                    type="button"
                    onClick={() => choose('denied')}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-ink-100 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-white/40"
                >
                    Refuser
                </button>
                <button
                    type="button"
                    onClick={() => choose('granted')}
                    className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                >
                    Accepter
                </button>
            </div>
        </div>
    );
};
