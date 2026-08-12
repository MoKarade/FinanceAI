// components/vie/VieCurveLink.tsx
// [REFONTE-NAV-L4] Affordance COMMUNE des pages « Vie » (Retraite / Enfant / Projets de vie) :
// chaque plan de cette famille déforme la courbe Future — ce bouton, placé en tête de chaque
// page (actions du PageHeader), ramène à la courbe via le pattern navigateWithFocus existant
// (même mécanique que ProjectionRequired / le badge REEE d'Enfant). Source unique du libellé
// et du placement : ne pas dupliquer ce lien à la main dans une page Vie.

import React from 'react';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { useFinanceStore } from '../../store/useFinanceStore';
import { Tab } from '../../types';

export const VieCurveLink: React.FC = () => {
    const navigateWithFocus = useFinanceStore(s => s.navigateWithFocus);
    return (
        <Button
            variant="ghost"
            size="md"
            icon={<Icon name="future" size={16} />}
            onClick={() => navigateWithFocus(Tab.FUTURE)}
            title="Ouvrir l'onglet Futur"
        >
            Voir l'effet sur ma courbe
        </Button>
    );
};
