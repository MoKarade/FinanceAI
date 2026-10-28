// components/vie/VieCurveLink.tsx
// [REFONTE-NAV-L4] Affordance COMMUNE des pages « Vie » (Retraite / Enfant / Projets de vie) :
// chaque plan de cette famille déforme la courbe Future — ce bouton, placé en tête de chaque
// page (actions du PageHeader), ramène à la courbe via le pattern navigateWithFocus existant
// (même mécanique que ProjectionRequired / le badge REEE d'Enfant). Source unique du libellé
// et du placement : ne pas dupliquer ce lien à la main dans une page Vie.

import React from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { Tab } from '../../types';

// [S5-REFONTE] Bouton des maquettes : contour clair, texte seul (plus d'icône).
export const VieCurveLink: React.FC = () => {
    const navigateWithFocus = useFinanceStore(s => s.navigateWithFocus);
    return (
        <button
            type="button"
            onClick={() => navigateWithFocus(Tab.FUTURE)}
            title="Ouvrir l'onglet Futur"
            className="h-11 lg:h-10 px-4 rounded-lg border border-white/40 text-body text-ink-100 hover:bg-white/5 transition-colors focus-ring whitespace-nowrap"
        >
            Voir l'effet sur ma courbe
        </button>
    );
};
