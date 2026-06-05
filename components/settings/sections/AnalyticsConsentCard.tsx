// components/settings/sections/AnalyticsConsentCard.tsx
//
// S-B (Loi 25 QC) — Carte de gestion du consentement à la mesure d'audience.
// Auto-gérée (lit/écrit via services/consent.ts), aucune prop : permet à
// l'utilisateur d'accorder OU de retirer son consentement à tout moment, comme
// l'exige le droit de retrait de la Loi 25.

import React, { useState } from 'react';
import { Card } from '../../ui/Card';
import { getStoredConsent, setConsent, type ConsentChoice } from '../../../services/consent';

const STATUS_LABEL: Record<'granted' | 'denied' | 'unset', string> = {
  granted: 'Accepté',
  denied: 'Refusé',
  unset: 'Non défini',
};

export const AnalyticsConsentCard: React.FC = () => {
  const [choice, setChoice] = useState<ConsentChoice | null>(() => getStoredConsent());

  const update = (next: ConsentChoice) => {
    setConsent(next);
    setChoice(next);
  };

  const statusKey = choice ?? 'unset';

  return (
    <Card title="Mesure d'audience (Google Analytics)">
      <p className="text-sm text-ink-300 mb-3">
        On mesure l'usage de l'app (pages visitées) pour l'améliorer. <strong className="text-ink-200">Aucune
        donnée financière</strong> n'est transmise. Tu peux accorder ou retirer ton consentement à
        tout moment (Loi 25).
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-200" role="status" aria-live="polite">
          Statut : <strong className="text-white">{STATUS_LABEL[statusKey]}</strong>
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => update('granted')}
            disabled={choice === 'granted'}
            className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Accepter
          </button>
          <button
            type="button"
            onClick={() => update('denied')}
            disabled={choice === 'denied'}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-ink-100 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-white/40 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Refuser
          </button>
        </div>
      </div>
    </Card>
  );
};
